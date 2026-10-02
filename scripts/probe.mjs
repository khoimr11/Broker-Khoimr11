import fs from 'node:fs';
const O = 'https://khoimr11.github.io';
const now = Math.floor(Date.now() / 1000);
const T = [
 ['vps_vnindex', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=D&from=${now - 6 * 86400}&to=${now + 86400}`],
 ['vps_vnindex_1m', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNINDEX&resolution=1&from=${now - 3600}&to=${now + 60}`],
 ['vps_fpt_d', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=FPT&resolution=D&from=${now - 6 * 86400}&to=${now + 86400}`],
 ['vps_fpt_15', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=FPT&resolution=15&from=${now - 3 * 86400}&to=${now + 60}`],
 ['vps_snap', 'https://bgapidatafeed.vps.com.vn/getliststockdata/FPT'],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try {
    const pre = await fetch(u, { method: 'OPTIONS', headers: { Origin: O, 'Access-Control-Request-Method': 'GET' }, signal: AbortSignal.timeout(20000) }).catch((e) => null);
    const res = await fetch(u, { headers: { Origin: O, 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    out[k] = { status: res.status, acao: res.headers.get('access-control-allow-origin'), preflight: pre && pre.status, preAcao: pre && pre.headers.get('access-control-allow-origin'), len: txt.length, head: txt.slice(0, 2500) };
  } catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_cors.json', JSON.stringify(out, null, 1));
