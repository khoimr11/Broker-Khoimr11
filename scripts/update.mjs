// Xanh Tím — cập nhật dữ liệu toàn thị trường (HOSE, HNX, UPCoM) mỗi ngày.
// Chạy trên GitHub Actions: node scripts/update.mjs
// Đầu ra: data/hist/<MÃ>.json, data/screen_<SÀN>.json, data/market.json, data/recs.json, data/meta.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { earnSeries, loadModels, loadRecs, loadStatements, quarterEnds, shape, analyzeFundamentals, fullStatements } from './fund.mjs';
const require = createRequire(import.meta.url);
const XT = require('./engine.cjs');

const OUT = path.resolve('data');
const LOCAL = process.env.LOCAL_HIST || ''; // thư mục json để chạy thử không cần mạng
const DAYS = 1900; // ~5 năm cho định giá lịch sử và kiểm định
const ANALYSE = 1300; // số phiên dùng để phân tích
const FROM = 946684800; // 2000-01-01: lấy toàn bộ lịch sử từ khi niêm yết
const ARCH_END = '2024-12-31'; // phần lịch sử trước mốc này nằm trong kho lưu trữ (a/*.json, ít thay đổi)
const RECENT_FROM = '2024-07-01'; // gói hằng ngày lấy từ mốc này (chồng 6 tháng để khớp giá điều chỉnh)
const ARCH_N = 64;
const archOf = (sym) => { let h = 7; for (const ch of sym) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h % ARCH_N; };
const dayNo = (t) => Math.round(t / 86400);
// mã hoá gọn: ngày dạng chênh lệch, giá ×100 dạng chênh lệch, O/H/L so với C
function enc(d, i0, i1) {
  const o = { d0: null, dt: [], c: [], o: [], h: [], l: [], v: [] }; let pd = null, pc = 0;
  for (let k = i0; k < i1; k++) {
    const c = Math.round(+d.c[k] * 100); if (!(c > 0)) continue;
    const dn = dayNo(d.t[k]); if (pd == null) { o.d0 = dn; pd = dn; }
    o.dt.push(dn - pd); pd = dn; o.c.push(c - pc); pc = c;
    o.o.push(Math.round(+d.o[k] * 100) - c); o.h.push(Math.round(+d.h[k] * 100) - c); o.l.push(c - Math.round(+d.l[k] * 100)); o.v.push(Math.round(+d.v[k] || 0));
  }
  return o;
}
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nz = (v, d = 0) => (v == null || !isFinite(v) ? d : v);
const clip = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v, d = 2) => (v == null || !isFinite(v) ? null : +v.toFixed(d));
const errors = [];

async function getJSON(url, headers = {}, tries = 3) {
  for (let k = 0; k < tries; k++) {
    try {
      const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch (e) { /* thử lại */ }
    await sleep(800 * (k + 1));
  }
  return null;
}

/* ---------- 1. Danh sách mã ---------- */
const SECTOR_FALLBACK = { // ngành cho các mã lớn khi API phân ngành không trả lời
  'Ngân hàng': 'VCB BID CTG TCB MBB VPB ACB HDB STB SHB SSB TPB VIB LPB MSB OCB EIB NAB BAB ABB VAB BVB KLB SGB PGB',
  'Chứng khoán': 'SSI VND VCI HCM VIX FTS CTS TCX SHS MBS BSI AGR ORS VDS APG BVS EVS TVS DSC',
  'Bất động sản': 'VHM VIC VRE NVL PDR DXG KDH NLG DIG NTL HDG VPI CEO HDC SCR DXS KHG CRE TCH QCG HQC NBB L14',
  'Bất động sản KCN': 'KBC SZC BCM IDC SIP LHG NTC PHR D2D TIP',
  'Thép': 'HPG HSG NKG TLH SMC VGS POM TVN',
  'Dầu khí': 'GAS PLX BSR PVD PVT PVS OIL PVC PVB PVP',
  'Hóa chất': 'DGC DCM DPM CSV GVR LAS BFC DDV',
  'Bán lẻ': 'MWG FRT PNJ DGW PET',
  'Thực phẩm & đồ uống': 'VNM MSN SAB MCH KDC DBC BAF PAN QNS SBT LSS HAG HNG MML',
  'Thủy sản': 'VHC ANV FMC IDI ASM CMX',
  'Công nghệ & viễn thông': 'FPT CMG VGI CTR FOX ELC ITD SAM',
  'Xây dựng & VLXD': 'CTD HHV VCG LCG CII FCN HT1 BMP C4G KSB DHA PTB VLB BCC',
  'Logistics & cảng': 'GMD HAH VSC ACV SGP PHP VOS VTO',
  'Điện & tiện ích': 'POW NT2 GEG REE PC1 GEX BWE TDM QTP HND PPC',
  'Bảo hiểm': 'BVH BMI MIG PVI BIC',
  'Du lịch & hàng không': 'VJC VPL HVN SCS AST',
  'Dệt may': 'TCM MSH TNG VGT STK GIL',
  'Y tế': 'DHG IMP DBD DVN',
};
const fbSector = {}; for (const [s, l] of Object.entries(SECTOR_FALLBACK)) l.split(' ').forEach((x) => (fbSector[x] = s));

async function listSymbols() {
  const out = new Map();
  for (const ex of ['hose', 'hnx', 'upcom']) {
    const j = await getJSON(`https://iboard-query.ssi.com.vn/stock/exchange/${ex}`, { Origin: 'https://iboard.ssi.com.vn', Referer: 'https://iboard.ssi.com.vn/' });
    const arr = (j && j.data) || [];
    arr.filter((d) => d.stockType === 's' && /^[A-Z0-9]{3}$/.test(d.stockSymbol || '')).forEach((d) =>
      out.set(d.stockSymbol, { sym: d.stockSymbol, exchange: ex.toUpperCase(), name: d.companyNameVi || '' }));
    if (!arr.length) errors.push('SSI ' + ex + ' rỗng');
  }
  if (out.size < 300) { // nguồn dự phòng
    const j = await getJSON('https://api-finfo.vndirect.com.vn/v4/stocks?q=type:STOCK~status:LISTED&fields=code,floor,companyName&size=3000');
    ((j && j.data) || []).forEach((d) => { if (/^[A-Z0-9]{3}$/.test(d.code) && !out.has(d.code)) out.set(d.code, { sym: d.code, exchange: d.floor === 'HOSE' ? 'HOSE' : d.floor === 'HNX' ? 'HNX' : 'UPCOM', name: d.companyName || '' }); });
  }
  return [...out.values()];
}
async function sectorMap() {
  const m = {};
  const j = await getJSON('https://api-finfo.vndirect.com.vn/v4/industry_classification?q=industryLevel:2&size=100');
  ((j && j.data) || []).forEach((g) => String(g.codeList || '').split(',').forEach((c) => { if (c) m[c.trim()] = g.vietnameseName || g.englishName; }));
  return m;
}

/* ---------- 2. Lịch sử giá (DNSE, đã điều chỉnh) ---------- */
async function hist(sym, kind = 'stock') {
  if (LOCAL) { const f = path.join(LOCAL, sym + '.json'); if (!fs.existsSync(f)) return null; const d = JSON.parse(fs.readFileSync(f)); return d.data || d; }
  const to = Math.floor(Date.now() / 1000) + 86400, from = FROM;
  const j = await getJSON(`https://services.entrade.com.vn/chart-api/v2/ohlcs/${kind}?from=${from}&to=${to}&symbol=${sym}&resolution=1D`);
  if (!j || !Array.isArray(j.t) || !j.t.length) return null;
  const m = new Map(); j.t.forEach((t, k) => m.set(t, [j.o[k], j.h[k], j.l[k], j.c[k], j.v[k]]));
  const ts = [...m.keys()].sort((a, b) => a - b);
  return { t: ts, o: ts.map((t) => m.get(t)[0]), h: ts.map((t) => m.get(t)[1]), l: ts.map((t) => m.get(t)[2]), c: ts.map((t) => m.get(t)[3]), v: ts.map((t) => m.get(t)[4]) };
}
// VPS có lịch sử từ 2006 nhưng điều chỉnh giá khác DNSE: quy đổi theo trung vị tỷ lệ giá ở các phiên chồng nhau
async function extendVPS(sym, d) {
  const t0 = d.t[0]; if (t0 > 1333238400) return 0; // chỉ các mã có dữ liệu DNSE từ đầu (20/03/2012)
  const j = await getJSON(`https://histdatafeed.vps.com.vn/tradingview/history?symbol=${sym}&resolution=D&from=946684800&to=${t0 + 60 * 86400}`);
  if (!j || !Array.isArray(j.t) || !j.t.length) return 0;
  const dn = (t) => Math.round(t / 86400), byDay = new Map(d.t.map((t, k) => [dn(t), k]));
  const rs = []; j.t.forEach((t, k) => { const i = byDay.get(dn(t)); if (i != null && +j.c[k] > 0 && +d.c[i] > 0) rs.push(+d.c[i] / +j.c[k]); });
  if (rs.length < 5) return 0; rs.sort((a, b) => a - b); const r = rs[rs.length >> 1];
  if (!(r > 0.05 && r < 20)) return 0;
  const f = dn(t0), add = { t: [], o: [], h: [], l: [], c: [], v: [] };
  j.t.forEach((t, k) => { if (dn(t) >= f || !(+j.c[k] > 0)) return; add.t.push(t); add.o.push(+(j.o[k] * r).toFixed(3)); add.h.push(+(j.h[k] * r).toFixed(3)); add.l.push(+(j.l[k] * r).toFixed(3)); add.c.push(+(j.c[k] * r).toFixed(3)); add.v.push(+j.v[k] || 0); });
  for (const key of ['t', 'o', 'h', 'l', 'c', 'v']) d[key] = add[key].concat(d[key]);
  return add.t.length;
}
async function pool(items, n, fn) {
  const res = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; res[i] = await fn(items[i], i); await sleep(60); } }));
  return res;
}
const toBars = (d) => d.t.map((t, k) => ({ t: new Date(t * 1000).toISOString().slice(0, 10), o: +d.o[k], h: +d.h[k], l: +d.l[k], c: +d.c[k], v: +d.v[k] || 0 })).filter((b) => b.c > 0);

/* ---------- 3. Chỉ số cho bộ lọc ---------- */
const OPT = { fee: 0.0015, tax: 0.001, sl: 0.07, t2: true }, BUY_T = 65, SELL_T = 45;
function metrics(s) {
  const B = s.bars, n = B.length, R = s.R, I = R.A.I, i = n - 1, c = B[i].c, sc = R.A.score;
  const ret = (k) => (n > k ? c / B[n - 1 - k].c - 1 : null);
  let mfv = 0, vs = 0, val20 = 0, u = 0, d = 0;
  for (let j = Math.max(1, n - 20); j < n; j++) { const b = B[j], r = b.h - b.l; mfv += r ? (((b.c - b.l) - (b.h - b.c)) / r) * b.v : 0; vs += b.v; val20 += (b.c * b.v) / 1e6; }
  val20 /= Math.min(20, n - 1);
  for (let j = Math.max(1, n - 10); j < n; j++) { const x = (B[j].c * B[j].v) / 1e6; if (B[j].c > B[j - 1].c) u += x; else if (B[j].c < B[j - 1].c) d += x; }
  const cmf = vs ? mfv / vs : 0, udr = u + d ? (u - d) / (u + d) : 0, volR = I.vma20[i] ? B[i].v / I.vma20[i] : 1, mfi = nz(I.mfi[i], 50), obvUp = I.obv[i] > nz(I.obvE[i], Infinity);
  const ch1 = c / B[i - 1].c - 1;
  const flow = clip(50 + 120 * cmf + 22 * udr + (mfi - 50) * 0.4 + (obvUp ? 8 : -8) + (volR >= 1.3 ? (ch1 >= 0 ? 8 : -8) : 0), 0, 100);
  let xtSince = 0; while (xtSince < i && I.xt[i - xtSince - 1] === I.xt[i]) xtSince++;
  const ago = (f) => { for (let k = 0; k < 3; k++) if (f(i - k)) return k; return null; };
  const ma200 = I.ma200[i] ?? I.ma50[i];
  let hh = -Infinity; for (let j = Math.max(0, i - 20); j < i; j++) hh = Math.max(hh, B[j].h);
  const P = XT.plan(B, R.A), s0 = R.A.zones.sup[0], r0 = R.A.zones.res[0];
  return { sym: s.sym, ex: s.exchange, sec: s.sector, c, pc: B[i - 1].c, ch1, ch5: ret(5), ch20: ret(20), ch63: ret(63), val: (c * B[i].v) / 1e6, val20, volR, cmf, mfi, flow,
    rsi: nz(I.rsi[i], 50), rsi2: nz(I.rsi2[i], 50), xt: I.xt[i], xtSince, score: nz(sc[i], 50), dScore: sc[i - 5] != null ? sc[i] - sc[i - 5] : 0,
    buyAgo: ago((j) => R.comp.en[j]), sellAgo: ago((j) => sc[j] != null && sc[j - 1] != null && sc[j] <= SELL_T && sc[j - 1] > SELL_T),
    brk: c > hh, ma50: I.ma50[i] != null && c > I.ma50[i], up: I.ma50[i] != null && c > I.ma50[i] && ma200 != null && I.ma50[i] > ma200,
    rsRaw: 2 * nz(ret(63)) + nz(ret(126), nz(ret(63))), toSup: s0 ? c / s0.hi - 1 : null, toRes: r0 ? r0.lo / c - 1 : null, rr: P.rr,
    hold: R.comp.bt.open ? 1 : 0, eLo: P.entryLo, eHi: P.entryHi, stop: P.stop, t1: P.t1, t2: P.t2, date: B[i].t };
}

/* ---------- 4. Dự báo bằng tình huống tương đồng (k-NN) ---------- */
function featAt(s, i, mret20) {
  const B = s.bars, I = s.R.A.I, c = B[i].c, sc = s.R.A.score;
  if (i < 60 || I.ma50[i] == null || sc[i] == null) return null;
  let hh = -Infinity, ll = Infinity; for (let j = Math.max(0, i - 250); j <= i; j++) { hh = Math.max(hh, B[j].h); ll = Math.min(ll, B[j].l); }
  const volR = I.vma20[i] ? B[i].v / I.vma20[i] : 1;
  return [sc[i] / 100, nz(I.rsi[i], 50) / 100, clip(c / B[i - 5].c - 1, -0.2, 0.2) * 2.5, clip(c / B[i - 20].c - 1, -0.4, 0.4) * 1.25, clip(c / I.ma50[i] - 1, -0.3, 0.3) * 1.7,
    clip(Math.log(Math.max(volR, 0.05)), -1.5, 1.5) / 3, I.xt[i] / 2, clip(nz(I.atr[i]) / c, 0, 0.1) * 6, hh > ll ? (c - ll) / (hh - ll) : 0.5, clip(nz(mret20), -0.3, 0.3) * 1.5];
}
function knn(P, f, K = 120) {
  const best = [];
  for (let k = 0; k < P.X.length; k++) {
    const x = P.X[k]; let d = 0; for (let j = 0; j < 10; j++) { const e = x[j] - f[j]; d += e * e; }
    if (best.length < K) { best.push([d, k]); if (best.length === K) best.sort((a, b) => a[0] - b[0]); }
    else if (d < best[K - 1][0]) { let p = K - 1; while (p > 0 && best[p - 1][0] > d) { best[p] = best[p - 1]; p--; } best[p] = [d, k]; }
  }
  const w = best.map(([d]) => 1 / (Math.sqrt(d) + 0.05)), W = w.reduce((a, b) => a + b, 0);
  const atr = best.reduce((s, [, k], j) => s + P.X[k][7] * w[j], 0) / W, sc = atr > 0 ? clip(f[7] / atr, 0.3, 1.5) : 1;
  const vals = best.map(([, k], j) => [P.Y[k], w[j]]).sort((a, b) => a[0] - b[0]);
  let acc = 0, med = vals[vals.length - 1][0]; for (const [v, ww] of vals) { acc += ww / W; if (acc >= 0.5) { med = v; break; } }
  return { p10: vals.reduce((s, [v, ww]) => s + (v > 0 ? ww : 0), 0) / W, f10: med * sc };
}

/* ---------- 5. Khuyến nghị (cùng quy tắc với app) ---------- */
function recs(s, ix) {
  const out = [], B = s.bars, n = B.length, R = s.R, I = R.A.I, sc = R.A.score;
  for (let j = Math.max(60, n - 130); j < n - 1; j++) {
    if (!R.comp.en[j]) continue;
    if (!(I.ma50[j - 10] != null && B[j].c > I.ma50[j] && I.ma50[j] > I.ma50[j - 10] && nz(I.adx.adx[j]) > 20)) continue;
    const ii = ix.pos.get(B[j].t); if (ii != null && ix.ma[ii] != null && ix.c[ii] < ix.ma[ii]) continue;
    const e = B[j + 1].o, a = nz(I.atr[j], e * 0.03), stop0 = Math.max(e * 0.92, e - 2 * a), r = e - stop0;
    const rec = { s: s.sym, sec: s.sector, d: B[j].t, e, s0: stop0, t1: e + 1.5 * r, t2: e + 3 * r, t3: e + 5 * r, hit: 0, max: e };
    let st = stop0, k = j + 1;
    for (; k < n; k++) {
      const b = B[k], can = k - (j + 1) >= 2; rec.max = Math.max(rec.max, b.h);
      if (can && b.l <= st) { rec.x = Math.min(b.o, st); rec.why = rec.hit === 0 ? 'Cắt lỗ' : rec.hit === 1 ? 'Chốt hòa vốn' : 'Chốt tại T1'; break; }
      if (b.h >= rec.t3) { rec.hit = 3; rec.x = rec.t3; rec.why = 'Đạt T3'; break; }
      if (b.h >= rec.t2 && rec.hit < 2) { rec.hit = 2; st = Math.max(st, rec.t1); } else if (b.h >= rec.t1 && rec.hit < 1) { rec.hit = 1; st = Math.max(st, e); }
      if (k - (j + 1) >= 30) { rec.x = b.c; rec.why = 'Hết 30 phiên'; break; }
    }
    rec.open = rec.x == null; rec.cur = rec.open ? B[n - 1].c : rec.x; rec.st = st; rec.days = (rec.open ? n - 1 : k) - (j + 1);
    out.push(rec); if (!rec.open) j = k - 1; else break;
  }
  return out;
}

/* ---------- 6. Thị trường: tâm lý, thanh khoản, ngành, RRG ---------- */
function rrgPath(series, bench) {
  const rs = series.map((v, k) => (v && bench[k] ? v / bench[k] : null)), first = rs.findIndex((v) => v != null);
  if (first < 0 || rs.length - first < 70) return null;
  const sm = XT.ema(rs.slice(first), 10), base = XT.sma(sm.map((v) => v ?? 0), 40);
  const ratio = sm.map((v, k) => (v == null || base[k] == null || k < 49 ? null : (100 * v) / base[k]));
  const mom = ratio.map((v, k) => (v == null || k < 5 || ratio[k - 5] == null ? null : 100 + (v / ratio[k - 5] - 1) * 150));
  const pts = []; for (let k = ratio.length - 1, c = 0; k >= 0 && c < 8; k -= 5, c++) if (ratio[k] != null && mom[k] != null) pts.unshift([r2(ratio[k]), r2(mom[k])]);
  return pts.length ? pts : null;
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'hist'), { recursive: true });
  const t0 = Date.now();
  let syms = LOCAL ? fs.readdirSync(LOCAL).filter((f) => f.endsWith('.json') && f !== 'VNINDEX.json').map((f) => ({ sym: f.slice(0, -5), exchange: 'HOSE', name: '' })) : await listSymbols();
  const secApi = LOCAL ? {} : await sectorMap();
  console.log('Số mã:', syms.length, '· phân ngành API:', Object.keys(secApi).length);
  const ixRaw = await hist('VNINDEX', 'index'); if (!ixRaw) throw new Error('Không lấy được VNINDEX');
  const ixAll = toBars(ixRaw), ixBars = ixAll.slice(-ANALYSE);
  console.log('VNINDEX từ', ixBars[0].t, '·', ixBars.length, 'phiên');
  const RAW = { VNINDEX: { d: ixRaw, info: { kind: 'index', exchange: 'INDEX', sector: 'Chỉ số', name: 'VN-Index' } } };
  const raws = await pool(syms, 8, async (s) => { const d = await hist(s.sym); if (!d) errors.push('Không có dữ liệu ' + s.sym); return d; });
  console.log('Tải xong lịch sử sau', ((Date.now() - t0) / 1000).toFixed(0), 'giây');
  if (!LOCAL) {
    let ext = 0, extN = 0;
    await pool(syms.map((s, k) => [s, raws[k]]).filter(([, d]) => d && d.t.length && d.t[0] <= 1333238400), 6, async ([s, d]) => { try { const a = await extendVPS(s.sym, d); if (a) { ext += a; extN++; } } catch (e) { errors.push('VPS ' + s.sym); } });
    console.log('Bổ sung lịch sử trước 2012 từ VPS:', extN, 'mã,', ext, 'phiên, sau', ((Date.now() - t0) / 1000).toFixed(0), 'giây');
  }

  const ix = { c: ixBars.map((b) => b.c), pos: new Map(ixBars.map((b, i) => [b.t, i])) }; ix.ma = XT.sma(ix.c, 50);
  const mr20 = new Map(); for (let i = 20; i < ixBars.length; i++) mr20.set(ixBars[i].t, ixBars[i].c / ixBars[i - 20].c - 1);
  const S = [];
  syms.forEach((s, k) => {
    const d = raws[k]; if (!d) return;
    const sector = secApi[s.sym] || fbSector[s.sym] || 'Khác';
    RAW[s.sym] = { d, info: { kind: 'stock', exchange: s.exchange, sector, name: s.name } };
    const bars = toBars(d).slice(-ANALYSE); if (bars.length < 60) return;
    const last = bars[bars.length - 1]; if (ixBars.length > 130 && last.t < ixBars[ixBars.length - 130].t) return; // bỏ mã gần nửa năm không giao dịch
    try { const A = XT.analyze(bars, OPT); S.push({ ...s, sector, bars, R: { A, comp: XT.compositeBT(bars, A.score, BUY_T, SELL_T, OPT) } }); } catch (e) { errors.push('Lỗi phân tích ' + s.sym); }
  });
  console.log('Phân tích xong', S.length, 'mã sau', ((Date.now() - t0) / 1000).toFixed(0), 'giây');

  const M = S.map(metrics);
  const sorted = [...M].sort((a, b) => a.rsRaw - b.rsRaw); sorted.forEach((m, k) => (m.rsr = Math.max(1, Math.round(((k + 1) / sorted.length) * 99))));
  // dự báo: kho mẫu từ các mã thanh khoản (GTGD TB20 ≥ 1 tỷ), lấy mỗi 2 phiên
  const PX = { X: [], Y: [] }; const liquid = new Set(M.filter((m) => m.val20 >= 1).map((m) => m.sym));
  S.forEach((s) => { if (!liquid.has(s.sym)) return; const B = s.bars; for (let i = 60; i + 10 < B.length; i += 2) { const f = featAt(s, i, mr20.get(B[i].t)); if (f) { PX.X.push(f); PX.Y.push(B[i + 10].c / B[i].c - 1); } } });
  console.log('Kho mẫu dự báo:', PX.X.length);
  S.forEach((s, k) => { const n = s.bars.length, f = featAt(s, n - 1, mr20.get(s.bars[n - 1].t)); if (f && PX.X.length > 500) Object.assign(M[k], knn(PX, f)); });

  /* ---------- phân tích cơ bản ---------- */
  const FUND = {}, STMT = {};
  let models = {}, aRecs = {}; const SHAPED = {};
  if (!LOCAL || process.env.FUND) {
    models = await loadModels(); aRecs = await loadRecs();
    console.log('Mô hình BCTC:', Object.keys(models).length, '· CTCK khuyến nghị:', Object.keys(aRecs).length, 'mã');
    const Q = quarterEnds(24), shaped = {};
    await pool(S, 6, async (s) => { const rows = await loadStatements(s.sym, Q); if (!rows || !rows.length) { errors.push('Không có BCTC ' + s.sym); return; } const sh = shape(rows, Q); if (sh) { shaped[s.sym] = sh; SHAPED[s.sym] = sh; } });
    console.log('Tải BCTC xong', Object.keys(shaped).length, 'mã sau', ((Date.now() - t0) / 1000).toFixed(0), 'giây');
    const run = (sectorNm) => S.forEach((s, k) => { const sh = shaped[s.sym]; if (!sh) return; try { FUND[s.sym] = analyzeFundamentals({ sym: s.sym, S: sh, bars: s.bars, recs: aRecs[s.sym], tech: M[k].score, sectorStats: sectorNm ? { nm: sectorNm[s.sector] } : null }); } catch (e) { errors.push('Lỗi BCTC ' + s.sym + ': ' + String(e).slice(0, 80)); } });
    run(null);
    const nmBy = {}; S.forEach((s) => { const f = FUND[s.sym]; if (f && f.m.nm != null) (nmBy[s.sector] = nmBy[s.sector] || []).push(f.m.nm); });
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
    const secNm = {}; Object.entries(nmBy).forEach(([k, a]) => (secNm[k] = med(a)));
    run(secNm);
    S.forEach((s) => { if (shaped[s.sym]) STMT[s.sym] = fullStatements(shaped[s.sym], 12); });
    M.forEach((m) => { const f = FUND[m.sym]; if (!f) return; const v = f.val, x = f.m;
      Object.assign(m, { mcap: x.mcap, pe: x.pe, pb: x.pb, roe: x.roe, nm: x.nm, revY: x.revY, npY: x.npY, eps: x.eps, fair: v.fair, upF: v.up, rating: v.rating, fs: f.score.total, pePct: v.PE && v.PE.pct, pbPct: v.PB && v.PB.pct, cq: x.cq, de: x.de }); });
    console.log('Phân tích cơ bản xong', Object.keys(FUND).length, 'mã');
  }

  /* ---------- rổ chỉ số, P/E – P/B theo rổ, khối ngoại toàn thị trường ---------- */
  const GROUPS = {};
  if (!LOCAL) for (const g of ['VN30', 'VNX50', 'VN100', 'VNMID', 'VNSML', 'HNX30']) {
    let a = [];
    for (const hd of [{ 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json', Origin: 'https://khoimr11.github.io' }, { 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json' }, { Origin: 'https://iboard.ssi.com.vn', Referer: 'https://iboard.ssi.com.vn/' }]) {
      try { const r = await fetch(`https://iboard-query.ssi.com.vn/stock/group/${g}`, { headers: hd, signal: AbortSignal.timeout(20000) }); if (!r.ok) continue; const j = await r.json(); a = ((j && j.data) || []).map((d) => d.stockSymbol).filter(Boolean); if (a.length) break; } catch (e) { /* thử cách khác */ }
      await sleep(400);
    }
    if (a.length) GROUPS[g] = a; else errors.unshift('Không lấy được rổ ' + g);
  }
  GROUPS.VNINDEX = S.filter((s) => s.exchange === 'HOSE').map((s) => s.sym);
  const VIN = new Set(['VIC', 'VHM', 'VRE', 'VPL']);
  const VD = ixBars.slice(-500).map((b) => b.t), VT = VD.map((d) => new Date(d + 'T00:00:00Z').getTime()), NV = VD.length;
  const ES = {};
  S.forEach((s) => {
    const sh = SHAPED[s.sym]; if (!sh) return; const e = earnSeries(sh); if (!e) return;
    const pm = new Map(s.bars.map((b) => [b.t, b.c])); let last = null; const cap = new Array(NV), te = new Array(NV), eq = new Array(NV);
    for (let k = 0; k < NV; k++) { const c = pm.get(VD[k]); if (c != null) last = c; if (last == null) continue;
      let qi = -1; for (let q = 0; q < e.n; q++) if (e.qT[q] <= VT[k]) qi = q; if (k === NV - 1) qi = e.n - 1;
      cap[k] = (last * 1000 * e.sh * 1e6) / 1e9; te[k] = qi >= 0 ? e.ttm[qi] : null; eq[k] = qi >= 0 ? e.eq[qi] : null; }
    ES[s.sym] = { cap, te, eq };
  });
  const idxSym = { VNINDEX: 'VNINDEX', VN30: 'VN30', VNX50: 'VNX50', VN100: 'VN100', VNMID: 'VNMID' };
  const val = { d: VD, groups: {}, members: {}, vin: [...VIN] };
  for (const [g, isym] of Object.entries(idxSym)) {
    const mem = GROUPS[g]; if (!mem) continue; val.members[g] = mem;
    let idx = null;
    if (g === 'VNINDEX') { const m = new Map(ixBars.map((b) => [b.t, b.c])); idx = VD.map((d) => m.get(d) ?? null); }
    else if (!LOCAL) { const now = Math.floor(Date.now() / 1000), j = await getJSON(`https://histdatafeed.vps.com.vn/tradingview/history?symbol=${isym}&resolution=D&from=${now - 900 * 86400}&to=${now + 86400}`);
      if (j && j.s === 'ok') { const m = new Map(j.t.map((t, k) => [new Date(t * 1000).toISOString().slice(0, 10), +j.c[k]])); let lastI = null; idx = VD.map((d) => { const v = m.get(d); if (v != null) lastI = v; return lastI; }); } }
    const agg = (ex) => { const pe = [], pb = [], cap = [];
      for (let k = 0; k < NV; k++) { let C = 0, E = 0, CE = 0, B = 0, CB = 0, CA = 0;
        for (const sym of mem) { if (ex && VIN.has(sym)) continue; const x = ES[sym]; if (!x || x.cap[k] == null) continue; CA += x.cap[k];
          if (x.te[k] != null) { CE += x.cap[k]; E += x.te[k]; } if (x.eq[k] != null && x.eq[k] > 0) { CB += x.cap[k]; B += x.eq[k]; } }
        pe.push(E > 0 ? r2(CE / E, 3) : null); pb.push(B > 0 ? r2(CB / B, 3) : null); cap.push(r2(CA, 0)); }
      return { pe, pb, cap }; };
    const A = agg(false), X = agg(true);
    const k0 = A.cap.findIndex((v, k) => v > 0 && X.cap[k] > 0);
    const idxEx = idx && k0 >= 0 ? idx.map((v, k) => (v == null || !A.cap[k] ? null : r2(v * (X.cap[k] / A.cap[k]) / (X.cap[k0] / A.cap[k0]), 2))) : null;
    val.groups[g] = { idx, idxEx, pe: A.pe, pb: A.pb, peEx: X.pe, pbEx: X.pb, cap: A.cap, capEx: X.cap, n: mem.length };
  }
  for (const g of ['VNSML', 'HNX30']) if (GROUPS[g]) val.members[g] = GROUPS[g];
  fs.writeFileSync(path.join(OUT, 'valuation.json'), JSON.stringify(val));
  console.log('Định giá theo rổ:', Object.keys(val.groups).join(', '), '· P/E VN-Index hiện tại', val.groups.VNINDEX && val.groups.VNINDEX.pe[NV - 1]);
  // khối ngoại 60 phiên (VNDirect)
  const FOR = { days: [], top5: null, top20: null };
  if (!LOCAL) {
    const stockSet = new Set(S.map((s) => s.sym)), net = {}, FD = ixBars.slice(-60).map((b) => b.t);
    for (let k = 0; k < FD.length; k++) {
      const d = FD[k], j = await getJSON(`https://api-finfo.vndirect.com.vn/v4/foreigns?q=tradingDate:${d}&size=3000&fields=code,floor,netVal,buyVal,sellVal`);
      const rows = ((j && j.data) || []).filter((r) => stockSet.has(r.code)); if (!rows.length) continue;
      const day = { d, HOSE: [0, 0], HNX: [0, 0], UPCOM: [0, 0] };
      rows.forEach((r) => { const f = r.floor === 'HOSE' ? 'HOSE' : r.floor === 'HNX' ? 'HNX' : 'UPCOM'; day[f][0] += (+r.buyVal || 0) / 1e9; day[f][1] += (+r.sellVal || 0) / 1e9;
        const a = (net[r.code] = net[r.code] || new Array(FD.length).fill(0)); a[k] = (+r.netVal || 0) / 1e9; });
      ['HOSE', 'HNX', 'UPCOM'].forEach((f) => (day[f] = day[f].map((v) => r2(v, 1)))); FOR.days.push(day);
    }
    const top = (n) => { const arr = Object.entries(net).map(([c, a]) => [c, r2(a.slice(-n).reduce((x, y) => x + y, 0), 2)]); arr.sort((a, b) => b[1] - a[1]); return { buy: arr.slice(0, 20), sell: arr.slice(-20).reverse() }; };
    FOR.top5 = top(5); FOR.top20 = top(20);
    console.log('Khối ngoại:', FOR.days.length, 'phiên');
  }
  // giao dịch thỏa thuận phiên gần nhất (VNDirect)
  if (!LOCAL) { const dl = ixBars[ixBars.length - 1].t, j = await getJSON(`https://api-finfo.vndirect.com.vn/v4/stock_prices?q=date:${dl}&size=3000&fields=code,ptValue,nmValue`);
    const stockSet2 = new Set(S.map((s) => s.sym)); FOR.pt = { d: dl, rows: ((j && j.data) || []).filter((r) => stockSet2.has(r.code) && +r.ptValue > 0).map((r) => [r.code, r2(+r.ptValue / 1e9, 2)]).sort((a, b) => b[1] - a[1]).slice(0, 120) }; }
  fs.writeFileSync(path.join(OUT, 'foreign.json'), JSON.stringify(FOR));
  // giá trị khớp lệnh theo ngành 20 phiên
  { const SD = ixBars.slice(-20).map((b) => b.t), sh = {}; const pos = new Map(SD.map((d, i) => [d, i]));
    S.forEach((s) => { const a = (sh[s.sector] = sh[s.sector] || new Array(SD.length).fill(0)); for (let i = Math.max(0, s.bars.length - 30); i < s.bars.length; i++) { const k = pos.get(s.bars[i].t); if (k != null) a[k] += (s.bars[i].c * s.bars[i].v) / 1e6; } });
    Object.keys(sh).forEach((k) => (sh[k] = sh[k].map((v) => r2(v, 1))));
    fs.writeFileSync(path.join(OUT, 'sectorflow.json'), JSON.stringify({ d: SD, s: sh })); }

  // bảng lọc theo sàn (dạng cột cho gọn)
  const COLS = ['sym', 'ex', 'sec', 'c', 'pc', 'ch1', 'ch5', 'ch20', 'ch63', 'val', 'val20', 'volR', 'cmf', 'mfi', 'flow', 'rsi', 'rsi2', 'xt', 'xtSince', 'score', 'dScore', 'buyAgo', 'sellAgo', 'brk', 'ma50', 'up', 'rsr', 'toSup', 'toRes', 'rr', 'hold', 'eLo', 'eHi', 'stop', 't1', 't2', 'p10', 'f10', 'date', 'name', 'mcap', 'pe', 'pb', 'roe', 'nm', 'revY', 'npY', 'eps', 'fair', 'upF', 'rating', 'fs', 'pePct', 'pbPct', 'cq', 'de'];
  const pack = (m) => COLS.map((k) => { const v = k === 'name' ? (syms.find((x) => x.sym === m.sym) || {}).name : m[k]; return typeof v === 'number' ? r2(v, k === 'val' || k === 'val20' || k === 'mcap' || k === 'eps' ? 1 : 4) : typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null; });
  for (const ex of ['HOSE', 'HNX', 'UPCOM']) fs.writeFileSync(path.join(OUT, `screen_${ex}.json`), JSON.stringify({ cols: COLS, rows: M.filter((m) => m.ex === ex).map(pack), date: ixBars[ixBars.length - 1].t }));

  // tâm lý & thanh khoản & phân bố (các mã thanh khoản)
  const L = S.filter((s) => liquid.has(s.sym)), D = ixBars.map((b) => b.t), N = D.length;
  const pos = L.map((s) => new Map(s.bars.map((b, i) => [b.t, i])));
  const sent = [], liq = [];
  for (let k = Math.max(60, N - 90); k < N; k++) {
    let a20 = 0, a50 = 0, rs = 0, xt = 0, sc = 0, nn = 0, val = 0, buy = 0, sell = 0;
    L.forEach((s, r) => { const i = pos[r].get(D[k]); if (i == null || i < 50) return; const I = s.R.A.I, c = s.bars[i].c, v = s.R.A.score[i];
      nn++; a20 += I.ma20[i] != null && c > I.ma20[i]; a50 += I.ma50[i] != null && c > I.ma50[i]; rs += nz(I.rsi[i], 50); xt += I.xt[i] === 1; sc += nz(v, 50); val += (c * s.bars[i].v) / 1e6; if (v >= 60) buy++; else if (v < 40) sell++; });
    if (!nn) continue;
    sent.push({ d: D[k], st: r2(((a20 / nn) * 100 + rs / nn + (xt / nn) * 100) / 3, 1), mt: r2(((a50 / nn) * 100 + sc / nn) / 2, 1), ix: ixBars[k].c, buy, sell, neu: nn - buy - sell });
    liq.push({ d: D[k], v: r2(val, 0), up: ixBars[k].c >= ixBars[k - 1].c ? 1 : 0 });
  }
  // ngành
  const bySec = {}; L.forEach((s) => (bySec[s.sector] = bySec[s.sector] || []).push(s));
  const mBy = new Map(M.map((m) => [m.sym, m]));
  const sectors = Object.entries(bySec).filter(([, ms]) => ms.length >= 2).map(([name, ms]) => {
    const idx = new Array(N).fill(null); let lvl = 100;
    const mp = ms.map((s) => new Map(s.bars.map((b, i) => [b.t, i])));
    for (let k = 1; k < N; k++) { let su = 0, c = 0; ms.forEach((s, r) => { const i = mp[r].get(D[k]); if (i == null || i < 1) return; su += clip(s.bars[i].c / s.bars[i - 1].c - 1, -0.15, 0.15); c++; }); if (c) lvl *= 1 + su / c; idx[k] = c || k > 1 ? lvl : null; }
    const flow = (days) => { let net = 0, tot = 0; ms.forEach((s) => { const B = s.bars, n = B.length; for (let i = Math.max(1, n - days); i < n; i++) { const v = (B[i].c * B[i].v) / 1e6; tot += v; net += B[i].c > B[i - 1].c ? v : B[i].c < B[i - 1].c ? -v : 0; } }); return { net: r2(net, 0), tot: r2(tot, 0) }; };
    const ret = (k) => (idx[N - 1] && idx[N - 1 - k] ? r2(idx[N - 1] / idx[N - 1 - k] - 1, 4) : null);
    const top = ms.map((s) => mBy.get(s.sym)).filter(Boolean).sort((a, b) => b.val20 - a.val20).slice(0, 12);
    return { name, n: ms.length, r1: ret(1), r5: ret(5), r20: ret(20), r60: ret(60), f1: flow(1), f5: flow(5), f20: flow(20),
      ma50: r2(ms.filter((s) => mBy.get(s.sym) && mBy.get(s.sym).ma50).length / ms.length, 3), score: r2(ms.reduce((a, s) => a + nz(mBy.get(s.sym) && mBy.get(s.sym).score, 50), 0) / ms.length, 1),
      rrg: rrgPath(idx, ix.c), stocks: top.map((m) => { const s = S.find((x) => x.sym === m.sym), mpp = new Map(s.bars.map((b) => [b.t, b.c])); return { s: m.sym, rrg: rrgPath(D.map((d) => mpp.get(d) ?? null), ix.c) }; }) };
  }).sort((a, b) => nz(b.r20, -9) - nz(a.r20, -9));
  // nhật ký tín hiệu 10 phiên (mã thanh khoản ≥ 3 tỷ/phiên)
  const LL = S.filter((s) => (mBy.get(s.sym) || {}).val20 >= 3);
  const log = D.slice(-10).reverse().map((dt) => {
    const ev = [];
    LL.forEach((s) => { const B = s.bars, j = B.findIndex((b) => b.t === dt); if (j < 21) return; const I = s.R.A.I, sc = s.R.A.score;
      let hh = -Infinity; for (let k = j - 20; k < j; k++) hh = Math.max(hh, B[k].h);
      if (s.R.comp.en[j]) ev.push([s.sym, 'buy']); else if (I.xt[j] === 1 && I.xt[j - 1] !== 1) ev.push([s.sym, 'xanh']);
      if (B[j].c > hh && I.vma20[j] && B[j].v >= 1.3 * I.vma20[j]) ev.push([s.sym, 'brk']);
      if (I.xt[j] === -1 && I.xt[j - 1] !== -1) ev.push([s.sym, 'tim']); else if (sc[j] != null && sc[j - 1] != null && sc[j] <= SELL_T && sc[j - 1] > SELL_T) ev.push([s.sym, 'sell']); });
    return { dt, ev: ev.slice(0, 80) };
  });
  fs.writeFileSync(path.join(OUT, 'market.json'), JSON.stringify({ date: D[N - 1], n: L.length, sent, liq, sectors, log }));

  // khuyến nghị
  const R = S.filter((s) => (mBy.get(s.sym) || {}).val20 >= 3).flatMap((s) => recs(s, ix)).sort((a, b) => (a.d < b.d ? 1 : -1));
  const RC = ['s', 'sec', 'd', 'e', 's0', 'st', 't1', 't2', 't3', 'cur', 'x', 'why', 'hit', 'max', 'days', 'open'];
  fs.writeFileSync(path.join(OUT, 'recs.json'), JSON.stringify({ cols: RC, rows: R.slice(0, 1500).map((r) => RC.map((k) => (typeof r[k] === 'number' ? r2(r[k], 3) : typeof r[k] === 'boolean' ? (r[k] ? 1 : 0) : r[k] ?? null))) }));

  /* ---------- tín hiệu AI: danh mục chia đều các mã thanh khoản nhất ---------- */
  const TOP = S.filter((s) => s.bars.length >= 250).map((s) => [s, (mBy.get(s.sym) || {}).val20 || 0]).sort((a, b) => b[1] - a[1]).slice(0, 150).map((x) => x[0]);
  const Dpos = new Map(D.map((d, i) => [d, i])), curve = new Array(N).fill(0), cnt = new Array(N).fill(0);
  const per = TOP.map((s) => {
    const B = s.bars, bt = s.R.comp.bt, eq = bt.eq; let lastEq = 1;
    for (let i = 0; i < B.length; i++) { const k = Dpos.get(B[i].t); if (k == null) continue; if (eq[i] != null) lastEq = eq[i]; curve[k] += lastEq; cnt[k]++; }
    const tr = bt.trades, wins = tr.filter((t) => t.ret > 0).length, n = B.length, o = bt.open;
    return { s: s.sym, sec: s.sector, n: tr.length, win: tr.length ? r2(wins / tr.length, 3) : null, ret: r2(bt.stats.ret, 4), hold: o ? 1 : 0, pend: bt.pendingBuy ? 1 : 0,
      sellSoon: o && o.pendingSell ? 1 : 0, ei: o ? B[o.ei].t : null, ep: o ? r2(o.ep, 2) : null, tp: o ? n - 1 - o.ei : null, pl: o ? r2(o.ret, 4) : null, c: B[n - 1].c, val: r2((B[n - 1].c * B[n - 1].v) / 1e6, 1),
      last: tr.slice(-12).reverse().map((t) => [B[t.ei].t, r2(t.ep, 2), B[t.xi].t, r2(t.xp, 2), r2(t.ret, 4)]) };
  });
  const first = cnt.findIndex((c) => c >= TOP.length * 0.6);
  const eqC = curve.map((v, k) => (k >= first && cnt[k] ? v / cnt[k] : null));
  const base = eqC[first] || 1; const eqN = eqC.map((v) => (v == null ? null : v / base));
  let peak = 0, mdd = 0; eqN.forEach((v) => { if (v == null) return; peak = Math.max(peak, v); mdd = Math.max(mdd, 1 - v / peak); });
  const months = {}; eqN.forEach((v, k) => { if (v != null) months[D[k].slice(0, 7)] = v; }); const mv = Object.values(months); let up = 0; for (let k = 1; k < mv.length; k++) if (mv[k] > mv[k - 1]) up++;
  const yrs = (N - first) / 250, tot = eqN[N - 1] - 1;
  const ixBase = ixBars[first].c;
  const signals = { date: D[N - 1], universe: TOP.length, from: D[first], total: r2(tot, 4), cagr: r2(Math.pow(eqN[N - 1], 1 / Math.max(yrs, 0.1)) - 1, 4), mdd: r2(mdd, 4), upMonths: r2(mv.length > 1 ? up / (mv.length - 1) : null, 3),
    vnBH: r2(ixBars[N - 1].c / ixBase - 1, 4),
    curve: D.map((d, k) => (k >= first && k % 3 === 0 || k === N - 1 ? [d, r2(eqN[k], 4), r2(ixBars[k].c / ixBase, 4)] : null)).filter(Boolean), per };
  fs.writeFileSync(path.join(OUT, 'signals.json'), JSON.stringify(signals));
  console.log('Danh mục AI:', TOP.length, 'mã, lợi nhuận', signals.total, 'CAGR', signals.cagr, 'MDD', signals.mdd);

  /* ---------- gói dữ liệu theo nhóm 20 mã cho app ---------- */
  fs.mkdirSync(path.join(OUT, 'b'), { recursive: true });
  const order = ['VNINDEX', ...Object.keys(RAW).filter((x) => x !== 'VNINDEX').sort()], bucketOf = {}, names = {}, firstD = {};
  const rf = Math.floor(Date.parse(RECENT_FROM) / 1000), ae = Math.floor(Date.parse(ARCH_END) / 1000) + 86400;
  const ARCH = Array.from({ length: ARCH_N }, () => ({}));
  for (let b = 0; b * 20 < order.length; b++) {
    const pack2 = {};
    order.slice(b * 20, b * 20 + 20).forEach((sym) => {
      bucketOf[sym] = b; const { d, info } = RAW[sym]; const n = d.t.length; if (!n) return;
      let i0 = d.t.findIndex((t) => t >= rf); if (i0 < 0) i0 = Math.max(0, n - 60);
      let i1 = d.t.findIndex((t) => t >= ae); if (i1 < 0) i1 = n;
      if (i1 > 0 && d.t[0] < rf) ARCH[archOf(sym)][sym] = enc(d, 0, i1);
      pack2[sym] = { h: { ...enc(d, i0, n), ...info, src: 'DNSE', arch: d.t[0] < rf ? 1 : 0 }, f: FUND[sym] || null, st: STMT[sym] || null };
      names[sym] = [info.name || '', info.exchange]; firstD[sym] = new Date(d.t[0] * 1000).toISOString().slice(0, 10);
    });
    fs.writeFileSync(path.join(OUT, 'b', b + '.json'), JSON.stringify(pack2));
  }
  fs.mkdirSync(path.join(OUT, 'a'), { recursive: true });
  let archBytes = 0;
  ARCH.forEach((x, k) => { const j = JSON.stringify({ end: ARCH_END, s: x }); archBytes += j.length; fs.writeFileSync(path.join(OUT, 'a', k + '.json'), j); });
  console.log('Kho lưu trữ lịch sử:', (archBytes / 1048576).toFixed(1), 'MB ·', ARCH_N, 'tệp');
  fs.writeFileSync(path.join(OUT, 'models.json'), JSON.stringify(models));

  const meta = { bucketOf, names, first: firstD, archN: ARCH_N, archEnd: ARCH_END, fmt: 2, buckets: Math.ceil(order.length / 20), date: D[N - 1], generatedAt: new Date().toISOString(), symbols: syms.length, analysed: S.length, liquid: L.length, seconds: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 50), errorCount: errors.length };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  for (const f of ['screen_HOSE.json', 'screen_HNX.json', 'screen_UPCOM.json', 'market.json', 'recs.json', 'signals.json', 'models.json', 'b/1.json', 'a/1.json']) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), 'KB');
  console.log({ ...meta, bucketOf: undefined });
  if (S.length < 50 && !LOCAL) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
