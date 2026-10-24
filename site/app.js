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
  $('#upd').textContent=META.updated.replace('T',' ').slice(0,16)+' (台北)';
  $('#cTw').innerHTML=META.counts.twse+'<em> 檔</em>';$('#cTp').innerHTML=META.counts.tpex+'<em> 檔</em>';
  $('#dTw').textContent='交易日期 '+dfmt(META.twseDate);$('#dTp').textContent='交易日期 '+dfmt(META.tpexDate);
  $('#nAll').textContent=ALL.length;$('#nEtf').textContent=ALL.filter(x=>x.etf).length;
  document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;$('#side').classList.remove('open');render();if(view==='w25'){overview();toDetail();}});
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
  if(SC&&(scF||tierF>=0))L=L.filter(x=>{const a=SC.items[x.code];return a&&(!scF||a.scen.includes(scF))&&(tierF<0||a.tier===tierF);});
  const k=$('#sort').value;const pct=x=>x.change/(x.close-x.change);
  const SK=SORTS[k];
  L=[...L].sort(SK?(a,b)=>{const fa=SK.f(a),fb=SK.f(b);return (fb==null?-Infinity:fb)-(fa==null?-Infinity:fa)||(b.value||0)-(a.value||0);}:k==='code'?(a,b)=>a.code.localeCompare(b.code):k==='change'?(a,b)=>pct(b)-pct(a):(a,b)=>(b[k]||0)-(a[k]||0));
  $('#listTitle').textContent={all:'全部股票',watch:'我的自選',etf:'ETF',w25:'全部股票'}[view];$('#listCount').textContent=L.length+' 檔';if(SC)scrStatus(L.length);
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
const flHtml=c=>flTags(c).map(([k,l,tt])=>`<span class="fl ${k}" title="${tt.replace(/"/g,'&quot;')}">${l}</span>`).join('');
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
   <div class="sparks"><div><h5>融資餘額（張）</h5>${spark(rows.map(x=>x&&x[0]),days,v=>fmt(v,0),'#d4483b')}</div><div><h5>融資使用率（%）</h5>${spark(useS,days,v=>fmt(v,2)+'%','#4871db')}</div>
    <div><h5>融券餘額（張）</h5>${spark(rows.map(x=>x&&x[3]),days,v=>fmt(v,0),'#2c9a6f')}</div><div><h5>借券賣出餘額（張）</h5>${spark(rows.map(x=>x&&x[5]),days,v=>fmt(v,0),'#8b5cf6')}</div></div>
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
function gapCard(H){
  const g=H.gaps,adj=H.adjusted||[],n=H.rows.length,ev=g?g.ev:[],sus=ev.filter(e=>e.kind!=='ex'),exs=ev.filter(e=>e.kind==='ex');
  if(!sus.length&&!exs.length&&!adj.length&&n>=60)return '';
  const li=[];
  adj.forEach(a=>li.push(`<li class="ok">✓ <b>${dfmt(a.date)}</b> 官方除權（前收 ${fmt(a.prevClose)} → 參考價 ${fmt(a.refPrice)}），已還原：前段價格 × ${fmt(a.factor,4)}、成交量 ÷ 同因子，來源${a.src}。</li>`));
  sus.forEach(e=>li.push(`<li class="bad">⚠ <b>${dfmt(e.d)}</b> 單日 ${e.pct>0?'+':''}${fmt(e.pct,1)}%（${fmt(e.prev)} → ${fmt(e.c)}）：${e.kind==='unk'?'官方除權息資料當日取不到，無法確認；':'證交所／櫃買官方除權息資料查無該日的除權息參考價（或收盤偏離參考價逾 10.5%）；'}${e.big?'<b>疑似分割／減資／面額變更／未還原</b>':'超過 ±10% 漲跌幅限制，<b>疑似未還原或特殊事件</b>'}。</li>`));
  exs.forEach(e=>li.push(`<li>ℹ <b>${dfmt(e.d)}</b> 單日 ${fmt(e.pct,1)}%：為官方除權息日（參考價 ${fmt(e.ref)}），已含除息缺口，不視為異常；價格未做還原（還原僅限參考價／前收 ≤ 0.9 的重大除權）。</li>`));
  let ex='';
  if(g&&g.suspect){const m=H.ma60;ex=`<p class="rc-note"><b>均線與 60 日高的處理：</b>疑似事件日 ${dfmt(g.since)} 起共 ${g.nAfter} 日資料。MA5／MA20／MA60 與 60 日高<b>只用事件日（含）之後的價格</b>計算，不跨越跳空。${m==null?`MA60 需 60 日，事件後僅 ${g.nAfter} 日 → <b>資料不足，已隱藏 MA60</b>。`:`MA60（事件後 60 日）＝${fmt(m)}。`} 60 日高（事件後）＝${fmt(g.hi60)}${g.hi60raw!==g.hi60?`；若不排除事件前資料則為 ${fmt(g.hi60raw)}（含未還原價格，不採用）`:''}。支撐與壓力價位帶仍由完整歷史結構推算、可能跨越事件日，僅供參考。</p>`;}
  if(n<60&&!(g&&g.suspect))ex+=`<p class="rc-note"><b>資料不足：</b>此股票目前僅 ${n} 個交易日的歷史資料，MA60 需至少 60 日 → <b>已隱藏 MA60</b>${n<20?'（MA20 亦不足）':''}；60 日高以現有 ${n} 日計。新上市或剛納入歷史涵蓋的標的會隨每日累積自動補齊。</p>`;
  return `<div class="rcard gapc${sus.length?' warn':''}"><div class="rc-head"><h3>價格資料檢查</h3><span>${sus.length?'⚠ 疑似未還原':n<60?'資料不足':'已還原／除權息'} · 單日 |漲跌| > 11% 偵測</span></div>${li.length?`<ul class="gapl">${li.join('')}</ul>`:''}${ex}<p class="rc-note sep">偵測規則：歷史收盤相鄰兩日變動超過 11%（台股漲跌幅限制為 ±10%），再與證交所 TWT49U／櫃買中心 exDailyQ 的除權息計算結果比對；標示為「疑似」不代表確定，也不是買賣建議。</p></div>`;}
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
  sel=code;location.hash=code;render();const s=ALL.find(x=>x.code===code);if(!s)return;
  let H=null;if(s.hasHistory){try{H=await fetch(`data/history/${code}.json`).then(r=>r.ok?r.json():null)}catch(e){}}window._H=H;
  const src=`<b>${s.src}</b>`;const inst=s.market==='上市'?(INST.data[code]||[]):null;
  const L=H&&H.levels,close=s.close;
  let html=`<div class="eyebrow">STOCK INSIGHT <span>${s.market}${s.etf?' · ETF':''} · ${code}</span></div>
  <div class="titleprice"><div><h2>${s.name} <button class="star" style="font-size:18px;color:${W().includes(code)?'#f0a020':'#b8c1cf'}" onclick="toggle('${code}');pick('${code}')">${W().includes(code)?'★':'☆'}</button></h2><p>資料日期 ${dfmt(s.date)}${META&&s.date!==(s.market==='上市'?META.twseDate:META.tpexDate)?'<span class="stalechip">此股資料日早於市場最新日</span>':''} · 來源：${s.src}</p></div>
  <div><strong>${fmt(close)}</strong><span class="${cls(s.change)}">${sg(s.change)}${fmt(s.change)} (${sg(s.change)}${fmt(s.change/(close-s.change)*100)}%)</span></div></div>
  <div class="metrics"><span>開盤<b>${fmt(s.open)}</b></span><span>最高<b>${fmt(s.high)}</b></span><span>最低<b>${fmt(s.low)}</b></span><span>成交量<b>${fmt(s.volume/1000,0)} 張</b></span><span>成交金額<b>${fmt(s.value/1e8)} 億</b></span></div>
  <div class="srcline">收盤行情 · 資料日期 ${dfmt(s.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY_ALL':'tpex_mainboard_daily_close_quotes'}）</div>${flagCard(s)}${dtCard(s)}${s.etf?'<div id="etfpage"><div class="empty">正在載入 ETF 持股明細…</div></div>':''}`;
  if(H){html+=`<div class="chartpanel"><div id="ctop">${chartTop(H)}</div>
  ${H.adjusted?`<div class="note2 adjnote">⚙ 已除權還原：${H.adjusted.map(a=>`${dfmt(a.date)} 除權（前收 ${fmt(a.prevClose)} → 參考價 ${fmt(a.refPrice)}，還原因子 ${fmt(a.factor,4)}，來源${a.src}）`).join('；')}。除權日以前的價格已乘以還原因子、成交量除以還原因子，均線、量比與支撐壓力皆用還原價；以下顯示的歷史價位與當時實際成交價不同。</div>`:''}<div class="srcline">走勢 · 資料日期 ${dfmt(H.rows[0][0])}–${dfmt(H.date)} · 來源 ${src}（${s.market==='上市'?'STOCK_DAY 個股日成交資訊':'tradingStock 個股日成交資訊'}）</div></div>
  ${gapCard(H)}<div class="sectionlabel"><h3>接下來，看哪裡？</h3><span>價格結構觀察 · 依 ${dfmt(H.date)} 收盤 · 來源 ${s.src}</span></div>`;
  if(L){const cf=confluence(H,L);html+=lvcards(L,cf,close,H)+`<div id="rrbox">${L.support&&L.support.length?rrHtml(H,L,close):''}</div>`+`<p class="note2 disclaimer">支撐與壓力為本站依歷史價格結構自行計算的觀察價位，可能與其他網站不同，不是目標價或買賣建議。</p>`+(L.limits?`<p class="note2">漲跌停參考（依漲跌幅限制，非結構價位）：明日漲停 ${fmt(L.limits.up)} · 跌停 ${fmt(L.limits.down)}</p>`:'');}
  const P=H.patterns;if(P&&(P.trend||P.box)){const t=P.trend,b=P.box;html+=`<div class="rcard patt"><div class="rc-head"><h3>形態偵測<small>（觀察用）</small></h3><span>依 ${dfmt(H.date)} 收盤</span></div>
   ${t?`<div class="sector-line"><span>📈 上升趨勢線（近期低點墊高）</span><b class="${t.state==='守住'?'up':'down'}">${t.state}</b><strong>線約 ${fmt(t.lineToday)}</strong></div><p class="rc-note">近 ${t.sinceDays} 日內最近 3 個波段低點 ${t.points.map(p=>dfmt(p[0]).slice(5)+' '+fmt(p[1])).join(' → ')}，趨勢線每日約 ${t.slopePct>0?'+':''}${fmt(t.slopePct)}%；收盤距趨勢線 ${t.dist>0?'+':''}${fmt(t.dist,1)}%。</p>`:''}
   ${b?`<div class="sector-line"><span>▭ 整理平台（前 ${b.days} 日區間窄）</span><b>${b.state}</b><strong>${fmt(b.low)}–${fmt(b.high)}</strong></div><p class="rc-note">不含今日的前 ${b.days} 個交易日最高 ${fmt(b.high)}、最低 ${fmt(b.low)}，區間寬度 ${fmt(b.width,1)}%。</p>`:''}
   <p class="rc-note sep">形態為依歷史價量自動偵測的觀察標示，不是買賣訊號，也不預測突破方向；偵測規則見下方「計算方法與資料說明」。</p></div>`;}
  html+=riskHtml(code,H);
  }else html+=`<div class="card"><h3>價格走勢 / 支撐壓力<span>尚無歷史</span></h3><p class="note2">此股票目前不在每日歷史抓取範圍（主要成交金額前段＋預設清單），因此暫無走勢、均線與支撐壓力（資料不足）。系統每日累積收盤快照，資料足夠後會自動顯示。</p></div>`+riskHtml(code,null);
  html+=`<div id="research"><div class="empty">正在彙整產業、法人、融資與 ETF 資料…</div></div>`;
  $('#detail').innerHTML=html;bindRR();
  const [C,E]=await Promise.all([CH||(CH=fetch('data/chips.json').then(r=>r.json())),EF||(EF=fetch('data/etf.json').then(r=>r.json())),FDp||(FDp=fetch('data/fund.json').then(r=>r.json()).then(v=>FD=v).catch(()=>null)),RVp||(RVp=fetch('data/rev.json').then(r=>r.json()).then(v=>RV=v).catch(()=>null)),CRp||(CRp=fetch('data/credit.json').then(r=>r.json()).then(v=>CR=v).catch(()=>null))]);
  if(sel!==code)return;CH_=C;if(s.etf){const p=$('#etfpage');if(p)p.innerHTML=fundOf(E,code)?etfPage(s,E):`<div class="rcard"><div class="rc-head"><h3>持股明細</h3><span>尚未接入</span></div><p class="rc-note">此 ETF 尚未接入官方持股揭露（見下方「資料涵蓋範圍」），暫無持股明細；不推定內容。</p></div>`;}
  $('#research').innerHTML=research(s,H,C,E);bindResearch();
}
let CH=null,CH_=null,EF=null,FDp=null,RVp=null,etfTab='全部';
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
  o+=fundHtml(s,H);
  o+=`<div class="rcard"><div class="rc-head"><h3>產業熱度</h3><span>依官方產業分類</span></div>${indName?`<div class="sector-line"><span>${indName}</span><b>第 ${rk} / ${ranks.length}</b><strong>${fmt(agg[s.ind].v/1e8)} 億</strong></div>
   <p class="rc-note">${dfmt(s.date)} 同日已取得行情，分類內 ${agg[s.ind].n} 檔。排名依${s.market}成交金額，不代表資金淨流入。來源：${s.market==='上市'?'證交所 t187ap03_L':'櫃買中心 mopsfin_t187ap03_O'}（產業別）＋ 每日收盤行情。</p>`:`<p class="rc-note">官方資料未提供此證券的產業別（ETF 等不列入公司基本資料）。</p>`}
   <p class="rc-note sep">題材資金流（如 GaN）：尚無可驗證的題材名單及計算來源。</p></div>`;
  // 位置
  const L=H&&H.levels;const s1=L&&L.support[0],r1=L&&L.resistance[0];
  o+=`<div class="rcard"><div class="rc-head"><h3>支撐壓力位置</h3><span>依 ${dfmt(H?H.date:s.date)} 收盤</span></div>`;
  if(s1&&r1){const pos=(close-s1.price)/(r1.price-s1.price)*100;o+=`<div class="track"><i style="left:${Math.max(0,Math.min(100,pos))}%"></i></div>
   <div class="pos3"><div><small>第一支撐</small><strong class="down">${fmt(s1.price)}</strong><em>價格帶 ${fmt(s1.low)}–${fmt(s1.high)}</em></div><div><small>收盤價</small><strong>${fmt(close)}</strong><em>位於區間 ${fmt(pos,1)}%</em></div><div><small>第一壓力</small><strong class="up">${fmt(r1.price)}</strong><em>價格帶 ${fmt(r1.low)}–${fmt(r1.high)}</em></div></div>
   <p class="rc-note">距支撐帶上緣 ${fmt((close/s1.high-1)*100,1)}%（${bandState(s1,'s',close).t}） · 距壓力帶下緣 ${fmt((r1.low/close-1)*100,1)}%（${bandState(r1,'r',close).t}）。此圖沿用上方歷史轉折價位，不另外推算「交界」價格。</p>`;}else o+=`<p class="rc-note">支撐或壓力資料不足，無法繪製位置圖。</p>`;o+='</div>';
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
  o+=creditCard(s);
  o+=s.etf&&fundOf(E,s.code)?'':etfHolders(s,E);
  o+=etfCoverage(E);
  o+=`<details class="method"><summary>查看計算方法與資料說明</summary>
   <p>支撐壓力不是目標價、不是買賣建議，也不代表適合追價。價位全部來自真實歷史成交結構：近 120 個交易日的波段高低點（前後各 2 日確認）與量能K（成交量 ≥ 前 20 日均量 1.5 倍）的最高、最低價；高點被突破超過 1% 後不再當壓力；支撐被跌破時結構轉弱。相鄰結構落在同一波動容差（1.6%）內合併為同一價格帶，不硬拆兩區；價位皆依台股升降單位取整。支撐：現價下方 0～10% 標示近端、10～20% 標示中期、超過 20% 列為長期結構。支撐候選包含波段低點、缺口邊緣、MA5／MA20、近 20 日高低點與量能K。壓力：第一壓力帶之上的下一個獨立結構，若已超過 +10% 則保留、改標中期壓力。近 10 日高點落在第一壓力帶時，標為「關鍵突破／壓力共振區」。找不到真實結構就顯示「尚未形成」，不以公式補值；「資料不足」表示來源資料不足以計算。創新高時顯示明日漲停參考價（依漲跌幅限制，非結構價位）。</p>
   <p>量比＝最新日成交量 ÷ 近 20 日均量（含當日）。均線與走勢以歷史資料最後一日為準。重大除權（官方除權息參考價 ÷ 前收 ≤ 0.9，如股票分割）已依證交所 TWT49U／櫃買中心 exDailyQ 還原，一般現金股息（通常小於 5%）未還原，相關價位需另行判讀。</p><p>形態偵測：①上升趨勢線＝近 60 日內最近 3 個波段低點（前後各 2 日確認）依序墊高且首尾相距 ≥ 15 日，以最小平方法擬合，收盤距線 ≥ -1.5% 為守住、否則為跌破；②整理平台＝不含今日的前 N 日（N=20／15／10）最高最低價區間寬度 ≤ 12%（N=20）或 9%（N≤15），再依今日收盤標示平台內、突破上緣或跌破下緣。皆為觀察用標示，不是買賣訊號。</p>
   <p>資料來源：臺灣證券交易所 OpenAPI／網站資料（STOCK_DAY_ALL、STOCK_DAY、T86、MI_MARGN、t187ap03_L）與櫃買中心 OpenAPI／網站資料（每日收盤行情、個股日成交、三大法人、融資融券餘額、mopsfin_t187ap03_O）；ETF 持股取自各投信官網公開持股（元大、群益、復華、野村、統一、富邦、凱基、永豐、兆豐、台新，國泰嘗試中）。法人單位為千股換算張，日期獨立標示。每個交易日 22:00（台北）自動更新。</p>
   <p>技術價位是研究參考，不是目標價或買賣指示；不保證價格守住支撐或突破壓力。</p></details>`;
  return o;
}

/* ===== ETF：個股頁「持有此股票的 ETF」與 ETF 頁「持股明細」（投信官網公開持股／PCF，比較前一個揭露日） ===== */
let ETFSET=new Set(),etfSort={k:'w',d:-1},etfAct=false,etfPS={k:'w',d:-1},etfPTab='全部';
const fundOf=(E,c)=>E.funds.find(f=>f.code===c&&f.date);
const loadEF=()=>EF||(EF=fetch('data/etf.json').then(r=>r.json()));
const aumFmt=v=>v==null?'—':v>=1e8?fmt(v/1e8,v>=1e10?0:1)+' 億':fmt(v/1e4,0)+' 萬';
const lotF=sh=>!sh?'0':sh<1000?`<1 張`:fmt(sh/1000,0)+' 張';   // 股數→張（四捨五入到整張；不足 1 張標「<1 張」，下方小字仍列精確股數）
const lotD=d=>{if(!d)return '0';const z=d>0?'+':'−',a=Math.abs(d);return a<1000?`${z}${fmt(a,0)} 股`:`${z}${fmt(a/1000,0)} 張`;};
const stOf=(sh,ps)=>ps==null?'首次收錄，待下一期':!ps&&sh?'新進':!sh?'剔除':sh>ps?'增持':sh<ps?'減持':'不變';
const dCell=(sh,ps)=>{if(ps==null)return `<span class="flat">—</span><small>首次收錄，待下一期</small>`;const d=sh-ps,st=stOf(sh,ps);
  return `<b class="${cls(d)}">${lotD(d)}</b><small>${st}${ps>0&&d?` · ${sg(d)}${fmt(d/ps*100,2)}%`:''}</small>`;};
const sortTh=(lab,k,S)=>`<th class="sk ${S.k===k?'on':''}" data-sk="${k}" tabindex="0" role="button" title="點擊以此欄排序">${lab}<i>${S.k===k?(S.d<0?'▼':'▲'):'↕'}</i></th>`;
function etfHolders(s,E){
  const F=E.funds,fm=Object.fromEntries(F.map(f=>[f.code,f]));
  const all=(E.holdings[s.code]||[]).map(h=>{const f=fm[h.fund];const d=h.prevShares==null?null:h.shares-h.prevShares;
    return {...h,f,d,amt:f&&f.aum?f.aum*h.weight/100:null};});
  const held=all.filter(r=>r.shares),act=held.filter(r=>r.f.active);
  let R=(etfAct?all.filter(r=>r.f.active):all).filter(r=>etfTab==='全部'||(etfTab==='增加'?r.d>0:r.d<0));
  const key={w:r=>r.weight||0,s:r=>r.shares||0,a:r=>r.amt==null?-1:r.amt,d:r=>r.d==null?-Infinity:r.d}[etfSort.k];
  R=[...R].sort((x,y)=>(key(y)-key(x))*(-etfSort.d)||y.weight-x.weight);
  const total=held.reduce((a,r)=>a+(r.amt||0),0),noAum=held.filter(r=>r.amt==null).length;
  return `<div class="rcard"><div class="rc-head"><h3>持有此股票的 ETF</h3><span>被 ${held.length} 檔 ETF 持有 · 其中主動式 ${act.length} 檔</span></div>
   <p class="rc-note">已接入 ${new Set(F.filter(f=>f.date).map(f=>f.issuer)).size} 家投信、${F.filter(f=>f.date).length} 檔 ETF 的官方持股，比對前一個揭露日的股數增減（漲紅跌綠）。${held.length?`本股在這些 ETF 的估算持有金額合計約 ${aumFmt(total)}${noAum?`（另有 ${noAum} 檔缺規模未計入）`:''}。`:''}沒接入的 ETF 無法判定，不代表沒持有。</p>
   <div class="tabs">${['全部','增加','減少'].map(t=>`<button data-t="${t}" class="${t===etfTab?'on':''}">${t}</button>`).join('')}<button id="etfAct" class="${etfAct?'on':''}" aria-pressed="${etfAct}">只看主動式 ETF</button><span>顯示 ${R.length} / ${all.length} 筆</span></div>
   ${R.length?`<div class="etfwrap"><table class="etft"><tr><th>ETF / 投信 / 基準日</th>${sortTh('權重','w',etfSort)}${sortTh('持有張數','s',etfSort)}${sortTh('估算金額','a',etfSort)}${sortTh('增減張數 / 增減幅','d',etfSort)}</tr>${R.map(r=>`<tr><td><a href="#${r.fund}" class="etflink" data-go="${r.fund}">${r.fund} ${r.f.name}</a>${r.f.active?'<span class="act">主動式</span>':''}<small>${r.f.issuer} · 基準日 ${r.f.date}${r.f.prevDate?' · 比較 '+r.f.prevDate:''}${r.f.stale?' · <b class="warn">沿用舊資料</b>':''} · <a href="${r.f.url}" target="_blank" rel="noreferrer">官網 ↗</a></small></td>
   <td>${fmt(r.weight)}%<small>${r.prevWeight==null?'—':'前期 '+fmt(r.prevWeight)+'%（'+sg(r.weight-r.prevWeight)+fmt(r.weight-r.prevWeight)+'）'}</small></td>
   <td>${lotF(r.shares)}<small>${r.shares?fmt(r.shares,0)+' 股':'已剔除'}</small></td>
   <td>${r.amt==null?'—':aumFmt(r.amt)}<small>${r.f.aum?'ETF 規模 '+aumFmt(r.f.aum):'未取得規模'}</small></td>
   <td class="${cls(r.d)}">${dCell(r.shares,r.prevShares)}</td></tr>`).join('')}</table></div>`
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
  const E_=()=>EF,rr=()=>EF.then(E=>{const s=selS();if(!s)return;$('#research').innerHTML=research(s,window._H,CH_,E);bindResearch();}),
    rp=()=>EF.then(E=>{const s=selS();const p=$('#etfpage');if(s&&p){p.innerHTML=etfPage(s,E);bindResearch();}});
  document.querySelectorAll('#research .tabs button[data-t]').forEach(b=>b.onclick=()=>{etfTab=b.dataset.t;rr();});
  const ab=$('#etfAct');if(ab)ab.onclick=()=>{etfAct=!etfAct;rr();};
  document.querySelectorAll('#research th.sk').forEach(h=>{const f=()=>{skToggle(etfSort,h.dataset.sk);rr();};h.onclick=f;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
  document.querySelectorAll('#etfpage .tabs button[data-pt]').forEach(b=>b.onclick=()=>{etfPTab=b.dataset.pt;rp();});
  document.querySelectorAll('#etfpage th.sk').forEach(h=>{const f=()=>{skToggle(etfPS,h.dataset.sk);rp();};h.onclick=f;h.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f();}};});
  document.querySelectorAll('#research .etflink,#etfpage .etflink').forEach(a=>a.onclick=e=>{e.preventDefault();pick(a.dataset.go);toDetail();if(!isM())scrollTo({top:0});});
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
