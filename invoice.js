/**
 * الفوترة والطباعة — مستقلّة تماماً:
 *  • تنسيق العملة والأرقام
 *  • رمز ZATCA QR (المرحلة الأولى، ترميز TLV/Base64 — مطابق للنظام المرجعي المُتحقَّق منه)
 *  • باني الإيصال الحراري 80/58مم (فاتورة ضريبية مبسّطة) مع QR
 *  • تذكرة المطبخ (KOT)
 */
import { computeOrder, ORDER_TYPES } from './menu.js';

/* ================= أدوات مساعدة ================= */
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const money = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// رموز العملات المدعومة على منصة فاتورة (عربي + ISO)
export const CURRENCIES = {
  SAR: { ar: 'ر.س', en: 'SAR', name: 'ريال سعودي' },
  QAR: { ar: 'ر.ق', en: 'QAR', name: 'ريال قطري' },
  AED: { ar: 'د.إ', en: 'AED', name: 'درهم إماراتي' },
  KWD: { ar: 'د.ك', en: 'KWD', name: 'دينار كويتي' },
  BHD: { ar: 'د.ب', en: 'BHD', name: 'دينار بحريني' },
  OMR: { ar: 'ر.ع', en: 'OMR', name: 'ريال عُماني' },
  USD: { ar: '$', en: 'USD', name: 'دولار أمريكي' },
  EUR: { ar: '€', en: 'EUR', name: 'يورو' }
};
export const curAr = (code) => (CURRENCIES[code] || { ar: code }).ar;
export const curName = (code) => (CURRENCIES[code] || { name: code }).name;

/* ================= رمز QR (يبني مصفوفة QR منطقية — بلا اعتماد على مكتبة خارجية) ================= */
const _QR_ECC_CW = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
];
const _QR_ECC_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];
function _qrMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
function _qrDivisor(degree) {
  const result = []; for (let i = 0; i < degree - 1; i++) result.push(0); result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) { result[j] = _qrMul(result[j], root); if (j + 1 < result.length) result[j] ^= result[j + 1]; }
    root = _qrMul(root, 0x02);
  }
  return result;
}
function _qrRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) { const factor = b ^ result.shift(); result.push(0); divisor.forEach((coef, i) => { result[i] ^= _qrMul(coef, factor); }); }
  return result;
}
function _qrRawModules(ver) { let r = (16 * ver + 128) * ver + 64; if (ver >= 2) { const na = Math.floor(ver / 7) + 2; r -= (25 * na - 10) * na - 55; if (ver >= 7) r -= 36; } return r; }
function _qrDataCodewords(ver, ecl) { return Math.floor(_qrRawModules(ver) / 8) - _QR_ECC_CW[ecl][ver] * _QR_ECC_BLOCKS[ecl][ver]; }
function _qrAlign(ver) {
  if (ver === 1) return [];
  const num = Math.floor(ver / 7) + 2;
  const step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (num * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < num; pos -= step) result.splice(1, 0, pos);
  return result;
}
// يبني مصفوفة رمز QR منطقية (true=خانة داكنة). ecl: 0=L,1=M,2=Q,3=H
export function qrMatrix(text, ecl) {
  if (ecl == null) ecl = 1;
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  for (; version <= 40; version++) {
    const cap = _qrDataCodewords(version, ecl); const ccBits = version <= 9 ? 8 : 16;
    if (Math.ceil((4 + ccBits + bytes.length * 8) / 8) <= cap) break;
  }
  if (version > 40) throw new Error('QR: data too long');
  const bb = [];
  const append = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
  append(0x4, 4); append(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) append(b, 8);
  const dataCap = _qrDataCodewords(version, ecl) * 8;
  append(0, Math.min(4, dataCap - bb.length));
  while (bb.length % 8 !== 0) bb.push(0);
  for (let pad = 0xEC; bb.length < dataCap; pad ^= 0xEC ^ 0x11) append(pad, 8);
  const dataCodewords = [];
  for (let i = 0; i < bb.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bb[i + j]; dataCodewords.push(b); }
  const numBlocks = _QR_ECC_BLOCKS[ecl][version], eccLen = _QR_ECC_CW[ecl][version];
  const rawCodewords = Math.floor(_qrRawModules(version) / 8);
  const numShort = numBlocks - rawCodewords % numBlocks, shortLen = Math.floor(rawCodewords / numBlocks);
  const blocks = [], divisor = _qrDivisor(eccLen); let k = 0;
  for (let i = 0; i < numBlocks; i++) { const datLen = shortLen - eccLen + (i < numShort ? 0 : 1); const dat = dataCodewords.slice(k, k + datLen); k += datLen; blocks.push({ dat, ecc: _qrRemainder(dat, divisor) }); }
  const allCodewords = []; const maxDat = shortLen - eccLen + 1;
  for (let i = 0; i < maxDat; i++) for (let j = 0; j < numBlocks; j++) { if (i < blocks[j].dat.length) allCodewords.push(blocks[j].dat[i]); }
  for (let i = 0; i < eccLen; i++) for (let j = 0; j < numBlocks; j++) allCodewords.push(blocks[j].ecc[i]);
  const size = version * 4 + 17;
  const modules = [], isFunction = [];
  for (let i = 0; i < size; i++) { modules.push(new Array(size).fill(false)); isFunction.push(new Array(size).fill(false)); }
  const setFunc = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };
  const drawFinder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunc(xx, yy, dist !== 2 && dist !== 4); } };
  drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
  for (let i = 0; i < size; i++) { if (!isFunction[6][i]) setFunc(i, 6, i % 2 === 0); if (!isFunction[i][6]) setFunc(6, i, i % 2 === 0); }
  const ap = _qrAlign(version);
  for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
    const cx = ap[i], cy = ap[j];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFunc(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  for (let i = 0; i < 9; i++) { isFunction[i][8] = true; isFunction[8][i] = true; }
  for (let i = 0; i < 8; i++) { isFunction[8][size - 1 - i] = true; isFunction[size - 1 - i][8] = true; }
  setFunc(8, size - 8, true);
  if (version >= 7) for (let i = 0; i < 18; i++) { const a = size - 11 + i % 3, b = Math.floor(i / 3); isFunction[b][a] = true; isFunction[a][b] = true; }
  const dataBits = [];
  for (const cw of allCodewords) for (let i = 7; i >= 0; i--) dataBits.push((cw >>> i) & 1);
  let bitIdx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let jj = 0; jj < 2; jj++) {
      const x = right - jj, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!isFunction[y][x] && bitIdx < dataBits.length) { modules[y][x] = dataBits[bitIdx] === 1; bitIdx++; }
    }
  }
  const applyMask = (mask, grid) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let inv = false;
      switch (mask) {
        case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break; case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
        case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
        case 7: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
      }
      if (inv) grid[y][x] = !grid[y][x];
    }
  };
  const drawFormat = (mask, grid) => {
    const eccFmt = [1, 0, 3, 2][ecl]; const data = (eccFmt << 3) | mask;
    let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) grid[i][8] = ((bits >>> i) & 1) !== 0;
    grid[7][8] = ((bits >>> 6) & 1) !== 0; grid[8][8] = ((bits >>> 7) & 1) !== 0; grid[8][7] = ((bits >>> 8) & 1) !== 0;
    for (let i = 9; i < 15; i++) grid[8][14 - i] = ((bits >>> i) & 1) !== 0;
    for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = ((bits >>> i) & 1) !== 0;
    for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = ((bits >>> i) & 1) !== 0;
    grid[size - 8][8] = true;
  };
  const drawVersion = (grid) => {
    if (version < 7) return;
    let rem = version; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) { const bit = ((bits >>> i) & 1) !== 0, a = Math.floor(i / 3), b = size - 11 + i % 3; grid[a][b] = bit; grid[b][a] = bit; }
  };
  const penalty = (grid) => {
    let p = 0;
    for (let y = 0; y < size; y++) { let run = 1; for (let x = 1; x < size; x++) { if (grid[y][x] === grid[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let x = 0; x < size; x++) { let run = 1; for (let y = 1; y < size; y++) { if (grid[y][x] === grid[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (grid[y][x] === grid[y][x + 1] && grid[y][x] === grid[y + 1][x] && grid[y][x] === grid[y + 1][x + 1]) p += 3;
    let dark = 0; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (grid[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return p;
  };
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) { const grid = modules.map(r => r.slice()); applyMask(mask, grid); drawFormat(mask, grid); drawVersion(grid); const p = penalty(grid); if (p < bestP) { bestP = p; best = grid; } }
  return best;
}
function _qrB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }

/* رمز زاتكا للمرحلة الأولى: TLV (وسم-طول-قيمة) بترميز Base64 — 5 حقول إلزامية */
export function zatcaTLV(seller, vatNo, tsISO, total, vatAmount) {
  const enc = new TextEncoder();
  const tlv = (tag, valStr) => { const v = enc.encode(String(valStr == null ? '' : valStr)); const out = new Uint8Array(2 + v.length); out[0] = tag; out[1] = v.length; out.set(v, 2); return out; };
  const parts = [tlv(1, seller), tlv(2, vatNo), tlv(3, tsISO), tlv(4, Number(total || 0).toFixed(2)), tlv(5, Number(vatAmount || 0).toFixed(2))];
  let len = 0; parts.forEach(p => len += p.length);
  const buf = new Uint8Array(len); let off = 0; parts.forEach(p => { buf.set(p, off); off += p.length; });
  return _qrB64(buf);
}

/* يحوّل نصًّا إلى رمز QR كصورة SVG (سلسلة) — للمعاينة الحية وللطباعة */
export function qrSvg(text, opts) {
  opts = opts || {};
  const ecl = opts.ecl != null ? opts.ecl : 1, quiet = opts.quiet != null ? opts.quiet : 4, px = opts.px || 220;
  let mat; try { mat = qrMatrix(text, ecl); } catch (e) { return ''; }
  const n = mat.length, total = n + quiet * 2, dark = opts.dark || '#111', light = opts.light || '#fff';
  let rects = '';
  for (let y = 0; y < n; y++) { let x = 0; while (x < n) { if (mat[y][x]) { let w = 1; while (x + w < n && mat[y][x + w]) w++; rects += `<rect x="${x + quiet}" y="${y + quiet}" width="${w}" height="1"/>`; x += w; } else x++; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`;
}

/* هل نُصدر رمز ZATCA؟ (بائع سعودي مسجَّل ضريبياً بنسبة ضريبة فعّالة) */
export const emitsZatca = (settings) => !!(settings && Number(settings.vatRate) > 0 && (settings.vatNo || '').trim());

/* رمز ZATCA لفاتورة بيع مبسّطة → SVG جاهز للطباعة/العرض (سلسلة فارغة إن لم يكن مطبَّقاً) */
export function zatcaQrSvg(order, settings, opts) {
  if (!emitsZatca(settings)) return '';
  const t = computeOrder(order, settings);
  const seller = (settings.name || '').trim() || 'المطعم';
  const payload = zatcaTLV(seller, settings.vatNo || '', order.closedAt || order.createdAt || new Date().toISOString(), t.total, t.vat);
  return qrSvg(payload, opts);
}

/* ================= الإيصال الحراري (فاتورة ضريبية مبسّطة) ================= */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function receiptHTML(order, settings, opts = {}) {
  const size = opts.size === '58' ? '58' : '80';
  const PG = size === '58' ? 58 : 80, W = size === '58' ? 48 : 74;
  const t = computeOrder(order, settings);
  const cur = curAr(settings.currency || 'SAR');
  const m = (n) => money(n);
  const ts = order.closedAt || order.createdAt || new Date().toISOString();
  const dt = (() => { try { return new Date(ts).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ts; } })();
  const typeLabel = (ORDER_TYPES.find(x => x.id === order.type) || {}).label || order.type || '';
  const qr = zatcaQrSvg(order, settings, { px: 128, dark: '#000', light: '#fff' });

  const rowsHtml = (order.lines || []).map(l => {
    const mods = (l.modifiers || []).map(mo => mo.name + (mo.price ? ` (+${m(mo.price)})` : '')).join('، ');
    const note = l.note ? `<div class="ln-note">— ${esc(l.note)}</div>` : '';
    const modsHtml = mods ? `<div class="ln-mods">${esc(mods)}</div>` : '';
    const unit = round2((l.unitPrice || 0) + (l.modifiers || []).reduce((s, mo) => s + (Number(mo.price) || 0), 0));
    return `<tr class="ln">
      <td class="ln-q">${l.qty}×</td>
      <td class="ln-n">${esc(l.name)}${modsHtml}${note}</td>
      <td class="ln-p">${m(unit * l.qty)}</td>
    </tr>`;
  }).join('');

  const payRows = (order.payments || []).map(p => {
    const label = p.method === 'cash' ? 'نقداً' : p.method === 'card' ? 'شبكة (مدى/بطاقة)' : p.method === 'fatora' ? 'فاتورة (دفع إلكتروني)' : (p.label || p.method);
    const refTxt = p.ref ? ` · ${esc(String(p.ref))}` : '';
    return `<tr><td>${label}${refTxt}</td><td class="v">${m(p.amount)}</td></tr>`;
  }).join('');
  const paid = (order.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const change = Math.max(0, round2(paid - t.total));

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>فاتورة ${esc(order.no || '')}</title><style>
  @page{size:${PG}mm auto;margin:3mm}
  *{box-sizing:border-box}
  body{font-family:'IBM Plex Sans Arabic',Tahoma,'Segoe UI',sans-serif;width:${W}mm;margin:0 auto;color:#000;font-size:11.5px;line-height:1.5}
  h1{font-size:15px;text-align:center;margin:0 0 2px}
  .c{text-align:center}
  .dim{color:#333;font-size:9.5px}
  .sep{border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:1.5px 0;vertical-align:top}
  td.v{text-align:left;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
  .items td{padding:3px 0;border-bottom:1px dotted #bbb}
  .ln-q{width:26px;font-family:'IBM Plex Mono',monospace}
  .ln-p{text-align:left;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
  .ln-mods,.ln-note{font-size:9px;color:#444}
  .tot td{padding:2px 0}
  .grand{font-weight:800;font-size:14px;border-top:1px solid #000;border-bottom:2.5px double #000;padding:4px 0}
  .badge{display:inline-block;border:1px solid #000;border-radius:4px;padding:1px 7px;font-weight:700;font-size:11px;margin-top:3px}
  .qr{text-align:center;margin-top:8px}
  .foot{text-align:center;font-size:10px;margin-top:8px}
  </style></head><body>
  ${settings.logoUrl ? `<div class="c"><img src="${esc(settings.logoUrl)}" style="max-height:44px"></div>` : ''}
  <h1>${esc(settings.name || 'المطعم')}</h1>
  ${settings.nameEn ? `<div class="c dim">${esc(settings.nameEn)}</div>` : ''}
  <div class="c dim">فاتورة ضريبية مبسّطة</div>
  ${settings.vatNo ? `<div class="c dim">الرقم الضريبي: ${esc(settings.vatNo)}</div>` : ''}
  ${settings.crNo ? `<div class="c dim">س.ت: ${esc(settings.crNo)}</div>` : ''}
  ${settings.address ? `<div class="c dim">${esc(settings.address)}</div>` : ''}
  ${settings.phone ? `<div class="c dim">${esc(settings.phone)}</div>` : ''}
  <div class="c"><span class="badge">${esc(typeLabel)}${order.tableName ? ' · ' + esc(order.tableName) : ''}</span></div>
  <div class="sep"></div>
  <table>
    <tr><td>فاتورة رقم</td><td class="v">${esc(order.no || '')}</td></tr>
    <tr><td>التاريخ</td><td class="v">${dt}</td></tr>
    ${order.cashierName ? `<tr><td>الكاشير</td><td class="v">${esc(order.cashierName)}</td></tr>` : ''}
    ${order.type === 'dine_in' && order.guests ? `<tr><td>عدد الضيوف</td><td class="v">${order.guests}</td></tr>` : ''}
    ${order.customer && order.customer.name ? `<tr><td>العميل</td><td class="v">${esc(order.customer.name)}</td></tr>` : ''}
    ${order.customer && order.customer.phone ? `<tr><td>الجوال</td><td class="v">${esc(order.customer.phone)}</td></tr>` : ''}
  </table>
  <div class="sep"></div>
  <table class="items">${rowsHtml}</table>
  <table class="tot" style="margin-top:6px">
    <tr><td>الإجمالي قبل الخصم</td><td class="v">${m(t.gross)}</td></tr>
    ${t.discount > 0 ? `<tr><td>الخصم${order.discount && order.discount.reason ? ' (' + esc(order.discount.reason) + ')' : ''}</td><td class="v">-${m(t.discount)}</td></tr>` : ''}
    ${t.service > 0 ? `<tr><td>خدمة (${settings.serviceRate || 0}%)</td><td class="v">${m(t.service)}</td></tr>` : ''}
    <tr><td>الصافي قبل الضريبة</td><td class="v">${m(t.net)}</td></tr>
    <tr><td>ضريبة القيمة المضافة (${t.vatRate}%)</td><td class="v">${m(t.vat)}</td></tr>
    <tr class="grand"><td>الإجمالي (شامل الضريبة)</td><td class="v">${m(t.total)} ${cur}</td></tr>
  </table>
  ${payRows ? `<div class="sep"></div><table>${payRows}${change > 0 ? `<tr><td>المتبقّي للعميل</td><td class="v">${m(change)}</td></tr>` : ''}</table>` : ''}
  ${qr ? `<div class="qr">${qr}</div>` : ''}
  <div class="foot">${esc(settings.footerNote || 'شكراً لزيارتكم — نتشرّف بخدمتكم')}</div>
  <div class="c dim" style="margin-top:6px">${new Date().toLocaleString('ar-SA-u-nu-latn')}</div>
  </body></html>`;
  return html;
}

export function printReceipt(order, settings, size) {
  const html = receiptHTML(order, settings, { size });
  const w = window.open('', '_blank', 'width=420,height=760');
  if (!w) return false;
  w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
  return true;
}

/* ================= تذكرة المطبخ (KOT) — بلا أسعار، للمحطّة ================= */
export function kitchenTicketHTML(order, lines, opts = {}) {
  const size = opts.size === '58' ? '58' : '80';
  const PG = size === '58' ? 58 : 80, W = size === '58' ? 48 : 74;
  const typeLabel = (ORDER_TYPES.find(x => x.id === order.type) || {}).label || order.type || '';
  const rows = (lines || []).map(l => {
    const mods = (l.modifiers || []).map(mo => mo.name).join('، ');
    const note = l.note ? `<div class="k-note">⚠ ${esc(l.note)}</div>` : '';
    const modsHtml = mods ? `<div class="k-mods">${esc(mods)}</div>` : '';
    return `<div class="k-ln"><span class="k-q">${l.qty}×</span><span class="k-n">${esc(l.name)}${modsHtml}${note}</span></div>`;
  }).join('');
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>مطبخ ${esc(order.no || '')}</title><style>
  @page{size:${PG}mm auto;margin:3mm}
  body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;width:${W}mm;margin:0 auto;color:#000}
  h1{font-size:16px;text-align:center;margin:0}
  .hd{text-align:center;font-weight:700;font-size:13px;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:6px}
  .k-ln{display:flex;gap:6px;padding:5px 0;border-bottom:1px dashed #000;font-size:15px;font-weight:700}
  .k-q{font-family:'IBM Plex Mono',monospace}
  .k-mods{font-size:12px;font-weight:400}
  .k-note{font-size:12px;font-weight:700}
  .ft{text-align:center;font-size:11px;margin-top:8px}
  </style></head><body>
  <h1>تذكرة مطبخ</h1>
  <div class="hd">${esc(order.no || '')} · ${esc(typeLabel)}${order.tableName ? ' · ' + esc(order.tableName) : ''}</div>
  ${rows}
  <div class="ft">${(() => { try { return new Date().toLocaleTimeString('ar-SA-u-nu-latn'); } catch { return ''; } })()}</div>
  </body></html>`;
}

export function printKitchen(order, lines, size) {
  const html = kitchenTicketHTML(order, lines, { size });
  const w = window.open('', '_blank', 'width=360,height=640');
  if (!w) return false;
  w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 350);
  return true;
}
