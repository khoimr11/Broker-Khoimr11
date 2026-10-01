import fs from 'node:fs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' };
const Q = []; for (let y = 2023; y <= 2026; y++) for (const md of ['03-31', '06-30', '09-30', '12-31']) Q.push(`${y}-${md}`);
const F = 'https://api-finfo.vndirect.com.vn/v4';
const T = [
 ['vnd_prices', 'https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:FPT~date:gte:2006-12-01~date:lte:2012-04-01&size=3000'],
 ['vnd_dchart', 'https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=FPT&from=1164931200&to=1333238400'],
 ['vps', 'https://histdatafeed.vps.com.vn/tradingview/history?symbol=FPT&resolution=D&from=1164931200&to=1333238400'],
 ['cafef', 'https://s.cafef.vn/Ajax/PageNew/DataHistory/PriceHistory.ashx?Symbol=FPT&StartDate=12/01/2006&EndDate=04/01/2012&PageIndex=1&PageSize=3000'],
 ['dnse_old', 'https://services.entrade.com.vn/chart-api/v2/ohlcs/stock?from=1164931200&to=1333238400&symbol=FPT&resolution=1D'],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try { const res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(40000) }); const txt = await res.text(); out[k] = { status: res.status, len: txt.length }; fs.writeFileSync(`data/probe/${k}.json`, txt); }
  catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_summary.json', JSON.stringify(out, null, 1));
