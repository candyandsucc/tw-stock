const $=s=>document.querySelector(s);const fmt=(v,d=2)=>v==null?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const cls=v=>v>0?'up':v<0?'down':'flat';const sg=v=>v>0?'+':'';
let ALL=[],META={},INST={},view='all',mkt='',sel=null;
const W=()=>JSON.parse(localStorage.getItem('tw-watch')||'["2330","0050"]');
const setW=a=>{localStorage.setItem('tw-watch',JSON.stringify(a));render();};
const toggle=c=>{const a=W();setW(a.includes(c)?a.filter(x=>x!==c):[...a,c]);};
const dfmt=d=>d?d.replaceAll('-','/'):'—';
async function init(){
  const [s,i]=await Promise.all([fetch('data/stocks.json').then(r=>r.json()),fetch('data/institutional.json').then(r=>r.json())]);
  ALL=s.stocks;META=s.meta;INST=i;
  $('#upd').textContent=META.updated.replace('T',' ').slice(0,16)+' (台北)';
  $('#cTw').innerHTML=META.counts.twse+'<em> 檔</em>';$('#cTp').innerHTML=META.counts.tpex+'<em> 檔</em>';
  $('#dTw').textContent='交易日期 '+dfmt(META.twseDate);$('#dTp').textContent='交易日期 '+dfmt(META.tpexDate);
  $('#nAll').textContent=ALL.length;$('#nEtf').textContent=ALL.filter(x=>x.etf).length;
  document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;render();});
  document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('chosen'));b.classList.add('chosen');mkt=b.dataset.m;render();});
  $('#q').oninput=render;$('#sort').onchange=render;
  render();const h=location.hash.slice(1);pick(ALL.find(x=>x.code===h)?h:'2330');
}
function render(){
  const w=W();$('#nWatch').textContent=w.length;$('#cW').innerHTML=w.length+'<em> 檔</em>';
  const q=$('#q').value.trim().toLowerCase();let L=ALL;
  if(view==='watch')L=L.filter(x=>w.includes(x.code));if(view==='etf')L=L.filter(x=>x.etf);
  if(mkt==='ETF')L=L.filter(x=>x.etf);else if(mkt)L=L.filter(x=>x.market===mkt);
  if(q)L=L.filter(x=>x.code.toLowerCase().includes(q)||x.name.toLowerCase().includes(q));
  const k=$('#sort').value;const pct=x=>x.change/(x.close-x.change);
  L=[...L].sort(k==='code'?(a,b)=>a.code.localeCompare(b.code):k==='change'?(a,b)=>pct(b)-pct(a):(a,b)=>(b[k]||0)-(a[k]||0));
  $('#listTitle').textContent={all:'全部股票',watch:'我的自選',etf:'ETF'}[view];$('#listCount').textContent=L.length+' 檔';
  $('#list').innerHTML=L.slice(0,300).map(x=>`<div class="row ${x.code===sel?'sel':''}" data-c="${x.code}"><span class="star ${w.includes(x.code)?'on':''}" data-s="${x.code}">${w.includes(x.code)?'★':'☆'}</span>
  <div class="nm"><b>${x.name}</b><small>${x.code}<span class="tag">${x.market}${x.etf?' · ETF':''}</span>${x.hasHistory?'':' <span title="尚無月歷史">◦</span>'}</small></div>
  <div class="px"><b>${fmt(x.close)}</b><small class="${cls(x.change)}">${sg(x.change)}${fmt(x.change)} (${sg(x.change)}${fmt(pct(x)*100)}%)</small></div></div>`).join('')||'<div class="empty">沒有符合的股票</div>';
  if(L.length>300)$('#list').insertAdjacentHTML('beforeend','<div class="empty">僅顯示前 300 檔，請用搜尋縮小範圍</div>');
  $('#list').querySelectorAll('.row').forEach(r=>r.onclick=e=>{if(e.target.dataset.s)toggle(e.target.dataset.s);else pick(r.dataset.c);});
}
function chart(rows){
  const R=rows.slice(-60),w=760,h=260,vh=60,p=36;const cl=rows.map(r=>r[4]);
  const ma=n=>R.map((_,i)=>{const j=rows.length-R.length+i;return j+1>=n?cl.slice(j+1-n,j+1).reduce((a,b)=>a+b)/n:null;});
  const lines=[['#4871db',R.map(r=>r[4])],['#f0a020',ma(5)],['#d4483b',ma(20)],['#2c9a6f',ma(60)]];
  const vals=lines.flatMap(l=>l[1]).filter(v=>v!=null);const mn=Math.min(...vals),mx=Math.max(...vals);
  const X=i=>p+i*(w-p*2)/(R.length-1||1),Y=v=>10+(h-20)*(1-(v-mn)/(mx-mn||1));const vm=Math.max(...R.map(r=>r[5]||0));
  const path=a=>a.map((v,i)=>v==null?'':`${a.slice(0,i).some(x=>x!=null)?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const grid=[0,.25,.5,.75,1].map(t=>{const v=mn+(mx-mn)*t;return `<line x1="${p}" x2="${w-p}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eef1f6"/><text x="${w-p+4}" y="${Y(v)+4}" font-size="10" fill="#98a2b3">${fmt(v)}</text>`}).join('');
  const bars=R.map((r,i)=>`<rect x="${X(i)-3}" width="6" y="${h+vh-(r[5]/vm)*vh}" height="${(r[5]/vm)*vh}" fill="${r[4]>=(R[i-1]||r)[4]?'#f2b8b2':'#a9dcc6'}"><title>${r[0]} 量 ${fmt(r[5]/1000,0)} 張</title></rect>`).join('');
  return `<svg viewBox="0 0 ${w} ${h+vh+20}" width="100%">${grid}<path d="${path(R.map(r=>r[4]))}L${X(R.length-1)},${h}L${X(0)},${h}Z" fill="#edf2ff" opacity=".6"/>${lines.map(([c,a],k)=>`<path d="${path(a)}" fill="none" stroke="${c}" stroke-width="${k?1.2:2}" ${k?'stroke-dasharray="4 2"':''}/>`).join('')}${bars}
  <text x="${p}" y="${h+vh+16}" font-size="10" fill="#98a2b3">${dfmt(R[0][0])}</text><text x="${w-p}" y="${h+vh+16}" font-size="10" fill="#98a2b3" text-anchor="end">${dfmt(R.at(-1)[0])}</text></svg>`;
}
const lvl=(b,kind,i,close)=>!b?`<div class="level ${kind}"><small>${kind==='support'?'◇':'↗'} 第${i}${kind==='support'?'支撐':'壓力'}</small><strong>—</strong><p>近 120 日內無符合價位（可能已創新高/新低）</p></div>`:
 `<div class="level ${kind}"><small>${kind==='support'?'◇':'↗'} 第${i}${kind==='support'?'支撐':'壓力'}</small><strong>${fmt(kind==='support'?b.high:b.low)}</strong>
 <div class="priceband"><small>價格帶</small><b>${fmt(b.low)}–${fmt(b.high)}</b><small>${b.n>1?b.n+' 個價位合併':'單一價位，未形成區間'}</small></div>
 <span>距收盤 ${sg(((kind==='support'?b.high:b.low)/close-1))}${fmt(((kind==='support'?b.high:b.low)/close-1)*100)}%</span><p>${b.basis.join('、')} · 最近 ${dfmt(b.last)}</p></div>`;
async function pick(code){
  sel=code;location.hash=code;render();const s=ALL.find(x=>x.code===code);if(!s)return;
  let H=null;if(s.hasHistory){try{H=await fetch(`data/history/${code}.json`).then(r=>r.ok?r.json():null)}catch(e){}}
  const src=`<b>${s.src}</b>`;const inst=s.market==='上市'?(INST.data[code]||[]):null;
  const L=H&&H.levels,close=s.close;
  let html=`<div class="eyebrow">STOCK INSIGHT <span>${s.market}${s.etf?' · ETF':''} · ${code}</span></div>
  <div class="titleprice"><div><h2>${s.name} <button class="star" style="font-size:18px;color:${W().includes(code)?'#f0a020':'#b8c1cf'}" onclick="toggle('${code}');pick('${code}')">${W().includes(code)?'★':'☆'}</button></h2><p>收盤日期 ${dfmt(s.date)} · 來源：${s.src}</p></div>
  <div><strong>${fmt(close)}</strong><span class="${cls(s.change)}">${sg(s.change)}${fmt(s.change)} (${sg(s.change)}${fmt(s.change/(close-s.change)*100)}%)</span></div></div>
  <div class="metrics"><span>開盤<b>${fmt(s.open)}</b></span><span>最高<b>${fmt(s.high)}</b></span><span>最低<b>${fmt(s.low)}</b></span><span>成交量<b>${fmt(s.volume/1000,0)} 張</b></span><span>成交金額<b>${fmt(s.value/1e8)} 億</b></span></div>
  <div class="srcline">收盤行情 · 資料日期 ${dfmt(s.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY_ALL':'tpex_mainboard_daily_close_quotes'}）</div>`;
  if(H){html+=`<div class="chartpanel"><div class="charttitle"><b>價格走勢<small>近 ${Math.min(60,H.rows.length)} 個交易日（共 ${H.rows.length} 日）</small></b><span>日線收盤 · 均線 · 成交量</span></div>${chart(H.rows)}
  <div class="ma"><span><i style="background:#f0a020"></i>MA5 <b>${fmt(H.ma5)}</b></span><span><i style="background:#d4483b"></i>MA20 <b>${fmt(H.ma20)}</b></span><span><i style="background:#2c9a6f"></i>MA60 <b>${fmt(H.ma60)}</b></span><span>量比（今日/前5日均量）<b>${H.volRatio==null?'—':fmt(H.volRatio)+' 倍'}</b></span></div>
  <div class="srcline">走勢 · 資料日期 ${dfmt(H.rows[0][0])}–${dfmt(H.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY 個股日成交資訊':'tradingStock 個股日成交資訊'}）</div></div>
  <div class="sectionlabel"><h3>接下來，看哪裡？</h3><span>價格結構觀察 · 依 ${dfmt(H.date)} 收盤 · 來源 ${s.src}</span></div>`;
  if(L){html+=`<div class="levels">${lvl(L.support[0],'support',1,close)}${lvl(L.support[1],'support',2,close)}${lvl(L.resistance[0],'resist',1,close)}${lvl(L.resistance[1],'resist',2,close)}</div>`;
   const s1=L.support[0],r1=L.resistance[0];if(s1&&r1){const pos=(close-s1.high)/(r1.low-s1.high)*100;html+=`<div class="card"><h3>支撐壓力位置<span>依 ${dfmt(H.date)} 收盤</span></h3><div class="track"><i style="left:${Math.max(0,Math.min(100,pos))}%"></i></div><div class="ma"><span>第一支撐 <b class="down">${fmt(s1.high)}</b></span><span>收盤 <b>${fmt(close)}</b>（區間 ${fmt(pos,1)}%）</span><span>第一壓力 <b class="up">${fmt(r1.low)}</b></span></div></div>`;}
   html+=`<p class="note2"><b>計算方法：</b>取近 120 個交易日：① 波段高低點（某日最高/最低為前後各 3 日的極值）；② 經典樞紐點 P=(H+L+C)/3、S1=2P−H、S2=P−(H−L)、R1=2P−L、R2=P+(H−L)；③ MA20、MA60。所有候選價位排序後，支撐與壓力兩側分開，各自由低至高、與該帶起點差距 1.5% 內者合併為一個「價格帶」（低–高）。低於收盤的最近兩帶為第一、第二支撐，高於收盤者為壓力。僅為價格結構觀察，非買賣建議。</p>`;}
  }else html+=`<div class="card"><h3>價格走勢 / 支撐壓力<span>尚無歷史</span></h3><p class="note2">此股票目前不在每日歷史抓取範圍（主要成交金額前段＋預設清單），因此暫無走勢、均線與支撐壓力。系統每日累積收盤快照，資料足夠後會自動顯示；或將代號加入 fetch 腳本的 EXTRA 名單。</p></div>`;
  if(inst){const t=k=>inst.reduce((a,r)=>a+(r[k]||0),0)/1000;
   html+=`<div class="card"><h3>三大法人買賣超 · 近 ${inst.length} 日<span>單位：張 · 來源 <b>證交所 T86</b> · 資料日期 ${dfmt(INST.dates.at(-1))}–${dfmt(INST.dates[0])}</span></h3>
   ${inst.length?`<table><tr><th>日期</th><th>外資(含外資自營)</th><th>投信</th><th>自營商</th><th>合計</th></tr>${inst.map(r=>`<tr><td>${dfmt(r.date)}</td>${['foreign','trust','dealer','total'].map(k=>`<td class="${cls(r[k])}">${fmt(r[k]/1000,0)}</td>`).join('')}</tr>`).join('')}
   <tr><th>合計</th>${['foreign','trust','dealer','total'].map(k=>`<th class="${cls(t(k))}">${fmt(t(k),0)}</th>`).join('')}</tr></table>`:'<p class="note2">此期間 T86 無此股票資料（未列入不代表為零）。</p>'}</div>`;}
  else html+=`<div class="card"><h3>三大法人買賣超<span>上櫃</span></h3><p class="note2">本站法人資料目前僅涵蓋上市股票（證交所 T86）。</p></div>`;
  $('#detail').innerHTML=html;
}
init();
