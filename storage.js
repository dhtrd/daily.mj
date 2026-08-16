/**
 * طبقة التخزين السحابي لنقطة البيع — ثلاث طبقات بالترتيب:
 *  1) Firestore        → مزامنة لحظية بين أجهزة الكاشير (تُفعَّل تلقائياً عند ضبط متغيرات VITE_FIREBASE_*)
 *  2) خادم المشروع     → /api/store عند غياب إعدادات Firebase (data/store.json)
 *  3) تخزين المتصفح    → احتياطي عند انقطاع الشبكة (يعمل الكاشير دون إنترنت)
 * واجهة موحّدة: cloud.get / cloud.set / cloud.subscribe — لا يعلم باقي التطبيق أي طبقة تعمل.
 *
 * ملاحظة: مفتاح فاتورة لا يمرّ من هنا أبداً — الدفع يتم عبر وسيط الخادم (server.js).
 */

export const KEYS = {
  menu: 'pos:menu',          // الأصناف والأقسام ومجموعات الإضافات
  tables: 'pos:tables',      // خريطة الطاولات (الصالة)
  settings: 'pos:settings',  // بيانات المنشأة + الضريبة + إعداد فاتورة + التفضيلات
  orders: 'pos:orders',      // الطلبات (مفتوحة/معلّقة/مدفوعة) — نافذة متحرّكة
  shifts: 'pos:shifts',      // الورديات وإغلاقاتها
  users: 'pos:users',        // الكاشيرون والمدراء (دخول برمز PIN)
  audit: 'pos:audit'         // سجل الأحداث
};

export const kb = (o) => Math.round(JSON.stringify(o || {}).length / 1024);

/* ================= إعدادات Firebase ================= */
const E = import.meta.env || {};
const FB = {
  apiKey: E.VITE_FIREBASE_API_KEY,
  authDomain: E.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: E.VITE_FIREBASE_PROJECT_ID,
  storageBucket: E.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: E.VITE_FIREBASE_SENDER_ID,
  appId: E.VITE_FIREBASE_APP_ID
};
const FB_READY = !!(FB.apiKey && FB.projectId);
const COL = E.VITE_FIREBASE_COLLECTION || 'pos';
const CHUNK = 700000; // مستند Firestore محدود بميغابايت — نقسّم القيم الكبيرة
const docId = (k) => k.replace(/[^\w-]/g, '_');

let fs = null;      // وحدات Firestore المحمّلة كسولاً
let fsFailed = false;
let _fbAppP = null;

async function fbApp() {
  if (!FB_READY) return null;
  if (!_fbAppP) {
    _fbAppP = (async () => {
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      return getApps().length ? getApp() : initializeApp(FB);
    })();
  }
  return _fbAppP;
}

// جلسة مصادقة مجهولة لكل جهاز — كافية لمزامنة نقطة البيع؛ هوية الكاشير تُدار برمز PIN داخل التطبيق
async function ensureAuth() {
  const app = await fbApp();
  if (!app) return null;
  const A = await import('firebase/auth');
  const a = A.getAuth(app);
  if (a.currentUser) return a.currentUser;
  try { await A.setPersistence(a, A.browserLocalPersistence); } catch { }
  await new Promise((res) => { const un = A.onAuthStateChanged(a, () => { un(); res(); }); });
  if (!a.currentUser) { try { await A.signInAnonymously(a); } catch (e) { console.warn('مصادقة مجهولة فشلت:', e); } }
  return a.currentUser || null;
}

async function firestore() {
  if (!FB_READY || fsFailed) return null;
  if (fs) return fs;
  try {
    const u = await ensureAuth();
    if (!u) return null;
    const app = await fbApp();
    const sdk = await import('firebase/firestore');
    let db;
    try {
      db = sdk.initializeFirestore(app, { localCache: sdk.persistentLocalCache({}) });
    } catch {
      db = sdk.getFirestore(app);
    }
    fs = { db, ...sdk };
    return fs;
  } catch (e) {
    console.warn('تعذّر تحميل Firestore — سيتم استخدام خادم المشروع.', e);
    fsFailed = true;
    return null;
  }
}

async function fsAssemble(f, key, d) {
  if (!d) return undefined;
  if ((d.parts || 1) === 1) return d.value ? JSON.parse(d.value) : undefined;
  const parts = [];
  for (let i = 0; i < d.parts; i++) {
    const c = await f.getDoc(f.doc(f.db, COL, docId(key) + '__' + i));
    parts.push(c.exists() ? c.data().chunk : '');
  }
  try { return JSON.parse(parts.join('')); } catch { return undefined; }
}

async function fsRead(f, key) {
  const snap = await f.getDoc(f.doc(f.db, COL, docId(key)));
  if (!snap.exists()) return undefined;
  return await fsAssemble(f, key, snap.data());
}

async function fsWrite(f, key, val) {
  const s = JSON.stringify(val);
  const parts = Math.max(1, Math.ceil(s.length / CHUNK));
  if (parts > 1) {
    for (let i = 0; i < parts; i++) {
      await f.setDoc(f.doc(f.db, COL, docId(key) + '__' + i), { chunk: s.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
  }
  await f.setDoc(f.doc(f.db, COL, docId(key)), {
    parts, updatedAt: Date.now(), value: parts === 1 ? s : ''
  });
  return true;
}

/* ================= خادم المشروع ================= */
let useApi = true;
const url = (k) => '/api/store/' + encodeURIComponent(k);

/* ================= تخزين المتصفح ================= */
const local = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : undefined; } catch { return undefined; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};

/* ================= الواجهة الموحّدة ================= */
export const cloud = {
  async get(key, def) {
    const f = await firestore();
    if (f) {
      try {
        const v = await fsRead(f, key);
        if (v !== undefined) { local.set(key, v); return v; }
        return def;
      } catch (e) { console.warn('قراءة Firestore فشلت:', e); }
    }
    if (useApi && !FB_READY) {
      try {
        const r = await fetch(url(key));
        if (r.ok) {
          const j = await r.json();
          if (j.value !== null && j.value !== undefined) { local.set(key, j.value); return j.value; }
          return def;
        }
      } catch { useApi = false; }
    }
    const v = local.get(key);
    return v === undefined ? def : v;
  },

  async set(key, val) {
    const f = await firestore();
    if (f) {
      try { await fsWrite(f, key, val); local.set(key, val); return true; }
      catch (e) {
        console.warn('كتابة Firestore فشلت:', e);
        if (e && (e.code === 'permission-denied' || e.code === 'PERMISSION_DENIED')) return false;
      }
    }
    if (useApi && !FB_READY) {
      try {
        const r = await fetch(url(key), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: val })
        });
        if (r.ok) { local.set(key, val); return true; }
      } catch { useApi = false; }
    }
    return local.set(key, val);
  },

  /** استماع لحظي — يعيد دالة إلغاء الاشتراك، أو null إذا لم تكن الطبقة تدعمه */
  subscribe(key, cb) {
    if (!FB_READY) return null;
    let stop = null, dead = false;
    firestore().then(f => {
      if (!f || dead) return;
      stop = f.onSnapshot(f.doc(f.db, COL, docId(key)), async (snap) => {
        if (!snap.exists()) return;
        try {
          const v = await fsAssemble(f, key, snap.data());
          if (v !== undefined) { local.set(key, v); cb(v); }
        } catch (e) { console.warn('استماع Firestore:', e); }
      }, (e) => console.warn('انقطع الاستماع اللحظي:', e));
    });
    return () => { dead = true; if (stop) stop(); };
  },

  get mode() { return FB_READY ? 'firestore' : (useApi ? 'server' : 'local'); },
  get live() { return FB_READY; }
};
