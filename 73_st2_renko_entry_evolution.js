'use strict';

// AGROS ST2 v6.14.0-R26 CORE ENTRY EVOLUTION
// Tek görev: her YÖN+PATTERN için giriş tuğla mesafesini gerçek kapanışların fiyat yolu üzerinde
// mevcut yüzde-stop ekonomisiyle karşılaştırmak. Eski Dynamic Exit / BE / LAB lifecycle yoktur.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');

const VERSION = 'v6.14.0-R26-CORE-ENTRY-EVOLUTION';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-renko-entry-evolution.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const LEDGER_FILE = path.join(DATA_DIR, 'st2-renko-entry-evolution-ledger.jsonl');

const CANDIDATES = () => (Array.isArray(ayarlar.renkoGirisAdayTugla) ? ayarlar.renkoGirisAdayTugla : [0.25,0.50,0.75,1,1.25,1.5])
  .map(Number).filter(x => x > 0).sort((a,b)=>a-b);
const FIRST_ASSIGN = () => Math.max(3, Number(ayarlar.renkoGirisIlkAtamaKapanis || 3));
const RECALC_STEP = () => Math.max(1, Number(ayarlar.renkoGirisYenidenHesaplamaAdimi || 5));
const RECENT_WINDOW = () => Math.max(3, Number(ayarlar.renkoGirisGuncelPencere || 10));
const RECENT_WEIGHT = () => Math.min(0.9, Math.max(0.5, Number(ayarlar.renkoGirisGuncelAgirlik || 0.65)));
const MIN_IMPROVEMENT = () => Math.max(0, Number(ayarlar.renkoGirisMinSkorIyilesme || 0.005));
const DEFAULT_BRICK = () => { const v=Number(ayarlar.renkoGirisVarsayilanTugla); return Number.isFinite(v)&&v>0?v:0.75; };

function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function r(v,d=6){ return Number(n(v).toFixed(d)); }
function blankMetric(){ return {samples:0,triggered:0,tp:0,sl:0,be:0,net:0,grossProfit:0,grossLoss:0,recent:[]}; }
function blank(){ return {schema:4,version:VERSION,updatedAt:null,profiles:{},processedIds:{},health:{loadedFrom:'EMPTY',stateStatus:'EMPTY',ledgerStatus:'EMPTY',stateRecords:0,ledgerRecords:0,accepted:0,duplicates:0,skipped:0,saveErrors:0}}; }
function ensure(){ fs.mkdirSync(DATA_DIR,{recursive:true}); }
function profileKey(yon,patternCode){ return `${String(yon||'').toUpperCase()}|${String(patternCode||'').toUpperCase()}`; }
function hydrate(raw={}){
  const out={...blank(),...raw,schema:4,version:VERSION,profiles:{...(raw.profiles||{})},processedIds:{...(raw.processedIds||{})},health:{...blank().health,...(raw.health||{})}};
  for(const p of Object.values(out.profiles)){
    p.activeBrick=n(p.activeBrick,DEFAULT_BRICK()); p.closed=n(p.closed); p.lastEvaluationClosed=n(p.lastEvaluationClosed); p.history=Array.isArray(p.history)?p.history.slice(0,50):[]; p.candidates={...(p.candidates||{})};
    for(const c of CANDIDATES()){ const k=c.toFixed(2); p.candidates[k]={...blankMetric(),...(p.candidates[k]||{}),recent:Array.isArray(p.candidates[k]?.recent)?p.candidates[k].recent.slice(-RECENT_WINDOW()):[]}; }
  }
  return out;
}
let cache=null;
function ledgerHealth(){ if(!fs.existsSync(LEDGER_FILE)) return {rows:0,status:'EMPTY'}; const x=io.forEachJsonlSync(LEDGER_FILE,()=>{}); return {rows:x.rows,status:x.invalid?'CORRUPT':(x.rows?'HEALTHY':'EMPTY')}; }
function read(){
  if(cache) return cache;
  ensure();
  for(const [file,label] of [[STATE_FILE,'STATE'],[BACKUP_FILE,'BACKUP']]){
    try{ if(fs.existsSync(file)){ cache=hydrate(JSON.parse(fs.readFileSync(file,'utf8'))); cache.health.loadedFrom=label; const lh=ledgerHealth(); cache.health.stateRecords=Object.keys(cache.processedIds||{}).length; cache.health.ledgerRecords=lh.rows; cache.health.stateStatus=cache.health.stateRecords?'HEALTHY':'EMPTY'; cache.health.ledgerStatus=lh.status; return cache; } }catch(_){}
  }
  cache=blank();
  const lh=ledgerHealth(); cache.health.stateRecords=Object.keys(cache.processedIds||{}).length; cache.health.ledgerRecords=lh.rows; cache.health.stateStatus=cache.health.stateRecords?'HEALTHY':'EMPTY'; cache.health.ledgerStatus=lh.status; return cache;
}
function write(state=read()){
  ensure(); const next=hydrate(state); next.updatedAt=new Date().toISOString();
  try{
    if(fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE,BACKUP_FILE);
    io.writeJsonAtomic(STATE_FILE,next); cache=next; return next;
  }catch(e){ next.health.saveErrors=n(next.health.saveErrors)+1; throw e; }
}
function deterministicId(pos,result={}){
  const explicit=pos?.closeId||result?.closeId||pos?.tradeId||pos?.id||pos?.positionId||pos?.emirId||pos?.acilisId;
  if(explicit) return String(explicit);
  return crypto.createHash('sha1').update([pos?.sym,pos?.yon,pos?.girisZamani||pos?.acilisZamani,pos?.girisFiyati,result?.closeTs||result?.closedAt,result?.exitPrice||result?.kapanisFiyati].join('|')).digest('hex').slice(0,24);
}
function add(m,net,pushRecent=true){
  m.triggered=n(m.triggered)+1; m.net=n(m.net)+net;
  if(net>1e-8){m.tp=n(m.tp)+1;m.grossProfit=n(m.grossProfit)+net;} else if(net<-1e-8){m.sl=n(m.sl)+1;m.grossLoss=n(m.grossLoss)+Math.abs(net);} else m.be=n(m.be)+1;
  if(pushRecent) m.recent=[...(Array.isArray(m.recent)?m.recent:[]),{net:r(net),at:Date.now()}].slice(-RECENT_WINDOW());
}
function recentMetric(arr=[]){ const m=blankMetric(); for(const x of arr) add(m,n(x?.net),false); m.samples=m.triggered; return m; }
function metric(raw={}){
  const m={...blankMetric(),...raw,recent:Array.isArray(raw.recent)?raw.recent.slice(-RECENT_WINDOW()):[]};
  m.samples=Math.max(n(m.samples),n(m.triggered));
  m.pf=m.grossLoss>0?m.grossProfit/m.grossLoss:(m.grossProfit>0?999:0); m.expectancy=m.triggered?m.net/m.triggered:0; m.winRate=(m.tp+m.sl)>0?m.tp/(m.tp+m.sl)*100:0;
  const rm=recentMetric(m.recent); rm.pf=rm.grossLoss>0?rm.grossProfit/rm.grossLoss:(rm.grossProfit>0?999:0); rm.expectancy=rm.triggered?rm.net/rm.triggered:0;
  const rw=rm.triggered?RECENT_WEIGHT():0, hw=1-rw; m.weightedExpectancy=m.expectancy*hw+rm.expectancy*rw; m.weightedPf=Math.min(m.pf,10)*hw+Math.min(rm.pf,10)*rw; m.score=m.weightedExpectancy+Math.max(0,m.weightedPf-1)*0.01; return m;
}
function observe(m,triggered,net=0){ m.samples=n(m.samples)+1; if(triggered) add(m,net); }
function ensureProfile(s,yon,patternCode,patternId){
  const key=profileKey(yon,patternCode); let p=s.profiles[key];
  if(!p) p=s.profiles[key]={key,yon:String(yon).toUpperCase(),patternCode:String(patternCode).toUpperCase(),patternId:patternId||'',activeBrick:DEFAULT_BRICK(),previousBrick:null,closed:0,lastEvaluationClosed:0,candidates:{},history:[]};
  for(const c of CANDIDATES()){ const k=c.toFixed(2); p.candidates[k]||=blankMetric(); }
  return p;
}
function activeFor(yon,patternCode){ return n(read().profiles[profileKey(yon,patternCode)]?.activeBrick,DEFAULT_BRICK()); }
function targetPrice(pusu,brickDistance){ const ref=n(pusu?.referansSeviye), box=n(pusu?.renkoBoxSize); if(!(ref>0&&box>0)) return 0; return String(pusu?.yon).toUpperCase()==='SHORT'?ref-brickDistance*box:ref+brickDistance*box; }
function shouldEvaluate(p){ return p.closed>=FIRST_ASSIGN()&&(p.lastEvaluationClosed===0||p.closed-p.lastEvaluationClosed>=RECALC_STEP()); }
function choose(p){
  const rows=Object.entries(p.candidates||{}).map(([key,val])=>({key,...metric(val)}));
  const eligible=rows.filter(x=>x.triggered>=FIRST_ASSIGN()&&x.net>0&&x.pf>1&&x.expectancy>0&&x.weightedExpectancy>0).sort((a,b)=>b.net-a.net||b.score-a.score||Number(a.key)-Number(b.key));
  const best=eligible[0]||null, current=rows.find(x=>x.key===n(p.activeBrick,DEFAULT_BRICK()).toFixed(2))||null;
  if(!best) return {ready:false,best,current,reason:`N${FIRST_ASSIGN()}_VE_POZITIF_NET_BEKLENIYOR`};
  if(best.key===n(p.activeBrick,DEFAULT_BRICK()).toFixed(2)) return {ready:false,best,current,reason:'MEVCUT_GIRIS_LIDER'};
  if(current&&current.triggered>=FIRST_ASSIGN()&&best.score<=current.score+MIN_IMPROVEMENT()) return {ready:false,best,current,reason:'FARK_ANLAMLI_DEGIL'};
  return {ready:true,best,current,reason:'EN_YUKSEK_NET_CORE_REPLAY'};
}
function rawPath(pos,result={}){
  const raw=pos?.execution?.pricePath||pos?.journey?.pricePath||[];
  const points=raw.map(x=>({t:n(x?.ts||x?.t||x?.at||x?.time),p:n(x?.price||x?.fiyat)})).filter(x=>x.p>0).sort((a,b)=>a.t-b.t);
  const exit=n(result.exitPrice||result.kapanisFiyati), closeTs=n(result.closeTs||result.closedAt||result.kapanisZamani,Date.now());
  if(exit>0&&(!points.length||Math.abs(points.at(-1).p-exit)>1e-12)) points.push({t:closeTs,p:exit}); return points;
}
function pnlPct(yon,entry,price){ return yon==='SHORT'?((entry-price)/entry)*100:((price-entry)/entry)*100; }
function priceForPct(yon,entry,pct){ return yon==='SHORT'?entry*(1-pct/100):entry*(1+pct/100); }
function coreProtectedPct(peakPct){
  const arm=n(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde,1.5); if(peakPct+1e-9<arm) return null;
  const first=n(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde,1.0), dist=Math.max(0,n(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde,0.5)), step=Math.max(.05,n(ayarlar.confirmedYuzdeselEkonomiAdimYuzde,0.5));
  const k=Math.max(0,Math.floor((peakPct-arm+1e-9)/step)); return Math.max(first,arm+k*step-dist);
}
function replayCandidate(pos,result,pusu,brickDistance,points){
  const yon=String(pusu.yon).toUpperCase(), entry=targetPrice(pusu,brickDistance); if(!(entry>0)) return {triggered:false,reason:'ENTRY_INVALID'};
  let idx=points.findIndex(x=>yon==='SHORT'?x.p<=entry:x.p>=entry); if(idx<0) return {triggered:false,reason:'TETIKLENMEDI'};
  const initialStop=-Math.max(.01,n(ayarlar.sabitStopYuzdesi,2.5)); let stopPct=initialStop, peak=-Infinity, exitPrice=0, exitReason='ACTUAL_CLOSE';
  for(let i=idx;i<points.length;i++){
    const pct=pnlPct(yon,entry,points[i].p); peak=Math.max(peak,pct); const protectedPct=coreProtectedPct(peak); if(protectedPct!=null) stopPct=Math.max(stopPct,protectedPct);
    if(pct<=stopPct){ exitPrice=priceForPct(yon,entry,stopPct); exitReason=stopPct>0?'CORE_PROFIT_STOP':'CORE_INITIAL_STOP'; break; }
  }
  if(!(exitPrice>0)) exitPrice=n(result.exitPrice||result.kapanisFiyati,points.at(-1)?.p);
  if(!(exitPrice>0)) return {triggered:false,reason:'EXIT_MISSING'};
  const pct=pnlPct(yon,entry,exitPrice), value=n(pos?.pozisyonDegeri,n(pos?.miktar)*entry), commission=n(result.commission||result.komisyon), net=value*pct/100-commission;
  return {triggered:true,entry:r(entry,12),exitPrice:r(exitPrice,12),exitReason,pct:r(pct),net:r(net),initialStopPct:r(initialStop),peakPct:r(peak),protectedPct:coreProtectedPct(peak)};
}
function close(pos,result={}){
  const ga=pos?.girisAnalizi||{}; if(ayarlar.renkoGirisOgrenmeAktif===false) return null;
  if(/MANUAL_EXTERNAL_CLOSE|MANUAL_OVERRIDE/i.test(String(result?.reason||''))||pos?.manualExternalClose===true||result.restartGap===true||pos?.restartGap===true||pos?.learningEligible===false) return null;
  if(String(ga.entryStrategy||pos?.entryStrategy||'').toUpperCase()!=='ST2_RENKO') return null;
  const snap=ga.pusuTuglasi||pos?.pusuTuglasi||{}, yon=String(pos?.yon||ga.yon||'').toUpperCase(), patternCode=String(ga.patternKodu||pos?.patternKodu||snap.patternKodu||'').toUpperCase();
  const pusu={yon,referansSeviye:n(ga.referansSeviye||pos?.referansSeviye||snap.referansSeviye),renkoBoxSize:n(ga.renkoBoxSize||pos?.renkoBoxSize||snap.renkoBoxSize)};
  const points=rawPath(pos,result); if(!['LONG','SHORT'].includes(yon)||!patternCode||!(pusu.referansSeviye>0&&pusu.renkoBoxSize>0)||!points.length) return null;
  const s=read(), tradeId=deterministicId(pos,result); if(s.processedIds[tradeId]){s.health.duplicates=n(s.health.duplicates)+1;return null;}
  const profile=ensureProfile(s,yon,patternCode,ga.patternId||pos?.patternId); profile.closed=n(profile.closed)+1; const candidates={};
  for(const c of CANDIDATES()){ const rep=replayCandidate(pos,result,pusu,c,points); candidates[c.toFixed(2)]=rep; observe(profile.candidates[c.toFixed(2)],rep.triggered,rep.net); }
  try{ profile.lastAdaptiveDnaDecision=adaptiveDnaEntry.observe(pos,result,candidates,tradeId); }catch(e){ profile.lastAdaptiveDnaError=e.message; }
  if(shouldEvaluate(profile)){ const pick=choose(profile); profile.lastEvaluationClosed=profile.closed; profile.lastDecision=pick.reason; if(pick.ready&&ayarlar.renkoGirisOtomatikAktiflestirme!==false){ profile.previousBrick=profile.activeBrick; profile.activeBrick=Number(pick.best.key); profile.changedAt=new Date().toISOString(); profile.history.unshift({at:profile.changedAt,from:profile.previousBrick,to:profile.activeBrick,closed:profile.closed,reason:pick.reason}); profile.history=profile.history.slice(0,50); } }
  profile.lastReplay={at:new Date().toISOString(),tradeId,candidates}; profile.lastUpdatedAt=profile.lastReplay.at; s.processedIds[tradeId]={at:profile.lastReplay.at,sym:pos?.sym||null,pattern:patternCode}; s.health.accepted=n(s.health.accepted)+1; s.health.stateRecords=Object.keys(s.processedIds).length;
  try{ fs.appendFileSync(LEDGER_FILE,JSON.stringify({schema:2,type:'CORE_ENTRY_CLOSE',tradeId,at:profile.lastReplay.at,sym:pos?.sym,yon,patternCode,result:{exitPrice:n(result.exitPrice||result.kapanisFiyati),net:n(result.net),commission:n(result.commission)}})+'\n'); const lh=ledgerHealth(); s.health.ledgerRecords=lh.rows; s.health.ledgerStatus=lh.status; }catch(_){}
  s.health.stateStatus=s.health.stateRecords?'HEALTHY':'EMPTY'; write(s); return {...profile,candidates:Object.entries(profile.candidates).map(([key,v])=>({brick:Number(key),...metric(v)}))};
}
function summary(){
  const s=read(), profiles=Object.values(s.profiles||{}).map(p=>({...p,candidates:Object.entries(p.candidates||{}).map(([key,v])=>({brick:Number(key),...metric(v)})).sort((a,b)=>a.brick-b.brick)}));
  return {version:VERSION,health:{...s.health},policy:{candidates:CANDIDATES(),firstAssign:FIRST_ASSIGN(),recalcStep:RECALC_STEP(),recentWindow:RECENT_WINDOW(),recentWeight:RECENT_WEIGHT(),defaultBrick:DEFAULT_BRICK()},profiles};
}
function resetForTest(raw=null){cache=hydrate(raw||blank());return cache;}
module.exports={VERSION,STATE_FILE,BACKUP_FILE,LEDGER_FILE,CANDIDATES,DEFAULT_BRICK,FIRST_ASSIGN,RECALC_STEP,RECENT_WINDOW,RECENT_WEIGHT,profileKey,targetPrice,activeFor,close,summary,metric,choose,replayCandidate,_resetForTest:resetForTest};
