'use strict';
/**
 * AGROS ST2 v6.13.5-R22.2 — POST-CLOSE 24H PRICE PATH
 *
 * Amaç:
 * - Yalnız gerçek pozisyon kapandıktan sonra bilimsel gölge izleme yapar.
 * - Orijinal giriş fiyatını referans alarak 24 saat boyunca MFE/MAE, eşik hit sırası
 *   ve zaman checkpoint'leri üretir.
 * - Binance emri/stop/TP göndermez; yeni ağ isteği üretmez. Yalnız mevcut canlı fiyat cache'ini okur.
 * - Restart sonrası state'ten devam eder.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.13.5-R22.2-POST-CLOSE-24H-PRICE-PATH';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-post-close-24h-price-path.json');
const LEDGER_FILE = path.join(DATA_DIR, 'st2-post-close-24h-price-path.jsonl');
const POSITIVE_LEVELS = [0.25,0.50,0.75,1.00,1.25,1.50,2.00,2.50,3.00];
const NEGATIVE_LEVELS = [-0.50,-0.75,-1.00,-1.25,-1.50,-2.00,-2.50,-3.00];
const CHECKPOINTS = [
  ['15M',15*60*1000],['30M',30*60*1000],['1H',60*60*1000],['2H',2*60*60*1000],
  ['4H',4*60*60*1000],['8H',8*60*60*1000],['12H',12*60*60*1000],['24H',24*60*60*1000]
];

let cache = null;
let dirty = false;
let lastPersistAt = 0;
let persistTimer = null;

function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function ensureDir(){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); }
function blank(){ return {version:VERSION,updatedAt:null,active:{},completed:[]}; }
function hydrate(raw){ const s=blank(); if(raw&&typeof raw==='object'){s.active=raw.active&&typeof raw.active==='object'?raw.active:{};s.completed=Array.isArray(raw.completed)?raw.completed:[];s.updatedAt=raw.updatedAt||null;} return s; }
function load(){
  if(cache) return cache;
  try { cache=hydrate(JSON.parse(fs.readFileSync(STATE_FILE,'utf8'))); }
  catch(_){ cache=blank(); }
  return cache;
}
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function movePct(direction,entry,price){
  if(!(entry>0&&price>0)) return 0;
  return direction==='SHORT' ? ((entry-price)/entry)*100 : ((price-entry)/entry)*100;
}
function idFor(pos,ctx={}){
  const sym=String(pos?.sym||pos?.symbol||'UNKNOWN').toUpperCase();
  const dir=String(pos?.yon||'UNKNOWN').toUpperCase();
  const opened=n(pos?.acilisZamani||pos?.zaman||ctx.openedAt);
  const closed=n(ctx.closedAt,Date.now());
  return `${sym}|${dir}|${opened}|${closed}`;
}
function schedulePersist(force=false){
  dirty=true;
  const interval=Math.max(5000,n(ayarlar.postCloseTakipStateKayitAraligiMs,60000));
  if(force || Date.now()-lastPersistAt>=interval) return persistNow();
  if(persistTimer) return;
  const wait=Math.max(10,interval-(Date.now()-lastPersistAt));
  persistTimer=setTimeout(()=>{persistTimer=null;persistNow();},wait); persistTimer.unref?.();
}
function persistNow(){
  if(!dirty && fs.existsSync(STATE_FILE)) return;
  ensureDir();
  const state=load(); state.updatedAt=new Date().toISOString();
  const tmp=`${STATE_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp,JSON.stringify(state,null,2)); fs.renameSync(tmp,STATE_FILE);
  dirty=false; lastPersistAt=Date.now();
}
function appendLedger(row){ try{ensureDir();fs.appendFileSync(LEDGER_FILE,JSON.stringify(row)+'\n');}catch(_){} }
function observeLevels(exp,pct,now){
  exp.levelHits ||= {};
  for(const x of POSITIVE_LEVELS){ const k=`+${x.toFixed(2)}%`; if(pct>=x && !exp.levelHits[k]) exp.levelHits[k]=now; }
  for(const x of NEGATIVE_LEVELS){ const k=`${x.toFixed(2)}%`; if(pct<=x && !exp.levelHits[k]) exp.levelHits[k]=now; }
}
function sample(exp,price,pct,now){
  const every=Math.max(10000,n(ayarlar.postCloseTakipOrneklemeMs,60000));
  if(exp.lastSampleAt && now-exp.lastSampleAt<every) return false;
  exp.samples ||= [];
  exp.samples.push({at:now,price,pct:Number(pct.toFixed(6))});
  if(exp.samples.length>1600) exp.samples.splice(0,exp.samples.length-1600);
  exp.lastSampleAt=now; return true;
}
function checkpoint(exp,price,pct,now){
  exp.checkpoints ||= {};
  const elapsed=now-exp.closedAt;
  const added=[];
  for(const [label,ms] of CHECKPOINTS){
    if(elapsed>=ms && !exp.checkpoints[label]){
      exp.checkpoints[label]={at:now,price,pct:Number(pct.toFixed(6)),bestPct:Number(exp.bestPct.toFixed(6)),worstPct:Number(exp.worstPct.toFixed(6))};
      added.push({label,snapshot:clone(exp.checkpoints[label])});
    }
  }
  return added;
}
function start(pos={},ctx={}){
  if(ayarlar.postClose24hTakipAktif!==true) return {accepted:false,reason:'DISABLED'};
  if(pos?.sanal!==false) return {accepted:false,reason:'REAL_ONLY'};
  const entry=n(ctx.entryPrice,n(pos?.realizedExecution?.entryPrice,n(pos?.girisFiyati)));
  const exit=n(ctx.exitPrice,n(pos?.realizedExecution?.exitPrice));
  const direction=String(pos?.yon||'').toUpperCase();
  if(!(entry>0&&exit>0) || !['LONG','SHORT'].includes(direction)) return {accepted:false,reason:'IDENTITY_INVALID'};
  const state=load(); const id=idFor(pos,ctx);
  if(state.active[id] || state.completed.some(x=>x.id===id)) return {accepted:false,reason:'DUPLICATE',id};
  const closedAt=n(ctx.closedAt,Date.now());
  const pct=movePct(direction,entry,exit);
  const exp={
    id,sym:String(pos?.sym||'').toUpperCase(),direction,entryPrice:entry,exitPrice:exit,
    openedAt:n(pos?.acilisZamani||pos?.zaman),closedAt,closeReason:String(ctx.reason||''),
    realizedNet:n(ctx.net),commission:n(ctx.commission),entryMode:String(pos?.girisAnalizi?.entryMode||''),
    entryT:n(pos?.girisAnalizi?.renkoEntryBrickDistance,n(pos?.girisAnalizi?.entryModeOffsetT)),
    pattern:String(pos?.girisAnalizi?.patternKodu||pos?.patternKodu||''),
    beforeCloseMfePct:n(pos?.journey?.mfePct,n(pos?.execution?.mfePct,n(pos?.maxKarYuzde))),
    beforeCloseMaePct:n(pos?.journey?.maePct,n(pos?.execution?.maePct,n(pos?.maxZararYuzde))),
    bestPct:pct,worstPct:pct,bestAt:closedAt,worstAt:closedAt,lastPrice:exit,lastPct:pct,lastSeenAt:closedAt,
    missingTicks:0,lastSampleAt:0,samples:[],checkpoints:{},levelHits:{},status:'ACTIVE'
  };
  observeLevels(exp,pct,closedAt); sample(exp,exit,pct,closedAt);
  state.active[id]=exp; schedulePersist(true);
  return {accepted:true,id,active:Object.keys(state.active).length,experiment:clone(exp)};
}
function finish(state,id,exp,now){
  exp.status='COMPLETED'; exp.completedAt=now;
  const row=clone(exp); state.completed.push(row);
  const cap=Math.max(50,Math.floor(n(ayarlar.postCloseTakipTamamlananSakla,1000)));
  if(state.completed.length>cap) state.completed.splice(0,state.completed.length-cap);
  delete state.active[id]; appendLedger(row); return row;
}
function advance(prices={},now=Date.now()){
  const state=load(); if(ayarlar.postClose24hTakipAktif!==true) return {active:Object.keys(state.active).length,completed:0,events:[]};
  const maxMs=Math.max(1,n(ayarlar.postCloseTakipSaat,24))*60*60*1000;
  let changed=false,completed=0; const events=[];
  for(const [id,exp] of Object.entries(state.active)){
    const price=n(prices?.[exp.sym]);
    if(!(price>0)){ exp.missingTicks=n(exp.missingTicks)+1; continue; }
    const pct=movePct(exp.direction,exp.entryPrice,price);
    exp.lastPrice=price; exp.lastPct=pct; exp.lastSeenAt=now;
    if(pct>n(exp.bestPct,-Infinity)){exp.bestPct=pct;exp.bestAt=now;changed=true;}
    if(pct<n(exp.worstPct,Infinity)){exp.worstPct=pct;exp.worstAt=now;changed=true;}
    const hitsBefore=Object.keys(exp.levelHits||{}).length; observeLevels(exp,pct,now); if(Object.keys(exp.levelHits||{}).length!==hitsBefore) changed=true;
    if(sample(exp,price,pct,now)) changed=true;
    const addedCheckpoints=checkpoint(exp,price,pct,now);
    if(addedCheckpoints.length){
      changed=true;
      for(const cp of addedCheckpoints) events.push({type:'CHECKPOINT',id,sym:exp.sym,direction:exp.direction,label:cp.label,snapshot:cp.snapshot});
    }
    if(now-exp.closedAt>=maxMs){ const row=finish(state,id,exp,now); completed++; changed=true; events.push({type:'COMPLETE',row}); }
  }
  if(changed) schedulePersist(completed>0);
  return {active:Object.keys(state.active).length,completed,events};
}
function summary(){ const s=load(); return {version:VERSION,stateFile:STATE_FILE,ledgerFile:LEDGER_FILE,active:Object.keys(s.active).length,completed:s.completed.length,updatedAt:s.updatedAt}; }
function snapshot(){ return clone(load()); }
function resetForTest(){ cache=blank();dirty=false;lastPersistAt=0;if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}return cache; }

module.exports={VERSION,STATE_FILE,LEDGER_FILE,start,advance,summary,snapshot,movePct,_resetForTest:resetForTest,_persistNow:persistNow};
