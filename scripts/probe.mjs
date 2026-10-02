import fs from 'node:fs';
const O = 'https://khoimr11.github.io';
const now = Math.floor(Date.now() / 1000);
const T = [
 ['dnse_1d', `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${now - 10 * 86400}&to=${now}&symbol=FPT&resolution=1D`],
 ['dnse_1m', `https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=${now - 2 * 86400}&to=${now}&symbol=FPT&resolution=1`],
 ['dnse_idx_1m', `https://services.entrade.com.vn/chart-api/v2/ohlcs/index?from=${now - 2 * 86400}&to=${now}&symbol=VNINDEX&resolution=1`],
 ['vps_1d', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=FPT&resolution=D&from=${now - 10 * 86400}&to=${now}`],
 ['vps_snap', 'https://bgapidatafeed.vps.com.vn/getliststockdata/FPT,HPG,VCB'],
 ['vnd_finfo', 'https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:FPT&size=2'],
 ['ssi_ex', 'https://iboard-query.ssi.com.vn/stock/exchange/hose'],
 ['kbs', 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/FPT'],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try {
    const pre = await fetch(u, { method: 'OPTIONS', headers: { Origin: O, 'Access-Control-Request-Method': 'GET' }, signal: AbortSignal.timeout(20000) }).catch((e) => null);
    const res = await fetch(u, { headers: { Origin: O, 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    out[k] = { status: res.status, acao: res.headers.get('access-control-allow-origin'), preflight: pre && pre.status, preAcao: pre && pre.headers.get('access-control-allow-origin'), len: txt.length, head: txt.slice(0, 300) };
  } catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_cors.json', JSON.stringify(out, null, 1));
