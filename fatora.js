/**
 * عميل منصة فاتورة (Fatora.io) — واجهة المتصفح.
 *
 * مبدأ أمني: مفتاح التاجر (api_key) لا يصل المتصفح إطلاقاً. كل النداءات تمرّ عبر
 * وسيط الخادم في server.js (/api/fatora/*) الذي يضيف المفتاح من متغيّر البيئة.
 *
 * تدفّق الدفع (Standard Checkout):
 *   1) ننشئ طلب دفع → نستلم checkout_url.
 *   2) نحوّل جهاز العميل إلى الرابط (أو نعرضه كرمز QR ليدفع من جواله).
 *   3) بعد الدفع تعيد فاتورة العميل إلى success_url / failure_url مع:
 *      order_id, transaction_id, response_code, payment_id (في مَعلمات الرابط).
 *   4) نتحقّق من الحالة عبر /verify قبل اعتماد الفاتورة.
 */

import { computeOrder, balanceDue } from './menu';

const jsonPost = async (path, body) => {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { httpOk: r.ok, status: r.status, data };
};

/** معرّف طلب فريد لمحاولة الدفع (يسمح بإعادة المحاولة دون تعارض) */
export const fatoraOrderId = (order) =>
  (order.no || 'INV') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * إنشاء عملية دفع على فاتورة.
 * @param {object} p { order, settings, amount?, orderId?, client? }
 * @returns {Promise<{ok, checkout_url?, orderId?, raw?, error?, disabled?}>}
 */
export async function fatoraCheckout({ order, settings = {}, amount, orderId, client }) {
  const cfg = (settings && settings.fatora) || {};
  const amt = amount != null ? amount : balanceDue(order, settings);
  if (!(amt > 0)) return { ok: false, error: 'المبلغ غير صالح' };

  const currency = (cfg.currency && cfg.currency.trim()) || settings.currency || 'SAR';
  const oid = orderId || fatoraOrderId(order);
  const cust = client || (order.customer || {});

  const payload = {
    amount: Math.round(amt * 100) / 100,
    currency,
    order_id: oid,
    language: cfg.language || 'ar',
    note: 'فاتورة ' + (order.no || '') + (order.tableName ? ' · ' + order.tableName : ''),
    client: {
      name: (cust.name || 'عميل').slice(0, 60),
      phone: (cust.phone || '').slice(0, 20),
      email: cust.email || ''
    }
  };

  try {
    const { httpOk, status, data } = await jsonPost('/api/fatora/checkout', payload);
    if (status === 501) return { ok: false, disabled: true, error: (data && data.error) || 'الربط مع فاتورة غير مُفعّل على الخادم' };
    if (!httpOk) return { ok: false, error: (data && (data.error || data.message)) || ('فشل إنشاء الدفع (' + status + ')'), raw: data };
    // الخادم يوحّد الاستجابة ويعيد checkout_url مباشرة
    const url = data && (data.checkout_url || (data.result && data.result.checkout_url));
    if (!url) return { ok: false, error: 'لم تُعِد فاتورة رابط الدفع', raw: data };
    return { ok: true, checkout_url: url, orderId: oid, raw: data };
  } catch (e) {
    return { ok: false, error: 'تعذّر الاتصال بالخادم: ' + (e.message || e) };
  }
}

/**
 * التحقّق من حالة عملية دفع (بعد العودة من صفحة فاتورة).
 * @param {object} p { orderId, transactionId }
 * @returns {Promise<{ok, paid, status?, raw?, error?}>}
 */
export async function fatoraVerify({ orderId, transactionId }) {
  try {
    const { httpOk, status, data } = await jsonPost('/api/fatora/verify', { order_id: orderId, transaction_id: transactionId });
    if (status === 501) return { ok: false, disabled: true, error: (data && data.error) || 'الربط مع فاتورة غير مُفعّل' };
    if (!httpOk) return { ok: false, error: (data && (data.error || data.message)) || ('فشل التحقّق (' + status + ')'), raw: data };
    // الخادم يستخرج حقل النجاح ويعيد paid=true/false
    return { ok: true, paid: !!(data && data.paid), status: data && data.status, raw: data };
  } catch (e) {
    return { ok: false, error: 'تعذّر الاتصال بالخادم: ' + (e.message || e) };
  }
}

/** قراءة مَعلمات العودة من فاتورة من رابط الصفحة الحالي */
export function readFatoraReturn() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (!q.has('order_id') && !q.has('payment_id') && !q.has('fatora')) return null;
    return {
      orderId: q.get('order_id') || '',
      transactionId: q.get('transaction_id') || '',
      paymentId: q.get('payment_id') || '',
      responseCode: q.get('response_code') || '',
      outcome: q.get('fatora') || '' // success | failure (نضبطها في روابط العودة)
    };
  } catch { return null; }
}

/** يمسح مَعلمات فاتورة من الرابط دون إعادة تحميل الصفحة */
export function clearFatoraReturn() {
  try {
    const u = new URL(window.location.href);
    ['order_id', 'transaction_id', 'payment_id', 'response_code', 'fatora'].forEach(k => u.searchParams.delete(k));
    window.history.replaceState({}, document.title, u.pathname + (u.search ? u.search : '') + u.hash);
  } catch { /* تجاهل */ }
}

/** ملخّص مبلغ الدفع المتوقّع عبر فاتورة (للعرض) */
export const fatoraAmountLabel = (order, settings) => {
  const t = computeOrder(order, settings);
  return t.total;
};
