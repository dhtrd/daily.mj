import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, Check, CheckCircle2, Plus, Minus, Trash2, Pencil, Save, Search, Percent, Tag,
  Banknote, CreditCard, QrCode, Link2, ExternalLink, Loader2, Printer, ChefHat, Clock,
  Grid3x3, Users, User, Phone, MapPin, ShoppingBag, Bike, Utensils, DoorOpen, Wallet,
  BarChart3, Store, Settings, Palette, Sun, Moon, RefreshCw, AlertTriangle, Ban, Undo2,
  TrendingUp, Package, Hash, Timer, Coffee, Receipt, ClipboardList, ArrowRight, Download, Eye
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { KEYS } from './storage';
import {
  computeOrder, ORDER_TYPES, ORDER_STATES, STATIONS, ROLES, paidTotal, balanceDue,
  lineTotal, lineUnit, uid, seedBundle
} from './menu';
import { money, round2, printReceipt, printKitchen, curAr, CURRENCIES, zatcaQrSvg, qrSvg, emitsZatca } from './invoice';
import { fatoraCheckout, fatoraVerify, fatoraOrderId } from './fatora';
import { Modal, Field, Seg, Kpi, Empty, Stepper, cls } from './ui';

/* ================= أدوات محلية ================= */
const nowISO = () => new Date().toISOString();
const timeAr = (iso) => { try { return new Date(iso).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const minsSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const upsert = (arr, item) => { const i = (arr || []).findIndex(x => x.id === item.id); if (i < 0) return [...(arr || []), item]; const c = [...arr]; c[i] = item; return c; };
const nextSeq = (arr) => (arr || []).reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1;
const TYPE_ICON = { dine_in: Utensils, takeaway: ShoppingBag, delivery: Bike };
const activeOrders = (orders) => (orders || []).filter(o => ['open', 'held', 'sent', 'ready'].includes(o.status));
const tableOrder = (orders, tableId) => activeOrders(orders).find(o => o.type === 'dine_in' && o.tableId === tableId);
const downloadCSV = (name, rows) => {
  const csv = rows.map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* ================= اختيار الإضافات ================= */
export function ModifierPicker({ item, groups, cur, onClose, onAdd }) {
  const [sel, setSel] = useState(() => {
    const init = {};
    groups.forEach(g => { init[g.id] = g.required && g.max === 1 && g.options[0] ? [g.options[0].id] : []; });
    return init;
  });
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);

  const toggle = (g, optId) => setSel(s => {
    const cur = s[g.id] || [];
    if (g.max === 1) return { ...s, [g.id]: [optId] };
    if (cur.includes(optId)) return { ...s, [g.id]: cur.filter(x => x !== optId) };
    if (cur.length >= g.max) return s;
    return { ...s, [g.id]: [...cur, optId] };
  });

  const chosen = groups.flatMap(g => (sel[g.id] || []).map(id => g.options.find(o => o.id === id)).filter(Boolean));
  const addPrice = chosen.reduce((s, o) => s + (Number(o.price) || 0), 0);
  const unit = round2((Number(item.price) || 0) + addPrice);
  const missing = groups.filter(g => g.required && (sel[g.id] || []).length < (g.min || 1));

  return (
    <Modal title={item.name} sub={`${money(item.price)} ${cur}`} icon={Tag} onClose={onClose}
      foot={<>
        <div className="row" style={{ marginInlineEnd: 'auto' }}><Stepper value={qty} onDec={() => setQty(q => Math.max(1, q - 1))} onInc={() => setQty(q => q + 1)} min={1} /></div>
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn pri" disabled={missing.length > 0} onClick={() => onAdd(chosen, note, qty)}>
          <Plus size={15} />إضافة · {money(unit * qty)} {cur}
        </button>
      </>}>
      {groups.map(g => (
        <div key={g.id} style={{ marginBottom: 16 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <b style={{ fontSize: 13.5 }}>{g.name}</b>
            <span className="sm-txt mut">{g.required ? 'مطلوب' : 'اختياري'}{g.max > 1 ? ` · حتى ${g.max}` : ''}</span>
          </div>
          <div className="row wrap" style={{ gap: 7 }}>
            {g.options.map(o => (
              <button key={o.id} className={cls('chip', (sel[g.id] || []).includes(o.id) && 'on')} onClick={() => toggle(g, o.id)}>
                {o.name}{o.price > 0 && <span className="num">+{money(o.price)}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Field label="ملاحظة للمطبخ (اختياري)">
        <input className="inp" value={note} onChange={e => setNote(e.target.value)} placeholder="مثال: بدون بصل، حار…" />
      </Field>
    </Modal>
  );
}

/* ================= الدفع ================= */
export function PaymentModal({ ctx, order, onClose, onPaid }) {
  const { settings, cur, me, say, persistOrder, fatoraServer } = ctx;
  const t = computeOrder(order, settings);
  const [pays, setPays] = useState(() => [...(order.payments || [])]);
  const balance = round2(t.total - pays.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState(() => balance.toFixed(2));
  const [stage, setStage] = useState('enter'); // enter | fatoraWait
  const [wait, setWait] = useState(null);       // {url, oid, amt}
  const fatoraEnabled = !!(settings.fatora && settings.fatora.enabled);
  const fatoraReady = fatoraEnabled && fatoraServer;

  const amt = Math.max(0, Number(amount) || 0);
  const applied = method === 'cash' ? Math.min(amt, balance) : Math.min(amt || balance, balance);
  const change = method === 'cash' ? Math.max(0, round2(amt - balance)) : 0;

  const key = (d) => {
    if (d === 'C') return setAmount('');
    if (d === '⌫') return setAmount(a => a.slice(0, -1));
    if (d === '.' && amount.includes('.')) return;
    setAmount(a => (a + d).replace(/^0+(?=\d)/, ''));
  };
  const quick = (v) => setAmount(v.toFixed(2));
  const roundUp = (step) => setAmount((Math.ceil(balance / step) * step).toFixed(2));

  const addPayment = (p) => {
    const list = [...pays, p];
    const newBal = round2(t.total - list.reduce((s, x) => s + (Number(x.amount) || 0), 0));
    if (newBal <= 0.009) { onPaid(list); return; }
    setPays(list); setAmount(newBal.toFixed(2)); say('دفعة مسجّلة', 'ok');
  };

  const confirmCashCard = () => {
    if (applied <= 0) { say('أدخل مبلغاً', 'no'); return; }
    const p = method === 'cash'
      ? { id: uid('pay'), method: 'cash', amount: applied, tendered: amt, change, at: nowISO(), by: me.name }
      : { id: uid('pay'), method: 'card', amount: applied, ref: '', at: nowISO(), by: me.name };
    addPayment(p);
  };

  const startFatora = async () => {
    if (!fatoraReady) { say(fatoraEnabled ? 'الخادم بلا مفتاح فاتورة' : 'فعّل فاتورة من الإعدادات', 'no'); return; }
    // الدفع الإلكتروني يسدّد المتبقّي كاملاً (يمنع إغلاق فاتورة بسداد جزئي)؛
    // للتقسيم: سجّل النقد/الشبكة أولاً ثم اختر فاتورة للباقي.
    const payAmt = balance;
    if (payAmt <= 0) { say('لا يوجد مبلغ متبقٍّ', 'no'); return; }
    const oid = fatoraOrderId(order);
    say('جارٍ إنشاء الدفع…');
    const res = await fatoraCheckout({ order, settings, amount: payAmt, orderId: oid });
    if (!res.ok) { say(res.error || 'فشل إنشاء الدفع', 'no'); return; }
    // نثبّت الطلب مع علامة انتظار فاتورة ليتمكّن معالِج العودة من مطابقته
    const pending = { ...order, payments: pays, pendingFatora: { fatoraOrderId: oid, amount: payAmt, at: nowISO() }, status: order.lines.some(l => l.sentAt) ? 'sent' : 'held', shiftId: order.shiftId || ctx.openShift?.id };
    await persistOrder(pending);
    const mode = (settings.fatora && settings.fatora.mode) || 'redirect';
    if (mode === 'redirect') { window.location.href = res.checkout_url; return; }
    setWait({ url: res.checkout_url, oid, amt: payAmt }); setStage('fatoraWait');
  };

  const cancelWait = async () => {
    // نُعيد الطلب لحالته دون انتظار فاتورة
    await persistOrder({ ...order, payments: pays, pendingFatora: null, status: order.lines.some(l => l.sentAt) ? 'sent' : 'held', shiftId: order.shiftId || ctx.openShift?.id });
    setStage('enter'); setWait(null);
  };

  /* استطلاع التحقّق في وضع الرابط/QR */
  useEffect(() => {
    if (stage !== 'fatoraWait' || !wait) return;
    let stop = false; const started = Date.now();
    const tick = async () => {
      if (stop) return;
      const v = await fatoraVerify({ orderId: wait.oid });
      if (stop) return;
      if (v.ok && v.paid) {
        const p = { id: uid('pay'), method: 'fatora', amount: wait.amt, ref: wait.oid, at: nowISO(), by: me.name, fatora: { order_id: wait.oid } };
        const list = [...pays, p];
        say('تم الدفع عبر فاتورة ✓', 'ok');
        onPaid(list); return;
      }
      if (Date.now() - started > 180000) { say('انتهت مهلة انتظار الدفع', 'no'); return; }
      if (!stop) timer = setTimeout(tick, 4000);
    };
    let timer = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(timer); };
  }, [stage, wait]); // eslint-disable-line

  if (stage === 'fatoraWait' && wait) {
    return (
      <Modal title="الدفع عبر فاتورة" sub="بانتظار إتمام العميل للدفع" icon={QrCode} onClose={cancelWait}
        foot={<>
          <button className="btn" onClick={cancelWait}>إلغاء</button>
          <a className="btn pri" href={wait.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />فتح صفحة الدفع</a>
        </>}>
        <div className="fatora-wait">
          <div className="fatora-qr" dangerouslySetInnerHTML={{ __html: qrSvg(wait.url, { px: 190, dark: '#111', light: '#fff' }) }} />
          <div><b>{money(wait.amt)} {cur}</b></div>
          <div className="row" style={{ gap: 8, color: 'var(--dim)' }}><Loader2 size={16} className="spin" />يوجّه العميل جواله على الرمز ليدفع، ونتحقّق تلقائياً…</div>
          <div className="sm-txt mut">مرجع العملية: {wait.oid}</div>
        </div>
      </Modal>
    );
  }

  const cashQuick = [balance, Math.ceil(balance / 5) * 5, Math.ceil(balance / 10) * 10, Math.ceil(balance / 50) * 50]
    .filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <Modal title="الدفع" sub={`${order.no} · الإجمالي ${money(t.total)} ${cur}`} icon={CreditCard} onClose={onClose} wide>
      <div className="grid2" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        {/* يسار: الطريقة والمبلغ */}
        <div>
          <div className="pay-methods">
            <button className={cls('pay-m', method === 'cash' && 'on')} onClick={() => setMethod('cash')}><Banknote size={22} />نقداً</button>
            <button className={cls('pay-m', method === 'card' && 'on')} onClick={() => setMethod('card')}><CreditCard size={22} />شبكة</button>
            <button className={cls('pay-m', method === 'fatora' && 'on')} onClick={() => setMethod('fatora')} disabled={!fatoraEnabled} title={!fatoraEnabled ? 'غير مفعّل' : ''}><QrCode size={22} />فاتورة</button>
          </div>

          {method !== 'fatora' && (<>
            <div className="pay-amount num">{amount || '0'} <span style={{ fontSize: 16, color: 'var(--dim)' }}>{cur}</span></div>
            {method === 'cash' && (
              <div className="quick-cash">
                {cashQuick.map((v, i) => <button key={i} className="btn sm" onClick={() => quick(v)}>{money(v)}</button>)}
              </div>
            )}
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
                <button key={k} className="kp" onClick={() => key(k)}>{k}</button>
              ))}
            </div>
            <button className="btn pri lg block mt" onClick={confirmCashCard}>
              <Check size={17} />{applied >= balance ? 'إتمام الدفع' : 'تسجيل دفعة'} · {money(applied)} {cur}
            </button>
            {method === 'cash' && change > 0 && <div className="badge b-amber mt" style={{ fontSize: 14 }}>الباقي للعميل: {money(change)} {cur}</div>}
          </>)}

          {method === 'fatora' && (
            <div style={{ padding: '10px 0' }}>
              {!fatoraReady && <div className="badge b-amber mb" style={{ display: 'flex' }}><AlertTriangle size={13} />{fatoraEnabled ? 'الخادم بلا مفتاح فاتورة (اضبط FATORA_API_KEY)' : 'الربط غير مفعّل — فعّله من الإعدادات'}</div>}
              <div className="pay-amount num">{money(balance)} <span style={{ fontSize: 16, color: 'var(--dim)' }}>{cur}</span></div>
              <div className="mut sm-txt mb">يُسدَّد المبلغ المتبقّي كاملاً عبر فاتورة. الوضع: {(settings.fatora?.mode) === 'link' ? 'رمز/رابط للعميل' : 'تحويل الجهاز لصفحة الدفع'}. لا تُعتمد الفاتورة إلا بعد تأكيد السداد لدى فاتورة.</div>
              <button className="btn pri lg block" disabled={!fatoraReady || balance <= 0} onClick={startFatora}>
                <QrCode size={17} />دفع عبر فاتورة · {money(balance)} {cur}
              </button>
            </div>
          )}
        </div>

        {/* يمين: الملخّص والدفعات */}
        <div className="card card-p">
          <div className="totrow"><span>الصافي قبل الضريبة</span><span className="v num">{money(t.net)}</span></div>
          <div className="totrow"><span>الضريبة {t.vatRate}%</span><span className="v num">{money(t.vat)}</span></div>
          {t.service > 0 && <div className="totrow"><span>خدمة</span><span className="v num">{money(t.service)}</span></div>}
          <div className="totrow grand"><span>الإجمالي</span><span className="v num">{money(t.total)}</span></div>
          {pays.length > 0 && <>
            <div className="lbl mt">الدفعات</div>
            {pays.map((p, i) => (
              <div key={p.id || i} className="pay-split-row">
                <span>{p.method === 'cash' ? 'نقد' : p.method === 'card' ? 'شبكة' : 'فاتورة'}{p.change > 0 ? ` (باقي ${money(p.change)})` : ''}</span>
                <span className="row" style={{ gap: 8 }}><b className="num">{money(p.amount)}</b>
                  <button className="btn sm gh icon" onClick={() => setPays(ps => ps.filter((_, j) => j !== i))}><X size={13} /></button></span>
              </div>
            ))}
          </>}
          <div className="totrow grand" style={{ color: balance > 0 ? 'var(--amber)' : 'var(--mint)' }}>
            <span>المتبقّي</span><span className="v num">{money(balance)} {cur}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ================= الخصم ================= */
export function DiscountModal({ order, settings, cur, onClose, onApply }) {
  const t = computeOrder(order, settings);
  const [type, setType] = useState(order.discount?.type || 'pct');
  const [value, setValue] = useState(order.discount?.value || 0);
  const [reason, setReason] = useState(order.discount?.reason || '');
  const preview = type === 'pct' ? round2(t.gross * Math.min(100, value) / 100) : round2(Math.min(t.gross, value));
  return (
    <Modal title="خصم على الطلب" icon={Percent} onClose={onClose}
      foot={<>
        {order.discount && <button className="btn danger" style={{ marginInlineEnd: 'auto' }} onClick={() => onApply(null)}><Trash2 size={14} />إزالة الخصم</button>}
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn pri" onClick={() => onApply(value > 0 ? { type, value: Number(value), reason } : null)}>تطبيق</button>
      </>}>
      <Seg value={type} onChange={setType} options={[{ value: 'pct', label: 'نسبة %' }, { value: 'amt', label: `مبلغ ${cur}` }]} />
      <Field label={type === 'pct' ? 'النسبة %' : `المبلغ ${cur}`} style={{ marginTop: 12 }}>
        <input className="inp num" type="number" value={value} onChange={e => setValue(e.target.value)} autoFocus />
      </Field>
      <Field label="السبب (اختياري)"><input className="inp" value={reason} onChange={e => setReason(e.target.value)} placeholder="مثال: عميل دائم، تعويض…" /></Field>
      <div className="badge b-amber" style={{ fontSize: 14 }}>قيمة الخصم: {money(preview)} {cur}</div>
    </Modal>
  );
}

/* ================= بيانات العميل ================= */
export function CustomerModal({ order, onClose, onSave }) {
  const [c, setC] = useState(order.customer || { name: '', phone: '', address: '', deliveryApp: '' });
  const isDelivery = order.type === 'delivery';
  return (
    <Modal title={isDelivery ? 'بيانات التوصيل' : 'بيانات العميل'} icon={User} onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn pri" disabled={isDelivery && (!c.name || !c.phone)} onClick={() => onSave(c)}><Save size={14} />حفظ</button>
      </>}>
      <Field label="الاسم"><input className="inp" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} autoFocus /></Field>
      <Field label="الجوال"><input className="inp num" value={c.phone} onChange={e => setC({ ...c, phone: e.target.value })} /></Field>
      {isDelivery && <>
        <Field label="العنوان"><textarea className="inp" value={c.address} onChange={e => setC({ ...c, address: e.target.value })} /></Field>
        <Field label="تطبيق التوصيل (اختياري)"><input className="inp" value={c.deliveryApp} onChange={e => setC({ ...c, deliveryApp: e.target.value })} placeholder="هنقرستيشن، جاهز…" /></Field>
      </>}
    </Modal>
  );
}

/* ================= اختيار الطاولة ================= */
export function TablePickModal({ ctx, onClose, onPick }) {
  const { db, settings } = ctx;
  const zones = [...new Set((db.tables || []).map(t => t.zone))];
  return (
    <Modal title="اختر طاولة" icon={Grid3x3} onClose={onClose} wide>
      {zones.map(z => (
        <div key={z}>
          <div className="zone-h"><MapPin size={15} color="var(--acc)" />{z}</div>
          <div className="tables-grid">
            {(db.tables || []).filter(t => t.zone === z).map(tb => {
              const ord = tableOrder(db.orders, tb.id);
              return (
                <button key={tb.id} className={cls('tbl', ord && 'busy')} onClick={() => ord ? (ctx.loadOrder(ord), onClose()) : onPick(tb)}>
                  <Utensils className="tbl-ic" size={22} />
                  <div className="tbl-name">{tb.name}</div>
                  <div className="tbl-seats">{tb.seats} مقاعد</div>
                  {ord && <div className="tbl-amt">{money(computeOrder(ord, settings).total)} {curAr(settings.currency)}</div>}
                  {ord && <span className="tbl-badge badge b-amber">مشغولة</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Modal>
  );
}

/* ================= إيصال ما بعد الدفع ================= */
export function ReceiptModal({ order, settings, onClose }) {
  const t = order.totals || computeOrder(order, settings);
  const cur = curAr(settings.currency);
  const qr = zatcaQrSvg(order, settings, { px: 150 });
  const paid = paidTotal(order);
  const change = (order.payments || []).reduce((s, p) => s + (Number(p.change) || 0), 0);
  return (
    <Modal title="تمّت الفاتورة" sub={order.no} icon={CheckCircle2} onClose={onClose}
      foot={<>
        <button className="btn" style={{ marginInlineEnd: 'auto' }} onClick={() => printReceipt(order, settings, '58')}><Printer size={14} />58مم</button>
        <button className="btn pri" onClick={() => printReceipt(order, settings, settings.receiptSize || '80')}><Printer size={15} />طباعة الإيصال</button>
        <button className="btn ok" onClick={onClose}><Check size={15} />طلب جديد</button>
      </>}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-h)', fontWeight: 800, fontSize: 20 }}>{settings.name}</div>
        <div className="mut sm-txt">فاتورة ضريبية مبسّطة</div>
      </div>
      <div className="card card-p">
        <div className="totrow"><span>عدد الأصناف</span><span className="v num">{t.count}</span></div>
        <div className="totrow"><span>الصافي</span><span className="v num">{money(t.net)}</span></div>
        <div className="totrow"><span>الضريبة {t.vatRate}%</span><span className="v num">{money(t.vat)}</span></div>
        <div className="totrow grand"><span>الإجمالي</span><span className="v num">{money(t.total)} {cur}</span></div>
        <div className="totrow"><span>المدفوع</span><span className="v num">{money(paid)}</span></div>
        {change > 0 && <div className="totrow"><span>الباقي للعميل</span><span className="v num">{money(change)}</span></div>}
      </div>
      {qr && <div style={{ textAlign: 'center', marginTop: 14 }}>
        <div style={{ background: '#fff', display: 'inline-block', padding: 8, borderRadius: 10 }} dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="mut sm-txt mt">رمز الفاتورة المتوافق مع هيئة الزكاة والضريبة (ZATCA)</div>
      </div>}
    </Modal>
  );
}

/* ================= شاشة الطاولات ================= */
export function TablesScreen({ ctx }) {
  const { db, settings, startOrder, loadOrder } = ctx;
  const cur = curAr(settings.currency);
  const zones = [...new Set((db.tables || []).map(t => t.zone))];
  return (
    <div className="screen-pad">
      <div className="h-row">
        <div className="h-ttl"><Grid3x3 size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />الطاولات والصالة</div>
        <div className="row">
          <button className="btn" onClick={() => startOrder('takeaway')}><ShoppingBag size={15} />سفري جديد</button>
          <button className="btn" onClick={() => startOrder('delivery')}><Bike size={15} />توصيل جديد</button>
        </div>
      </div>
      {zones.length === 0 && <Empty icon={Grid3x3} title="لا طاولات" hint="أضف طاولات من الإعدادات ← الطاولات" />}
      {zones.map(z => (
        <div key={z}>
          <div className="zone-h"><MapPin size={15} color="var(--acc)" />{z}</div>
          <div className="tables-grid">
            {(db.tables || []).filter(t => t.zone === z).map(tb => {
              const ord = tableOrder(db.orders, tb.id);
              return (
                <button key={tb.id} className={cls('tbl', ord && 'busy')} onClick={() => ord ? loadOrder(ord) : startOrder('dine_in', tb)}>
                  {ord && <span className="tbl-badge badge b-amber">{minsSince(ord.createdAt)}د</span>}
                  <Utensils className="tbl-ic" size={24} />
                  <div className="tbl-name">{tb.name}</div>
                  {ord ? <>
                    <div className="tbl-amt">{money(computeOrder(ord, settings).total)} {cur}</div>
                    <div className="tbl-seats">{ORDER_STATES[ord.status]} · {ord.guests || 0} ضيف</div>
                  </> : <div className="tbl-seats">{tb.seats} مقاعد · متاحة</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================= شاشة الطلبات ================= */
export function OrdersScreen({ ctx }) {
  const { db, settings, role, loadOrder, commitOrders, say, setReceipt } = ctx;
  const cur = curAr(settings.currency);
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const orders = useMemo(() => {
    let list = [...(db.orders || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (filter === 'active') list = list.filter(o => ['open', 'held', 'sent', 'ready'].includes(o.status));
    else if (filter === 'held') list = list.filter(o => o.status === 'held');
    else if (filter === 'paid') list = list.filter(o => o.status === 'paid' && (o.closedAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10));
    else if (filter === 'void') list = list.filter(o => ['void', 'refunded'].includes(o.status));
    if (q.trim()) { const s = q.trim(); list = list.filter(o => (o.no || '').includes(s) || (o.customer?.name || '').includes(s) || (o.tableName || '').includes(s)); }
    return list;
  }, [db.orders, filter, q]);

  const refund = async (o) => {
    if (!role.canRefund) { say('لا صلاحية للاسترجاع', 'no'); return; }
    const reason = prompt('سبب الاسترجاع؟'); if (reason == null) return;
    await commitOrders(list => list.map(x => x.id === o.id ? { ...x, status: 'refunded', refundReason: reason, refundedAt: nowISO() } : x));
    say('سُجّل الاسترجاع', 'ok');
  };

  return (
    <div className="screen-pad">
      <div className="h-row">
        <div className="h-ttl"><ClipboardList size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />الطلبات</div>
        <div className="search" style={{ maxWidth: 240 }}>
          <Search size={16} /><input className="inp" placeholder="بحث برقم/عميل/طاولة" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="row wrap mb" style={{ gap: 8 }}>
        {[['active', 'النشطة'], ['held', 'المعلّقة'], ['paid', 'مدفوعة اليوم'], ['void', 'ملغاة/مُرجعة']].map(([k, l]) => (
          <button key={k} className={cls('chip', filter === k && 'on')} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {orders.length === 0 ? <Empty icon={ClipboardList} title="لا طلبات" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl-list">
            <thead><tr><th>الرقم</th><th>النوع</th><th>الطاولة/العميل</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>الوقت</th><th></th></tr></thead>
            <tbody>
              {orders.map(o => {
                const t = o.totals || computeOrder(o, settings);
                const I = TYPE_ICON[o.type] || Utensils;
                const bal = balanceDue(o, settings);
                return (
                  <tr key={o.id}>
                    <td><b className="num">{o.no}</b></td>
                    <td><span className="row" style={{ gap: 5 }}><I size={14} />{(ORDER_TYPES.find(x => x.id === o.type) || {}).label}</span></td>
                    <td>{o.tableName || o.customer?.name || '—'}</td>
                    <td className="num">{t.count}</td>
                    <td className="num">{money(t.total)} {cur}</td>
                    <td><span className={cls('badge', o.status === 'paid' ? 'b-mint' : o.status === 'sent' ? 'b-sky' : o.status === 'held' ? 'b-amber' : ['void', 'refunded'].includes(o.status) ? 'b-rose' : 'b-dim')}>{ORDER_STATES[o.status]}</span></td>
                    <td className="sm-txt mut">{timeAr(o.createdAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        {['open', 'held', 'sent', 'ready'].includes(o.status) && <button className="btn sm" onClick={() => loadOrder(o)}><ArrowRight size={13} />فتح</button>}
                        {o.status === 'paid' && <button className="btn sm gh icon" title="الإيصال" onClick={() => setReceipt(o)}><Receipt size={14} /></button>}
                        {o.status === 'paid' && <button className="btn sm gh icon" title="طباعة" onClick={() => printReceipt(o, settings, settings.receiptSize || '80')}><Printer size={14} /></button>}
                        {o.status === 'paid' && role.canRefund && <button className="btn sm gh icon" title="استرجاع" onClick={() => refund(o)}><Undo2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================= شاشة المطبخ (KDS) ================= */
export function KitchenScreen({ ctx }) {
  const { db, settings, commitOrders, say } = ctx;
  const [station, setStation] = useState('all');
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force(x => x + 1), 30000); return () => clearInterval(iv); }, []);

  const tickets = useMemo(() => (db.orders || [])
    .filter(o => ['sent', 'ready'].includes(o.status))
    .sort((a, b) => (a.sentAt || '').localeCompare(b.sentAt || '')), [db.orders]);

  const stationsPresent = [...new Set(tickets.flatMap(o => o.lines.filter(l => l.sentAt).map(l => l.station || 'kitchen')))];

  // دمج على مستوى الحقل: نُغيّر الحالة فقط على أحدث نسخة، فلا نطمس تعديلات الكاشير المتزامنة
  const setStatus = (o, status) => commitOrders(list => list.map(x => x.id === o.id ? { ...x, status } : x));

  return (
    <div className="screen-pad">
      <div className="h-row">
        <div className="h-ttl"><ChefHat size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />شاشة المطبخ</div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={cls('chip', station === 'all' && 'on')} onClick={() => setStation('all')}>الكل</button>
          {stationsPresent.map(s => <button key={s} className={cls('chip', station === s && 'on')} onClick={() => setStation(s)}>{STATIONS[s] || s}</button>)}
        </div>
      </div>
      {tickets.length === 0 ? <Empty icon={Coffee} title="لا طلبات في المطبخ" hint="التذاكر المُرسلة تظهر هنا" /> : (
        <div className="kds-grid">
          {tickets.map(o => {
            const lines = o.lines.filter(l => l.sentAt && (station === 'all' || (l.station || 'kitchen') === station));
            if (!lines.length) return null;
            const age = minsSince(o.sentAt || o.createdAt);
            const cls2 = age >= 15 ? 'age-late' : age >= 8 ? 'age-warn' : '';
            const I = TYPE_ICON[o.type] || Utensils;
            return (
              <div key={o.id} className={cls('ticket', cls2)}>
                <div className="ticket-h">
                  <span className="ticket-no">{o.no}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="badge b-dim"><I size={12} />{o.tableName || (ORDER_TYPES.find(x => x.id === o.type) || {}).label}</span>
                    <span className={cls('badge', age >= 15 ? 'b-rose' : age >= 8 ? 'b-amber' : 'b-mint')}><Timer size={11} />{age}د</span>
                  </span>
                </div>
                <div className="ticket-lines">
                  {lines.map(l => (
                    <div key={l.id} className="ticket-ln">
                      <span className="q">{l.qty}×</span>
                      <span>{l.name}
                        {l.modifiers?.length > 0 && <div className="mods">{l.modifiers.map(m => m.name).join('، ')}</div>}
                        {l.note && <div className="note">⚠ {l.note}</div>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="ticket-foot">
                  <button className="btn sm gh icon" title="إعادة طباعة" onClick={() => printKitchen(o, lines, settings.receiptSize)}><Printer size={14} /></button>
                  {o.status === 'sent'
                    ? <button className="btn sm ok block" onClick={() => { setStatus(o, 'ready'); say('جاهز ✓', 'ok'); }}><Check size={14} />جاهز</button>
                    : <button className="btn sm block" onClick={() => setStatus(o, 'sent')}><Undo2 size={14} />استرجاع للتحضير</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= شاشة الوردية ================= */
export function ShiftScreen({ ctx }) {
  const { db, settings, me, role, openShift, commitShifts, say } = ctx;
  const cur = curAr(settings.currency);
  const [float, setFloat] = useState('300');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [showX, setShowX] = useState(false);

  const shiftOrders = useMemo(() => openShift ? (db.orders || []).filter(o => o.status === 'paid' && o.shiftId === openShift.id) : [], [db.orders, openShift]);
  const summary = useMemo(() => {
    const s = { count: shiftOrders.length, total: 0, cash: 0, card: 0, fatora: 0, vat: 0 };
    shiftOrders.forEach(o => {
      const t = o.totals || computeOrder(o, settings); s.total += t.total; s.vat += t.vat;
      (o.payments || []).forEach(p => { if (p.method === 'cash') s.cash += p.amount; else if (p.method === 'card') s.card += p.amount; else if (p.method === 'fatora') s.fatora += p.amount; });
    });
    return s;
  }, [shiftOrders, settings]);
  const cashIn = (openShift?.cashMovements || []).filter(m => m.type === 'in').reduce((a, b) => a + b.amount, 0);
  const cashOut = (openShift?.cashMovements || []).filter(m => m.type === 'out').reduce((a, b) => a + b.amount, 0);
  const expectedCash = round2((openShift?.openingFloat || 0) + summary.cash + cashIn - cashOut);

  const openShiftNow = async () => {
    const seq = nextSeq(db.shifts);
    const s = { id: uid('sh'), seq, no: 'SH-' + String(seq).padStart(4, '0'), cashierId: me.id, cashierName: me.name, openedAt: nowISO(), openingFloat: Number(float) || 0, status: 'open', cashMovements: [] };
    await commitShifts(list => [...list, s]); say('فُتحت الوردية ✓', 'ok');
  };
  const cashMove = async (type) => {
    const v = Number(prompt(type === 'in' ? 'مبلغ الإيداع للدرج' : 'مبلغ الصرف من الدرج')); if (!v) return;
    const reason = prompt('السبب') || '';
    await commitShifts(list => upsert(list, { ...openShift, cashMovements: [...(openShift.cashMovements || []), { type, amount: v, reason, at: nowISO(), by: me.name }] }));
  };
  const closeShiftNow = async () => {
    const actual = Number(counted) || 0;
    const over = round2(actual - expectedCash);
    const z = { ...openShift, status: 'closed', closedAt: nowISO(), countedCash: actual, expectedCash, overShort: over, totalsByMethod: { cash: summary.cash, card: summary.card, fatora: summary.fatora }, salesTotal: round2(summary.total), ordersCount: summary.count, vatTotal: round2(summary.vat) };
    await commitShifts(list => upsert(list, z)); setClosing(false); setCounted('');
    say(over === 0 ? 'أُغلقت الوردية — الصندوق مطابق ✓' : over > 0 ? `أُغلقت — فائض ${money(over)}` : `أُغلقت — عجز ${money(Math.abs(over))}`, over === 0 ? 'ok' : 'no');
  };

  const pastShifts = (db.shifts || []).filter(s => s.status === 'closed').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, 12);

  if (!openShift) {
    return (
      <div className="screen-pad">
        <div className="h-ttl mb"><DoorOpen size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />فتح وردية</div>
        <div className="card card-p" style={{ maxWidth: 420 }}>
          <Field label={`الرصيد الافتتاحي للدرج (${cur})`}>
            <input className="inp num" value={float} onChange={e => setFloat(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
          </Field>
          <button className="btn pri lg block" onClick={openShiftNow}><DoorOpen size={17} />فتح الوردية</button>
        </div>
        {pastShifts.length > 0 && <PastShifts shifts={pastShifts} cur={cur} />}
      </div>
    );
  }

  return (
    <div className="screen-pad">
      <div className="h-row">
        <div className="h-ttl"><Wallet size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />
          الوردية {openShift.no} · {openShift.cashierName}</div>
        <div className="row">
          <button className="btn" onClick={() => setShowX(true)}><Eye size={15} />تقرير X</button>
          <button className="btn" onClick={() => cashMove('in')} title="إيداع"><Plus size={14} />إيداع</button>
          <button className="btn" onClick={() => cashMove('out')} title="صرف"><Minus size={14} />صرف</button>
          <button className="btn danger" onClick={() => setClosing(true)}><DoorOpen size={15} />إغلاق (Z)</button>
        </div>
      </div>
      <div className="grid-kpi">
        <Kpi label="المبيعات" value={money(summary.total)} sub={`${summary.count} طلب`} icon={TrendingUp} />
        <Kpi label="نقداً" value={money(summary.cash)} icon={Banknote} color="var(--mint)" />
        <Kpi label="شبكة" value={money(summary.card)} icon={CreditCard} color="var(--sky)" />
        <Kpi label="فاتورة" value={money(summary.fatora)} icon={QrCode} color="var(--violet)" />
        <Kpi label="المتوقّع بالدرج" value={money(expectedCash)} sub={`عهدة ${money(openShift.openingFloat)}`} icon={Wallet} color="var(--amber)" />
        <Kpi label="الضريبة المحصّلة" value={money(summary.vat)} icon={Receipt} />
      </div>
      {(openShift.cashMovements || []).length > 0 && (
        <div className="card card-p mb">
          <div className="card-t mb"><ArrowRight size={15} />حركات الدرج</div>
          {openShift.cashMovements.map((m, i) => (
            <div key={i} className="totrow"><span>{m.type === 'in' ? 'إيداع' : 'صرف'} · {m.reason || '—'} <span className="mut sm-txt">{timeAr(m.at)}</span></span>
              <span className="v num" style={{ color: m.type === 'in' ? 'var(--mint)' : 'var(--rose)' }}>{m.type === 'in' ? '+' : '-'}{money(m.amount)}</span></div>
          ))}
        </div>
      )}
      {pastShifts.length > 0 && <PastShifts shifts={pastShifts} cur={cur} />}

      {closing && (
        <Modal title="إغلاق الوردية (تقرير Z)" sub="اعدد النقد فعلياً ثم أغلق" icon={DoorOpen} onClose={() => setClosing(false)}
          foot={<><button className="btn" onClick={() => setClosing(false)}>إلغاء</button>
            <button className="btn danger" onClick={closeShiftNow}><Check size={15} />تأكيد الإغلاق</button></>}>
          <div className="card card-p mb">
            <div className="totrow"><span>مبيعات نقدية</span><span className="v num">{money(summary.cash)}</span></div>
            <div className="totrow"><span>عهدة افتتاحية</span><span className="v num">{money(openShift.openingFloat)}</span></div>
            {cashIn > 0 && <div className="totrow"><span>إيداعات</span><span className="v num">+{money(cashIn)}</span></div>}
            {cashOut > 0 && <div className="totrow"><span>مصروفات</span><span className="v num">-{money(cashOut)}</span></div>}
            <div className="totrow grand"><span>المتوقّع بالدرج</span><span className="v num">{money(expectedCash)} {cur}</span></div>
          </div>
          <Field label={`النقد المعدود فعلياً (${cur})`}>
            <input className="inp num" value={counted} onChange={e => setCounted(e.target.value.replace(/[^\d.]/g, ''))} autoFocus placeholder="0.00" />
          </Field>
          {counted !== '' && (() => { const over = round2((Number(counted) || 0) - expectedCash); return (
            <div className={cls('badge', over === 0 ? 'b-mint' : over > 0 ? 'b-amber' : 'b-rose')} style={{ fontSize: 14 }}>
              {over === 0 ? 'مطابق ✓' : over > 0 ? `فائض ${money(over)}` : `عجز ${money(Math.abs(over))}`}</div>); })()}
        </Modal>
      )}
      {showX && (
        <Modal title={`تقرير X · ${openShift.no}`} sub="لقطة فورية دون إغلاق" icon={BarChart3} onClose={() => setShowX(false)}
          foot={<button className="btn pri" onClick={() => setShowX(false)}>تم</button>}>
          <div className="card card-p">
            <div className="totrow"><span>الطلبات</span><span className="v num">{summary.count}</span></div>
            <div className="totrow"><span>إجمالي المبيعات</span><span className="v num">{money(summary.total)} {cur}</span></div>
            <div className="totrow"><span>نقداً</span><span className="v num">{money(summary.cash)}</span></div>
            <div className="totrow"><span>شبكة</span><span className="v num">{money(summary.card)}</span></div>
            <div className="totrow"><span>فاتورة</span><span className="v num">{money(summary.fatora)}</span></div>
            <div className="totrow"><span>الضريبة</span><span className="v num">{money(summary.vat)}</span></div>
            <div className="totrow grand"><span>المتوقّع بالدرج</span><span className="v num">{money(expectedCash)} {cur}</span></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PastShifts({ shifts, cur }) {
  return (
    <div className="mt">
      <div className="zone-h"><Clock size={15} color="var(--acc)" />ورديات سابقة</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl-list">
          <thead><tr><th>الوردية</th><th>الكاشير</th><th>المبيعات</th><th>نقد/شبكة/فاتورة</th><th>الفرق</th><th>الإغلاق</th></tr></thead>
          <tbody>
            {shifts.map(s => (
              <tr key={s.id}>
                <td><b className="num">{s.no}</b></td>
                <td>{s.cashierName}</td>
                <td className="num">{money(s.salesTotal || 0)} {cur}</td>
                <td className="num sm-txt">{money((s.totalsByMethod || {}).cash || 0)} / {money((s.totalsByMethod || {}).card || 0)} / {money((s.totalsByMethod || {}).fatora || 0)}</td>
                <td><span className={cls('badge', (s.overShort || 0) === 0 ? 'b-mint' : 'b-rose')}>{(s.overShort || 0) === 0 ? 'مطابق' : money(s.overShort)}</span></td>
                <td className="sm-txt mut">{timeAr(s.closedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= التقارير ================= */
export function ReportsScreen({ ctx }) {
  const { db, settings } = ctx;
  const cur = curAr(settings.currency);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const items = db.menu?.items || [];
  const cats = db.menu?.categories || [];

  const paid = useMemo(() => (db.orders || []).filter(o => o.status === 'paid' && (o.closedAt || '').slice(0, 10) === date), [db.orders, date]);
  const kpi = useMemo(() => {
    let total = 0, vat = 0, cash = 0, card = 0, fatora = 0;
    paid.forEach(o => { const t = o.totals || computeOrder(o, settings); total += t.total; vat += t.vat; (o.payments || []).forEach(p => { if (p.method === 'cash') cash += p.amount; else if (p.method === 'card') card += p.amount; else fatora += p.amount; }); });
    return { total: round2(total), vat: round2(vat), cash: round2(cash), card: round2(card), fatora: round2(fatora), count: paid.length, avg: paid.length ? round2(total / paid.length) : 0 };
  }, [paid, settings]);

  const byHour = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, sales: 0 }));
    paid.forEach(o => { const hr = new Date(o.closedAt).getHours(); const t = o.totals || computeOrder(o, settings); h[hr].sales += t.total; });
    return h.filter(x => x.sales > 0).map(x => ({ name: String(x.hour).padStart(2, '0'), المبيعات: round2(x.sales) }));
  }, [paid, settings]);

  const byCat = useMemo(() => {
    const map = {};
    paid.forEach(o => o.lines.forEach(l => { const it = items.find(i => i.id === l.itemId); const cat = cats.find(c => c.id === (it?.catId)); const name = cat?.name || 'أخرى'; map[name] = (map[name] || 0) + lineTotal(l); }));
    return Object.entries(map).map(([name, v]) => ({ name, القيمة: round2(v) })).sort((a, b) => b.القيمة - a.القيمة);
  }, [paid, items, cats]);

  const topItems = useMemo(() => {
    const map = {};
    paid.forEach(o => o.lines.forEach(l => { const k = l.name; if (!map[k]) map[k] = { name: k, qty: 0, rev: 0 }; map[k].qty += l.qty; map[k].rev += lineTotal(l); }));
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [paid]);

  const exportCSV = () => {
    const rows = [['الرقم', 'النوع', 'الطاولة/العميل', 'الأصناف', 'الصافي', 'الضريبة', 'الإجمالي', 'الدفع', 'الوقت']];
    paid.forEach(o => { const t = o.totals || computeOrder(o, settings); rows.push([o.no, (ORDER_TYPES.find(x => x.id === o.type) || {}).label, o.tableName || o.customer?.name || '', t.count, money(t.net), money(t.vat), money(t.total), (o.payments || []).map(p => p.method).join('+'), timeAr(o.closedAt)]); });
    downloadCSV(`مبيعات-${date}.csv`, rows);
  };

  const barColors = ['#C8A24A', '#4FB286', '#5B93C4', '#DA5A53', '#E0A458', '#9B7BB8'];

  return (
    <div className="screen-pad">
      <div className="h-row">
        <div className="h-ttl"><BarChart3 size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />تقارير المبيعات</div>
        <div className="row">
          <input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn" onClick={exportCSV}><Download size={15} />CSV</button>
        </div>
      </div>
      <div className="grid-kpi">
        <Kpi label="المبيعات" value={money(kpi.total)} sub={`${cur}`} icon={TrendingUp} />
        <Kpi label="الطلبات" value={kpi.count} icon={ClipboardList} color="var(--sky)" />
        <Kpi label="متوسط الفاتورة" value={money(kpi.avg)} icon={Receipt} color="var(--amber)" />
        <Kpi label="الضريبة" value={money(kpi.vat)} icon={Percent} color="var(--violet)" />
        <Kpi label="نقد / شبكة / فاتورة" value={`${money(kpi.cash)} / ${money(kpi.card)} / ${money(kpi.fatora)}`} icon={Wallet} color="var(--mint)" />
      </div>

      {paid.length === 0 ? <Empty icon={BarChart3} title="لا مبيعات في هذا اليوم" /> : (
        <div className="grid2" style={{ alignItems: 'start' }}>
          <div className="card card-p">
            <div className="card-t mb"><Clock size={15} />المبيعات حسب الساعة</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--dim)', fontSize: 11 }} width={44} />
                <Tooltip contentStyle={{ background: 'var(--ink3)', border: '1px solid var(--line-g)', borderRadius: 10, color: 'var(--txt)' }} />
                <Bar dataKey="المبيعات" fill="var(--acc)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card card-p">
            <div className="card-t mb"><Package size={15} />المبيعات حسب القسم</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCat} layout="vertical" margin={{ right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--dim)', fontSize: 11 }} width={90} />
                <Tooltip contentStyle={{ background: 'var(--ink3)', border: '1px solid var(--line-g)', borderRadius: 10, color: 'var(--txt)' }} />
                <Bar dataKey="القيمة" radius={[0, 6, 6, 0]}>
                  {byCat.map((_, i) => <Cell key={i} fill={barColors[i % barColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card card-p" style={{ gridColumn: '1/-1' }}>
            <div className="card-t mb"><TrendingUp size={15} />الأصناف الأكثر مبيعاً</div>
            <table className="tbl-list">
              <thead><tr><th>الصنف</th><th>الكمية</th><th>الإيراد</th></tr></thead>
              <tbody>{topItems.map((it, i) => (
                <tr key={i}><td>{it.name}</td><td className="num">{it.qty}</td><td className="num">{money(it.rev)} {cur}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= الإدارة ================= */
export function AdminScreen({ ctx, mode, setMode, theme, setTheme }) {
  const [sub, setSub] = useState('settings');
  const tabs = [['settings', 'الإعدادات', Settings], ['menu', 'القائمة', Package], ['tables', 'الطاولات', Grid3x3], ['users', 'المستخدمون', Users]];
  return (
    <div className="screen-pad">
      <div className="h-ttl mb"><Settings size={18} color="var(--acc)" style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />الإدارة</div>
      <div className="seg mb" style={{ display: 'inline-flex' }}>
        {tabs.map(([k, l, I]) => <button key={k} className={cls('seg-b', sub === k && 'on')} onClick={() => setSub(k)}><I size={14} />{l}</button>)}
      </div>
      {sub === 'settings' && <SettingsAdmin ctx={ctx} mode={mode} setMode={setMode} theme={theme} setTheme={setTheme} />}
      {sub === 'menu' && <MenuAdmin ctx={ctx} />}
      {sub === 'tables' && <TablesAdmin ctx={ctx} />}
      {sub === 'users' && <UsersAdmin ctx={ctx} />}
    </div>
  );
}

function SettingsAdmin({ ctx, mode, setMode, theme, setTheme }) {
  const { db, saveKey, say, fatoraServer } = ctx;
  const [s, setS] = useState(() => JSON.parse(JSON.stringify(db.settings || {})));
  const f = s.fatora || {};
  const setF = (patch) => setS(v => ({ ...v, fatora: { ...(v.fatora || {}), ...patch } }));
  const save = async () => { await saveKey(KEYS.settings, s); say('حُفظت الإعدادات ✓', 'ok'); };
  const resetDemo = async () => {
    if (!confirm('إعادة ضبط القائمة والطاولات لبيانات العرض؟ (لن تُحذف المبيعات)')) return;
    const seed = seedBundle();
    await saveKey(KEYS.menu, seed.menu); await saveKey(KEYS.tables, seed.tables);
    say('أُعيد ضبط بيانات العرض ✓', 'ok');
  };
  const themes = [['brass', 'نحاسي'], ['emerald', 'أخضر'], ['royal', 'بنفسجي'], ['crimson', 'قرمزي']];

  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <div className="card card-p">
        <div className="card-t mb"><Store size={16} />بيانات المنشأة</div>
        <Field label="اسم المطعم"><input className="inp" value={s.name || ''} onChange={e => setS({ ...s, name: e.target.value })} /></Field>
        <Field label="الاسم بالإنجليزية"><input className="inp" value={s.nameEn || ''} onChange={e => setS({ ...s, nameEn: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="الرقم الضريبي"><input className="inp num" value={s.vatNo || ''} onChange={e => setS({ ...s, vatNo: e.target.value })} /></Field>
          <Field label="السجل التجاري"><input className="inp num" value={s.crNo || ''} onChange={e => setS({ ...s, crNo: e.target.value })} /></Field>
        </div>
        <Field label="العنوان"><input className="inp" value={s.address || ''} onChange={e => setS({ ...s, address: e.target.value })} /></Field>
        <Field label="الجوال"><input className="inp num" value={s.phone || ''} onChange={e => setS({ ...s, phone: e.target.value })} /></Field>
        <Field label="شعار (رابط صورة، اختياري)"><input className="inp" value={s.logoUrl || ''} onChange={e => setS({ ...s, logoUrl: e.target.value })} /></Field>
        <Field label="عبارة أسفل الإيصال"><input className="inp" value={s.footerNote || ''} onChange={e => setS({ ...s, footerNote: e.target.value })} /></Field>
      </div>

      <div className="card card-p">
        <div className="card-t mb"><Percent size={16} />الضريبة والعملة والطباعة</div>
        <div className="grid2">
          <Field label="العملة">
            <select className="sel" value={s.currency || 'SAR'} onChange={e => setS({ ...s, currency: e.target.value })}>
              {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.name} ({v.ar})</option>)}
            </select>
          </Field>
          <Field label="نسبة الضريبة %"><input className="inp num" type="number" value={s.vatRate ?? 15} onChange={e => setS({ ...s, vatRate: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid2">
          <Field label="رسوم الخدمة %"><input className="inp num" type="number" value={s.serviceRate || 0} onChange={e => setS({ ...s, serviceRate: Number(e.target.value) })} /></Field>
          <Field label="مقاس الطابعة">
            <Seg value={s.receiptSize || '80'} onChange={v => setS({ ...s, receiptSize: v })} options={[{ value: '80', label: '80مم' }, { value: '58', label: '58مم' }]} />
          </Field>
        </div>
        <label className="row" style={{ gap: 8, marginBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!s.serviceAllTypes} onChange={e => setS({ ...s, serviceAllTypes: e.target.checked })} />
          <span className="sm-txt">تطبيق الخدمة على كل الأنواع (لا الصالة فقط)</span></label>
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={s.autoKitchenPrint !== false} onChange={e => setS({ ...s, autoKitchenPrint: e.target.checked })} />
          <span className="sm-txt">طباعة تذكرة المطبخ تلقائياً عند الإرسال</span></label>
        <div className={cls('badge mt', emitsZatca(s) ? 'b-mint' : 'b-dim')} style={{ display: 'flex' }}>
          <QrCode size={13} />{emitsZatca(s) ? 'سيُطبع رمز ZATCA على الفواتير' : 'لن يُطبع رمز ZATCA (يتطلب رقماً ضريبياً ونسبة > 0)'}</div>
      </div>

      <div className="card card-p" style={{ gridColumn: '1/-1' }}>
        <div className="card-t mb"><QrCode size={16} />الربط مع منصة فاتورة</div>
        <div className={cls('badge mb', fatoraServer ? 'b-mint' : 'b-amber')} style={{ display: 'inline-flex' }}>
          {fatoraServer ? <><CheckCircle2 size={13} />الخادم مُفعّل (المفتاح مضبوط)</> : <><AlertTriangle size={13} />الخادم بلا مفتاح — اضبط FATORA_API_KEY في ‎.env</>}
        </div>
        <div className="grid2">
          <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
            <input type="checkbox" checked={!!f.enabled} onChange={e => setF({ enabled: e.target.checked })} />
            <span>تفعيل الدفع عبر فاتورة</span></label>
          <Field label="طريقة الدفع">
            <Seg value={f.mode || 'redirect'} onChange={v => setF({ mode: v })} options={[{ value: 'redirect', label: 'تحويل الجهاز' }, { value: 'link', label: 'رمز/رابط للعميل' }]} />
          </Field>
        </div>
        <div className="grid2">
          <Field label="لغة صفحة الدفع">
            <Seg value={f.language || 'ar'} onChange={v => setF({ language: v })} options={[{ value: 'ar', label: 'عربي' }, { value: 'en', label: 'English' }]} />
          </Field>
          <Field label="عملة الدفع (فارغ = عملة المطعم)">
            <select className="sel" value={f.currency || ''} onChange={e => setF({ currency: e.target.value })}>
              <option value="">مثل عملة المطعم ({s.currency || 'SAR'})</option>
              {Object.entries(CURRENCIES).map(([k, v]) => <option key={k} value={k}>{v.en}</option>)}
            </select>
          </Field>
        </div>
        <div className="mut sm-txt">مفتاح فاتورة السرّي يُضبط في الخادم فقط (متغيّر البيئة FATORA_API_KEY) ولا يُخزَّن في الواجهة إطلاقاً.</div>
      </div>

      <div className="card card-p">
        <div className="card-t mb"><Palette size={16} />المظهر</div>
        <Field label="الوضع">
          <Seg value={mode} onChange={setMode} options={[{ value: 'light', label: 'فاتح', icon: <Sun size={14} /> }, { value: 'dark', label: 'داكن', icon: <Moon size={14} /> }]} />
        </Field>
        <Field label="الهوية اللونية">
          <div className="row wrap" style={{ gap: 6 }}>
            {themes.map(([k, l]) => <button key={k} className={cls('chip', theme === k && 'on')} onClick={() => setTheme(k)}>{l}</button>)}
          </div>
        </Field>
      </div>

      <div className="card card-p">
        <div className="card-t mb"><RefreshCw size={16} />صيانة</div>
        <button className="btn block mb" onClick={resetDemo}><RefreshCw size={14} />إعادة ضبط القائمة والطاولات (بيانات عرض)</button>
        <div className="mut sm-txt">لا تُحذف المبيعات ولا الورديات.</div>
      </div>

      <div style={{ gridColumn: '1/-1' }}>
        <button className="btn pri lg" onClick={save}><Save size={17} />حفظ كل الإعدادات</button>
      </div>
    </div>
  );
}

function MenuAdmin({ ctx }) {
  const { db, saveKey, say } = ctx;
  const menu = db.menu || { categories: [], items: [], modifierGroups: [] };
  const [catFilter, setCatFilter] = useState('all');
  const [editItem, setEditItem] = useState(null);
  const [editCat, setEditCat] = useState(null);

  const saveMenu = (m) => saveKey(KEYS.menu, m);
  const items = (menu.items || []).filter(i => catFilter === 'all' || i.catId === catFilter).sort((a, b) => (a.sort || 0) - (b.sort || 0));

  const delItem = async (it) => { if (confirm(`حذف «${it.name}»؟`)) { await saveMenu({ ...menu, items: menu.items.filter(i => i.id !== it.id) }); say('حُذف'); } };
  const toggleAvail = async (it) => saveMenu({ ...menu, items: upsert(menu.items, { ...it, available: it.available === false }) });
  const delCat = async (c) => {
    if ((menu.items || []).some(i => i.catId === c.id)) { say('القسم يحوي أصنافاً', 'no'); return; }
    if (confirm(`حذف قسم «${c.name}»؟`)) { await saveMenu({ ...menu, categories: menu.categories.filter(x => x.id !== c.id) }); }
  };

  return (
    <div>
      <div className="h-row">
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={cls('chip', catFilter === 'all' && 'on')} onClick={() => setCatFilter('all')}>كل الأصناف</button>
          {(menu.categories || []).map(c => <button key={c.id} className={cls('chip', catFilter === c.id && 'on')} onClick={() => setCatFilter(c.id)}>{c.emoji} {c.name}</button>)}
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditCat({ id: uid('cat'), name: '', emoji: '🍽️', color: '#C8A24A', sort: (menu.categories?.length || 0) + 1 })}><Plus size={14} />قسم</button>
          <button className="btn pri" onClick={() => setEditItem({ id: uid('it'), catId: catFilter !== 'all' ? catFilter : (menu.categories[0]?.id), name: '', price: 0, emoji: '🍽️', station: 'kitchen', modifiers: [], available: true, sort: (menu.items?.length || 0) + 1 })}><Plus size={14} />صنف</button>
        </div>
      </div>
      {/* الأقسام */}
      <div className="row wrap mb" style={{ gap: 8 }}>
        {(menu.categories || []).map(c => (
          <span key={c.id} className="chip" style={{ cursor: 'default' }}>
            {c.emoji} {c.name}
            <button className="btn sm gh icon" onClick={() => setEditCat(c)}><Pencil size={12} /></button>
            <button className="btn sm gh icon" onClick={() => delCat(c)}><Trash2 size={12} /></button>
          </span>
        ))}
      </div>
      {/* الأصناف */}
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl-list">
          <thead><tr><th></th><th>الصنف</th><th>القسم</th><th>السعر</th><th>المحطة</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {items.map(it => {
              const cat = menu.categories.find(c => c.id === it.catId);
              return (
                <tr key={it.id}>
                  <td style={{ fontSize: 22 }}>{it.emoji}</td>
                  <td><b>{it.name}</b>{it.nameEn && <div className="sm-txt mut">{it.nameEn}</div>}</td>
                  <td>{cat?.name || '—'}</td>
                  <td className="num">{money(it.price)}</td>
                  <td className="sm-txt">{STATIONS[it.station] || it.station}</td>
                  <td><button className={cls('badge', it.available === false ? 'b-rose' : 'b-mint')} onClick={() => toggleAvail(it)}>{it.available === false ? 'غير متوفر' : 'متوفر'}</button></td>
                  <td><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                    <button className="btn sm gh icon" onClick={() => setEditItem(it)}><Pencil size={13} /></button>
                    <button className="btn sm gh icon" onClick={() => delItem(it)}><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editItem && <ItemEditor menu={menu} item={editItem} onClose={() => setEditItem(null)}
        onSave={async (it) => { await saveMenu({ ...menu, items: upsert(menu.items, it) }); setEditItem(null); say('حُفظ الصنف ✓', 'ok'); }} />}
      {editCat && <CatEditor cat={editCat} onClose={() => setEditCat(null)}
        onSave={async (c) => { await saveMenu({ ...menu, categories: upsert(menu.categories, c) }); setEditCat(null); say('حُفظ القسم ✓', 'ok'); }} />}
    </div>
  );
}

function ItemEditor({ menu, item, onClose, onSave }) {
  const [it, setIt] = useState({ ...item });
  const toggleMod = (gid) => setIt(v => ({ ...v, modifiers: (v.modifiers || []).includes(gid) ? v.modifiers.filter(x => x !== gid) : [...(v.modifiers || []), gid] }));
  return (
    <Modal title={item.name ? 'تعديل صنف' : 'صنف جديد'} icon={Package} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn pri" disabled={!it.name || !it.catId} onClick={() => onSave({ ...it, price: Number(it.price) || 0 })}><Save size={14} />حفظ</button></>}>
      <div className="grid2">
        <Field label="الاسم"><input className="inp" value={it.name} onChange={e => setIt({ ...it, name: e.target.value })} autoFocus /></Field>
        <Field label="بالإنجليزية"><input className="inp" value={it.nameEn || ''} onChange={e => setIt({ ...it, nameEn: e.target.value })} /></Field>
      </div>
      <div className="grid2">
        <Field label="القسم"><select className="sel" value={it.catId} onChange={e => setIt({ ...it, catId: e.target.value })}>
          {menu.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="السعر (شامل الضريبة)"><input className="inp num" type="number" value={it.price} onChange={e => setIt({ ...it, price: e.target.value })} /></Field>
      </div>
      <div className="grid2">
        <Field label="رمز تعبيري"><input className="inp" value={it.emoji || ''} onChange={e => setIt({ ...it, emoji: e.target.value })} placeholder="🍔" /></Field>
        <Field label="محطة المطبخ"><select className="sel" value={it.station || 'kitchen'} onChange={e => setIt({ ...it, station: e.target.value })}>
          {Object.entries(STATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div>
      <Field label="مجموعات الإضافات">
        <div className="row wrap" style={{ gap: 6 }}>
          {(menu.modifierGroups || []).map(g => <button key={g.id} className={cls('chip', (it.modifiers || []).includes(g.id) && 'on')} onClick={() => toggleMod(g.id)}>{g.name}</button>)}
        </div>
      </Field>
      <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={it.available !== false} onChange={e => setIt({ ...it, available: e.target.checked })} /><span>متوفر للبيع</span></label>
    </Modal>
  );
}

function CatEditor({ cat, onClose, onSave }) {
  const [c, setC] = useState({ ...cat });
  return (
    <Modal title={cat.name ? 'تعديل قسم' : 'قسم جديد'} icon={Package} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>إلغاء</button>
        <button className="btn pri" disabled={!c.name} onClick={() => onSave(c)}><Save size={14} />حفظ</button></>}>
      <Field label="اسم القسم"><input className="inp" value={c.name} onChange={e => setC({ ...c, name: e.target.value })} autoFocus /></Field>
      <div className="grid2">
        <Field label="رمز تعبيري"><input className="inp" value={c.emoji || ''} onChange={e => setC({ ...c, emoji: e.target.value })} /></Field>
        <Field label="الترتيب"><input className="inp num" type="number" value={c.sort || 1} onChange={e => setC({ ...c, sort: Number(e.target.value) })} /></Field>
      </div>
    </Modal>
  );
}

function TablesAdmin({ ctx }) {
  const { db, saveKey, say } = ctx;
  const tables = db.tables || [];
  const [edit, setEdit] = useState(null);
  const save = (list) => saveKey(KEYS.tables, list);
  return (
    <div>
      <div className="h-row">
        <div className="h-ttl">الطاولات ({tables.length})</div>
        <button className="btn pri" onClick={() => setEdit({ id: uid('tb'), name: '', zone: 'صالة داخلية', seats: 4 })}><Plus size={14} />طاولة</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl-list">
          <thead><tr><th>الاسم</th><th>المنطقة</th><th>المقاعد</th><th></th></tr></thead>
          <tbody>{tables.map(t => (
            <tr key={t.id}><td><b>{t.name}</b></td><td>{t.zone}</td><td className="num">{t.seats}</td>
              <td><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                <button className="btn sm gh icon" onClick={() => setEdit(t)}><Pencil size={13} /></button>
                <button className="btn sm gh icon" onClick={() => { if (confirm('حذف الطاولة؟')) save(tables.filter(x => x.id !== t.id)); }}><Trash2 size={13} /></button>
              </div></td></tr>
          ))}</tbody>
        </table>
      </div>
      {edit && <Modal title={edit.name ? 'تعديل طاولة' : 'طاولة جديدة'} icon={Grid3x3} onClose={() => setEdit(null)}
        foot={<><button className="btn" onClick={() => setEdit(null)}>إلغاء</button>
          <button className="btn pri" disabled={!edit.name} onClick={() => { save(upsert(tables, { ...edit, seats: Number(edit.seats) || 1 })); setEdit(null); say('حُفظت ✓', 'ok'); }}><Save size={14} />حفظ</button></>}>
        <Field label="اسم الطاولة"><input className="inp" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
        <div className="grid2">
          <Field label="المنطقة"><input className="inp" value={edit.zone} onChange={e => setEdit({ ...edit, zone: e.target.value })} list="zones" />
            <datalist id="zones">{[...new Set(tables.map(t => t.zone))].map(z => <option key={z} value={z} />)}</datalist></Field>
          <Field label="المقاعد"><input className="inp num" type="number" value={edit.seats} onChange={e => setEdit({ ...edit, seats: e.target.value })} /></Field>
        </div>
      </Modal>}
    </div>
  );
}

function UsersAdmin({ ctx }) {
  const { db, saveKey, say, me } = ctx;
  const users = db.users || [];
  const [edit, setEdit] = useState(null);
  const save = (list) => saveKey(KEYS.users, list);
  return (
    <div>
      <div className="h-row">
        <div className="h-ttl">المستخدمون ({users.length})</div>
        <button className="btn pri" onClick={() => setEdit({ id: uid('u'), name: '', role: 'cashier', pin: '', active: true })}><Plus size={14} />مستخدم</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl-list">
          <thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}><td><b>{u.name}</b></td><td>{(ROLES[u.role] || {}).label}</td>
              <td><span className={cls('badge', u.active !== false ? 'b-mint' : 'b-dim')}>{u.active !== false ? 'نشط' : 'موقوف'}</span></td>
              <td><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                <button className="btn sm gh icon" onClick={() => setEdit(u)}><Pencil size={13} /></button>
                {u.id !== me.id && <button className="btn sm gh icon" onClick={() => { if (confirm('حذف المستخدم؟')) save(users.filter(x => x.id !== u.id)); }}><Trash2 size={13} /></button>}
              </div></td></tr>
          ))}</tbody>
        </table>
      </div>
      {edit && <Modal title={edit.name ? 'تعديل مستخدم' : 'مستخدم جديد'} icon={User} onClose={() => setEdit(null)}
        foot={<><button className="btn" onClick={() => setEdit(null)}>إلغاء</button>
          <button className="btn pri" disabled={!edit.name || (edit.pin || '').length < 4} onClick={() => { save(upsert(users, edit)); setEdit(null); say('حُفظ ✓', 'ok'); }}><Save size={14} />حفظ</button></>}>
        <Field label="الاسم"><input className="inp" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
        <div className="grid2">
          <Field label="الدور"><select className="sel" value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="رمز الدخول (4-6 أرقام)"><input className="inp num" value={edit.pin} onChange={e => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
        </div>
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /><span>نشط</span></label>
      </Modal>}
    </div>
  );
}
