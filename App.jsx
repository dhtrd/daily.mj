import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ShoppingCart, Utensils, ShoppingBag, Bike, Grid3x3, ClipboardList, ChefHat,
  BarChart3, Settings, LogOut, Plus, Minus, Trash2, X, Check, CheckCircle2, Search,
  CreditCard, Banknote, QrCode, Printer, Percent, Tag, Users, User, Receipt,
  RefreshCw, Sun, Moon, Store, Pencil, Save, AlertTriangle, Timer, TrendingUp,
  Package, DoorOpen, Loader2, Link2, ExternalLink, Phone, MapPin, Hash, Split,
  Ban, Undo2, Eye, Lock, Palette, Coffee, ArrowRight, Clock, Wallet, ClipboardCheck,
  Wifi, WifiOff, ChevronLeft, PlusCircle
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from 'recharts';
import { cloud, KEYS } from './storage';
import {
  computeOrder, ORDER_TYPES, ORDER_STATES, STATIONS, ROLES, newOrder, addItemToOrder,
  lineTotal, lineUnit, paidTotal, balanceDue, seedBundle, uid
} from './menu';
import {
  money, round2, printReceipt, printKitchen, curAr, CURRENCIES, zatcaQrSvg
} from './invoice';
import {
  fatoraCheckout, fatoraVerify, readFatoraReturn, clearFatoraReturn, fatoraOrderId
} from './fatora';
import { Modal, Field, Seg, Kpi, Empty, Stepper, Toasts, cls } from './ui';
import {
  ModifierPicker, PaymentModal, DiscountModal, CustomerModal, TablePickModal, ReceiptModal,
  TablesScreen, OrdersScreen, KitchenScreen, ShiftScreen, ReportsScreen, AdminScreen
} from './screens';
import { CSS } from './styles';

/* ================= أدوات ================= */
const TYPE_ICON = { dine_in: Utensils, takeaway: ShoppingBag, delivery: Bike };
const nowISO = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);
const timeAr = (iso) => { try { return new Date(iso).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const minsSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
const nextSeq = (arr) => (arr || []).reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1;
const upsert = (arr, item) => { const i = (arr || []).findIndex(x => x.id === item.id); if (i < 0) return [...(arr || []), item]; const c = [...arr]; c[i] = item; return c; };

/* ================= الجذر ================= */
export default function App() {
  const [ready, setReady] = useState(false);
  const [db, setDb] = useState({ settings: null, menu: null, tables: [], orders: [], shifts: [], users: [] });
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('sale');
  const [cart, setCart] = useState(null);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('pos:mode') || 'dark'; } catch { return 'dark'; } });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('pos:theme') || 'brass'; } catch { return 'brass'; } });
  const [online, setOnline] = useState(true);
  const [fatoraServer, setFatoraServer] = useState(false);
  const [receipt, setReceipt] = useState(null); // آخر فاتورة مدفوعة لعرض الإيصال
  const [toasts, setToasts] = useState([]);
  const dbRef = useRef(db);
  dbRef.current = db;

  const say = useCallback((msg, kind = '') => {
    const id = uid('t');
    const icon = kind === 'ok' ? <CheckCircle2 size={15} /> : kind === 'no' ? <AlertTriangle size={15} /> : null;
    setToasts(t => [...t, { id, msg, kind, icon }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  }, []);

  /* تحميل البيانات + التأسيس عند أول تشغيل */
  useEffect(() => {
    (async () => {
      let settings = await cloud.get(KEYS.settings, null);
      let menu = await cloud.get(KEYS.menu, null);
      let tables = await cloud.get(KEYS.tables, null);
      let users = await cloud.get(KEYS.users, null);
      if (!settings || !menu || !users) {
        const seed = seedBundle();
        settings = settings || seed.settings; menu = menu || seed.menu;
        tables = tables || seed.tables; users = users || seed.users;
        await cloud.set(KEYS.settings, settings); await cloud.set(KEYS.menu, menu);
        await cloud.set(KEYS.tables, tables); await cloud.set(KEYS.users, users);
      }
      const orders = await cloud.get(KEYS.orders, []);
      const shifts = await cloud.get(KEYS.shifts, []);
      setDb({ settings, menu, tables: tables || [], orders: orders || [], shifts: shifts || [], users: users || [] });
      setReady(true);
    })();
  }, []);

  /* مزامنة لحظية (Firestore) أو استطلاع دوري (خادم) */
  useEffect(() => {
    if (!ready) return;
    if (cloud.live) {
      const subs = [
        cloud.subscribe(KEYS.orders, v => setDb(d => ({ ...d, orders: v || [] }))),
        cloud.subscribe(KEYS.shifts, v => setDb(d => ({ ...d, shifts: v || [] }))),
        cloud.subscribe(KEYS.settings, v => v && setDb(d => ({ ...d, settings: v }))),
        cloud.subscribe(KEYS.menu, v => v && setDb(d => ({ ...d, menu: v }))),
        cloud.subscribe(KEYS.tables, v => setDb(d => ({ ...d, tables: v || [] }))),
        cloud.subscribe(KEYS.users, v => setDb(d => ({ ...d, users: v || [] })))
      ];
      setOnline(true);
      return () => subs.forEach(s => s && s());
    }
    const iv = setInterval(async () => {
      try {
        const orders = await cloud.get(KEYS.orders, []);
        const shifts = await cloud.get(KEYS.shifts, []);
        setDb(d => ({ ...d, orders: orders || [], shifts: shifts || [] }));
        setOnline(cloud.mode !== 'local');
      } catch { setOnline(false); }
    }, 8000);
    return () => clearInterval(iv);
  }, [ready]);

  /* حالة تفعيل فاتورة على الخادم (يمنع عرض خيار الدفع دون مفتاح) */
  useEffect(() => {
    fetch('/api/fatora/config').then(r => r.json()).then(j => setFatoraServer(!!j.enabled)).catch(() => setFatoraServer(false));
  }, []);

  /* حفظ المظهر */
  useEffect(() => { try { localStorage.setItem('pos:mode', mode); } catch { } }, [mode]);
  useEffect(() => { try { localStorage.setItem('pos:theme', theme); } catch { } }, [theme]);

  /* حقن التنسيقات */
  useEffect(() => {
    let el = document.getElementById('pos-css');
    if (!el) { el = document.createElement('style'); el.id = 'pos-css'; document.head.appendChild(el); }
    el.textContent = CSS;
  }, []);

  const settings = db.settings || {};
  const cur = curAr(settings.currency || 'SAR');
  const role = me ? ROLES[me.role] || ROLES.cashier : null;
  const openShift = useMemo(() => (db.shifts || []).find(s => s.status === 'open') || null, [db.shifts]);

  /* ============ حفظ ومزامنة ============ */
  const saveKey = useCallback(async (key, value) => {
    setDb(d => ({ ...d, [key === KEYS.settings ? 'settings' : key === KEYS.menu ? 'menu' : key === KEYS.tables ? 'tables' : key === KEYS.users ? 'users' : key === KEYS.orders ? 'orders' : 'shifts']: value }));
    const ok = await cloud.set(key, value);
    if (!ok) say('تعذّر الحفظ في السحابة — حُفظ محلياً', 'no');
  }, [say]);

  // كتابة الطلبات بقراءة الأحدث أولاً (يقلّل تعارض الأجهزة)
  const commitOrders = useCallback(async (fn) => {
    const latest = await cloud.get(KEYS.orders, dbRef.current.orders);
    const next = fn(latest || []);
    setDb(d => ({ ...d, orders: next }));
    await cloud.set(KEYS.orders, next);
    return next;
  }, []);
  const commitShifts = useCallback(async (fn) => {
    const latest = await cloud.get(KEYS.shifts, dbRef.current.shifts);
    const next = fn(latest || []);
    setDb(d => ({ ...d, shifts: next }));
    await cloud.set(KEYS.shifts, next);
    return next;
  }, []);

  /* ============ عمليات الطلب ============ */
  const persistOrder = useCallback((order) => commitOrders(list => upsert(list, order)), [commitOrders]);

  const startOrder = useCallback((type, table = null) => {
    const seq = nextSeq(dbRef.current.orders);
    const o = newOrder({ type, table, cashier: me, shiftId: openShift?.id, seq });
    setCart(o); setTab('sale');
  }, [me, openShift]);

  const loadOrder = useCallback((order) => { setCart(JSON.parse(JSON.stringify(order))); setTab('sale'); }, []);

  const finalizeOrder = useCallback(async (order, payments) => {
    // أي بنود لم تُرسل للمطبخ بعد (خدمة سريعة: دفع مباشر) تُبصم كمُرسَلة وتُطبع تذكرتها
    const newlySent = (order.lines || []).filter(l => !l.sentAt);
    const lines = (order.lines || []).map(l => l.sentAt ? l : { ...l, sentAt: nowISO() });
    const t = computeOrder({ ...order, lines }, settings);
    const paid = { ...order, lines, payments, status: 'paid', closedAt: nowISO(), shiftId: order.shiftId || openShift?.id, pendingFatora: null, totals: t };
    await persistOrder(paid);
    if (newlySent.length && settings.autoKitchenPrint !== false) printKitchen(paid, newlySent, settings.receiptSize);
    return paid;
  }, [settings, openShift, persistOrder]);

  /* ============ عودة العميل من فاتورة ============ */
  const fatoraHandled = useRef(false);
  useEffect(() => {
    if (!ready || fatoraHandled.current) return;
    const ret = readFatoraReturn();
    if (!ret) return;
    fatoraHandled.current = true;
    (async () => {
      const latest = await cloud.get(KEYS.orders, dbRef.current.orders) || [];
      const ord = latest.find(o => o.pendingFatora && o.pendingFatora.fatoraOrderId === ret.orderId);
      clearFatoraReturn();
      if (!ord) { say('تعذّر مطابقة عملية فاتورة بالطلب', 'no'); return; }
      if (ret.outcome === 'failure') {
        await commitOrders(list => upsert(list, { ...ord, pendingFatora: null, status: ord.lines.some(l => l.sentAt) ? 'sent' : 'held' }));
        say('لم يكتمل الدفع عبر فاتورة', 'no'); loadOrder(ord); setTab('sale'); return;
      }
      const v = await fatoraVerify({ orderId: ret.orderId, transactionId: ret.transactionId });
      if (v.ok && v.paid) {
        const pay = { method: 'fatora', amount: ord.pendingFatora.amount, ref: ret.paymentId || ret.transactionId || ret.orderId, at: nowISO(), fatora: ret };
        const done = await finalizeOrder({ ...ord, pendingFatora: null }, [...(ord.payments || []), pay]);
        say('تم الدفع عبر فاتورة ✓', 'ok');
        setReceipt(done);
      } else {
        await commitOrders(list => upsert(list, { ...ord, pendingFatora: null, status: ord.lines.some(l => l.sentAt) ? 'sent' : 'held' }));
        say(v.error || 'تعذّر تأكيد الدفع عبر فاتورة', 'no'); loadOrder(ord);
      }
    })();
  }, [ready]); // eslint-disable-line

  if (!ready) return <div className={cls('pos', 'mode-' + mode, 'thm-' + theme)}><div className="login"><Loader2 className="spin" size={40} color="var(--acc)" /></div></div>;
  if (!me) return <div className={cls('pos', 'mode-' + mode, 'thm-' + theme)}><Login users={db.users} settings={settings} onLogin={setMe} /></div>;

  const navItems = [
    { id: 'sale', label: 'البيع', icon: ShoppingCart, show: role.canSell },
    { id: 'tables', label: 'الطاولات', icon: Grid3x3, show: true },
    { id: 'orders', label: 'الطلبات', icon: ClipboardList, show: true, badge: (db.orders || []).filter(o => o.status === 'held').length },
    { id: 'kitchen', label: 'المطبخ', icon: ChefHat, show: true, badge: (db.orders || []).filter(o => o.status === 'sent').length },
    { id: 'shift', label: 'الوردية', icon: DoorOpen, show: role.canShift },
    { id: 'reports', label: 'التقارير', icon: BarChart3, show: role.canReports },
    { id: 'admin', label: 'الإعدادات', icon: Settings, show: role.canAdmin }
  ].filter(n => n.show);

  const ctx = { db, settings, cur, me, role, openShift, cart, setCart, say, saveKey, commitOrders, commitShifts,
    persistOrder, startOrder, loadOrder, finalizeOrder, setTab, setReceipt, fatoraServer };

  return (
    <div className={cls('pos', 'mode-' + mode, 'thm-' + theme)}>
      <div className="app">
        {/* الشريط الجانبي */}
        <aside className="side">
          <div className="side-logo">{(settings.name || 'ط')[0]}</div>
          <nav className="nav">
            {navItems.map(n => (
              <button key={n.id} className={cls('navbtn', tab === n.id && 'on')} onClick={() => setTab(n.id)}>
                <n.icon size={20} />
                <span>{n.label}</span>
                {n.badge > 0 && <span className="nb-dot">{n.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <button className="navbtn" onClick={() => setMode(m => m === 'dark' ? 'light' : 'dark')} title="الوضع">
              {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="navbtn" onClick={() => { if (confirm('تسجيل الخروج؟')) { setMe(null); setCart(null); } }} title="خروج">
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* المحتوى */}
        <div className="main">
          <header className="topbar">
            <div className="tb-title">
              <Store size={20} color="var(--acc)" />{settings.name || 'نقطة البيع'}
            </div>
            <div className="tb-actions">
              <span className={cls('mode-pill', !online && 'off')} title={cloud.mode}>
                <span className="dot" />{cloud.live ? 'مزامنة لحظية' : online ? 'متصل' : 'محلي'}
              </span>
              {openShift ? <span className="badge b-mint"><DoorOpen size={12} />وردية مفتوحة</span>
                : <span className="badge b-amber"><Lock size={12} />لا وردية</span>}
              <button className="tb-user" onClick={() => setTab(role.canAdmin ? 'admin' : 'shift')}>
                <span className="tb-ava">{(me.name || '؟')[0]}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{me.name}</span>
                <span className="badge b-dim">{role.label}</span>
              </button>
            </div>
          </header>

          <main className="screen">
            {tab === 'sale' && <SaleScreen ctx={ctx} />}
            {tab === 'tables' && <TablesScreen ctx={ctx} />}
            {tab === 'orders' && <OrdersScreen ctx={ctx} />}
            {tab === 'kitchen' && <KitchenScreen ctx={ctx} />}
            {tab === 'shift' && <ShiftScreen ctx={ctx} />}
            {tab === 'reports' && <ReportsScreen ctx={ctx} />}
            {tab === 'admin' && <AdminScreen ctx={ctx} mode={mode} setMode={setMode} theme={theme} setTheme={setTheme} />}
          </main>
        </div>
      </div>

      {receipt && <ReceiptModal order={receipt} settings={settings} onClose={() => setReceipt(null)} />}
      <Toasts items={toasts} />
    </div>
  );
}

/* ================= تسجيل الدخول (PIN) ================= */
function Login({ users, settings, onLogin }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const active = (users || []).filter(u => u.active !== false);

  const press = (d) => {
    if (!sel) return;
    const np = (pin + d).slice(0, 6); setErr(''); setPin(np);
    if (np === sel.pin) { onLogin(sel); return; }
    if (np.length >= (sel.pin || '').length) { setErr('رمز غير صحيح'); setTimeout(() => setPin(''), 450); }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo">{(settings.name || 'ط')[0]}</div>
        <div style={{ fontFamily: 'var(--font-h)', fontWeight: 800, fontSize: 20 }}>{settings.name || 'نقطة البيع'}</div>
        <div className="mut sm-txt">اختر المستخدم وأدخل رمز الدخول</div>
        {!sel ? (
          <div className="users-row">
            {active.map(u => (
              <button key={u.id} className="userbtn" onClick={() => { setSel(u); setPin(''); setErr(''); }}>
                <span className="tb-ava">{(u.name || '؟')[0]}</span>
                <div><div style={{ fontWeight: 700 }}>{u.name}</div><div className="sm-txt mut">{(ROLES[u.role] || {}).label}</div></div>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="row between mt" style={{ justifyContent: 'center', gap: 8 }}>
              <span className="tb-ava">{(sel.name || '؟')[0]}</span><b>{sel.name}</b>
              <button className="btn sm gh" onClick={() => { setSel(null); setPin(''); }}>تغيير</button>
            </div>
            <div className="pin-dots">
              {[0, 1, 2, 3].map(i => <span key={i} className={cls('pin-dot', pin.length > i && 'f')} />)}
            </div>
            {err && <div className="badge b-rose" style={{ marginBottom: 10 }}>{err}</div>}
            <div className="pin-pad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <button key={n} className="kp" onClick={() => press(String(n))}>{n}</button>)}
              <button className="kp" onClick={() => setPin('')}>C</button>
              <button className="kp" onClick={() => press('0')}>0</button>
              <button className="kp" onClick={() => setPin(p => p.slice(0, -1))}>⌫</button>
            </div>
            <div className="mut sm-txt mt">تجريبي: المدير 1234 · الكاشير 1111</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= شاشة البيع ================= */
function SaleScreen({ ctx }) {
  const { db, settings, cur, me, role, openShift, cart, setCart, say, persistOrder, commitOrders, finalizeOrder, startOrder, setReceipt, setTab } = ctx;
  const menu = db.menu || { categories: [], items: [], modifierGroups: [] };
  const [catId, setCatId] = useState(menu.categories[0]?.id || null);
  const [q, setQ] = useState('');
  const [picker, setPicker] = useState(null);   // {item}
  const [pay, setPay] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [tablePick, setTablePick] = useState(false);

  const items = useMemo(() => {
    let list = (menu.items || []).filter(i => i.available !== false);
    if (q.trim()) { const s = q.trim(); list = list.filter(i => (i.name || '').includes(s) || (i.nameEn || '').toLowerCase().includes(s.toLowerCase())); }
    else if (catId) list = list.filter(i => i.catId === catId);
    return list.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }, [menu.items, catId, q]);

  const t = cart ? computeOrder(cart, settings) : null;
  const groupsOf = (item) => (item.modifiers || []).map(gid => (menu.modifierGroups || []).find(g => g.id === gid)).filter(Boolean);

  const addItem = (item) => {
    if (!cart) { say('ابدأ طلباً أولاً', 'no'); return; }
    const groups = groupsOf(item);
    if (groups.length) setPicker({ item, groups });
    else setCart(c => addItemToOrder(c, item, [], '', 1));
  };

  const setQty = (lineId, delta) => setCart(c => {
    const lines = c.lines.map(l => l.id === lineId ? { ...l, qty: l.qty + delta } : l).filter(l => l.qty > 0 || l.sentAt);
    return { ...c, lines };
  });
  const removeLine = (lineId) => setCart(c => ({ ...c, lines: c.lines.filter(l => l.id !== lineId) }));

  const canSend = cart && cart.lines.some(l => !l.sentAt);
  const sendKitchen = async () => {
    if (!cart || !cart.lines.length) return;
    const newlySent = cart.lines.filter(l => !l.sentAt);
    if (!newlySent.length) { say('لا بنود جديدة للإرسال', 'no'); return; }
    const stamped = { ...cart, lines: cart.lines.map(l => l.sentAt ? l : { ...l, sentAt: nowISO() }), status: 'sent', sentAt: cart.sentAt || nowISO() };
    setCart(stamped);
    await persistOrder(stamped);
    if (settings.autoKitchenPrint !== false) printKitchen(stamped, newlySent, settings.receiptSize);
    say('أُرسل للمطبخ ✓', 'ok');
  };

  const holdOrder = async () => {
    if (!cart || !cart.lines.length) return;
    await persistOrder({ ...cart, status: cart.lines.some(l => l.sentAt) ? 'sent' : 'held' });
    say('عُلّق الطلب', 'ok'); setCart(null);
  };

  const voidOrder = async () => {
    if (!cart) return;
    if (!role.canVoid) { say('لا صلاحية للإلغاء', 'no'); return; }
    const reason = prompt('سبب الإلغاء؟'); if (reason == null) return;
    if (cart.status && cart.status !== 'open') await commitOrders(list => upsert(list, { ...cart, status: 'void', voidReason: reason, closedAt: nowISO() }));
    say('أُلغي الطلب'); setCart(null);
  };

  const needTable = cart && cart.type === 'dine_in' && !cart.tableId;
  const needCustomer = cart && cart.type === 'delivery' && !(cart.customer && cart.customer.phone);

  const doPay = () => {
    if (!cart || !cart.lines.length) { say('السلة فارغة', 'no'); return; }
    if (!openShift) { say('افتح وردية أولاً', 'no'); setTab('shift'); return; }
    if (needTable) { say('اختر طاولة للصالة', 'no'); setTablePick(true); return; }
    if (needCustomer) { say('أدخل بيانات التوصيل', 'no'); setCustOpen(true); return; }
    setPay(true);
  };

  const onPaid = async (payments) => {
    const done = await finalizeOrder(cart, payments);
    setPay(false); setCart(null); setReceipt(done);
    say('اكتمل الدفع ✓', 'ok');
  };

  return (
    <div className="pos-wrap">
      {/* عمود القائمة */}
      <div className="menu-col">
        <div className="menu-top">
          <div className="search">
            <Search size={16} />
            <input className="inp" placeholder="ابحث عن صنف…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        {!q && (
          <div className="cat-rail">
            {(menu.categories || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).map(c => (
              <button key={c.id} className={cls('cat', catId === c.id && 'on')} onClick={() => setCatId(c.id)}>
                <span className="cat-emoji">{c.emoji || '🍽️'}</span>
                <span className="cat-name">{c.name}</span>
                <span className="cat-cnt">{(menu.items || []).filter(i => i.catId === c.id).length}</span>
              </button>
            ))}
          </div>
        )}
        <div className="item-grid">
          {items.length === 0 && <Empty icon={Search} title="لا أصناف" hint="جرّب بحثاً آخر أو اختر قسماً" />}
          {items.map(item => (
            <button key={item.id} className={cls('item', item.available === false && 'out')} onClick={() => addItem(item)}>
              {groupsOf(item).length > 0 && <span className="item-mods-hint"><Plus size={13} /></span>}
              <span className="item-emoji">{item.emoji || '🍽️'}</span>
              <span className="item-name">{item.name}</span>
              <span className="item-price num">{money(item.price)} {cur}</span>
            </button>
          ))}
        </div>
      </div>

      {/* عمود السلة */}
      <div className="cart-col">
        {!cart ? (
          <div className="cart-empty">
            <ShoppingCart size={44} color="var(--faint)" />
            <div style={{ fontWeight: 700 }}>ابدأ طلباً جديداً</div>
            <div className="grid2" style={{ width: '100%' }}>
              {ORDER_TYPES.map(ot => {
                const I = TYPE_ICON[ot.id];
                return <button key={ot.id} className="btn lg" style={{ flexDirection: 'column', gap: 6, padding: '16px 8px' }}
                  onClick={() => ot.id === 'dine_in' ? setTablePick(true) : startOrder(ot.id)}>
                  <I size={22} />{ot.label}</button>;
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="cart-head">
              <div className="cart-title">
                <b>{cart.no}</b>
                <div className="row" style={{ gap: 6 }}>
                  {cart.status && cart.status !== 'open' && <span className="badge b-sky">{ORDER_STATES[cart.status]}</span>}
                  <button className="btn sm gh icon" onClick={() => setCart(null)} title="إغلاق السلة"><X size={15} /></button>
                </div>
              </div>
              <Seg value={cart.type} onChange={(type) => {
                if (type === 'dine_in' && !cart.tableId) { setCart(c => ({ ...c, type })); setTablePick(true); }
                else setCart(c => ({ ...c, type, tableId: type === 'dine_in' ? c.tableId : null, tableName: type === 'dine_in' ? c.tableName : null }));
              }} options={ORDER_TYPES.map(ot => ({ value: ot.id, label: ot.label, icon: React.createElement(TYPE_ICON[ot.id], { size: 14 }) }))} />
              <div className="cart-meta">
                {cart.type === 'dine_in' && <button className="chip" onClick={() => setTablePick(true)}><Grid3x3 size={13} />{cart.tableName || 'اختر طاولة'}</button>}
                {cart.type === 'dine_in' && <span className="chip" onClick={() => { const g = prompt('عدد الضيوف', cart.guests || 2); if (g) setCart(c => ({ ...c, guests: Number(g) || c.guests })); }}><Users size={13} />{cart.guests || 0} ضيف</span>}
                {(cart.type === 'delivery' || cart.type === 'takeaway') && <button className="chip" onClick={() => setCustOpen(true)}><User size={13} />{cart.customer?.name || 'بيانات العميل'}</button>}
              </div>
            </div>

            <div className="cart-lines">
              {cart.lines.length === 0 && <Empty icon={ShoppingCart} title="السلة فارغة" hint="اختر أصنافاً من القائمة" />}
              {cart.lines.map(l => (
                <div key={l.id} className="line">
                  <div className="line-main">
                    <div className="line-name">{l.name}</div>
                    {l.modifiers?.length > 0 && <div className="line-mods">{l.modifiers.map(m => m.name).join('، ')}</div>}
                    {l.note && <div className="line-note">📝 {l.note}</div>}
                    {l.sentAt && <div className="line-sent"><Check size={11} />أُرسل {timeAr(l.sentAt)}</div>}
                    <div className="num" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{money(lineUnit(l))} × {l.qty}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div className="line-price num">{money(lineTotal(l))}</div>
                    {l.sentAt ? (role.canVoid ? <button className="btn sm gh icon" onClick={() => removeLine(l.id)} title="حذف"><Trash2 size={13} /></button> : <span className="badge b-dim">مثبّت</span>)
                      : <Stepper value={l.qty} onDec={() => setQty(l.id, -1)} onInc={() => setQty(l.id, +1)} min={0} />}
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-foot">
              {t && (<>
                <div className="totrow"><span>الإجمالي قبل الخصم</span><span className="v">{money(t.gross)}</span></div>
                {t.discount > 0 && <div className="totrow"><span>الخصم</span><span className="v" style={{ color: 'var(--rose)' }}>-{money(t.discount)}</span></div>}
                {t.service > 0 && <div className="totrow"><span>خدمة {t.serviceRate}%</span><span className="v">{money(t.service)}</span></div>}
                <div className="totrow"><span>الضريبة ({t.vatRate}%)</span><span className="v">{money(t.vat)}</span></div>
                <div className="totrow grand"><span>الإجمالي</span><span className="v">{money(t.total)} {cur}</span></div>
              </>)}
              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {role.canDiscount && <button className="btn sm" onClick={() => setDiscountOpen(true)}><Percent size={13} />خصم</button>}
                <button className="btn sm" disabled={!canSend} onClick={sendKitchen}><ChefHat size={13} />إرسال للمطبخ</button>
                <button className="btn sm" disabled={!cart.lines.length} onClick={holdOrder}><Clock size={13} />تعليق</button>
                {(cart.status && cart.status !== 'open') && role.canVoid && <button className="btn sm danger" onClick={voidOrder}><Ban size={13} />إلغاء</button>}
              </div>
              <button className="btn pri lg block" style={{ marginTop: 10 }} disabled={!cart.lines.length} onClick={doPay}>
                <CreditCard size={18} />الدفع · {t ? money(t.total) : '0.00'} {cur}
              </button>
            </div>
          </>
        )}
      </div>

      {picker && <ModifierPicker item={picker.item} groups={picker.groups} cur={cur}
        onClose={() => setPicker(null)}
        onAdd={(mods, note, qty) => { setCart(c => addItemToOrder(c, picker.item, mods, note, qty)); setPicker(null); }} />}
      {pay && cart && <PaymentModal ctx={ctx} order={cart} onClose={() => setPay(false)} onPaid={onPaid} />}
      {discountOpen && cart && <DiscountModal order={cart} settings={settings} cur={cur}
        onClose={() => setDiscountOpen(false)} onApply={(d) => { setCart(c => ({ ...c, discount: d })); setDiscountOpen(false); }} />}
      {custOpen && cart && <CustomerModal order={cart} onClose={() => setCustOpen(false)}
        onSave={(customer) => { setCart(c => ({ ...c, customer })); setCustOpen(false); }} />}
      {tablePick && <TablePickModal ctx={ctx} onClose={() => setTablePick(false)}
        onPick={(table) => {
          setTablePick(false);
          if (cart) setCart(c => ({ ...c, type: 'dine_in', tableId: table.id, tableName: table.name }));
          else startOrder('dine_in', table);
        }} />}
    </div>
  );
}
