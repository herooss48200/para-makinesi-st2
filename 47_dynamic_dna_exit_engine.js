/**
 * AGROS v3.13.0 - DYNAMIC DNA EXIT ENGINE / SHADOW MODE
 *
 * Bir DNA'ya tek ve kalıcı exit bağlamaz. Kapanmış replay kayıtlarını
 * DNA + piyasa rejimi + volatilite + exit modeli düzeyinde değerlendirir.
 * Seçim sırası: tam rejim -> rejim ailesi -> DNA geneli -> ACTUAL fallback.
 * Trade Engine'e müdahale etmez.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const memorySafeIo = require('./53_memory_safe_io.js');

const VERSION = 'v4.3.7-MEMORY-SAFE-REPLAY';
const DATA_DIR = path.join(__dirname, 'data');
const REPLAY_JSONL = path.join(DATA_DIR, 'exit-replay-results.jsonl');
const MODEL_JSON = path.join(DATA_DIR, 'dynamic-dna-exit-model.json');
const RUNTIME_MODEL_JSON = path.join(DATA_DIR, 'dynamic-dna-exit-runtime.json');
const HISTORY_JSONL = path.join(DATA_DIR, 'dynamic-dna-exit-decisions.jsonl');

function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=4){return Number(num(v).toFixed(d));}
function clamp(v,a,b){return Math.max(a,Math.min(b,num(v)));}
function ensureDir(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});}
function readJson(file,fallback=null,maxBytes=64*1024*1024){return memorySafeIo.readJsonBounded(file,fallback,{maxBytes});}
let modelCache = null;
let modelCacheStamp = '';
let missingRuntimeWarned = false;
function fileStamp(file){const st=fs.statSync(file);return `${st.size}:${st.mtimeMs}`;}
function readModelCached(){
  try {
    // Canlı seçim her zaman küçük runtime index üzerinden yapılır.
    if(fs.existsSync(RUNTIME_MODEL_JSON)){
      const stamp=`runtime:${fileStamp(RUNTIME_MODEL_JSON)}`;
      if(modelCache && modelCacheStamp===stamp) return modelCache;
      const loaded=readJson(RUNTIME_MODEL_JSON,null,32*1024*1024);
      if(loaded){ modelCache=loaded; modelCacheStamp=stamp; missingRuntimeWarned=false; }
      return modelCache;
    }
    // Eski/küçük kurulumlarla geriye uyumluluk. Büyük ana model canlıda parse edilmez.
    if(fs.existsSync(MODEL_JSON) && fs.statSync(MODEL_JSON).size<=64*1024*1024){
      const stamp=`full:${fileStamp(MODEL_JSON)}`;
      if(modelCache && modelCacheStamp===stamp) return modelCache;
      const loaded=readJson(MODEL_JSON,null,64*1024*1024);
      if(loaded){ modelCache=loaded; modelCacheStamp=stamp; }
      return modelCache;
    }
    if(!missingRuntimeWarned){
      const mb=fs.existsSync(MODEL_JSON)?(fs.statSync(MODEL_JSON).size/1048576).toFixed(1):'0.0';
      console.warn(`🛡️ [EXIT RUNTIME INDEX] Ana model canlıda parse edilmedi | ${mb} MB | npm run build:exit-runtime çalıştırılmalı.`);
      missingRuntimeWarned=true;
    }
    return modelCache;
  } catch(_) { return modelCache; }
}
function atomicWrite(file,value){ensureDir();const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
function uniqueCandidates(list=[]){
  const seen=new Set();return list.filter(Boolean).filter(x=>{const k=String(x.algorithmId||'');if(!k||seen.has(k))return false;seen.add(k);return true;});
}
function runtimeDnaRow(d,min){
  const regimes={};
  for(const [key,r] of Object.entries(d?.regimes||{})){
    const relative=bestRelative(r.algorithms||[],min);
    regimes[key]={key:r.key||key,family:r.family,regime:r.regime,volatility:r.volatility,best:r.best||null,algorithms:uniqueCandidates([r.best,relative])};
  }
  const allRelative=bestRelative(d?.allAlgorithms||[],Math.max(min,num(ayarlar.dynamicExitFallbackMinOrnek,5)));
  return {key:d.key,regimes,allBest:d.allBest||null,allAlgorithms:uniqueCandidates([d.allBest,allRelative])};
}
function createRuntimeModel(model){
  const min=Math.max(3,num(ayarlar.dynamicExitMinOrnek,12));
  return {
    version:model?.version||VERSION,generatedAt:model?.generatedAt||new Date().toISOString(),runtimeGeneratedAt:new Date().toISOString(),
    mode:model?.mode,totalTrades:num(model?.totalTrades),totalDna:num(model?.totalDna),totalBaseDna:num(model?.totalBaseDna),
    currentRegime:model?.currentRegime||{key:'MIXED|VOL_MEDIUM',regime:'MIXED',regimeFamily:'MIXED',volatility:'MEDIUM',window:0,distribution:{}},
    dna:(model?.dna||[]).map(d=>runtimeDnaRow(d,min)),dnaBase:(model?.dnaBase||[]).map(d=>runtimeDnaRow(d,min)),
    policy:{...(model?.policy||{}),runtimeIndex:true,fullHistoryPreserved:true}
  };
}
function writeRuntimeModel(model){const runtime=createRuntimeModel(model);atomicWrite(RUNTIME_MODEL_JSON,runtime);modelCache=runtime;modelCacheStamp=`runtime:${fileStamp(RUNTIME_MODEL_JSON)}`;return runtime;}
function forEachJsonlSync(file,onRow){
  if(!fs.existsSync(file))return {rows:0,invalid:0};
  const fd=fs.openSync(file,'r');
  const buffer=Buffer.allocUnsafe(256*1024);
  let carry='',rows=0,invalid=0;
  try{
    while(true){
      const bytes=fs.readSync(fd,buffer,0,buffer.length,null);
      if(!bytes)break;
      const text=carry+buffer.toString('utf8',0,bytes);
      const lines=text.split(/\r?\n/);carry=lines.pop()||'';
      for(const line of lines){
        if(!line.trim())continue;
        try{onRow(JSON.parse(line));rows++;}catch(_){invalid++;}
      }
    }
    if(carry.trim()){try{onRow(JSON.parse(carry));rows++;}catch(_){invalid++;}}
  }finally{fs.closeSync(fd);}
  return {rows,invalid};
}
function compactResult(r={}){
  return {
    algorithmId:r.algorithmId,algorithmLabel:r.algorithmLabel,algorithmClass:r.algorithmClass,
    exitSource:r.exitSource,confidenceNote:r.confidenceNote,dataAvailable:r.dataAvailable,
    netUsdt:num(r.netUsdt),deltaVsActualUsdt:num(r.deltaVsActualUsdt)
  };
}
function normalizeDnaKey(key=''){
  const raw=String(key||'').trim().toUpperCase(); if(!raw)return'';
  const short=raw.match(/^([LS])_B([01Y]{4})_C([01Y]{4})(?:_(.+))?$/);
  if(short)return `YON=${short[1]==='S'?'SHORT':'LONG'}|BTC=${short[2]}|COIN=${short[3]}${short[4]?`|DETAIL=${short[4]}`:''}`;
  const yon=raw.match(/(?:^|\|)YON=(LONG|SHORT)(?:\||$)/)?.[1];
  const btc=raw.match(/(?:^|\|)BTC=([01Y]{4})(?:\||$)/)?.[1];
  const coin=raw.match(/(?:^|\|)COIN=([01Y]{4})(?:\||$)/)?.[1];
  if(yon&&btc&&coin)return `YON=${yon}|BTC=${btc}|COIN=${coin}`;
  return raw.replace(/\s+/g,'');
}
function baseDnaKey(key=''){
  const normalized=normalizeDnaKey(key); const yon=normalized.match(/^YON=(LONG|SHORT)\|/)?.[1];
  const btc=normalized.match(/BTC=([01Y]{4})/)?.[1]; const coin=normalized.match(/COIN=([01Y]{4})/)?.[1];
  return yon&&btc&&coin?`YON=${yon}|BTC=${btc}|COIN=${coin}`:'';
}
function signature(pos){const s=pos?.blackboxAcilis?.strategySignature||{};return s.shortKey||pos?.execution?.signatureShort||s.key||pos?.execution?.signatureKey||'';}

function pathStats(input={}){
  const rows=(input.pathRows||[]).filter(x=>x&&Number.isFinite(Number(x.pnlPct))).sort((a,b)=>num(a.ts)-num(b.ts));
  if(rows.length<2)return {points:rows.length,efficiency:0,directionChangeRate:0,rmsStep:0,range:Math.max(0,num(input.mfePct)-num(input.maePct)),alignedRate:null};
  let abs=0,sq=0,changes=0,lastSign=0,aligned=0,known=0;
  for(let i=1;i<rows.length;i++){
    const step=num(rows[i].pnlPct)-num(rows[i-1].pnlPct); const sign=step>0?1:step<0?-1:0;
    abs+=Math.abs(step);sq+=step*step;if(sign&&lastSign&&sign!==lastSign)changes++;if(sign)lastSign=sign;
  }
  for(const r of rows){if(typeof r.stAligned==='boolean'){known++;if(r.stAligned)aligned++;}}
  const net=Math.abs(num(rows[rows.length-1].pnlPct)-num(rows[0].pnlPct));
  return {points:rows.length,efficiency:abs?net/abs*100:0,directionChangeRate:(rows.length-2)>0?changes/(rows.length-2)*100:0,rmsStep:Math.sqrt(sq/(rows.length-1)),range:Math.max(0,num(input.mfePct)-num(input.maePct)),alignedRate:known?aligned/known*100:null};
}
function classifyInput(input={}){
  const s=pathStats(input);
  let volatility='MEDIUM';
  if(s.rmsStep>=num(ayarlar.dynamicExitHighVolStepPct,0.12)||s.range>=num(ayarlar.dynamicExitHighVolRangePct,1.50))volatility='HIGH';
  else if(s.rmsStep<=num(ayarlar.dynamicExitLowVolStepPct,0.045)&&s.range<=num(ayarlar.dynamicExitLowVolRangePct,0.65))volatility='LOW';
  let family='MIXED';
  if(s.efficiency>=55&&s.directionChangeRate<=38)family='TREND';
  else if(s.efficiency<=28||s.directionChangeRate>=58)family='RANGE';
  else if(s.alignedRate!==null&&s.alignedRate<40)family='TRANSITION';
  let alignment='UNKNOWN';
  if(s.alignedRate!==null)alignment=s.alignedRate>=60?'ALIGNED':s.alignedRate<=40?'AGAINST':'MIXED';
  const regime=family==='TREND'?`TREND_${alignment}`:family;
  return {regimeFamily:family,regime,volatility,key:`${regime}|VOL_${volatility}`,stats:{efficiency:round(s.efficiency,1),directionChangeRate:round(s.directionChangeRate,1),rmsStep:round(s.rmsStep,5),range:round(s.range,4),alignedRate:s.alignedRate===null?null:round(s.alignedRate,1)}};
}
function groupRecords(rows=[]){
  const byTrade=new Map();
  for(const r of rows){const id=String(r.tradeId||'');if(!id)continue;const x=byTrade.get(id)||{input:null,results:[]};if(r.input)x.input=r.input;if(r.result)x.results.push(r.result);if(r.results&&r.input){x.input=r.input;x.results=r.results;}byTrade.set(id,x);}
  return [...byTrade.values()].filter(x=>x.input&&Array.isArray(x.results)&&x.results.length);
}
function loadReplayRecords(){
  const rows=[];
  forEachJsonlSync(REPLAY_JSONL,row=>rows.push(row));
  if(!rows.length)return[];
  if(rows[0]?.input&&Array.isArray(rows[0]?.results))return rows;
  return groupRecords(rows);
}
function validResult(r){
  if(!r)return false;
  if(r.dataAvailable===false)return false;
  if(String(r.algorithmClass||'')==='ATR_TRAILING' && String(r.exitSource||'')==='ATR_DATA_UNAVAILABLE')return false;
  if(String(r.algorithmClass||'')==='ATR_TRAILING' && /ATR yüzdesi fiyat yolunda yok/i.test(String(r.confidenceNote||'')))return false;
  return true;
}
function metrics(results=[]){
  const valid=results.filter(validResult);
  let net=0,grossWin=0,grossLoss=0,beat=0;
  for(const r of valid){const n=num(r.netUsdt);net+=n;if(n>0)grossWin+=n;else grossLoss+=Math.abs(n);if(num(r.deltaVsActualUsdt)>0.000001)beat++;}
  return {samples:valid.length,rawSamples:results.length,netUsdt:round(net,4),avgNetUsdt:valid.length?round(net/valid.length,5):0,profitFactor:grossLoss?round(grossWin/grossLoss,3):(grossWin>0?999:0),beatRate:valid.length?round(beat/valid.length*100,1):0};
}
function windowMetrics(results=[],size){return metrics(results.slice(-size));}
function previousWindowMetrics(results=[],size){return metrics(results.slice(-(size*2),-size));}
function algoProfile(rows=[]){
  const all=metrics(rows),w5=windowMetrics(rows,5),prev5=previousWindowMetrics(rows,5),w10=windowMetrics(rows,10),w20=windowMetrics(rows,20),w50=windowMetrics(rows,50);
  const recentScore=clamp(w5.avgNetUsdt*220,-28,28)+clamp((w5.beatRate-50)*0.50,-18,18)+clamp(w10.avgNetUsdt*100,-12,12);
  const base=clamp(all.avgNetUsdt*70,-16,16)+clamp((all.profitFactor-1)*12,-12,20)+clamp((all.beatRate-50)*0.18,-10,10);
  const strengthening=w5.samples>=5&&w5.netUsdt>0&&w5.profitFactor>1&&w5.beatRate>=50&&(prev5.samples<5||w5.avgNetUsdt>prev5.avgNetUsdt||w5.beatRate>prev5.beatRate);
  const weakening=w5.samples>=5&&(w5.netUsdt<0||w5.profitFactor<1||w5.beatRate<40||(prev5.samples>=5&&w5.avgNetUsdt<prev5.avgNetUsdt&&w5.beatRate<prev5.beatRate));
  const liveBonus=strengthening?12:weakening?-18:0;
  return {...all,windows:{5:w5,previous5:prev5,10:w10,20:w20,50:w50},score:round(clamp(50+base+recentScore+liveBonus,0,100),2),strengthening,weakening};
}
function liveSort(a,b){
  if(Boolean(a.weakening)!==Boolean(b.weakening))return a.weakening?1:-1;
  if(Boolean(a.strengthening)!==Boolean(b.strengthening))return a.strengthening?-1:1;
  return num(b.windows?.[5]?.avgNetUsdt)-num(a.windows?.[5]?.avgNetUsdt)||num(b.windows?.[5]?.beatRate)-num(a.windows?.[5]?.beatRate)||b.score-a.score||b.netUsdt-a.netUsdt;
}
function profilesFromBuckets(buckets,min){
  const profiles=[...buckets.values()].map(b=>({...b,...algoProfile(b.rows)}));
  const dnaMap=new Map();
  for(const p of profiles){const d=dnaMap.get(p.dna)||{key:p.dna,regimes:{},allAlgorithms:{}};d.regimes[p.regimeKey]=d.regimes[p.regimeKey]||{key:p.regimeKey,family:p.regimeFamily,regime:p.regime,volatility:p.volatility,algorithms:[]};d.regimes[p.regimeKey].algorithms.push(p);d.allAlgorithms[p.algorithmId]=d.allAlgorithms[p.algorithmId]||{algorithmId:p.algorithmId,algorithmLabel:p.algorithmLabel,rows:[]};d.allAlgorithms[p.algorithmId].rows.push(...p.rows);dnaMap.set(p.dna,d);}
  return [...dnaMap.values()].map(d=>{
    for(const r of Object.values(d.regimes)){r.algorithms=r.algorithms.map(x=>{const {rows,...rest}=x;return rest;}).sort(liveSort);r.best=r.algorithms.find(x=>x.algorithmId!=='ACTUAL'&&x.samples>=min&&!x.weakening&&num(x.windows?.[5]?.netUsdt)>0&&num(x.windows?.[5]?.profitFactor)>1&&x.netUsdt>0&&x.profitFactor>1&&x.beatRate>=num(ayarlar.dynamicExitMinBeatRate,55))||null;}
    const allAlgorithms=Object.values(d.allAlgorithms).map(a=>({algorithmId:a.algorithmId,algorithmLabel:a.algorithmLabel,...algoProfile(a.rows)})).sort(liveSort);
    d.allBest=allAlgorithms.find(x=>x.algorithmId!=='ACTUAL'&&x.samples>=Math.max(min,num(ayarlar.dynamicExitFallbackMinOrnek,5))&&!x.weakening&&num(x.windows?.[5]?.netUsdt)>0&&num(x.windows?.[5]?.profitFactor)>1&&x.netUsdt>0&&x.profitFactor>1&&x.beatRate>=num(ayarlar.dynamicExitMinBeatRate,55))||null;d.allAlgorithms=allAlgorithms;return d;
  });
}
function createBuildState(){return {detailBuckets:new Map(),baseBuckets:new Map(),recentRegimes:[],totalTrades:0};}
function addRecordToState(state,rec){
  if(!rec?.input||!Array.isArray(rec.results)||!rec.results.length)return;
  const input=rec.input||{};const rawDna=input.signatureShort||input.signatureKey||'SIGNATURE_YOK';
  const dna=normalizeDnaKey(rawDna)||rawDna;const base=baseDnaKey(rawDna);const regime=classifyInput(input);
  state.totalTrades++;state.recentRegimes.push(regime);
  const regimeWindow=Math.max(10,num(ayarlar.dynamicExitCurrentRegimeWindow,30));
  if(state.recentRegimes.length>regimeWindow)state.recentRegimes.shift();
  for(const source of rec.results){if(!source?.algorithmId)continue;const result=compactResult(source);
    const add=(map,keyDna)=>{if(!keyDna)return;const key=`${keyDna}|||${regime.key}|||${result.algorithmId}`;const b=map.get(key)||{dna:keyDna,regimeKey:regime.key,regimeFamily:regime.regimeFamily,regime:regime.regime,volatility:regime.volatility,algorithmId:result.algorithmId,algorithmLabel:result.algorithmLabel||result.algorithmId,rows:[]};b.rows.push(result);map.set(key,b);};
    add(state.detailBuckets,dna);add(state.baseBuckets,base);
  }
}
function finalizeBuild(state,options={}){
  const min=Math.max(3,num(options.minSamples,ayarlar.dynamicExitMinOrnek||12));
  const dna=profilesFromBuckets(state.detailBuckets,min);const dnaBase=profilesFromBuckets(state.baseBuckets,min);
  const counts={};for(const r of state.recentRegimes)counts[r.key]=(counts[r.key]||0)+1;
  const currentKey=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'MIXED|VOL_MEDIUM';const [regimePart,volPart]=currentKey.split('|');
  const model={version:VERSION,generatedAt:new Date().toISOString(),mode:'DYNAMIC_PER_TRANSFER_AND_FROZEN_PER_POSITION',totalTrades:state.totalTrades,totalDna:dna.length,totalBaseDna:dnaBase.length,currentRegime:{key:currentKey,regime:regimePart,regimeFamily:regimePart.startsWith('TREND')?'TREND':regimePart,volatility:String(volPart||'VOL_MEDIUM').replace('VOL_',''),window:state.recentRegimes.length,distribution:counts},dna,dnaBase,policy:{singlePermanentExit:false,reevaluateAtLeagueTransfer:true,freezeOnlyOpenedPosition:true,selectionOrder:['DNA_EXACT_REGIME_VOLATILITY','DNA_REGIME_FAMILY','DNA_ALL_REGIMES','BASE_DNA_FALLBACK','ACTUAL_FALLBACK'],memorySafeReplay:true}};
  if(options.persist!==false&&ayarlar.dynamicExitEngineAktif!==false){atomicWrite(MODEL_JSON,model);writeRuntimeModel(model);}return model;
}
function build(records=null,options={}){
  const state=createBuildState();
  for(const rec of records||loadReplayRecords())addRecordToState(state,rec);
  return finalizeBuild(state,options);
}
function buildFromReplayFile(options={}){
  const state=createBuildState();
  let pending=new Map();
  forEachJsonlSync(REPLAY_JSONL,row=>{
    if(row?.input&&Array.isArray(row.results)){addRecordToState(state,row);return;}
    const id=String(row?.tradeId||'');if(!id)return;
    const rec=pending.get(id)||{input:null,results:[]};
    if(row.input)rec.input=row.input;if(row.result)rec.results.push(row.result);
    pending.set(id,rec);
    if(rec.input&&rec.results.length&&row.final===true){addRecordToState(state,rec);pending.delete(id);}
  });
  for(const rec of pending.values())addRecordToState(state,rec);
  pending.clear();pending=null;
  return finalizeBuild(state,options);
}
function readModel(){return readModelCached();}
function positionRegime(pos,model){
  const explicit=pos?.marketRegime||pos?.execution?.marketRegime||pos?.blackboxAcilis?.marketRegime;
  if(explicit?.key)return explicit;
  return model?.currentRegime||{key:'MIXED|VOL_MEDIUM',regime:'MIXED',regimeFamily:'MIXED',volatility:'MEDIUM'};
}
function candidateOk(x,min){return x&&x.algorithmId!=='ACTUAL'&&num(x.samples)>=min&&!x.weakening&&num(x.netUsdt)>0&&num(x.profitFactor)>1&&num(x.beatRate)>=num(ayarlar.dynamicExitMinBeatRate,55)&&num(x.windows?.[5]?.netUsdt)>0&&num(x.windows?.[5]?.profitFactor)>1&&num(x.windows?.[5]?.avgNetUsdt)>=num(ayarlar.dynamicExitMinRecentAvg,0);}
function relativeCandidateOk(x,min){return Boolean(x&&x.algorithmId!=='ACTUAL'&&num(x.samples)>=min);}
function bestRelative(list=[],min){return list.filter(x=>relativeCandidateOk(x,min)).sort(liveSort)[0]||null;}
function selectForPosition(pos,model=null,options={}){
  const m=model||readModel()||buildFromReplayFile({persist:true});const rawDnaKey=signature(pos);const dnaKey=normalizeDnaKey(rawDnaKey);const baseKey=baseDnaKey(rawDnaKey);const d=(m?.dna||[]).find(x=>x.key===dnaKey)||(m?.dnaBase||[]).find(x=>x.key===baseKey);const usedBase=Boolean(d&&d.key===baseKey&&dnaKey!==baseKey);const regime=positionRegime(pos,m);const min=Math.max(3,num(ayarlar.dynamicExitMinOrnek,12));
  let selected=null,scope='NONE',matchedRegime=null,selectionQuality='NONE';
  if(d){
    const exact=d.regimes?.[regime.key];
    selected=exact?.best;
    if(candidateOk(selected,min)){scope=usedBase?'BASE_DNA_EXACT_REGIME_VOLATILITY':'EXACT_REGIME_VOLATILITY';matchedRegime=exact.key;selectionQuality='POSITIVE_CONFIRMED';}else selected=null;
    if(!selected){const family=Object.values(d.regimes||{}).filter(r=>r.family===regime.regimeFamily).flatMap(r=>r.algorithms||[]).filter(x=>candidateOk(x,min)).sort(liveSort)[0];if(family){selected=family;scope=usedBase?'BASE_DNA_REGIME_FAMILY':'REGIME_FAMILY';matchedRegime=family.regimeKey;selectionQuality='POSITIVE_CONFIRMED';}}
    if(!selected&&candidateOk(d.allBest,Math.max(min,num(ayarlar.dynamicExitFallbackMinOrnek,5)))){selected=d.allBest;scope=usedBase?'BASE_DNA_ALL_REGIMES':'DNA_ALL_REGIMES';matchedRegime='ALL';selectionQuality='POSITIVE_CONFIRMED';}

    // Pozitif/PF>1 exit yoksa DNA'yı exitsiz bırakma: en az 5 örnekli adaylar
    // arasından canlı sıralamada göreceli olarak en iyi sonucu veren modeli ata.
    if(!selected&&exact){const relative=bestRelative(exact.algorithms||[],min);if(relative){selected=relative;scope=usedBase?'BASE_DNA_EXACT_REGIME_RELATIVE_BEST':'EXACT_REGIME_RELATIVE_BEST';matchedRegime=exact.key;selectionQuality='RELATIVE_BEST';}}
    if(!selected){const familyRelative=bestRelative(Object.values(d.regimes||{}).filter(r=>r.family===regime.regimeFamily).flatMap(r=>r.algorithms||[]),min);if(familyRelative){selected=familyRelative;scope=usedBase?'BASE_DNA_FAMILY_RELATIVE_BEST':'FAMILY_RELATIVE_BEST';matchedRegime=familyRelative.regimeKey;selectionQuality='RELATIVE_BEST';}}
    if(!selected){const allRelative=bestRelative(d.allAlgorithms||[],Math.max(min,num(ayarlar.dynamicExitFallbackMinOrnek,5)));if(allRelative){selected=allRelative;scope=usedBase?'BASE_DNA_ALL_RELATIVE_BEST':'DNA_ALL_RELATIVE_BEST';matchedRegime='ALL';selectionQuality='RELATIVE_BEST';}}
  }
  const ready=Boolean(selected);
  const plan={version:VERSION,mode:'SHADOW_ONLY',signature:dnaKey||rawDnaKey||'SIGNATURE_YOK',baseSignature:baseKey||null,currentRegime:regime,matchedRegime,selectionScope:scope,selectionQuality,selectedAlgorithmId:ready?selected.algorithmId:'ACTUAL',selectedAlgorithmLabel:ready?selected.algorithmLabel:'Mevcut Kademe Sistemi',ready,samples:ready?selected.samples:0,beatRate:ready?selected.beatRate:0,profitFactor:ready?selected.profitFactor:0,netUsdt:ready?selected.netUsdt:0,recent5:ready?selected.windows?.[5]:null,recent20:ready?selected.windows?.[20]:null,strengthening:ready?selected.strengthening:false,weakening:ready?selected.weakening:false,reason:ready?(selectionQuality==='RELATIVE_BEST'?`${regime.key} için pozitif exit yok; göreceli en iyi atandı: ${selected.algorithmLabel}`:`${regime.key} için ${scope}: ${selected.algorithmLabel}`):`${dnaKey?'Bu DNA için en az 5 örnekli dinamik exit henüz yok; mevcut kademe kullanılır.':'DNA imzası yok.'}`,createdAt:new Date().toISOString(),executionPolicy:'FREEZE_PER_OPEN_POSITION_ROTATE_FOR_NEW_POSITIONS_EVERY_5_CLOSES'};
  if(options.persistDecision!==false){ensureDir();fs.appendFileSync(HISTORY_JSONL,JSON.stringify({...plan,symbol:pos?.sym||'',side:pos?.yon||''})+'\n');}return plan;
}
function updateFromReplay(){return buildFromReplayFile({persist:true});}
function telegramSummary(model=null,limit=5){const m=model||readModel();if(!m)return'';let t=`\n\n🧬 <b>DİNAMİK DNA EXIT MOTORU</b>\n🌦️ Güncel rejim: <b>${m.currentRegime.key}</b> | Pencere ${m.currentRegime.window}\n🔁 Kural: Aynı DNA, farklı rejimde farklı exit seçebilir.\n`;const leaders=[];for(const d of m.dna||[]){const r=d.regimes?.[m.currentRegime.key];if(r?.best)leaders.push({dna:d.key,b:r.best});}leaders.sort((a,b)=>b.b.score-a.b.score);t+=leaders.slice(0,limit).map((x,i)=>`${i+1}. ${x.dna} → ${x.b.algorithmLabel} | N${x.b.samples} | PF ${num(x.b.profitFactor).toFixed(2)} | Beat %${num(x.b.beatRate).toFixed(1)}`).join('\n')||'Bu rejimde yeterli kanıtlı exit henüz yok.';t+='\n🛡️ Shadow mod: gerçek çıkış sistemi değişmedi.';return t;}

module.exports={VERSION,MODEL_JSON,RUNTIME_MODEL_JSON,normalizeDnaKey,baseDnaKey,classifyInput,build,buildFromReplayFile,createRuntimeModel,writeRuntimeModel,readModel,selectForPosition,updateFromReplay,telegramSummary};
