'use strict';
/**
 * AGROS ST2 v6.10.7 — Non-blocking Global Historical Runtime
 * Shadow-only runtime coordinator. Trade Engine ve gerçek emir kararına yazmaz.
 * Ağır ledger/replay mutabakatı startup kritik yolunda çalıştırılmaz.
 */
const fs = require('fs');
const path = require('path');
const trainer = require('./75_st2_historical_renko_training.js');
const reconciliation = require('./78_st2_global_historical_reconciliation.js');

const VERSION = 'v6.10.7-GLOBAL-HISTORICAL-DEFERRED-RUNTIME';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const RUNTIME_FILE = path.join(DATA_DIR, 'st2-global-historical-runtime.json');
let running = false;
let activationTimer = null;
let activationScheduled = false;

function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function atomicWrite(value){ensure();const tmp=`${RUNTIME_FILE}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,RUNTIME_FILE);}
function read(){try{return fs.existsSync(RUNTIME_FILE)?JSON.parse(fs.readFileSync(RUNTIME_FILE,'utf8')):{};}catch(_){return{};}}
function enabled(){return String(process.env.AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME||'true').toLowerCase()!=='false';}
function autoTrainEnabled(){return String(process.env.AGROS_ST2_GLOBAL_HISTORICAL_AUTO_TRAIN||'true').toLowerCase()!=='false';}
function warmupMs(){return Math.max(30_000,n(process.env.AGROS_ST2_GLOBAL_HISTORICAL_WARMUP_MS,120_000));}
function configuredRange(){
  const end=process.env.AGROS_ST2_HISTORICAL_END||new Date().toISOString();
  const start=process.env.AGROS_ST2_HISTORICAL_START||new Date(Date.now()-180*86400000).toISOString();
  return {start,end,interval:process.env.AGROS_ST2_HISTORICAL_INTERVAL||'15m'};
}
function lightweightStatus(){
  const prev=read();
  const snap=prev.summarySnapshot||{};
  return {
    version:VERSION,
    enabled:enabled(),
    autoTrain:autoTrainEnabled(),
    running,
    lastRunAt:prev.lastRunAt||null,
    lastSuccessAt:prev.lastSuccessAt||null,
    lastSummaryAt:prev.lastSummaryAt||snap.at||null,
    lastError:prev.lastError||null,
    coins:n(snap.coins,reconciliation.COINS.length),
    readyCoins:n(snap.readyCoins,n(prev.alreadyReady,0)),
    signals:n(snap.signals,0),
    patterns:n(snap.patterns,0),
    reconciliationOk:snap.reconciliationOk===true,
    statusSource:snap.at?'CACHED_SNAPSHOT':'LIGHTWEIGHT_STATE'
  };
}
function refreshStatus(){
  const rec=reconciliation.summary();
  const prev=read();
  const snapshot={
    at:new Date().toISOString(),
    coins:reconciliation.COINS.length,
    readyCoins:n(rec?.historical?.readyCoins),
    signals:n(rec?.historical?.signals),
    patterns:n(rec?.historical?.readyPatterns),
    reconciliationOk:rec?.reconciliation?.ok===true
  };
  atomicWrite({...prev,version:VERSION,lastSummaryAt:snapshot.at,summarySnapshot:snapshot});
  return {...lightweightStatus(),...snapshot,statusSource:'FRESH_RECONCILIATION'};
}
function status(options={}){
  return options.refresh===true?refreshStatus():lightweightStatus();
}
async function trainMissing(){
  if(running)return lightweightStatus();
  running=true;
  const startedAt=new Date().toISOString(), range=configuredRange();
  let runtime={...read(),version:VERSION,startedAt,lastRunAt:startedAt,targets:[],totalTargets:0,completedTargets:0,failedTargets:0,lastError:null};
  try{
    for(const fn of ['load','save','downloadKlines','trainSymbol']){
      if(typeof trainer[fn]!=='function')throw new Error(`TRAINER_EXPORT_MISSING:${fn}`);
    }
    const canonicalSymbols=Array.isArray(reconciliation.SYMBOLS)&&reconciliation.SYMBOLS.length?reconciliation.SYMBOLS:trainer.DEFAULT_SYMBOLS;
    if(!Array.isArray(canonicalSymbols)||canonicalSymbols.length!==reconciliation.COINS.length)throw new Error('CANONICAL_COIN_POOL_INVALID');
    let state=trainer.load();
    const ready=new Set(Object.keys(state.symbols||{}).filter(s=>n(state.symbols[s]?.signals)>0));
    const targets=canonicalSymbols.filter(s=>!ready.has(s));
    runtime={...runtime,targets,totalTargets:targets.length,alreadyReady:ready.size}; atomicWrite(runtime);
    console.log(`🌍 [GLOBAL HISTORICAL TRAIN START] Hazır ${ready.size}/${canonicalSymbols.length} | Hedef ${targets.length}`);
    const trainedSymbols=[], failedSymbols=[];
    for(let i=0;i<targets.length;i++){
      const symbol=targets[i], itemStartedAt=new Date().toISOString();
      console.log(`🌍 [GLOBAL HISTORICAL TRAIN ${i+1}/${targets.length}] ${symbol} START`);
      try{
        const candles=await trainer.downloadKlines(symbol,range.interval,Date.parse(range.start),Date.parse(range.end),{});
        state=trainer.trainSymbol(symbol,candles,{minTrainingN:n(process.env.AGROS_ST2_HISTORICAL_MIN_N,30),maxHoldBars:n(process.env.AGROS_ST2_HISTORICAL_MAX_HOLD_BARS,32)},state);
        trainer.save(state); trainedSymbols.push(symbol);
        const signals=n(state.symbols?.[symbol]?.signals);
        runtime={...runtime,currentSymbol:symbol,completedTargets:trainedSymbols.length,failedTargets:failedSymbols.length,trainedSymbols,failedSymbols,lastProgressAt:new Date().toISOString(),lastError:null}; atomicWrite(runtime);
        console.log(`✅ [GLOBAL HISTORICAL TRAIN ${i+1}/${targets.length}] ${symbol} OK | Mum ${candles.length} | Sinyal ${signals}`);
      }catch(e){
        failedSymbols.push({symbol,error:e.message||String(e),at:new Date().toISOString(),startedAt:itemStartedAt});
        runtime={...runtime,currentSymbol:symbol,completedTargets:trainedSymbols.length,failedTargets:failedSymbols.length,trainedSymbols,failedSymbols,lastProgressAt:new Date().toISOString(),lastError:e.message||String(e)}; atomicWrite(runtime);
        console.error(`❌ [GLOBAL HISTORICAL TRAIN ${i+1}/${targets.length}] ${symbol} FAIL | ${e.message||e}`);
      }
    }
    const completedAt=new Date().toISOString();
    atomicWrite({...runtime,currentSymbol:null,completedAt,lastSuccessAt:failedSymbols.length?null:completedAt,partialSuccessAt:trainedSymbols.length?completedAt:null,trainedSymbols,failedSymbols,lastError:failedSymbols.length?`${failedSymbols.length}_SYMBOL_FAILED`:null});
    console.log(`🌍 [GLOBAL HISTORICAL TRAIN COMPLETE] Başarılı ${trainedSymbols.length} | Hatalı ${failedSymbols.length} | Toplam ${targets.length}`);
  }catch(e){
    atomicWrite({...runtime,failedAt:new Date().toISOString(),lastError:e.message||String(e)});
    console.error(`❌ [GLOBAL HISTORICAL RUNTIME FATAL] ${e.message||e}`);
  }finally{running=false;}
  try{return refreshStatus();}catch(e){console.error(`⚠️ [GLOBAL HISTORICAL SUMMARY] ${e.message||e}`);return lightweightStatus();}
}
async function deferredWork(){
  try{
    if(autoTrainEnabled()) await trainMissing();
    else refreshStatus();
  }catch(e){
    const prev=read();
    atomicWrite({...prev,version:VERSION,lastError:e.message||String(e),lastErrorAt:new Date().toISOString()});
    console.error(`❌ [GLOBAL HISTORICAL DEFERRED] ${e.message||e}`);
  }
}
function activate(options={}){
  const s=lightweightStatus();
  if(!s.enabled)return {...s,activation:'DISABLED',warmupMs:0};
  const delay=Math.max(0,n(options.warmupMs,warmupMs()));
  if(!activationScheduled&&!running){
    activationScheduled=true;
    const scheduler=typeof options.scheduler==='function'?options.scheduler:(fn,ms)=>setTimeout(fn,ms);
    activationTimer=scheduler(()=>{activationTimer=null;deferredWork();},delay);
    activationTimer?.unref?.();
  }
  return {...s,activation:s.autoTrain?'AUTO_TRAIN_DEFERRED':'READ_ONLY_REFRESH_DEFERRED',warmupMs:delay};
}
function resetForTest(){
  if(activationTimer&&typeof clearTimeout==='function')clearTimeout(activationTimer);
  activationTimer=null;activationScheduled=false;running=false;
}
module.exports={VERSION,RUNTIME_FILE,enabled,autoTrainEnabled,warmupMs,status,lightweightStatus,refreshStatus,trainMissing,activate,_deferredWork:deferredWork,_resetForTest:resetForTest};
