import fs from 'node:fs';
const O = 'https://khoimr11.github.io';
const now = Math.floor(Date.now() / 1000);
const T = [
 ['vps_VN30', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VN30&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_HNXINDEX', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=HNXINDEX&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_HNX', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=HNX&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_UPCOMINDEX', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=UPCOMINDEX&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_HNXUPCOMINDEX', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=HNXUPCOMINDEX&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_UPCOM', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=UPCOM&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_VN100', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VN100&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_VNMID', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNMID&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_VNMIDCAP', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=VNMIDCAP&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['vps_HNX30', `https://histdatafeed.vps.com.vn/tradingview/history?symbol=HNX30&resolution=D&from=${now - 5 * 86400}&to=${now + 86400}`],
 ['ssi_VN30', 'https://iboard-query.ssi.com.vn/stock/group/VN30'],
 ['ssi_VN50', 'https://iboard-query.ssi.com.vn/stock/group/VN50'],
 ['ssi_VN100', 'https://iboard-query.ssi.com.vn/stock/group/VN100'],
 ['ssi_VNMID', 'https://iboard-query.ssi.com.vn/stock/group/VNMID'],
 ['ssi_VNMIDCAP', 'https://iboard-query.ssi.com.vn/stock/group/VNMIDCAP'],
 ['ssi_VNSML', 'https://iboard-query.ssi.com.vn/stock/group/VNSML'],
 ['ssi_HNX30', 'https://iboard-query.ssi.com.vn/stock/group/HNX30'],
 ['ssi_VNX50', 'https://iboard-query.ssi.com.vn/stock/group/VNX50'],
 ['vnd_fo_all', 'https://api-finfo.vndirect.com.vn/v4/foreigns?q=tradingDate:2026-10-01&size=3000&fields=code,floor,netVal,buyVal,sellVal'],
 ['vnd_idx_comp', 'https://api-finfo.vndirect.com.vn/v4/index_components?q=indexCode:VN30&size=100'],
 ['vnd_vn30', 'https://api-finfo.vndirect.com.vn/v4/stocks?q=indexCode:VN30&size=100&fields=code'],
 ['vps_snap_idx', 'https://bgapidatafeed.vps.com.vn/getlistindexdetail/10,02,03,11'],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try {
    const pre = await fetch(u, { method: 'OPTIONS', headers: { Origin: O, 'Access-Control-Request-Method': 'GET' }, signal: AbortSignal.timeout(20000) }).catch((e) => null);
    const res = await fetch(u, { headers: { Origin: O, 'User-Agent': 'Mozilla/5.0 Chrome/124', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    out[k] = { status: res.status, acao: res.headers.get('access-control-allow-origin'), preflight: pre && pre.status, preAcao: pre && pre.headers.get('access-control-allow-origin'), len: txt.length, head: txt.slice(0, 500), n: (()=>{try{const j=JSON.parse(txt);const d=j.data||j;return Array.isArray(d)?d.length:(d&&typeof d==='object'?Object.keys(d).length:null)}catch(e){return null}})() };
  } catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_cors.json', JSON.stringify(out, null, 1));
