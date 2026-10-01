import fs from 'node:fs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' };
const T = [
 ['tcbs_is', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/finance/DCM/incomestatement?yearly=0&isAll=true'],
 ['tcbs_bs', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/finance/DCM/balancesheet?yearly=0&isAll=true'],
 ['tcbs_cf', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/finance/DCM/cashflow?yearly=0&isAll=true'],
 ['tcbs_ratio', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/finance/DCM/financialratio?yearly=0&isAll=true'],
 ['tcbs_overview', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/ticker/DCM/overview'],
 ['tcbs_div', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/company/DCM/dividend-payment-histories?page=0&size=20'],
 ['tcbs_holders', 'https://apipubaws.tcbs.com.vn/tcanalysis/v1/company/DCM/large-share-holders'],
 ['vnd_ratios', 'https://api-finfo.vndirect.com.vn/v4/ratios/latest?filter=itemCode:51003,51016,51001,51002,51004,57066,51007,51006,51012,51033,51035&where=code:DCM&order=reportDate&fields=itemCode,value,reportDate'],
 ['vnd_fs', 'https://api-finfo.vndirect.com.vn/v4/financial_statements?q=code:DCM~reportType:QUARTER~modelType:1,2,3,89,90,91,101,102,103,411,412,413&sort=fiscalDate&size=200'],
 ['vnd_models', 'https://api-finfo.vndirect.com.vn/v4/financial_models?sort=displayOrder:asc&q=codeList:DCM~modelType:1,2,3~note:TT199/2014/TT-BTC,TT334/2016/TT-BTC,TT49/2014/TT-NHNN,TT202/2014/TT-BTC~displayLevel:0,1,2,3&size=999'],
 ['vnd_reports', 'https://api-finfo.vndirect.com.vn/v4/recommendations?q=code:DCM&sort=reportDate:desc&size=20'],
 ['vci_gql', 'POST'],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try {
    let res;
    if (u === 'POST') {
      res = await fetch('https://trading.vietcap.com.vn/data-mt/graphql', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json', Origin: 'https://trading.vietcap.com.vn', Referer: 'https://trading.vietcap.com.vn/' }, body: JSON.stringify({ query: '{ CompanyFinancialRatio(ticker:"DCM", period:"Q") { ratio { ticker yearReport lengthReport pe pb roe eps bvps revenue netProfit } period } }' }), signal: AbortSignal.timeout(20000) });
    } else res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
    const txt = await res.text();
    out[k] = { status: res.status, len: txt.length };
    fs.writeFileSync(`data/probe/${k}.txt`, txt.slice(0, 60000));
  } catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_summary.json', JSON.stringify(out, null, 1));
console.log(out);
