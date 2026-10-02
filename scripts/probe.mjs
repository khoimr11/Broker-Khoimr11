import fs from 'node:fs';
const O = 'https://khoimr11.github.io';
const now = Math.floor(Date.now() / 1000);
const T = [
 ['vps_trade', 'https://bgapidatafeed.vps.com.vn/getliststocktrade/FPT'],
 ['vps_trade2', 'https://bgapidatafeed.vps.com.vn/getlisttradestock/FPT'],
 ['kbs_trade', 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/trade/history/FPT?page=1&limit=50'],
 ['kbs_trade2', 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/FPT/matching-history?page=1&limit=50'],
 ['tcbs_intra', 'https://apipubaws.tcbs.com.vn/stock-insight/v1/intraday/FPT/his/paging?page=0&size=50&headIndex=-1'],
 ['vci_ticks', 'https://trading.vietcap.com.vn/api/market-watch/LEData/getAll'],
 ['vnd_ticks', 'https://api-finfo.vndirect.com.vn/v4/intraday_transactions?q=code:FPT&size=50'],
 ['dnse_ticks', 'https://services.entrade.com.vn/price-api/v2/intraday/FPT'],
 ['vps_1m', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=FPT&resolution=1&from=${now - 3600}&to=${now + 60}`],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try {
    const pre = await fetch(u, { method: 'OPTIONS', headers: { Origin: O, 'Access-Control-Request-Method': 'GET' }, signal: AbortSignal.timeout(20000) }).catch((e) => null);
    const res = await fetch(u, { headers: { Origin: O, 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    out[k] = { status: res.status, acao: res.headers.get('access-control-allow-origin'), preflight: pre && pre.status, preAcao: pre && pre.headers.get('access-control-allow-origin'), len: txt.length, head: txt.slice(0, 900) };
  } catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_cors.json', JSON.stringify(out, null, 1));
