/* ===== XANH TÍM ENGINE — chỉ báo, chấm điểm, backtest ===== */
const XT = (() => {
  const N = (a) => a.length;
  const nz = (v, d = 0) => (v == null || !isFinite(v) ? d : v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function sma(a, n) {
    const o = new Array(a.length).fill(null); let s = 0;
    for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; }
    return o;
  }
  function ema(a, n) {
    const o = new Array(a.length).fill(null), k = 2 / (n + 1); let prev = null, s = 0, cnt = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i]; if (v == null) continue;
      if (prev == null) { s += v; cnt++; if (cnt === n) { prev = s / n; o[i] = prev; } continue; }
      prev = v * k + prev * (1 - k); o[i] = prev;
    }
    return o;
  }
  function rma(a, n) {
    const o = new Array(a.length).fill(null); let prev = null, s = 0, cnt = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i]; if (v == null) continue;
      if (prev == null) { s += v; cnt++; if (cnt === n) { prev = s / n; o[i] = prev; } continue; }
      prev = (prev * (n - 1) + v) / n; o[i] = prev;
    }
    return o;
  }
  function stdev(a, n, m) {
    const o = new Array(a.length).fill(null);
    for (let i = n - 1; i < a.length; i++) {
      if (m[i] == null) continue; let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2;
      o[i] = Math.sqrt(s / n);
    }
    return o;
  }
  function highest(a, n, i) { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, a[j]); return m; }
  function lowest(a, n, i) { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, a[j]); return m; }

  function rsi(c, n = 14) {
    const up = [0], dn = [0];
    for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); }
    up[0] = null; dn[0] = null;
    const au = rma(up, n), ad = rma(dn, n);
    return au.map((u, i) => (u == null ? null : ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])));
  }
  function macd(c, f = 12, s = 26, g = 9) {
    const ef = ema(c, f), es = ema(c, s);
    const m = c.map((_, i) => (ef[i] == null || es[i] == null ? null : ef[i] - es[i]));
    const sig = ema(m, g);
    return { macd: m, signal: sig, hist: m.map((v, i) => (v == null || sig[i] == null ? null : v - sig[i])) };
  }
  function trueRange(b) { return b.map((x, i) => (i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)))); }
  function atr(b, n = 14) { return rma(trueRange(b), n); }
  function adx(b, n = 14) {
    const pdm = [null], mdm = [null], tr = trueRange(b); tr[0] = null;
    for (let i = 1; i < b.length; i++) {
      const u = b[i].h - b[i - 1].h, d = b[i - 1].l - b[i].l;
      pdm.push(u > d && u > 0 ? u : 0); mdm.push(d > u && d > 0 ? d : 0);
    }
    const atr_ = rma(tr, n), sp = rma(pdm, n), sm = rma(mdm, n);
    const pdi = sp.map((v, i) => (v == null || !atr_[i] ? null : (100 * v) / atr_[i]));
    const mdi = sm.map((v, i) => (v == null || !atr_[i] ? null : (100 * v) / atr_[i]));
    const dx = pdi.map((p, i) => (p == null ? null : p + mdi[i] === 0 ? 0 : (100 * Math.abs(p - mdi[i])) / (p + mdi[i])));
    return { adx: rma(dx, n), pdi, mdi };
  }
  function bollinger(c, n = 20, k = 2) {
    const mid = sma(c, n), sd = stdev(c, n, mid);
    const up = mid.map((m, i) => (m == null ? null : m + k * sd[i])), lo = mid.map((m, i) => (m == null ? null : m - k * sd[i]));
    return { mid, up, lo,
      pctB: c.map((v, i) => (mid[i] == null || up[i] === lo[i] ? null : (v - lo[i]) / (up[i] - lo[i]))),
      bw: mid.map((m, i) => (m == null || !m ? null : (up[i] - lo[i]) / m)) };
  }
  function stoch(b, n = 14, sk = 3, sd = 3) {
    const raw = b.map((x, i) => {
      if (i < n - 1) return null;
      let hh = -Infinity, ll = Infinity;
      for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, b[j].h); ll = Math.min(ll, b[j].l); }
      return hh === ll ? 50 : (100 * (x.c - ll)) / (hh - ll);
    });
    const k = smaNull(raw, sk), d = smaNull(k, sd);
    return { k, d };
  }
  function smaNull(a, n) {
    const o = new Array(a.length).fill(null);
    for (let i = n - 1; i < a.length; i++) { let s = 0, ok = true; for (let j = i - n + 1; j <= i; j++) { if (a[j] == null) { ok = false; break; } s += a[j]; } if (ok) o[i] = s / n; }
    return o;
  }
  function obv(b) { const o = [0]; for (let i = 1; i < b.length; i++) o.push(o[i - 1] + (b[i].c > b[i - 1].c ? b[i].v : b[i].c < b[i - 1].c ? -b[i].v : 0)); return o; }
  function mfi(b, n = 14) {
    const tp = b.map((x) => (x.h + x.l + x.c) / 3), o = new Array(b.length).fill(null);
    for (let i = n; i < b.length; i++) {
      let p = 0, m = 0;
      for (let j = i - n + 1; j <= i; j++) { const f = tp[j] * b[j].v; if (tp[j] > tp[j - 1]) p += f; else if (tp[j] < tp[j - 1]) m += f; }
      o[i] = m === 0 ? 100 : 100 - 100 / (1 + p / m);
    }
    return o;
  }
  function supertrend(b, n = 10, m = 3) {
    const a = atr(b, n), line = new Array(b.length).fill(null), dir = new Array(b.length).fill(0);
    let fu = null, fl = null, d = 1;
    for (let i = 0; i < b.length; i++) {
      if (a[i] == null) continue;
      const hl2 = (b[i].h + b[i].l) / 2, bu = hl2 + m * a[i], bl = hl2 - m * a[i];
      const pc = i > 0 ? b[i - 1].c : b[i].c;
      fu = fu == null || bu < fu || pc > fu ? bu : fu;
      fl = fl == null || bl > fl || pc < fl ? bl : fl;
      if (d === 1 && b[i].c < fl) d = -1; else if (d === -1 && b[i].c > fu) d = 1;
      dir[i] = d; line[i] = d === 1 ? fl : fu;
    }
    return { line, dir };
  }
  function ichimoku(b) {
    const H = b.map((x) => x.h), L = b.map((x) => x.l);
    const md = (n, i) => (i < n - 1 ? null : (highest(H, n, i) + lowest(L, n, i)) / 2);
    const tenkan = b.map((_, i) => md(9, i)), kijun = b.map((_, i) => md(26, i));
    const aRaw = b.map((_, i) => (tenkan[i] == null || kijun[i] == null ? null : (tenkan[i] + kijun[i]) / 2));
    const bRaw = b.map((_, i) => md(52, i));
    // Mây tại bar i = giá trị tính ở i-26 (đã dịch tới 26 phiên)
    const spanA = b.map((_, i) => (i >= 26 ? aRaw[i - 26] : null)), spanB = b.map((_, i) => (i >= 26 ? bRaw[i - 26] : null));
    return { tenkan, kijun, spanA, spanB, aRaw, bRaw };
  }

  /* ---- Cấu trúc thị trường (Smart Money: BOS / CHoCH) ---- */
  function pivots(b, L = 5, R = 5) {
    const hs = [], ls = [];
    for (let i = L; i < b.length - R; i++) {
      let isH = true, isL = true;
      for (let j = i - L; j <= i + R; j++) { if (j === i) continue; if (b[j].h >= b[i].h) isH = false; if (b[j].l <= b[i].l) isL = false; }
      if (isH) hs.push({ i, p: b[i].h, conf: i + R });
      if (isL) ls.push({ i, p: b[i].l, conf: i + R });
    }
    return { hs, ls };
  }
  function structure(b, L = 5, R = 5) {
    const { hs, ls } = pivots(b, L, R), state = new Array(b.length).fill(0), events = [];
    let hi = 0, li = 0, sh = null, sl = null, t = 0;
    for (let i = 0; i < b.length; i++) {
      while (hi < hs.length && hs[hi].conf <= i) { sh = { ...hs[hi], broken: false }; hi++; }
      while (li < ls.length && ls[li].conf <= i) { sl = { ...ls[li], broken: false }; li++; }
      if (sh && !sh.broken && b[i].c > sh.p) { events.push({ i, from: sh.i, p: sh.p, dir: 1, kind: t <= 0 ? 'CHoCH' : 'BOS' }); t = 1; sh.broken = true; }
      if (sl && !sl.broken && b[i].c < sl.p) { events.push({ i, from: sl.i, p: sl.p, dir: -1, kind: t >= 0 ? 'CHoCH' : 'BOS' }); t = -1; sl.broken = true; }
      state[i] = t;
    }
    return { state, events, hs, ls };
  }

  /* ---- Vùng hỗ trợ / kháng cự từ cụm đỉnh đáy ---- */
  function zones(b, a, look = 250) {
    const n = b.length, last = b[n - 1].c, A = nz(a[n - 1], last * 0.02);
    const { hs, ls } = pivots(b, 4, 4);
    const pts = [...hs, ...ls].filter((p) => p.i >= n - look).map((p) => ({ p: p.p, i: p.i })).sort((x, y) => x.p - y.p);
    const cl = [];
    for (const p of pts) {
      const c = cl[cl.length - 1];
      if (c && p.p - c.lo <= A * 1.1) { c.hi = Math.max(c.hi, p.p); c.n++; c.last = Math.max(c.last, p.i); }
      else cl.push({ lo: p.p, hi: p.p, n: 1, last: p.i });
    }
    cl.forEach((c) => { if (c.hi - c.lo < A * 0.35) { const m = (c.hi + c.lo) / 2; c.lo = m - A * 0.18; c.hi = m + A * 0.18; } c.score = c.n + (c.last > n - 60 ? 1 : 0); });
    let sup = cl.filter((c) => c.hi < last).sort((x, y) => y.hi - x.hi);
    let res = cl.filter((c) => c.lo > last).sort((x, y) => x.lo - y.lo);
    sup = pickStrong(sup, A); res = pickStrong(res, A);
    if (res.length < 2) {
      const top = res.length ? res[res.length - 1].hi : last;
      for (let k = res.length; k < 2; k++) res.push({ lo: top + A * (1.5 + 2 * k), hi: top + A * (2 + 2 * k), n: 0, projected: true });
    }
    if (sup.length < 2) {
      const bot = sup.length ? sup[sup.length - 1].lo : last;
      for (let k = sup.length; k < 2; k++) sup.push({ lo: bot - A * (2 + 2 * k), hi: bot - A * (1.5 + 2 * k), n: 0, projected: true });
    }
    return { sup: sup.slice(0, 2), res: res.slice(0, 2) };
  }
  function pickStrong(list, A) { // bỏ các vùng quá sát nhau, ưu tiên vùng nhiều lần chạm
    const out = [];
    for (const z of list) { if (out.some((o) => Math.abs((o.lo + o.hi) / 2 - (z.lo + z.hi) / 2) < A * 1.2)) continue; out.push(z); if (out.length === 2) break; }
    return out;
  }

  /* ---- Tính toàn bộ chỉ báo ---- */
  function compute(bars) {
    const c = bars.map((x) => x.c), v = bars.map((x) => x.v), H = bars.map((x) => x.h), L = bars.map((x) => x.l);
    const I = {
      c, v, H, L,
      ma5: sma(c, 5), ma20: sma(c, 20), ma50: sma(c, 50), ma150: sma(c, 150), ma200: sma(c, 200),
      e8: ema(c, 8), e13: ema(c, 13), e21: ema(c, 21), e34: ema(c, 34),
      rsi: rsi(c, 14), rsi2: rsi(c, 2), macd: macd(c), atr: atr(bars, 14), adx: adx(bars, 14),
      bb: bollinger(c, 20, 2), st: stoch(bars), obv: obv(bars), mfi: mfi(bars, 14),
      sup: supertrend(bars, 10, 3), ich: ichimoku(bars), vma20: sma(v, 20),
    };
    I.obvE = ema(I.obv, 20);
    I.str = structure(bars, 5, 5);
    // Xanh Tím: ribbon EMA8/EMA21 + MACD histogram
    I.xt = c.map((x, i) => {
      const f = I.e8[i], s = I.e21[i], h = I.macd.hist[i];
      if (f == null || s == null || h == null) return 0;
      if (f > s && x > s && h > 0) return 1;
      if (f < s && x < s) return -1;
      return 0;
    });
    // Mây xu hướng: EMA34 ± 2.2 ATR, màu theo SuperTrend
    I.cloudUp = I.e34.map((m, i) => (m == null || I.atr[i] == null ? null : m + 2.2 * I.atr[i]));
    I.cloudLo = I.e34.map((m, i) => (m == null || I.atr[i] == null ? null : m - 2.2 * I.atr[i]));
    // Elder Impulse
    I.imp = c.map((_, i) => {
      if (i < 1 || I.e13[i] == null || I.e13[i - 1] == null || I.macd.hist[i] == null || I.macd.hist[i - 1] == null) return 0;
      const a = I.e13[i] > I.e13[i - 1], b = I.macd.hist[i] > I.macd.hist[i - 1];
      return a && b ? 1 : !a && !b ? -1 : 0;
    });
    // Bollinger squeeze: độ rộng dải thấp trong 120 phiên
    I.squeeze = c.map((_, i) => {
      if (i < 130) return false;
      let mn = Infinity; for (let j = i - 10; j <= i; j++) mn = Math.min(mn, nz(I.bb.bw[j], Infinity));
      const w = []; for (let j = i - 120; j <= i; j++) if (I.bb.bw[j] != null) w.push(I.bb.bw[j]);
      w.sort((a, b) => a - b); return mn <= w[Math.floor(w.length * 0.2)];
    });
    // Minervini Trend Template (5 tiêu chí giá)
    I.tt = c.map((x, i) => {
      if (i < 252 || I.ma200[i - 21] == null) return 0;
      const hi = highest(H, 252, i), lo = lowest(L, 252, i);
      return (x > I.ma150[i] && x > I.ma200[i]) + (I.ma150[i] > I.ma200[i]) + (I.ma200[i] > I.ma200[i - 21]) + (x >= lo * 1.3) + (x >= hi * 0.75) + (I.ma50[i] > I.ma150[i]);
    });
    return I;
  }

  /* ---- 15 trường phái: điều kiện vào/ra + điểm trạng thái ---- */
  const prev = (a, i) => (i > 0 ? a[i - 1] : null);
  const crossUp = (a, b, i) => i > 0 && a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i] > b[i] && a[i - 1] <= b[i - 1];
  const crossDn = (a, b, i) => crossUp(b, a, i);

  const STRATS = [
    { id: 'ma', name: 'Xu hướng MA 20/50/200', school: 'Charles Dow · Stan Weinstein (Stage 2)',
      rule: 'Mua khi giá trên MA50, MA50 trên MA200 và MA200 đi lên (giai đoạn 2). Bán khi đóng cửa dưới MA50.',
      entry: (I, i) => I.ma200[i - 20] != null && I.c[i] > I.ma50[i] && I.ma50[i] > I.ma200[i] && I.ma200[i] > I.ma200[i - 20],
      exit: (I, i) => I.ma50[i] != null && I.c[i] < I.ma50[i],
      score: (I, i) => (I.ma200[i] == null || I.ma200[i - 20] == null ? 0 :
        (I.c[i] > I.ma20[i] ? 0.25 : -0.25) + (I.c[i] > I.ma50[i] ? 0.25 : -0.25) + (I.ma50[i] > I.ma200[i] ? 0.25 : -0.25) + (I.ma200[i] > I.ma200[i - 20] ? 0.25 : -0.25)),
      state: (I, i) => (I.ma50[i] == null ? '—' : `Giá ${I.c[i] > I.ma50[i] ? 'trên' : 'dưới'} MA50, MA50 ${I.ma200[i] != null && I.ma50[i] > I.ma200[i] ? 'trên' : 'dưới'} MA200`) },

    { id: 'xt', name: 'Xanh Tím (ribbon EMA + MACD)', school: 'Hệ thống xu hướng kiểu "xanh tím" phổ biến ở VN',
      rule: 'Nến chuyển XANH khi EMA8 > EMA21, giá trên EMA21 và MACD histogram dương → mua. Chuyển TÍM khi EMA8 < EMA21 và giá dưới EMA21 → bán.',
      entry: (I, i) => I.xt[i] === 1 && prev(I.xt, i) !== 1, exit: (I, i) => I.xt[i] === -1,
      score: (I, i) => I.xt[i], state: (I, i) => (I.xt[i] === 1 ? 'Nến XANH' : I.xt[i] === -1 ? 'Nến TÍM' : 'Trung tính') },

    { id: 'elder', name: 'Elder Impulse', school: 'Alexander Elder',
      rule: 'Thanh xanh (EMA13 và MACD-hist cùng tăng) → mua. Thanh đỏ (cùng giảm) → bán. Thanh lam giữ nguyên.',
      entry: (I, i) => I.imp[i] === 1 && prev(I.imp, i) !== 1, exit: (I, i) => I.imp[i] === -1,
      score: (I, i) => I.imp[i], state: (I, i) => (I.imp[i] === 1 ? 'Xung lực tăng' : I.imp[i] === -1 ? 'Xung lực giảm' : 'Trung lập') },

    { id: 'macd', name: 'MACD giao cắt', school: 'Gerald Appel',
      rule: 'Mua khi MACD cắt lên đường tín hiệu. Bán khi cắt xuống.',
      entry: (I, i) => crossUp(I.macd.macd, I.macd.signal, i), exit: (I, i) => crossDn(I.macd.macd, I.macd.signal, i),
      score: (I, i) => { const h = I.macd.hist[i], p = prev(I.macd.hist, i); if (h == null || p == null) return 0; return h > 0 ? (h > p ? 1 : 0.35) : h > p ? -0.3 : -1; },
      state: (I, i) => (I.macd.hist[i] == null ? '—' : `Histogram ${I.macd.hist[i] > 0 ? 'dương' : 'âm'}, ${I.macd.hist[i] > nz(prev(I.macd.hist, i)) ? 'đang tăng' : 'đang giảm'}`) },

    { id: 'rsi', name: 'RSI(2) quá bán trong xu hướng tăng', school: 'J. Welles Wilder · Larry Connors',
      rule: 'Mua khi giá trên MA200 và RSI(2) < 10 (điều chỉnh ngắn trong xu hướng tăng). Bán khi giá đóng cửa trên MA5.',
      entry: (I, i) => I.ma200[i] != null && I.c[i] > I.ma200[i] && I.rsi2[i] < 10, exit: (I, i) => I.ma5[i] != null && I.c[i] > I.ma5[i],
      score: (I, i) => { const r = I.rsi[i]; if (r == null) return 0; const up = I.ma200[i] != null && I.c[i] > I.ma200[i];
        if (r >= 80) return -0.5; if (r >= 70) return 0.3; if (r >= 50) return 0.8; if (r >= 40) return -0.2; if (r >= 30) return -0.6; return up ? 0.3 : -0.4; },
      state: (I, i) => `RSI14 = ${nz(I.rsi[i]).toFixed(0)}, RSI2 = ${nz(I.rsi2[i]).toFixed(0)}` },

    { id: 'stoch', name: 'Stochastic', school: 'George Lane',
      rule: 'Mua khi %K cắt lên %D ở vùng dưới 25. Bán khi %K cắt xuống %D ở vùng trên 75.',
      entry: (I, i) => crossUp(I.st.k, I.st.d, i) && I.st.k[i] < 25, exit: (I, i) => crossDn(I.st.k, I.st.d, i) && I.st.k[i] > 75,
      score: (I, i) => { const k = I.st.k[i], d = I.st.d[i]; if (k == null || d == null) return 0;
        if (k < 20 && k > d) return 1; if (k > 80 && k < d) return -1; return k > d ? 0.5 : -0.5; },
      state: (I, i) => `%K ${nz(I.st.k[i]).toFixed(0)} / %D ${nz(I.st.d[i]).toFixed(0)}` },

    { id: 'adx', name: 'ADX / DMI', school: 'J. Welles Wilder',
      rule: 'Mua khi +DI > −DI và ADX > 20 đang tăng (xu hướng có lực). Bán khi −DI vượt +DI.',
      entry: (I, i) => { const a = I.adx; return a.adx[i] != null && a.adx[i - 1] != null && a.pdi[i] > a.mdi[i] && a.adx[i] > 20 && a.adx[i] > a.adx[i - 1] && !(a.pdi[i - 1] > a.mdi[i - 1] && a.adx[i - 1] > 20 && a.adx[i - 1] > nz(a.adx[i - 2])); },
      exit: (I, i) => I.adx.mdi[i] > I.adx.pdi[i],
      score: (I, i) => { const a = I.adx; if (a.adx[i] == null) return 0; const d = a.pdi[i] > a.mdi[i] ? 1 : -1; return d * Math.max(0.2, clamp((a.adx[i] - 15) / 20, 0, 1)); },
      state: (I, i) => `ADX ${nz(I.adx.adx[i]).toFixed(0)}, ${I.adx.pdi[i] > I.adx.mdi[i] ? '+DI dẫn' : '−DI dẫn'}` },

    { id: 'ichi', name: 'Ichimoku Kinko Hyo', school: 'Goichi Hosoda',
      rule: 'Mua khi giá trên mây, Tenkan > Kijun và Chikou trên giá 26 phiên trước. Bán khi đóng cửa dưới Kijun.',
      entry: (I, i) => { const ok = (j) => { const g = I.ich; if (g.spanA[j] == null || g.spanB[j] == null || j < 26) return false; return I.c[j] > Math.max(g.spanA[j], g.spanB[j]) && g.tenkan[j] > g.kijun[j] && I.c[j] > I.c[j - 26]; }; return ok(i) && !ok(i - 1); },
      exit: (I, i) => I.ich.kijun[i] != null && I.c[i] < I.ich.kijun[i],
      score: (I, i) => { const g = I.ich; if (g.spanA[i] == null || g.spanB[i] == null) return 0; const top = Math.max(g.spanA[i], g.spanB[i]), bot = Math.min(g.spanA[i], g.spanB[i]);
        return (I.c[i] > top ? 0.5 : I.c[i] < bot ? -0.5 : 0) + (g.tenkan[i] > g.kijun[i] ? 0.3 : -0.3) + (i >= 26 ? (I.c[i] > I.c[i - 26] ? 0.2 : -0.2) : 0); },
      state: (I, i) => { const g = I.ich; if (g.spanA[i] == null) return '—'; const top = Math.max(g.spanA[i], g.spanB[i]), bot = Math.min(g.spanA[i], g.spanB[i]); return I.c[i] > top ? 'Giá trên mây' : I.c[i] < bot ? 'Giá dưới mây' : 'Giá trong mây'; } },

    { id: 'super', name: 'SuperTrend (ATR 10×3)', school: 'Olivier Seban · ATR của Wilder',
      rule: 'Mua khi SuperTrend đảo sang tăng. Bán khi đảo sang giảm.',
      entry: (I, i) => I.sup.dir[i] === 1 && prev(I.sup.dir, i) === -1, exit: (I, i) => I.sup.dir[i] === -1,
      score: (I, i) => I.sup.dir[i], state: (I, i) => (I.sup.dir[i] === 1 ? 'Xu hướng tăng' : I.sup.dir[i] === -1 ? 'Xu hướng giảm' : '—') },

    { id: 'bb', name: 'Bollinger Squeeze bứt phá', school: 'John Bollinger',
      rule: 'Khi dải Bollinger co hẹp (thấp nhất 20% trong 6 tháng) và giá đóng cửa vượt dải trên → mua. Bán khi đóng cửa dưới dải giữa.',
      entry: (I, i) => I.squeeze[i] && I.bb.up[i] != null && I.c[i] > I.bb.up[i], exit: (I, i) => I.bb.mid[i] != null && I.c[i] < I.bb.mid[i],
      score: (I, i) => { const p = I.bb.pctB[i]; if (p == null) return 0; if (p > 1) return 0.6; if (p < 0) return -0.6; return (p - 0.5) * 0.9; },
      state: (I, i) => `%B = ${nz(I.bb.pctB[i]).toFixed(2)}${I.squeeze[i] ? ', đang co hẹp' : ''}` },

    { id: 'obv', name: 'Dòng tiền OBV + MFI', school: 'Joseph Granville · Gene Quong & Avrum Soudack',
      rule: 'Mua khi OBV cắt lên EMA20 của nó, giá trên MA50 và MFI chưa quá mua. Bán khi OBV cắt xuống.',
      entry: (I, i) => crossUp(I.obv, I.obvE, i) && I.ma50[i] != null && I.c[i] > I.ma50[i] && nz(I.mfi[i], 50) < 80, exit: (I, i) => crossDn(I.obv, I.obvE, i),
      score: (I, i) => { if (I.obvE[i] == null) return 0; const m = nz(I.mfi[i], 50); return (I.obv[i] > I.obvE[i] ? 0.5 : -0.5) + (m > 80 ? -0.3 : m < 20 ? 0.3 : m >= 50 ? 0.3 : -0.2); },
      state: (I, i) => `OBV ${I.obv[i] > nz(I.obvE[i]) ? 'trên' : 'dưới'} EMA20, MFI ${nz(I.mfi[i]).toFixed(0)}` },

    { id: 'vsa', name: 'Khối lượng đột biến (VSA)', school: 'Richard Wyckoff · Tom Williams',
      rule: 'Mua khi phiên tăng có khối lượng ≥ 1,8 lần trung bình 20 phiên, đóng cửa gần đỉnh phiên, giá trên MA20. Bán khi đóng cửa dưới MA20.',
      entry: (I, i, B) => I.vma20[i] != null && B[i].v >= 1.8 * I.vma20[i] && B[i].c > B[i].o && B[i].c >= B[i].h - (B[i].h - B[i].l) * 0.3 && I.c[i] > nz(I.ma20[i], Infinity),
      exit: (I, i) => I.ma20[i] != null && I.c[i] < I.ma20[i],
      score: (I, i, B) => { if (I.vma20[i] == null) return 0; const r = B[i].v / I.vma20[i];
        if (r >= 1.5) return B[i].c >= B[i].o ? 1 : -1;
        let u = 0, d = 0; for (let j = Math.max(1, i - 9); j <= i; j++) { if (B[j].c > B[j - 1].c) u += B[j].v; else if (B[j].c < B[j - 1].c) d += B[j].v; }
        return u + d === 0 ? 0 : (u - d) / (u + d); },
      state: (I, i, B) => `KL = ${I.vma20[i] ? (B[i].v / I.vma20[i]).toFixed(1) : '—'}× TB20` },

    { id: 'smc', name: 'Cấu trúc thị trường BOS/CHoCH', school: 'Smart Money Concepts · ICT',
      rule: 'Mua khi giá đóng cửa phá đỉnh swing gần nhất (BOS/CHoCH tăng). Bán khi phá đáy swing (CHoCH giảm).',
      entry: (I, i) => I.str.state[i] === 1 && prev(I.str.state, i) !== 1, exit: (I, i) => I.str.state[i] === -1,
      score: (I, i) => I.str.state[i], state: (I, i) => (I.str.state[i] === 1 ? 'Cấu trúc tăng' : I.str.state[i] === -1 ? 'Cấu trúc giảm' : '—') },

    { id: 'sepa', name: 'Trend Template + điểm pivot', school: "Mark Minervini (SEPA) · William O'Neil (CAN SLIM)",
      rule: 'Đạt ≥5/6 tiêu chí Trend Template, giá vượt đỉnh 20 phiên với khối lượng ≥ 1,3 lần TB → mua. Bán khi đóng cửa dưới MA50 (kèm cắt lỗ 7–8%).',
      entry: (I, i, B) => I.tt[i] >= 5 && i > 21 && I.c[i] > highest(I.H, 20, i - 1) && I.vma20[i] != null && B[i].v >= 1.3 * I.vma20[i],
      exit: (I, i) => I.ma50[i] != null && I.c[i] < I.ma50[i],
      score: (I, i) => (i < 252 ? 0 : (I.tt[i] / 6) * 2 - 1), state: (I, i) => (i < 252 ? 'Cần ≥ 1 năm dữ liệu' : `Đạt ${I.tt[i]}/6 tiêu chí`) },

    { id: 'turtle', name: 'Kênh Donchian (Turtle / Darvas)', school: 'Richard Dennis · Nicolas Darvas',
      rule: 'Mua khi giá đóng cửa vượt đỉnh cao nhất 20 phiên trước. Bán khi thủng đáy thấp nhất 10 phiên.',
      entry: (I, i) => i > 21 && I.c[i] > highest(I.H, 20, i - 1), exit: (I, i) => i > 11 && I.c[i] < lowest(I.L, 10, i - 1),
      score: (I, i) => { if (i < 56) return 0; if (I.c[i] >= highest(I.H, 55, i - 1)) return 1; if (I.c[i] <= lowest(I.L, 20, i - 1)) return -1;
        const hh = highest(I.H, 20, i), ll = lowest(I.L, 20, i); return hh === ll ? 0 : (((I.c[i] - ll) / (hh - ll)) * 2 - 1) * 0.5; },
      state: (I, i) => { if (i < 21) return '—'; const hh = highest(I.H, 20, i), ll = lowest(I.L, 20, i); return `Vị trí trong kênh 20 phiên: ${hh === ll ? 50 : Math.round(((I.c[i] - ll) / (hh - ll)) * 100)}%`; } },
  ];

  /* ---- Backtest: chỉ mua (thị trường VN không bán khống), T+2, phí, thuế, cắt lỗ ---- */
  function backtest(bars, entryArr, exitArr, opt = {}) {
    const o = { fee: 0.0015, tax: 0.001, sl: 0.07, t2: true, start: 0, ...opt };
    const n = bars.length, trades = [], eq = new Array(n).fill(null);
    let pos = null, pendBuy = false, pendSell = false, cash = 1;
    for (let i = o.start; i < n; i++) {
      const b = bars[i];
      const canSell = () => !o.t2 || i - pos.ei >= 2;
      if (pendBuy && !pos) { pos = { ei: i, ep: b.o, shares: (cash * (1 - o.fee)) / b.o, stop: o.sl > 0 ? b.o * (1 - o.sl) : -1 }; pendBuy = false; }
      if (pos && pendSell && canSell()) { close(i, b.o, 'Tín hiệu bán'); pendSell = false; }
      if (pos && o.sl > 0 && canSell() && b.l <= pos.stop) close(i, Math.min(b.o, pos.stop), 'Cắt lỗ');
      if (!pos && entryArr[i] && i < n - 1) pendBuy = true;
      if (pos && exitArr[i]) pendSell = true;
      eq[i] = pos ? pos.shares * b.c * (1 - o.fee - o.tax) : cash;
    }
    let open = null;
    if (pos) { const b = bars[n - 1]; open = { ei: pos.ei, ep: pos.ep, last: b.c, ret: (b.c * (1 - o.fee - o.tax)) / (pos.ep / (1 - o.fee) ) - 1, pendingSell: pendSell }; }
    function close(i, px, why) {
      const val = pos.shares * px * (1 - o.fee - o.tax);
      trades.push({ ei: pos.ei, xi: i, ep: pos.ep, xp: px, ret: val / cash - 1, why });
      cash = val; pos = null;
    }
    return { trades, eq, open, pendingBuy: pendBuy, stats: stats(bars, trades, eq, o.start) };
  }
  function stats(bars, trades, eq, start) {
    const n = bars.length, wins = trades.filter((t) => t.ret > 0), losses = trades.filter((t) => t.ret <= 0);
    const gw = wins.reduce((s, t) => s + t.ret, 0), gl = -losses.reduce((s, t) => s + t.ret, 0);
    let peak = 0, mdd = 0, inMkt = 0;
    for (let i = start; i < n; i++) { const e = eq[i]; if (e == null) continue; peak = Math.max(peak, e); mdd = Math.max(mdd, 1 - e / peak); }
    trades.forEach((t) => (inMkt += t.xi - t.ei));
    const final = eq[n - 1] ?? 1, yrs = Math.max((n - start) / 250, 0.1);
    return {
      n: trades.length, win: trades.length ? wins.length / trades.length : 0,
      avgW: wins.length ? gw / wins.length : 0, avgL: losses.length ? -gl / losses.length : 0,
      pf: gl > 0 ? gw / gl : gw > 0 ? 9.99 : 0, ret: final - 1, cagr: Math.pow(Math.max(final, 1e-6), 1 / yrs) - 1, mdd,
      exp: trades.length ? trades.reduce((s, t) => s + t.ret, 0) / trades.length : 0, exposure: inMkt / Math.max(1, n - start),
      bh: bars[n - 1].c / bars[Math.min(start + 1, n - 1)].o - 1,
    };
  }

  /* ---- Điểm tổng hợp với trọng số học từ lịch sử (walk-forward, không nhìn trước) ---- */
  function weightFrom(pfNum, pfDen, cnt) {
    if (cnt === 0) return 1;
    const pf = pfDen > 0 ? pfNum / pfDen : pfNum > 0 ? 3 : 1;
    return clamp(1 + clamp(pf - 1, -0.75, 1) * Math.min(1, cnt / 8), 0.25, 2);
  }
  function analyze(bars, opt = {}) {
    const I = compute(bars), n = bars.length;
    const all = STRATS.map((s) => {
      const en = bars.map((_, i) => i > 25 && !!s.entry(I, i, bars)), ex = bars.map((_, i) => i > 0 && !!s.exit(I, i, bars));
      const sc = bars.map((_, i) => clamp(nz(s.score(I, i, bars)), -1, 1));
      return { s, en, ex, sc, bt: backtest(bars, en, ex, { ...opt, start: 0 }) };
    });
    // walk-forward weights: chỉ dùng các lệnh đã đóng trước phiên i
    const score = new Array(n).fill(null), wNow = [];
    const acc = all.map(() => ({ w: 0, l: 0, c: 0, k: 0 }));
    const sorted = all.map((a) => [...a.bt.trades].sort((x, y) => x.xi - y.xi));
    for (let i = 0; i < n; i++) {
      let num = 0, den = 0;
      all.forEach((a, k) => {
        const A = acc[k], T = sorted[k];
        while (A.k < T.length && T[A.k].xi < i) { const r = T[A.k].ret; if (r > 0) A.w += r; else A.l -= r; A.c++; A.k++; }
        const w = opt.equal ? 1 : weightFrom(A.w, A.l, A.c);
        num += w * a.sc[i]; den += w;
        if (i === n - 1) wNow.push(w);
      });
      score[i] = i < 60 ? null : 50 + 50 * (num / den);
    }
    const factors = all.map((a, k) => ({ id: a.s.id, name: a.s.name, school: a.s.school, rule: a.s.rule, s: a.sc[n - 1], w: wNow[k], state: a.s.state(I, n - 1, bars), bt: a.bt, en: a.en, ex: a.ex }));
    return { I, score, factors, zones: zones(bars, I.atr) };
  }
  function label(s) {
    if (s == null) return { t: 'Chưa đủ dữ liệu', k: 'neu' };
    if (s >= 75) return { t: 'MUA MẠNH', k: 'buy2' };
    if (s >= 60) return { t: 'MUA / NẮM GIỮ', k: 'buy' };
    if (s >= 45) return { t: 'THEO DÕI', k: 'neu' };
    if (s >= 30) return { t: 'GIẢM TỶ TRỌNG', k: 'sell' };
    return { t: 'BÁN / ĐỨNG NGOÀI', k: 'sell2' };
  }
  function compositeBT(bars, score, buyT, sellT, opt) {
    const en = score.map((s, i) => s != null && s >= buyT && (score[i - 1] == null || score[i - 1] < buyT));
    const ex = score.map((s) => s != null && s <= sellT);
    return { en, ex, bt: backtest(bars, en, ex, opt) };
  }

  /* ---- Kế hoạch giao dịch ---- */
  function plan(bars, A) {
    const n = bars.length, last = bars[n - 1].c, a = nz(A.I.atr[n - 1], last * 0.02), { sup, res } = A.zones;
    const s1 = sup[0], r1 = res[0], r2 = res[1];
    const nearSup = (last - s1.hi) / a < 1.2;
    const entryLo = nearSup ? s1.lo : Math.max(s1.hi, last - 0.8 * a), entryHi = nearSup ? Math.min(last, s1.hi + 0.3 * a) : last;
    const mid = (entryLo + entryHi) / 2;
    let stop = Math.min(s1.lo - 0.5 * a, mid * 0.97);
    stop = Math.max(stop, mid * 0.92); // không để rủi ro quá 8% (quy tắc O'Neil)
    const t1 = r1.lo, t2 = r2.lo, rr = (t1 - mid) / Math.max(mid - stop, 1e-9);
    return { entryLo, entryHi, mid, stop, t1, t2, rr, risk: 1 - stop / mid, nearSup };
  }

  /* ---- Phân tích cơ bản ---- */
  function fundamentals(q, price) { // q: mảng quý, cũ → mới. Đơn vị: tỷ đồng, cổ phiếu: triệu CP, giá: nghìn đồng
    const r = { items: [], ok: q.length >= 4 };
    if (q.length < 4) return r;
    const L = q.length, last = q[L - 1], sum = (k, a, b) => q.slice(a, b).reduce((s, x) => s + nz(x[k]), 0);
    const npT = sum('np', L - 4, L), revT = sum('rev', L - 4, L), cfoT = sum('cfo', L - 4, L), sh = nz(last.shares);
    const eps = sh ? (npT * 1000) / sh : null, bvps = sh ? (nz(last.equity) * 1000) / sh : null; // đồng
    const pe = eps > 0 ? (price * 1000) / eps : null, pb = bvps > 0 ? (price * 1000) / bvps : null;
    const eqAvg = L >= 5 ? (nz(last.equity) + nz(q[L - 5].equity)) / 2 : nz(last.equity);
    const roe = eqAvg ? npT / eqAvg : null, roa = last.assets ? npT / last.assets : null, margin = revT ? npT / revT : null;
    const g = (a, b) => (b > 0 ? a / b - 1 : b < 0 && a > b ? null : null);
    const cY = L >= 5 ? g(nz(last.np), nz(q[L - 5].np)) : null, cPrev = L >= 6 ? g(nz(q[L - 2].np), nz(q[L - 6].np)) : null;
    const revY = L >= 5 ? g(nz(last.rev), nz(q[L - 5].rev)) : null;
    const aY = L >= 8 ? g(npT, sum('np', L - 8, L - 4)) : null;
    const de = last.equity ? nz(last.debt) / last.equity : null, cq = npT > 0 ? cfoT / npT : null;
    const graham = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) / 1000 : null;
    const peg = pe && aY > 0 ? pe / (aY * 100) : null;
    const lin = (v, a, b) => (v == null ? null : clamp((v - a) / (b - a), 0, 1));
    const add = (k, label, val, fmt, sc, w, who, note) => r.items.push({ k, label, val, fmt, sc, w, who, note });
    add('c', 'LNST quý gần nhất so cùng kỳ', cY, 'pct', lin(cY, 0, 0.25), 20, "O'Neil — chữ C", 'Đạt khi ≥ 25%');
    add('acc', 'Tăng trưởng LNST đang tăng tốc', cY != null && cPrev != null ? cY - cPrev : null, 'pp', cY != null && cPrev != null ? (cY > cPrev ? 1 : 0) : null, 5, "O'Neil — Minervini", 'Quý sau tăng nhanh hơn quý trước');
    add('a', 'LNST 4 quý (TTM) so cùng kỳ', aY, 'pct', lin(aY, 0, 0.25), 15, "O'Neil — chữ A", 'Đạt khi ≥ 25%');
    add('rev', 'Doanh thu quý so cùng kỳ', revY, 'pct', lin(revY, 0, 0.15), 10, 'Fisher', 'Đạt khi ≥ 15%');
    add('roe', 'ROE 4 quý', roe, 'pct', lin(roe, 0.05, 0.17), 15, "Buffett · O'Neil", 'Đạt khi ≥ 17%');
    add('mg', 'Biên lợi nhuận ròng', margin, 'pct', lin(margin, 0.02, 0.1), 5, 'Buffett', 'Đạt khi ≥ 10%');
    add('de', 'Nợ vay / Vốn chủ', de, 'x', de == null ? null : 1 - lin(de, 0.5, 2), 10, 'Graham', 'Tốt khi ≤ 0,5 lần');
    add('cq', 'Dòng tiền HĐKD / LNST', cq, 'x', cq == null ? (npT <= 0 ? 0 : null) : lin(cq, 0, 1), 10, 'Piotroski', 'Tốt khi ≥ 1 lần');
    add('peg', 'PEG (P/E ÷ tăng trưởng)', peg, 'x', peg == null ? (pe && aY != null ? 0 : null) : 1 - lin(peg, 1, 2.5), 10, 'Peter Lynch', 'Rẻ khi ≤ 1');
    let s = 0, w = 0; r.items.forEach((it) => { if (it.sc != null) { s += it.sc * it.w; w += it.w; } });
    Object.assign(r, { score: w ? (s / w) * 100 : null, eps, bvps, pe, pb, roe, roa, margin, graham, npT, revT, cY, aY, de, peg });
    return r;
  }

  /* ---- Dữ liệu mẫu (giả lập, có biên độ & bước giá HOSE) ---- */
  function tick(p) { return p < 10 ? 0.01 : p < 50 ? 0.05 : 0.1; }
  function synth(seed, start, drift, vol, n = 760, endDate = '2026-09-30') {
    let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const dates = []; const d = new Date(endDate + 'T00:00:00Z');
    while (dates.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
    dates.reverse();
    const bars = []; let p = start, regime = 1, left = 0;
    for (let i = 0; i < n; i++) {
      if (left-- <= 0) { regime = rnd() < 0.55 ? 1 : rnd() < 0.5 ? -1 : 0; left = 30 + Math.floor(rnd() * 70); }
      const mu = drift * (regime === 1 ? 2.2 : regime === -1 ? -2.6 : 0.1);
      let r = mu + vol * gauss() * (regime === -1 ? 1.25 : 1);
      r = clamp(r, -0.069, 0.069);
      const o = p * (1 + clamp(vol * 0.35 * gauss(), -0.03, 0.03)), c = p * (1 + r);
      const hi = Math.max(o, c) * (1 + Math.abs(gauss()) * vol * 0.45), lo = Math.min(o, c) * (1 - Math.abs(gauss()) * vol * 0.45);
      const t = tick(c), rd = (x) => Math.round(x / t) * t;
      const ref = p, cap = (x) => clamp(x, ref * 0.93, ref * 1.07);
      const C = rd(cap(c)), O = rd(cap(o)), Hh = rd(cap(Math.max(hi, O, C))), Ll = rd(cap(Math.min(lo, O, C)));
      const v = Math.round(1.2e6 * (1 + Math.abs(r) * 40) * (0.6 + rnd()) * (regime === 1 ? 1.15 : 1));
      bars.push({ t: dates[i], o: +O.toFixed(2), h: +Hh.toFixed(2), l: +Ll.toFixed(2), c: +C.toFixed(2), v });
      p = C;
    }
    return bars;
  }
  function synthFund(seed, base, growth, shares = 200) {
    let s = seed >>> 0; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const q = [], qs = ['Q4/2024', 'Q1/2025', 'Q2/2025', 'Q3/2025', 'Q4/2025', 'Q1/2026', 'Q2/2026', 'Q3/2026'];
    let rev = base, eq = base * 3.2;
    qs.forEach((name, i) => {
      rev *= 1 + growth / 4 + (rnd() - 0.5) * 0.08;
      const np = rev * (0.085 + (rnd() - 0.4) * 0.03 + i * 0.002);
      eq += np * 0.7;
      q.push({ q: name, rev: Math.round(rev), np: Math.round(np), equity: Math.round(eq), assets: Math.round(eq * 1.9), debt: Math.round(eq * (0.35 + rnd() * 0.2)), cfo: Math.round(np * (0.7 + rnd() * 0.7)), shares });
    });
    return q;
  }

  return { sma, ema, rsi, macd, atr, adx, bollinger, stoch, obv, mfi, supertrend, ichimoku, structure, zones, compute, analyze, backtest, compositeBT, label, plan, fundamentals, synth, synthFund, STRATS, tick, nz, clamp };
})();
if (typeof module !== 'undefined') module.exports = XT;
