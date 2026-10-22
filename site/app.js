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
  <div class="srcline">走勢 · 資料日期 ${dfmt(H.rows[0][0])}–${dfmt(H.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY 個股日成交資訊':'tradingStock 個股日成交資訊'}）</div></div>
  <div class="sectionlabel"><h3>接下來，看哪裡？</h3><span>價格結構觀察 · 依 ${dfmt(H.date)} 收盤 · 來源 ${s.src}</span></div>`;
  if(L){html+=`<div class="levels">${lvl(L.support[0],'support',1,close)}${lvl(L.support[1],'support',2,close)}${lvl(L.resistance[0],'resist',1,close)}${lvl(L.resistance[1],'resist',2,close)}</div>`;
  }
  }else html+=`<div class="card"><h3>價格走勢 / 支撐壓力<span>尚無歷史</span></h3><p class="note2">此股票目前不在每日歷史抓取範圍（主要成交金額前段＋預設清單），因此暫無走勢、均線與支撐壓力。系統每日累積收盤快照，資料足夠後會自動顯示。</p></div>`;
  html+=`<div id="research"><div class="empty">正在彙整產業、法人、融資與 ETF 資料…</div></div>`;
  $('#detail').innerHTML=html;
  const [C,E]=await Promise.all([CH||(CH=fetch('data/chips.json').then(r=>r.json())),EF||(EF=fetch('data/etf.json').then(r=>r.json()))]);
  if(sel!==code)return;$('#research').innerHTML=research(s,H,C,E);bindResearch();
}
let CH=null,EF=null,etfTab='全部';
const IND={"01":"水泥工業","02":"食品工業","03":"塑膠工業","04":"紡織纖維","05":"電機機械","06":"電器電纜","07":"化學生技醫療","08":"玻璃陶瓷","09":"造紙工業","10":"鋼鐵工業","11":"橡膠工業","12":"汽車工業","14":"建材營造","15":"航運業","16":"觀光餐旅","17":"金融保險","18":"貿易百貨","19":"綜合","20":"其他","21":"化學工業","22":"生技醫療","23":"油電燃氣","24":"半導體業","25":"電腦及週邊設備","26":"光電業","27":"通信網路業","28":"電子零組件業","29":"電子通路業","30":"資訊服務業","31":"其他電子業","32":"文化創意業","33":"農業科技業","34":"電子商務","35":"綠能環保","36":"數位雲端","37":"運動休閒","38":"居家生活"};
function vr20(rows){const v=rows.map(r=>r[5]||0);if(v.length<21)return '—';const a=v.slice(-21,-1).reduce((x,y)=>x+y)/20;return a?fmt(v.at(-1)/a)+' 倍':'—';}
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
  o+=`<div class="rcard verdict"><div class="rc-head"><h3>綜合判讀</h3><span>${dfmt(s.date)} 收盤</span></div><h4>${indName||(s.etf?'ETF':'產業資料待確認')}${rk?` · 同日成交金額第 ${rk} 名`:''}</h4><p>個股成交 ${fmt(s.value/1e8)} 億元。${D.length?`近 ${D.length} 日法人買超 ${buy} 日，合計 ${z(sum)} 張。`:'官方資料未提供此股票的法人買賣超。'}</p></div>`;
  o+=`<div class="rcard"><div class="rc-head"><h3>產業熱度</h3><span>依官方產業分類</span></div>${indName?`<div class="sector-line"><span>${indName}</span><b>第 ${rk} / ${ranks.length}</b><strong>${fmt(agg[s.ind].v/1e8)} 億</strong></div>
   <p class="rc-note">${dfmt(s.date)} 同日已取得行情，分類內 ${agg[s.ind].n} 檔。排名依${s.market}成交金額，不代表資金淨流入。來源：${s.market==='上市'?'證交所 t187ap03_L':'櫃買中心 mopsfin_t187ap03_O'}（產業別）＋ 每日收盤行情。</p>`:`<p class="rc-note">官方資料未提供此證券的產業別（ETF 等不列入公司基本資料）。</p>`}
   <p class="rc-note sep">題材資金流（如 GaN）：尚無可驗證的題材名單及計算來源。</p></div>`;
  // 位置
  const L=H&&H.levels;const s1=L&&L.support[0],r1=L&&L.resistance[0];
  o+=`<div class="rcard"><div class="rc-head"><h3>支撐壓力位置</h3><span>依 ${dfmt(H?H.date:s.date)} 收盤</span></div>`;
  if(s1&&r1){const pos=(close-s1.high)/(r1.low-s1.high)*100;o+=`<div class="track"><i style="left:${Math.max(0,Math.min(100,pos))}%"></i></div>
   <div class="pos3"><div><small>第一支撐</small><strong class="down">${fmt(s1.high)}</strong><em>價格帶 ${fmt(s1.low)}–${fmt(s1.high)}</em></div><div><small>收盤價</small><strong>${fmt(close)}</strong><em>位於區間 ${fmt(pos,1)}%</em></div><div><small>第一壓力</small><strong class="up">${fmt(r1.low)}</strong><em>價格帶 ${fmt(r1.low)}–${fmt(r1.high)}</em></div></div>
   <p class="rc-note">距支撐 ${fmt((close/s1.high-1)*100,1)}% · 距壓力 ${fmt((r1.low/close-1)*100,1)}%。此圖沿用上方歷史轉折價位，不另外推算「交界」價格。</p>`;}else o+=`<p class="rc-note">支撐或壓力資料不足，無法繪製位置圖。</p>`;o+='</div>';
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
   <p>支撐壓力：取近 120 個交易日：① 波段高低點（某日最高/最低為前後各 3 日的極值）；② 經典樞紐點 P=(H+L+C)/3、S1=2P−H、S2=P−(H−L)、R1=2P−L、R2=P+(H−L)；③ MA20、MA60。候選價位與該帶起點差距 1.5% 內者合併為一個「價格帶」（低–高）。低於收盤的最近兩帶為第一、第二支撐，高於收盤者為壓力。缺少結構時不補猜測值。</p>
   <p>量比＝最新日成交量 ÷ 前 20 日均量。均線與走勢以歷史資料最後一日為準。未還原價格受除權息、分割影響，相關價位需另行判讀。</p>
   <p>資料來源：臺灣證券交易所 OpenAPI／網站資料（STOCK_DAY_ALL、STOCK_DAY、T86、MI_MARGN、t187ap03_L）與櫃買中心 OpenAPI／網站資料（每日收盤行情、個股日成交、三大法人、融資融券餘額、mopsfin_t187ap03_O）；ETF 持股取自元大投信、群益投信官網公開持股。法人單位為千股換算張，日期獨立標示。每個交易日 15:00（台北）自動更新。</p>
   <p>技術價位是研究參考，不是目標價或買賣指示；不保證價格守住支撐或突破壓力。</p></details>`;
  return o;
}
function bindResearch(){document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{etfTab=b.dataset.t;const s=ALL.find(x=>x.code===sel);Promise.all([CH,EF]).then(([C,E])=>{$('#research').innerHTML=research(s,window._H,C,E);bindResearch();});});}
init();
