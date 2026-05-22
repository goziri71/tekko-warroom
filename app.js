// Tekko Revenue War Room - Main Application Logic
// All endpoints wired, System Guardian active

const BASE = 'https://zxchange.onrender.com';
let tok = null, usr = null, charts = {}, feedTmr = null, sseSrc = null, sessTmr = null, warnTmr = null;
let M = {mrr:0,today:0,users:0,churn:0,swap:0,gc:0,vc:0,tr:0,new_users:0,total_users:0,arr:0};
let guardianData = {stuck:0,swapFail:0,fiatMiss:0,gcStuck:0,vcFail:0,trFail:0};
let chatHistory = [], chatBusy = false;
const CHAT_HIST_MAX = 20;
let warroomStatus = { enabled: true, webResearch: false, model: null };
const RESEARCH_TRIGGER_RE = /search\s+(the\s+)?(internet|web|online)|search\s+(the\s+)?net|search\s+online|web\s+search|look\s+(it\s+)?up\s+online|google\s+(this|it|for)|browse\s+the\s+(web|internet)|surge\s+the\s+internet|research\s+online/i;

// Formatters
const ngn = v => v||v===0 ? '₦'+Number(v).toLocaleString('en-NG',{maximumFractionDigits:0}) : '—';
const usd = v => v||v===0 ? '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const pct = v => v||v===0 ? (v>0?'+':'')+Number(v).toFixed(1)+'%' : '—';
const num = v => v||v===0 ? Number(v).toLocaleString() : '—';

// UI Helpers
const flash = id => {const e=document.getElementById(id);if(!e)return;e.classList.add('flash');setTimeout(()=>e.classList.remove('flash'),500);};
const show = id => document.getElementById(id)?.classList.add('show');
const hide = id => document.getElementById(id)?.classList.remove('show');
const setEl = (id,v) => {
  const e=document.getElementById(id);
  if(!e) return;
  if(id==='vmsg') {
    let inner=e.querySelector('.vmsg-inner');
    if(!inner){inner=document.createElement('span');inner.className='vmsg-inner';e.textContent='';e.appendChild(inner);}
    inner.textContent=v;
    return;
  }
  e.textContent=v;
};
const hdl = (id,ok,warn) => {const e=document.getElementById(id);if(!e)return;e.className='hdl '+(ok?'ok':warn?'warn':'err');};

// Authentication
async function login() {
  const e = document.getElementById('le').value.trim();
  const p = document.getElementById('lp').value;
  const t = document.getElementById('l2').value.trim();
  const errEl = document.getElementById('lerr');
  const okEl = document.getElementById('lok');
  const btn = document.getElementById('lbtn');
  errEl.textContent = '';
  if(!e||!p) {errEl.textContent='Email and password required.';return;}
  if(!t||!/^\d{6}$/.test(t)) {errEl.textContent='Enter your 6-digit 2FA code.';document.getElementById('l2').focus();return;}
  btn.disabled = true;
  okEl.textContent = 'Authenticating...';
  const body = {email:e, password:p, twoFactorToken:t};
  try {
    const r = await fetch(BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d = await r.json();
    if(!r.ok || !d.success) {
      const msg = d.message || 'Login failed';
      errEl.textContent = /2fa|two.factor|factor|otp|invalid.*code/i.test(msg)
        ? 'Invalid 2FA code. Check your authenticator app and try again.'
        : msg;
      okEl.textContent = '';
      if(/2fa|two.factor|factor|otp|invalid.*code/i.test(msg)) document.getElementById('l2').focus();
      btn.disabled=false;
      return;
    }
    tok = d.data.accessToken;
    usr = d.data.user;
    okEl.textContent = 'Access granted. Loading war room...';
    setTimeout(bootWar, 500);
  } catch(err) {
    errEl.textContent = 'Connection error — is the server running?';
    okEl.textContent = '';
    btn.disabled = false;
  }
}

function logout() {
  stopAlwaysListen();
  tok = null; usr = null;
  chatHistory = []; chatBusy = false;
  warroomStatus = { enabled: true, webResearch: false, model: null };
  clearInterval(feedTmr);clearTimeout(sessTmr);clearTimeout(warnTmr);
  if(sseSrc){sseSrc.close();sseSrc=null;}
  Object.values(charts).forEach(c=>{try{c.destroy();}catch(e){}});
  charts = {};
  document.getElementById('sw').classList.remove('active');
  document.getElementById('sl').classList.add('active');
  document.getElementById('lp').value='';
  document.getElementById('l2').value='';
  document.getElementById('lerr').textContent='';
  document.getElementById('lok').textContent='Session ended.';
  document.getElementById('lbtn').disabled=false;
  setEl('feed','');
  renderToolResults(null);
}

// API
const ah = () => ({'Authorization':'Bearer '+tok, 'Content-Type':'application/json'});
async function api(path) {
  const r = await fetch(BASE+'/api/v1/admin/metrics'+path, {headers:ah()});
  if(r.status===401){logout();throw new Error('401');}
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}

// Chart Builder
function mk(id,type,labels,datasets,opts={}) {
  if(charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if(!el)return;
  charts[id] = new Chart(el.getContext('2d'), {
    type,
    data:{labels, datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales: type==='doughnut' ? {} : {
        x:{grid:{color:'rgba(0,255,180,0.04)'},ticks:{color:'rgba(0,255,180,0.35)',font:{size:9},autoSkip:false,maxRotation:0}},
        y:{grid:{color:'rgba(0,255,180,0.04)'},ticks:{color:'rgba(0,255,180,0.35)',font:{size:9}, ...(opts.ycb?{callback:opts.ycb}:{})}}
      },
      ...opts
    }
  });
}

// Fetch All Data
async function fetchAll() {
  setEl('cpill','&#9675; FETCHING...');
  document.getElementById('cpill').className='cpill demo';
  const [ov,sw,gc,vc,tr,wa,us,he] = await Promise.allSettled([
    api('/overview'),api('/swap'),api('/giftcards'),api('/virtualcards'),
    api('/transfers'),api('/wallet'),api('/users'),api('/health')
  ]);
  let partial = false;

  // Overview
  if(ov.status==='fulfilled') {
    const d = ov.value?.data || ov.value;
    M.mrr=d.total_mrr||d.mrr||0;
    M.today=d.total_revenue_today||0;
    M.users=d.active_users_30d||0;
    M.churn=d.churn_rate||0;
    M.arr=d.total_arr||d.arr||M.mrr*12;
    M.new_users=d.new_users_this_month||0;
    M.total_users=d.total_users||0;
    setCard(0,ngn(M.mrr),pct(d.total_revenue_growth_pct||d.mrr_growth_pct||0)+' vs last month',true);
    setCard(1,ngn(M.today),pct(d.fee_growth_pct||0)+' vs yesterday',true);
    setCard(2,num(M.users),'+'+num(M.new_users)+' new this month',true);
    setCard(3,M.churn+'%',M.churn>5?'CRITICAL':M.churn>3?'Watch':'Healthy',M.churn<=3,M.churn>5);
    if(M.churn>5)show('a-churn');else hide('a-churn');
    if(d.partial)partial=true;
    rebuildOverviewCharts(d);
  } else partial=true;

  // Product endpoints
  if(sw.status==='fulfilled'){const d=sw.value?.data||sw.value;M.swap=d.swap_mrr||0;setEl('sb0',ngn(M.swap));renderSwap(d);}else partial=true;
  if(gc.status==='fulfilled'){const d=gc.value?.data||gc.value;M.gc=d.giftcard_mrr||0;setEl('sb1',ngn(M.gc));renderGC(d);}else partial=true;
  if(vc.status==='fulfilled'){const d=vc.value?.data||vc.value;M.vc=d.virtualcard_mrr||0;setEl('sb2',ngn(M.vc));renderVC(d);}else partial=true;
  if(tr.status==='fulfilled'){const d=tr.value?.data||tr.value;M.tr=d.transfer_mrr||0;setEl('sb3',ngn(M.tr));renderTR(d);}else partial=true;
  if(wa.status==='fulfilled'){renderWallet(wa.value?.data||wa.value);}else partial=true;
  if(us.status==='fulfilled'){renderUsers(us.value?.data||us.value);}else partial=true;
  
  // Health
  if(he.status==='fulfilled'){renderHealth(he.value?.data||he.value);}
  else{['h-api','h-db','h-swap','h-cards','h-sse'].forEach(id=>hdl(id,false));show('a-health');}

  if(partial)show('a-partial');else hide('a-partial');
  document.getElementById('cpill').className='cpill live';
  setEl('cpill','&#9679; LIVE · TEKKO · NGN via Brais');
  runGuardian();
  speak('Tekko war room online. Live data loaded. MRR is '+ngn(M.mrr)+'.');
}

function setCard(i,val,sub,pos,crit) {
  setEl('m'+i,val);
  flash('m'+i);
  const s = document.getElementById('m'+i+'s');
  if(s){s.textContent=sub;s.className='ms '+(crit?'neg':pos?'pos':'warn');}
}

function rebuildOverviewCharts(d) {
  mk('c-donut','doughnut',['Swap','Gift Cards','Virtual Cards','Transfers'],[{
    data:[M.swap||1,M.gc||1,M.vc||1,M.tr||1],
    backgroundColor:['rgba(0,255,180,0.8)','rgba(0,255,180,0.5)','rgba(0,255,180,0.28)','rgba(0,255,180,0.12)'],
    borderColor:'#060a12',
    borderWidth:3
  }],{cutout:'62%'});
  const hist = d.mrr_history || [];
  const labels = hist.map(h=>h.month) || ['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'];
  const vals = hist.map(h=>h.mrr) || [4200000,5100000,6000000,6800000,7400000,8100000,8900000,9600000,10200000,11000000,11900000,M.mrr||12840000];
  mk('c-trend','line',labels,[{
    label:'MRR',
    data:vals,
    borderColor:'#00ffb4',
    backgroundColor:'rgba(0,255,180,0.05)',
    fill:true,
    tension:0.4,
    pointRadius:2,
    borderWidth:1.5,
    pointBackgroundColor:'#00ffb4'
  }],{ycb:v=>'₦'+(v/1000000).toFixed(1)+'M'});
}

function renderSwap(d) {
  const kvs = [
    {l:'Swap MRR',v:ngn(d.swap_mrr),s:'monthly recurring'},
    {l:'Fees today',v:ngn(d.swap_revenue_today),s:pct(d.swap_growth_pct)+' vs yesterday'},
    {l:'Swaps today',v:num(d.total_swaps_today),s:'total transactions'},
    {l:'Avg swap size',v:ngn(d.avg_swap_size_ngn),s:'per transaction'},
    {l:'Volume today',v:ngn(d.swap_volume_today_ngn),s:'total moved'},
    {l:'Avg fee/swap',v:ngn(d.avg_fee_per_swap),s:'per transaction'},
  ];
  renderKV('kv-swap',kvs);
  const tbody = document.querySelector('#tbl-swap tbody');
  if(tbody) tbody.innerHTML = (d.top_pairs||[]).map(p=>`<tr><td>${p.pair}</td><td>${ngn(p.volume_ngn)}</td><td>${ngn(p.fees)}</td><td>${num(p.count)}</td></tr>`).join('');
  const h = d.hourly_volume_today || [];
  if(h.length) mk('c-swap-hourly','bar',h.map(x=>x.hour),[{data:h.map(x=>x.fees),backgroundColor:'rgba(0,255,180,0.5)',borderRadius:2,borderSkipped:false}],{ycb:v=>'₦'+Math.round(v/1000)+'k'});
}

function renderGC(d) {
  const kvs = [
    {l:'Giftcard MRR',v:ngn(d.giftcard_mrr),s:'monthly recurring'},
    {l:'Revenue today',v:ngn(d.giftcard_revenue_today),s:pct(d.giftcard_growth_pct)+' vs yesterday'},
    {l:'Cards today',v:num(d.total_cards_traded_today),s:'traded'},
    {l:'Avg margin',v:ngn(d.avg_margin_per_card),s:'per card'},
    {l:'Avg card value',v:usd(d.avg_card_value_usd),s:'USD denomination'},
    {l:'Revenue MTD',v:ngn(d.giftcard_revenue_mtd),s:'month to date'},
  ];
  renderKV('kv-gc',kvs);
  const tbody = document.querySelector('#tbl-gc tbody');
  if(tbody) tbody.innerHTML = (d.top_cards||[]).map(c=>`<tr><td>${c.brand}</td><td>${num(c.count)}</td><td>${usd(c.volume_usd)}</td><td>${ngn(c.margin)}</td></tr>`).join('');
  const st = d.cards_by_status || {};
  mk('c-gc-status','doughnut',['Pending','Approved','Rejected'],[{
    data:[st.pending||0,st.approved||0,st.rejected||0],
    backgroundColor:['rgba(255,184,77,0.7)','rgba(0,255,180,0.7)','rgba(255,77,106,0.7)'],
    borderColor:'#060a12',
    borderWidth:2
  }],{cutout:'60%'});
  if(st.pending>10){guardianData.gcStuck=st.pending;show('a-stuck');}
}

function renderVC(d) {
  const kvs = [
    {l:'Virtual card MRR',v:ngn(d.virtualcard_mrr),s:'monthly recurring'},
    {l:'Revenue today',v:ngn(d.virtualcard_revenue_today),s:pct(d.virtualcard_growth_pct)+' vs yesterday'},
    {l:'Active cards',v:num(d.active_cards),s:'+'+num(d.new_cards_this_month)+' new this month'},
    {l:'Spend today',v:usd(d.total_card_spend_today_usd),s:'USD via virtual cards'},
    {l:'Issuance fees',v:ngn(d.revenue_by_type?.issuance_fees),s:'MTD'},
    {l:'Avg spend/card',v:usd(d.avg_spend_per_card_usd),s:'per card'},
  ];
  renderKV('kv-vc',kvs);
  const rv = d.revenue_by_type || {};
  mk('c-vc-rev','bar',['Issuance','Funding','Transaction','FX margin'],[{
    data:[rv.issuance_fees||0,rv.funding_fees||0,rv.transaction_fees||0,rv.fx_margin||0],
    backgroundColor:['rgba(0,255,180,0.7)','rgba(0,255,180,0.5)','rgba(0,255,180,0.3)','rgba(0,255,180,0.15)'],
    borderRadius:3,
    borderSkipped:false
  }],{ycb:v=>'₦'+Math.round(v/1000)+'k'});
}

function renderTR(d) {
  const kvs = [
    {l:'Transfer MRR',v:ngn(d.transfer_mrr),s:'monthly recurring'},
    {l:'Revenue today',v:ngn(d.transfer_revenue_today),s:pct(d.transfer_growth_pct)+' vs yesterday'},
    {l:'Transfers today',v:num(d.total_transfers_today),s:'send + withdraw'},
    {l:'Volume today',v:ngn(d.total_volume_today_ngn),s:'total moved'},
    {l:'Avg fee',v:ngn(d.avg_transfer_fee_ngn),s:'per transfer'},
    {l:'Avg transfer size',v:ngn(d.avg_transfer_size_ngn),s:'per transaction'},
  ];
  renderKV('kv-tr',kvs);
  const rv = d.revenue_by_type || {};
  mk('c-tr-rev','bar',['Send money','Withdrawals','Wallet funding'],[{
    data:[rv.send_money_fees||0,rv.withdrawal_fees||0,rv.wallet_funding_fees||0],
    backgroundColor:['rgba(0,255,180,0.7)','rgba(0,255,180,0.45)','rgba(0,255,180,0.2)'],
    borderRadius:3,
    borderSkipped:false
  }],{ycb:v=>'₦'+Math.round(v/1000)+'k'});
}

function renderWallet(d) {
  const kvs = [
    {l:'Total balance NGN',v:ngn(d.total_wallet_balance_ngn),s:'across all wallets'},
    {l:'Total balance USD',v:usd(d.total_wallet_balance_usd),s:'across all wallets'},
    {l:'Avg balance/user',v:ngn(d.avg_balance_per_user_ngn),s:'per active user'},
    {l:'Funded wallets',v:num(d.total_funded_wallets),s:'non-zero balance'},
    {l:'Deposits today',v:ngn(d.total_deposits_today_ngn),s:'incoming'},
    {l:'Withdrawals today',v:ngn(d.total_withdrawals_today_ngn),s:'outgoing'},
    {l:'Net flow today',v:ngn(d.net_flow_today_ngn),s:d.net_flow_today_ngn>=0?'positive':'negative'},
    {l:'Zero balance',v:num(d.zero_balance_wallets),s:'inactive wallets'},
  ];
  renderKV('kv-wallet',kvs);
  const cs = d.currency_split || {};
  mk('c-wallet','doughnut',['NGN wallets','USD wallets'],[{
    data:[cs.ngn_wallets||0,cs.usd_wallets||0],
    backgroundColor:['rgba(0,255,180,0.75)','rgba(0,255,180,0.3)'],
    borderColor:'#060a12',
    borderWidth:2
  }],{cutout:'58%'});
}

function renderUsers(d) {
  const kvs = [
    {l:'Total users',v:num(d.total_users),s:'registered'},
    {l:'Active 30d',v:num(d.active_users_30d),s:'with any transaction'},
    {l:'New today',v:num(d.new_users_today),s:'registered today'},
    {l:'New this month',v:num(d.new_users_this_month),s:'MTD'},
    {l:'Churn rate',v:pct(d.churn_rate),s:d.churn_rate>5?'CRITICAL':d.churn_rate>3?'Watch':'Healthy'},
    {l:'Retention rate',v:pct(d.retention_rate),s:'30 day'},
    {l:'Avg txns/user',v:num(d.avg_transactions_per_user),s:'monthly'},
    {l:'Top activity',v:d.top_user_activity||'—',s:'most used product'},
  ];
  renderKV('kv-users',kvs);
  const hist = d.user_growth_history || [];
  if(hist.length) mk('c-users','bar',hist.map(h=>h.month),[{
    data:hist.map(h=>h.new_users),
    backgroundColor:'rgba(0,255,180,0.5)',
    borderRadius:2,
    borderSkipped:false
  }],{ycb:v=>num(v)});
}

function renderHealth(d) {
  const ok = d.status==='ok';
  const dbOk = d.db==='connected';
  hdl('h-api',ok);hdl('h-db',dbOk);hdl('h-swap',ok);hdl('h-cards',ok);hdl('h-sse',!!sseSrc);
  setEl('g-api',ok?'OK':'ERROR');document.getElementById('g-api').className='g-badge '+(ok?'g-ok':'g-err');
  setEl('g-db',dbOk?'OK':'ERROR');document.getElementById('g-db').className='g-badge '+(dbOk?'g-ok':'g-err');
  setEl('g-se',ok?'OK':'WARN');document.getElementById('g-se').className='g-badge '+(ok?'g-ok':'g-warn');
  setEl('g-cp',ok?'OK':'WARN');document.getElementById('g-cp').className='g-badge '+(ok?'g-ok':'g-warn');
  setEl('g-sse',sseSrc?'CONNECTED':'DISCONNECTED');document.getElementById('g-sse').className='g-badge '+(sseSrc?'g-ok':'g-warn');
  if(!ok||!dbOk)show('a-health');else hide('a-health');
}

function runGuardian() {
  const checks = [
    {id:'g-stuck',v:guardianData.stuck,warn:1,label:'issue'},
    {id:'g-swap-fail',v:guardianData.swapFail,warn:1,label:'failed'},
    {id:'g-fiat-miss',v:guardianData.fiatMiss,warn:1,label:'missing'},
    {id:'g-gc-stuck',v:guardianData.gcStuck,warn:10,label:'stuck'},
    {id:'g-vc-fail',v:guardianData.vcFail,warn:1,label:'failed'},
    {id:'g-tr-fail',v:guardianData.trFail,warn:1,label:'failed'},
  ];
  checks.forEach(c=>{
    const el = document.getElementById(c.id);
    if(!el)return;
    if(c.v===0){el.textContent='OK';el.className='g-badge g-ok';}
    else if(c.v<=c.warn){el.textContent=c.v+' '+c.label;el.className='g-badge g-warn';}
    else{el.textContent=c.v+' '+c.label+'!';el.className='g-badge g-err';show('a-stuck');speak('Guardian alert: '+c.v+' '+c.label+' detected.');}
  });
  const gf = document.getElementById('g-feed');
  if(gf){
    const issues = checks.filter(c=>c.v>0);
    gf.textContent = issues.length ? issues.map(c=>c.v+' '+c.label).join(' · ') : 'All systems nominal';
  }
}

function renderKV(id,items) {
  const el = document.getElementById(id);
  if(!el)return;
  el.innerHTML = items.map(i=>`<div class="kv"><div class="kv-l">${i.l}</div><div class="kv-v">${i.v}</div>${i.s?`<div class="kv-s">${i.s}</div>`:''}</div>`).join('');
}

// Live Feed
const feedPool = [
  {t:'SWAP',d:'BTC/NGN BUY',f:'₦840',l:'Lagos'},{t:'SWAP',d:'ETH/NGN SELL',f:'₦420',l:'Abuja'},
  {t:'GIFT',d:'Amazon $100',f:'₦3,200',l:'PH'},{t:'GIFT',d:'iTunes $50',f:'₦2,100',l:'Kano'},
  {t:'CARD',d:'Virtual spend',f:'$0.48',l:'Lagos'},{t:'CARD',d:'Card funded',f:'₦250',l:'Ibadan'},
  {t:'SEND',d:'GTBank transfer',f:'₦50',l:'Abuja'},{t:'WTHDW',d:'Withdrawal',f:'₦100',l:'Enugu'},
];
function spawnFeed() {
  const feed = document.getElementById('feed');
  if(!feed)return;
  const t = feedPool[Math.floor(Math.random()*feedPool.length)];
  const isIn = ['SWAP','CARD','GIFT','ADD'].includes(t.t);
  const el = document.createElement('div');
  el.className = 'fi';
  el.innerHTML = `<span style="color:var(--g);font-weight:500;width:40px">${t.t}</span><span style="flex:1;color:${isIn?'rgba(0,255,180,0.65)':'rgba(255,200,100,0.75)'}">${t.d}</span><span style="color:#00d084">${t.f}</span><span style="color:rgba(0,255,180,0.28);font-size:9px;width:46px;text-align:right">${t.l}</span>`;
  feed.insertBefore(el,feed.firstChild);
  if(feed.children.length>9) feed.removeChild(feed.lastChild);
}

// SSE Stream
function startSSE() {
  if(!tok)return;
  try {
    sseSrc = new EventSource(BASE+'/api/v1/admin/metrics/stream?access_token='+tok);
    sseSrc.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if(d.total_mrr||d.mrr){M.mrr=d.total_mrr||d.mrr;setEl('m0',ngn(M.mrr));flash('m0');}
        if(d.total_revenue_today){M.today=d.total_revenue_today;setEl('m1',ngn(M.today));flash('m1');}
        if(d.active_users_30d){M.users=d.active_users_30d;setEl('m2',num(M.users));}
        if(d.churn_rate!==undefined){M.churn=d.churn_rate;setEl('m3',M.churn+'%');if(M.churn>5)show('a-churn');}
      } catch(err){}
    };
    sseSrc.onopen = () => {hdl('h-sse',true);setEl('g-sse','CONNECTED');document.getElementById('g-sse').className='g-badge g-ok';};
    sseSrc.onerror = () => {hdl('h-sse',false,true);setEl('g-sse','RECONNECTING');document.getElementById('g-sse').className='g-badge g-warn';};
  } catch(e){}
}

// Session Timers
function startSessionTimers() {
  clearTimeout(sessTmr);clearTimeout(warnTmr);
  warnTmr = setTimeout(()=>{show('a-token');speak('Session expiring in 2 minutes. Please re-login.');},13*60*1000);
  sessTmr = setTimeout(()=>{speak('Session expired. Logging out.');logout();},15*60*1000);
}

// Tab Switching
let curTab = 'overview';
function goTab(tab,el) {
  curTab = tab;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('p-'+tab)?.classList.add('active');
}

// Boot War Room
function bootWar() {
  document.getElementById('sl').classList.remove('active');
  document.getElementById('sw').classList.add('active');
  setEl('upill-txt',(usr?.email||'Admin')+' · '+(usr?.role||'admin'));
  setInterval(()=>setEl('clk',new Date().toLocaleTimeString('en-US',{hour12:false})),1000);
  feedTmr = setInterval(spawnFeed, Math.random()*1200+700);
  spawnFeed();
  fetchAll();
  setInterval(fetchAll,60000);
  startSSE();
  startSessionTimers();
  checkWarroomStatus();
  setTimeout(() => {
    const live = document.getElementById('vlive');
    if(live) { live.classList.add('show'); live.textContent = 'Say “Tekko war room”…'; }
    resumeWakeListen();
  }, 1200);
}

// Warroom AI (backend OpenAI + tools)
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function apiErrMessage(d, status) {
  if(!d) return 'Request failed ('+status+')';
  if(typeof d.message==='string') return d.message;
  if(typeof d.error==='string') return d.error;
  if(typeof d.error?.message==='string') return d.error.message;
  if(Array.isArray(d.message)) return d.message.map(e=>e.message||JSON.stringify(e)).join('; ');
  return 'Request failed ('+status+')';
}

function modeLabel(mode) {
  return mode === 'research' ? 'WEB' : mode === 'tekko' ? 'TEKKO' : 'AUTO';
}

async function warroomFetch(path, body) {
  const opts = {headers:ah()};
  if(body) { opts.method='POST'; opts.body=JSON.stringify(body); }
  let r, d, raw;
  try {
    r = await fetch(BASE+path, opts);
    raw = await r.text();
    d = raw ? JSON.parse(raw) : {};
  } catch(e) {
    if(e.message==='Failed to fetch') throw new Error('Network blocked — open the war room on Vercel (HTTPS), not as a local file.');
    throw e;
  }
  return {r, d};
}

function resolveChatMode(message, modeOverride) {
  if(modeOverride === 'research' && !warroomStatus.webResearch) return 'auto';
  if(modeOverride) return modeOverride;
  if(warroomStatus.webResearch && RESEARCH_TRIGGER_RE.test(message)) return 'research';
  return 'auto';
}

function updateWarroomUi() {
  const webBtn = document.getElementById('qb-web');
  const hint = document.getElementById('vhint');
  const vzone = document.querySelector('.vzone');
  if(webBtn) {
    webBtn.style.display = warroomStatus.webResearch ? '' : 'none';
    webBtn.disabled = !warroomStatus.enabled;
  }
  if(vzone) vzone.classList.toggle('web-ready', warroomStatus.webResearch && warroomStatus.enabled);
  if(hint) {
    hint.innerHTML = warroomStatus.webResearch
      ? 'Say <strong>TEK-ko · WAR · ROOM</strong> or <strong>ACTIVATE</strong>. Say <strong>search the internet</strong> + question for web. <strong>Web</strong> / <strong>SPEAK</strong>.'
      : 'Say <strong>TEK-ko · WAR · ROOM</strong> or <strong>ACTIVATE</strong>. <strong>SPEAK</strong> = manual command.';
  }
}

async function checkWarroomStatus() {
  if(!tok) return;
  try {
    const {r,d} = await warroomFetch('/api/v1/admin/warroom/status');
    if(r.status===401){logout();return;}
    const data = d.data || d;
    if(r.ok && d.success!==false) {
      warroomStatus.enabled = data.enabled !== false;
      warroomStatus.webResearch = !!(data.web_research?.enabled);
      warroomStatus.model = data.model || null;
      updateWarroomUi();
      if(!warroomStatus.enabled) {
        setEl('vmsg', 'AI offline.');
        return;
      }
      let msg = warroomStatus.model ? 'AI online ('+warroomStatus.model+').' : 'AI online.';
      if(warroomStatus.webResearch) msg += ' Say “search the internet” for web.';
      else msg += ' Tekko data only.';
      setEl('vmsg', msg);
      return;
    }
    setEl('vmsg','AI offline: '+apiErrMessage(d,r.status));
  } catch(e) {
    setEl('vmsg', e.message || 'Could not reach warroom AI.');
  }
}

function setChatBusy(on) {
  chatBusy = on;
  ['vinp','mbtn'].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=on;});
  document.querySelectorAll('.qb').forEach(b=>{b.disabled=on;});
}

function renderToolResults(data) {
  const el = document.getElementById('vtools');
  if(!el) return;
  const tools = data?.tools_used;
  const results = data?.tool_results;
  if(!tools?.length) {
    el.innerHTML = '';
    el.classList.remove('show');
    return;
  }
  let html = '<div class="vtags">'+tools.map(t=>'<span>'+esc(t)+'</span>').join('')+'</div>';
  const addTable = (name, payload) => {
    const rows = Array.isArray(payload) ? payload : payload?.rows || payload?.transactions || payload?.data;
    if(!Array.isArray(rows) || !rows.length || typeof rows[0]!=='object') return;
    const cols = Object.keys(rows[0]).slice(0,6);
    html += '<div style="margin-top:6px;color:var(--g);font-size:8px;letter-spacing:0.06em">'+esc(name||'data')+'</div>';
    html += '<table class="vtool-tbl"><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>';
    rows.slice(0,8).forEach(row=>{
      html += '<tr>'+cols.map(c=>'<td>'+esc(row[c])+'</td>').join('')+'</tr>';
    });
    html += '</tbody></table>';
  };
  if(results && typeof results==='object') {
    if(Array.isArray(results)) tools.forEach((t,i)=>addTable(t, results[i]));
    else Object.entries(results).forEach(([name,payload])=>addTable(name, payload));
  }
  el.innerHTML = html;
  el.classList.add('show');
}

// Voice Assistant — always-on wake word + command mode
const synth = window.speechSynthesis;
let utt = null, recog = null, listening = false, sttFinal = '', sttSilenceTmr = null;
let sttMode = 'off', wakeEnabled = false, wakeArmed = false, wakeBuffer = '', wakeCooldown = false;
const STT_SILENCE_MS = 2500;
const WAKE_GREETING = 'Tekko war room online. What would you like to know?';
const WAKE_SCORE_TRIGGER = 0.72;
const TEKKO_WORDS = ['tekko','techo','tico','tako','techno','deco','teco','takeo'];
const WAR_WORDS = ['war','wor','bar','more','word','wars'];
const ROOM_WORDS = ['room','rum','boom','rome','womb','rooms','roam'];
const WAKE_REGEX = /tekko\s*war\s*room|tekko\s*warroom|techo\s*war\s*room|tico\s*war\s*room|taco\s*war\s*room|techno\s*war\s*room|echo\s*war\s*room/i;

function normText(t) {
  return (t||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function lev(a, b) {
  if(!a || !b) return 99;
  const m = [];
  for(let i = 0; i <= b.length; i++) m[i] = [i];
  for(let j = 0; j <= a.length; j++) m[0][j] = j;
  for(let i = 1; i <= b.length; i++) {
    for(let j = 1; j <= a.length; j++) {
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : 1 + Math.min(m[i-1][j-1], m[i][j-1], m[i-1][j]);
    }
  }
  return m[b.length][a.length];
}

function nearWord(w, list, maxDist) {
  if(!w || w.length < 2) return false;
  return list.some(a => w === a || w.includes(a) || a.includes(w) || lev(w, a) <= maxDist);
}

function wakeMatchScore(text) {
  const s = normText(text);
  if(!s) return 0;
  if(WAKE_REGEX.test(s)) return 1;
  const words = s.split(' ').filter(Boolean);
  if(words.length < 2) return 0;
  let best = 0;
  for(let i = 0; i < words.length; i++) {
    for(let len = 2; len <= 7 && i + len <= words.length; len++) {
      const slice = words.slice(i, i + len);
      const hasTekko = slice.some((w, idx) => idx <= 2 && nearWord(w, TEKKO_WORDS, 2));
      const hasWar = slice.some((w, idx) => idx >= 1 && nearWord(w, WAR_WORDS, 1));
      const hasRoom = slice.some((w, idx) => idx >= 1 && nearWord(w, ROOM_WORDS, 1));
      if(hasTekko && hasWar && hasRoom) best = Math.max(best, 1);
      else if(hasTekko && (hasWar || hasRoom)) best = Math.max(best, 0.78);
      else if(hasTekko && len >= 3) best = Math.max(best, 0.45);
    }
  }
  if(s.includes('war') && s.includes('room') && nearWord(words[0]||'', TEKKO_WORDS, 3)) best = Math.max(best, 0.85);
  return best;
}

function hasWakePhrase(t) { return wakeMatchScore(t) >= WAKE_SCORE_TRIGGER; }

function stripWakePhrase(t) {
  let s = normText(t);
  s = s.replace(/tekko\s*war\s*room|tekko\s*warroom|techo\s*war\s*room|tico\s*war\s*room|taco\s*war\s*room|techno\s*war\s*room|echo\s*war\s*room/gi, ' ');
  const words = s.split(' ').filter(Boolean);
  const out = [];
  let skip = 0;
  for(let i = 0; i < words.length; i++) {
    if(skip > 0) { skip--; continue; }
    const w = words[i];
    if(nearWord(w, TEKKO_WORDS, 2)) {
      const w2 = words[i+1], w3 = words[i+2];
      if(w2 && nearWord(w2, WAR_WORDS, 1) && w3 && nearWord(w3, ROOM_WORDS, 1)) { skip = 2; continue; }
      if(w2 && nearWord(w2, ROOM_WORDS, 1)) { skip = 1; continue; }
      continue;
    }
    out.push(w);
  }
  return out.join(' ').trim();
}

function collectTranscripts(e) {
  const out = [];
  for(let i = 0; i < e.results.length; i++) {
    for(let j = 0; j < e.results[i].length; j++) {
      const t = e.results[i][j]?.transcript;
      if(t) out.push(t);
    }
  }
  return [...new Set(out)];
}

function checkWakeFromTranscripts(transcripts) {
  let best = 0, bestText = '';
  for(const t of transcripts) {
    const sc = wakeMatchScore(t);
    if(sc > best) { best = sc; bestText = t; }
  }
  const heard = (wakeBuffer + transcripts.join(' ')).trim();
  const combined = wakeMatchScore(heard);
  if(combined > best) { best = combined; bestText = heard; }
  return { score: best, text: bestText || heard };
}

function clearSttSilenceTimer() {
  if(sttSilenceTmr) { clearTimeout(sttSilenceTmr); sttSilenceTmr = null; }
}

function resetSttSilenceTimer() {
  clearSttSilenceTimer();
  if(!listening || sttMode === 'wake') return;
  const text = (sttFinal + (document.getElementById('vinp')?.value || '')).trim();
  if(!text) return;
  sttSilenceTmr = setTimeout(() => endCommandCapture({autoSend:true}), STT_SILENCE_MS);
}

function clearSttUi(keepLive) {
  const inp = document.getElementById('vinp');
  const live = document.getElementById('vlive');
  if(inp) { inp.value = ''; inp.classList.remove('listening'); }
  if(live && !keepLive) {
    live.textContent = sttMode === 'wake' ? 'Say “Tekko war room”…' : '';
  }
  sttFinal = '';
  if(sttMode === 'wake') wakeBuffer = '';
}

function updateSttDisplay(interim) {
  const inp = document.getElementById('vinp');
  const live = document.getElementById('vlive');
  const text = (sttFinal + interim).trim();
  const hearing = sttMode === 'wake' ? (wakeBuffer + interim).trim() : text;
  if(inp) {
    inp.value = sttMode === 'wake' ? hearing : text;
    inp.classList.toggle('listening', listening || sttMode === 'wake');
  }
  if(live) {
    live.classList.add('show');
    if(sttMode === 'wake') {
      live.textContent = hearing || 'Say “Tekko war room”…';
      live.title = hearing;
    } else if(listening) {
      live.textContent = text || 'Speak your command…';
      live.title = text;
    } else {
      live.textContent = text || live.textContent;
    }
  }
  if(sttMode === 'wake') {
    const sc = wakeMatchScore(hearing);
    if(sc >= WAKE_SCORE_TRIGGER) setEl('vmsg', 'Wake phrase matched — activating…');
    else if(sc >= 0.45) setEl('vmsg', 'Close match — say TEK-ko WAR ROOM or tap ACTIVATE');
    else setEl('vmsg', hearing ? 'Hearing…' : 'Say TEK-ko · WAR · ROOM');
  }
  else if(listening) setEl('vmsg', text ? 'Command…' : 'Say your request…');
  if(listening && text) resetSttSilenceTimer();
}

function setMicUi(active, label) {
  const btn = document.getElementById('mbtn');
  if(!btn) return;
  btn.classList.toggle('on', active && sttMode !== 'wake');
  btn.classList.toggle('wake-on', wakeArmed && !active);
  btn.textContent = label || (active ? '■ STOP' : '● SPEAK');
}

function pauseRecog() {
  wakeArmed = false;
  try { recog?.stop(); } catch(e) {}
}

function stopAlwaysListen() {
  wakeEnabled = false;
  wakeArmed = false;
  sttMode = 'off';
  listening = false;
  clearSttSilenceTimer();
  pauseRecog();
  setMicUi(false);
  wave(false);
}

function resumeWakeListen() {
  if(!tok || !recog || !wakeEnabled || chatBusy) return;
  sttMode = 'wake';
  listening = false;
  wakeBuffer = '';
  sttFinal = '';
  wakeArmed = true;
  setMicUi(false);
  updateSttDisplay('');
  setEl('vmsg', 'Listening for Tekko war room…');
  try { recog.start(); }
  catch(e) { setTimeout(resumeWakeListen, 2000); }
}

function liveEl() { return document.getElementById('vlive'); }

function onWakeDetected(fullText, forced) {
  if(wakeCooldown || chatBusy) return;
  if(!forced && sttMode !== 'wake') return;
  wakeCooldown = true;
  setTimeout(() => { wakeCooldown = false; }, 8000);
  pauseRecog();
  sttMode = 'command';
  wakeBuffer = '';
  const cmd = stripWakePhrase(fullText);
  setEl('vmsg', 'Assistant activated.');
  const live = liveEl();
  if(live) live.textContent = cmd ? 'Sending: '+cmd : 'What would you like?';
  if(cmd) speak('Got it.', () => ask(cmd));
  else speak(WAKE_GREETING, () => beginCommandCapture());
}

function activateAssistant() {
  if(chatBusy) return;
  stopSpeak();
  const heard = (document.getElementById('vinp')?.value || wakeBuffer || '').trim();
  onWakeDetected(heard || 'tekko war room', true);
}

function beginCommandCapture() {
  if(!recog || chatBusy) { resumeWakeListen(); return; }
  pauseRecog();
  sttMode = 'command';
  listening = true;
  sttFinal = '';
  const inp = document.getElementById('vinp');
  if(inp) { inp.value = ''; inp.classList.add('listening'); }
  const live = liveEl();
  if(live) { live.classList.add('show'); live.textContent = 'Speak your command…'; }
  setMicUi(true, '■ STOP');
  wave(true);
  setEl('vmsg', 'Your command… pause to send.');
  try { recog.start(); }
  catch(e) {
    listening = false;
    setEl('vmsg', 'Mic failed.');
    resumeWakeListen();
  }
}

function endCommandCapture(opts = {}) {
  const autoSend = !!opts.autoSend;
  if(!listening && sttMode !== 'command' && sttMode !== 'manual') return;
  listening = false;
  clearSttSilenceTimer();
  pauseRecog();
  const inp = document.getElementById('vinp');
  if(inp) inp.classList.remove('listening');
  wave(false);
  const text = (inp?.value || sttFinal || '').trim();
  const wasManual = sttMode === 'manual';
  if(autoSend && text) {
    clearSttUi();
    setEl('vmsg', 'Sending…');
    setMicUi(false);
    ask(text);
    return;
  }
  clearSttUi();
  setMicUi(false);
  if(!wasManual && !text) setEl('vmsg', 'No command.');
  if(!autoSend && !chatBusy) resumeWakeListen();
}

function stopListening() { endCommandCapture({autoSend:false}); }

if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recog = new SR();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = 'en-US';
  if('maxAlternatives' in recog) recog.maxAlternatives = 5;
  recog.onstart = () => {
    if(sttMode === 'wake') {
      wakeArmed = true;
      setMicUi(false);
      updateSttDisplay('');
      return;
    }
    sttFinal = '';
    updateSttDisplay('');
  };
  recog.onresult = e => {
    let interim = '', final = '';
    for(let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if(e.results[i].isFinal) final += t;
      else interim += t;
    }
    if(sttMode === 'wake') {
      if(final) wakeBuffer = (wakeBuffer + ' ' + final).trim().slice(-400);
      const transcripts = collectTranscripts(e);
      if(interim) transcripts.push(wakeBuffer + ' ' + interim);
      updateSttDisplay(interim);
      const {score, text} = checkWakeFromTranscripts(transcripts);
      if(score >= WAKE_SCORE_TRIGGER) onWakeDetected(text);
      return;
    }
    sttFinal += final;
    updateSttDisplay(interim);
  };
  recog.onerror = e => {
    if(sttMode === 'wake') {
      if(e.error === 'not-allowed') { wakeEnabled = false; setEl('vmsg', 'Mic blocked.'); }
      else if(e.error !== 'no-speech') setTimeout(resumeWakeListen, 2000);
      return;
    }
    if(e.error === 'no-speech' && (sttFinal.trim() || document.getElementById('vinp')?.value?.trim())) return;
    endCommandCapture({autoSend:false});
    setEl('vmsg', e.error === 'not-allowed' ? 'Mic blocked.' : 'Mic error.');
  };
  recog.onend = () => {
    if(sttMode === 'wake' && wakeEnabled && !chatBusy) {
      wakeArmed = true;
      try { recog.start(); } catch(e) { setTimeout(resumeWakeListen, 1500); }
      return;
    }
    if(listening) {
      try { recog.start(); } catch(err) { endCommandCapture({autoSend:false}); }
    }
  };
  wakeEnabled = true;
} else {
  setEl('vmsg', 'Voice needs Chrome (HTTPS).');
}

function toggleMic() {
  if(!recog) {
    setEl('vmsg', 'Voice needs Chrome on HTTPS.');
    speak('Use Chrome for voice input.', null, true);
    return;
  }
  if(listening) { endCommandCapture({autoSend:true}); return; }
  stopSpeak();
  pauseRecog();
  sttMode = 'manual';
  beginCommandCapture();
}

function wave(on) {
  for(let i=1;i<=8;i++){
    const b = document.getElementById('w'+i);
    if(!b)return;
    if(on){b.classList.add('on');b.style.animationDelay=(i*0.07)+'s';}
    else b.classList.remove('on');
  }
}

function speak(text, onEnd, skipWakePause) {
  if(!synth || !text?.trim()) { onEnd?.(); return; }
  if(!skipWakePause) pauseRecog();
  const say = () => {
    synth.cancel();
    utt = new SpeechSynthesisUtterance(text.trim());
    utt.rate = 1.08;
    utt.pitch = 0.95;
    const voices = synth.getVoices();
    const voice = voices.find(v=>v.lang.startsWith('en')) || voices[0];
    if(voice) utt.voice = voice;
    utt.onstart = () => wave(true);
    utt.onend = () => {
      wave(false);
      onEnd?.();
      setTimeout(() => {
        if(wakeEnabled && tok && !chatBusy && !listening) resumeWakeListen();
      }, 350);
    };
    utt.onerror = () => {
      wave(false);
      onEnd?.();
      setTimeout(() => {
        if(wakeEnabled && tok && !chatBusy && !listening) resumeWakeListen();
      }, 350);
    };
    synth.speak(utt);
    if(synth.paused) synth.resume();
  };
  if(synth.getVoices().length) say();
  else synth.onvoiceschanged = () => { say(); synth.onvoiceschanged = null; };
}
if(synth) synth.onvoiceschanged = () => {};

function stopSpeak() {
  if(synth) synth.cancel();
  wave(false);
  const tb = document.getElementById('vtest');
  if(tb) tb.classList.remove('on');
}

const SPEECH_TEST_PHRASE = 'Tekko war room speech test. If you hear this, audio is working.';

function testSpeech() {
  const btn = document.getElementById('vtest');
  pauseRecog();
  stopSpeak();
  if(!synth) {
    setEl('vmsg','Speech not supported in this browser. Use Chrome or Edge over HTTPS.');
    return;
  }
  if(btn) btn.classList.add('on');
  setEl('vmsg','TEST SPEECH — playing now. Listen for: "'+SPEECH_TEST_PHRASE+'"');
  const run = () => {
    const u = new SpeechSynthesisUtterance(SPEECH_TEST_PHRASE);
    u.rate = 1.05;
    u.pitch = 0.95;
    const voices = synth.getVoices();
    const voice = voices.find(v=>v.lang.startsWith('en')) || voices[0];
    if(voice) u.voice = voice;
    u.onstart = () => {
      wave(true);
      setEl('vmsg','TEST SPEECH — speaking now…');
    };
    u.onend = () => {
      wave(false);
      if(btn) btn.classList.remove('on');
      setEl('vmsg','Speech OK. Say Tekko war room anytime.');
      resumeWakeListen();
    };
    u.onerror = () => {
      wave(false);
      if(btn) btn.classList.remove('on');
      setEl('vmsg','Speech test failed.');
      resumeWakeListen();
    };
    synth.speak(u);
    if(synth.paused) synth.resume();
  };
  if(synth.getVoices().length) run();
  else synth.onvoiceschanged = () => { run(); synth.onvoiceschanged = null; };
}

async function ask(q, modeOverride) {
  if(!q?.trim()||chatBusy) return;
  if(!tok) { setEl('vmsg','Session expired. Please log in again.'); return; }
  if(!warroomStatus.enabled) {
    setEl('vmsg', 'AI offline. Check warroom status.');
    return;
  }
  pauseRecog();
  listening = false;
  clearSttSilenceTimer();
  setMicUi(false);
  const message = q.trim();
  let mode = resolveChatMode(message, modeOverride);
  if(mode === 'research' && !warroomStatus.webResearch) mode = 'auto';
  clearSttUi();
  setChatBusy(true);
  const modeTag = mode !== 'auto' ? ' ['+modeLabel(mode)+']' : '';
  setEl('vmsg', (mode === 'research' ? 'Searching the web…' : mode === 'tekko' ? 'Querying Tekko data…' : 'Querying AI…') + modeTag);
  renderToolResults(null);
  wave(true);
  const history = chatHistory.map(h=>({role:h.role, content:h.content}));
  chatHistory.push({role:'user', content:message});
  if(chatHistory.length>CHAT_HIST_MAX) chatHistory.splice(0, chatHistory.length-CHAT_HIST_MAX);
  const body = { message, history };
  if(mode && mode !== 'auto') body.mode = mode;
  try {
    const {r,d} = await warroomFetch('/api/v1/admin/warroom/chat', body);
    if(r.status===401){chatHistory.pop();logout();return;}
    if(!r.ok || d.success===false) {
      chatHistory.pop();
      throw new Error('AI chat ('+r.status+'): '+apiErrMessage(d,r.status));
    }
    const data = d.data || d;
    const reply = (data.reply || '').trim() || 'No reply from assistant.';
    const resMode = data.mode || mode;
    chatHistory.push({role:'assistant', content:reply});
    if(chatHistory.length>CHAT_HIST_MAX) chatHistory.splice(0, chatHistory.length-CHAT_HIST_MAX);
    setEl('vmsg', (resMode && resMode !== 'auto' ? '['+modeLabel(resMode)+'] ' : '') + reply);
    renderToolResults(data);
    speak(reply, () => setChatBusy(false));
  } catch(e) {
    const err = e.message || 'AI error — check connection and try again.';
    setEl('vmsg', err);
    speak(err.length > 180 ? 'AI request failed.' : err, () => setChatBusy(false));
  }
}

function askResearch(q) {
  if(!warroomStatus.webResearch) {
    setEl('vmsg', 'Web search not enabled on server.');
    speak('Web search is not available.');
    return;
  }
  const text = (q || document.getElementById('vinp')?.value || '').trim();
  if(!text) {
    setEl('vmsg', 'Say or type your question, e.g. search the internet for …');
    return;
  }
  ask(text, 'research');
}

function readAll() {
  ask('Give a full Tekko war room revenue brief: total MRR, ARR, revenue today, active users, churn, and MRR by product (swap, gift cards, virtual cards, transfers). Flag any guardian or transaction concerns.', 'tekko');
}
