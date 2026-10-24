// 讀取元大投信 ETF 頁面 HTML（stdin），解析頁面內嵌的官方持股資料 (PCF / FundWeights)，輸出 JSON
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const m=s.match(/<script>(window\.__NUXT__=[\s\S]*?)<\/script>/);
  if(!m){console.log(JSON.stringify({error:'找不到內嵌資料'}));return;}
  const window={};eval(m[1]);
  const find=o=>{if(o&&typeof o==='object'){if(o.FundWeights&&o.PCF)return o;for(const k in o){const r=find(o[k]);if(r)return r}}};
  const r=find(window.__NUXT__);
  if(!r){console.log(JSON.stringify({error:'找不到持股資料'}));return;}
  const d=r.PCF.trandate;
  console.log(JSON.stringify({aum:r.PCF.totalav,date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,
    holdings:(r.FundWeights.StockWeights||[]).map(x=>({code:String(x.code).trim(),name:x.name,shares:x.qty,weight:x.weights}))}));
});
