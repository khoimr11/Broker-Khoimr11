// Phân tích cơ bản: báo cáo tài chính (VNDirect), định giá lịch sử, giá hợp lý, chấm điểm doanh nghiệp.
const F = 'https://api-finfo.vndirect.com.vn/v4';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nz = (v, d = 0) => (v == null || !isFinite(v) ? d : v);
const clip = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v, d = 1) => (v == null || !isFinite(v) ? null : +v.toFixed(d));

export async function getJSON(url, tries = 3, timeout = 40000) {
  for (let k = 0; k < tries; k++) {
    try { const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) }); if (res.ok) return await res.json(); if (res.status === 404) return null; } catch (e) { /* thử lại */ }
    await sleep(1000 * (k + 1));
  }
  return null;
}
export function quarterEnds(n = 24) {
  const out = [], d = new Date(); let y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3); // quý hiện tại chưa kết thúc
  for (let k = 0; k < n; k++) { q--; if (q < 0) { q = 3; y--; } out.unshift(`${y}-${['03-31', '06-30', '09-30', '12-31'][q]}`); }
  return out;
}
export const MT = { NON_FINANCE: [1, 2, 3], SECURITIES: [89, 90, 91], BANK: [101, 102, 103], INSURANCE: [411, 412, 413] };
const KIND_OF = {}; Object.entries(MT).forEach(([k, a]) => a.forEach((m) => (KIND_OF[m] = k)));

export async function loadModels() {
  const j = await getJSON(`${F}/financial_models?sort=displayOrder:asc&q=modelType:1,2,3,89,90,91,101,102,103,411,412,413&fields=modelType,itemCode,itemVnName,displayOrder,displayLevel&size=9999`);
  const M = {};
  ((j && j.data) || []).forEach((x) => { const k = `${x.modelType | 0}:${x.itemCode | 0}`; if (!M[k]) M[k] = [String(x.itemVnName || '').replace(/\s+/g, ' ').trim(), x.displayLevel | 0, x.displayOrder | 0]; });
  return M;
}
export async function loadRecs() {
  const since = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10);
  const j = await getJSON(`${F}/recommendations?sort=reportDate:desc&q=reportDate:gte:${since}&size=5000`);
  const by = {};
  ((j && j.data) || []).forEach((r) => { if (!r.code || !(r.targetPrice > 0)) return; (by[r.code] = by[r.code] || []).push([r.firm || r.source || '', r.reportDate, r.type || '', r1(r.reportPrice, 2), r1(r.targetPrice, 2)]); });
  return by;
}
export async function loadStatements(sym, Q) {
  const j = await getJSON(`${F}/financial_statements?q=code:${sym}~reportType:QUARTER~modelType:1,2,3,89,90,91,101,102,103,411,412,413~fiscalDate:${Q.join(',')}&size=10000&fields=itemCode,modelType,fiscalDate,numericValue`);
  return (j && j.data) || null;
}

/* ---------- gom số liệu theo quý ---------- */
// trả về { kind, Q:[ngày quý có dữ liệu], raw:{ 'mt:code': [giá trị theo Q] } } đơn vị: tỷ đồng
export function shape(rows, Q) {
  const kinds = {}; rows.forEach((r) => { const k = KIND_OF[r.modelType | 0]; if (k) kinds[k] = (kinds[k] || 0) + 1; });
  const kind = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0]?.[0]; if (!kind) return null;
  const mts = new Set(MT[kind]), have = new Set();
  rows.forEach((r) => { if (mts.has(r.modelType | 0)) have.add(r.fiscalDate); });
  const QQ = Q.filter((d) => have.has(d)); if (!QQ.length) return null;
  const idx = new Map(QQ.map((d, i) => [d, i])), raw = {};
  rows.forEach((r) => { const mt = r.modelType | 0; if (!mts.has(mt)) return; const i = idx.get(r.fiscalDate); if (i == null) return; const k = `${mt}:${r.itemCode | 0}`; (raw[k] = raw[k] || new Array(QQ.length).fill(null))[i] = r.numericValue / 1e9; });
  return { kind, Q: QQ, raw };
}
function pick(S, codes) { // lấy dãy đầu tiên có dữ liệu trong danh sách mã
  const [bs, is, cf] = MT[S.kind];
  for (const c of codes) { const [m, code] = c.split(':'); const mt = m === 'B' ? bs : m === 'I' ? is : cf; const a = S.raw[`${mt}:${code}`]; if (a && a.some((v) => v != null && v !== 0)) return a; }
  return new Array(S.Q.length).fill(null);
}
export function keyItems(S) {
  const g = (...c) => pick(S, c);
  const K = {
    rev: S.kind === 'BANK' ? g('I:421701') : g('I:21001', 'I:21000'),
    gp: g('I:23100'), cogs: g('I:22100', 'I:622100', 'I:22160'), sell: g('I:22110'), ga: g('I:22200'),
    finInc: g('I:21500'), finExp: g('I:22500'), intExp: g('I:22510', 'C:22509'), op: g('I:23110', 'I:88888'), other: g('I:23900'),
    pbt: g('I:23800', 'C:23810'), tax: g('I:22070'), npat: g('I:23003'), np: g('I:23000', 'I:23003'), minor: g('I:23500'),
    nii: g('I:421900'), prov: g('I:422900'),
    ta: g('B:12700', 'B:14400'), liab: g('B:13000'), eq: g('B:14000'), mi: g('B:14240'), charter: g('B:14110'),
    cash: g('B:11100', 'B:411100'), stInv: g('B:11200'), recv: g('B:11300'), inv: g('B:11400'), othST: g('B:11500'), stA: g('B:11000'),
    fixed: g('B:12200'), cip: g('B:12440'), ltA: g('B:12000'), stL: g('B:13100'), ltL: g('B:13300'), debtST: g('B:13110', 'B:13111'), debtLT: g('B:13340'),
    loans: g('B:412000'), deposits: g('B:413300'),
    cfo: g('C:32000'), cfi: g('C:33000'), cff: g('C:34000'), cashEnd: g('C:37000'), capex: g('C:32100', 'C:610006', 'C:600118'), dep: g('C:22230'), div: g('C:33600'),
  };
  if (S.kind !== 'NON_FINANCE') ['gp', 'cogs'].forEach((k) => { if (S.kind === 'BANK') K[k] = K[k].map(() => null); });
  return K;
}

/* ---------- tính toán ---------- */
const sum4 = (a, i) => { if (i < 3) return null; let s = 0; for (let k = i - 3; k <= i; k++) { if (a[k] == null) return null; s += a[k]; } return s; };
const yoy = (a, i) => (i >= 4 && a[i] != null && a[i - 4] != null && Math.abs(a[i - 4]) > 1e-9 ? (a[i] - a[i - 4]) / Math.abs(a[i - 4]) : null);
const median = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const quant = (a, q) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; return b[Math.min(b.length - 1, Math.max(0, Math.round(q * (b.length - 1))))]; };
const stdev = (a) => { const b = a.filter((x) => x != null && isFinite(x)); if (b.length < 2) return null; const m = b.reduce((s, x) => s + x, 0) / b.length; return Math.sqrt(b.reduce((s, x) => s + (x - m) ** 2, 0) / b.length); };
const pctRank = (a, v) => { const b = a.filter((x) => x != null && isFinite(x)); if (!b.length || v == null) return null; return b.filter((x) => x < v).length / b.length; };
const qLabel = (d) => `Q${(+d.slice(5, 7)) / 3}/${d.slice(0, 4)}`;

export function analyzeFundamentals({ sym, S, bars, recs, tech, sectorStats }) {
  const K = keyItems(S), n = S.Q.length, L = n - 1;
  // số cổ phiếu: vốn góp / 10.000đ
  const charter = [...K.charter].reverse().find((v) => v > 0);
  const sharesM = charter ? charter * 0.1 : null;
  const price = bars[bars.length - 1].c; // nghìn đồng
  const ttm = (a) => sum4(a, L);
  const npTTM = ttm(K.np), revTTM = ttm(K.rev), cfoTTM = ttm(K.cfo);
  const eqP = (i) => (K.eq[i] != null ? K.eq[i] - nz(K.mi[i]) : null);
  const eps = sharesM && npTTM != null ? (npTTM * 1e9) / (sharesM * 1e6) : null; // đồng
  const bvps = sharesM && eqP(L) != null ? (eqP(L) * 1e9) / (sharesM * 1e6) : null;
  const mcap = sharesM ? (price * 1000 * sharesM * 1e6) / 1e9 : null; // tỷ
  const pe = eps > 0 ? (price * 1000) / eps : null, pb = bvps > 0 ? (price * 1000) / bvps : null;
  const avgEq = (i) => { const a = []; for (let k = Math.max(0, i - 4); k <= i; k++) if (eqP(k) != null) a.push(eqP(k)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const avgTA = (i) => { const a = []; for (let k = Math.max(0, i - 4); k <= i; k++) if (K.ta[k] != null) a.push(K.ta[k]); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
  const roeQ = K.np.map((_, i) => { const t = sum4(K.np, i), e = avgEq(i); return t != null && e > 0 ? t / e : null; });
  const roaQ = K.np.map((_, i) => { const t = sum4(K.np, i), a = avgTA(i); return t != null && a > 0 ? t / a : null; });
  const nmQ = K.np.map((_, i) => { const t = sum4(K.np, i), r = sum4(K.rev, i); return t != null && r > 0 ? t / r : null; });
  const gmQ = K.gp.map((_, i) => { const t = sum4(K.gp, i), r = sum4(K.rev, i); return t != null && r > 0 ? t / r : null; });
  const debt = K.debtST.map((v, i) => (v == null && K.debtLT[i] == null ? null : nz(v) + nz(K.debtLT[i])));
  const netCash = K.cash.map((v, i) => (v == null ? null : v + nz(K.stInv[i]) - nz(debt[i])));

  /* --- định giá lịch sử theo tuần (5 năm) --- */
  const lagDays = 45, series = [];
  if (sharesM) {
    const qEnd = S.Q.map((d) => new Date(d + 'T00:00:00Z').getTime() + lagDays * 864e5);
    let lastW = '';
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], w = b.t.slice(0, 8) + String(Math.floor((+b.t.slice(8, 10) - 1) / 7));
      if (w === lastW && i !== bars.length - 1) continue; lastW = w;
      const t = new Date(b.t + 'T00:00:00Z').getTime(); let qi = -1; for (let k = 0; k < n; k++) if (qEnd[k] <= t) qi = k;
      if (i === bars.length - 1) qi = L;
      if (qi < 3) continue;
      const e = sum4(K.np, qi), ep = e != null ? (e * 1e9) / (sharesM * 1e6) : null, bv = eqP(qi) != null ? (eqP(qi) * 1e9) / (sharesM * 1e6) : null;
      series.push([b.t, r1(b.c, 2), ep > 0 ? r1((b.c * 1000) / ep, 2) : null, bv > 0 ? r1((b.c * 1000) / bv, 3) : null]);
    }
  }
  const pes = series.map((x) => x[2]).filter((x) => x != null && x > 0 && x < 200), pbs = series.map((x) => x[3]).filter((x) => x != null && x > 0 && x < 50);
  const band = (a, cur) => (a.length >= 20 ? { med: r1(median(a), 2), sd: r1(stdev(a), 2), p10: r1(quant(a, 0.1), 2), p25: r1(quant(a, 0.25), 2), p75: r1(quant(a, 0.75), 2), p90: r1(quant(a, 0.9), 2), min: r1(Math.min(...a), 2), max: r1(Math.max(...a), 2), pct: r1(pctRank(a, cur), 3), n: a.length } : null);
  const PE = band(pes, pe), PB = band(pbs, pb);

  /* --- giá hợp lý --- */
  const recent = (recs || []).filter((r) => r[1] >= new Date(Date.now() - 183 * 864e5).toISOString().slice(0, 10));
  const tAvg = recent.length ? recent.reduce((s, r) => s + r[4], 0) / recent.length : null;
  const methods = [];
  if (PE && eps > 0 && pe < 80) methods.push(['P/E trung vị 5 năm × EPS', (PE.med * eps) / 1000]);
  if (PB && bvps > 0) methods.push(['P/B trung vị 5 năm × BVPS', (PB.med * bvps) / 1000]);
  if (tAvg) methods.push([`Giá mục tiêu TB ${recent.length} báo cáo CTCK`, tAvg]);
  let fair = methods.length ? median(methods.map((m) => m[1])) : null;
  if (fair != null) fair = clip(fair, price * 0.65, price * 1.35);
  const lowS = [PE && eps > 0 ? (PE.p25 * eps) / 1000 : null, PB && bvps > 0 ? (PB.p25 * bvps) / 1000 : null].filter((x) => x > 0);
  const highS = [PE && eps > 0 ? (PE.p75 * eps) / 1000 : null, PB && bvps > 0 ? (PB.p75 * bvps) / 1000 : null].filter((x) => x > 0);
  const up = fair ? fair / price - 1 : null;
  const rating = up == null ? null : up >= 0.25 ? 'Mua' : up >= 0.1 ? 'Nâng tỷ trọng' : up >= -0.05 ? 'Nắm giữ' : up >= -0.15 ? 'Giảm tỷ trọng' : 'Bán';

  /* --- tăng trưởng & chất lượng --- */
  const revY = yoy(K.rev, L), npY = yoy(K.np, L), revTTMy = L >= 7 ? (sum4(K.rev, L) / nz(sum4(K.rev, L - 4), NaN) - 1) : null, npTTMy = L >= 7 && sum4(K.np, L - 4) > 0 ? sum4(K.np, L) / sum4(K.np, L - 4) - 1 : null;
  const cq = npTTM > 0 && cfoTTM != null ? cfoTTM / npTTM : null;
  const de = eqP(L) > 0 && debt[L] != null ? debt[L] / eqP(L) : null;
  const cr = K.stL[L] > 0 && K.stA[L] != null ? K.stA[L] / K.stL[L] : null;
  const ic = sum4(K.intExp, L) > 0 && sum4(K.op, L) != null ? (sum4(K.op, L) + sum4(K.intExp, L)) / sum4(K.intExp, L) : null;
  const eqRatio = K.ta[L] > 0 && eqP(L) != null ? eqP(L) / K.ta[L] : null;

  /* --- chấm điểm 0–10 --- */
  const lin = (v, a, b) => (v == null || !isFinite(v) ? null : clip((v - a) / (b - a), 0, 1) * 10);
  const avg = (a) => { const b = a.filter((x) => x != null); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
  const last8 = K.np.slice(-8).filter((x) => x != null), posQ = last8.filter((x) => x > 0).length;
  const gmCV = (() => { const g = gmQ.slice(-8).filter((x) => x != null); if (g.length < 4) return null; const m = g.reduce((s, x) => s + x, 0) / g.length; return m > 0 ? (stdev(g) / m) : null; })();
  const revCagr = L >= 12 && sum4(K.rev, L - 12) > 0 && sum4(K.rev, L) > 0 ? Math.pow(sum4(K.rev, L) / sum4(K.rev, L - 12), 1 / 3) - 1 : null;
  const sBiz = avg([last8.length ? (posQ / last8.length) * 10 : null, lin(revCagr, -0.05, 0.15), gmCV == null ? null : 10 - lin(gmCV, 0.05, 0.5)]);
  const sEff = avg([lin(roeQ[L], 0, 0.22), lin(nmQ[L], 0, sectorStats ? Math.max(0.02, (sectorStats.nm || 0.08) * 1.6) : 0.15), lin(roaQ[L], 0, 0.1)]);
  const sHealth = S.kind === 'NON_FINANCE' ? avg([de == null ? null : 10 - lin(de, 0.3, 2), lin(cr, 0.8, 2), lin(ic, 1, 8), lin(cq, -0.5, 1)]) : avg([lin(eqRatio, S.kind === 'BANK' ? 0.04 : 0.1, S.kind === 'BANK' ? 0.11 : 0.5), lin(roaQ[L], 0, S.kind === 'BANK' ? 0.02 : 0.06)]);
  const sVal = avg([PE && PE.pct != null && pe ? 10 - PE.pct * 10 : null, PB && PB.pct != null ? 10 - PB.pct * 10 : null, lin(up, -0.2, 0.3)]);
  const sTech = tech != null ? tech / 10 : null;
  const parts = [sBiz, sEff, sHealth, sVal, sTech];
  const score = avg(parts);
  const notes = [];
  if (last8.length >= 4) { const prev = K.np.slice(L - 3, L).filter((x) => x != null); const m = prev.length ? prev.reduce((s, x) => s + x, 0) / prev.length : null; if (m > 0 && K.np[L] > 1.6 * m) notes.push('Quý gần nhất lợi nhuận tăng đột biến so với mặt bằng 3 quý trước — cần xác nhận xu hướng 1–2 quý tới.'); if (m > 0 && K.np[L] < 0.5 * m) notes.push('Lợi nhuận quý gần nhất giảm mạnh so với mặt bằng 3 quý trước.'); }
  if (K.np[L] < 0) notes.push('Doanh nghiệp lỗ trong quý gần nhất.');
  if (cq != null && cq < 0) notes.push('Dòng tiền kinh doanh 4 quý âm trong khi có lãi — lợi nhuận chưa thành tiền.');
  if (de != null && de > 1.5) notes.push(`Nợ vay cao: ${r1(de, 2)} lần vốn chủ.`);

  /* --- tóm tắt "Hiểu nhanh" --- */
  const quick = [];
  const ql = qLabel(S.Q[L]);
  if (revY != null && npY != null) quick.push(`${ql}: doanh thu ${revY >= 0 ? 'tăng' : 'giảm'} ${Math.abs(revY * 100).toFixed(1)}%, lợi nhuận ${npY >= 0 ? 'tăng' : 'giảm'} ${Math.abs(npY * 100).toFixed(1)}% so với cùng kỳ${roeQ[L] != null ? `; ROE ${(roeQ[L] * 100).toFixed(1)}%${roeQ[L] > 0.2 ? ' (rất cao)' : roeQ[L] > 0.15 ? ' (cao)' : roeQ[L] < 0.08 ? ' (thấp)' : ''}` : ''}.`);
  if (cq != null) quick.push(cq >= 1 ? 'Dòng tiền kinh doanh khớp hoặc vượt lợi nhuận — tăng trưởng có tiền thật.' : cq >= 0.5 ? 'Dòng tiền kinh doanh thấp hơn lợi nhuận — cần theo dõi phải thu và tồn kho.' : 'Dòng tiền kinh doanh lệch xa lợi nhuận — tăng trưởng chưa có tiền thật đỡ.');
  // giai đoạn dòng tiền
  const yrs = annual(S, K);
  const phase = (() => { const y = yrs.cfo.slice(-4).filter((x) => x != null), f = yrs.cfi.slice(-4).filter((x) => x != null); if (!y.length) return null;
    const cfoP = y.filter((x) => x > 0).length >= 3, inv = f.reduce((s, x) => s + x, 0) < -0.5 * Math.abs(y.reduce((s, x) => s + x, 0));
    return cfoP && inv ? 'Đầu tư mở rộng — kinh doanh tạo tiền và đang tái đầu tư' : cfoP ? 'Tạo tiền ổn định — tăng trưởng chậm, dòng tiền kinh doanh dương' : inv ? 'Đầu tư bằng vốn vay/huy động — kinh doanh chưa tạo đủ tiền' : 'Dòng tiền kinh doanh yếu — vốn kẹt ở tồn kho/phải thu'; })();

  const roundA = (a, d = 1) => a.map((v) => r1(v, d));
  const keep = ['rev', 'gp', 'cogs', 'sell', 'ga', 'finInc', 'finExp', 'intExp', 'op', 'other', 'pbt', 'tax', 'npat', 'np', 'minor', 'nii', 'prov', 'ta', 'liab', 'eq', 'mi', 'cash', 'stInv', 'recv', 'inv', 'othST', 'stA', 'fixed', 'cip', 'ltA', 'stL', 'ltL', 'debtST', 'debtLT', 'loans', 'deposits', 'cfo', 'cfi', 'cff', 'cashEnd', 'capex', 'dep', 'div'];
  const q = {}; keep.forEach((k) => { if (K[k].some((v) => v != null && v !== 0)) q[k] = roundA(K[k]); });
  return {
    sym, kind: S.kind, Q: S.Q, q, y: yrs,
    roe: roundA(roeQ, 4), roa: roundA(roaQ, 4), nm: roundA(nmQ, 4), gm: roundA(gmQ, 4),
    m: { price, sharesM: r1(sharesM, 2), mcap: r1(mcap, 0), eps: r1(eps, 0), bvps: r1(bvps, 0), pe: r1(pe, 2), pb: r1(pb, 2), revTTM: r1(revTTM), npTTM: r1(npTTM), cfoTTM: r1(cfoTTM),
      revY: r1(revY, 4), npY: r1(npY, 4), revTTMy: r1(revTTMy, 4), npTTMy: r1(npTTMy, 4), roe: r1(roeQ[L], 4), roa: r1(roaQ[L], 4), nm: r1(nmQ[L], 4), gm: r1(gmQ[L], 4), cq: r1(cq, 2), de: r1(de, 2), cr: r1(cr, 2), ic: r1(ic, 1), eqRatio: r1(eqRatio, 4),
      netCashPS: sharesM && netCash[L] != null ? r1((netCash[L] * 1e9) / (sharesM * 1e6), 0) : null, netCashMcap: mcap && netCash[L] != null ? r1(netCash[L] / mcap, 4) : null, lastQ: S.Q[L] },
    val: { PE, PB, series, fair: r1(fair, 2), methods: methods.map(([a, b]) => [a, r1(b, 2)]), low: lowS.length ? r1(Math.min(...lowS), 2) : null, high: highS.length ? r1(Math.max(...highS), 2) : null,
      zone: fair ? [r1(fair * 0.7, 2), r1(fair * 0.8, 2)] : null, rangeFair: methods.length ? [r1(Math.min(...methods.map((x) => x[1])), 2), r1(Math.max(...methods.map((x) => x[1])), 2)] : null, up: r1(up, 4), rating },
    score: { total: r1(score, 2), parts: parts.map((x) => r1(x, 1)), notes },
    quick, phase, recs: (recs || []).slice(0, 20),
  };
}
// gộp năm: dòng chảy = tổng 4 quý; số dư = quý 4
export function annual(S, K) {
  const years = [...new Set(S.Q.map((d) => d.slice(0, 4)))].filter((y) => S.Q.filter((d) => d.startsWith(y)).length === 4);
  const flow = ['rev', 'gp', 'np', 'npat', 'pbt', 'op', 'cfo', 'cfi', 'cff', 'capex', 'finInc', 'other'], stock = ['ta', 'eq', 'cashEnd'];
  const out = { years };
  flow.forEach((k) => (out[k] = years.map((y) => { const v = S.Q.map((d, i) => (d.startsWith(y) ? K[k][i] : undefined)).filter((x) => x !== undefined); return v.some((x) => x == null) ? null : r1(v.reduce((s, x) => s + x, 0)); })));
  stock.forEach((k) => (out[k] = years.map((y) => { const i = S.Q.indexOf(`${y}-12-31`); return i >= 0 ? r1(K[k][i]) : null; })));
  return out;
}
// bảng BCTC đầy đủ (12 quý gần nhất), triệu đồng
export function fullStatements(S, n = 12) {
  const from = Math.max(0, S.Q.length - n), out = { Q: S.Q.slice(from), t: {} };
  for (const [k, a] of Object.entries(S.raw)) { if (!a.slice(from).some((v) => v != null && v !== 0)) continue; out.t[k] = a.slice(from).map((v) => (v == null ? null : Math.round(v * 1000))); }
  return out;
}

// chuỗi lợi nhuận TTM và vốn chủ theo quý (để tính P/E, P/B của cả rổ theo ngày)
export function earnSeries(S, lagDays = 45) {
  const K = keyItems(S), n = S.Q.length;
  const charter = [...K.charter].reverse().find((v) => v > 0); if (!charter) return null;
  const qT = S.Q.map((d) => new Date(d + 'T00:00:00Z').getTime() + lagDays * 864e5);
  const ttm = K.np.map((_, i) => sum4(K.np, i));
  const eq = K.eq.map((v, i) => (v != null ? v - nz(K.mi[i]) : null));
  return { sh: charter * 0.1, qT, ttm, eq, n };
}
