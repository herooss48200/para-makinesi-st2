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

const VERSION = 'v3.13.0-DYNAMIC-DNA-EXIT-SHADOW';
const DATA_DIR = path.join(__dirname, 'data');
const REPLAY_JSONL = path.join(DATA_DIR, 'exit-replay-results.jsonl');
const MODEL_JSON = path.join(DATA_DIR, 'dynamic-dna-exit-model.json');
const HISTORY_JSONL = path.join(DATA_DIR, 'dynamic-dna-exit-decisions.jsonl');

function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=4){return Number(num(v).toFixed(d));}
function clamp(v,a,b){return Math.max(a,Math.min(b,num(v)));}
function ensureDir(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});}
function readJson(file,fallback=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(_){return fallback;}}
function atomicWrite(file,value){ensureDir();const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}
function readLines(file){try{return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}catch(_){return[];}}
function signature(pos){const s=pos?.blackboxAcilis?.strategySignature||{};return s.shortKey||pos?.execution?.signatureShort||'';}

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
  const rows=readLines(REPLAY_JSONL); if(!rows.length)return[];
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
function algoProfile(rows=[]){
  const all=metrics(rows),w10=windowMetrics(rows,10),w20=windowMetrics(rows,20),w50=windowMetrics(rows,50);
  const recentScore=clamp(w10.avgNetUsdt*140,-20,20)+clamp(w20.avgNetUsdt*100,-20,20)+clamp((w20.beatRate-50)*0.35,-15,15);
  const base=clamp(all.avgNetUsdt*90,-20,20)+clamp((all.profitFactor-1)*15,-15,25)+clamp((all.beatRate-50)*0.25,-12,12);
  const stability=(w10.samples>=5&&w20.samples>=10&&w10.avgNetUsdt>=-0.01&&w20.avgNetUsdt>=-0.01)?8:0;
  return {...all,windows:{10:w10,20:w20,50:w50},score:round(clamp(50+base+recentScore+stability,0,100),2),strengthening:w10.samples>=5&&w20.samples>=10&&w10.avgNetUsdt>w20.avgNetUsdt&&w10.beatRate>=w20.beatRate-5};
}
function build(records=null,options={}){
  const data=records||loadReplayRecords(); const buckets=new Map(); const recentRegimes=[];
  for(const rec of data){const input=rec.input||{};const dna=input.signatureShort||input.signatureKey||'SIGNATURE_YOK';const regime=classifyInput(input);recentRegimes.push(regime);
    for(const result of rec.results||[]){if(!result?.algorithmId)continue;const key=`${dna}|||${regime.key}|||${result.algorithmId}`;const b=buckets.get(key)||{dna,regimeKey:regime.key,regimeFamily:regime.regimeFamily,regime:regime.regime,volatility:regime.volatility,algorithmId:result.algorithmId,algorithmLabel:result.algorithmLabel||result.algorithmId,rows:[]};b.rows.push(result);buckets.set(key,b);}}
  const profiles=[...buckets.values()].map(b=>({...b,...algoProfile(b.rows)}));
  const dnaMap=new Map();
  for(const p of profiles){const d=dnaMap.get(p.dna)||{key:p.dna,regimes:{},allAlgorithms:{}};d.regimes[p.regimeKey]=d.regimes[p.regimeKey]||{key:p.regimeKey,family:p.regimeFamily,regime:p.regime,volatility:p.volatility,algorithms:[]};d.regimes[p.regimeKey].algorithms.push(p);d.allAlgorithms[p.algorithmId]=d.allAlgorithms[p.algorithmId]||{algorithmId:p.algorithmId,algorithmLabel:p.algorithmLabel,rows:[]};d.allAlgorithms[p.algorithmId].rows.push(...p.rows);dnaMap.set(p.dna,d);}
  const min=Math.max(3,num(options.minSamples,ayarlar.dynamicExitMinOrnek||12));
  const dna=[...dnaMap.values()].map(d=>{
    for(const r of Object.values(d.regimes)){r.algorithms=r.algorithms.map(x=>{const {rows,...rest}=x;return rest;}).sort((a,b)=>b.score-a.score||b.netUsdt-a.netUsdt);r.best=r.algorithms.find(x=>x.algorithmId!=='ACTUAL'&&x.samples>=min&&x.netUsdt>0&&x.profitFactor>1&&x.beatRate>=num(ayarlar.dynamicExitMinBeatRate,55))||null;}
    const allAlgorithms=Object.values(d.allAlgorithms).map(a=>({algorithmId:a.algorithmId,algorithmLabel:a.algorithmLabel,...algoProfile(a.rows)})).sort((a,b)=>b.score-a.score||b.netUsdt-a.netUsdt);
    d.allBest=allAlgorithms.find(x=>x.algorithmId!=='ACTUAL'&&x.samples>=Math.max(min,num(ayarlar.dynamicExitFallbackMinOrnek,20))&&x.netUsdt>0&&x.profitFactor>1&&x.beatRate>=num(ayarlar.dynamicExitMinBeatRate,55))||null;d.allAlgorithms=allAlgorithms;return d;});
  const recent=recentRegimes.slice(-Math.max(10,num(ayarlar.dynamicExitCurrentRegimeWindow,30)));const counts={};for(const r of recent)counts[r.key]=(counts[r.key]||0)+1;const currentKey=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'MIXED|VOL_MEDIUM';const [regimePart,volPart]=currentKey.split('|');
  const model={version:VERSION,generatedAt:new Date().toISOString(),mode:'SHADOW_ONLY_DYNAMIC_REGIME',totalTrades:data.length,totalDna:dna.length,currentRegime:{key:currentKey,regime:regimePart,regimeFamily:regimePart.startsWith('TREND')?'TREND':regimePart,volatility:String(volPart||'VOL_MEDIUM').replace('VOL_',''),window:recent.length,distribution:counts},dna,policy:{singlePermanentExit:false,tradeEngineEffect:false,selectionOrder:['DNA_EXACT_REGIME_VOLATILITY','DNA_REGIME_FAMILY','DNA_ALL_REGIMES','ACTUAL_FALLBACK']}};
  if(options.persist!==false&&ayarlar.dynamicExitEngineAktif!==false)atomicWrite(MODEL_JSON,model);return model;
}
function readModel(){return readJson(MODEL_JSON,null);}
function positionRegime(pos,model){
  const explicit=pos?.marketRegime||pos?.execution?.marketRegime||pos?.blackboxAcilis?.marketRegime;
  if(explicit?.key)return explicit;
  return model?.currentRegime||{key:'MIXED|VOL_MEDIUM',regime:'MIXED',regimeFamily:'MIXED',volatility:'MEDIUM'};
}
function candidateOk(x,min){return x&&x.algorithmId!=='ACTUAL'&&num(x.samples)>=min&&num(x.netUsdt)>0&&num(x.profitFactor)>1&&num(x.beatRate)>=num(ayarlar.dynamicExitMinBeatRate,55)&&num(x.windows?.[20]?.avgNetUsdt)>=num(ayarlar.dynamicExitMinRecentAvg,-0.01);}
function selectForPosition(pos,model=null){
  const m=model||readModel()||build(null,{persist:true});const dnaKey=signature(pos);const d=(m?.dna||[]).find(x=>x.key===dnaKey);const regime=positionRegime(pos,m);const min=Math.max(3,num(ayarlar.dynamicExitMinOrnek,12));
  let selected=null,scope='NONE',matchedRegime=null;
  if(d){const exact=d.regimes?.[regime.key];selected=exact?.best;if(candidateOk(selected,min)){scope='EXACT_REGIME_VOLATILITY';matchedRegime=exact.key;}else selected=null;
    if(!selected){const family=Object.values(d.regimes||{}).filter(r=>r.family===regime.regimeFamily).flatMap(r=>r.algorithms||[]).filter(x=>candidateOk(x,min)).sort((a,b)=>b.score-a.score||b.netUsdt-a.netUsdt)[0];if(family){selected=family;scope='REGIME_FAMILY';matchedRegime=family.regimeKey;}}
    if(!selected&&candidateOk(d.allBest,Math.max(min,num(ayarlar.dynamicExitFallbackMinOrnek,20)))){selected=d.allBest;scope='DNA_ALL_REGIMES';matchedRegime='ALL';}}
  const ready=Boolean(selected);
  const plan={version:VERSION,mode:'SHADOW_ONLY',signature:dnaKey||'SIGNATURE_YOK',currentRegime:regime,matchedRegime,selectionScope:scope,selectedAlgorithmId:ready?selected.algorithmId:'ACTUAL',selectedAlgorithmLabel:ready?selected.algorithmLabel:'Mevcut Kademe Sistemi',ready,samples:ready?selected.samples:0,beatRate:ready?selected.beatRate:0,profitFactor:ready?selected.profitFactor:0,netUsdt:ready?selected.netUsdt:0,recent20:ready?selected.windows?.[20]:null,strengthening:ready?selected.strengthening:false,reason:ready?`${regime.key} için ${scope}: ${selected.algorithmLabel}`:`${dnaKey?'Bu DNA/rejim için güvenilir dinamik exit yok.':'DNA imzası yok.'}`,createdAt:new Date().toISOString(),executionPolicy:'NO_TRADE_ENGINE_EFFECT'};
  ensureDir();fs.appendFileSync(HISTORY_JSONL,JSON.stringify({...plan,symbol:pos?.sym||'',side:pos?.yon||''})+'\n');return plan;
}
function updateFromReplay(){return build(null,{persist:true});}
function telegramSummary(model=null,limit=5){const m=model||readModel();if(!m)return'';let t=`\n\n🧬 <b>DİNAMİK DNA EXIT MOTORU</b>\n🌦️ Güncel rejim: <b>${m.currentRegime.key}</b> | Pencere ${m.currentRegime.window}\n🔁 Kural: Aynı DNA, farklı rejimde farklı exit seçebilir.\n`;const leaders=[];for(const d of m.dna||[]){const r=d.regimes?.[m.currentRegime.key];if(r?.best)leaders.push({dna:d.key,b:r.best});}leaders.sort((a,b)=>b.b.score-a.b.score);t+=leaders.slice(0,limit).map((x,i)=>`${i+1}. ${x.dna} → ${x.b.algorithmLabel} | N${x.b.samples} | PF ${num(x.b.profitFactor).toFixed(2)} | Beat %${num(x.b.beatRate).toFixed(1)}`).join('\n')||'Bu rejimde yeterli kanıtlı exit henüz yok.';t+='\n🛡️ Shadow mod: gerçek çıkış sistemi değişmedi.';return t;}

module.exports={VERSION,MODEL_JSON,classifyInput,build,readModel,selectForPosition,updateFromReplay,telegramSummary};
