'use strict';
/**
 * AGROS ST2 v6.1.3 — Global Historical Worker Completion & Recovery
 * Shadow-only runtime coordinator. Trade Engine ve gerçek emir kararına yazmaz.
 */
const fs = require('fs');
const path = require('path');
const trainer = require('./75_st2_historical_renko_training.js');
const reconciliation = require('./78_st2_global_historical_reconciliation.js');

const VERSION = 'v6.1.3-GLOBAL-HISTORICAL-WORKER-COMPLETION';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const RUNTIME_FILE = path.join(DATA_DIR, 'st2-global-historical-runtime.json');
let running = false;

function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function ensure(){fs.mkdirSync(DATA_DIR,{recursive:true});}
function atomicWrite(value){ensure();const tmp=`${RUNTIME_FILE}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,RUNTIME_FILE);}
function read(){try{return fs.existsSync(RUNTIME_FILE)?JSON.parse(fs.readFileSync(RUNTIME_FILE,'utf8')):{};}catch(_){return{};}}
function enabled(){return String(process.env.AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME||'true').toLowerCase()!=='false';}
function autoTrainEnabled(){return String(process.env.AGROS_ST2_GLOBAL_HISTORICAL_AUTO_TRAIN||'true').toLowerCase()!=='false';}
function configuredRange(){
  const end=process.env.AGROS_ST2_HISTORICAL_END||new Date().toISOString();
  const start=process.env.AGROS_ST2_HISTORICAL_START||new Date(Date.now()-180*86400000).toISOString();
  return {start,end,interval:process.env.AGROS_ST2_HISTORICAL_INTERVAL||'15m'};
}
function status(){
  const rec=reconciliation.summary(), prev=read();
  return {version:VERSION,enabled:enabled(),autoTrain:autoTrainEnabled(),running,lastRunAt:prev.lastRunAt||null,lastSuccessAt:prev.lastSuccessAt||null,lastError:prev.lastError||null,coins:reconciliation.COINS.length,readyCoins:rec.historical.readyCoins,signals:rec.historical.signals,patterns:rec.historical.readyPatterns,reconciliationOk:rec.reconciliation.ok};
}
async function trainMissing(){
  if(running)return status();
  running=true;
  const startedAt=new Date().toISOString(), range=configuredRange();
  let runtime={version:VERSION,startedAt,lastRunAt:startedAt,targets:[],totalTargets:0,completedTargets:0,failedTargets:0,lastError:null};
  try{
    for(const fn of ['load','save','downloadKlines','trainSymbol']){
      if(typeof trainer[fn]!=='function')throw new Error(`TRAINER_EXPORT_MISSING:${fn}`);
    }
    const canonicalSymbols=Array.isArray(reconciliation.SYMBOLS)&&reconciliation.SYMBOLS.length?reconciliation.SYMBOLS:trainer.DEFAULT_SYMBOLS;
    if(!Array.isArray(canonicalSymbols)||canonicalSymbols.length!==reconciliation.COINS.length)throw new Error('CANONICAL_30_COIN_POOL_INVALID');
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
  return status();
}
function activate(){
  const s=status();
  if(!s.enabled)return {...s,activation:'DISABLED'};
  if(s.autoTrain&&!running){setImmediate(()=>trainMissing().catch(e=>console.error(`❌ [GLOBAL HISTORICAL RUNTIME] ${e.message}`)));}
  return {...s,activation:s.autoTrain?'AUTO_TRAIN_SCHEDULED':'READ_ONLY_ACTIVE'};
}
module.exports={VERSION,RUNTIME_FILE,enabled,autoTrainEnabled,status,trainMissing,activate};
