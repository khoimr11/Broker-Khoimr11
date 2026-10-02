import fs from 'node:fs';
const O = 'https://khoimr11.github.io';
const now = Math.floor(Date.now() / 1000);
const T = [
 ['vnd_foreigns', 'https://api-finfo.vndirect.com.vn/v4/foreigns?q=code:FPT&sort=tradingDate:desc&size=5'],
 ['vnd_foreign_trading', 'https://api-finfo.vndirect.com.vn/v4/foreign_trading?q=code:FPT&sort=tradingDate:desc&size=5'],
 ['vnd_stock_prices', 'https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date:desc&q=code:FPT&size=3'],
 ['kbs_foreign', 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/FPT/foreign-trading?page=1&limit=5'],
 ['kbs_dayhist', 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stocks/FPT/data_day?sdate=01-09-2026&edate=02-10-2026'],
 ['vps_foreign', 'https://bgapidatafeed.vps.com.vn/getforeigntrading/FPT'],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try {
    const pre = await fetch(u, { method: 'OPTIONS', headers: { Origin: O, 'Access-Control-Request-Method': 'GET' }, signal: AbortSignal.timeout(20000) }).catch((e) => null);
    const res = await fetch(u, { headers: { Origin: O, 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    out[k] = { status: res.status, acao: res.headers.get('access-control-allow-origin'), preflight: pre && pre.status, preAcao: pre && pre.headers.get('access-control-allow-origin'), len: txt.length, head: txt.slice(0, 1400) };
  } catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_cors.json', JSON.stringify(out, null, 1));
