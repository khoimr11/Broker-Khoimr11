import fs from 'node:fs';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Accept: 'application/json' };
const Q = []; for (let y = 2023; y <= 2026; y++) for (const md of ['03-31', '06-30', '09-30', '12-31']) Q.push(`${y}-${md}`);
const F = 'https://api-finfo.vndirect.com.vn/v4';
const T = [
 ['models', `${F}/financial_models?sort=displayOrder:asc&q=modelType:1,2,3,89,90,91,101,102,103,411,412,413&fields=modelType,modelTypeName,companyForm,note,itemCode,itemVnName,displayOrder,displayLevel&size=9999`],
 ['fs_DCM', `${F}/financial_statements?q=code:DCM~reportType:QUARTER~modelType:1,2,3,89,90,91,101,102,103,411,412,413~fiscalDate:${Q.join(',')}&sort=fiscalDate&size=9999&fields=itemCode,modelType,fiscalDate,numericValue`],
 ['fs_VCB', `${F}/financial_statements?q=code:VCB~reportType:QUARTER~modelType:1,2,3,89,90,91,101,102,103,411,412,413~fiscalDate:2026-06-30&size=9999&fields=itemCode,modelType,fiscalDate,numericValue`],
 ['fs_SSI', `${F}/financial_statements?q=code:SSI~reportType:QUARTER~modelType:1,2,3,89,90,91,101,102,103,411,412,413~fiscalDate:2026-06-30&size=9999&fields=itemCode,modelType,fiscalDate,numericValue`],
 ['fs_BVH', `${F}/financial_statements?q=code:BVH~reportType:QUARTER~modelType:1,2,3,89,90,91,101,102,103,411,412,413~fiscalDate:2026-06-30&size=9999&fields=itemCode,modelType,fiscalDate,numericValue`],
 ['multi', `${F}/financial_statements?q=code:DCM,HPG,FPT~reportType:QUARTER~modelType:2~fiscalDate:2026-06-30&size=9999&fields=code,itemCode,modelType,fiscalDate,numericValue`],
 ['ratios_multi', `${F}/ratios/latest?filter=itemCode:51003,51004,51006,51012,51033,51035,57066&where=code:DCM,HPG,FPT&fields=code,itemCode,value,reportDate&size=100`],
 ['ratio_items', `${F}/ratio_items?size=500`],
 ['company', `${F}/company_profiles?q=code:DCM`],
 ['stocks', `${F}/stocks?q=type:STOCK~status:LISTED&fields=code,floor,companyName,companyNameEng,industryName&size=5`],
 ['reports_all', `${F}/recommendations?sort=reportDate:desc&q=reportDate:gte:2026-04-01&size=2000`],
];
fs.mkdirSync('data/probe', { recursive: true });
const out = {};
for (const [k, u] of T) {
  try { const res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(40000) }); const txt = await res.text(); out[k] = { status: res.status, len: txt.length }; fs.writeFileSync(`data/probe/${k}.json`, txt); }
  catch (e) { out[k] = { err: String(e).slice(0, 200) }; }
}
fs.writeFileSync('data/probe/_summary.json', JSON.stringify(out, null, 1));
