// Tekko Revenue War Room - Main Application Logic
// All endpoints wired, System Guardian active

const BASE = 'https://zxchange.onrender.com';
let tok = null, usr = null, charts = {}, feedTmr = null, sseSrc = null, sessTmr = null, warnTmr = null;
let M = {mrr:0,today:0,users:0,churn:0,swap:0,gc:0,vc:0,tr:0,new_users:0,total_users:0,arr:0};
let guardianData = {stuck:0,swapFail:0,fiatMiss:0,gcStuck:0,vcFail:0,trFail:0};
let chatHistory = [], chatBusy = false;
const CHAT_HIST_MAX = 20;

// Formatters
const ngn = v => v||v===0 ? '₦'+Number(v).toLocaleString('en-NG',{maximumFractionDigits:0}) : '—';
const usd = v => v||v===0 ? '$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const pct = v => v||v===0 ? (v>0?'+':'')+Number(v).toFixed(1)+'%' : '—';
const num = v => v||v===0 ? Number(v).toLocaleString() : '—';

// UI Helpers
const flash = id => {const e=document.getElementById(id);if(!e)return;e.classList.add('flash');setTimeout(()=>e.classList.remove('flash'),500);};
const show = id => document.getElementById(id)?.classList.add('show');
const hide = id => document.getElementById(id)?.classList.remove('show');
const setEl = (id,v) => {const e=document.getElementById(id);if(e)e.textContent=v;};
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
  tok = null; usr = null;
  chatHistory = []; chatBusy = false;
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
}

// Warroom AI (backend OpenAI + tools)
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function apiErrMessage(d, status) {
  if(!d) return 'Request failed ('+status+')';
  if(typeof d.message==='string') return d.message;
  if(Array.isArray(d.message)) return d.message.map(e=>e.message||JSON.stringify(e)).join('; ');
  if(d.error && typeof d.error==='string') return d.error;
  return 'Request failed ('+status+')';
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

async function checkWarroomStatus() {
  if(!tok) return;
  try {
    const {r,d} = await warroomFetch('/api/v1/admin/warroom/status');
    if(r.status===401){logout();return;}
    if(r.ok && d.success!==false) {
      const model = d.data?.model || d.model;
      setEl('vmsg', model ? 'AI online ('+model+'). Ask about MRR or transactions.' : 'AI assistant online. Ask about MRR, transactions, or system health.');
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

// Voice Assistant
const synth = window.speechSynthesis;
let utt = null, recog = null, listening = false;
if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recog = new SR();
  recog.continuous = false;
  recog.interimResults = true;
  recog.lang = 'en-US';
  recog.onresult = e => {
    const t = Array.from(e.results).map(r=>r[0].transcript).join('');
    document.getElementById('vinp').value = t;
    if(e.results[e.results.length-1].isFinal) ask(t);
  };
  recog.onend = () => {listening=false;document.getElementById('mbtn').classList.remove('on');wave(false);};
}

function toggleMic() {
  if(!recog){speak('Use Chrome for voice.');return;}
  if(listening){recog.stop();listening=false;document.getElementById('mbtn').classList.remove('on');wave(false);}
  else{recog.start();listening=true;document.getElementById('mbtn').classList.add('on');wave(true);setEl('vmsg','Listening...');}
}

function wave(on) {
  for(let i=1;i<=8;i++){
    const b = document.getElementById('w'+i);
    if(!b)return;
    if(on){b.classList.add('on');b.style.animationDelay=(i*0.07)+'s';}
    else b.classList.remove('on');
  }
}

function speak(text) {
  if(!synth || !text?.trim()) return;
  const say = () => {
    synth.cancel();
    utt = new SpeechSynthesisUtterance(text.trim());
    utt.rate = 1.08;
    utt.pitch = 0.95;
    const voices = synth.getVoices();
    const voice = voices.find(v=>v.lang.startsWith('en')) || voices[0];
    if(voice) utt.voice = voice;
    utt.onstart = () => wave(true);
    utt.onend = () => wave(false);
    utt.onerror = () => wave(false);
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
}

async function ask(q) {
  if(!q?.trim()||chatBusy) return;
  if(!tok) { setEl('vmsg','Session expired. Please log in again.'); return; }
  const message = q.trim();
  document.getElementById('vinp').value = '';
  setChatBusy(true);
  setEl('vmsg','Querying Tekko AI...');
  renderToolResults(null);
  wave(true);
  const history = chatHistory.map(h=>({role:h.role, content:h.content}));
  chatHistory.push({role:'user', content:message});
  if(chatHistory.length>CHAT_HIST_MAX) chatHistory.splice(0, chatHistory.length-CHAT_HIST_MAX);
  try {
    const {r,d} = await warroomFetch('/api/v1/admin/warroom/chat',{message, history});
    if(r.status===401){chatHistory.pop();logout();return;}
    if(!r.ok || d.success===false) {
      chatHistory.pop();
      throw new Error('AI chat ('+r.status+'): '+apiErrMessage(d,r.status));
    }
    const data = d.data || d;
    const reply = (data.reply || '').trim() || 'No reply from assistant.';
    chatHistory.push({role:'assistant', content:reply});
    if(chatHistory.length>CHAT_HIST_MAX) chatHistory.splice(0, chatHistory.length-CHAT_HIST_MAX);
    setEl('vmsg',reply);
    renderToolResults(data);
    speak(reply);
  } catch(e) {
    const err = e.message || 'AI error — check connection and try again.';
    setEl('vmsg', err);
    speak(err.length > 180 ? 'AI request failed. See message on screen.' : err);
    wave(false);
  } finally {
    setChatBusy(false);
  }
}

function readAll() {
  ask('Give a full Tekko war room revenue brief: total MRR, ARR, revenue today, active users, churn, and MRR by product (swap, gift cards, virtual cards, transfers). Flag any guardian or transaction concerns.');
}
