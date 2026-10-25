const $=s=>document.querySelector(s);const fmt=(v,d=2)=>v==null?'—':Number(v).toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
const cls=v=>v>0?'up':v<0?'down':'flat';const sg=v=>v>0?'+':'';

/* 版面模式：auto（依螢幕）／desktop／mobile，儲存在 localStorage（tw-viewmode），不含任何個資 */
const VM=()=>{try{return localStorage.getItem('tw-viewmode')||'auto'}catch(e){return 'auto'}};
const isM=()=>VM()==='mobile'||(VM()==='auto'&&matchMedia('(max-width:768px)').matches);
function applyMode(){const m=VM();document.documentElement.classList.toggle('m',isM());
  document.querySelectorAll('#vsw button').forEach(b=>b.classList.toggle('on',b.dataset.vm===m));
  const vp=document.getElementById('vp');if(vp)vp.setAttribute('content',(m==='desktop'&&screen.width<=768)?'width=1280':'width=device-width,initial-scale=1');
  if(!isM())$('#side').classList.remove('open');}
document.querySelectorAll('#vsw button').forEach(b=>b.onclick=()=>{try{localStorage.setItem('tw-viewmode',b.dataset.vm)}catch(e){}applyMode();});
$('#menuBtn').onclick=()=>{const o=$('#side').classList.toggle('open');$('#menuBtn').setAttribute('aria-expanded',o)};
$('#toTop').onclick=()=>scrollTo({top:0,behavior:'smooth'});
matchMedia('(max-width:768px)').addEventListener('change',applyMode);applyMode();
const toDetail=()=>{if(isM())setTimeout(()=>$('#detail').scrollIntoView({behavior:'smooth',block:'start'}),50);};
let ALL=[],META={},INST={},view='all',mkt='',sel=null,SC=null,scF='',tierF=-1,FD=null,RV=null;
const W=()=>JSON.parse(localStorage.getItem('tw-watch')||'["2330","0050"]');
const setW=a=>{localStorage.setItem('tw-watch',JSON.stringify(a));render();};
const toggle=c=>{const a=W();setW(a.includes(c)?a.filter(x=>x!==c):[...a,c]);};
const dfmt=d=>d?d.replaceAll('-','/'):'—';
async function init(){
  const [s,i,sc,fl,cs]=await Promise.all([fetch('data/stocks.json').then(r=>r.json()),fetch('data/institutional.json').then(r=>r.json()),fetch('data/screen.json').then(r=>r.json()).catch(()=>null),fetch('data/flags.json').then(r=>r.json()).catch(()=>null),fetch('data/chipsum.json').then(r=>r.json()).catch(()=>null)]);
  ALL=s.stocks;META=s.meta;INST=i;SC=sc;FL=fl;CS=cs;
  fetch('data/calendar.json').then(r=>r.json()).then(c=>{CAL=c;dateBar();if(sel)render();}).catch(()=>{dateBar();});
  if(SC){const c=$('#covN');if(c)c.textContent='技術分析目前涵蓋 '+SC.meta.n+' 檔（資料日期 '+dfmt(SC.meta.date)+'）';}
  scrUI();dateBar();xfUI();
  ['themes','metrics','events','news'].forEach((n,i)=>fetch('data/'+n+'.json').then(r=>r.json()).then(v=>{[v=>TH=v,v=>MT=v,v=>EV=v,v=>NW=v][i](v);if(n==='metrics'||n==='themes'){advUI();render();}if(n==='news'){try{xfUI();}catch(e){}render();}if(sel&&(n==='events'||n==='news'))pick(sel);}).catch(()=>{}));
  $('#upd').textContent=META.updated.replace('T',' ').slice(0,16)+' (台北)';
  $('#cTw').innerHTML=META.counts.twse+'<em> 檔</em>';$('#cTp').innerHTML=META.counts.tpex+'<em> 檔</em>';
  $('#dTw').textContent='交易日期 '+dfmt(META.twseDate);$('#dTp').textContent='交易日期 '+dfmt(META.tpexDate);
  $('#nAll').textContent=ALL.length;$('#nEtf').textContent=ALL.filter(x=>x.etf).length;
  document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  document.querySelectorAll('.filters button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('chosen'));b.classList.add('chosen');mkt=b.dataset.m;render();});
  $('#q').oninput=render;$('#sort').onchange=render;
  loadEF().then(e=>{ETFSET=new Set(e.funds.filter(f=>f.date).map(f=>f.code));render();}).catch(()=>{});
  render();const h=location.hash.slice(1);pick(ALL.find(x=>x.code===h)?h:'2330');
}
function render(){
  const w=W();$('#nWatch').textContent=w.length;$('#cW').innerHTML=w.length+'<em> 檔</em>';
  const q=$('#q').value.trim().toLowerCase();let L=ALL;
  if(view==='watch')L=L.filter(x=>w.includes(x.code));if(view==='etf')L=L.filter(x=>x.etf);
  if(mkt==='ETF')L=L.filter(x=>x.etf);else if(mkt)L=L.filter(x=>x.market===mkt);
  if(q)L=L.filter(x=>x.code.toLowerCase().includes(q)||x.name.toLowerCase().includes(q));
  if(XF)L=L.filter(xfPass);
  if(advOn())L=L.filter(advPass);
  if(SC&&(scF||tierF>=0))L=L.filter(x=>{const a=SC.items[x.code];return a&&(!scF||a.scen.includes(scF))&&(tierF<0||a.tier===tierF);});
  const k=$('#sort').value;const pct=x=>x.change/(x.close-x.change);
  const SK=SORTS[k];
  L=[...L].sort(SK?(a,b)=>{const fa=SK.f(a),fb=SK.f(b);return (fb==null?-Infinity:fb)-(fa==null?-Infinity:fa)||(b.value||0)-(a.value||0);}:k==='code'?(a,b)=>a.code.localeCompare(b.code):k==='change'?(a,b)=>pct(b)-pct(a):(a,b)=>(b[k]||0)-(a[k]||0));
  $('#listTitle').textContent=({all:'全部股票',watch:'我的自選',etf:'ETF',w25:'全部股票'})[view]||'全部股票';$('#listCount').textContent=L.length+' 檔';if(SC)scrStatus(L.length);advUI(L.length);
  const ld=$('#listdate');if(ld)ld.innerHTML=`資料日期 上市 ${dfmt(META.twseDate)} · 上櫃 ${dfmt(META.tpexDate)}${META.twseDate!==META.tpexDate?' <span class="stalechip">兩市場資料日不同</span>':''}`;
  $('#list').innerHTML=L.slice(0,300).map(x=>`<div class="row ${x.code===sel?'sel':''}" data-c="${x.code}"><span class="star ${w.includes(x.code)?'on':''}" data-s="${x.code}">${w.includes(x.code)?'★':'☆'}</span>
  <div class="nm"><b>${x.name}</b><small>${x.code}<span class="tag">${x.market}${x.etf?' · ETF':''}</span>${ETFSET.has(x.code)?'<span class="tag hold">持股明細</span>':''}${flHtml(x.code)}${dtTags(x)}${SC&&SC.items[x.code]?` <span class="tier t${SC.items[x.code].tier}">${TIERS[SC.items[x.code].tier]}</span>`:(x.hasHistory?'':' <span title="尚無月歷史">◦</span>')}</small></div>
  <div class="px"><b>${fmt(x.close)}</b><small class="${cls(x.change)}">${sg(x.change)}${fmt(x.change)} (${sg(x.change)}${fmt(pct(x)*100)}%)</small>${SK&&SK.f(x)!=null?`<small class="sml">${SK.t(x)}</small>`:''}</div></div>`).join('')||'<div class="empty">沒有符合的股票</div>';
  if(L.length>300)$('#list').insertAdjacentHTML('beforeend','<div class="empty">僅顯示前 300 檔，請用搜尋縮小範圍</div>');
  $('#list').querySelectorAll('.row').forEach(r=>r.onclick=e=>{if(e.target.dataset.s)toggle(e.target.dataset.s);else{pick(r.dataset.c);toDetail();}});
}
let W25=null;
const etfDelta=(E,code)=>{if(!E)return null;const hs=(E.holdings[code]||[]).filter(h=>h.prevShares!=null);if(!hs.length)return {n:0,d:0,up:0,dn:0};
  return {n:hs.length,d:hs.reduce((a,h)=>a+(h.shares-h.prevShares),0),up:hs.filter(h=>h.shares>h.prevShares).length,dn:hs.filter(h=>h.shares<h.prevShares).length};};
const lotS=d=>{if(d==null)return '—';if(!d)return '0';const z=d>0?'+':'−',a=Math.abs(d);return a<1000?`${z}${fmt(a,0)} 股`:`${z}${fmt(a/1000,0)} 張`;};
async function overview(){
  const box=$('#detail');box.innerHTML='<div class="empty">正在載入自選 25 檔總覽…</div>';
  try{W25=W25||await fetch('data/watch25.json').then(r=>r.json());}catch(e){box.innerHTML='<div class="empty">總覽資料載入失敗</div>';return;}
  let E_=null;try{E_=await loadEF();}catch(e){}
  if(view!=='w25')return;
  const I=W25.items,z1=v=>v==null?'—':(v>0?'+':'')+fmt(v,1);const bad=I.filter(i=>i.issues&&i.issues.length);
  const xcols=i=>{const o=CS&&CS.items[i.code],c=o&&o.c,q=o&&o.i,ed=etfDelta(E_,i.code),fl=flHtml(i.code);
   return `<td class="num">${c?`<b class="${cls(c[2])}">${lotS(c[2]*1000).replace(' 張','')}</b><small>5 日 · 單日 ${sgn(c[1])}</small>`:'<small>官方未列入</small>'}</td>
   <td class="num">${c&&c[4]!=null?`<b>${fmt(c[4],1)}%</b><small>融資餘額 ${fmt(c[0],0)} 張</small>`:'<small>—</small>'}</td>
   <td class="num">${ed==null?'<small>載入失敗</small>':ed.n?`<b class="${cls(ed.d)}">${lotS(ed.d)}</b><small>${ed.n} 檔 ETF · 增 ${ed.up} 減 ${ed.dn}</small>`:'<small>無持股比對</small>'}</td>
   <td class="num">${q?`<small>外資 <b class="${cls(q[0])}">${q[0]>0?'連買 '+q[0]:q[0]<0?'連賣 '+(-q[0]):'—'}</b>${q[0]?' 日':''}</small><small>投信 <b class="${cls(q[1])}">${q[1]>0?'連買 '+q[1]:q[1]<0?'連賣 '+(-q[1]):'—'}</b>${q[1]?' 日':''}</small>`:'<small>—</small>'}</td>
   <td>${fl||'<small>無</small>'}</td>`;};
  const totRow=I=>{const ok=I.filter(i=>i.close),cc=ok.map(i=>CS&&CS.items[i.code]&&CS.items[i.code].c).filter(Boolean),ed=ok.map(i=>etfDelta(E_,i.code)).filter(e=>e&&e.n);
   const sm=ok.reduce((a,i)=>a+(i.inst?i.inst.total:0),0),m5=cc.reduce((a,c)=>a+(c[2]||0),0),e=ed.reduce((a,x)=>a+x.d,0);
   return `<tr class="ovtot"><td><b>合計</b><small>${ok.length} 檔</small></td><td></td><td></td><td></td><td></td><td class="num"><b class="${cls(sm)}">${sm>0?'+':sm<0?'−':''}${fmt(Math.abs(sm),0)}</b><small>法人合計（張）</small></td><td></td><td class="num"><b class="${cls(m5)}">${m5>0?'+':m5<0?'−':''}${fmt(Math.abs(m5),0)}</b><small>${cc.length} 檔有融資資料</small></td><td></td><td class="num"><b class="${cls(e)}">${lotS(e)}</b><small>${ed.length} 檔有 ETF 比對</small></td><td></td><td></td><td></td></tr>`;};
  const rowh=i=>{if(!i.close)return `<tr><td colspan="13"><b>${i.name}</b> ${i.code} · ${i.issues.join('、')}</td></tr>`;
   const s1=i.s1,r1=i.r1,t=i.trend,b=i.box,n=i.inst;
   return `<tr data-c="${i.code}"><td><b>${i.name}</b><small>${i.code} · ${i.market}</small></td>
   <td class="num"><b>${fmt(i.close)}</b><small class="${cls(i.change)}">${sg(i.change)}${fmt(i.pct)}%</small></td>
   <td class="num">${s1?`<b class="down">${fmt(s1.price)}</b><small>${z1(s1.dist)}%${s1.low!==s1.high?` · 帶 ${fmt(s1.low)}–${fmt(s1.high)}`:''}</small>`:'<small>尚未形成</small>'}</td>
   <td class="num">${r1?`<b class="up">${fmt(r1.price)}</b><small>${z1(r1.dist)}%${r1.low!==r1.high?` · 帶 ${fmt(r1.low)}–${fmt(r1.high)}`:''}</small>`:'<small>尚未形成</small>'}</td>
   <td class="num">${i.volRatio==null?'—':fmt(i.volRatio)+' 倍'}</td>
   <td class="num">${n?`<b class="${cls(n.total)}">${z1(n.total).replace(/\.0$/,'')}</b><small>近3日 ${z1(n.sum3).replace(/\.0$/,'')}</small>`:'<small>官方未列入</small>'}</td>
   <td>${t?`<span class="pill ${t.state==='守住'?'ok':'warn'}">上升趨勢線${t.state}</span>`:''}${b?`<span class="pill">${b.days} 日平台 · ${b.state}</span>`:''}${!t&&!b?'<small>—</small>':''}</td>
   ${xcols(i)}
   <td class="num"><small>${i.days||0} 日${i.adjusted?' · 已還原':''}</small></td></tr>`;};
  box.innerHTML=`<div class="eyebrow">WATCHLIST OVERVIEW <span>自選 ${I.length} 檔 · 資料日期 ${dfmt(W25.date)}</span></div>
  <div class="titleprice"><div><h2>自選 ${I.length} 檔總覽</h2><p>點列可看個股頁 · 價位為本站依歷史價格結構自行計算的觀察價位，不是目標價或買賣建議</p></div></div>
  <div class="tablewrap"><table class="ov"><tr><th>股票</th><th>收盤 / 漲跌</th><th>第一支撐<small>距現價</small></th><th>第一壓力<small>距現價</small></th><th>量比<small>對20日均量</small></th><th>法人買賣超<small>張 · 最新日</small></th><th>形態（觀察用）</th><th>融資增減<small>5 日 · 張</small></th><th>融資使用率</th><th>ETF 增減<small>股數變動</small></th><th>連買連賣<small>含最新日</small></th><th>處置／注意</th><th>歷史</th></tr>${I.map(rowh).join('')}${totRow(I)}</table></div>
  <p class="note2">${bad.length?'資料提醒：'+bad.map(i=>`${i.name}（${i.issues.join('、')}）`).join('；')+'。':'25 檔皆具收盤行情、均線、量比與支撐壓力。'}</p>
  <p class="note2">法人買賣超＝外資＋投信＋自營商合計（千股換算張），來源證交所 T86／櫃買中心；融資增減＝近 5 日融資餘額變化、使用率＝融資餘額÷融資限額（證交所 MI_MARGN／櫃買融資融券）；ETF 增減＝本站已接入的投信 ETF 持股，與前一揭露日比較的股數變動合計（含申購買回，不等於主動買賣）；連買連賣＝外資、投信含最新日的連續天數；處置／注意＝證交所、櫃買中心公告；形態為依歷史價量自動偵測的觀察標示，不預測突破方向。量比＝最新日成交量 ÷ 近 20 日均量。</p>`;
  box.querySelectorAll('tr[data-c]').forEach(r=>r.onclick=()=>{pick(r.dataset.c);toDetail();});
}
/* ===== 資料日期／休市提示（證交所 holidaySchedule 休市日程 + 資料推定的臨時休市） ===== */
let CAL=null;const WKN=['日','一','二','三','四','五','六'];
function tpNow(){const q=new URLSearchParams(location.search).get('_now');if(q&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(q))return {date:q.slice(0,10),min:+q.slice(11,13)*60+ +q.slice(14,16)};
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,min:+p.hour*60+ +p.minute};}
const wdOf=d=>new Date(d+'T00:00:00Z').getUTCDay();
const addD=(d,n)=>new Date(new Date(d+'T00:00:00Z').getTime()+n*864e5).toISOString().slice(0,10);
function closedWhy(d){const w=wdOf(d);if(CAL&&CAL.closed[d])return CAL.closed[d];if(CAL&&CAL.temp[d])return CAL.temp[d];if(w===0||w===6)return '週末';return null;}
const isTD=d=>!closedWhy(d);
const prevTD=d=>{let x=addD(d,-1);for(let i=0;i<30&&!isTD(x);i++)x=addD(x,-1);return x;};
const nextTDafter=d=>{let x=addD(d,1);for(let i=0;i<30&&!isTD(x);i++)x=addD(x,1);return x;};
const dw=d=>`${dfmt(d)}（${WKN[wdOf(d)]}）`;
function dateBar(){
  const el=$('#datebar');if(!el||!META)return;const n=tpNow(),td=n.date,dd=META.twseDate,dp=META.tpexDate;
  const todayTD=isTD(td);const exp=todayTD&&n.min>=22*60+30?td:prevTD(td);
  let nxt,nxtTag='';if(todayTD&&n.min<13*60+30){nxt=td;nxtTag='（今日，尚未收盤）';}else nxt=nextTDafter(td);
  let chip,kind;
  if(!todayTD){const why=closedWhy(td);if(dd===exp){chip=`休市（${why}）／資料沿用上一交易日 ${dfmt(dd)}`;kind='warn';}else{chip=`休市（${why}），且資料非最新交易日：應為 ${dfmt(exp)}，目前 ${dfmt(dd)}`;kind='bad';}}
  else if(dd===td){chip='資料為今日收盤';kind='ok';}
  else if(dd===exp&&n.min<22*60+30){chip=`今日盤後資料尚未更新（約 22:00 後），目前為上一交易日 ${dfmt(dd)}`;kind='warn';}
  else{chip=`資料非最新交易日：應為 ${dfmt(exp)}，目前 ${dfmt(dd)}`;kind='bad';}
  // 今日到下一個交易日之間的休市日（平日才列，說明原因）
  const gaps=[];for(let x=addD(td,todayTD&&n.min<13*60+30?0:1);x<nxt&&gaps.length<8;x=addD(x,1)){const w=closedWhy(x);if(w&&w!=='週末')gaps.push(`${dfmt(x).slice(5)}（${WKN[wdOf(x)]}）${w}`);}
  const yr=CAL&&Math.max(...CAL.years.map(Number));const beyond=yr&&+nxt.slice(0,4)>yr;
  el.innerHTML=`<span class="db-i"><small>資料日期</small><b>${dw(dd)}</b><em>上市${dp&&dp!==dd?` · 上櫃 ${dfmt(dp)}`:' · 上櫃同日'}</em></span>
   <span class="db-i"><small>下一個交易日</small><b>${dw(nxt)}${nxtTag}</b>${gaps.length?`<em>中間休市：${gaps.join('；')}</em>`:''}</span>
   <span class="db-chip ${kind}">${chip}</span>${beyond?`<span class="db-note">休市日程只涵蓋 ${yr} 年，之後僅排除週末</span>`:''}
   <span class="db-src">來源：<a href="${CAL?CAL.source:'#'}" target="_blank" rel="noreferrer">證交所休市日程 ↗</a>${CAL&&Object.keys(CAL.temp).length?' · 臨時休市由證交所無資料推定':''}</span>`;
}
/* ===== 處置／注意／全額交割標記（證交所 notice、punish、TWT85U；櫃買 trading_warning、disposal、cmode） ===== */
/* ===== 當沖輔助：振幅、成交值排行、收盤鎖漲跌停、流動性（STOCK_DAY_ALL／dailyQuotes 當日行情） ===== */
const LIQ_WARN=500,LIQ_LOW=100;   // 成交張數：<500 偏低、<100 極低
const _tk=(p,etf)=>etf?(p<50?0.01:0.05):(p<10?0.01:p<50?0.05:p<100?0.1:p<500?0.5:p<1000?1:5);
let _VR=null;
function vrank(){if(_VR)return _VR;_VR={};const a=ALL.filter(x=>x.value>0).sort((p,q)=>q.value-p.value);a.forEach((x,i)=>{_VR[x.code]={all:i+1,n:a.length};});['上市','上櫃'].forEach(m=>{const b=a.filter(x=>x.market===m);b.forEach((x,i)=>{_VR[x.code].mk=i+1;_VR[x.code].mn=b.length;});});return _VR;}
function dtOf(x){
  if(x._dt!==undefined)return x._dt;
  const pc=x.close!=null&&x.change!=null?+(x.close-x.change).toFixed(2):null;
  if(!pc||pc<=0||x.high==null||x.low==null){return x._dt=null;}
  const r1=pc*1.1,r2=pc*0.9,t1=_tk(r1,x.etf),t2=_tk(r2,x.etf);
  const U=+(Math.floor(r1/t1+1e-9)*t1).toFixed(2),D=+(Math.ceil(r2/t2-1e-9)*t2).toFixed(2),vol=(x.volume||0)/1000;
  return x._dt={pc,amp:(x.high-x.low)/pc*100,U,D,lockU:x.volume>0&&Math.abs(x.close-U)<1e-6,lockD:x.volume>0&&Math.abs(x.close-D)<1e-6,
    flat:x.open===x.high&&x.high===x.low&&x.low===x.close,vol,liq:vol<=0?'none':vol<LIQ_LOW?'low':vol<LIQ_WARN?'warn':'ok'};
}
const dtTags=x=>{const d=dtOf(x);if(!d)return '';let o='';
  if(d.lockU)o+=`<span class="fl dtu" title="收盤價＝依前收盤 ${fmt(d.pc)} ×110% 推算的漲停價 ${fmt(d.U)}${d.flat?'（一字，開高低收同價）':''}">收漲停</span>`;
  if(d.lockD)o+=`<span class="fl dtd" title="收盤價＝依前收盤 ${fmt(d.pc)} ×90% 推算的跌停價 ${fmt(d.D)}${d.flat?'（一字，開高低收同價）':''}">收跌停</span>`;
  if(d.liq==='low')o+=`<span class="fl dtl" title="成交量 ${fmt(d.vol,0)} 張，低於 ${LIQ_LOW} 張，流動性極低，進出可能滑價">低量</span>`;return o;};
function dtCard(s){
  const d=dtOf(s);if(!d)return `<div class="rcard dtc"><div class="rc-head"><h3>當沖輔助</h3><span>資料不足</span></div><p class="rc-note">缺少前收盤或高低價，無法計算振幅與漲跌停。</p></div>`;
  const r=vrank()[s.code]||{},liqT={ok:'成交量尚可',warn:`偏低（< ${LIQ_WARN} 張）`,low:`極低（< ${LIQ_LOW} 張）`,none:'當日無成交'}[d.liq];
  const lim=d.lockU?`<b class="up">收盤鎖漲停</b>`:d.lockD?`<b class="down">收盤鎖跌停</b>`:`<b>未鎖漲跌停</b>`;
  return `<div class="rcard dtc"><div class="rc-head"><h3>當沖輔助</h3><span>${dfmt(s.date)} 當日行情 · 來源 ${s.src}</span></div>
  <div class="m4"><div><small>振幅</small><b>${fmt(d.amp,2)}<em>%</em></b><small>(最高 ${fmt(s.high)} − 最低 ${fmt(s.low)}) ÷ 前收 ${fmt(d.pc)}</small></div>
  <div><small>成交值排行</small><b>第 ${r.all||'—'}<em> / ${r.n||'—'}</em></b><small>${fmt(s.value/1e8,2)} 億 · ${s.market}第 ${r.mk||'—'} / ${r.mn||'—'}</small></div>
  <div><small>成交量</small><b class="${d.liq==='low'||d.liq==='none'?'down':d.liq==='warn'?'warnc':''}">${fmt(d.vol,0)}<em> 張</em></b><small>${liqT}</small></div>
  <div><small>漲跌停（依前收±10%推算）</small>${lim}<small>漲停 ${fmt(d.U)} · 跌停 ${fmt(d.D)}${d.flat?' · 一字':''}</small></div></div>
  ${d.liq==='low'||d.liq==='warn'||d.liq==='none'?`<p class="rc-note dtw">⚠ 流動性警示：成交量 ${fmt(d.vol,0)} 張，${d.liq==='none'?'當日無成交':`低於 ${d.liq==='low'?LIQ_LOW:LIQ_WARN} 張`}，當沖進出可能難以成交或價差擴大。門檻為本站自訂。</p>`:''}
  <p class="rc-note">振幅與漲跌停以官方當日行情自行計算；漲跌停價依「前收盤 ±10%、依升降單位取整」推算，除權息日以官方公告為準（本站不推算參考價）。成交值排行為當日全市場（上市＋上櫃，含 ETF）排名。這是資料特徵，不是當沖或買賣建議。</p></div>`;}
/* 清單排序：籌碼類（CSV）— 無資料者排最後；排序時列出該指標值 */
const csI=(x,k)=>{const o=CS&&CS.items[x.code];return o&&o.i?o.i[k]:null;};
const csC=(x,k)=>{const o=CS&&CS.items[x.code];return o&&o.c?o.c[k]:null;};
const csQ=x=>{const o=CS&&CS.items[x.code];return o&&o.q?o.q[0]:null;};
const SORTS={
 'dt:amp':{f:x=>{const d=dtOf(x);return d?d.amp:null},t:x=>`振幅 ${fmt(dtOf(x).amp,2)}%`},
 'dt:val':{f:x=>x.value,t:x=>`成交值 ${fmt(x.value/1e8,2)} 億 · 第 ${(vrank()[x.code]||{}).all||'—'} 名`},
 'dt:low':{f:x=>{const d=dtOf(x);return d&&d.vol>0?-d.vol:null},t:x=>`成交 ${fmt(dtOf(x).vol,0)} 張`},
 'cs:fs':{f:x=>{const v=csI(x,0);return v>0?v:null},t:x=>`外資連買 ${csI(x,0)} 日`},
 'cs:fsell':{f:x=>{const v=csI(x,0);return v<0?-v:null},t:x=>`外資連賣 ${-csI(x,0)} 日`},
 'cs:ts':{f:x=>{const v=csI(x,1);return v>0?v:null},t:x=>`投信連買 ${csI(x,1)} 日`},
 'cs:f5':{f:x=>csI(x,3),t:x=>`外資 5 日 ${sgn(csI(x,3))} 張`},
 'cs:t5':{f:x=>csI(x,5),t:x=>`投信 5 日 ${sgn(csI(x,5))} 張`},
 'cs:i5':{f:x=>{const i=CS&&CS.items[x.code]&&CS.items[x.code].i;return i?i[3]+i[5]+i[7]:null},t:x=>{const i=CS.items[x.code].i;return `法人 5 日 ${sgn(i[3]+i[5]+i[7])} 張`}},
 'cs:i20':{f:x=>{const i=CS&&CS.items[x.code]&&CS.items[x.code].i;return i?i[4]+i[6]+i[8]:null},t:x=>{const i=CS.items[x.code].i;return `法人 20 日 ${sgn(i[4]+i[6]+i[8])} 張`}},
 'cs:use':{f:x=>csC(x,4),t:x=>`融資使用率 ${fmt(csC(x,4),1)}%`},
 'cs:m5':{f:x=>csC(x,2),t:x=>`融資 5 日 ${sgn(csC(x,2))} 張`},
 'cs:sh':{f:x=>csC(x,5),t:x=>`融券 ${fmt(csC(x,5),0)} 張`},
 'cs:sbl':{f:x=>csC(x,8),t:x=>`借券賣出 ${fmt(csC(x,8),0)} 張`},
 'cs:qf':{f:csQ,t:x=>`外資持股 ${fmt(csQ(x),2)}%`},
};
let FL=null,XF='';
const flOf=c=>FL&&FL.items&&FL.items[c];
const dmd=d=>d?d.slice(5).replace('-','/'):'';
function flTags(c){const f=flOf(c);if(!f)return [];const t=[];
  if(f.p)t.push(['p','處置',`處置期間 ${dfmt(f.p.s)}～${dfmt(f.p.e)}｜${f.p.r}${f.p.mt?'｜'+f.p.mt:''}`]);
  if(f.z)t.push(['p',f.z,'櫃買中心：停止交易']);
  if(f.f)t.push(['f',f.f.per?'全額交割·分盤':'全額交割',f.f.k+(f.f.per?'（分盤集合競價）':'')]);
  if(f.g)t.push(['g',f.g,'櫃買中心：管理股票']);
  if(f.n)t.push(['n',`注意${f.n[0].c?'×'+f.n[0].c:''}`,f.n.map(n=>dfmt(n.d)+' '+n.t).join('；')]);
  return t;}
const flHtml=c=>nwTag(c)+flTags(c).map(([k,l,tt])=>`<span class="fl ${k}" title="${tt.replace(/"/g,'&quot;')}">${l}</span>`).join('');
function flagCard(s){const f=flOf(s.code);if(!FL)return '';
  if(!f)return `<div class="rcard flagc ok"><div class="rc-head"><h3>交易限制與警示</h3><span>${dfmt(FL.asof)} 官方資料</span></div><p class="rc-note" style="margin:0">此股在 ${dfmt(FL.asof)} 沒有處置、全額交割、管理股票或近 3 個公布日的注意股紀錄。<a href="https://www.twse.com.tw/zh/announcement/punish.html" target="_blank" rel="noreferrer">證交所公告 ↗</a></p></div>`;
  const nxt=typeof nextTDafter==='function'?nextTDafter(FL.asof):null;let o='';
  if(f.p){const p=f.p,left=p.e<=FL.asof;o+=`<div class="flr p"><b>處置股</b><span>${p.r}${p.m?'・'+p.m:''}</span><div>處置期間 <b>${dfmt(p.s)}～${dfmt(p.e)}</b>（公布日 ${dfmt(p.pub)}）${left?`<em>資料日 ${dmd(FL.asof)} 已是處置最後一日，期滿後恢復，仍以交易所公告為準</em>`:''}</div>
   <div>${p.mt?`撮合方式：分盤交易，${p.mt}。`:'撮合方式：分盤交易。'}${p.cash?'委託時需預收款券（買進收足價金、賣出收足股票）。':''}</div></div>`;}
  if(f.f)o+=`<div class="flr f"><b>${f.f.k}</b><span>變更交易方法</span><div>證券商須先收足款券才能受理委託${f.f.per?'；此股採分盤集合競價（約每 30 分鐘撮合一次）':''}。</div></div>`;
  if(f.g)o+=`<div class="flr g"><b>${f.g}</b><span>櫃買中心</span><div>列為管理股票，交易方式受限，請以櫃買中心公告為準。</div></div>`;
  if(f.z)o+=`<div class="flr p"><b>${f.z}</b><span>櫃買中心</span></div>`;
  if(f.n)o+=`<div class="flr n"><b>注意股</b><span>近 3 個公布日內 ${f.n.length} 次公告${f.n[0].c?`・累計 ${f.n[0].c} 次`:''}</span>${f.n.map(n=>`<div><b>${dfmt(n.d)}</b>　${n.t}</div>`).join('')}</div>`;
  const tw=s.market==='上市';
  return `<div class="rcard flagc"><div class="rc-head"><h3>交易限制與警示</h3><span>${flTags(s.code).map(t=>t[1]).join('・')}・${dfmt(FL.asof)} 官方資料</span></div>${o}
   <p class="rc-note">來源：${tw?`<a href="${FL.sources.twsePunish}" target="_blank" rel="noreferrer">證交所 處置股</a>、<a href="${FL.sources.twseNotice}" target="_blank" rel="noreferrer">注意股</a>、<a href="${FL.sources.twseTWT85U}" target="_blank" rel="noreferrer">TWT85U 變更交易</a>`:`<a href="${FL.sources.tpexDisposal}" target="_blank" rel="noreferrer">櫃買中心 處置</a>、<a href="${FL.sources.tpexNotice}" target="_blank" rel="noreferrer">注意股</a>、<a href="${FL.sources.tpexCmode}" target="_blank" rel="noreferrer">變更交易／管理股票</a>`}（↗ 官方資料）。標記是官方公告的整理，不是買賣建議；「避開標的」只是風險提醒。</p></div>`;}
/* 清單篩選（交易警示等）：XFDEF 每項 {g 群組, id, name, title, t(code,stock)} */
const XFDEF=[
 {g:'交易警示',id:'avoid',name:'避開標的',title:'處置中、全額交割（變更交易）、管理股票、停止交易',t:c=>!!(FL&&FL.avoid.includes(c))},
 {g:'交易警示',id:'punish',name:'處置中',title:'證交所／櫃買中心公告處置期間內',t:c=>!!(flOf(c)&&flOf(c).p)},
 {g:'交易警示',id:'notice',name:'注意股',title:'近 3 個公布日被公布為注意股',t:c=>!!(flOf(c)&&flOf(c).n)},
 {g:'交易警示',id:'full',name:'全額交割',title:'變更交易方法（全額交割）',t:c=>!!(flOf(c)&&flOf(c).f)},
 {g:'當沖',id:'lockU',name:'收盤鎖漲停',title:'收盤價＝依前收盤 ±10% 推算的漲停價（有成交）',t:(c,x)=>{const d=dtOf(x);return !!(d&&d.lockU)}},
 {g:'當沖',id:'lockD',name:'收盤鎖跌停',title:'收盤價＝依前收盤 ±10% 推算的跌停價（有成交）',t:(c,x)=>{const d=dtOf(x);return !!(d&&d.lockD)}},
 {g:'當沖',id:'amp7',name:'振幅≥7%',title:'(最高−最低)÷前收 ≥ 7%',t:(c,x)=>{const d=dtOf(x);return !!(d&&d.amp>=7)}},
 {g:'當沖',id:'top100',name:'成交值前100',title:'當日全市場成交值前 100 名',t:(c,x)=>((vrank()[x.code]||{}).all||9999)<=100},
 {g:'當沖',id:'liq',name:'低量<500張',title:'成交量低於 500 張（流動性警示）',t:(c,x)=>{const d=dtOf(x);return !!(d&&(d.liq==='warn'||d.liq==='low'))}},
 {g:'公告',id:'nw3',name:'近3日有重訊',title:'公開資訊觀測站重大訊息（本站自存檔日起累積）：最近 3 個存檔日內有發言',t:c=>nwRecent(c,3)>0},
 {g:'公告',id:'nw30',name:'近30日有重訊',title:'最近 30 天內有重大訊息（只含本站存檔日之後）',t:c=>nwRecent(c,30)>0},
 {g:'籌碼',id:'fbuy3',name:'外資連買≥3日',title:'外資含最新日連續買超 ≥ 3 個交易日（T86／櫃買）',t:(c,x)=>csI(x,0)>=3},
 {g:'籌碼',id:'fsell3',name:'外資連賣≥3日',title:'外資含最新日連續賣超 ≥ 3 個交易日',t:(c,x)=>csI(x,0)<=-3},
 {g:'籌碼',id:'tbuy3',name:'投信連買≥3日',title:'投信含最新日連續買超 ≥ 3 個交易日',t:(c,x)=>csI(x,1)>=3},
 {g:'籌碼',id:'muse50',name:'融資使用率≥50%',title:'融資餘額 ÷ 融資限額 ≥ 50%',t:(c,x)=>csC(x,4)>=50},
];
const xfPass=x=>!XF||XFDEF.find(d=>d.id===XF).t(x.code,x);
function xfUI(){const el=$('#xfbox');if(!el)return;const gs=[...new Set(XFDEF.map(d=>d.g))];
  el.innerHTML=gs.map(g=>`<div class="scr-h"><b>${g}</b><span>${g==='交易警示'&&FL?'資料 '+dfmt(FL.asof)+'（官方）':''}</span></div><div class="chips">${XFDEF.filter(d=>d.g===g).map(d=>`<button data-xf="${d.id}" class="${XF===d.id?'on':''}" title="${d.title}">${d.name}<em>${ALL.filter(x=>d.t(x.code,x)).length}</em></button>`).join('')}</div>`).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{XF=XF===b.dataset.xf?'':b.dataset.xf;xfUI();render();});}
/* ===== 信用交易（融資／融券／借券賣出）與外資持股比率；籌碼摘要（連買連賣、5/20 日累計） ===== */
let CS=null,CR=null,CRp=null;
const sgn=(v,d=0)=>v==null?'—':(v>0?'+':'')+fmt(v,d);
function spark(vals,days,fmtv,cl){const pts=vals.map((v,i)=>[i,v]).filter(p=>p[1]!=null);if(pts.length<2)return '<small>資料不足</small>';
  const w=300,h=54,p=4,mn=Math.min(...pts.map(x=>x[1])),mx=Math.max(...pts.map(x=>x[1])),X=i=>p+i*(w-2*p)/(vals.length-1),Y=v=>p+(h-2*p)*(1-(v-mn)/(mx-mn||1));
  const path=pts.map((q,k)=>(k?'L':'M')+X(q[0]).toFixed(1)+','+Y(q[1]).toFixed(1)).join(''),l=pts.at(-1);
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none"><path d="${path}L${X(l[0])},${h-p}L${X(pts[0][0])},${h-p}Z" fill="${cl}" opacity=".12"/><path d="${path}" fill="none" stroke="${cl}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${pts.map(q=>`<circle cx="${X(q[0]).toFixed(1)}" cy="${Y(q[1]).toFixed(1)}" r="${q===l?3:1.6}" fill="${cl}"><title>${dfmt(days[q[0]])}　${fmtv(q[1])}</title></circle>`).join('')}</svg>
  <div class="sp-r"><small>${dfmt(days[pts[0][0]])}</small><small>低 ${fmtv(mn)} · 高 ${fmtv(mx)}</small><small>${dfmt(days[l[0]])}</small></div>`;}
const hl=(v,d)=>{const a=v.filter(x=>x!=null);return a.length?[fmt(Math.min(...a),d),fmt(Math.max(...a),d)]:['—','—'];};
function creditCard(s){
  const days=CR&&CR.days,rows=CR&&CR.data[s.code];
  if(!CR)return `<div class="rcard"><div class="rc-head"><h3>信用交易 · 融資・融券・借券賣出</h3><span>載入失敗</span></div><p class="rc-note">信用交易資料暫時無法取得。</p></div>`;
  if(!rows)return `<div class="rcard"><div class="rc-head"><h3>信用交易 · 融資・融券・借券賣出</h3><span>${dfmt(days.at(-1))}</span></div><p class="rc-note">官方資料未提供（此證券非融資融券標的，或證交所／櫃買中心當日未列入）。融資維持率官方未提供。</p></div>`;
  const L=rows.map((r,i)=>r&&r[0]!=null?i:-1).filter(i=>i>=0).at(-1),r=rows[L],cs=CS&&CS.items[s.code]&&CS.items[s.code].c;
  const bal=r[0],use=r[2]?bal/r[2]*100:null,sh=r[3],sbl=r[5];const bk=(k,c)=>rows[L-k]&&rows[L-k][c]!=null?rows[L-k][c]:null;
  const dl=(cur,old)=>cur==null||old==null?null:cur-old;const d1=dl(bal,r[1]),d5=dl(bal,bk(5,0)),d20=dl(bal,bk(20,0)),s1=dl(sh,r[4]),s5=dl(sh,bk(5,3)),b1=dl(sbl,r[6]),b5=dl(sbl,bk(5,5));
  const pc=(d,base)=>d==null||!base?'':` <small>${d>0?'+':''}${fmt(d/base*100,1)}%</small>`;
  const t=(lab,v,cls_,sub)=>`<div><small>${lab}</small><b class="${cls_||''}">${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
  const useS=rows.map(x=>x&&x[0]!=null&&x[2]?x[0]/x[2]*100:null);
  const detail=rows.map((x,i)=>({x,d:days[i]})).filter(q=>q.x&&q.x[0]!=null).reverse().map(({x,d})=>`<tr><td>${dfmt(d)}</td><td>${fmt(x[0],0)}</td><td class="${cls(dl(x[0],x[1]))}">${sgn(dl(x[0],x[1]))}</td><td>${x[2]?fmt(x[0]/x[2]*100,2)+'%':'—'}</td><td>${fmt(x[3],0)}</td><td class="${cls(dl(x[3],x[4]))}">${sgn(dl(x[3],x[4]))}</td><td>${x[5]==null?'—':fmt(x[5],0)}</td><td class="${cls(dl(x[5],x[6]))}">${sgn(dl(x[5],x[6]))}</td></tr>`).join('');
  const src=s.market==='上市'?[CR.sources.twseMargin,'證交所 MI_MARGN',CR.sources.twseSbl,'TWT93U']:[CR.sources.tpexMargin,'櫃買中心 融資融券餘額',CR.sources.tpexSbl,'融券借券賣出餘額'];
  return `<div class="rcard credit"><div class="rc-head"><h3>信用交易 · 融資・融券・借券賣出</h3><span>${dfmt(days[L])} · 近 ${days.length} 個交易日</span></div>
   <div class="m4">${t('融資餘額',fmt(bal,0)+' <em>張</em>')}${t('單日增減',sgn(d1),cls(d1))}${t('5 日增減',sgn(d5),cls(d5),d5!=null&&bk(5,0)?(d5>0?'+':'')+fmt(d5/bk(5,0)*100,1)+'%':'')}${t('20 日增減',sgn(d20),cls(d20),d20!=null&&bk(20,0)?(d20>0?'+':'')+fmt(d20/bk(20,0)*100,1)+'%':'')}</div>
   <div class="m4">${t('融資使用率',use==null?'—':fmt(use,2)+'%',use>=50?'up':'',r[2]?'限額 '+fmt(r[2],0)+' 張':'')}${t('融券餘額',fmt(sh,0)+' <em>張</em>',null,'單日 '+sgn(s1)+' · 5 日 '+sgn(s5))}${t('券資比',bal?fmt(sh/bal*100,2)+'%':'—',null,'融券 ÷ 融資')}${t('借券賣出餘額',sbl==null?'—':fmt(sbl,0)+' <em>張</em>',null,sbl==null?'':'單日 '+sgn(b1)+' · 5 日 '+sgn(b5))}</div>
   <div class="m4">${t('融資維持率','官方未提供',null,'證交所／櫃買中心不公布個股維持率')}</div>
   <div class="credhl"><div><b>融資餘額</b>近 ${days.length} 日 高 ${hl(rows.map(x=>x&&x[0]),0)[1]} ／ 低 ${hl(rows.map(x=>x&&x[0]),0)[0]} 張</div><div><b>融資使用率</b>高 ${hl(useS,2)[1]}% ／ 低 ${hl(useS,2)[0]}%</div><div><b>融券餘額</b>高 ${hl(rows.map(x=>x&&x[3]),0)[1]} ／ 低 ${hl(rows.map(x=>x&&x[3]),0)[0]} 張</div><div><b>借券賣出餘額</b>高 ${hl(rows.map(x=>x&&x[5]),0)[1]} ／ 低 ${hl(rows.map(x=>x&&x[5]),0)[0]} 張</div></div>
   <details class="covd"><summary>查看 ${rows.filter(x=>x&&x[0]!=null).length} 日逐日明細與來源</summary><div class="etfwrap"><table class="etft"><tr><th>日期</th><th>融資餘額</th><th>增減</th><th>使用率</th><th>融券餘額</th><th>增減</th><th>借券賣出</th><th>增減</th></tr>${detail}</table></div>
   <p class="rc-note">來源：<a href="${src[0]}" target="_blank" rel="noreferrer">${src[1]} ↗</a>、<a href="${src[2]}" target="_blank" rel="noreferrer">${src[3]} ↗</a>。單位：張（借券賣出由股換算）；使用率＝融資餘額 ÷ 融資限額；缺資料的日期留空，不當作零。</p></details>
   <p class="rc-note">融資使用率高、融券與借券賣出餘額大，只代表籌碼結構，不是買賣訊號。融資維持率為券商端資料，官方沒有公布，因此不顯示估算值。</p></div>`;
}
const stk=v=>!v?'—':v>0?`連買 ${v} 日`:`連賣 ${-v} 日`;
function instSum(s){const i=CS&&CS.items[s.code]&&CS.items[s.code].i,q=CS&&CS.items[s.code]&&CS.items[s.code].q;if(!i&&!q)return '';
  const cap=n=>Math.abs(n)>=i[9]&&i[9]>=20?'（≥20）':'';
  const row=(lab,k,a5,a20)=>`<tr><td>${lab}</td><td class="${cls(i[k])}"><b>${stk(i[k])}</b>${cap(i[k])}</td><td class="${cls(i[a5])}">${sgn(i[a5])}</td><td class="${cls(i[a20])}">${sgn(i[a20])}</td></tr>`;
  const tot=(k)=>i[k]+i[k+2]+i[k+4];
  return `<div class="instsum"><div class="etfwrap"><table class="etft"><tr><th>法人（張）</th><th>連買／連賣</th><th>5 日累計</th><th>20 日累計</th></tr>${i?row('外資',0,3,4)+row('投信',1,5,6)+row('自營商',2,7,8)+`<tr><td><b>三大合計</b></td><td>—</td><td class="${cls(i[3]+i[5]+i[7])}"><b>${sgn(i[3]+i[5]+i[7])}</b></td><td class="${cls(i[4]+i[6]+i[8])}"><b>${sgn(i[4]+i[6]+i[8])}</b></td></tr>`:''}</table></div>
   ${i?`<p class="rc-note">連買連賣＝含最新日連續買超（賣超）的交易日數，官方未列入的日期視為中斷；累計＝近 5／20 個已取得交易日的買賣超（張）合計，期間共 ${i[9]} 日。</p>`:''}
   <div class="qf"><span>外資持股比率</span>${q?`<b>${fmt(q[0],2)}%</b><small>${dfmt(q[3])} · 5 日 <i class="${cls(q[1])}">${q[1]==null?'—':sgn(q[1],2)+' pp'}</i> · 20 日 <i class="${cls(q[2])}">${q[2]==null?'—':sgn(q[2],2)+' pp'}</i></small>`:'<b>官方未提供</b>'}<small>${s.market==='上市'?'證交所 MI_QFIIS 外資及陸資持股比率':'櫃買中心 僑外資及陸資持股比例（OpenAPI 只提供最新日，歷史自本站開始累積）'}</small></div></div>`;}
let CT={code:null,n:60,sel:null},GS=0; // GS：疑似未還原事件日的列索引，均線不跨越
function dayStat(rows,j){
  const r=rows[j],c=r[4],pc=j>0?rows[j-1][4]:null;
  const avg=(k,f)=>j+1>=k&&j+1-k>=GS?rows.slice(j+1-k,j+1).reduce((a,x)=>a+f(x),0)/k:null;
  const v20=avg(20,x=>x[5]||0);
  return {j,last:j===rows.length-1,date:r[0],o:r[1],h:r[2],l:r[3],c,chg:pc==null?null:c-pc,pct:pc?(c-pc)/pc*100:null,vol:r[5],vr:v20?r[5]/v20:null,ma5:avg(5,x=>x[4]),ma20:avg(20,x=>x[4]),ma60:avg(60,x=>x[4])};
}
const CW=760,CH0=260,CVH=60,CP=36;
function chart(rows,n){
  const R=rows.slice(-n),w=CW,h=CH0,vh=CVH,p=CP,off=rows.length-R.length;const cl=rows.map(r=>r[4]);
  const ma=k=>R.map((_,i)=>{const j=off+i;return j+1>=k&&j+1-k>=GS?cl.slice(j+1-k,j+1).reduce((a,b)=>a+b)/k:null;});
  const lines=[['#4871db',R.map(r=>r[4])],['#f0a020',ma(5)],['#d4483b',ma(20)],['#2c9a6f',ma(60)]];
  const vals=lines.flatMap(l=>l[1]).filter(v=>v!=null);const mn=Math.min(...vals),mx=Math.max(...vals);
  const X=i=>p+i*(w-p*2)/(R.length-1||1),Y=v=>10+(h-20)*(1-(v-mn)/(mx-mn||1));const vm=Math.max(...R.map(r=>r[5]||0));
  const path=a=>a.map((v,i)=>v==null?'':`${a.slice(0,i).some(x=>x!=null)?'L':'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const grid=[0,.25,.5,.75,1].map(t=>{const v=mn+(mx-mn)*t;return `<line x1="${p}" x2="${w-p}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eef1f6"/><text x="${w-p+4}" y="${Y(v)+4}" font-size="10" fill="#98a2b3">${fmt(v)}</text>`}).join('');
  const bw=Math.max(1.5,Math.min(6,(w-p*2)/R.length*.62));
  const bars=R.map((r,i)=>{const pc=off+i>0?rows[off+i-1][4]:r[4];return `<rect x="${X(i)-bw/2}" width="${bw}" y="${h+vh-(r[5]/vm)*vh}" height="${(r[5]/vm)*vh}" fill="${r[4]>=pc?'#f2b8b2':'#a9dcc6'}"/>`}).join('');
  const sv={w,h,vh,p,off,n:R.length};
  return {sv,X,Y,svg:`<svg id="ctsvg" viewBox="0 0 ${w} ${h+vh+20}" width="100%" tabindex="0" role="img" aria-label="價格走勢圖，可用滑鼠、點選、左右滑動或左右方向鍵查看每日數據">${grid}<path d="${path(R.map(r=>r[4]))}L${X(R.length-1)},${h}L${X(0)},${h}Z" fill="#edf2ff" opacity=".6"/>${lines.map(([c,a],k)=>`<path d="${path(a)}" fill="none" stroke="${c}" stroke-width="${k?1.2:2}" ${k?'stroke-dasharray="4 2"':''}/>`).join('')}${bars}
  <text x="${p}" y="${h+vh+16}" font-size="10" fill="#98a2b3">${dfmt(R[0][0])}</text><text x="${w-p}" y="${h+vh+16}" font-size="10" fill="#98a2b3" text-anchor="end">${dfmt(R.at(-1)[0])}</text>
  <g id="ctcur" style="display:none;pointer-events:none"><line id="ctl" y1="4" y2="${h+vh}" stroke="#5f6f8c" stroke-width="1" stroke-dasharray="3 2"/><circle id="ctd5" r="3" fill="#f0a020" stroke="#fff" stroke-width="1"/><circle id="ctd20" r="3" fill="#d4483b" stroke="#fff" stroke-width="1"/><circle id="ctd60" r="3" fill="#2c9a6f" stroke="#fff" stroke-width="1"/><circle id="ctdc" r="5" stroke="#fff" stroke-width="2"/></g></svg>`};
}
function chartNotes(H){   // 走勢圖卡片底部的小字備註：有除權還原／價格異常／資料不足時才出現，沒有內容回傳空字串
  const g=H.gaps,adj=H.adjusted||[],n=H.rows.length,ev=g?g.ev:[],sus=ev.filter(e=>e.kind!=='ex'),exs=ev.filter(e=>e.kind==='ex'),N=[];
  if(adj.length)N.push(`<div class="cnote">⚙ <b>已除權還原</b>：${adj.map(a=>`${dfmt(a.date)} 除權（前收 ${fmt(a.prevClose)} → 參考價 ${fmt(a.refPrice)}，還原因子 ${fmt(a.factor,4)}，來源${a.src}）`).join('；')}。除權日以前的價格已乘以還原因子、成交量除以還原因子，均線、量比與支撐壓力皆用還原價，與當時實際成交價不同。</div>`);
  sus.forEach(e=>N.push(`<div class="cnote bad">⚠ <b>${dfmt(e.d)}</b> 單日 ${e.pct>0?'+':''}${fmt(e.pct,1)}%（${fmt(e.prev)} → ${fmt(e.c)}）：${e.kind==='unk'?'官方除權息資料當日取不到，無法確認；':'證交所／櫃買官方除權息資料查無該日的除權息參考價（或收盤偏離參考價逾 10.5%）；'}${e.big?'<b>疑似分割／減資／面額變更／未還原</b>':'超過 ±10% 漲跌幅限制，<b>疑似未還原或特殊事件</b>'}。</div>`));
  if(exs.length)N.push(`<div class="cnote">ℹ ${exs.map(e=>`<b>${dfmt(e.d)}</b> 單日 ${fmt(e.pct,1)}%`).join('、')}：為官方除權息日（參考價 ${exs.map(e=>fmt(e.ref)).join('、')}），已含除息缺口，不視為異常；價格未做還原（還原僅限參考價／前收 ≤ 0.9 的重大除權）。</div>`);
  if(g&&g.suspect){const m=H.ma60;N.push(`<div class="cnote${m==null?' bad':''}"><b>均線與 60 日高：</b>疑似事件日 ${dfmt(g.since)} 起共 ${g.nAfter} 日資料，MA5／MA20／MA60 與 60 日高只用事件日（含）之後的價格計算，不跨越跳空。${m==null?`MA60 需 60 日，事件後僅 ${g.nAfter} 日 → <b>資料不足，已隱藏 MA60</b>。`:`MA60（事件後 60 日）＝${fmt(m)}。`} 60 日高（事件後）＝${fmt(g.hi60)}${g.hi60raw!==g.hi60?`；不排除事件前資料則為 ${fmt(g.hi60raw)}（含未還原價格，不採用）`:''}。支撐與壓力價位帶仍由完整歷史推算、可能跨越事件日，僅供參考。</div>`);}
  else if(n<60)N.push(`<div class="cnote"><b>資料不足：</b>目前僅 ${n} 個交易日的歷史資料，MA60 需至少 60 日，<b>已隱藏 MA60</b>${n<20?'（MA20 亦不足）':''}；新上市或剛納入歷史涵蓋的標的會隨每日累積自動補齊。</div>`);
  if(!N.length)return '';
  return `<div class="cnotes">${N.join('')}${sus.length||exs.length?'<div class="cnote-s">偵測規則：相鄰兩日收盤變動超過 11%（漲跌幅限制為 ±10%），與證交所 TWT49U／櫃買 exDailyQ 的除權息計算結果比對；標示「疑似」不代表確定，也不是買賣建議。</div>':''}</div>`;}
function chartTop(H){
  const rows=H.rows;GS=H.gaps&&H.gaps.suspect?Math.max(0,rows.findIndex(r=>r[0]===H.gaps.since)):0;if(CT.code!==H.code)CT={code:H.code,n:Math.min(60,rows.length),sel:null};
  CT.n=Math.min(CT.n,rows.length);if(CT.sel!=null&&CT.sel<rows.length-CT.n)CT.sel=null;
  const c=chart(rows,CT.n);window._CC={c,rows};
  const rb=rows.length>60?`<span class="rng"><button data-n="60" class="${CT.n===60?'on':''}">近 60 日</button><button data-n="${rows.length}" class="${CT.n===rows.length?'on':''}">全部 ${rows.length} 日</button></span>`:'';
  return `<div class="charttitle"><b>價格走勢<small>近 ${CT.n} 個交易日（共 ${rows.length} 日）</small></b><span class="rngwrap">${rb}<span>日線收盤 · 均線 · 成交量</span></span></div>
  <div class="chartbox" id="chartbox">${c.svg}<div class="cttip" id="cttip" style="display:none"></div></div>
  <div class="ctnote">電腦：滑鼠移到圖上看每日數據、點一下固定；手機：點選或左右滑動；鍵盤可用左右鍵。</div>
  <div class="ma" id="ctma">${maRow(dayStat(rows,CT.sel!=null?CT.sel:rows.length-1),CT.sel!=null)}</div>`;
}
function maRow(st,pinned){
  const head=pinned?`<b>${dfmt(st.date)}</b> <button class="ctback" id="ctback">回到最新</button>`:st.last?'最新':`${dfmt(st.date)}（預覽）`;
  return `<span class="mad">${head}</span><span><i style="background:#f0a020"></i>MA5 <b>${fmt(st.ma5)}</b></span><span><i style="background:#d4483b"></i>MA20 <b>${fmt(st.ma20)}</b></span><span><i style="background:#2c9a6f"></i>MA60 <b>${st.ma60==null?'資料不足':fmt(st.ma60)}</b></span><span>量比 <b>${st.vr==null?'—':fmt(st.vr)+' 倍'}</b></span>`;
}
function tipHtml(st){
  const k=cls(st.chg),ch=st.chg==null?'—':`${sg(st.chg)}${fmt(st.chg)}（${sg(st.pct)}${fmt(st.pct)}%）`;
  return `<div class="tt-d">${dfmt(st.date)}${st.last?' · 最新':''}</div><div class="tt-g"><span>開</span><b>${fmt(st.o)}</b><span>高</span><b>${fmt(st.h)}</b><span>低</span><b>${fmt(st.l)}</b><span>收</span><b class="${k}">${fmt(st.c)}</b></div>
  <div class="tt-r"><span>漲跌</span><b class="${k}">${ch}</b></div><div class="tt-r"><span>成交量</span><b>${fmt(st.vol/1000,0)} 張</b></div><div class="tt-r"><span>量比</span><b>${st.vr==null?'—':fmt(st.vr)+' 倍'}</b></div>
  <div class="tt-r"><span class="m5">MA5</span><b>${fmt(st.ma5)}</b></div><div class="tt-r"><span class="m20">MA20</span><b>${fmt(st.ma20)}</b></div><div class="tt-r"><span class="m60">MA60</span><b>${st.ma60==null?'資料不足':fmt(st.ma60)}</b></div>`;
}
function bindChart(){
  const top=$('#ctop'),svg=$('#ctsvg');if(!top||!svg||!window._CC)return;
  const {c,rows}=window._CC,sv=c.sv,box=$('#chartbox'),tip=$('#cttip'),cur=$('#ctcur'),mab=$('#ctma');
  top.querySelectorAll('.rng button').forEach(b=>b.onclick=()=>{CT.n=+b.dataset.n;top.innerHTML=chartTop(window._H);bindChart();});
  const clear=()=>{CT.sel=null;cur.style.display='none';tip.style.display='none';setMa(dayStat(rows,rows.length-1),false);};
  const setMa=(st,pin)=>{mab.innerHTML=maRow(st,pin);const bk=$('#ctback');if(bk)bk.onclick=clear;};
  const show=(i,pin)=>{
    i=Math.max(0,Math.min(sv.n-1,i));const st=dayStat(rows,sv.off+i),x=c.X(i);
    cur.style.display='';$('#ctl').setAttribute('x1',x);$('#ctl').setAttribute('x2',x);
    const dot=(id,v)=>{const e=$(id);if(v==null)e.style.display='none';else{e.style.display='';e.setAttribute('cx',x);e.setAttribute('cy',c.Y(v));}};
    dot('#ctd5',st.ma5);dot('#ctd20',st.ma20);dot('#ctd60',st.ma60);dot('#ctdc',st.c);
    $('#ctdc').setAttribute('fill',st.chg>0?'#e0392d':st.chg<0?'#1a9a5a':'#6b778c');
    tip.innerHTML=tipHtml(st);tip.style.display='block';
    const bw=box.clientWidth,tw=tip.offsetWidth,px=x/sv.w*bw;let left=px+12;if(left+tw>bw-4)left=px-tw-12;tip.style.left=Math.max(2,left)+'px';
    setMa(st,pin);return i;
  };
  const idxOf=e=>{const r=svg.getBoundingClientRect(),vx=(e.clientX-r.left)/r.width*sv.w;return Math.round((vx-sv.p)/((sv.w-sv.p*2)/(sv.n-1||1)));};
  const pinned=()=>CT.sel!=null;
  const pin=i=>{i=show(i,true);CT.sel=sv.off+i;};
  svg.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){if(e.buttons)pin(idxOf(e));else show(idxOf(e),false);}else if(e.buttons)pin(idxOf(e));});
  svg.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')pin(idxOf(e));});
  svg.addEventListener('click',e=>pin(idxOf(e)));
  svg.addEventListener('pointerleave',e=>{if(e.pointerType!=='mouse')return;if(pinned())show(CT.sel-sv.off,true);else clear();});
  svg.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const cu=pinned()?CT.sel-sv.off:sv.n-1;pin(cu+(e.key==='ArrowLeft'?-1:1));}else if(e.key==='Escape')clear();});
  if(pinned())show(CT.sel-sv.off,true);
}
const band=b=>b.low!==b.high?`<em>價格帶 ${fmt(b.low)}–${fmt(b.high)}</em>`:'';
const tags=b=>`<div class="tags">${b.basis.map(x=>`<i>${x}</i>`).join('')}</div>`;
const lastTouch=(b,H)=>{if(!H)return null;for(let i=H.rows.length-1;i>=0;i--){const r=H.rows[i];if(r[2]>=b.low&&r[3]<=b.high)return r[0];}return null;};
function bandState(b,kind,close){ // 距離統一以「帶邊緣」為基準：支撐＝帶上緣、壓力＝帶下緣
  if(kind==='s'){if(close>b.high)return {k:'above',t:`收盤在帶上方 ${fmt((close/b.high-1)*100,1)}%`,sub:'距帶上緣',cls:'ok'};if(close>=b.low)return {k:'in',t:'收盤在帶內',sub:'正在測試支撐帶',cls:'warn'};return {k:'broke',t:`已跌破 ${fmt((1-close/b.low)*100,1)}%`,sub:'距帶下緣，支撐轉弱',cls:'bad'};}
  if(close<b.low)return {k:'below',t:`收盤在帶下方 ${fmt((b.low/close-1)*100,1)}%`,sub:'距帶下緣',cls:'ok'};if(close<=b.high)return {k:'in',t:'收盤在帶內',sub:'正在測試壓力帶',cls:'warn'};return {k:'broke',t:`已突破 ${fmt((close/b.high-1)*100,1)}%`,sub:'距帶上緣，原壓力轉觀察支撐',cls:'bad'};}
const lrow=(lab,b,kind,close,H)=>{const st=bandState(b,kind,close),lt=lastTouch(b,H);
 return `<div class="lvrow"><div><span>${lab}</span>${tags(b)}<div class="strn ${b.n>1?'multi':'single'}">${b.n>1?`多重結構（${b.n} 個結構重疊）`:'單一結構（僅 1 個，強度較弱）'}</div></div>
 <div><strong>${fmt(b.price)}</strong>${band(b)}<em class="bst ${st.cls}">${st.t}</em><em>${st.sub}</em><em>最近觸及 ${lt?dfmt(lt):'近 120 日未觸及'}</em><em>最近結構日 ${dfmt(b.last)}</em></div></div>`;};
const NA=(st)=>`<strong class="na">${st||'尚未形成'}</strong><p>${st==='資料不足'?'來源資料不足以計算。':'目前價格結構還沒有出現對應價位，不以公式推算補值。'}</p>`;
function lvcards(L,cf,close,H){const S=L.support,R=L.resistance,st=L.status;
 const sup=`<div class="level support"><small>◇ 支撐觀察</small>${S.length?S.map((b,i)=>lrow(i?`第二支撐｜${b.tier}`:`${b.tier}支撐`,b,'s',close,H)).join(''):NA(st)}<p>現價之下最接近的真實結構價位；跌破後結構轉弱；距離以支撐帶上緣為基準、壓力帶以下緣為基準（收盤落在帶內時標示「在帶內」）。</p></div>`;
 const r1=R[0],r2=R[1];const newHigh=!r1&&H&&close>=Math.max(...H.rows.map(r=>r[2]));
 const c1=`<div class="level resist"><small>⚡ ${cf?'關鍵突破／壓力共振區':'第一壓力'}</small>${r1?lrow(cf?'關鍵突破／壓力共振區':'第一壓力',r1,'r',close,H)+`<p>${cf?'此處同時是突破觀察位與壓力共振區，站上與否是觀察點，不是追價目標。':'現價上方最近、已確認的有效壓力結構；站上與否是觀察點，不是追價目標。'}</p>`:newHigh&&L.limits?`<strong class="na">${fmt(L.limits.up)}</strong><p>創新高，上方無歷史結構；顯示明日漲停參考價（漲跌幅限制，非結構價位）。</p>`:NA(st)}</div>`;
 const c2=`<div class="level resist"><small>🔥 第二壓力</small>${r2?lrow(r2.tier,r2,'r',close,H)+`<p>${r2.tier==='中期壓力'?'第一壓力帶之上、下一個獨立的結構已超過 +10%，保留顯示並改標為中期壓力。':'第一壓力帶之上、下一個獨立的壓力結構。'}</p>`:NA(st)}</div>`;
 return `<div class="levels l3">${sup}${c1}${c2}</div>`;}
/* ===== 進場觀察區／停損參考／風險報酬比（可切換規則；觀察價位，非買賣建議） ===== */
let RRS={stop:1,tgt:'r1low',ent:'close'};
const tickOf=p=>p<10?0.01:p<50?0.05:p<100?0.1:p<500?0.5:p<1000?1:5;
const rtk=(p,dir)=>{const t=tickOf(p),q=p/t;return +((dir<0?Math.floor(q+1e-9):dir>0?Math.ceil(q-1e-9):Math.round(q))*t).toFixed(2);};
const RR_STOP=[[1,'帶下緣再 −1%（預設）'],[2,'帶下緣再 −2%'],[0,'帶下緣（不再下移）'],['ma20','MA20 再 −1%']];
const RR_TGT=[['r1low','第一壓力下緣（預設）'],['r1high','第一壓力上緣'],['r2low','第二壓力下緣']];
const RR_ENT=[['close','收盤價（預設）'],['shigh','支撐帶上緣'],['smid','支撐帶中點']];
function rrCalc(H,L,close){
  const s1=L.support&&L.support[0],r1=L.resistance&&L.resistance[0],r2=L.resistance&&L.resistance[1];
  if(!s1)return {err:'尚無支撐帶（價格結構未形成，或資料不足），無法計算進場觀察區與停損參考。'};
  const ma20=H.rows.length>=20?H.rows.slice(-20).reduce((a,r)=>a+r[4],0)/20:null;
  let stop=RRS.stop==='ma20'?(ma20?rtk(ma20*0.99,-1):null):rtk(s1.low*(1-(+RRS.stop)/100),-1);
  const tg={r1low:r1&&r1.low,r1high:r1&&r1.high,r2low:r2&&r2.low}[RRS.tgt];
  const ent={close:close,shigh:s1.high,smid:(s1.low+s1.high)/2}[RRS.ent];
  if(stop==null)return {err:'資料不足以計算 MA20。'};
  const o={s1,r1,stop,tg,ent:RRS.ent==='smid'?rtk(ent,0):ent};
  o.risk=(o.ent-stop)/o.ent*100;o.rew=tg?(tg-o.ent)/o.ent*100:null;o.rr=tg&&o.risk>0?o.rew/o.risk:null;
  o.state=close<stop?'bad':close<s1.low?'warn':'';return o;}
function rrHtml(H,L,close){
  const o=rrCalc(H,L,close),sw=(arr,key)=>arr.map(([v,l])=>`<button data-rr="${key}" data-v="${v}" class="${String(RRS[key])===String(v)?'on':''}">${l}</button>`).join('');
  const ctl=`<div class="rrctl"><div><small>停損規則</small><div class="tabs">${sw(RR_STOP,'stop')}</div></div><div><small>目標規則</small><div class="tabs">${sw(RR_TGT,'tgt')}</div></div><div><small>進場價基準</small><div class="tabs">${sw(RR_ENT,'ent')}</div></div></div>`;
  let body;
  if(o.err)body=`<p class="rc-note">${o.err}</p>`;
  else{const {s1,r1,stop,tg,ent}=o;const st=bandState(s1,'s',close);
   const rrTxt=o.rr==null?'—':`1 : ${fmt(o.rr,2)}`;
   body=`<div class="m4 rrout"><div><small>進場觀察區（第一支撐帶）</small><b>${fmt(s1.low)}${s1.low!==s1.high?'–'+fmt(s1.high):''}</b><small>${st.t}</small></div><div><small>停損參考價</small><b class="down">${fmt(stop)}</b><small>風險 ${fmt(o.risk,1)}%（自進場價 ${fmt(ent)}）</small></div><div><small>目標參考價</small><b class="up">${tg?fmt(tg):'—'}</b><small>${tg?'報酬 +'+fmt(o.rew,1)+'%':'上方尚無壓力結構'}</small></div><div><small>風險報酬比</small><b class="${o.rr==null?'':o.rr>=2?'up':o.rr<1?'down':''}">${rrTxt}</b><small>${o.rr==null?'':o.rr>=2?'報酬 ≥ 2 倍風險':o.rr<1?'報酬小於風險':'報酬 1–2 倍風險'}</small></div></div>
   ${o.state==='bad'?`<p class="rc-note rr-bad">收盤 ${fmt(close)} 已低於停損參考價 ${fmt(stop)}：支撐結構已被跌破，這組數字僅供回顧，不代表仍適合進場。</p>`:o.state==='warn'?`<p class="rc-note rr-warn">收盤 ${fmt(close)} 已跌到支撐帶之下但未達停損參考價，結構轉弱。</p>`:''}
   ${tg&&ent>=tg?`<p class="rc-note rr-warn">進場價已達或超過目標參考價，上方空間不足。</p>`:''}`;}
  return `<div class="rcard rrcard"><div class="rc-head"><h3>進場觀察區 · 停損參考 · 風險報酬比</h3><span>觀察價位，非買賣建議</span></div>${ctl}${body}
   <p class="rc-note">計算規則：進場觀察區＝第一支撐帶（低–高）；停損參考＝帶下緣再下移所選百分比（依升降單位向下取整）；目標＝所選壓力帶邊緣；風險＝(進場價−停損)÷進場價，報酬＝(目標−進場價)÷進場價，風險報酬比＝報酬÷風險。以上價位皆由本站依歷史價格結構（見上方支撐壓力）自行推算，<b>是觀察價位，不是買賣建議</b>，也不保證守住或到達。</p></div>`;}
function bindRR(){const b=$('#rrbox');if(!b||!window._H)return;b.querySelectorAll('button[data-rr]').forEach(x=>x.onclick=()=>{const k=x.dataset.rr;RRS[k]=k==='stop'&&x.dataset.v!=='ma20'?+x.dataset.v:x.dataset.v;const s=selS();b.innerHTML=rrHtml(window._H,window._H.levels,s.close);bindRR();});}
function confluence(H,L){const r1=L.resistance[0];if(!r1)return false;const hi=Math.max(...H.rows.slice(-10,-1).map(r=>r[2]));return Math.abs(hi/r1.price-1)<=0.01||(hi>=r1.low&&hi<=r1.high);}
async function pick(code){
  if(code!==sel)etfOpen=false;
  sel=code;location.hash=code;render();const s=ALL.find(x=>x.code===code);if(!s)return;
  let H=null;if(s.hasHistory){try{H=await fetch(`data/history/${code}.json`).then(r=>r.ok?r.json():null)}catch(e){}}window._H=H;
  const src=`<b>${s.src}</b>`;const inst=s.market==='上市'?(INST.data[code]||[]):null;
  const L=H&&H.levels,close=s.close;
  let html=`<div class="eyebrow">STOCK INSIGHT <span>${s.market}${s.etf?' · ETF':''} · ${code}</span></div>${grp('一眼結論','今天發生什麼事、有沒有要避開的警示')}
  <div class="titleprice"><div><h2>${s.name} <button class="star" style="font-size:18px;color:${W().includes(code)?'#f0a020':'#b8c1cf'}" onclick="toggle('${code}');pick('${code}')">${W().includes(code)?'★':'☆'}</button></h2><p>資料日期 ${dfmt(s.date)}${META&&s.date!==(s.market==='上市'?META.twseDate:META.tpexDate)?'<span class="stalechip">此股資料日早於市場最新日</span>':''} · 來源：${s.src}</p></div>
  <div><strong>${fmt(close)}</strong><span class="${cls(s.change)}">${sg(s.change)}${fmt(s.change)} (${sg(s.change)}${fmt(s.change/(close-s.change)*100)}%)</span></div></div>
  <div class="metrics"><span>開盤<b>${fmt(s.open)}</b></span><span>最高<b>${fmt(s.high)}</b></span><span>最低<b>${fmt(s.low)}</b></span><span>成交量<b>${fmt(s.volume/1000,0)} 張</b></span><span>成交金額<b>${fmt(s.value/1e8)} 億</b></span></div>
  <div class="srcline">收盤行情 · 資料日期 ${dfmt(s.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY_ALL':'tpex_mainboard_daily_close_quotes'}）</div><div id="sl-verdict"></div>${flagCard(s)}${evCard(s.code)}${newsCard(s)}${grp('走勢圖','日線收盤、均線、成交量')}`;
  if(H){html+=`<div class="chartpanel"><div id="ctop">${chartTop(H)}</div>
  ${chartNotes(H)}<div class="srcline">走勢 · 資料日期 ${dfmt(H.rows[0][0])}–${dfmt(H.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY 個股日成交資訊':'tradingStock 個股日成交資訊'}）</div></div>
  ${grp('價位怎麼看','支撐、壓力與位階在哪（觀察價位，非買賣建議）· 依 '+dfmt(H.date)+' 收盤')}`;
  if(L){const cf=confluence(H,L);html+=posTrack(s,L)+lvcards(L,cf,close,H)+`<div id="rrbox">${L.support&&L.support.length?rrHtml(H,L,close):''}</div>`+`<p class="note2 disclaimer">支撐與壓力為本站依歷史價格結構自行計算的觀察價位，可能與其他網站不同，不是目標價或買賣建議。</p>`+(L.limits?`<p class="note2">漲跌停參考（依漲跌幅限制，非結構價位）：明日漲停 ${fmt(L.limits.up)} · 跌停 ${fmt(L.limits.down)}</p>`:'');}
  const P=H.patterns;if(P&&(P.trend||P.box)){const t=P.trend,b=P.box;html+=`<div class="rcard patt"><div class="rc-head"><h3>形態偵測<small>（觀察用）</small></h3><span>依 ${dfmt(H.date)} 收盤</span></div>
   ${t?`<div class="sector-line"><span>📈 上升趨勢線（近期低點墊高）</span><b class="${t.state==='守住'?'up':'down'}">${t.state}</b><strong>線約 ${fmt(t.lineToday)}</strong></div><p class="rc-note">近 ${t.sinceDays} 日內最近 3 個波段低點 ${t.points.map(p=>dfmt(p[0]).slice(5)+' '+fmt(p[1])).join(' → ')}，趨勢線每日約 ${t.slopePct>0?'+':''}${fmt(t.slopePct)}%；收盤距趨勢線 ${t.dist>0?'+':''}${fmt(t.dist,1)}%。</p>`:''}
   ${b?`<div class="sector-line"><span>▭ 整理平台（前 ${b.days} 日區間窄）</span><b>${b.state}</b><strong>${fmt(b.low)}–${fmt(b.high)}</strong></div><p class="rc-note">不含今日的前 ${b.days} 個交易日最高 ${fmt(b.high)}、最低 ${fmt(b.low)}，區間寬度 ${fmt(b.width,1)}%。</p>`:''}
   <p class="rc-note sep">形態為依歷史價量自動偵測的觀察標示，不是買賣訊號，也不預測突破方向；偵測規則見下方「計算方法與資料說明」。</p></div>`;}
  html+=riskHtml(code,H);
  }else html+=`<div class="card"><h3>價格走勢 / 支撐壓力<span>尚無歷史</span></h3><p class="note2">此股票目前不在每日歷史抓取範圍（主要成交金額前段＋預設清單），因此暫無走勢、均線與支撐壓力（資料不足）。系統每日累積收盤快照，資料足夠後會自動顯示。</p></div>`+grp('價位怎麼看','支撐、壓力與位階在哪（觀察價位，非買賣建議）')+riskHtml(code,null);
  html+=grp('籌碼與資金','法人、融資券與 ETF 是在買還是在賣')+`<div id="sl-chips"><div class="empty">正在彙整法人與融資資料…</div></div>${s.etf?'<div id="etfpage"><div class="empty">正在載入 ETF 持股明細…</div></div>':''}<div id="sl-etf"></div>`+grp('基本面與產業','估值、營收與所屬產業的資金熱度')+`<div id="sl-fund"></div>`+grp('當沖輔助與資料說明','短線流動性、計算方法與資料來源')+`${dtCard(s)}<div id="sl-dt"></div><div id="sl-meth"></div>`;
  $('#detail').innerHTML=html;bindRR();
  const [C,E]=await Promise.all([CH||(CH=fetch('data/chips.json').then(r=>r.json())),EF||(EF=fetch('data/etf.json').then(r=>r.json())),FDp||(FDp=fetch('data/fund.json').then(r=>r.json()).then(v=>FD=v).catch(()=>null)),RVp||(RVp=fetch('data/rev.json').then(r=>r.json()).then(v=>RV=v).catch(()=>null)),CRp||(CRp=fetch('data/credit.json').then(r=>r.json()).then(v=>CR=v).catch(()=>null)),p2load()]);
  if(sel!==code)return;CH_=C;if(s.etf){const p=$('#etfpage');if(p)p.innerHTML=fundOf(E,code)?etfPage(s,E):`<div class="rcard"><div class="rc-head"><h3>持股明細</h3><span>尚未接入</span></div><p class="rc-note">此 ETF 尚未接入官方持股揭露（見下方「資料涵蓋範圍」），暫無持股明細；不推定內容。</p></div>`;}
  fillResearch(s,H,C,E);bindResearch();
}
let CH=null,CH_=null,EF=null,FDp=null,RVp=null,etfTab='全部';
const IND={"01":"水泥工業","02":"食品工業","03":"塑膠工業","04":"紡織纖維","05":"電機機械","06":"電器電纜","07":"化學生技醫療","08":"玻璃陶瓷","09":"造紙工業","10":"鋼鐵工業","11":"橡膠工業","12":"汽車工業","14":"建材營造","15":"航運業","16":"觀光餐旅","17":"金融保險","18":"貿易百貨","19":"綜合","20":"其他","21":"化學工業","22":"生技醫療","23":"油電燃氣","24":"半導體業","25":"電腦及週邊設備","26":"光電業","27":"通信網路業","28":"電子零組件業","29":"電子通路業","30":"資訊服務業","31":"其他電子業","32":"文化創意業","33":"農業科技業","34":"電子商務","35":"綠能環保","36":"數位雲端","37":"運動休閒","38":"居家生活"};
function vr20(rows){const v=rows.map(r=>r[5]||0);if(v.length<20)return '—';const a=v.slice(-20).reduce((x,y)=>x+y)/20;return a?fmt(v.at(-1)/a)+' 倍':'—';}
const z=v=>v==null?'—':(v>0?'+':'')+fmt(v,1);
const grp=(t,sub)=>`<div class="sectionlabel"><h3>${t}</h3><span>${sub}</span></div>`;
function posTrack(s,L){const s1=L&&L.support[0],r1=L&&L.resistance[0],close=s.close;if(!s1||!r1||r1.price<=s1.price)return '';
  const pos=(close-s1.price)/(r1.price-s1.price)*100;
  return `<div class="rcard postrack"><div class="rc-head"><h3>收盤在支撐與壓力之間的位置</h3><span>第一支撐 → 第一壓力</span></div><div class="track"><i style="left:${Math.max(0,Math.min(100,pos))}%"></i></div>
   <div class="pos3"><div><small>第一支撐</small><strong class="down">${fmt(s1.price)}</strong><em>價格帶 ${fmt(s1.low)}–${fmt(s1.high)}</em></div><div><small>收盤價</small><strong>${fmt(close)}</strong><em>位於區間 ${fmt(pos,1)}%</em></div><div><small>第一壓力</small><strong class="up">${fmt(r1.price)}</strong><em>價格帶 ${fmt(r1.low)}–${fmt(r1.high)}</em></div></div></div>`;}
function fillResearch(s,H,C,E){const P=research(s,H,C,E),set=(id,h)=>{const e=$('#'+id);if(e)e.innerHTML=h;};
  set('sl-verdict',P.verdict);set('sl-chips',P.inst+P.credit+tdccCard(s));set('sl-dt',dyCard(s));set('sl-etf',P.etfh+P.etfc);set('sl-fund',P.fund);set('sl-meth',P.method);}
function research(s,H,C,E){
  const close=s.close;let o='';const P={};
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
  o+=`<div class="rcard verdict"><div class="rc-head"><h3>綜合判讀</h3><span>${dfmt(s.date)} 收盤</span></div><h4>${indName||(s.etf?'ETF':'產業資料待確認')}${rk?` · 同日成交金額第 ${rk} 名`:''}</h4><p>個股成交 ${fmt(s.value/1e8)} 億元。${D.length?`近 ${D.length} 日法人買超 ${buy} 日，合計 ${z(sum)} 張。`:'官方資料未提供此股票的法人買賣超。'}</p><ul class="vl">${vline}${fline}</ul>${verdictRows(s,H,C,E)}</div>`;
  P.verdict=o;o='';
  o+=fundHtml(s,H)+valCard(s)+finCard(s)+divCard(s);
  o+=`<div class="rcard"><div class="rc-head"><h3>產業熱度</h3><span>依官方產業分類</span></div>${indName?`<div class="sector-line"><span>${indName}</span><b>第 ${rk} / ${ranks.length}</b><strong>${fmt(agg[s.ind].v/1e8)} 億</strong></div>
   <p class="rc-note">${dfmt(s.date)} 同日已取得行情，分類內 ${agg[s.ind].n} 檔。排名依${s.market}成交金額，不代表資金淨流入。來源：${s.market==='上市'?'證交所 t187ap03_L':'櫃買中心 mopsfin_t187ap03_O'}（產業別）＋ 每日收盤行情。</p>`:`<p class="rc-note">官方資料未提供此證券的產業別（ETF 等不列入公司基本資料）。</p>`}
   ${themeCard(s.code)||'<p class="rc-note sep">此股票未歸入站內題材清單（題材為站內人工整理，非官方分類）。</p>'}</div>`;
  P.fund=o;o='';
  // 位置（已與上方支撐壓力合併，這裡只保留變數）
  // 法人 20 日
  const mx=Math.max(1,...D.map(r=>Math.abs(tot(r))));const srcI=s.market==='上市'?C.sources.instTwse:C.sources.instTpex;
  o+=`<div class="rcard"><div class="rc-head"><h3>三大法人 · 近 20 日</h3><span>單位：張</span></div>`;
  if(D.length&&C.inst[s.code]){o+=`<div class="inst-sum"><div><h4>${buy>sell?'買超日較多':sell>buy?'賣超日較多':'買賣交錯'}</h4><small>買超 ${buy} / 已取得 ${D.length} 日</small></div><div class="r"><strong class="${cls(sum)}">${z(sum)}</strong><small>已取得日合計</small></div></div>
   <div class="ibars">${D.map(r=>{const v=tot(r),h=Math.abs(v)/mx*50;return `<i title="${r.d} ${z(v)} 張" class="${v>=0?'pos':'neg'}" style="height:${h}px;${v>=0?`margin-bottom:50px`:`margin-top:50px`}"></i>`}).join('')}</div>
   <div class="ma"><small>${dfmt(D[0].d)}</small><small>${dfmt(D.at(-1).d)}</small></div>
   <div class="cat3"><div><small>外資（含外資自營商）</small><b class="${cls(cat(0))}">${z(cat(0))}</b></div><div><small>投信</small><b class="${cls(cat(1))}">${z(cat(1))}</b></div><div><small>自營商</small><b class="${cls(cat(2))}">${z(cat(2))}</b></div></div>
   ${instSum(s)}
   <details><summary>查看逐日明細與來源</summary><table><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th></tr>${D.slice().reverse().map(r=>`<tr><td>${dfmt(r.d)}</td>${r.x?[0,1,2].map(i=>`<td class="${cls(r.x[i])}">${z(r.x[i]/1000)}</td>`).join('')+`<td class="${cls(tot(r))}">${z(tot(r))}</td>`:'<td colspan="4">當日未列入（不視為零）</td>'}</tr>`).join('')}</table>
   <p class="rc-note">來源：<a href="${srcI}" target="_blank" rel="noreferrer">${s.market==='上市'?'證交所 T86 三大法人買賣超日報':'櫃買中心 三大法人買賣明細'} ↗</a></p></details>
   <p class="rc-note">按已取得日線的最近 20 個交易日查詢；缺資料不視為零。買賣超股數換算為張，不以收盤價估算成交金額。</p>`;}
  else o+=`<p class="rc-note">官方資料未提供此股票的三大法人買賣超（${s.market==='上市'?'證交所 T86':'櫃買中心'}未列入）。</p>`;o+='</div>';
  P.inst=o;o='';
  P.credit=creditCard(s);
  P.etfh=s.etf&&fundOf(E,s.code)?'':etfHolders(s,E,C);
  P.etfc=etfCoverage(E);
  o+=`<details class="method"><summary>查看計算方法與資料說明</summary>
   <p>支撐壓力不是目標價、不是買賣建議，也不代表適合追價。價位全部來自真實歷史成交結構：近 120 個交易日的波段高低點（前後各 2 日確認）與量能K（成交量 ≥ 前 20 日均量 1.5 倍）的最高、最低價；高點被突破超過 1% 後不再當壓力；支撐被跌破時結構轉弱。相鄰結構落在同一波動容差（1.6%）內合併為同一價格帶，不硬拆兩區；價位皆依台股升降單位取整。支撐：現價下方 0～10% 標示近端、10～20% 標示中期、超過 20% 列為長期結構。支撐候選包含波段低點、缺口邊緣、MA5／MA20、近 20 日高低點與量能K。壓力：第一壓力帶之上的下一個獨立結構，若已超過 +10% 則保留、改標中期壓力。近 10 日高點落在第一壓力帶時，標為「關鍵突破／壓力共振區」。找不到真實結構就顯示「尚未形成」，不以公式補值；「資料不足」表示來源資料不足以計算。創新高時顯示明日漲停參考價（依漲跌幅限制，非結構價位）。</p>
   <p>量比＝最新日成交量 ÷ 近 20 日均量（含當日）。均線與走勢以歷史資料最後一日為準。重大除權（官方除權息參考價 ÷ 前收 ≤ 0.9，如股票分割）已依證交所 TWT49U／櫃買中心 exDailyQ 還原，一般現金股息（通常小於 5%）未還原，相關價位需另行判讀。</p><p>形態偵測：①上升趨勢線＝近 60 日內最近 3 個波段低點（前後各 2 日確認）依序墊高且首尾相距 ≥ 15 日，以最小平方法擬合，收盤距線 ≥ -1.5% 為守住、否則為跌破；②整理平台＝不含今日的前 N 日（N=20／15／10）最高最低價區間寬度 ≤ 12%（N=20）或 9%（N≤15），再依今日收盤標示平台內、突破上緣或跌破下緣。皆為觀察用標示，不是買賣訊號。</p>
   <p>資料來源：臺灣證券交易所 OpenAPI／網站資料（STOCK_DAY_ALL、STOCK_DAY、T86、MI_MARGN、t187ap03_L）與櫃買中心 OpenAPI／網站資料（每日收盤行情、個股日成交、三大法人、融資融券餘額、mopsfin_t187ap03_O）；ETF 持股取自各投信官網公開持股（元大、群益、復華、野村、統一、富邦、凱基、永豐、兆豐、台新，國泰嘗試中）。法人單位為千股換算張，日期獨立標示。每個交易日 22:00（台北）自動更新。</p>
   <p>技術價位是研究參考，不是目標價或買賣指示；不保證價格守住支撐或突破壓力。</p></details>`;
  P.method=o;return P;
}

/* ===== ETF：個股頁「持有此股票的 ETF」與 ETF 頁「持股明細」（投信官網公開持股／PCF，比較前一個揭露日） ===== */
let ETFSET=new Set(),etfSort={k:'w',d:-1},etfAct=false,etfOpen=false,etfPS={k:'w',d:-1},etfPTab='全部';
const fundOf=(E,c)=>E.funds.find(f=>f.code===c&&f.date);
const loadEF=()=>EF||(EF=fetch('data/etf.json').then(r=>r.json()));
const aumFmt=v=>v==null?'—':v>=1e8?fmt(v/1e8,v>=1e10?0:1)+' 億':fmt(v/1e4,0)+' 萬';
const lotF=sh=>!sh?'0':sh<1000?`<1 張`:fmt(sh/1000,0)+' 張';   // 股數→張（四捨五入到整張；不足 1 張標「<1 張」，下方小字仍列精確股數）
const lotD=d=>{if(!d)return '0';const z=d>0?'+':'−',a=Math.abs(d);return a<1000?`${z}${fmt(a,0)} 股`:`${z}${fmt(a/1000,0)} 張`;};
const stOf=(sh,ps)=>ps==null?'首次收錄，待下一期':!ps&&sh?'新進':!sh?'剔除':sh>ps?'增持':sh<ps?'減持':'不變';
const dCell=(sh,ps)=>{if(ps==null)return `<span class="flat">—</span><small>首次收錄，待下一期</small>`;const d=sh-ps,st=stOf(sh,ps);
  return `<b class="${cls(d)}">${lotD(d)}</b><small>${st}${ps>0&&d?` · ${sg(d)}${fmt(d/ps*100,2)}%`:''}</small>`;};
const sortTh=(lab,k,S)=>`<th class="sk ${S.k===k?'on':''}" data-sk="${k}" tabindex="0" role="button" title="點擊以此欄排序">${lab}<i>${S.k===k?(S.d<0?'▼':'▲'):'↕'}</i></th>`;
function etfHolders(s,E,C){
  const F=E.funds,fm=Object.fromEntries(F.map(f=>[f.code,f]));
  const all=(E.holdings[s.code]||[]).map(h=>{const f=fm[h.fund];const d=h.prevShares==null?null:h.shares-h.prevShares;
    return {...h,f,d,amt:f&&f.aum?f.aum*h.weight/100:null};});
  const held=all.filter(r=>r.shares),act=held.filter(r=>r.f.active);
  let R=(etfAct?all.filter(r=>r.f.active):all).filter(r=>etfTab==='全部'||(etfTab==='增加'?r.d>0:r.d<0));
  const key={w:r=>r.weight||0,s:r=>r.shares||0,a:r=>r.amt==null?-1:r.amt,d:r=>r.d==null?-Infinity:r.d}[etfSort.k];
  R=[...R].sort((x,y)=>(key(y)-key(x))*(-etfSort.d)||y.weight-x.weight);
  const total=held.reduce((a,r)=>a+(r.amt||0),0),noAum=held.filter(r=>r.amt==null).length;
  return `<div class="rcard"><div class="rc-head"><h3>持有此股票的 ETF</h3><span>被 ${held.length} 檔 ETF 持有 · 其中主動式 ${act.length} 檔</span></div>
   ${etfAggLine(s,E,C)}
   <p class="rc-note">已接入 ${new Set(F.filter(f=>f.date).map(f=>f.issuer)).size} 家投信、${F.filter(f=>f.date).length} 檔 ETF 的官方持股，比對前一個揭露日的股數增減（漲紅跌綠）。${held.length?`本股在這些 ETF 的估算持有金額合計約 ${aumFmt(total)}${noAum?`（另有 ${noAum} 檔缺規模未計入）`:''}。`:''}沒接入的 ETF 無法判定，不代表沒持有。</p>
   <div class="tabs">${['全部','增加','減少'].map(t=>`<button data-t="${t}" class="${t===etfTab?'on':''}">${t}</button>`).join('')}<button id="etfAct" class="${etfAct?'on':''}" aria-pressed="${etfAct}">只看主動式 ETF</button><span>顯示 ${R.length} / ${all.length} 筆</span></div>
   ${R.length?`<details id="etfList" class="etfdet" ${etfOpen?'open':''}><summary>展開 ETF 名單（${R.length} 檔）</summary><div class="etfwrap"><table class="etft"><tr><th>ETF / 投信 / 基準日</th>${sortTh('權重','w',etfSort)}${sortTh('持有張數','s',etfSort)}${sortTh('估算金額','a',etfSort)}${sortTh('增減張數 / 增減幅','d',etfSort)}</tr>${R.map(r=>`<tr><td><a href="#${r.fund}" class="etflink" data-go="${r.fund}">${r.fund} ${r.f.name}</a>${r.f.active?'<span class="act">主動式</span>':''}<small>${r.f.issuer} · 基準日 ${r.f.date}${r.f.prevDate?' · 比較 '+r.f.prevDate:''}${r.f.stale?' · <b class="warn">沿用舊資料</b>':''} · <a href="${r.f.url}" target="_blank" rel="noreferrer">官網 ↗</a></small></td>
   <td>${fmt(r.weight)}%<small>${r.prevWeight==null?'—':'前期 '+fmt(r.prevWeight)+'%（'+sg(r.weight-r.prevWeight)+fmt(r.weight-r.prevWeight)+'）'}</small></td>
   <td>${lotF(r.shares)}<small>${r.shares?fmt(r.shares,0)+' 股':'已剔除'}</small></td>
   <td>${r.amt==null?'—':aumFmt(r.amt)}<small>${r.f.aum?'ETF 規模 '+aumFmt(r.f.aum):'未取得規模'}</small></td>
   <td class="${cls(r.d)}">${dCell(r.shares,r.prevShares)}</td></tr>`).join('')}</table></div></details>`
   :`<p class="rc-note">${all.length?'目前沒有符合此篩選的紀錄。':'在已成功取得的 ETF 名單中未找到本股；未接入或失敗的 ETF 無法判定。'}</p>`}
   <p class="rc-note">估算金額＝該 ETF 淨資產（投信官網公開，與持股同基準日）× 權重，是估算值，不是實際買進金額；抓不到規模的留空，不估造。股數增減含申購買回、股票分割與公司行動，不等於經理人主動買賣。預設按權重由高到低，可點欄位標題切換排序。</p></div>`;
}
function etfCoverage(E){
  const by={};E.funds.forEach(f=>(by[f.issuer]=by[f.issuer]||[]).push(f));
  const ok=E.funds.filter(f=>f.date),cmp=E.funds.filter(f=>f.prevDate);
  return `<details class="covd"><summary>資料涵蓋範圍（已接入的 ETF 清單，不一定持有本股）</summary>
   <p class="rc-note">已接入 ${Object.keys(by).length} 家投信、${E.funds.length} 檔 ETF；本次取得 ${ok.length} 檔，其中 ${cmp.length} 檔已有前一期可比較增減。以下是接入範圍，<b>不是</b>持有清單。</p>
   <div class="cov">${Object.entries(by).map(([i,L])=>`<div class="covrow"><b>${i}</b><span class="covn">${L.filter(f=>f.date).length}/${L.length} 檔</span><div>${L.map(f=>`<a class="chip ${f.ok?'':f.stale?'stale':'bad'}" href="${f.url}" target="_blank" rel="noreferrer" title="${f.ok?'已取得':f.reason||''}">${f.code} ${f.name}<em>${f.date?f.date.slice(5)+(f.prevDate?' · 可比':' · 待下一期'):'失敗：'+(f.reason||'未知')}</em></a>`).join('')}</div></div>`).join('')}</div>
   <p class="rc-note">來源皆為各投信官網公開的持股／申購買回清單（PCF）／資產明細，只收台股 4 碼持股；基準日是持股編製日。${E.notCovered?`尚未納入：${E.notCovered}。`:''}取得失敗者列出原因，有舊快照時沿用並標示基準日，不補假資料、不繞過存取限制。${E.updated?`抓取時間 ${E.updated.replace('T',' ').slice(0,16)}（台北）。`:''}</p></details>`;
}
let FH=null;
function fundHoldings(E,code){
  if(!FH){FH={};for(const [c,L] of Object.entries(E.holdings))for(const h of L)(FH[h.fund]=FH[h.fund]||[]).push({code:c,...h});}
  return FH[code]||[];
}
function etfPage(s,E){
  const f=fundOf(E,s.code);if(!f)return '';const byc=Object.fromEntries(ALL.map(x=>[x.code,x]));
  const rows=fundHoldings(E,s.code).map(h=>{const x=byc[h.code],d=h.prevShares==null?null:h.shares-h.prevShares;
    return {...h,x,d,name:x?x.name:'',pct:x&&x.close?x.change/(x.close-x.change)*100:null,amt:f.aum?f.aum*h.weight/100:null};});
  const held=rows.filter(r=>r.shares),add=rows.filter(r=>r.d>0||(r.prevShares===0&&r.shares)).length,cut=rows.filter(r=>r.d<0).length,out=rows.filter(r=>r.prevShares>0&&!r.shares).length,nw=rows.filter(r=>r.prevShares===0&&r.shares).length;
  let R=rows.filter(r=>etfPTab==='全部'||(etfPTab==='增加'?r.d>0:r.d<0));
  const key={w:r=>r.weight||0,s:r=>r.shares||0,a:r=>r.amt==null?-1:r.amt,d:r=>r.d==null?-Infinity:r.d,p:r=>r.pct==null?-Infinity:r.pct,c:r=>r.x?r.x.close:-1}[etfPS.k];
  R=[...R].sort((a,b)=>(key(b)-key(a))*(-etfPS.d)||b.weight-a.weight);
  const w=W();
  return `<div class="rcard etfpg"><div class="rc-head"><h3>持股明細</h3><span>基準日 ${f.date}${f.prevDate?` · 比較 ${f.prevDate}`:''}</span></div>
   <div class="metrics etfm"><span>投信<b>${f.issuer}</b></span><span>類型<b>${f.active?'主動式 ETF':'被動式 ETF'}</b></span><span>持股檔數<b>${held.length}</b></span><span>淨資產<b>${aumFmt(f.aum)}</b></span><span>增持／新進<b class="up">${add}${nw?`（含新進 ${nw}）`:''}</b></span><span>減持／剔除<b class="down">${cut+out}${out?`（含剔除 ${out}）`:''}</b></span></div>
   <p class="rc-note">來源：<a href="${f.url}" target="_blank" rel="noreferrer">${f.issuer}官網公開持股 ↗</a>（基準日 ${f.date}，僅列台股 4 碼持股，期貨、現金與外國股不列入）；股價與漲跌用證交所／櫃買中心 ${dfmt(META.twseDate)} 官方收盤資料，漲紅跌綠。${f.prevDate?`增減＝基準日股數減前一個揭露日（${f.prevDate}）股數，含申購買回與公司行動，不等於經理人主動買賣。`:'<b>首次收錄，待下一期</b>：目前只有一期資料，下一個揭露日才會有增減。'}${f.stale?` <b class="warn">本次抓取失敗，沿用 ${f.date} 舊資料（${f.reason||''}）。</b>`:''}</p>
   <div class="tabs">${['全部','增加','減少'].map(t=>`<button data-pt="${t}" class="${t===etfPTab?'on':''}">${t}</button>`).join('')}<span>顯示 ${R.length} / ${rows.length} 筆${out?`（含本期剔除 ${out} 檔；現持股 ${held.length} 檔）`:''}</span></div>
   <div class="etfwrap"><table class="etft cons"><tr><th>股票</th>${sortTh('股價','c',etfPS)}${sortTh('漲跌幅','p',etfPS)}${sortTh('權重','w',etfPS)}${sortTh('持有張數','s',etfPS)}${sortTh('估算金額','a',etfPS)}${sortTh('增減張數 / 增減幅','d',etfPS)}</tr>${R.map(r=>{const x=r.x;
   return `<tr><td><span class="star ${w.includes(r.code)?'on':''}" data-cs="${r.code}" role="button" aria-label="加入自選">${w.includes(r.code)?'★':'☆'}</span><a href="#${r.code}" class="etflink" data-go="${r.code}"><b>${r.name||'（無行情資料）'}</b><small>${r.code}${x?' · '+x.market:''}</small></a></td>
   <td>${x?`<b>${fmt(x.close)}</b><small class="${cls(x.change)}">${sg(x.change)}${fmt(x.change)}</small>`:'—'}</td><td class="${cls(r.pct)}">${r.pct==null?'—':sg(r.pct)+fmt(r.pct)+'%'}</td>
   <td>${fmt(r.weight)}%<small>${r.prevWeight==null?'—':'前期 '+fmt(r.prevWeight)+'%'}</small></td><td>${lotF(r.shares)}<small>${r.shares?fmt(r.shares,0)+' 股':'已剔除'}</small></td>
   <td>${r.amt==null?'—':aumFmt(r.amt)}</td><td class="${cls(r.d)}">${dCell(r.shares,r.prevShares)}</td></tr>`}).join('')}</table></div>
   <p class="rc-note">估算金額＝${f.issuer} 公布的淨資產 ${aumFmt(f.aum)} × 權重，是估算值；點股票名稱可回該股個股頁，☆ 可加入自選。預設按權重由高到低排序，可點欄位標題切換。</p></div>`;
}
const selS=()=>ALL.find(x=>x.code===sel);
const skToggle=(S,k)=>{if(S.k===k)S.d=-S.d;else{S.k=k;S.d=-1;}};
function bindResearch(){
  bindChart();
  const E_=()=>EF,rr=()=>EF.then(E=>{const s=selS();if(!s)return;fillResearch(s,window._H,CH_,E);bindResearch();}),
    rp=()=>EF.then(E=>{const s=selS();const p=$('#etfpage');if(s&&p){p.innerHTML=etfPage(s,E);bindResearch();}});
  document.querySelectorAll('#sl-etf .tabs button[data-t]').forEach(b=>b.onclick=()=>{etfTab=b.dataset.t;etfOpen=true;rr();});
  const ab=$('#etfAct');if(ab)ab.onclick=()=>{etfAct=!etfAct;etfOpen=true;rr();};
  const el=$('#etfList');if(el)el.addEventListener('toggle',()=>{etfOpen=el.open;});
  document.querySelectorAll('#sl-etf th.sk').forEach(h=>{const f=()=>{skToggle(etfSort,h.dataset.sk);rr();};h.onclick=f;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
  document.querySelectorAll('#etfpage .tabs button[data-pt]').forEach(b=>b.onclick=()=>{etfPTab=b.dataset.pt;rp();});
  document.querySelectorAll('#etfpage th.sk').forEach(h=>{const f=()=>{skToggle(etfPS,h.dataset.sk);rp();};h.onclick=f;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
  document.querySelectorAll('#sl-etf .etflink,#etfpage .etflink').forEach(a=>a.onclick=e=>{e.preventDefault();pick(a.dataset.go);toDetail();if(!isM())scrollTo({top:0});});
  document.querySelectorAll('#etfpage [data-cs]').forEach(st=>st.onclick=e=>{e.stopPropagation();toggle(st.dataset.cs);const on=W().includes(st.dataset.cs);st.classList.toggle('on',on);st.textContent=on?'★':'☆';});
}
/* ===== 情境篩選／位階分級／風險檢查／基本面（資料分類與觀察，非買賣建議） ===== */
const TIERS=['線下整理','剛站回','爬坡中','噴出中','已飛天'];
function scrUI(){
  if(!SC){$('#scr').innerHTML='';return;}
  const m=SC.meta,d=SC.defs;
  $('#scr').innerHTML=`<div class="scr-h"><b>快速情境</b><span>目前涵蓋 ${m.n} 檔 · 資料日期 ${dfmt(m.date)}</span></div>
  <div class="chips" id="scChips">${d.scen.map(x=>`<button data-sc="${x.id}" class="${scF===x.id?'on':''}" title="${x.short}">${x.name}<em>${m.counts[x.id]}</em></button>`).join('')}</div>
  <div class="scr-h"><b>位階</b><span>收盤相對生命線（${m.lifeline}）</span></div>
  <div class="chips tiers" id="tChips">${TIERS.map((n,i)=>`<button data-t="${i}" class="t${i} ${tierF===i?'on':''}">${n}<em>${m.tierCounts[i]}</em></button>`).join('')}</div>
  <div class="scr-st" id="scSt"></div>
  <details class="scr-def"><summary>查看情境與位階的判斷條件</summary>
   <p><b>生命線</b>：${d.life}</p>
   <dl>${d.scen.map(x=>`<dt>${x.name}</dt><dd>${x.rule}</dd>`).join('')}</dl>
   <p><b>位階分級</b>：${d.tierRule}</p>
   <p class="rc-note">涵蓋範圍：${m.n} 檔（站上已建立歷史價量者：自選＋成交值居前個股，每日由證交所 MI_INDEX、櫃買中心 dailyQuotes 收盤快照累積計算），其餘上市櫃股票尚未納入情境篩選。以上為依官方收盤價量與三大法人資料自行計算的「資料分類與觀察」，門檻為本站自訂，不是買賣建議，也不代表後續走勢。資料日期 ${dfmt(m.date)}。</p></details>`;
  $('#scChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{scF=scF===b.dataset.sc?'':b.dataset.sc;scrUI();render();});
  $('#tChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{const t=+b.dataset.t;tierF=tierF===t?-1:t;scrUI();render();});
  scrStatus();
}
function scrStatus(n){
  const el=$('#scSt');if(!el||!SC)return;
  if(!scF&&tierF<0){el.innerHTML='';el.style.display='none';return;}
  const nm=[scF&&SC.defs.scen.find(x=>x.id===scF).name,tierF>=0&&TIERS[tierF]].filter(Boolean).join(' ＋ ');
  el.style.display='flex';el.innerHTML=`<span>篩選：<b>${nm}</b>${n==null?'':` · 符合 <b>${n}</b> 檔`}</span><button id="scClr">✕ 清除</button>`;
  $('#scClr').onclick=()=>{scF='';tierF=-1;scrUI();render();};
}
function riskHtml(code,H){
  const a=SC&&SC.items[code];
  if(!a)return `<div class="rcard riskc"><div class="rc-head"><h3>風險檢查</h3><span>資料不足</span></div><p class="rc-note">此股票尚無足夠歷史價量（需至少 25 個交易日、且在本站技術分析涵蓋範圍內），暫無法自動檢查噴出段、三跳空、量價背離與融資暴增。</p></div>`;
  const names=Object.fromEntries(SC.defs.risk.map(r=>[r.id,r])),w=a.risk.filter(r=>r.warn).length;
  const sc=a.scen.map(id=>SC.defs.scen.find(x=>x.id===id).name);
  const pos=`<div class="rcard"><div class="rc-head"><h3>位階分級</h3><span>依 ${dfmt(a.date)} 收盤 · 生命線＝${SC.meta.lifeline}</span></div>
   <div class="tiersteps">${TIERS.map((n,i)=>`<div class="${i===a.tier?'cur t'+i:''}"><i></i><small>${n}</small></div>`).join('')}</div>
   <div class="sector-line"><span>目前位階</span><b>${TIERS[a.tier]}</b><strong class="${cls(a.bias)}">乖離 ${a.bias>0?'+':''}${fmt(a.bias,1)}%</strong></div>
   <p class="rc-note">收盤 ${fmt(a.close)}，生命線 MA20 ${fmt(a.life)}；${a.streak>0?`已連續 ${a.streak} 日收在生命線之上${a.crossed?'（由線下站回）':'（超出本站歷史範圍起算）'}`:'收盤在生命線之下'}。${a.drop<=-10?`近 60 日自高點最大回落 ${fmt(a.drop,1)}%。`:''}</p>
   <p class="rc-note">${sc.length?`符合快速情境：${sc.map(n=>`<span class="pill ok">${n}</span>`).join('')}`:'目前未符合任何快速情境。'}</p>
   <details><summary>查看位階與情境的判斷條件</summary><p class="rc-note">${SC.defs.tierRule}</p><dl class="scr-dl">${SC.defs.scen.map(x=>`<dt>${x.name}</dt><dd>${x.rule}</dd>`).join('')}</dl></details>
   <p class="rc-note sep">分類為依官方收盤價量自行計算的資料分類與觀察，門檻為本站自訂，不是買賣建議。</p></div>`;
  const risk=`<div class="rcard riskc"><div class="rc-head"><h3>風險檢查</h3><span>${w?`<b class="warnc">⚠ ${w} 項警示</b>`:'<b class="okc">✓ 4 項皆未偵測到</b>'} · 依 ${dfmt(a.date)} 收盤</span></div>
   <div class="riskl">${a.risk.map(r=>`<div class="rk ${r.warn?'warn':'ok'}"><span class="rk-s">${r.warn?'⚠ 警示':'✓ 未偵測到'}</span><div><b>${names[r.id].name}</b><small>${r.text}</small></div></div>`).join('')}</div>
   <details><summary>查看檢查條件（門檻為本站自訂）</summary><dl class="scr-dl">${SC.defs.risk.map(x=>`<dt>${x.name}</dt><dd>${x.rule}</dd>`).join('')}</dl></details>
   <p class="rc-note sep">「未偵測到」只代表依上述條件未出現，不代表沒有風險；「警示」是資料特徵標示，不預測後續漲跌，也不是買賣建議。來源：證交所／櫃買中心收盤價量、融資餘額，資料日期 ${dfmt(a.date)}。</p></div>`;
  return pos+risk;
}
function fundHtml(s,H){
  const f=FD&&FD.items[s.code],d=FD&&FD.dates&&FD.dates[s.market],r=RV&&RV.items[s.code];
  const adj=H&&H.adjusted&&H.adjusted.length?H.adjusted[H.adjusted.length-1]:null;
  let o=`<div class="rcard fund"><div class="rc-head"><h3>基本面</h3><span>評價資料日期 ${d?dfmt(d):'—'}</span></div>`;
  if(s.etf&&!f)o+=`<p class="rc-note">ETF 不列本益比、殖利率與月營收。</p>`;
  else{
   o+=f?`<div class="m4 m3"><div><small>本益比</small><b>${f[0]==null?'—':fmt(f[0],2)}</b><small>${f[0]==null?'官方未列（虧損或無資料）':'倍'}</small></div><div><small>殖利率</small><b>${f[1]==null?'—':fmt(f[1],2)+'<em>%</em>'}</b><small>${f[1]==null?'官方未列':'依最近一次股利'}</small></div><div><small>股價淨值比</small><b>${f[2]==null?'—':fmt(f[2],2)}</b><small>倍</small></div></div>`
    :`<p class="rc-note">官方 ${s.market==='上市'?'BWIBBU_ALL':'本益比／殖利率'}資料未列入此證券。</p>`;
   o+=`<p class="rc-note">來源：${s.market==='上市'?'證交所 OpenAPI BWIBBU_ALL':'櫃買中心 OpenAPI tpex_mainboard_peratio_analysis'}（官方計算值，本站不另行推估）。</p>`;
   if(s.code==='6669')o+=`<div class="note2 adjnote">⚠ 緯穎 6669 於 2026-09-02 除權（官方前收 7,800 → 參考價 2,614.99），官方本益比與殖利率在除權前後的基準不一致（可能是除權後股價與未同步調整的每股盈餘、股利混算），數值明顯失真（目前顯示 ${f?fmt(f[0],2)+' 倍、'+fmt(f[1],2)+'%':'—'}，不宜直接引用），僅供參考；請以公司公告的每股盈餘與股利自行換算。</div>`;
   else if(adj&&Date.now()-new Date(adj.date)<200*864e5)o+=`<div class="note2 adjnote">⚠ 本股於 ${dfmt(adj.date)} 有重大除權（還原因子 ${fmt(adj.factor,4)}），官方本益比、殖利率可能因股本變動而失真，僅供參考。</div>`;
   if(r&&r.length){const mx=Math.max(...r.map(x=>x[1])),L=r[r.length-1],yo=v=>v==null?'—':(v>0?'+':'')+fmt(v,1)+'%';
    o+=`<div class="rc-head sub"><h3>月營收 · 近 ${r.length} 個月</h3><span>最新 ${L[0]} · ${fmt(L[1]/1e5,2)} 億元</span></div>
    <div class="rvbars">${r.map(x=>`<div class="rvb" title="${x[0]} 營收 ${fmt(x[1]/1e5,2)} 億元，年增 ${yo(x[2])}，月增 ${yo(x[3])}"><em class="${cls(x[2])}">${x[2]==null?'—':(x[2]>0?'+':'')+fmt(x[2],0)}</em><i style="height:${Math.max(3,x[1]/mx*92)}px"></i><small>${x[0].slice(2).replace('-','/')}</small></div>`).join('')}</div>
    <p class="rc-note">長條＝當月營收，上方數字＝年增率（%）。最新月 ${L[0]}：營收 ${fmt(L[1]/1e5,2)} 億元，年增 <b class="${cls(L[2])}">${yo(L[2])}</b>，月增 <b class="${cls(L[3])}">${yo(L[3])}</b>。</p>
    <details><summary>查看逐月明細與來源</summary><table><tr><th>月份</th><th>營收（億元）</th><th>年增</th><th>月增</th></tr>${r.slice().reverse().map(x=>`<tr><td>${x[0]}</td><td>${fmt(x[1]/1e5,2)}</td><td class="${cls(x[2])}">${yo(x[2])}</td><td class="${cls(x[3])}">${yo(x[3])}</td></tr>`).join('')}</table>
    <p class="rc-note">來源：公開資訊觀測站「每月營業收入彙總表」（各公司申報，單位千元，換算為億元）；已涵蓋月份至 ${RV.latest}，次月 10 日前陸續公布。月營收未做除權還原，營收本身不受股票分割影響。</p></details>`;}
   else o+=`<p class="rc-note">公開資訊觀測站月營收彙總表未列入此證券（或最近 12 個月無資料）。</p>`;
  }
  return o+`<p class="rc-note sep">本益比、殖利率、淨值比與營收為官方公告或官方計算的資料，用於資料分類與觀察，不是買賣建議。</p></div>`;
}

/* ===== 可展開區塊：統一成明顯的按鈕（原生 <details> 增強：aria-expanded、平滑展開、鍵盤可用） ===== */
function upgradeDetails(root){
  (root||document).querySelectorAll('details:not([data-xb])').forEach(d=>{
    const s=d.querySelector(':scope>summary');if(!s)return;d.dataset.xb='1';
    const label=s.textContent.trim();
    s.classList.add('xbtn');s.setAttribute('role','button');s.setAttribute('tabindex','0');
    s.innerHTML=`<span class="xi" aria-hidden="true">▸</span><span class="xt"></span>`;
    const t=s.querySelector('.xt'),ic=s.querySelector('.xi');
    const body=document.createElement('div');body.className='xbody';
    const inner=document.createElement('div');inner.className='xinner';
    [...d.childNodes].forEach(n=>{if(n!==s)inner.appendChild(n)});body.appendChild(inner);d.appendChild(body);
    const set=o=>{s.setAttribute('aria-expanded',o?'true':'false');ic.textContent=o?'▾':'▸';t.textContent=o?'收合':label;};
    set(d.open);if(d.open)body.style.height='auto';
    s.addEventListener('click',e=>{
      e.preventDefault();
      const opening=!d.open;
      if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){d.open=opening;set(opening);body.style.height=opening?'auto':'0px';return;}
      if(opening){d.open=true;set(true);const h=inner.offsetHeight;body.style.height='0px';body.offsetHeight;body.style.height=h+'px';
        const end=()=>{body.style.height='auto';body.removeEventListener('transitionend',end)};body.addEventListener('transitionend',end);}
      else{set(false);body.style.height=inner.offsetHeight+'px';body.offsetHeight;body.style.height='0px';
        const end=ev=>{if(ev.propertyName!=='height')return;d.open=false;body.removeEventListener('transitionend',end)};body.addEventListener('transitionend',end);}
    });
    s.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();s.click();}});
  });
}
new MutationObserver(()=>upgradeDetails()).observe(document.body,{childList:true,subtree:true});
upgradeDetails();
init();

/* ================= 第二批（段一）：題材族群、族群強弱、日程日曆、ETF 增減彙總、進階篩選 ================= */
let TH=null,MT=null,EV=null,NW=null,TS={k:'r5',d:-1},THSEL=null,CALF={who:'all',type:'all'},EAGG={dir:'up',act:false,min:1};
const BYC=()=>BYC._m||(BYC._m=Object.fromEntries(ALL.map(x=>[x.code,x])));
const pcOf=x=>x&&x.close!=null&&x.change!=null&&x.close-x.change?x.change/(x.close-x.change)*100:null;
const mtOf=c=>MT&&MT.items[c]; const MF=k=>MT?MT.fields.indexOf(k):-1;
const mv=(c,k)=>{const o=mtOf(c);return o?o[MF(k)]:null;};
const zp=(v,d=2)=>v==null?'—':(v>0?'+':v<0?'−':'')+fmt(Math.abs(v),d)+'%';
const csi=(c,k)=>{const o=CS&&CS.items[c];return o&&o.i?o.i[k]:null;};
const inst5=c=>{const i=CS&&CS.items[c]&&CS.items[c].i;return i?i[3]+i[5]+i[7]:null;};
const themesOf=c=>TH?TH.themes.filter(t=>t.codes.includes(c)):[];
const themeSet=()=>themeSet._s||(themeSet._s=new Set(TH?TH.themes.flatMap(t=>t.codes):[]));
function setView(v){document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===v));view=v;$('#side').classList.remove('open');render();runView();}
function runView(){const f={w25:overview,theme:themePage,cal:calPage,etfagg:etfAggPage,mkt:mktPage}[view];if(f){f();toDetail();}}
document.addEventListener('click',e=>{const a=e.target.closest('[data-theme]');if(a){e.preventDefault();THSEL=a.dataset.theme;setView('theme');}
  const g=e.target.closest('[data-pickc]');if(g){e.preventDefault();pick(g.dataset.pickc);toDetail();}});
const srcNote=t=>`<p class="note2">${t}</p>`;
const stkTxt=c=>{const v=csi(c,0),t=csi(c,1);return `${v?`外資${v>0?'買':'賣'}${Math.abs(v)}日`:''}${v&&t?' · ':''}${t?`投信${t>0?'買':'賣'}${Math.abs(t)}日`:''}`||'—';};

/* ---- 題材族群與強弱 ---- */
function themeAgg(t){const rows=t.codes.map(c=>BYC()[c]).filter(Boolean).map(x=>({x,p:pcOf(x),r5:mv(x.code,'r5'),r20:mv(x.code,'r20'),f5:csi(x.code,3),i5:inst5(x.code)}));
  const avg=k=>{const a=rows.map(r=>r[k]).filter(v=>v!=null);return a.length?{v:a.reduce((p,q)=>p+q,0)/a.length,n:a.length}:{v:null,n:0};};
  const sum=k=>{const a=rows.map(r=>r[k]).filter(v=>v!=null);return a.length?{v:a.reduce((p,q)=>p+q,0),n:a.length}:{v:null,n:0};};
  const val=rows.reduce((p,r)=>p+(r.x.value||0),0),tot=ALL.reduce((p,x)=>p+(x.value||0),0);
  return {t,rows,avg:avg('p'),r5:avg('r5'),r20:avg('r20'),f5:sum('f5'),i5:sum('i5'),val,share:tot?val/tot*100:null,up:rows.filter(r=>r.p>0).length,dn:rows.filter(r=>r.p<0).length};}
function themePage(){
  const box=$('#detail');if(!TH){box.innerHTML='<div class="empty">題材資料載入失敗。</div>';return;}
  const A=TH.themes.map(themeAgg),K={avg:a=>a.avg.v,r5:a=>a.r5.v,r20:a=>a.r20.v,val:a=>a.val,share:a=>a.share,f5:a=>a.f5.v,i5:a=>a.i5.v,up:a=>a.up/(a.rows.length||1)};
  A.sort((a,b)=>((K[TS.k](b)==null?-Infinity:K[TS.k](b))-(K[TS.k](a)==null?-Infinity:K[TS.k](a)))*(-TS.d));
  if(!THSEL||!A.find(a=>a.t.id===THSEL))THSEL=A[0].t.id;
  const th=(lab,k,sub)=>`<th class="sk ${TS.k===k?'on':''}" data-tk="${k}" tabindex="0" role="button" title="點擊以此欄排序">${lab}<i>${TS.k===k?(TS.d<0?'▼':'▲'):'↕'}</i>${sub?`<small>${sub}</small>`:''}</th>`;
  const cell=(o,d=2)=>o.v==null?'<td class="num"><small>資料不足</small></td>':`<td class="num"><b class="${cls(o.v)}">${zp(o.v,d)}</b><small>${o.n} 檔平均</small></td>`;
  const sel=A.find(a=>a.t.id===THSEL),M=sel.rows.slice().sort((a,b)=>(b.x.value||0)-(a.x.value||0));
  box.innerHTML=`<div class="eyebrow">THEMES <span>站內整理 · 價量資料日 ${dfmt(META.twseDate)}</span></div>
  ${grp('族群強弱排行','各題材平均漲跌、5／20 日表現、成交占比與法人買賣超')}
  <div class="rcard"><div class="rc-head"><h3>題材強弱（點欄位標題排序）</h3><span>${TH.themes.length} 個題材</span></div>
  <div class="tablewrap"><table class="ov themes"><tr><th>題材</th>${th('今日平均','avg')}${th('5 日平均','r5')}${th('20 日平均','r20')}${th('成交值','val','億元')}${th('占全市場','share','成交值%')}${th('外資 5 日','f5','張')}${th('法人 5 日','i5','張 三大合計')}${th('上漲家數','up','')}</tr>
  ${A.map(a=>`<tr data-th="${a.t.id}" class="${a.t.id===THSEL?'sel':''}"><td><b>${a.t.name}</b><small>${a.rows.length} 檔</small></td>${cell(a.avg)}${cell(a.r5)}${cell(a.r20)}<td class="num"><b>${fmt(a.val/1e8,1)}</b></td><td class="num">${a.share==null?'—':fmt(a.share,1)+'%'}</td>
   <td class="num">${a.f5.v==null?'<small>資料不足</small>':`<b class="${cls(a.f5.v)}">${sgn(a.f5.v)}</b><small>${a.f5.n} 檔</small>`}</td><td class="num">${a.i5.v==null?'<small>資料不足</small>':`<b class="${cls(a.i5.v)}">${sgn(a.i5.v)}</b><small>${a.i5.n} 檔</small>`}</td><td class="num"><b class="up">${a.up}</b> / <b class="down">${a.dn}</b><small>漲 / 跌</small></td></tr>`).join('')}</table></div>
  <p class="rc-note">平均為等權平均（每檔同權重）；5／20 日表現由站內歷史收盤計算，只含有歷史資料的成員（欄內標示檔數）；成交占比＝題材成員當日成交值 ÷ 全市場（上市＋上櫃含 ETF）成交值，一檔可屬多個題材，各題材占比相加可超過 100%；法人買賣超取自證交所 T86／櫃買三大法人，近 5 個已取得交易日合計。</p></div>
  ${grp(sel.t.name+' 成員','點股票名稱開啟個股頁')}
  <div class="rcard"><div class="rc-head"><h3>${sel.t.name}</h3><span>${sel.t.desc}</span></div>${usBlock([sel.t],false)}
  <div class="tablewrap"><table class="ov"><tr><th>股票</th><th>收盤 / 漲跌</th><th>5 日</th><th>20 日</th><th>成交值<small>億元</small></th><th>外資 5 日<small>張</small></th><th>法人 5 日<small>張</small></th><th>連買連賣</th><th>標記</th></tr>
  ${M.map(r=>{const x=r.x;return `<tr data-pickc="${x.code}" class="clk"><td><b>${x.name}</b><small>${x.code} · ${x.market}${x.etf?' · ETF':''}</small></td><td class="num"><b>${fmt(x.close)}</b><small class="${cls(x.change)}">${r.p==null?'—':zp(r.p)}</small></td>
   <td class="num ${cls(r.r5)}">${r.r5==null?'<small>資料不足</small>':zp(r.r5)}</td><td class="num ${cls(r.r20)}">${r.r20==null?'<small>資料不足</small>':zp(r.r20)}</td><td class="num">${fmt((x.value||0)/1e8,2)}</td>
   <td class="num ${cls(r.f5)}">${r.f5==null?'—':sgn(r.f5)}</td><td class="num ${cls(r.i5)}">${r.i5==null?'—':sgn(r.i5)}</td><td><small>${stkTxt(x.code)}</small></td><td>${flHtml(x.code)||'<small>—</small>'}${dtTags(x)}</td></tr>`;}).join('')}</table></div>
  <p class="rc-note">成員 ${M.length} 檔；一檔可屬多個題材：${M.map(r=>themesOf(r.x.code).length>1?`${r.x.name}（${themesOf(r.x.code).map(t=>t.name).join('、')}）`:'').filter(Boolean).join('；')||'無'}。</p></div>
  <div class="rcard"><div class="rc-head"><h3>關於題材歸類</h3></div><p class="rc-note" style="margin:0">${TH.note}（資料更新 ${dfmt(TH.updated)}；歸類檔案 site/data/themes.json，每個代號都已核對存在於本站股票清單。）</p></div>`;
  box.querySelectorAll('tr[data-th]').forEach(r=>r.onclick=()=>{THSEL=r.dataset.th;themePage();});
  box.querySelectorAll('th[data-tk]').forEach(h=>{const f=()=>{TS=TS.k===h.dataset.tk?{k:TS.k,d:-TS.d}:{k:h.dataset.tk,d:-1};themePage();};h.onclick=f;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
}
const themeCard=c=>{const ts=themesOf(c);if(!ts.length)return '';return `<p class="rc-note thm">站內題材歸類（人工整理，非官方分類）：${ts.map(t=>`<a href="#" class="pill" data-theme="${t.id}">${t.name}</a>`).join(' ')}</p>${usBlock(ts,true)}`;};

/* ---- 日程日曆：除權息（TWT48U／櫃買預告表）、法說會（重大訊息「召開法人說明會」）、財報法定申報期限 ---- */
function calItems(){if(!EV)return [];const w=W(),tset=themeSet(),L=[];
  EV.ex.forEach(e=>L.push({d:e.d,type:'ex',c:e.c,n:e.n,mk:e.mk,txt:`${e.k}${e.cash!=null?` · 現金股利 ${fmt(e.cash,4).replace(/0+$/,'').replace(/\.$/,'')} 元`:e.note?` · ${e.note}`:''}${e.stock?` · 配股 ${fmt(e.stock,3)}`:''}`}));
  EV.ir.forEach(e=>L.push({d:e.d,type:'ir',c:e.c,n:e.n,mk:e.mk,txt:`法人說明會${e.tm?' '+e.tm:''}${e.pl?' · '+e.pl:''}`,sub:e.s+'（'+dfmt(e.ann)+' 公告）'}));
  EV.fin.forEach(e=>L.push({d:e.d,type:'fin',c:null,n:e.t,txt:'法定期限（規則推算，非個別公司公告日）'}));
  L.forEach(i=>{i.w=i.c&&w.includes(i.c);i.t=i.c&&tset.has(i.c);i.rank=i.w?0:i.t?1:2;});return L;}
function calPage(){
  const box=$('#detail');if(!EV){box.innerHTML='<div class="empty">日程資料載入失敗。</div>';return;}
  const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);let L=calItems();
  if(CALF.type!=='all')L=L.filter(i=>i.type===CALF.type);
  if(CALF.who==='watch')L=L.filter(i=>i.w);else if(CALF.who==='theme')L=L.filter(i=>i.w||i.t);
  const g={};L.forEach(i=>(g[i.d]=g[i.d]||[]).push(i));const ds=Object.keys(g).sort();
  const tl={ex:'除權息',ir:'法說會',fin:'財報期限'},chip=(k,key,lab)=>`<button data-cf="${key}:${k}" class="${CALF[key]===k?'on':''}">${lab}</button>`;
  box.innerHTML=`<div class="eyebrow">CALENDAR <span>資料日 ${dfmt(EV.asof)}</span></div>
  ${grp('日程日曆','除權息、法說會與財報申報期限；自選與題材股排在前面')}
  <div class="rcard"><div class="rc-head"><h3>篩選</h3><span>共 ${L.length} 筆</span></div><div class="chips calchips">${chip('all','who','全部')}${chip('watch','who','只看自選')}${chip('theme','who','自選＋題材股')}<span class="sepv"></span>${chip('all','type','全部類型')}${chip('ex','type','除權息')}${chip('ir','type','法說會')}${chip('fin','type','財報期限')}</div></div>
  ${ds.length?ds.map(d=>{const a=g[d].sort((p,q)=>p.rank-q.rank||String(p.c).localeCompare(String(q.c)));const dd=new Date(d+'T00:00:00+08:00');
   return `<div class="rcard calday ${d<today?'past':d===today?'today':''}"><div class="rc-head"><h3>${dfmt(d)}（週${'日一二三四五六'[dd.getDay()]}）${d===today?' · 今天':d<today?' · 已過':''}</h3><span>${a.length} 筆</span></div>
   ${a.map(i=>`<div class="calrow" ${i.c?`data-pickc="${i.c}"`:''}><span class="cb ${i.type}">${tl[i.type]}</span><div><b>${i.n}${i.c?` <small>${i.c} · ${i.mk}</small>`:''}</b>${i.w?'<span class="fl w">自選</span>':''}${i.t?themesOf(i.c).slice(0,2).map(t=>`<span class="fl t">${t.name}</span>`).join(''):''}<small>${i.txt}</small>${i.sub?`<small>${i.sub}</small>`:''}</div></div>`).join('')}</div>`;}).join(''):'<div class="rcard"><p class="rc-note" style="margin:0">沒有符合條件的日程（0 筆）。</p></div>'}
  <div class="rcard"><div class="rc-head"><h3>來源與限制</h3></div><p class="rc-note" style="margin:0">除權息：證交所 TWT48U 除權除息預告表、櫃買中心 tpex_exright_prepost（預告，實際金額以公司公告為準；ETF 收益分配金額常為「待公告」）。法說會：公開資訊觀測站每日重大訊息中「召開法人說明會」公告，由本站每日存檔累積（${EV.irSince?dfmt(EV.irSince)+' 起':'尚無'}）。${EV.irNote} 財報：證券交易法第 36 條法定申報期限（一般產業公司；金融保險證券期貨業期限不同），不是個別公司公告日。</p></div>`;
  box.querySelectorAll('button[data-cf]').forEach(b=>b.onclick=()=>{const[k,v]=b.dataset.cf.split(':');CALF[k]=v;calPage();});
}
const evCard=c=>{if(!EV)return '';const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10),a=[];
  EV.ex.filter(e=>e.c===c&&e.d>=today).forEach(e=>a.push(`<li><b>${dfmt(e.d)}</b> ${e.k}${e.cash!=null?`，現金股利 ${fmt(e.cash,4).replace(/0+$/,'').replace(/\.$/,'')} 元`:e.note?`（${e.note}）`:''}${e.stock?`，配股 ${fmt(e.stock,3)}`:''}</li>`));
  EV.ir.filter(e=>e.c===c&&e.d>=today).forEach(e=>a.push(`<li><b>${dfmt(e.d)}</b> 法人說明會${e.tm?' '+e.tm:''}${e.pl?'，'+e.pl:''}</li>`));
  if(!a.length)return '';return `<div class="rcard"><div class="rc-head"><h3>近期日程</h3><span>除權息預告・法說會（官方公告）</span></div><ul class="gapl evl">${a.join('')}</ul><p class="rc-note">來源：證交所 TWT48U／櫃買除權息預告表、公開資訊觀測站重大訊息；完整日曆見左側「日程日曆」。</p></div>`;};

/* ---- ETF 合計增減（僅可比較者）對照外資 ---- */
function etfAgg(E){const F=E.funds,fm=Object.fromEntries(F.map(f=>[f.code,f])),out={};
  const cmp=new Set(F.filter(f=>f.date&&f.prevDate).map(f=>f.code));
  Object.entries(E.holdings).forEach(([code,hs])=>{let d=0,up=0,dn=0,n=0,held=0,dA=0,nA=0;
    hs.forEach(h=>{const f=fm[h.fund];if(!f)return;if(h.shares)held++;if(h.prevShares==null||!cmp.has(h.fund))return;const x=h.shares-h.prevShares;n++;d+=x;if(x>0)up++;else if(x<0)dn++;if(f.active){dA+=x;nA++;}});
    out[code]={d,up,dn,n,held,dA,nA};});
  return {A:out,cmp:cmp.size,tot:F.filter(f=>f.date).length,dates:[...new Set(F.filter(f=>f.date).map(f=>f.date))].sort()};}
const fgnLast=(C,code)=>{if(!C)return null;const mk=BYC()[code]&&BYC()[code].market,got=C.instGot[mk]||[],raw=C.inst[code];if(!raw)return null;for(let i=C.days.length-1;i>=0;i--){if(got.includes(C.days[i])&&raw[i])return {d:C.days[i],v:raw[i][0]/1000};}return null;};
async function etfAggPage(){
  const box=$('#detail');box.innerHTML='<div class="empty">正在彙整 ETF 持股變動…</div>';
  let E,C;try{[E,C]=await Promise.all([loadEF(),CH||(CH=fetch('data/chips.json').then(r=>r.json()))]);}catch(e){box.innerHTML='<div class="empty">ETF 或籌碼資料載入失敗。</div>';return;}
  if(view!=='etfagg')return;
  const G=etfAgg(E),BC=BYC();
  let R=Object.entries(G.A).filter(([c,a])=>a.n>=EAGG.min&&BC[c]&&!BC[c].etf).map(([c,a])=>({c,x:BC[c],a,d:EAGG.act?a.dA:a.d,n:EAGG.act?a.nA:a.n,f:fgnLast(C,c)})).filter(r=>r.n>0&&r.d!==0);
  R=R.filter(r=>EAGG.dir==='up'?r.d>0:r.d<0).sort((p,q)=>EAGG.dir==='up'?q.d-p.d:p.d-q.d);const tot=R.length;R=R.slice(0,60);
  const rel=r=>{if(!r.f)return '<small>外資資料未列入</small>';const s=Math.sign(r.d),f=Math.sign(r.f.v);return s*f>0?`<span class="pill ok">同向</span>`:f===0?'<span class="pill">外資持平</span>':'<span class="pill warn">反向</span>';};
  const chip=(k,key,lab)=>`<button data-ea="${key}:${k}" class="${String(EAGG[key])===String(k)?'on':''}">${lab}</button>`;
  box.innerHTML=`<div class="eyebrow">ETF FLOWS <span>已接入 ${G.tot} 檔 ETF · 其中 ${G.cmp} 檔可比較</span></div>
  ${grp('ETF 合計增減','同一檔股票被已接入 ETF 合計增持或減持，對照外資買賣超')}
  <div class="rcard"><div class="rc-head"><h3>設定</h3><span>ETF 揭露日 ${G.dates.map(dfmt).join('、')}</span></div>
  <div class="chips calchips">${chip('up','dir','合計增持')}${chip('dn','dir','合計減持')}<span class="sepv"></span>${chip(false,'act','全部 ETF')}${chip(true,'act','只看主動式')}<span class="sepv"></span>${chip(1,'min','≥1 檔可比較')}${chip(3,'min','≥3 檔可比較')}${chip(5,'min','≥5 檔可比較')}</div>
  <p class="rc-note">只計入「前一個揭露日有資料」的可比較 ETF（${G.cmp} / ${G.tot} 檔）；首次收錄、尚無前期的 ETF 不計入，也無法判定；沒接入的 ETF 不代表沒持有。增減＝基準日股數減前一揭露日股數，含申購買回與公司行動，不等於經理人主動買賣。外資＝證交所 T86／櫃買三大法人最新已取得日，兩者日期不一定相同，僅供對照。符合 ${tot} 檔，顯示前 ${R.length} 檔。</p>
  <div class="tablewrap"><table class="ov"><tr><th>股票</th><th>ETF 合計增減<small>張（股數變動）</small></th><th>增 / 減<small>可比較 ETF 檔數</small></th><th>被幾檔 ETF 持有</th><th>外資最新日<small>張</small></th><th>與外資</th></tr>
  ${R.map(r=>`<tr data-pickc="${r.c}" class="clk"><td><b>${r.x.name}</b><small>${r.c} · ${r.x.market}</small></td><td class="num"><b class="${cls(r.d)}">${lotS(r.d)}</b></td><td class="num"><b class="up">${r.a.up}</b> / <b class="down">${r.a.dn}</b><small>共 ${r.n} 檔可比較</small></td><td class="num">${r.a.held} 檔</td>
   <td class="num">${r.f?`<b class="${cls(r.f.v)}">${sgn(r.f.v)}</b><small>${dfmt(r.f.d)}</small>`:'<small>官方未列入</small>'}</td><td>${rel(r)}</td></tr>`).join('')||'<tr><td colspan="6"><small>沒有符合條件的股票（0 檔）</small></td></tr>'}</table></div></div>`;
  box.querySelectorAll('button[data-ea]').forEach(b=>b.onclick=()=>{const[k,v]=b.dataset.ea.split(':');EAGG[k]=k==='min'?+v:k==='act'?v==='true':v;etfAggPage();});
}
function etfAggLine(s,E,C){const G=etfAgg(E),a=G.A[s.code];if(!a||!a.n)return `<p class="rc-note agg">跨 ETF 合計：可比較的 ETF 中沒有此股票的增減資料（已接入 ${G.tot} 檔、其中 ${G.cmp} 檔可比較）。</p>`;
  const f=fgnLast(C,s.code);return `<div class="aggbox"><div><small>跨 ETF 合計增減</small><b class="${cls(a.d)}">${lotS(a.d)}</b><small>增 ${a.up} · 減 ${a.dn} · 共 ${a.n} 檔可比較（已接入 ${G.tot} 檔）</small></div>${f?`<div><small>外資 ${dfmt(f.d)}</small><b class="${cls(f.v)}">${sgn(f.v)} 張</b><small>${a.d*f.v>0?'與 ETF 同向':f.v===0?'外資持平':'與 ETF 反向'}</small></div>`:''}</div>`;}

/* ---- 進階篩選（全清單，以站內歷史價量計算；沒資料者不符合，不放寬） ---- */
let ADV={ds:'',ma:'',vr:'',red:false,brk:'',bias:'',rr:''},ADVOPEN=false;
const advOn=()=>Object.values(ADV).some(v=>v!==''&&v!==false);
function advPass(x){const o=mtOf(x.code);if(!o)return false;const g=k=>o[MF(k)];
  if(ADV.ds!==''){const d=g('distSupport');if(d==null||d>+ADV.ds||!(d>=0||g('supHold')===1))return false;}
  if(ADV.ma){const k={ma5:'aboveMA5',ma20:'aboveMA20',ma60:'aboveMA60',bull:'bull'}[ADV.ma];if(g(k)!==1)return false;if(ADV.ma==='bull'&&g('aboveMA20')!==1)return false;}
  if(ADV.vr!==''){const v=g('volRatio');if(v==null||v<+ADV.vr)return false;}
  if(ADV.red&&g('red')!==1)return false;
  if(ADV.brk){const k=ADV.brk==='10'?'brk10':'brk20';if(g(k)!==1)return false;}
  if(ADV.bias!==''){const b=g('bias20');if(b==null||b>+ADV.bias)return false;}
  if(ADV.rr!==''){const r=g('rr');if(r==null||r<+ADV.rr)return false;}
  return true;}
function advUI(n){const el=$('#advbox');if(!el)return;const sel=(k,opts)=>`<select data-adv="${k}">${opts.map(([v,l])=>`<option value="${v}" ${String(ADV[k])===String(v)?'selected':''}>${l}</option>`).join('')}</select>`;
  el.innerHTML=`<details class="advd" ${advOn()||ADVOPEN?'open':''}><summary>進階條件（全清單計算 · 條件取交集）</summary><div class="advg">
   <label>距支撐帶${sel('ds',[['','不限'],['0.5','上緣 0.5% 內'],['1','上緣 1% 內'],['2','上緣 2% 內'],['3','上緣 3% 內'],['5','上緣 5% 內']])}</label>
   <label>均線${sel('ma',[['','不限'],['ma5','收盤站上 MA5'],['ma20','收盤站上 MA20'],['ma60','收盤站上 MA60'],['bull','多頭排列且站上 MA20']])}</label>
   <label>量比${sel('vr',[['','不限'],['1.2','≥ 1.2'],['1.5','≥ 1.5'],['2','≥ 2']])}<span class="cbx"><input type="checkbox" data-adv="red" ${ADV.red?'checked':''}>收紅（收盤＞開盤）</span></label>
   <label>突破${sel('brk',[['','不限'],['10','收盤高於前 10 日最高'],['20','收盤高於前 20 日最高']])}</label>
   <label>排除乖離月線過高${sel('bias',[['','不排除'],['10','乖離 MA20 ≤ 10%'],['15','乖離 MA20 ≤ 15%'],['20','乖離 MA20 ≤ 20%']])}</label>
   <label>風險報酬比${sel('rr',[['','不限'],['1','≥ 1'],['1.5','≥ 1.5'],['2','≥ 2'],['3','≥ 3']])}</label></div>
   <p class="rc-note">${MT?`涵蓋 ${MT.n} 檔有歷史資料者（資料日 ${dfmt(MT.date)}），沒有歷史資料的標的在啟用條件時不會列入，不放寬。`:'指標資料載入失敗。'}風險報酬比＝（第一壓力下緣−收盤）÷（收盤−停損），停損＝第一支撐帶下緣 ×0.99；距支撐＝收盤相對第一支撐帶上緣，帶內也算；觀察價位，非買賣建議。${advOn()?` <button class="clr" id="advClr">✕ 清除進階條件</button>`:''}</p>
   ${advOn()&&n!=null?`<p class="rc-note advn">目前符合 <b>${n}</b> 檔</p>`:''}</details>`;
  el.querySelector('details').addEventListener('toggle',e=>{ADVOPEN=e.target.open;});
  el.querySelectorAll('[data-adv]').forEach(c=>c.onchange=()=>{const k=c.dataset.adv;ADV[k]=c.type==='checkbox'?c.checked:c.value;render();});
  const cl=$('#advClr');if(cl)cl.onclick=e=>{e.preventDefault();ADV={ds:'',ma:'',vr:'',red:false,brk:'',bias:'',rr:''};render();};}
Object.assign(SORTS,{
 'mt:ds':{f:x=>{const d=mv(x.code,'distSupport');return d!=null&&d>=0?-d:null},t:x=>`距支撐上緣 +${fmt(mv(x.code,'distSupport'),1)}%`},
 'mt:rr':{f:x=>mv(x.code,'rr'),t:x=>`風險報酬比 ${fmt(mv(x.code,'rr'),2)}`},
 'mt:r5':{f:x=>mv(x.code,'r5'),t:x=>`5 日 ${zp(mv(x.code,'r5'))}`},
 'mt:r20':{f:x=>mv(x.code,'r20'),t:x=>`20 日 ${zp(mv(x.code,'r20'))}`},
 'mt:b20':{f:x=>mv(x.code,'bias20'),t:x=>`乖離月線 ${zp(mv(x.code,'bias20'),1)}`}});


/* ================= 第二批（段二）：重大訊息、財報、股利／填息、估值分位、集保大戶、當沖比 ================= */
let FI=null,DV=null,VH=null,TD=null,DY=null,P2p=null;
const p2load=()=>P2p||(P2p=Promise.all([['fin',v=>FI=v],['futures',v=>FU=v],['div',v=>DV=v],['valhist',v=>VH=v],['tdcc',v=>TD=v],['daytrade',v=>DY=v]].map(([n,f])=>fetch('data/'+n+'.json').then(r=>r.json()).then(f).catch(()=>null))));
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nwSrc='<a href="https://mops.twse.com.tw/mops/web/t05sr01_1" target="_blank" rel="noreferrer">公開資訊觀測站 重大訊息 ↗</a>';
const nwDays=()=>(NW&&NW.days||[]).slice().sort();
function nwRecent(c,n){if(!NW||!NW.items[c])return 0;const D=nwDays();if(!D.length)return 0;
  if(n<=3){const ok=new Set(D.slice(-n));return NW.items[c].filter(r=>ok.has(r[0])).length;}
  const lim=new Date(Date.now()+8*3600e3-n*864e5).toISOString().slice(0,10);return NW.items[c].filter(r=>r[0]>=lim).length;}
const nwTag=c=>{const k=nwRecent(c,3);return k?`<span class="fl nw" title="近 3 個存檔日內有 ${k} 則重大訊息（公開資訊觀測站）">重訊${k>1?'×'+k:''}</span>`:'';};
function newsCard(s){if(!NW)return '';
  const lim=new Date(Date.now()+8*3600e3-30*864e5).toISOString().slice(0,10),L=(NW.items[s.code]||[]).filter(r=>r[0]>=lim).slice().sort((a,b)=>(b[0]+b[1]).localeCompare(a[0]+a[1]));
  const since=nwDays()[0];
  const cover=`<p class="rc-note">涵蓋範圍：官方重大訊息介面只提供「當日」，本站從 ${dfmt(since)} 起每天存檔，因此只含此日之後的公告，較早的請至公開資訊觀測站查詢。來源：${nwSrc}。</p>`;
  if(!L.length)return `<div class="rcard"><div class="rc-head"><h3>重大訊息</h3><span>近 30 日 · 0 則</span></div><p class="rc-note" style="margin:0">本站存檔中，近 30 日沒有 ${esc(s.name)} 的重大訊息。</p>${cover}</div>`;
  return `<div class="rcard"><div class="rc-head"><h3>重大訊息</h3><span>近 30 日 · ${L.length} 則 · 公開資訊觀測站</span></div><div class="nwl">${L.slice(0,8).map(r=>`<div class="nwi"><div class="nwh"><b>${dfmt(r[0])}</b> <small>${esc(r[1]).replace(/^(\d\d)(\d\d)(\d\d)$/,'$1:$2')}</small>${r[3]?`<span class="tag">${esc(r[3])}</span>`:''}</div><div class="nws">${esc(r[2])}</div>${r[5]?`<details><summary>說明摘要</summary><p class="rc-note nwb">${esc(r[5])}${r[4]?`（事實發生日 ${dfmt(r[4])}）`:''}</p></details>`:''}</div>`).join('')}</div>${L.length>8?`<p class="rc-note">另有 ${L.length-8} 則較早的重大訊息未列出。</p>`:''}${cover}</div>`;}
const Q_DL={1:[0,'05-15'],2:[0,'08-14'],3:[0,'11-14'],4:[1,'03-31']};
function finCard(s){if(!FI)return '';const r=FI.items[s.code];
  if(!r||!r.length){return s.etf?'':`<div class="rcard"><div class="rc-head"><h3>財報獲利</h3><span>官方資料 ${dfmt(FI&&FI.asof)}</span></div><p class="rc-note" style="margin:0">官方彙總表（營益分析、綜合損益表）未列入此股。<a href="https://mops.twse.com.tw/mops/web/t163sb04" target="_blank" rel="noreferrer">公開資訊觀測站 ↗</a></p></div>`;}
  const [y,q,rev,gm,om,nm,eps]=r[0],pc=v=>v==null?'—':fmt(v,2)+'<em>%</em>',mk=(a,b)=>b===4?`${a+1}-03-31`:`${a}-${Q_DL[b][1]}`;
  const dl=mk(y,q),nq=q===4?[y+1,1]:[y,q+1],ndl=nq[1]===4?`${nq[0]+1}-03-31`:`${nq[0]}-${Q_DL[nq[1]][1]}`;
  const n4=r.filter((x,i)=>i<4&&x[6]!=null).length,seq=r.slice(0,4).every((x,i)=>i===0||(()=>{const p=r[i-1];return (p[0]*4+p[1])-(x[0]*4+x[1])===1;})());
  const ttm=n4===4&&seq?r.slice(0,4).reduce((a,x)=>a+x[6],0):null;
  return `<div class="rcard"><div class="rc-head"><h3>財報獲利 · ${y} 年第 ${q} 季</h3><span>單季 · 官方彙總表更新 ${dfmt(FI.asof)}</span></div>
  <div class="m4"><div><small>每股盈餘 EPS</small><b class="${cls(eps)}">${eps==null?'—':fmt(eps,2)}<em> 元</em></b><small>單季（基本）</small></div><div><small>毛利率</small><b>${pc(gm)}</b><small>營業毛利 ÷ 營收</small></div><div><small>營益率</small><b class="${cls(om)}">${pc(om)}</b><small>營業利益 ÷ 營收</small></div><div><small>稅後淨利率</small><b class="${cls(nm)}">${pc(nm)}</b><small>營收 ${rev==null?'—':fmt(rev/1e2,2)} 億元</small></div></div>
  <div class="kvl"><span>近四季 EPS 合計</span><b>${ttm!=null?fmt(ttm,2)+' 元':'累積中'}</b><strong>${ttm!=null?'':`已存 ${r.length} 季，滿 4 季起計算`}</strong></div>
  <div class="kvl"><span>財報期別與申報期限</span><b>${y}Q${q} → ${dfmt(dl)}</b><strong>下一期 ${nq[0]}Q${nq[1]} 期限 ${dfmt(ndl)}</strong></div>
  <p class="rc-note">期限為證交法規定的一般公司申報截止日（金融保險等行業期限不同，實際公告日以公開資訊觀測站為準）；官方彙總表不提供個股實際公告日，故這裡不標「公告日」。</p>
  ${r.length>1?`<details><summary>已存檔的各季（${r.length} 季）</summary><table><tr><th>季別</th><th>EPS</th><th>毛利率</th><th>營益率</th><th>淨利率</th><th>營收（億）</th></tr>${r.map(x=>`<tr><td>${x[0]}Q${x[1]}</td><td>${fmt(x[6],2)}</td><td>${fmt(x[3],2)}%</td><td>${fmt(x[4],2)}%</td><td>${fmt(x[5],2)}%</td><td>${x[2]==null?'—':fmt(x[2]/1e2,2)}</td></tr>`).join('')}</table></details>`:''}
  <p class="rc-note sep">${esc(FI.note)} 來源：證交所／櫃買中心 OpenAPI（t187ap17、t187ap06 系列，原始來源為公開資訊觀測站）；已存檔 ${FI.quarters.join('、')}。</p></div>`;}
const cashS=v=>v==null?'—':fmt(v,4).replace(/0+$/,'').replace(/\.$/,'');
function divCard(s){if(!DV)return '';const o=DV.items[s.code];
  if(!o||(!o.h.length&&!o.x.length))return s.etf?'':`<div class="rcard"><div class="rc-head"><h3>股利與填息</h3><span>官方資料 ${dfmt((DV.updated||'').slice(0,10))}</span></div><p class="rc-note" style="margin:0">官方股利分派公告與近 5 個月除權息預告表皆未列入此股。</p></div>`;
  const cnt={};o.h.forEach(h=>cnt[h[0]]=(cnt[h[0]]||0)+1);
  const rows=o.h.slice(0,8).map(h=>{const pr=cnt[h[0]]===1&&h[8]>0&&h[9]>0?h[9]/h[8]*100:null;
    return `<tr><td>${h[0]||'—'} <small>${esc(h[1]||'')}</small></td><td class="num"><b>${cashS(h[3])}</b></td><td class="num">${h[4]?cashS(h[4]):'—'}</td><td class="num">${pr==null?'—':fmt(pr,1)+'%'}</td><td><small>${h[7]?dfmt(h[7]):'—'}${h[5]?' · '+esc(h[5]):''}</small></td></tr>`;}).join('');
  const last=o.h[0],y1=o.h.filter(h=>h[0]===(o.h[0]||[])[0]);
  const fills=(o.x||[]).slice().sort((a,b)=>b.d.localeCompare(a.d));
  const fl=fills.map(e=>`<tr><td>${dfmt(e.d)}</td><td>${esc(e.typ&&isNaN(e.typ)?e.typ:'除息')}</td><td class="num">${fmt(e.p0)}</td><td>${e.fd?`<b class="up">已填息</b> <small>${dfmt(e.fd)} · 第 ${e.days} 個交易日</small>`:`<b class="down">未填息</b> <small>收盤 ${fmt(e.last)} 仍較除權息前收盤低 ${fmt(e.gap,1)}% · 已 ${e.days} 個交易日</small>`}</td></tr>`).join('');
  return `<div class="rcard"><div class="rc-head"><h3>股利與填息</h3><span>官方股利公告 · 填息對照本站歷史收盤</span></div>
  ${o.h.length?`<div class="kvl"><span>最近一筆（${last[0]} ${esc(last[1]||'')}）</span><b>現金 ${cashS(last[3])} 元${last[4]?` ＋ 股票 ${cashS(last[4])} 元`:''}</b><strong>${last[7]?'董事會 '+dfmt(last[7]):''}</strong></div>
  <details open><summary>股利歷史（${o.h.length} 筆）</summary><table><tr><th>年度／期別</th><th>現金（元/股）</th><th>股票（元/股）</th><th>配息率</th><th>董事會／進度</th></tr>${rows}</table>
  <p class="rc-note">配息率＝該筆公告的現金股利總額 ÷ 公告列載的本期淨利；只對「該年度僅一筆」的公司計算（季配息或半年配的公司公告淨利口徑不一，不硬算）、淨利為負則不計，故多筆者顯示 —。股票股利以「元/股」計（面額 10 元，1 元＝每千股配 100 股）。</p></details>`:`<p class="rc-note" style="margin:0">官方股利分派公告未列入此證券（${s.etf?'ETF 配息請見投信公告':'可能尚未公告'}）。</p>`}
  ${fills.length?`<div class="rc-head sub"><h3>填息紀錄 · 近 5 個月</h3><span>填息＝收盤價 ≥ 除權息前一日收盤</span></div><table class="fillt"><tr><th>除權息日</th><th>類別</th><th>除權息前收盤</th><th>結果</th></tr>${fl}</table>`:`<p class="rc-note">近 5 個月內此股沒有除權息紀錄（或無對應歷史收盤，無法比對）。</p>`}
  <p class="rc-note sep">${esc(DV.note)} 來源：證交所 t187ap45_L／TWT49U、櫃買中心 mopsfin_t187ap39_O／exDailyQ。這些是歷史紀錄，不代表未來配息或填息。</p></div>`;}
function valCard(s){if(!VH)return '';const o=VH.items[s.code];if(!o||(!o.pe&&!o.pb&&!o.yd))return '';
  const N=VH.minN,days=VH.days,rng=`${dfmt(days[0])}–${dfmt(days.at(-1))}`;
  const cell=(t,x,u,d)=>{if(!x||x.cur==null)return `<div><small>${t}</small><b>—</b><small>官方當日未列${x?`（有效 ${x.n} 日）`:''}</small></div>`;
    const ok=x.n>=N;return `<div><small>${t}</small><b>${ok?fmt(x.pct,0)+'<em>%</em>':'—'}</b><small>${ok?'歷史分位':`資料不足（有效 ${x.n} 日，需 ${N} 日）`}</small><small>現值 ${fmt(x.cur,d)}${u}${ok?` · 區間 ${fmt(x.lo,d)}–${fmt(x.hi,d)}`:''}</small></div>`;};
  const sp=o.s&&o.s[0]&&o.s[0].filter(v=>v!=null).length>=2?`<div class="sparks"><div><h5>本益比走勢（倍）</h5>${spark(o.s[0],days,v=>fmt(v,1),'#4a63c9')}</div><div><h5>股價淨值比走勢（倍）</h5>${spark(o.s[2],days,v=>fmt(v,2),'#8a6bc4')}</div></div>`:'';
  return `<div class="rcard"><div class="rc-head"><h3>估值歷史分位</h3><span>${rng} · ${days.length} 個交易日</span></div>
  <div class="m4 m3">${cell('本益比分位',o.pe,' 倍',2)}${cell('殖利率分位',o.yd,'%',2)}${cell('股價淨值比分位',o.pb,' 倍',2)}</div>${sp}
  <p class="rc-note">分位是目前估值在自身近期歷史中的相對位置，不是買賣建議。${esc(VH.note)}</p>
  <p class="rc-note">來源：<a href="${VH.sources.twse}" target="_blank" rel="noreferrer">證交所 BWIBBU_d ↗</a>、<a href="${VH.sources.tpex}" target="_blank" rel="noreferrer">櫃買中心 本益比日報 ↗</a>（官方計算值）。</p></div>`;}
function tdccCard(s){if(!TD)return '';const r=TD.items[s.code];if(!r)return s.etf?'':`<div class="rcard"><div class="rc-head"><h3>集保大戶持股分級</h3><span>${dfmt(TD&&TD.date)}</span></div><p class="rc-note" style="margin:0">集保股權分散表未列入此證券。</p></div>`;
  const tr=TD.trend[s.code]||[],prev=tr.length>1?tr[tr.length-2]:null,dd=(i,a,b)=>prev?` <small class="${cls(a-b)}">較上週 ${sgn(a-b,2)}</small>`:'',pn=prev?prev.slice(1):null;
  const m=(t,v,i,u)=>`<div><small>${t}</small><b>${fmt(v,2)}<em>%</em></b>${pn?`<small class="${cls(v-pn[i])}">較 ${dfmt(prev[0])} ${sgn(v-pn[i],2)} 個百分點</small>`:`<small>${u}</small>`}</div>`;
  const dist=r[6],mx=Math.max(...dist);
  return `<div class="rcard"><div class="rc-head"><h3>集保大戶持股分級</h3><span>集保戶股權分散表 · 資料日 ${dfmt(TD.date)}（每週）</span></div>
  <div class="m4">${m('大戶持股比',r[0],0,'持股 ≥ 400 張')}${m('千張大戶持股比',r[1],1,`${fmt(r[5],0)} 人`)}${m('散戶持股比',r[2],2,'持股 ≤ 10 張')}<div><small>集保股東人數</small><b>${fmt(r[3],0)}<em> 人</em></b>${pn?`<small class="${cls(r[3]-pn[3])}">較上週 ${sgn(r[3]-pn[3],0)} 人</small>`:`<small>大戶 ${fmt(r[4],0)} 人</small>`}</div></div>
  ${pn?'':`<p class="rc-note">週變化：累積中。官方開放資料只提供最新一週，本站從 ${dfmt(TD.weeks[0])} 起每週存檔（目前 ${TD.weeks.length} 週），下週起顯示增減。</p>`}
  <details><summary>15 級持股分級明細</summary><table class="tdt"><tr><th>持股（股）</th><th>人數</th><th>占集保庫存</th><th></th></tr>${dist.map((v,i)=>`<tr><td>${TD.levels[i]}</td><td class="num">${fmt(r[7][i],0)}</td><td class="num">${fmt(v,2)}%</td><td class="bcell"><i style="width:${mx?v/mx*100:0}%"></i></td></tr>`).join('')}</table></details>
  <p class="rc-note sep">${esc(TD.note)} 來源：${esc(TD.source)}。大戶比高低只描述股權集中程度，不代表漲跌。</p></div>`;}
function dyCard(s){if(!DY)return '';const r=DY.items[s.code],days=DY.days,T='個股當沖比';
  if(!r)return `<div class="rcard dtc"><div class="rc-head"><h3>${T}</h3><span>近 ${days.length} 日</span></div><p class="rc-note" style="margin:0">官方當日沖銷統計近 ${days.length} 個交易日都沒有列入此股，視為沒有當沖成交。</p></div>`;
  const v=r.map(x=>x==null?0:x),last=v.at(-1),a5=v.slice(-5).reduce((a,b)=>a+b,0)/Math.min(5,v.length),a20=v.reduce((a,b)=>a+b,0)/v.length,mxI=v.indexOf(Math.max(...v)),df=last-a20,N=days.length;
  const jd=r.at(-1)==null?`${s.name}最新一日官方沒有列入當沖成交，視為沒有當沖；近 ${N} 日平均 ${fmt(a20,1)}%。`:df>=2?`${s.name}當沖比 ${fmt(last,1)}%，<b class="up">高於</b>近 ${N} 日平均 ${fmt(a20,1)}% 達 ${fmt(df,1)} 個百分點，短線換手偏熱。`:df<=-2?`${s.name}當沖比 ${fmt(last,1)}%，<b class="down">低於</b>近 ${N} 日平均 ${fmt(a20,1)}% 達 ${fmt(-df,1)} 個百分點，偏平穩。`:`${s.name}當沖比 ${fmt(last,1)}%，和近 ${N} 日平均 ${fmt(a20,1)}% 差不多，短線換手沒有明顯變熱。`;
  return `<div class="rcard dtc"><div class="rc-head"><h3>${T}</h3><span>${s.name} 自己的數字，不是全市場 · ${dfmt(days[0])}–${dfmt(days.at(-1))}</span></div>
  <p class="dyj">${jd}</p>
  <div class="m4 m3"><div><small>最新（${dmd(days.at(-1))}）</small><b>${r.at(-1)==null?'—':fmt(last,1)+'<em>%</em>'}</b><small>當天當沖占成交量</small></div><div><small>近 5 日平均</small><b>${fmt(a5,1)}<em>%</em></b></div><div><small>近 ${N} 日平均</small><b>${fmt(a20,1)}<em>%</em></b><small>最高 ${fmt(v[mxI],1)}%（${dmd(days[mxI])}）</small></div></div>
  <div class="sparks"><div><h5>${s.name} 當沖比走勢（%）</h5>${spark(v,days,x=>fmt(x,1)+'%','#c26a1c')}</div></div>
  <p class="rc-note sep">證交所 TWTB4U、櫃買中心；±2 個百分點為界，非買賣建議。</p></div>`;}


/* ================= 綜合判讀：判讀（結論與理由；全由站內既有指標以規則產生，沒資料的項目整行不顯示） ================= */
function verdictRows(s,H,C,E){
  const D={},close=s.close,sg0=v=>v>0?1:v<0?-1:0;
  // 走勢
  if(H&&H.rows.length>=20&&H.ma5!=null&&H.ma20!=null){
    const m5=H.ma5,m20=H.ma20,m60=H.ma60,b20=(close/m20-1)*100,above=close>m20,hot=b20>=10;
    const bull=m60!=null?(m5>m20&&m20>m60):m5>m20,bear=m60!=null?(m5<m20&&m20<m60):m5<m20;
    let sc,sh,tx;
    if(above&&bull){sc=hot?0:1;sh=hot?'趨勢偏多但短線過熱':'趨勢偏多';tx=hot?'趨勢偏多但短線過熱，乖離月線過大，宜等拉回、不宜追價。':'趨勢偏多，站穩月線之上且均線多頭排列。';}
    else if(above){sc=0;sh='趨勢待確認';tx=hot?'站上月線但均線尚未多頭排列，且短線過熱，趨勢待確認。':'站上月線，但均線尚未多頭排列，趨勢待確認。';}
    else if(bear){sc=-1;sh='趨勢偏空';tx='趨勢偏空，收盤在月線之下且均線空頭排列。';}
    else{sc=-1;sh='跌破月線';tx='收盤在月線之下，短線轉弱，要等重新站回月線。';}
    D.trend=['走勢',tx,sc,sh];
  }
  // 價位
  if(H&&H.levels){
    const o=rrCalc(H,H.levels,close);
    if(o.err)D.price=['價位','支撐帶尚未形成或資料不足，無法評估進場觀察區與風險報酬比。',0,null];
    else{const {s1,r1}=o,st=bandState(s1,'s',close),dS=(close/s1.high-1)*100,dR=r1?(r1.low/close-1)*100:null;
      let sc=0,sh=null,tx;
      if(o.state==='bad'){sc=-1;sh='支撐失守';tx='已跌破停損參考價，支撐結構失守，進場觀察區不成立。';}
      else if(o.state==='warn'){sc=-1;sh='支撐轉弱';tx='收盤已落到支撐帶之下，結構轉弱。';}
      else{
        const loc=st.k==='in'?'正在測試支撐帶':dS<=3?'貼近支撐、進場觀察區成立':(dR!=null&&dR<=2)?'逼近壓力帶，上檔空間有限':dS>=10?'離支撐已遠，追價的下檔風險較大':'位於支撐與壓力之間，離進場觀察區還有距離';
        const rr=o.rr==null?'':o.rr>=2?`，風險報酬比佳（約 1:${fmt(o.rr,1)}）`:o.rr<1?'，風險報酬比偏差（報酬小於風險）':'，風險報酬比普通';
        tx=loc+rr+'。';
        if(o.rr!=null&&o.rr>=2&&dS<=3){sc=1;sh='價位具風險報酬優勢';}else if(o.rr!=null&&o.rr<1){sc=-1;sh='風險報酬不佳';}
      }
      D.price=['價位',tx,sc,sh];}
  }
  // 籌碼
  {const cs=CS&&CS.items[s.code],i=cs&&cs.i,c=cs&&cs.c,pos=[],neg=[],note=[];let sc=0;
   if(i){const fs=i[0],f20=i[4];
     if(fs!=null&&f20!=null){if(fs>=3||(fs>0&&f20>0)){pos.push(fs>=3?'外資連買':'外資買超');sc+=1;}else if(fs<=-3||(fs<0&&f20<0)){neg.push(fs<=-3?'外資連賣':'外資賣超');sc-=1;}else note.push('外資買賣分歧');}
     if(i[1]!=null&&Math.abs(i[1])>=3){if(i[1]>0){pos.push('投信連買');sc+=1;}else{neg.push('投信連賣');sc-=1;}}}
   if(c&&c[4]!=null&&c[4]>=50)note.push('融資使用偏高、籌碼較浮動');
   if(E&&!s.etf){E._G=E._G||etfAgg(E);const a=E._G.A[s.code];
     if(a&&a.n){const f=fgnLast(C,s.code);
       if(f&&f.v!==0&&a.d!==0&&a.d*f.v<0)note.push(`ETF 合計${a.d>0?'加碼':'減碼'}但外資${f.v>0?'買超':'賣超'}（方向相反）`);
       else if(a.d>0){pos.push('ETF 合計加碼');sc+=1;}else if(a.d<0){neg.push('ETF 合計減碼');sc-=1;}}}
   const td=TD&&TD.items[s.code];
   if(td){const tr=TD.trend[s.code]||[],pv=tr.length>1?tr[tr.length-2]:null;if(pv){const d=td[0]-pv[1];if(d>=0.3){pos.push('大戶持股比上升');sc+=1;}else if(d<=-0.3){neg.push('大戶持股比下降');sc-=1;}}}
   if(pos.length||neg.length||note.length){
     const lab=sc>0?'偏多':sc<0?'偏空':'分歧';
     D.chips=['籌碼',`籌碼${lab}：${[...pos,...neg,...note].join('、')}。`,Math.max(-1,Math.min(1,sc)),sc>0?'籌碼偏多':sc<0?'籌碼偏空':null];}}
  // 基本面（ETF 不適用）
  if(!s.etf){const pos=[],neg=[],note=[];let sc=0;
   const rv=RV&&RV.items[s.code],rl=rv&&rv.length&&rv[rv.length-1];
   if(rl&&rl[2]!=null){if(rl[2]>=10){pos.push(`營收年增（約 ${rl[2]>0?'+':''}${fmt(rl[2],0)}%）`);sc+=1;}else if(rl[2]<=-10){neg.push(`營收年減（約 ${fmt(rl[2],0)}%）`);sc-=1;}else note.push('營收與去年持平');}
   const fi=FI&&FI.items[s.code]&&FI.items[s.code][0];
   if(fi&&fi[6]!=null){if(fi[6]>0)pos.push('單季獲利');else{neg.push('單季虧損');sc-=1;}}
   const vh=VH&&VH.items[s.code],vs=vh&&[['本益比',vh.pe],['股價淨值比',vh.pb]].find(([,x])=>x&&x.cur!=null&&x.n>=VH.minN);
   if(vs){const p=vs[1].pct;if(p>=80)note.push(`${vs[0]}處近期高檔`);else if(p<=20)note.push(`${vs[0]}處近期低檔`);else note.push('估值居中');}
   if(pos.length||neg.length||note.length){
     const lab=sc>0?'偏強':sc<0?'偏弱':'持平',txt=(sc<0?[...neg,...pos]:[...pos,...neg]).join('、'),nt=note.join('、');
     D.fund=['基本面',`基本面${lab}${txt?'：'+txt:''}${nt?(txt?'，':'：')+nt:''}。`,Math.max(-1,Math.min(1,sc)),sc>0?'基本面偏強':sc<0?'基本面偏弱':null];}}
  // 風險
  {const P=[],chk=[];let warn=false;
   if(FL){chk.push('交易限制');const t=flTags(s.code);if(t.length){warn=true;P.push(`有交易限制（${t.map(x=>x[1]).join('、')}）`);}}
   const a=SC&&SC.items[s.code];
   if(a){chk.push('技術風險');const names=Object.fromEntries(SC.defs.risk.map(r=>[r.id,r.name])),w=a.risk.filter(r=>r.warn).map(r=>names[r.id]);if(w.length){warn=true;P.push(`技術面出現${w.join('、')}警示`);}}
   if(H){chk.push('價格異常');const g=H.gaps,sus=g&&g.ev?g.ev.filter(e=>e.kind!=='ex'):[];
     if(sus.length){warn=true;P.push('價格有疑似未還原的異常日，均線與價位可能失真');}
     if(H.rows.length<60)P.push('歷史資料不足 60 日，MA60 不可用');}
   else P.push('尚無歷史價量，走勢與價位無法判讀（資料不足）');
   const dy=DY&&DY.items[s.code];
   if(dy&&dy.at(-1)!=null){const v=dy.map(x=>x==null?0:x),a20=v.reduce((p,q)=>p+q,0)/v.length;if(v.at(-1)-a20>=2){warn=true;P.push('當沖比高於自身平均，短線換手偏熱');}}
   if(P.length)D.risk=['風險',P.join('；')+'。',0,null,warn];
   else if(chk.length)D.risk=['風險',`未偵測到${chk.join('、')}警示。`,0,null,false];}
  const rows=['trend','price','chips','fund','risk'].filter(k=>D[k]).map(k=>D[k]);
  if(!rows.length)return '';
  // 總結論
  const dims=['trend','price','chips','fund'].filter(k=>D[k]&&D[k][2]!==undefined),tot=dims.reduce((a,k)=>a+D[k][2],0);
  const pos=dims.filter(k=>D[k][2]>0&&D[k][3]).map(k=>D[k][3]),neg=dims.filter(k=>D[k][2]<0&&D[k][3]).map(k=>D[k][3]);
  if(D.trend&&D.trend[3]==='趨勢偏多但短線過熱')neg.push('短線過熱');
  const dir=dims.length<2?'中性':tot>=2?'偏多':tot<=-2?'偏空':'中性';
  let sum;
  if(dims.length<2)sum='可判讀的項目不足，暫不下結論。';
  else if(dir==='偏多')sum=`整體偏多，主因：${pos.join('、')}${neg.length?`；但${neg.join('、')}`:''}。`;
  else if(dir==='偏空')sum=`整體偏空，主因：${neg.join('、')}${pos.length?`；僅${pos.join('、')}較有支撐`:''}。`;
  else sum=pos.length&&neg.length?`整體中性、多空互見：${pos.join('、')}，但${neg.join('、')}。`:pos.length||neg.length?`整體中性：${(pos.length?pos:neg).join('、')}，其餘項目沒有明顯方向。`:'整體中性，沒有明顯的多空訊號。';
  if(D.risk&&D.risk[4])sum+='另有風險提醒，見下方。';
  return `<div class="vjd"><div class="vsum"><b class="vdir ${dir==='偏多'?'up':dir==='偏空'?'down':''}">${dir}</b><span>${sum}</span></div><div class="vrows">${rows.map(([t,h,,,w])=>`<div class="vrow ${t==='風險'?(w?'bad':'ok'):''}"><span class="vtag">${t}</span><span class="vtx">${h}</span></div>`).join('')}</div><p class="vsm">依站內指標自動產生的資料判讀，僅描述資料，非買賣建議。</p></div>`;
}


/* ================= 第三批：盤前總覽（大盤、台指期夜盤日盤、美股／國際期貨、匯率美債、事件行事曆）與美股連動對照 ================= */
let MK=null,FU=null,MC=null,MCAL=null;
['market','futures','macro','macro_calendar'].forEach(n=>fetch('data/'+n+'.json').then(r=>r.json()).then(v=>{({market:()=>MK=v,futures:()=>FU=v,macro:()=>MC=v,macro_calendar:()=>MCAL=v})[n]();if(view==='mkt')mktPage();if(sel)try{pick(sel)}catch(e){}}).catch(()=>{}));
const ppc=(chg,close)=>chg==null||close==null||!(close-chg)?null:chg/(close-chg)*100;
const ycls=v=>v>0?'up':v<0?'down':'flat';
const fuS=(c,k)=>FU&&FU.items&&FU.items[c]&&FU.items[c][k];
const fuTag=(c,k)=>{const r=fuS(c,k);return r?`<b class="${ycls(r.pct)}">${zp(r.pct,2)}</b>`:'<small>無資料</small>';};
const fuTime=()=>FU?`期交所交易日 ${dfmt(FU.date)}，本站抓取 ${(FU.updated||'').replace('T',' ').slice(5,16)}（台北）`:'';
function usBlock(ths,inStock){
  const codes=[...new Set(ths.flatMap(t=>t.us||[]))];if(!codes.length)return '';
  const names=[...new Set(ths.filter(t=>t.usn).map(t=>t.usn))].join('；');
  if(!FU)return `<p class="rc-note usl"><b>美股連動（站內整理）：</b>期交所期貨資料載入失敗，無資料。</p>`;
  const rows=codes.map(c=>{const n=fuS(c,'night'),d=fuS(c,'day');return `<span class="usi"><b>${FU.names[c].replace('美國','').replace('期貨','')}期貨</b> 夜盤 ${fuTag(c,'night')}${n?' <small>'+dmd(n.d)+'</small>':''}・日盤 ${fuTag(c,'day')}${d?' <small>'+dmd(d.d)+'</small>':''}</span>`;}).join('');
  return `<div class="usl"><div class="usl-h"><b>美股連動對照</b><small>對應關係為站內整理</small></div><div class="usl-b">${rows}</div>
   ${names?`<div class="usl-n">對應美股個股：${names}　<small>無資料（沒有可穩定免費取得且條款允許的來源）</small></div>`:''}
   <p class="rc-note">資料為期交所掛牌之美股指數期貨（${fuTime()}），成交清淡、與美股現貨指數有基差，是參考資料，不是美股收盤價；夜盤＝盤後交易時段。連動只是方向參考，不代表台股必然跟隨。</p></div>`;}
const tile=(lab,val,sub,cl,src)=>`<div class="mkt"><small>${lab}</small><b class="${cl||''}">${val}</b><small>${sub||''}</small>${src?`<em>${src}</em>`:''}</div>`;
const lastTwo=a=>a.length>=2?[a[a.length-1],a[a.length-2]]:[a[a.length-1],null];
function mktPage(){
  const box=$('#detail');if(!MK&&!FU&&!MC){box.innerHTML='<div class="empty">正在載入盤前資料…（若持續空白代表資料暫時無法取得）</div>';return;}
  const tw=MK&&MK.twse.length?lastTwo(MK.twse):[null,null],tp=MK&&MK.tpex.length?lastTwo(MK.tpex):[null,null];
  const bt=MK&&MK.breadth.twse&&Object.values(MK.breadth.twse).slice(-1)[0],bp=MK&&MK.breadth.tpex&&Object.values(MK.breadth.tpex).slice(-1)[0];
  const ust=MC&&MC.ust,fx=MC&&MC.fx,la=a=>a&&a.length?a[a.length-1]:null,lb=a=>a&&a.length>1?a[a.length-2]:null;
  const idxT=(lab,r,src)=>r[0]?tile(lab,fmt(r[0].close,2),`<span class="${ycls(r[0].chg)}">${sgn(r[0].chg,2)}（${zp(ppc(r[0].chg,r[0].close),2)}）</span>`,'',`${dfmt(r[0].d)} · ${src}`):tile(lab,'無資料','','', '');
  const val=(r,k)=>r[0]?fmt(r[0][k]/1e8,0):'—';
  const T=[idxT('加權指數',tw,'證交所'),idxT('櫃買指數',tp,'櫃買中心'),
   tile('成交值（上市／上櫃）',tw[0]?`${val(tw,'val')}<em> 億</em>`:'無資料',tp[0]?`上櫃 ${val(tp,'val')} 億`:'',tw[1]&&tw[0]?'':'', tw[0]?`${dfmt(tw[0].d)} · 證交所／櫃買`:''),
   tile('漲跌家數（股票）',bt?`<span class="up">${bt.stk.up[0]}</span> / <span class="down">${bt.stk.dn[0]}</span>`:'無資料',bt?`上櫃 <span class="up">${bp?bp.up[0]:'—'}</span> / <span class="down">${bp?bp.dn[0]:'—'}</span>`:'',bt?'':'',bt?`${dfmt(bt.d)} · 證交所／櫃買`:''),
   tile('台指期 夜盤',FU&&fuS('TX','night')?`${fmt(fuS('TX','night').c,0)}`:'無資料',FU&&fuS('TX','night')?`<span class="${ycls(fuS('TX','night').pct)}">${sgn(fuS('TX','night').chg,0)}（${zp(fuS('TX','night').pct,2)}）</span>`:'','',FU&&fuS('TX','night')?`交易日 ${dfmt(fuS('TX','night').d)} · 期交所`:''),
   tile('台指期 日盤',FU&&fuS('TX','day')?`${fmt(fuS('TX','day').c,0)}`:'無資料',FU&&fuS('TX','day')?`<span class="${ycls(fuS('TX','day').pct)}">${sgn(fuS('TX','day').chg,0)}（${zp(fuS('TX','day').pct,2)}）</span>`:'','',FU&&fuS('TX','day')?`${dfmt(fuS('TX','day').d)} · 期交所`:''),
   tile('費半期貨 夜盤',FU&&fuS('SOF','night')?`<span class="${ycls(fuS('SOF','night').pct)}">${zp(fuS('SOF','night').pct,2)}</span>`:'無資料',FU&&fuS('SOF','night')?`那指100期 <span class="${ycls((fuS('UNF','night')||{}).pct)}">${fuS('UNF','night')?zp(fuS('UNF','night').pct,2):'無資料'}</span>`:'','',FU?`參考 · 期交所 ${dfmt(FU.date)}`:''),
   tile('美元兌新台幣',fx?fmt(la(fx.ntd),3):'無資料',fx&&lb(fx.ntd)!=null?`<span class="${ycls(la(fx.ntd)-lb(fx.ntd))}">${sgn(la(fx.ntd)-lb(fx.ntd),3)}</span>（升＝台幣貶）`:'','',fx?`${dfmt(la(fx.days))} · 期交所參考匯率`:'')];
  if(ust)T.push(tile('美債 10 年期殖利率',`${fmt(la(ust.y10),2)}<em>%</em>`,lb(ust.y10)!=null?`<span class="${ycls(la(ust.y10)-lb(ust.y10))}">${sgn((la(ust.y10)-lb(ust.y10))*100,0)} bp</span>　2年 ${fmt(la(ust.y2),2)}%`:'','',`${dfmt(la(ust.days))} · 美國財政部`));
  else T.push(tile('美債 10 年期殖利率','無資料','','',''));
  let h=`<div class="eyebrow">PRE-MARKET <span>官方資料為主 · 美股與國際為參考</span></div>${grp('盤前一眼重點','台股收盤、台指期、美股指數期貨、匯率與美債；每格標示資料日與來源')}
  <div class="rcard"><div class="mkts">${T.join('')}</div><p class="rc-note">資料更新：${MK?`大盤 ${(MK.updated||'').replace('T',' ').slice(5,16)}`:''}${FU?`；期貨 ${(FU.updated||'').replace('T',' ').slice(5,16)}`:''}${MC?`；匯率與美債 ${(MC.updated||'').replace('T',' ').slice(5,16)}`:''}（台北時間）。任何一格取不到都顯示「無資料」，不補值。以下為各項明細。</p></div>`;
  // 台股大盤
  if(MK){const W=MK.twse,P=MK.tpex,d1=W.map(x=>x.d),d2=P.map(x=>x.d);
   const rows=W.slice().reverse().slice(0,10).map(x=>{const p=P.find(y=>y.d===x.d);return `<tr><td>${dfmt(x.d)}</td><td class="num">${fmt(x.close,2)}</td><td class="num ${ycls(x.chg)}">${sgn(x.chg,2)}</td><td class="num">${fmt(x.val/1e8,0)}</td><td class="num">${fmt(x.vol/1e8,1)}</td><td class="num">${p?fmt(p.close,2):'—'}</td><td class="num">${p?fmt(p.val/1e8,0):'—'}</td></tr>`;}).join('');
   const bk=(lab,b,mkt)=>{if(!b)return `<div class="brk"><b>${lab}</b><small>無資料</small></div>`;const up=b.up[0],dn=b.dn[0],fl=b.flat,t=up+dn+fl||1;
     return `<div class="brk"><div class="brh"><b>${lab}</b><small>${dfmt(b.d)}</small></div><div class="brbar"><i class="u" style="width:${up/t*100}%"></i><i class="f" style="width:${fl/t*100}%"></i><i class="d" style="width:${dn/t*100}%"></i></div>
      <div class="brn"><span class="up">上漲 ${fmt(up,0)}${b.up[1]?`（漲停 ${b.up[1]}）`:''}</span><span>持平 ${fmt(fl,0)}</span><span class="down">下跌 ${fmt(dn,0)}${b.dn[1]?`（跌停 ${b.dn[1]}）`:''}</span></div><small>未成交 ${fmt(b.none,0)}</small></div>`;};
   const nb=Object.keys(MK.breadth.twse||{}).length;
   h+=`${grp('台股大盤','加權與櫃買指數、成交量值、漲跌家數（證交所、櫃買中心官方資料）')}
   <div class="rcard"><div class="rc-head"><h3>指數走勢 · 近 ${W.length} 個交易日</h3><span>${dfmt(MK.asof.twse)} · 證交所 FMTQIK／櫃買中心</span></div>
   <div class="sparks"><div><h5>加權指數</h5>${spark(W.map(x=>x.close),d1,v=>fmt(v,0),'#4a63c9')}</div><div><h5>櫃買指數</h5>${spark(P.map(x=>x.close),d2,v=>fmt(v,2),'#8a6bc4')}</div>
   <div><h5>上市成交值（億元）</h5>${spark(W.map(x=>x.val/1e8),d1,v=>fmt(v,0),'#c26a1c')}</div><div><h5>上櫃成交值（億元）</h5>${spark(P.map(x=>x.val/1e8),d2,v=>fmt(v,0),'#2c9a6f')}</div></div>
   <details><summary>近 10 日逐日明細</summary><div class="tablewrap"><table class="ov mkov"><tr><th>日期</th><th>加權收盤</th><th>漲跌點</th><th>上市成交值（億）</th><th>成交量（億股）</th><th>櫃買指數</th><th>上櫃成交值（億）</th></tr>${rows}</table></div></details>
   <p class="rc-note">${esc(MK.note)}</p></div>
   <div class="rcard"><div class="rc-head"><h3>漲跌家數</h3><span>證交所「漲跌證券數合計」・櫃買中心上櫃股票市場現況</span></div><div class="brks">${bk('上市股票',bt&&{d:bt.d,up:bt.stk.up,dn:bt.stk.dn,flat:bt.stk.flat,none:bt.stk.none})}${bk('上櫃股票',bp)}</div>
   ${bt?`<p class="rc-note">上市含權證等全證券的整體市場為 上漲 ${fmt(bt.mkt.up[0],0)}／下跌 ${fmt(bt.mkt.dn[0],0)}；此處以「股票」欄為準。漲跌家數官方只給當日，本站已累積 ${nb} 日，累積足夠後再顯示走勢。</p>`:''}</div>`;}
  // 台指期
  if(FU){const tx=FU.items.TX,hx=(FU.hist||{}).TX||[];
   const ro=(lab,r)=>r?`<tr><td><b>${lab}</b></td><td>${dfmt(r.d)}</td><td class="num">${fmt(r.o,0)}</td><td class="num">${fmt(r.h,0)}</td><td class="num">${fmt(r.l,0)}</td><td class="num"><b>${fmt(r.c,0)}</b></td><td class="num ${ycls(r.chg)}">${sgn(r.chg,0)}（${zp(r.pct,2)}）</td><td class="num">${fmt(r.v,0)}</td><td class="num">${r.oi==null?'—':fmt(r.oi,0)}</td></tr>`:`<tr><td><b>${lab}</b></td><td colspan="8"><small>無資料</small></td></tr>`;
   h+=`${grp('台指期夜盤與日盤','期交所臺股期貨近月契約；夜盤＝盤後交易時段、日盤＝一般交易時段')}
   <div class="rcard"><div class="rc-head"><h3>臺股期貨 近月 ${tx?tx.m:''}</h3><span>${fuTime()}</span></div>
   ${tx?`<div class="tablewrap"><table class="ov mkov"><tr><th>時段</th><th>交易日</th><th>開</th><th>高</th><th>低</th><th>收</th><th>漲跌（點／%）</th><th>成交量（口）</th><th>未平倉</th></tr>${ro('夜盤（盤後）',tx.night)}${ro('日盤（一般）',tx.day)}</table></div>
   ${hx.length>=3?`<div class="sparks"><div><h5>日盤收盤走勢</h5>${spark(hx.map(r=>r[1]),hx.map(r=>r[0]),v=>fmt(v,0),'#4a63c9')}</div><div><h5>夜盤收盤走勢</h5>${spark(hx.map(r=>r[2]),hx.map(r=>r[0]),v=>fmt(v,0),'#c26a1c')}</div></div>`:`<p class="rc-note">走勢：累積中（官方只給最新交易日，本站已存 ${hx.length} 日，滿 3 日起顯示）。</p>`}`:'<p class="rc-note">無資料。</p>'}
   <p class="rc-note">夜盤為前一日 15:00 至當日 05:00，屬同一交易日、在日盤之前；未平倉量夜盤不提供。來源：<a href="${FU.source}" target="_blank" rel="noreferrer">期交所 OpenAPI 期貨每日交易行情 ↗</a>。</p></div>`;
   // 美股與國際
   const ord=['UDF','SPF','UNF','SOF','TJF','GDF','BRF'];
   const rw=c=>{const r=FU.items[c];if(!r)return `<tr><td><b>${FU.names[c]}</b></td><td colspan="5"><small>無資料</small></td></tr>`;return `<tr><td><b>${FU.names[c]}</b><small>近月 ${r.m}</small></td><td class="num">${r.night?fmt(r.night.c,r.night.c>1000?0:2):'—'}</td><td class="num">${fuTag(c,'night')}</td><td class="num">${r.day?fmt(r.day.c,r.day.c>1000?0:2):'—'}</td><td class="num">${fuTag(c,'day')}</td><td class="num"><small>${r.night?fmt(r.night.v,0):'—'} / ${r.day?fmt(r.day.v,0):'—'}</small></td></tr>`;};
   const nd=(lab,why)=>`<tr class="nodata"><td colspan="6"><b>${lab}</b><small>無資料 — ${why}</small></td></tr>`;
   h+=`${grp('美股與國際（參考資料）','期交所掛牌的美股指數期貨、東證、黃金與布蘭特原油期貨；個股與日韓指數無可用來源')}
   <div class="rcard"><div class="rc-head"><h3>期交所掛牌的國際期貨</h3><span>${fuTime()}</span></div>
   <div class="tablewrap"><table class="ov mkov mkintl"><tr><th>商品</th><th>夜盤收</th><th>夜盤漲跌</th><th>日盤收</th><th>日盤漲跌</th><th>量（夜／日）</th></tr>${ord.map(rw).join('')}
   ${nd('台積電 ADR（TSM）、美股個股（MU、NVDA、AMD…）','沒有可穩定免費取得且條款允許的來源')}${nd('日經 225、韓國 KOSPI','同上（東證期貨為日本參考）')}</table></div>
   <p class="rc-note">這些是期交所掛牌商品（反映美股盤勢），成交清淡、與現貨指數有基差，是<b>參考資料</b>，不是美股收盤指數。美股個股與日韓指數：Yahoo 禁止程式抓取、Stooq 需瀏覽器驗證，本站不繞過，因此顯示無資料。黃金／布蘭特期貨為期交所報價，單位依契約規格。來源：<a href="${FU.source}" target="_blank" rel="noreferrer">期交所 OpenAPI ↗</a>；${FU.note.split('。').slice(0,2).join('。')}。</p></div>`;}
  // 匯率與美債
  if(MC){const cb=MC.cbc;
   h+=`${grp('匯率與利率','美元兌新台幣、日圓（期交所參考匯率）、韓元（央行）、美國公債殖利率（美國財政部）')}`;
   if(fx)h+=`<div class="rcard"><div class="rc-head"><h3>匯率</h3><span>${dfmt(la(fx.days))} · 期交所每日外幣參考匯率</span></div><div class="m4 m3"><div><small>美元兌新台幣</small><b>${fmt(la(fx.ntd),3)}</b><small class="${ycls(la(fx.ntd)-lb(fx.ntd))}">較前日 ${sgn(la(fx.ntd)-lb(fx.ntd),3)}　${la(fx.ntd)>lb(fx.ntd)?'台幣貶':'台幣升'}</small></div><div><small>美元兌日圓</small><b>${fmt(la(fx.jpy),2)}</b><small class="${ycls(la(fx.jpy)-lb(fx.jpy))}">較前日 ${sgn(la(fx.jpy)-lb(fx.jpy),2)}</small></div><div><small>美元兌人民幣</small><b>${fmt(la(fx.cny),4)}</b><small class="${ycls(la(fx.cny)-lb(fx.cny))}">較前日 ${sgn(la(fx.cny)-lb(fx.cny),4)}</small></div></div>
    <div class="sparks"><div><h5>美元兌新台幣（近 ${fx.days.length} 日）</h5>${spark(fx.ntd,fx.days,v=>fmt(v,3),'#4a63c9')}</div><div><h5>美元兌日圓</h5>${spark(fx.jpy,fx.days,v=>fmt(v,2),'#c26a1c')}</div></div>
    ${cb?`<p class="rc-note">中央銀行 BP01D01（日資料，台灣 16:00 銀行間即期）：資料至 ${dfmt(cb.d)}（央行檔案更新較慢，最後更新 ${cb.updated||'—'}）新台幣 ${fmt(cb.ntd,3)}、韓元 ${fmt(cb.krw,1)} 兌 1 美元；央行較新資料尚未提供，本站以期交所參考匯率顯示最新值。<a href="${cb.source.split('（')[0]}" target="_blank" rel="noreferrer">央行 ↗</a></p>`:'<p class="rc-note">中央銀行匯率資料這次取不到（無資料）。</p>'}
    <p class="rc-note">來源：<a href="${fx.source.split('（')[0]}" target="_blank" rel="noreferrer">期交所 DailyForeignExchangeRates ↗</a>。官方參考匯率，非即時報價。</p></div>`;
   if(ust)h+=`<div class="rcard"><div class="rc-head"><h3>美國公債殖利率</h3><span>${dfmt(la(ust.days))} · 美國財政部 Par Yield Curve</span></div><div class="m4"><div><small>3 個月</small><b>${fmt(la(ust.y3m),2)}%</b></div><div><small>2 年</small><b>${fmt(la(ust.y2),2)}%</b><small class="${ycls(la(ust.y2)-lb(ust.y2))}">${sgn((la(ust.y2)-lb(ust.y2))*100,0)} bp</small></div><div><small>10 年</small><b>${fmt(la(ust.y10),2)}%</b><small class="${ycls(la(ust.y10)-lb(ust.y10))}">${sgn((la(ust.y10)-lb(ust.y10))*100,0)} bp</small></div><div><small>30 年</small><b>${fmt(la(ust.y30),2)}%</b><small class="${ycls(la(ust.y30)-lb(ust.y30))}">${sgn((la(ust.y30)-lb(ust.y30))*100,0)} bp</small></div></div>
    <div class="sparks"><div><h5>10 年期（近 ${ust.days.length} 日）</h5>${spark(ust.y10,ust.days,v=>fmt(v,2)+'%','#4a63c9')}</div><div><h5>10 年減 2 年利差（%）</h5>${spark(ust.y10.map((v,i)=>v==null||ust.y2[i]==null?null:v-ust.y2[i]),ust.days,v=>fmt(v,2),'#8a6bc4')}</div></div>
    <p class="rc-note">10 年減 2 年利差目前 ${fmt(la(ust.y10)-la(ust.y2),2)} 個百分點。bp＝0.01 個百分點。來源：<a href="${ust.source.split('（')[0]}" target="_blank" rel="noreferrer">美國財政部 ↗</a>（官方公布值，每個美國營業日更新）。</p></div>`;
   else h+=`<div class="rcard"><div class="rc-head"><h3>美國公債殖利率</h3><span>無資料</span></div><p class="rc-note">美國財政部資料這次取不到。</p></div>`;}
  // 事件行事曆
  if(MCAL){const today=new Date(Date.now()+8*3600e3).toISOString().slice(0,10),lim=new Date(Date.now()+8*3600e3+60*864e5).toISOString().slice(0,10);
   const E=MCAL.events.filter(e=>(e.d2||e.d)>=today&&e.d<=lim).map(e=>({...e,kk:e.k}));
   if(CAL)Object.entries(CAL.closed).filter(([d])=>d>=today&&d<=lim&&new Date(d+'T00:00:00Z').getUTCDay()%6!==0).forEach(([d,n])=>E.push({d,k:'休市',t:`台股休市：${n}`,tw:'',s:CAL.source}));
   E.sort((a,b)=>a.d.localeCompare(b.d));
   const li=e=>`<li><b>${dfmt(e.d)}${e.d2?'–'+dmd(e.d2):''}</b> <span class="tag">${e.k}</span> ${esc(e.t)}${e.tw?` <small>${esc(e.tw)}</small>`:''} <a href="${e.s}" target="_blank" rel="noreferrer">來源 ↗</a></li>`;
   h+=`${grp('重要事件行事曆','未來 60 天：美國 Fed／CPI／非農、台灣央行、台指期結算、台股休市')}
   <div class="rcard"><div class="rc-head"><h3>近期重要日程</h3><span>人工維護 · 更新 ${dfmt(MCAL.updated)} · 附官方來源</span></div>${E.length?`<ul class="gapl evl">${E.slice(0,8).map(li).join('')}</ul>${E.length>8?`<details><summary>更多日程（${E.length-8} 筆）</summary><ul class="gapl evl">${E.slice(8).map(li).join('')}</ul></details>`:''}`:'<p class="rc-note">未來 60 天沒有已登錄的事件（本表為人工維護，可能尚未更新）。</p>'}
   <p class="rc-note">${esc(MCAL.note)} 個股的除權息、法說會、財報期限見「日程日曆」。</p></div>`;}
  box.innerHTML=h;
}
