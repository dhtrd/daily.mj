/**
 * خادم نقطة البيع — Express
 *  • /api/store/:key        تخزين مشترك (data/store.json) عند غياب Firestore
 *  • /api/fatora/config     هل الربط مع فاتورة مُفعَّل على الخادم؟ (بلا كشف المفتاح)
 *  • /api/fatora/checkout   وسيط آمن ينشئ عملية دفع على منصة فاتورة (المفتاح لا يصل المتصفح)
 *  • /api/fatora/verify     التحقّق من حالة عملية دفع
 *  • /api/fatora/return     صفحة عودة العميل من فاتورة → تعيد توجيهه للتطبيق بالنتيجة
 *  • يخدم ملفات dist في وضع الإنتاج
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const DATA_DIR = path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'store.json');

const FATORA_KEY = process.env.FATORA_API_KEY || '';
const FATORA_BASE = (process.env.FATORA_BASE_URL || 'https://api.fatora.io/v1').replace(/\/$/, '');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, '{}');

const readStore = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } };
let writing = Promise.resolve();
const writeStore = (obj) => {
  writing = writing.then(() => fs.promises.writeFile(STORE, JSON.stringify(obj)));
  return writing;
};

const app = express();
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/* ================= التخزين المشترك ================= */
app.get('/api/store/:key', (req, res) => {
  const store = readStore();
  res.json({ key: req.params.key, value: store[req.params.key] ?? null });
});
app.put('/api/store/:key', async (req, res) => {
  const store = readStore();
  store[req.params.key] = req.body?.value ?? null;
  await writeStore(store);
  res.json({ ok: true, key: req.params.key });
});
app.delete('/api/store/:key', async (req, res) => {
  const store = readStore();
  delete store[req.params.key];
  await writeStore(store);
  res.json({ ok: true });
});

/* ================= منصة فاتورة — وسيط آمن ================= */

// نداء موقوت لـ API فاتورة (يتفادى التعليق عند بطء الشبكة)
async function fatoraFetch(pathName, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${FATORA_BASE}${pathName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api_key': FATORA_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  } finally { clearTimeout(t); }
}

// استخراج checkout_url من أشكال استجابة محتملة
function pickCheckoutUrl(data) {
  if (!data || typeof data !== 'object') return '';
  return data.checkout_url
    || (data.result && (data.result.checkout_url || data.result.url))
    || data.url || '';
}

// استنتاج «مدفوعة» من استجابة التحقّق — بحذر شديد.
// مهم: الحقل الأعلى data.status هو حالة نداء الـAPI (نجح الطلب) لا حالة الدفع؛
// لذا لا نعتمد عليه إطلاقاً، بل على حقول حالة الدفع/المعاملة داخل result فقط.
// عند الغموض نعيد false (فالأأمن ألا نعتمد فاتورة دون تأكيد فعلي للسداد).
function inferPaid(data) {
  if (!data || typeof data !== 'object') return false;
  const r = data.result || data;
  const strs = [];
  const push = (v) => { if (v != null) strs.push(String(v).toUpperCase()); };
  // حقول حالة الدفع/المعاملة على مستوى النتيجة فقط (بلا غلاف الـAPI)
  push(r.payment_status); push(r.transaction_status); push(r.paymentStatus); push(r.transactionStatus); push(r.state);
  if (typeof r.status === 'string' && data.result) push(r.status); // status داخل result (لا الغلاف الأعلى)
  const bad = ['FAIL', 'DECLINE', 'CANCEL', 'ERROR', 'PENDING', 'EXPIRED', 'INITIAT', 'UNPAID', 'VOID'];
  if (strs.some(s => bad.some(w => s.includes(w)))) return false;
  const okWords = ['PAID', 'APPROVED', 'CAPTURED', 'COMPLETED', 'SETTLED', 'SUCCESSFUL', 'SUCCESS'];
  if (strs.some(s => okWords.some(w => s.includes(w)))) return true;
  // رمز استجابة ناجح صريح على مستوى النتيجة
  const rc = r.response_code != null ? String(r.response_code) : '';
  if (rc === '000' || rc === '0' || rc === '00') return true;
  return false;
}

app.get('/api/fatora/config', (_req, res) => {
  res.json({ enabled: !!FATORA_KEY, base: FATORA_BASE, publicBase: PUBLIC_BASE });
});

app.post('/api/fatora/checkout', async (req, res) => {
  if (!FATORA_KEY) return res.status(501).json({ error: 'FATORA_API_KEY غير مضبوط في .env — الربط مع فاتورة غير مُفعّل' });
  const b = req.body || {};
  const amount = Number(b.amount);
  if (!(amount > 0)) return res.status(400).json({ error: 'المبلغ غير صالح' });
  if (!b.order_id) return res.status(400).json({ error: 'order_id مطلوب' });

  // روابط العودة تمرّ عبر خادمنا لتوحيد النتيجة قبل إعادة العميل للتطبيق
  const success_url = `${PUBLIC_BASE}/api/fatora/return?outcome=success`;
  const failure_url = `${PUBLIC_BASE}/api/fatora/return?outcome=failure`;

  const payload = {
    amount,
    currency: b.currency || 'SAR',
    order_id: String(b.order_id),
    client: {
      name: (b.client && b.client.name) || 'عميل',
      phone: (b.client && b.client.phone) || '',
      email: (b.client && b.client.email) || ''
    },
    language: b.language === 'en' ? 'en' : 'ar',
    success_url,
    failure_url,
    save_token: false,
    note: b.note || ''
  };

  try {
    const { ok, status, data } = await fatoraFetch('/payments/checkout', payload);
    const checkout_url = pickCheckoutUrl(data);
    if (!ok || !checkout_url) {
      return res.status(ok ? 502 : status).json({
        error: (data && (data.error && (data.error.message || data.error) || data.message)) || 'فشل إنشاء الدفع لدى فاتورة',
        raw: data
      });
    }
    res.json({ checkout_url, order_id: payload.order_id, raw: data });
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'انتهت مهلة الاتصال بفاتورة' : ('تعذّر الاتصال بفاتورة: ' + e.message);
    res.status(504).json({ error: msg });
  }
});

app.post('/api/fatora/verify', async (req, res) => {
  if (!FATORA_KEY) return res.status(501).json({ error: 'الربط مع فاتورة غير مُفعّل' });
  const b = req.body || {};
  if (!b.transaction_id && !b.order_id) return res.status(400).json({ error: 'transaction_id أو order_id مطلوب' });
  const payload = {};
  if (b.transaction_id) payload.transaction_id = String(b.transaction_id);
  if (b.order_id) payload.order_id = String(b.order_id);
  try {
    const { ok, status, data } = await fatoraFetch('/payments/verify', payload);
    if (!ok) return res.status(status).json({ error: (data && (data.message || data.error)) || 'فشل التحقّق', raw: data });
    res.json({ paid: inferPaid(data), status: (data && (data.status || (data.result && data.result.status))) || '', raw: data });
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'انتهت مهلة الاتصال بفاتورة' : ('تعذّر الاتصال بفاتورة: ' + e.message);
    res.status(504).json({ error: msg });
  }
});

// عودة العميل من صفحة الدفع → إعادة توجيه للتطبيق مع النتيجة والمعرّفات
app.get('/api/fatora/return', (req, res) => {
  const q = req.query || {};
  const params = new URLSearchParams();
  params.set('fatora', q.outcome === 'failure' ? 'failure' : 'success');
  ['order_id', 'transaction_id', 'payment_id', 'response_code'].forEach(k => { if (q[k] != null) params.set(k, String(q[k])); });
  res.redirect(302, '/?' + params.toString());
});

/* ================= ملفات الإنتاج ================= */
const dist = path.join(__dirname, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`✅ خادم نقطة البيع يعمل على http://localhost:${PORT}`);
  console.log(`   فاتورة: ${FATORA_KEY ? 'مُفعّلة ✓ (' + FATORA_BASE + ')' : 'غير مُفعّلة — اضبط FATORA_API_KEY'}`);
});
