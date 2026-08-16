/**
 * نموذج المجال لنقطة البيع + البيانات التأسيسية.
 * وحدة نقيّة (بلا React) — تحسب مجاميع الطلب والضريبة، وتُنشئ الطلبات، وتوفّر قائمة تجريبية جاهزة.
 *
 * سياسة التسعير: أسعار الأصناف شاملة ضريبة القيمة المضافة (الأسلوب الشائع في فواتير التجزئة).
 *   الإجمالي (شامل) = (مجموع البنود − الخصم) + الخدمة
 *   الضريبة = الإجمالي × النسبة ÷ (100 + النسبة)   ← استخلاص الضريبة من مبلغ شامل
 *   الصافي  = الإجمالي − الضريبة
 */

export const uid = (p) => (p || 'id') + '-' + Math.random().toString(36).slice(2, 9);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* أنواع الطلب */
export const ORDER_TYPES = [
  { id: 'dine_in', label: 'صالة', icon: 'Utensils', needsTable: true },
  { id: 'takeaway', label: 'سفري', icon: 'ShoppingBag', needsTable: false },
  { id: 'delivery', label: 'توصيل', icon: 'Bike', needsCustomer: true }
];

/* حالات الطلب (آلة الحالة) */
export const ORDER_STATES = {
  open: 'مفتوح',       // قيد الإنشاء على الكاشير
  held: 'معلّق',       // محفوظ جانباً (parked)
  sent: 'في المطبخ',   // أُرسل للتحضير (KOT مطبوع)
  ready: 'جاهز',       // انتهى المطبخ
  paid: 'مدفوع',       // أُغلق وسُدّد
  void: 'ملغى',        // أُلغي
  refunded: 'مُرجَع'   // استُرجع مبلغه
};

/* محطّات المطبخ (توجيه التذاكر) */
export const STATIONS = {
  grill: 'المشاوي',
  kitchen: 'المطبخ الساخن',
  cold: 'البارد/المقبلات',
  bar: 'المشروبات',
  dessert: 'الحلويات'
};

/* ================= حساب البند والطلب ================= */
export const modsTotal = (line) => (line.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
export const lineUnit = (line) => r2((Number(line.unitPrice) || 0) + modsTotal(line));
export const lineTotal = (line) => r2(lineUnit(line) * (Number(line.qty) || 0));

/**
 * يحسب كل مجاميع الطلب اعتماداً على الإعدادات (نسبة الضريبة والخدمة والعملة).
 * يعيد كائناً بكل القيم المشتقّة — لا يعدّل الطلب.
 */
export function computeOrder(order, settings = {}) {
  const vatRate = Number(settings.vatRate != null ? settings.vatRate : 15) || 0;
  const serviceRate = Number(settings.serviceRate || 0) || 0;
  const lines = (order && order.lines) || [];
  const count = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const gross = r2(lines.reduce((s, l) => s + lineTotal(l), 0));

  // الخصم: نسبة مئوية أو مبلغ ثابت
  const d = (order && order.discount) || null;
  let discount = 0;
  if (d && d.value > 0) discount = d.type === 'pct' ? r2(gross * (Math.min(100, d.value) / 100)) : r2(Math.min(gross, d.value));
  const afterDiscount = r2(gross - discount);

  // الخدمة: تُطبَّق على طلبات الصالة افتراضياً، أو على الكل إذا فُعّل ذلك
  const serviceApplies = serviceRate > 0 && (settings.serviceAllTypes || (order && order.type === 'dine_in'));
  const service = serviceApplies ? r2(afterDiscount * (serviceRate / 100)) : 0;

  const total = r2(afterDiscount + service);                 // شامل الضريبة
  const vat = vatRate > 0 ? r2(total * vatRate / (100 + vatRate)) : 0; // استخلاص من مبلغ شامل
  const net = r2(total - vat);

  return { count, gross, discount, afterDiscount, service, serviceRate, net, vat, vatRate, total };
}

/* مجموع ما دُفع على الطلب والمتبقّي */
export const paidTotal = (order) => r2(((order && order.payments) || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
export const balanceDue = (order, settings) => r2(computeOrder(order, settings).total - paidTotal(order));

/* مصنع الطلبات */
export function newOrder({ type = 'dine_in', table = null, cashier = null, shiftId = null, seq = 1 } = {}) {
  const now = new Date().toISOString();
  return {
    id: uid('ord'),
    no: 'INV-' + String(seq).padStart(5, '0'),
    seq,
    type,
    tableId: table ? table.id : null,
    tableName: table ? table.name : null,
    guests: type === 'dine_in' ? 2 : null,
    status: 'open',
    lines: [],
    discount: null,               // {type:'pct'|'amt', value, reason}
    customer: null,               // {name, phone, address}
    deliveryApp: null,            // اسم تطبيق التوصيل إن وُجد
    payments: [],                 // [{method, amount, ref, at, fatora?}]
    cashierId: cashier ? cashier.id : null,
    cashierName: cashier ? cashier.name : null,
    shiftId,
    createdAt: now,
    sentAt: null,
    closedAt: null,
    voidReason: null
  };
}

/* إضافة صنف للطلب (يدمج المطابق تماماً في بند واحد، وإلا يضيف بنداً) */
export function addItemToOrder(order, item, modifiers = [], note = '', qty = 1) {
  const lines = (order.lines || []).map(l => ({ ...l }));
  const add = Math.max(1, Number(qty) || 1);
  const modKey = (mods) => (mods || []).map(m => m.id || m.name).sort().join('|');
  const key = item.id + '::' + modKey(modifiers) + '::' + (note || '');
  const existing = lines.find(l => !l.sentAt && (l.itemId + '::' + modKey(l.modifiers) + '::' + (l.note || '')) === key);
  if (existing) {
    existing.qty += add;
  } else {
    lines.push({
      id: uid('ln'),
      itemId: item.id,
      name: item.name,
      unitPrice: Number(item.price) || 0,
      qty: add,
      modifiers: modifiers.map(m => ({ id: m.id, name: m.name, price: Number(m.price) || 0 })),
      note: note || '',
      station: item.station || 'kitchen',
      sentAt: null
    });
  }
  return { ...order, lines };
}

/* ================= البيانات التأسيسية ================= */
export const SEED_SETTINGS = {
  name: 'مطعم الطيّب',
  nameEn: 'Al-Tayeb Restaurant',
  vatNo: '300000000000003',
  crNo: '1010101010',
  address: 'حي الياسمين، الرياض',
  phone: '+966 55 000 0000',
  logoUrl: '',
  currency: 'SAR',
  vatRate: 15,             // نسبة ضريبة القيمة المضافة
  serviceRate: 0,          // نسبة رسوم الخدمة (0 = بلا خدمة)
  serviceAllTypes: false,  // تطبيق الخدمة على كل الأنواع لا الصالة فقط
  footerNote: 'شكراً لزيارتكم — نتشرّف بخدمتكم دائماً',
  receiptSize: '80',       // مقاس الطابعة الحرارية 80/58مم
  autoKitchenPrint: true,  // طباعة تذكرة المطبخ عند الإرسال
  // إعداد منصة فاتورة (المفتاح لا يُخزَّن هنا — يُضبط في خادم .env)
  fatora: {
    enabled: false,
    currency: '',          // فارغ = استخدم عملة المطعم
    language: 'ar',
    mode: 'redirect'       // redirect = تحويل الجهاز لصفحة الدفع، link = رابط/QR للعميل
  }
};

const g = (id) => ({ grill: 'grill', kitchen: 'kitchen', cold: 'cold', bar: 'bar', dessert: 'dessert' }[id] || 'kitchen');

export const SEED_MODIFIER_GROUPS = [
  { id: 'size', name: 'الحجم', min: 1, max: 1, required: true, options: [
    { id: 'sz-s', name: 'صغير', price: 0 }, { id: 'sz-m', name: 'وسط', price: 5 }, { id: 'sz-l', name: 'كبير', price: 10 }
  ] },
  { id: 'bread', name: 'نوع الخبز', min: 1, max: 1, required: true, options: [
    { id: 'br-1', name: 'صمون', price: 0 }, { id: 'br-2', name: 'تنور', price: 0 }, { id: 'br-3', name: 'بريوش', price: 3 }
  ] },
  { id: 'spice', name: 'مستوى الحرّة', min: 0, max: 1, required: false, options: [
    { id: 'sp-0', name: 'عادي', price: 0 }, { id: 'sp-1', name: 'حار', price: 0 }, { id: 'sp-2', name: 'حار جداً', price: 0 }
  ] },
  { id: 'addons', name: 'إضافات', min: 0, max: 5, required: false, options: [
    { id: 'ad-cheese', name: 'جبن إضافي', price: 4 }, { id: 'ad-cheddar', name: 'شيدر', price: 4 },
    { id: 'ad-mushroom', name: 'مشروم', price: 5 }, { id: 'ad-egg', name: 'بيض', price: 3 },
    { id: 'ad-bacon', name: 'لحم مقدد', price: 6 }, { id: 'ad-avocado', name: 'أفوكادو', price: 6 }
  ] },
  { id: 'sauce', name: 'الصوصات', min: 0, max: 3, required: false, options: [
    { id: 'sc-garlic', name: 'ثومية', price: 0 }, { id: 'sc-bbq', name: 'باربكيو', price: 0 },
    { id: 'sc-ranch', name: 'رانش', price: 2 }, { id: 'sc-spicy', name: 'حار', price: 0 }
  ] }
];

export const SEED_CATEGORIES = [
  { id: 'cat-grill', name: 'المشاوي', color: '#C0392B', emoji: '🍖', sort: 1 },
  { id: 'cat-burger', name: 'برجر وساندويتش', color: '#B9770E', emoji: '🍔', sort: 2 },
  { id: 'cat-pizza', name: 'بيتزا', color: '#CB4335', emoji: '🍕', sort: 3 },
  { id: 'cat-app', name: 'مقبلات', color: '#1E8449', emoji: '🥗', sort: 4 },
  { id: 'cat-drink', name: 'مشروبات', color: '#2471A3', emoji: '🥤', sort: 5 },
  { id: 'cat-dessert', name: 'حلويات', color: '#8E44AD', emoji: '🍰', sort: 6 },
  { id: 'cat-combo', name: 'عروض ووجبات', color: '#D4AC0D', emoji: '🍱', sort: 7 }
];

export const SEED_ITEMS = [
  // المشاوي
  { id: 'it-1', catId: 'cat-grill', name: 'مشاوي مشكّل', nameEn: 'Mixed Grill', price: 65, emoji: '🍢', station: g('grill'), modifiers: ['bread', 'spice', 'sauce'], available: true, sort: 1 },
  { id: 'it-2', catId: 'cat-grill', name: 'كباب لحم', nameEn: 'Meat Kebab', price: 45, emoji: '🥩', station: g('grill'), modifiers: ['bread', 'spice'], available: true, sort: 2 },
  { id: 'it-3', catId: 'cat-grill', name: 'شيش طاووق', nameEn: 'Shish Tawook', price: 40, emoji: '🍗', station: g('grill'), modifiers: ['bread', 'sauce'], available: true, sort: 3 },
  { id: 'it-4', catId: 'cat-grill', name: 'ريش غنم', nameEn: 'Lamb Chops', price: 75, emoji: '🍖', station: g('grill'), modifiers: ['spice'], available: true, sort: 4 },
  // برجر
  { id: 'it-5', catId: 'cat-burger', name: 'برجر لحم كلاسيك', nameEn: 'Classic Beef Burger', price: 32, emoji: '🍔', station: g('grill'), modifiers: ['bread', 'addons', 'sauce', 'spice'], available: true, sort: 1 },
  { id: 'it-6', catId: 'cat-burger', name: 'برجر دجاج مقرمش', nameEn: 'Crispy Chicken Burger', price: 30, emoji: '🍔', station: g('grill'), modifiers: ['bread', 'addons', 'sauce'], available: true, sort: 2 },
  { id: 'it-7', catId: 'cat-burger', name: 'برجر دبل تشيز', nameEn: 'Double Cheese Burger', price: 42, emoji: '🍔', station: g('grill'), modifiers: ['addons', 'sauce', 'spice'], available: true, sort: 3 },
  { id: 'it-8', catId: 'cat-burger', name: 'شاورما عربي', nameEn: 'Arabic Shawarma', price: 22, emoji: '🌯', station: g('kitchen'), modifiers: ['bread', 'sauce', 'spice'], available: true, sort: 4 },
  // بيتزا
  { id: 'it-9', catId: 'cat-pizza', name: 'بيتزا مارغريتا', nameEn: 'Margherita', price: 38, emoji: '🍕', station: g('kitchen'), modifiers: ['size', 'addons'], available: true, sort: 1 },
  { id: 'it-10', catId: 'cat-pizza', name: 'بيتزا بيبروني', nameEn: 'Pepperoni', price: 46, emoji: '🍕', station: g('kitchen'), modifiers: ['size', 'addons'], available: true, sort: 2 },
  { id: 'it-11', catId: 'cat-pizza', name: 'بيتزا خضار', nameEn: 'Veggie', price: 42, emoji: '🍕', station: g('kitchen'), modifiers: ['size', 'addons'], available: true, sort: 3 },
  // مقبلات
  { id: 'it-12', catId: 'cat-app', name: 'بطاطس مقلية', nameEn: 'French Fries', price: 14, emoji: '🍟', station: g('kitchen'), modifiers: ['sauce'], available: true, sort: 1 },
  { id: 'it-13', catId: 'cat-app', name: 'حمّص', nameEn: 'Hummus', price: 16, emoji: '🥣', station: g('cold'), modifiers: [], available: true, sort: 2 },
  { id: 'it-14', catId: 'cat-app', name: 'سلطة فتوش', nameEn: 'Fattoush', price: 18, emoji: '🥗', station: g('cold'), modifiers: [], available: true, sort: 3 },
  { id: 'it-15', catId: 'cat-app', name: 'موزاريلا ستيكس', nameEn: 'Mozzarella Sticks', price: 24, emoji: '🧀', station: g('kitchen'), modifiers: ['sauce'], available: true, sort: 4 },
  // مشروبات
  { id: 'it-16', catId: 'cat-drink', name: 'مشروب غازي', nameEn: 'Soft Drink', price: 6, emoji: '🥤', station: g('bar'), modifiers: ['size'], available: true, sort: 1 },
  { id: 'it-17', catId: 'cat-drink', name: 'عصير طازج', nameEn: 'Fresh Juice', price: 14, emoji: '🧃', station: g('bar'), modifiers: ['size'], available: true, sort: 2 },
  { id: 'it-18', catId: 'cat-drink', name: 'ماء', nameEn: 'Water', price: 2, emoji: '💧', station: g('bar'), modifiers: [], available: true, sort: 3 },
  { id: 'it-19', catId: 'cat-drink', name: 'قهوة عربية', nameEn: 'Arabic Coffee', price: 12, emoji: '☕', station: g('bar'), modifiers: [], available: true, sort: 4 },
  // حلويات
  { id: 'it-20', catId: 'cat-dessert', name: 'كنافة', nameEn: 'Kunafa', price: 22, emoji: '🍮', station: g('dessert'), modifiers: [], available: true, sort: 1 },
  { id: 'it-21', catId: 'cat-dessert', name: 'تشيز كيك', nameEn: 'Cheesecake', price: 24, emoji: '🍰', station: g('dessert'), modifiers: [], available: true, sort: 2 },
  { id: 'it-22', catId: 'cat-dessert', name: 'آيس كريم', nameEn: 'Ice Cream', price: 16, emoji: '🍨', station: g('dessert'), modifiers: ['size'], available: true, sort: 3 },
  // عروض
  { id: 'it-23', catId: 'cat-combo', name: 'وجبة برجر كاملة', nameEn: 'Burger Combo', price: 45, emoji: '🍱', station: g('grill'), modifiers: ['addons', 'sauce'], available: true, sort: 1 },
  { id: 'it-24', catId: 'cat-combo', name: 'وجبة عائلية مشاوي', nameEn: 'Family Grill', price: 180, emoji: '🍱', station: g('grill'), modifiers: ['spice'], available: true, sort: 2 }
];

export const SEED_TABLES = [
  { id: 'tb-1', name: 'طاولة 1', zone: 'صالة داخلية', seats: 4 },
  { id: 'tb-2', name: 'طاولة 2', zone: 'صالة داخلية', seats: 4 },
  { id: 'tb-3', name: 'طاولة 3', zone: 'صالة داخلية', seats: 2 },
  { id: 'tb-4', name: 'طاولة 4', zone: 'صالة داخلية', seats: 6 },
  { id: 'tb-5', name: 'طاولة 5', zone: 'صالة داخلية', seats: 2 },
  { id: 'tb-6', name: 'طاولة 6', zone: 'صالة داخلية', seats: 4 },
  { id: 'tb-7', name: 'تراس 1', zone: 'التراس', seats: 4 },
  { id: 'tb-8', name: 'تراس 2', zone: 'التراس', seats: 4 },
  { id: 'tb-9', name: 'تراس 3', zone: 'التراس', seats: 8 },
  { id: 'tb-10', name: 'عائلات 1', zone: 'قسم العائلات', seats: 6 },
  { id: 'tb-11', name: 'عائلات 2', zone: 'قسم العائلات', seats: 6 },
  { id: 'tb-12', name: 'عائلات 3', zone: 'قسم العائلات', seats: 4 }
];

export const ROLES = {
  admin: { label: 'مدير النظام', canSell: true, canDiscount: true, canVoid: true, canRefund: true, canReports: true, canAdmin: true, canShift: true },
  manager: { label: 'مدير وردية', canSell: true, canDiscount: true, canVoid: true, canRefund: true, canReports: true, canAdmin: false, canShift: true },
  cashier: { label: 'كاشير', canSell: true, canDiscount: false, canVoid: false, canRefund: false, canReports: false, canAdmin: false, canShift: true }
};

export const SEED_USERS = [
  { id: 'u-admin', name: 'المدير', role: 'admin', pin: '1234', active: true },
  { id: 'u-cashier', name: 'الكاشير', role: 'cashier', pin: '1111', active: true }
];

/* حزمة تأسيسية كاملة (تُكتب عند أول تشغيل) */
export const seedBundle = () => ({
  settings: JSON.parse(JSON.stringify(SEED_SETTINGS)),
  menu: { categories: JSON.parse(JSON.stringify(SEED_CATEGORIES)), items: JSON.parse(JSON.stringify(SEED_ITEMS)), modifierGroups: JSON.parse(JSON.stringify(SEED_MODIFIER_GROUPS)) },
  tables: JSON.parse(JSON.stringify(SEED_TABLES)),
  users: JSON.parse(JSON.stringify(SEED_USERS))
});
