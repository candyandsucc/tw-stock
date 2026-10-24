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
  document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;render();if(view==='w25')overview();});
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
  $('#listTitle').textContent={all:'全部股票',watch:'我的自選',etf:'ETF',w25:'全部股票'}[view];$('#listCount').textContent=L.length+' 檔';
  $('#list').innerHTML=L.slice(0,300).map(x=>`<div class="row ${x.code===sel?'sel':''}" data-c="${x.code}"><span class="star ${w.includes(x.code)?'on':''}" data-s="${x.code}">${w.includes(x.code)?'★':'☆'}</span>
  <div class="nm"><b>${x.name}</b><small>${x.code}<span class="tag">${x.market}${x.etf?' · ETF':''}</span>${x.hasHistory?'':' <span title="尚無月歷史">◦</span>'}</small></div>
  <div class="px"><b>${fmt(x.close)}</b><small class="${cls(x.change)}">${sg(x.change)}${fmt(x.change)} (${sg(x.change)}${fmt(pct(x)*100)}%)</small></div></div>`).join('')||'<div class="empty">沒有符合的股票</div>';
  if(L.length>300)$('#list').insertAdjacentHTML('beforeend','<div class="empty">僅顯示前 300 檔，請用搜尋縮小範圍</div>');
  $('#list').querySelectorAll('.row').forEach(r=>r.onclick=e=>{if(e.target.dataset.s)toggle(e.target.dataset.s);else pick(r.dataset.c);});
}
let W25=null;
async function overview(){
  const box=$('#detail');box.innerHTML='<div class="empty">正在載入自選 25 檔總覽…</div>';
  try{W25=W25||await fetch('data/watch25.json').then(r=>r.json());}catch(e){box.innerHTML='<div class="empty">總覽資料載入失敗</div>';return;}
  if(view!=='w25')return;
  const I=W25.items,z1=v=>v==null?'—':(v>0?'+':'')+fmt(v,1);const bad=I.filter(i=>i.issues&&i.issues.length);
  const rowh=i=>{if(!i.close)return `<tr><td colspan="9"><b>${i.name}</b> ${i.code} · ${i.issues.join('、')}</td></tr>`;
   const s1=i.s1,r1=i.r1,t=i.trend,b=i.box,n=i.inst;
   return `<tr data-c="${i.code}"><td><b>${i.name}</b><small>${i.code} · ${i.market}</small></td>
   <td class="num"><b>${fmt(i.close)}</b><small class="${cls(i.change)}">${sg(i.change)}${fmt(i.pct)}%</small></td>
   <td class="num">${s1?`<b class="down">${fmt(s1.price)}</b><small>${z1(s1.dist)}%${s1.low!==s1.high?` · 帶 ${fmt(s1.low)}–${fmt(s1.high)}`:''}</small>`:'<small>尚未形成</small>'}</td>
   <td class="num">${r1?`<b class="up">${fmt(r1.price)}</b><small>${z1(r1.dist)}%${r1.low!==r1.high?` · 帶 ${fmt(r1.low)}–${fmt(r1.high)}`:''}</small>`:'<small>尚未形成</small>'}</td>
   <td class="num">${i.volRatio==null?'—':fmt(i.volRatio)+' 倍'}</td>
   <td class="num">${n?`<b class="${cls(n.total)}">${z1(n.total).replace(/\.0$/,'')}</b><small>近3日 ${z1(n.sum3).replace(/\.0$/,'')}</small>`:'<small>官方未列入</small>'}</td>
   <td>${t?`<span class="pill ${t.state==='守住'?'ok':'warn'}">上升趨勢線${t.state}</span>`:''}${b?`<span class="pill">${b.days} 日平台 · ${b.state}</span>`:''}${!t&&!b?'<small>—</small>':''}</td>
   <td class="num"><small>${i.days||0} 日${i.adjusted?' · 已還原':''}</small></td></tr>`;};
  box.innerHTML=`<div class="eyebrow">WATCHLIST OVERVIEW <span>自選 ${I.length} 檔 · 資料日期 ${dfmt(W25.date)}</span></div>
  <div class="titleprice"><div><h2>自選 ${I.length} 檔總覽</h2><p>點列可看個股頁 · 價位為本站依歷史價格結構自行計算的觀察價位，不是目標價或買賣建議</p></div></div>
  <div class="tablewrap"><table class="ov"><tr><th>股票</th><th>收盤 / 漲跌</th><th>第一支撐<small>距現價</small></th><th>第一壓力<small>距現價</small></th><th>量比<small>對20日均量</small></th><th>法人買賣超<small>張 · 最新日</small></th><th>形態（觀察用）</th><th>歷史</th></tr>${I.map(rowh).join('')}</table></div>
  <p class="note2">${bad.length?'資料提醒：'+bad.map(i=>`${i.name}（${i.issues.join('、')}）`).join('；')+'。':'25 檔皆具收盤行情、均線、量比與支撐壓力。'}</p>
  <p class="note2">法人買賣超＝外資＋投信＋自營商合計（千股換算張），來源證交所 T86／櫃買中心；形態為依歷史價量自動偵測的觀察標示，不預測突破方向。量比＝最新日成交量 ÷ 近 20 日均量。</p>`;
  box.querySelectorAll('tr[data-c]').forEach(r=>r.onclick=()=>{pick(r.dataset.c);});
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
const band=b=>b.low!==b.high?`<em>價格帶 ${fmt(b.low)}–${fmt(b.high)}</em>`:'';
const tags=b=>`<div class="tags">${b.basis.map(x=>`<i>${x}</i>`).join('')}</div>`;
const lrow=(lab,b)=>`<div class="lvrow"><div><span>${lab}</span>${tags(b)}</div><div><strong>${fmt(b.price)}</strong>${band(b)}<em>距現價 ${sg(b.dist)}${fmt(b.dist,1)}%</em></div></div>`;
const NA=(st)=>`<strong class="na">${st||'尚未形成'}</strong><p>${st==='資料不足'?'來源資料不足以計算。':'目前價格結構還沒有出現對應價位，不以公式推算補值。'}</p>`;
function lvcards(L,cf,close,H){const S=L.support,R=L.resistance,st=L.status;
 const sup=`<div class="level support"><small>◇ 支撐觀察</small>${S.length?S.map((b,i)=>lrow(i?`第二支撐｜${b.tier}`:`${b.tier}支撐`,b)).join(''):NA(st)}<p>現價之下最接近的真實結構價位；跌破後結構轉弱；距離以現價為基準計算。</p></div>`;
 const r1=R[0],r2=R[1];const newHigh=!r1&&H&&close>=Math.max(...H.rows.map(r=>r[2]));
 const c1=`<div class="level resist"><small>⚡ ${cf?'關鍵突破／壓力共振區':'第一壓力'}</small>${r1?lrow(cf?'關鍵突破／壓力共振區':'第一壓力',r1)+`<p>${cf?'此處同時是突破觀察位與壓力共振區，站上與否是觀察點，不是追價目標。':'現價上方最近、已確認的有效壓力結構；站上與否是觀察點，不是追價目標。'}</p>`:newHigh&&L.limits?`<strong class="na">${fmt(L.limits.up)}</strong><p>創新高，上方無歷史結構；顯示明日漲停參考價（漲跌幅限制，非結構價位）。</p>`:NA(st)}</div>`;
 const c2=`<div class="level resist"><small>🔥 第二壓力</small>${r2?lrow(r2.tier,r2)+`<p>${r2.tier==='中期壓力'?'第一壓力帶之上、下一個獨立的結構已超過 +10%，保留顯示並改標為中期壓力。':'第一壓力帶之上、下一個獨立的壓力結構。'}</p>`:NA(st)}</div>`;
 return `<div class="levels l3">${sup}${c1}${c2}</div>`;}
function confluence(H,L){const r1=L.resistance[0];if(!r1)return false;const hi=Math.max(...H.rows.slice(-10,-1).map(r=>r[2]));return Math.abs(hi/r1.price-1)<=0.01||(hi>=r1.low&&hi<=r1.high);}
async function pick(code){
  sel=code;location.hash=code;render();const s=ALL.find(x=>x.code===code);if(!s)return;
  let H=null;if(s.hasHistory){try{H=await fetch(`data/history/${code}.json`).then(r=>r.ok?r.json():null)}catch(e){}}window._H=H;
  const src=`<b>${s.src}</b>`;const inst=s.market==='上市'?(INST.data[code]||[]):null;
  const L=H&&H.levels,close=s.close;
  let html=`<div class="eyebrow">STOCK INSIGHT <span>${s.market}${s.etf?' · ETF':''} · ${code}</span></div>
  <div class="titleprice"><div><h2>${s.name} <button class="star" style="font-size:18px;color:${W().includes(code)?'#f0a020':'#b8c1cf'}" onclick="toggle('${code}');pick('${code}')">${W().includes(code)?'★':'☆'}</button></h2><p>收盤日期 ${dfmt(s.date)} · 來源：${s.src}</p></div>
  <div><strong>${fmt(close)}</strong><span class="${cls(s.change)}">${sg(s.change)}${fmt(s.change)} (${sg(s.change)}${fmt(s.change/(close-s.change)*100)}%)</span></div></div>
  <div class="metrics"><span>開盤<b>${fmt(s.open)}</b></span><span>最高<b>${fmt(s.high)}</b></span><span>最低<b>${fmt(s.low)}</b></span><span>成交量<b>${fmt(s.volume/1000,0)} 張</b></span><span>成交金額<b>${fmt(s.value/1e8)} 億</b></span></div>
  <div class="srcline">收盤行情 · 資料日期 ${dfmt(s.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY_ALL':'tpex_mainboard_daily_close_quotes'}）</div>`;
  if(H){html+=`<div class="chartpanel"><div class="charttitle"><b>價格走勢<small>近 ${Math.min(60,H.rows.length)} 個交易日（共 ${H.rows.length} 日）</small></b><span>日線收盤 · 均線 · 成交量</span></div>${chart(H.rows)}
  <div class="ma"><span><i style="background:#f0a020"></i>MA5 <b>${fmt(H.ma5)}</b></span><span><i style="background:#d4483b"></i>MA20 <b>${fmt(H.ma20)}</b></span><span><i style="background:#2c9a6f"></i>MA60 <b>${fmt(H.ma60)}</b></span><span>量比 <b>${vr20(H.rows)}</b></span></div>
  ${H.adjusted?`<div class="note2 adjnote">⚙ 已除權還原：${H.adjusted.map(a=>`${dfmt(a.date)} 除權（前收 ${fmt(a.prevClose)} → 參考價 ${fmt(a.refPrice)}，還原因子 ${fmt(a.factor,4)}，來源${a.src}）`).join('；')}。除權日以前的價格已乘以還原因子、成交量除以還原因子，均線、量比與支撐壓力皆用還原價；以下顯示的歷史價位與當時實際成交價不同。</div>`:''}<div class="srcline">走勢 · 資料日期 ${dfmt(H.rows[0][0])}–${dfmt(H.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY 個股日成交資訊':'tradingStock 個股日成交資訊'}）</div></div>
  <div class="sectionlabel"><h3>接下來，看哪裡？</h3><span>價格結構觀察 · 依 ${dfmt(H.date)} 收盤 · 來源 ${s.src}</span></div>`;
  if(L){const cf=confluence(H,L);html+=lvcards(L,cf,close,H)+`<p class="note2 disclaimer">支撐與壓力為本站依歷史價格結構自行計算的觀察價位，可能與其他網站不同，不是目標價或買賣建議。</p>`+(L.limits?`<p class="note2">漲跌停參考（依漲跌幅限制，非結構價位）：明日漲停 ${fmt(L.limits.up)} · 跌停 ${fmt(L.limits.down)}</p>`:'');}
  const P=H.patterns;if(P&&(P.trend||P.box)){const t=P.trend,b=P.box;html+=`<div class="rcard patt"><div class="rc-head"><h3>形態偵測<small>（觀察用）</small></h3><span>依 ${dfmt(H.date)} 收盤</span></div>
   ${t?`<div class="sector-line"><span>📈 上升趨勢線（近期低點墊高）</span><b class="${t.state==='守住'?'up':'down'}">${t.state}</b><strong>線約 ${fmt(t.lineToday)}</strong></div><p class="rc-note">近 ${t.sinceDays} 日內最近 3 個波段低點 ${t.points.map(p=>dfmt(p[0]).slice(5)+' '+fmt(p[1])).join(' → ')}，趨勢線每日約 ${t.slopePct>0?'+':''}${fmt(t.slopePct)}%；收盤距趨勢線 ${t.dist>0?'+':''}${fmt(t.dist,1)}%。</p>`:''}
   ${b?`<div class="sector-line"><span>▭ 整理平台（前 ${b.days} 日區間窄）</span><b>${b.state}</b><strong>${fmt(b.low)}–${fmt(b.high)}</strong></div><p class="rc-note">不含今日的前 ${b.days} 個交易日最高 ${fmt(b.high)}、最低 ${fmt(b.low)}，區間寬度 ${fmt(b.width,1)}%。</p>`:''}
   <p class="rc-note sep">形態為依歷史價量自動偵測的觀察標示，不是買賣訊號，也不預測突破方向；偵測規則見下方「計算方法與資料說明」。</p></div>`;}
  }else html+=`<div class="card"><h3>價格走勢 / 支撐壓力<span>尚無歷史</span></h3><p class="note2">此股票目前不在每日歷史抓取範圍（主要成交金額前段＋預設清單），因此暫無走勢、均線與支撐壓力（資料不足）。系統每日累積收盤快照，資料足夠後會自動顯示。</p></div>`;
  html+=`<div id="research"><div class="empty">正在彙整產業、法人、融資與 ETF 資料…</div></div>`;
  $('#detail').innerHTML=html;
  const [C,E]=await Promise.all([CH||(CH=fetch('data/chips.json').then(r=>r.json())),EF||(EF=fetch('data/etf.json').then(r=>r.json()))]);
  if(sel!==code)return;$('#research').innerHTML=research(s,H,C,E);bindResearch();
}
let CH=null,EF=null,etfTab='全部';
const IND={"01":"水泥工業","02":"食品工業","03":"塑膠工業","04":"紡織纖維","05":"電機機械","06":"電器電纜","07":"化學生技醫療","08":"玻璃陶瓷","09":"造紙工業","10":"鋼鐵工業","11":"橡膠工業","12":"汽車工業","14":"建材營造","15":"航運業","16":"觀光餐旅","17":"金融保險","18":"貿易百貨","19":"綜合","20":"其他","21":"化學工業","22":"生技醫療","23":"油電燃氣","24":"半導體業","25":"電腦及週邊設備","26":"光電業","27":"通信網路業","28":"電子零組件業","29":"電子通路業","30":"資訊服務業","31":"其他電子業","32":"文化創意業","33":"農業科技業","34":"電子商務","35":"綠能環保","36":"數位雲端","37":"運動休閒","38":"居家生活"};
function vr20(rows){const v=rows.map(r=>r[5]||0);if(v.length<20)return '—';const a=v.slice(-20).reduce((x,y)=>x+y)/20;return a?fmt(v.at(-1)/a)+' 倍':'—';}
const z=v=>v==null?'—':(v>0?'+':'')+fmt(v,1);
function research(s,H,C,E){
  const close=s.close;let o='';
  // 產業
  const peers=ALL.filter(x=>x.market===s.market&&x.ind);const agg={};peers.forEach(x=>{(agg[x.ind]=agg[x.ind]||{v:0,n:0});agg[x.ind].v+=x.value||0;agg[x.ind].n++;});
  const ranks=Object.entries(agg).sort((a,b)=>b[1].v-a[1].v).map(x=>x[0]);const rk=s.ind?ranks.indexOf(s.ind)+1:0;const indName=s.ind?(IND[s.ind]||'產業代碼 '+s.ind):null;
  // 法人
  const days=C.days,raw=C.inst[s.code]||days.map(()=>null);const got=C.instGot[s.market]||[];
  const D=days.map((d,i)=>({d,x:raw[i],ok:got.includes(d)})).filter(r=>r.ok);
  const tot=r=>r.x?(r.x[0]+r.x[1]+r.x[2])/1000:0;const sum=D.reduce((a,r)=>a+tot(r),0);const buy=D.filter(r=>tot(r)>0).length,sell=D.filter(r=>tot(r)<0).length;
  const cat=i=>D.reduce((a,r)=>a+(r.x?r.x[i]:0),0)/1000;
  // 綜合判讀
  const vrv=H&&H.rows.length>=20?(H.rows.at(-1)[5]/(H.rows.slice(-20).reduce((a,r)=>a+(r[5]||0),0)/20)):null;const lastI=raw.at(-1);const fd=lastI&&got.includes(days.at(-1))?lastI[0]/1000:null;
  const vline=vrv==null?'':`<li><b>${vrv<1?'成交量縮小':'成交量放大'}</b> 成交量約為近 20 日均量的 ${fmt(vrv)} 倍。</li>`;
  const fline=fd==null?'':`<li><b>${fd>=0?'外資買超':'外資賣超'}</b> 外資（含陸資、外資自營商）${dfmt(days.at(-1))} 合計 ${fmt(Math.abs(fd),0)} 張。</li>`;
  o+=`<div class="rcard verdict"><div class="rc-head"><h3>綜合判讀</h3><span>${dfmt(s.date)} 收盤</span></div><h4>${indName||(s.etf?'ETF':'產業資料待確認')}${rk?` · 同日成交金額第 ${rk} 名`:''}</h4><p>個股成交 ${fmt(s.value/1e8)} 億元。${D.length?`近 ${D.length} 日法人買超 ${buy} 日，合計 ${z(sum)} 張。`:'官方資料未提供此股票的法人買賣超。'}</p><ul class="vl">${vline}${fline}</ul></div>`;
  o+=`<div class="rcard"><div class="rc-head"><h3>產業熱度</h3><span>依官方產業分類</span></div>${indName?`<div class="sector-line"><span>${indName}</span><b>第 ${rk} / ${ranks.length}</b><strong>${fmt(agg[s.ind].v/1e8)} 億</strong></div>
   <p class="rc-note">${dfmt(s.date)} 同日已取得行情，分類內 ${agg[s.ind].n} 檔。排名依${s.market}成交金額，不代表資金淨流入。來源：${s.market==='上市'?'證交所 t187ap03_L':'櫃買中心 mopsfin_t187ap03_O'}（產業別）＋ 每日收盤行情。</p>`:`<p class="rc-note">官方資料未提供此證券的產業別（ETF 等不列入公司基本資料）。</p>`}
   <p class="rc-note sep">題材資金流（如 GaN）：尚無可驗證的題材名單及計算來源。</p></div>`;
  // 位置
  const L=H&&H.levels;const s1=L&&L.support[0],r1=L&&L.resistance[0];
  o+=`<div class="rcard"><div class="rc-head"><h3>支撐壓力位置</h3><span>依 ${dfmt(H?H.date:s.date)} 收盤</span></div>`;
  if(s1&&r1){const pos=(close-s1.price)/(r1.price-s1.price)*100;o+=`<div class="track"><i style="left:${Math.max(0,Math.min(100,pos))}%"></i></div>
   <div class="pos3"><div><small>第一支撐</small><strong class="down">${fmt(s1.price)}</strong><em>價格帶 ${fmt(s1.low)}–${fmt(s1.high)}</em></div><div><small>收盤價</small><strong>${fmt(close)}</strong><em>位於區間 ${fmt(pos,1)}%</em></div><div><small>第一壓力</small><strong class="up">${fmt(r1.price)}</strong><em>價格帶 ${fmt(r1.low)}–${fmt(r1.high)}</em></div></div>
   <p class="rc-note">距支撐 ${fmt(s1.dist,1)}% · 距壓力 ${fmt(r1.dist,1)}%。此圖沿用上方歷史轉折價位，不另外推算「交界」價格。</p>`;}else o+=`<p class="rc-note">支撐或壓力資料不足，無法繪製位置圖。</p>`;o+='</div>';
  // 法人 20 日
  const mx=Math.max(1,...D.map(r=>Math.abs(tot(r))));const srcI=s.market==='上市'?C.sources.instTwse:C.sources.instTpex;
  o+=`<div class="rcard"><div class="rc-head"><h3>三大法人 · 近 20 日</h3><span>單位：張</span></div>`;
  if(D.length&&C.inst[s.code]){o+=`<div class="inst-sum"><div><h4>${buy>sell?'買超日較多':sell>buy?'賣超日較多':'買賣交錯'}</h4><small>買超 ${buy} / 已取得 ${D.length} 日</small></div><div class="r"><strong class="${cls(sum)}">${z(sum)}</strong><small>已取得日合計</small></div></div>
   <div class="ibars">${D.map(r=>{const v=tot(r),h=Math.abs(v)/mx*50;return `<i title="${r.d} ${z(v)} 張" class="${v>=0?'pos':'neg'}" style="height:${h}px;${v>=0?`margin-bottom:50px`:`margin-top:50px`}"></i>`}).join('')}</div>
   <div class="ma"><small>${dfmt(D[0].d)}</small><small>${dfmt(D.at(-1).d)}</small></div>
   <div class="cat3"><div><small>外資（含外資自營商）</small><b class="${cls(cat(0))}">${z(cat(0))}</b></div><div><small>投信</small><b class="${cls(cat(1))}">${z(cat(1))}</b></div><div><small>自營商</small><b class="${cls(cat(2))}">${z(cat(2))}</b></div></div>
   <details><summary>查看逐日明細與來源</summary><table><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th></tr>${D.slice().reverse().map(r=>`<tr><td>${dfmt(r.d)}</td>${r.x?[0,1,2].map(i=>`<td class="${cls(r.x[i])}">${z(r.x[i]/1000)}</td>`).join('')+`<td class="${cls(tot(r))}">${z(tot(r))}</td>`:'<td colspan="4">當日未列入（不視為零）</td>'}</tr>`).join('')}</table>
   <p class="rc-note">來源：<a href="${srcI}" target="_blank" rel="noreferrer">${s.market==='上市'?'證交所 T86 三大法人買賣超日報':'櫃買中心 三大法人買賣明細'} ↗</a></p></details>
   <p class="rc-note">按已取得日線的最近 20 個交易日查詢；缺資料不視為零。買賣超股數換算為張，不以收盤價估算成交金額。</p>`;}
  else o+=`<p class="rc-note">官方資料未提供此股票的三大法人買賣超（${s.market==='上市'?'證交所 T86':'櫃買中心'}未列入）。</p>`;o+='</div>';
  // 融資
  const M=C.margin[s.code],md=C.marginDays;o+=`<div class="rcard"><div class="rc-head"><h3>融資變化</h3><span>${md.at(-1)}</span></div>`;
  if(M&&M.at(-1)){const bal=M.at(-1)[0],d1=bal-M.at(-1)[1],d5=M[0]?bal-M[0][0]:null;
   o+=`<div class="m4"><div><small>餘額</small><b>${fmt(bal,0)} <em>張</em></b></div><div><small>單日增減</small><b class="${cls(d1)}">${(d1>0?'+':'')+fmt(d1,0)}</b></div><div><small>5 日增減</small><b class="${cls(d5)}">${d5==null?'—':(d5>0?'+':'')+fmt(d5,0)}</b><small>${d5!=null&&bal>0?(d5>0?'+':'')+fmt(d5/M[0][0]*100,1)+'%':''}</small></div><div><small>維持率</small><b>—</b><small>官方資料未提供</small></div></div>
   <p class="rc-note">5 日增減＝最新餘額減去 5 個交易日前餘額；對照日缺資料則留白。<a href="${s.market==='上市'?C.sources.marginTwse:C.sources.marginTpex}" target="_blank" rel="noreferrer"> 官方來源 ↗</a></p>`;}
  else o+=`<p class="rc-note">官方資料未提供（此證券非融資融券標的或當日未列入）。</p>`;o+='</div>';
  // ETF
  const F=E.funds,ok=F.filter(f=>f.ok),fm=Object.fromEntries(F.map(f=>[f.code,f]));
  const rows=(E.holdings[s.code]||[]).map(h=>{const f=fm[h.fund],d=h.prevShares==null?null:h.shares-h.prevShares;return {...h,f,d,st:h.prevShares==null?'等待比較基準':!h.prevShares&&h.shares?'新納入':!h.shares?'已移除':d>0?'持股增加':d<0?'持股減少':'持股不變'};}).sort((a,b)=>b.shares-a.shares);
  const R=rows.filter(r=>etfTab==='全部'||(etfTab==='增加'?r.d>0||r.st==='新納入':r.d<0||r.st==='已移除'));
  o+=`<div class="rcard"><div class="rc-head"><h3>ETF 持股與增減</h3><span>資料日期 ${ok[0]?.date||'—'}</span></div>
   <p class="rc-note">目前接入元大、群益共 ${F.length} 檔 ETF，已取得 ${ok.length} 檔，失敗 ${F.length-ok.length} 檔。這是已接入範圍，尚未涵蓋全市場 ETF。</p>
   <div class="tabs">${['全部','增加','減少'].map(t=>`<button data-t="${t}" class="${t===etfTab?'on':''}">${t}</button>`).join('')}<span>本股找到 ${rows.filter(r=>r.shares).length} 檔持有</span></div>
   ${R.length?`<table class="etft"><tr><th>ETF / 基準日</th><th>持有張數</th><th>權重</th><th>增減張數</th><th>比較基準</th></tr>${R.map(r=>`<tr><td><a href="${r.f.url}" target="_blank" rel="noreferrer">${r.fund} ${r.f.name} ↗</a><small>${r.f.date}</small></td><td>${fmt(r.shares/1000,3)}</td>
   <td>${fmt(r.weight)}%<small>變化 ${r.prevWeight==null?'—':(r.weight-r.prevWeight>0?'+':'')+fmt(r.weight-r.prevWeight)} 百分點</small></td><td class="${cls(r.d)}">${r.d==null?'—':(r.d>0?'+':'')+fmt(r.d/1000,3)}<small>${r.st}</small></td><td>${r.prevShares==null?'<b>首次收錄，待下一期</b>':r.f.prevDate}</td></tr>`).join('')}</table>`
   :`<p class="rc-note">${rows.length?'目前沒有符合此篩選的可比較紀錄。':'在已成功取得的 ETF 名單中未找到本股；未接入或失敗的 ETF 無法判定。'}</p>`}
   <details><summary>查看涵蓋清單與資料限制</summary><table><tr><th>ETF</th><th>發行</th><th>基準日</th><th>比較日</th><th>持股數</th></tr>${F.map(f=>`<tr><td><a href="${f.url}" target="_blank" rel="noreferrer">${f.code} ${f.name}</a></td><td>${f.issuer}</td><td>${f.date||'取得失敗'}</td><td>${f.prevDate||'—'}</td><td>${f.n}</td></tr>`).join('')}</table>
   <p class="rc-note">00981A、國泰、富邦及其他尚未列入的 ETF 未接入，不會推定為未持有。群益可回查前期，元大從首次成功收錄開始累積歷史；比較日不一定是前一交易日。股數變化包含申購買回、股票分割與公司行動，不等於經理人主動買賣。權重變化也受股價影響。資料每個交易日由排程自動更新。</p></details></div>`;
  o+=`<details class="method"><summary>計算方法與資料說明</summary>
   <p>支撐壓力不是目標價、不是買賣建議，也不代表適合追價。價位全部來自真實歷史成交結構：近 120 個交易日的波段高低點（前後各 2 日確認）與量能K（成交量 ≥ 前 20 日均量 1.5 倍）的最高、最低價；高點被突破超過 1% 後不再當壓力；支撐被跌破時結構轉弱。相鄰結構落在同一波動容差（1.6%）內合併為同一價格帶，不硬拆兩區；價位皆依台股升降單位取整。支撐：現價下方 0～10% 標示近端、10～20% 標示中期、超過 20% 列為長期結構。支撐候選包含波段低點、缺口邊緣、MA5／MA20、近 20 日高低點與量能K。壓力：第一壓力帶之上的下一個獨立結構，若已超過 +10% 則保留、改標中期壓力。近 10 日高點落在第一壓力帶時，標為「關鍵突破／壓力共振區」。找不到真實結構就顯示「尚未形成」，不以公式補值；「資料不足」表示來源資料不足以計算。創新高時顯示明日漲停參考價（依漲跌幅限制，非結構價位）。</p>
   <p>量比＝最新日成交量 ÷ 近 20 日均量（含當日）。均線與走勢以歷史資料最後一日為準。重大除權（官方除權息參考價 ÷ 前收 ≤ 0.9，如股票分割）已依證交所 TWT49U／櫃買中心 exDailyQ 還原，一般現金股息（通常小於 5%）未還原，相關價位需另行判讀。</p><p>形態偵測：①上升趨勢線＝近 60 日內最近 3 個波段低點（前後各 2 日確認）依序墊高且首尾相距 ≥ 15 日，以最小平方法擬合，收盤距線 ≥ -1.5% 為守住、否則為跌破；②整理平台＝不含今日的前 N 日（N=20／15／10）最高最低價區間寬度 ≤ 12%（N=20）或 9%（N≤15），再依今日收盤標示平台內、突破上緣或跌破下緣。皆為觀察用標示，不是買賣訊號。</p>
   <p>資料來源：臺灣證券交易所 OpenAPI／網站資料（STOCK_DAY_ALL、STOCK_DAY、T86、MI_MARGN、t187ap03_L）與櫃買中心 OpenAPI／網站資料（每日收盤行情、個股日成交、三大法人、融資融券餘額、mopsfin_t187ap03_O）；ETF 持股取自元大投信、群益投信官網公開持股。法人單位為千股換算張，日期獨立標示。每個交易日 22:00（台北）自動更新。</p>
   <p>技術價位是研究參考，不是目標價或買賣指示；不保證價格守住支撐或突破壓力。</p></details>`;
  return o;
}
function bindResearch(){document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{etfTab=b.dataset.t;const s=ALL.find(x=>x.code===sel);Promise.all([CH,EF]).then(([C,E])=>{$('#research').innerHTML=research(s,window._H,C,E);bindResearch();});});}
init();
