'use strict';

/**
 * AGROS ST2 Renko Entry Evolution
 * - Her yön + son-4 pattern için bağımsız giriş tuğla mesafesi öğrenir.
 * - Yeni Pattern başlangıcı 0.75 tuğladır; öğrenilmiş Pattern kendi aktif mesafesini korur.
 * - İlk seçim 3 karşılaştırılabilir kapanışta yapılır.
 * - Sonraki değerlendirme her 5 yeni kapanışta yapılır.
 * - Tarih korunur; son pencere daha yüksek ağırlık taşır.
 * - Yalnız yeni pozisyona atanır; açık pozisyonun seviyesi değişmez.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');

const VERSION = 'v6.3.3-FINAL-OBSERVABILITY-AUDIT-RECONCILIATION';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-renko-entry-evolution.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const LEDGER_FILE = path.join(DATA_DIR, 'st2-renko-entry-evolution-ledger.jsonl');
const crypto = require('crypto');

const CANDIDATES = () => (Array.isArray(ayarlar.renkoGirisAdayTugla)
  ? ayarlar.renkoGirisAdayTugla : [0.25, 0.50, 0.75, 1.00, 1.25, 1.50])
  .map(Number).filter(x => x > 0).sort((a,b)=>a-b);
const FIRST_ASSIGN = () => Math.max(3, Number(ayarlar.renkoGirisIlkAtamaKapanis || 3));
const RECALC_STEP = () => Math.max(1, Number(ayarlar.renkoGirisYenidenHesaplamaAdimi || 5));
const RECENT_WINDOW = () => Math.max(3, Number(ayarlar.renkoGirisGuncelPencere || 10));
const RECENT_WEIGHT = () => Math.min(0.9, Math.max(0.5, Number(ayarlar.renkoGirisGuncelAgirlik || 0.65)));
const MIN_IMPROVEMENT = () => Math.max(0, Number(ayarlar.renkoGirisMinSkorIyilesme || 0.005));
const DEFAULT_BRICK = () => { const v=Number(ayarlar.renkoGirisVarsayilanTugla); return Number.isFinite(v)&&v>0?v:0.75; };

function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function r(v,d=6){ return Number(n(v).toFixed(d)); }
function blankMetric(){ return { samples:0, triggered:0, tp:0, sl:0, be:0, net:0, grossProfit:0, grossLoss:0, recent:[] }; }
function blankAudit(){ return {assigned:0,applied:0,matched:0,mismatched:0,unknown:0,missing:0,reasons:{}}; }
function blankHealth(){ return {stateStatus:'EMPTY',ledgerStatus:'EMPTY',stateRecords:0,ledgerRecords:0,lastSuccessfulSaveAt:null,lastAcceptedTradeId:null,loadedAfterRestart:0,duplicateRejects:0,restartGapRejects:0,otherRejects:0,saveErrors:0,loadErrors:0,backupRecoveries:0,ledgerRebuilds:0}; }
function blank(){ return { version:VERSION, updatedAt:null, profiles:{}, processedIds:{}, bridge:{calls:0,accepted:0,skipped:{},last:null}, decisionChain:{entry:blankAudit(),stop:blankAudit(),be:blankAudit(),exit:blankAudit(),last:null}, health:blankHealth() }; }
function bridgeMark(s,status,reason,pos){
  s.bridge={calls:n(s?.bridge?.calls),accepted:n(s?.bridge?.accepted),skipped:{...(s?.bridge?.skipped||{})},last:s?.bridge?.last||null};
  s.bridge.calls++;
  if(status==='ACCEPTED') s.bridge.accepted++; else s.bridge.skipped[reason]=n(s.bridge.skipped[reason])+1;
  s.bridge.last={at:new Date().toISOString(),status,reason,sym:pos?.sym||null,yon:pos?.yon||null,entryStrategy:pos?.girisAnalizi?.entryStrategy||null,patternCode:pos?.girisAnalizi?.patternKodu||null};
}
function ensure(){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); }
function stateProfileWeight(x){
  const profiles=Object.values(x?.profiles||{});
  return profiles.reduce((sum,p)=>sum+Math.max(n(p?.closed),...Object.values(p?.candidates||{}).map(m=>n(m?.samples,n(m?.triggered)))),0);
}
function legacyStateFiles(){
  const dirs=[
    process.env.AGROS_ST2_LEGACY_DATA_DIR,
    process.env.AGROS_LEGACY_DATA_DIR,
    path.join(__dirname,'data'),
    path.join(process.cwd(),'data'),
    path.join(path.dirname(__dirname),'data'),
    path.join(path.dirname(DATA_DIR),'data'),
    path.join(path.dirname(DATA_DIR),'data-st2'),
    path.join(path.dirname(DATA_DIR),'st2-data')
  ].filter(Boolean).map(x=>path.resolve(x));
  const names=['st2-renko-entry-evolution.json','st2_renko_entry_evolution.json','renko-entry-evolution.json'];
  return [...new Set(dirs.flatMap(d=>names.map(name=>path.join(d,name))))].filter(f=>f!==path.resolve(STATE_FILE));
}
function recoverHistoricalState(current){
  const currentWeight=stateProfileWeight(current);
  let best=null,bestFile=null,bestWeight=currentWeight;
  for(const file of legacyStateFiles()){
    if(!fs.existsSync(file)) continue;
    const candidate=io.readJsonBounded(file,null,{maxBytes:16*1024*1024});
    const weight=stateProfileWeight(candidate);
    if(weight>bestWeight){best=candidate;bestFile=file;bestWeight=weight;}
  }
  // Yeni state dosyasında birkaç kapanış bulunması, daha dolu tarihsel hafızanın
  // görünmez kalmasına neden olmamalı. Yalnız kesin olarak daha güçlü kaynak seçilir.
  if(!best) return current;
  const recovered={...blank(),...best,profiles:{...(best.profiles||{})}};
  // Yeni runtime telemetrisi tarihsel profil verisini ezmesin; sayaçlar birleştirilir.
  recovered.bridge={
    calls:Math.max(n(best?.bridge?.calls),n(current?.bridge?.calls)),
    accepted:Math.max(n(best?.bridge?.accepted),n(current?.bridge?.accepted)),
    skipped:{...(best?.bridge?.skipped||{}),...(current?.bridge?.skipped||{})},
    last:current?.bridge?.last||best?.bridge?.last||null
  };
  recovered.decisionChain={...blank().decisionChain,...(best?.decisionChain||{}),...(current?.decisionChain||{})};
  recovered.recovery={at:new Date().toISOString(),source:bestFile,profiles:Object.keys(recovered.profiles).length,weight:bestWeight,replacedWeight:currentWeight};
  write(recovered);
  return recovered;
}
function validState(x){ return x&&typeof x==='object'&&x.profiles&&typeof x.profiles==='object'&&x.bridge&&typeof x.bridge==='object'; }
function hydrate(x){
  const b=blank(); const out={...b,...(x||{}),profiles:{...(x?.profiles||{})},processedIds:{...(x?.processedIds||{})},health:{...b.health,...(x?.health||{})}};
  out.decisionChain={entry:{...blankAudit(),...(x?.decisionChain?.entry||{})},stop:{...blankAudit(),...(x?.decisionChain?.stop||{})},be:{...blankAudit(),...(x?.decisionChain?.be||{})},exit:{...blankAudit(),...(x?.decisionChain?.exit||{})},last:x?.decisionChain?.last||null};
  out.health.stateRecords=Object.keys(out.processedIds).length;
  return out;
}
function parseStateFile(file){
  try { if(!fs.existsSync(file)) return null; const x=JSON.parse(fs.readFileSync(file,'utf8')); return validState(x)?x:null; }
  catch(e){ return null; }
}
function countLedger(){ let rows=0,invalid=0; if(fs.existsSync(LEDGER_FILE)){ const r=io.forEachJsonlSync(LEDGER_FILE,()=>{}); rows=r.rows; invalid=r.invalid; } return {rows,invalid}; }
function stateWeight(x){ return Object.keys(x?.processedIds||{}).length + stateProfileWeight(x); }
function safeWrite(s,{allowEmpty=false}={}){
  ensure(); const next=hydrate(s); const current=parseStateFile(STATE_FILE); const cw=stateWeight(current), nw=stateWeight(next);
  if(!allowEmpty && cw>0 && nw===0) throw new Error('EMPTY_STATE_OVERWRITE_BLOCKED');
  try {
    if(current&&validState(current)) fs.writeFileSync(BACKUP_FILE,JSON.stringify(current,null,2));
    next.version=VERSION; next.updatedAt=new Date().toISOString(); next.health.lastSuccessfulSaveAt=next.updatedAt; next.health.stateStatus=nw>0?'HEALTHY':'EMPTY';
    io.writeJsonAtomic(STATE_FILE,next); return next;
  } catch(e){ next.health.saveErrors=n(next.health.saveErrors)+1; throw e; }
}
function appendLedger(event){ ensure(); const fd=fs.openSync(LEDGER_FILE,'a'); try{ fs.writeSync(fd,JSON.stringify(event)+'\n'); fs.fsyncSync(fd); } finally{ fs.closeSync(fd); } }
let anonymousCloseSequence=0;
function deterministicId(pos,result={}){
  const explicit=pos?.closeId||result?.closeId||pos?.tradeId||pos?.id||pos?.positionId||pos?.emirId||pos?.acilisId;
  if(explicit) return String(explicit);
  const ga=pos?.girisAnalizi||{}; const raw=[pos?.sym||pos?.symbol,pos?.yon,ga.patternKodu||pos?.patternKodu,pos?.girisZamani||pos?.openTs||pos?.acilisZamani,pos?.girisFiyati||pos?.entryPrice,result?.closeTs||result?.kapanisZamani,result?.exitPrice||result?.kapanisFiyati,result?.net,result?.commission].join('|');
  const base=crypto.createHash('sha256').update(raw).digest('hex').slice(0,24);
  if(!(pos?.girisZamani||pos?.openTs||pos?.acilisZamani||result?.closeTs||result?.kapanisZamani)) return `${base}-${++anonymousCloseSequence}`;
  return base;
}
function rebuildFromLedger(baseHealth={}){
  let rebuilt=hydrate(blank()); rebuilt.health={...rebuilt.health,...baseHealth};
  if(!fs.existsSync(LEDGER_FILE)) return rebuilt;
  const seen=new Set(); const stats=io.forEachJsonlSync(LEDGER_FILE,row=>{ if(row?.type!=='SCIENTIFIC_CLOSE'||!row.tradeId||seen.has(row.tradeId)) return; seen.add(row.tradeId); applyAccepted(rebuilt,row.pos||{},row.result||{},row.tradeId,false); });
  rebuilt.health.ledgerRecords=stats.rows; rebuilt.health.ledgerStatus=stats.invalid?'DEGRADED':'HEALTHY'; rebuilt.health.ledgerRebuilds=n(rebuilt.health.ledgerRebuilds)+1; rebuilt.health.loadedAfterRestart=Object.keys(rebuilt.processedIds).length;
  return safeWrite(rebuilt,{allowEmpty:true});
}
function read(){
  ensure(); let x=parseStateFile(STATE_FILE); let recovered=false; const base=blankHealth();
  if(!x&&fs.existsSync(STATE_FILE)) base.loadErrors++;
  if(!x){ const bak=parseStateFile(BACKUP_FILE); if(bak){ x=bak; recovered=true; base.backupRecoveries++; } }
  if(!x&&fs.existsSync(LEDGER_FILE)) return rebuildFromLedger(base);
  let current=hydrate(x||blank());
  if(process.env.AGROS_ST2_LEGACY_DATA_DIR) current=recoverHistoricalState(current);
  current.health={...current.health,...Object.fromEntries(Object.entries(base).map(([k,v])=>[k,n(current.health[k])+v]))};
  // v6.3.3: v6.3.2 öncesindeki mutlak fiyat eşitliği denetimi, canlı fiyatın tetik seviyesini
  // yönsel olarak geçerek açılmasını yanlış biçimde "eşleşmeyen" sayıyordu. Öğrenme kayıtları
  // korunur; yalnız eski audit sayacı ayrı bir legacy snapshot'a taşınır ve yeni yönsel audit sıfırdan başlar.
  const legacyEntry=current?.decisionChain?.entry||{};
  if(n(legacyEntry.mismatched)>0 && Object.keys(legacyEntry.reasons||{}).length===0 && !current.legacyEntryAuditV632){
    current.legacyEntryAuditV632={...legacyEntry,migratedAt:new Date().toISOString(),reason:'PRE_V632_ABSOLUTE_PRICE_MATCH_AUDIT'};
    current.decisionChain.entry=blankAudit();
    recovered=true;
  }
  const lc=countLedger(); current.health.ledgerRecords=lc.rows; current.health.ledgerStatus=!fs.existsSync(LEDGER_FILE)?'EMPTY':(lc.invalid?'DEGRADED':'HEALTHY'); current.health.stateStatus=stateWeight(current)>0?'HEALTHY':'EMPTY'; current.health.loadedAfterRestart=Object.keys(current.processedIds).length;
  if(recovered) current=safeWrite(current,{allowEmpty:true});
  return current;
}
function write(s,options){ return safeWrite(s,options); }
function profileKey(yon, patternCode){ return `${String(yon||'').toUpperCase()}|${String(patternCode||'').toUpperCase()}`; }
function recentMetric(arr=[]){ const out=blankMetric(); for(const x of arr){ add(out,n(x?.net),false); } return out; }
function metric(raw={}){
  const m={...blankMetric(),...raw,recent:Array.isArray(raw.recent)?raw.recent.slice(-RECENT_WINDOW()):[]};
  // Eski state'lerde samples yalnız tetiklenen sayısıydı; geriye uyumlu biçimde en az triggered kadar koru.
  m.samples=Math.max(n(m.samples),n(m.triggered));
  m.pf=m.grossLoss>0?m.grossProfit/m.grossLoss:(m.grossProfit>0?999:0);
  m.expectancy=m.triggered?m.net/m.triggered:0;
  m.winRate=(m.tp+m.sl)>0?(m.tp/(m.tp+m.sl))*100:0;
  const rm=recentMetric(m.recent); rm.pf=rm.grossLoss>0?rm.grossProfit/rm.grossLoss:(rm.grossProfit>0?999:0); rm.expectancy=rm.samples?rm.net/rm.samples:0;
  const rw=rm.samples?RECENT_WEIGHT():0, hw=1-rw;
  m.recentMetrics=rm;
  m.weightedExpectancy=(m.expectancy*hw)+(rm.expectancy*rw);
  m.weightedPf=(Math.min(m.pf,10)*hw)+(Math.min(rm.pf,10)*rw);
  m.score=m.weightedExpectancy + Math.max(0,m.weightedPf-1)*0.01;
  return m;
}
function observe(m,triggered,net=0){
  m.samples=n(m.samples)+1;
  if(!triggered) return;
  add(m,net);
}
function add(m,net,pushRecent=true){
  m.triggered=n(m.triggered)+1; m.net=n(m.net)+net;
  if(net>0.000001){m.tp=n(m.tp)+1;m.grossProfit=n(m.grossProfit)+net;}
  else if(net<-0.000001){m.sl=n(m.sl)+1;m.grossLoss=n(m.grossLoss)+Math.abs(net);}
  else m.be=n(m.be)+1;
  if(pushRecent) m.recent=[...(Array.isArray(m.recent)?m.recent:[]),{net:r(net),at:Date.now()}].slice(-RECENT_WINDOW());
}
function ensureProfile(s,yon,patternCode,patternId){
  const key=profileKey(yon,patternCode); let p=s.profiles[key];
  if(!p) p=s.profiles[key]={key,yon:String(yon).toUpperCase(),patternCode:String(patternCode).toUpperCase(),patternId:patternId||'',activeBrick:DEFAULT_BRICK(),previousBrick:null,closed:0,lastEvaluationClosed:0,candidates:{},history:[]};
  for(const c of CANDIDATES()){ const k=c.toFixed(2); p.candidates[k]||=blankMetric(); }
  return p;
}
function activeFor(yon,patternCode){ const s=read(); return n(s.profiles[profileKey(yon,patternCode)]?.activeBrick,DEFAULT_BRICK()); }
function targetPrice(pusu,brickDistance){ const ref=n(pusu?.referansSeviye); const box=n(pusu?.renkoBoxSize); if(!(ref>0&&box>0)) return 0; return String(pusu.yon).toUpperCase()==='SHORT'?ref-(brickDistance*box):ref+(brickDistance*box); }
function shouldEvaluate(p){ return p.closed>=FIRST_ASSIGN() && (p.lastEvaluationClosed===0 || p.closed-p.lastEvaluationClosed>=RECALC_STEP()); }
function choose(p){
  const rows=Object.entries(p.candidates||{}).map(([key,val])=>({key,...metric(val)}));
  const eligible=rows.filter(x=>x.triggered>=FIRST_ASSIGN()&&x.net>0&&x.pf>1&&x.expectancy>0&&x.weightedExpectancy>0)
    .sort((a,b)=>b.net-a.net||b.score-a.score||b.weightedExpectancy-a.weightedExpectancy||Number(a.key)-Number(b.key));
  const best=eligible[0]||null; const current=rows.find(x=>x.key===n(p.activeBrick,DEFAULT_BRICK()).toFixed(2))||null;
  if(!best) return {ready:false,best:null,current,reason:`N${FIRST_ASSIGN()}_VE_POZITIF_NET_BEKLENIYOR`};
  if(best.key===n(p.activeBrick,DEFAULT_BRICK()).toFixed(2)) return {ready:false,best,current,reason:'MEVCUT_GIRIS_ZATEN_EN_COK_NET_KAZANDIRIYOR'};
  if(current&&current.triggered>=FIRST_ASSIGN()&&best.score<=current.score+MIN_IMPROVEMENT()) return {ready:false,best,current,reason:'FARK_ANLAMLI_DEGIL'};
  return {ready:true,best,current,reason:'EN_YUKSEK_NET_GUNCEL_AGIRLIKLI'};
}
function rawPath(pos,result={}){
  const raw=pos?.execution?.pricePath||pos?.journey?.pricePath||[];
  const points=raw.map(x=>({
    t:n(x?.ts||x?.t||x?.at||x?.time),
    p:n(x?.price||x?.fiyat),
    atrPct:Number.isFinite(Number(x?.atrPct))?Number(x.atrPct):null,
    stTrend:x?.stTrend||null,
    stAligned:typeof x?.stAligned==='boolean'?x.stAligned:null
  })).filter(x=>x.p>0).sort((a,b)=>a.t-b.t);
  const exit=n(result.exitPrice||result.kapanisFiyati);
  const closeTs=n(result.closeTs||result.kapanisZamani,Date.now());
  if(exit>0 && (!points.length || points[points.length-1].p!==exit)) points.push({t:closeTs,p:exit,atrPct:null,stTrend:null,stAligned:null});
  return points;
}
function pnlPct(yon,entry,price){ return yon==='SHORT'?((entry-price)/entry)*100:((price-entry)/entry)*100; }
function priceForPct(yon,entry,pct){ return yon==='SHORT'?entry*(1-pct/100):entry*(1+pct/100); }
function frozenRisk(pos){
  const life=pos?.labLifecycleProfile||{};
  return {
    stopPct:Math.max(0.01,n(life.stopPct,n(ayarlar.sabitStopYuzdesi,1.5))),
    beTriggerPct:Math.max(0,n(life.beTriggerPct,n(ayarlar.breakevenTetikYuzde,0.4))),
    beBufferPct:Math.max(0,n(life.beBufferPct,n(ayarlar.breakevenTamponYuzde,0.12)))
  };
}
function frozenExit(pos){
  const f=pos?.executionExitAssignment;
  if(f?.ready && f?.algorithmId) return {id:String(f.algorithmId),label:f.label||f.algorithmId};
  const s=pos?.exitPlanShadow;
  if(s?.ready && s?.selectedAlgorithmId) return {id:String(s.selectedAlgorithmId),label:s.selectedAlgorithmLabel||s.selectedAlgorithmId};
  return {id:'ACTUAL',label:'Mevcut kapanış'};
}
function dynamicExitHit(id,ctx,row){
  const p=ctx.pnl, minute=Math.max(0,(row.t-ctx.startedAt)/60000), peak=ctx.peak;
  let m=id.match(/^TIME_(\d+)M$/); if(m&&minute>=n(m[1])) return {hit:true,reason:`TIME_${m[1]}M`};
  if(id==='TREND_EXIT_ST'){
    const minMinute=Math.max(0,n(ayarlar.exitReplayTrendMinMinute,3));
    const expected=ctx.yon==='LONG'?'UP':'DOWN';
    const broken=row.stAligned===false||(row.stTrend&&String(row.stTrend)!==expected);
    if(minute>=minMinute&&broken) return {hit:true,reason:'TREND_EXIT_ST'};
  }
  if(id.startsWith('FIXED_TP_')){ const level=n(id.replace('FIXED_TP_','').replace('_','.')); if(level>0&&p>=level) return {hit:true,reason:id,price:priceForPct(ctx.yon,ctx.entry,level)}; }
  m=id.match(/^MFE_PROTECT_(\d+)$/); if(m){ const ratio=n(m[1])/100; if(peak>0&&p<=peak*ratio) return {hit:true,reason:id}; }
  m=id.match(/^ATR_TRAIL_(\d+)(?:_(\d+))?X$/); if(m){
    const mult=m[2]===undefined?n(m[1]):n(`${m[1]}.${m[2]}`); const atr=n(ctx.peakAtrPct,n(row.atrPct));
    if(atr>0&&peak>0&&p<=peak-(atr*mult)) return {hit:true,reason:id};
  }
  if(id.startsWith('ALT_LADDER_')){
    const fast=id.endsWith('FAST'), triggers=fast?[0.3,0.6,1.0,2.0]:[0.5,1.2,2.5,4.0], floors=fast?[0,0.2,0.5,1.2]:[0,0.4,1.2,2.5];
    let idx=-1; for(let i=0;i<triggers.length;i++) if(peak>=triggers[i]) idx=i;
    if(idx>=0&&p<=floors[idx]) return {hit:true,reason:id,price:priceForPct(ctx.yon,ctx.entry,floors[idx])};
  }
  if(id==='DYNAMIC_PATH_EXIT'){
    const recent=ctx.path.slice(-6); let noise=0; if(recent.length>1){for(let i=1;i<recent.length;i++)noise+=Math.abs(recent[i]-recent[i-1]);noise/=recent.length-1;}
    const capture=noise<0.18?0.55:0.65, minPeak=minute<15?0.6:0.35;
    if(peak>=minPeak&&p<=peak*capture) return {hit:true,reason:id};
  }
  if(id==='HYBRID_TREND_MFE'){
    if(minute>15&&minute<=60&&peak>=0.5&&p<=peak*0.68) return {hit:true,reason:id};
    if(minute>60&&peak>=0.3&&p<=peak*0.82) return {hit:true,reason:id};
  }
  return {hit:false};
}
function replayCandidate(pos,result,pusu,brickDistance,points){
  const yon=String(pusu.yon).toUpperCase(), entry=targetPrice(pusu,brickDistance), activeAtOpen=n(pos?.girisAnalizi?.renkoEntryBrickDistance,DEFAULT_BRICK());
  const shadowOnlyTiming=String(pos?.girisAnalizi?.entryEvolutionMode||'').toUpperCase()==='SHADOW_ONLY';
  let triggerIndex=points.findIndex(x=>yon==='SHORT'?x.p<=entry:x.p>=entry);
  // v6.12.0: gerçek giriş referans Renko + ST1 kapısındaysa aday tuğla tetiklenmiş varsayılamaz.
  if(triggerIndex<0 && !shadowOnlyTiming && brickDistance<=activeAtOpen+1e-9) triggerIndex=0;
  if(triggerIndex<0) return {triggered:false,reason:'TETIKLENMEDI'};
  const risk=frozenRisk(pos), exitPlan=frozenExit(pos), value=n(pos.pozisyonDegeri,n(pos.miktar)*entry), commission=n(result.commission||result.komisyon);
  let stopPct=-risk.stopPct, beActive=false, peak=0, peakAtrPct=null, exitPrice=null, exitReason='ACTUAL_CLOSE', path=[];
  const startedAt=points[triggerIndex]?.t||Date.now();
  for(let i=triggerIndex;i<points.length;i++){
    const row=points[i], pct=pnlPct(yon,entry,row.p); peak=Math.max(peak,pct); if(row.atrPct&&pct>=peak) peakAtrPct=row.atrPct; path.push(pct);
    if(!beActive && risk.beTriggerPct>0 && peak>=risk.beTriggerPct){ beActive=true; stopPct=Math.max(stopPct,risk.beBufferPct); }
    if(pct<=stopPct){ exitPrice=priceForPct(yon,entry,stopPct); exitReason=beActive?'BE_STOP':'STOP'; break; }
    if(exitPlan.id!=='ACTUAL'){
      const hit=dynamicExitHit(exitPlan.id,{yon,entry,startedAt,pnl:pct,peak,peakAtrPct,path},row);
      if(hit.hit){ exitPrice=n(hit.price,row.p); exitReason=hit.reason; break; }
    }
  }
  if(!(exitPrice>0)) exitPrice=n(result.exitPrice||result.kapanisFiyati,points.at(-1)?.p);
  const pct=pnlPct(yon,entry,exitPrice), net=value*(pct/100)-commission;
  return {triggered:true,entry:r(entry,12),exitPrice:r(exitPrice,12),exitReason,pct:r(pct,6),net:r(net,6),stopPct:r(risk.stopPct,4),beTriggerPct:r(risk.beTriggerPct,4),beBufferPct:r(risk.beBufferPct,4),exitAlgorithmId:exitPlan.id};
}
function auditMark(s,key,{assigned=false,applied=false,matched=null,reason=null,detail=null}={}){
  s.decisionChain={entry:blankAudit(),stop:blankAudit(),be:blankAudit(),exit:blankAudit(),...(s.decisionChain||{})};
  const a=s.decisionChain[key]={...blankAudit(),...(s.decisionChain[key]||{})};
  if(assigned) a.assigned++;
  if(applied) a.applied++;
  if(!assigned || !applied) a.missing++;
  if(matched===true) a.matched++;
  else if(matched===false) a.mismatched++;
  else a.unknown++;
  if(reason) a.reasons[reason]=n(a.reasons[reason])+1;
  s.decisionChain.last={at:new Date().toISOString(),key,reason,detail};
}
function auditDecisionChain(s,pos,result,ga,pusu,points){
  const binding=ga?.entryDecisionBinding||{};
  const entryBrick=n(binding.selectedBrick, n(ga.renkoEntryBrickDistance,DEFAULT_BRICK()));
  const gateBrick=n(binding.gateBrick, entryBrick);
  const shadowOnlyEvolution=String(ga?.entryEvolutionMode||binding?.evolutionMode||'').toUpperCase()==='SHADOW_ONLY';
  const shadowTarget=n(binding.shadowTargetPrice, targetPrice(pusu,entryBrick));
  const target=shadowOnlyEvolution
    ? n(binding.targetPrice, n(ga.tetikFiyati, n(ga.referansSeviye)))
    : n(binding.targetPrice, shadowTarget);
  const actual=n(pos?.girisFiyati||pos?.entryPrice);
  const entryAssigned=target>0&&entryBrick>0;
  const entryApplied=actual>0&&binding.verified!==false;
  const side=String(pos?.yon||pusu?.yon||'').toUpperCase();
  const entryTol=Math.max(n(pusu.renkoBoxSize)*0.20, target*0.0005);
  const bindingMatched=Math.abs(entryBrick-gateBrick)<=1e-9;
  const directionMatched=entryAssigned&&entryApplied
    ? bindingMatched&&(side==='SHORT'?actual<=target+entryTol:actual>=target-entryTol)
    : null;
  const entryReason=!entryAssigned?'ATAMA_EKSIK'
    :!bindingMatched?'ENTRY_BINDING_ERROR'
    :!entryApplied?'UYGULAMA_EKSIK'
    :directionMatched
      ? (shadowOnlyEvolution?'ST1_GATE_RENKO_REFERENCE_APPLIED_EVOLUTION_SHADOW':'TETIK_VE_GATE_AYNI_TUGLA')
      :'TETIK_YONU_TERSI';
  auditMark(s,'entry',{
    assigned:entryAssigned,applied:entryApplied,matched:directionMatched,reason:entryReason,
    detail:{assignedBrick:entryBrick,gateBrick,target,shadowTarget,actual,side,tolerance:entryTol,bindingVerified:binding.verified===true,shadowOnlyEvolution,timingAuthority:ga?.entryTimingAuthority||binding?.timingAuthority||null}
  });

  const stopPct=Math.max(0.01,n(pos?.labLifecycleProfile?.stopPct,n(ayarlar.sabitStopYuzdesi,1.5)));
  const assignedStop=actual>0?(String(pos?.yon).toUpperCase()==='SHORT'?actual*(1+stopPct/100):actual*(1-stopPct/100)):0;
  const appliedStop=n(pos?.initialSl||pos?.ilkSl||pos?.sanalIlkStop||pos?.sl);
  const stopTol=Math.max(actual*0.0005,1e-9);
  auditMark(s,'stop',{assigned:assignedStop>0,applied:appliedStop>0,matched:assignedStop>0&&appliedStop>0?Math.abs(assignedStop-appliedStop)<=stopTol:null,detail:{stopPct,assignedStop,appliedStop}});

  const beAssigned=Number.isFinite(Number(pos?.labLifecycleProfile?.beTriggerPct??ayarlar.breakevenTetikYuzde));
  const beApplied=pos?.breakevenAktif===true||/BAŞABAŞ|KOMİSYON|KÂR KORUMA|KAR KORUMA/i.test(String(result?.reason||''));
  auditMark(s,'be',{assigned:beAssigned,applied:beApplied,matched:beAssigned?true:null,detail:{triggerPct:n(pos?.labLifecycleProfile?.beTriggerPct,n(ayarlar.breakevenTetikYuzde)),bufferPct:n(pos?.labLifecycleProfile?.beBufferPct,n(ayarlar.breakevenTamponYuzde)),activated:beApplied}});

  const liveRenko=String(pos?.renkoExitAssignment?.liveExitMode||'').toUpperCase()==='SAFE_COMMISSION_BRICK_TRAIL';
  if(liveRenko){
    const assignedExit='RENKO_COMMISSION_SAFE_BRICK_TRAIL';
    const activated=pos?.renkoExitActivated===true;
    const resultText=String(result?.reason||'').toUpperCase();
    const applied=activated||/RENKO|K[ÂA]R KORUMA|KOMİSYON GÜVENLİ/.test(resultText);
    const reason=applied?'RENKO_LIVE_APPLIED':'RENKO_NOT_ACTIVATED';
    auditMark(s,'exit',{
      assigned:true,applied,matched:applied?true:null,reason,
      detail:{
        assignedExit,appliedExit:applied?(pos?.renkoExitLastStopSource||result?.reason||assignedExit):null,
        assignmentId:pos?.renkoExitAssignment?.assignmentId||null,
        trailBricks:n(pos?.renkoExitAssignment?.assignedTrailBricks),
        activationPct:n(pos?.renkoExitAssignment?.assignedActivationProfitPct),
        dnaExitReplay:'SHADOW_ONLY'
      }
    });
    return;
  }
  const assignedExit=pos?.executionExitAssignment?.algorithmId||pos?.exitPlanShadow?.selectedAlgorithmId||'ACTUAL';
  const appliedExit=pos?.dynamicExitApplied?.algorithmId||pos?.dynamicExitApplied?.selectedAlgorithmId||pos?.dynamicExitApplied?.reason||result?.reason||null;
  const exitWasAssigned=Boolean(assignedExit), exitWasApplied=Boolean(appliedExit);
  const exitMatched=assignedExit==='ACTUAL'?exitWasApplied:(exitWasApplied&&String(appliedExit).toUpperCase().includes(String(assignedExit).toUpperCase()));
  auditMark(s,'exit',{assigned:exitWasAssigned,applied:exitWasApplied,matched:exitWasAssigned&&exitWasApplied?exitMatched:null,detail:{assignedExit,appliedExit}});
}

function applyAccepted(s,pos,result,tradeId,markBridge=true){
  const snap=pos?.girisAnalizi?.pusuTuglasi||pos?.pusuTuglasi||{};
  const ga={...(pos?.girisAnalizi||{}),entryStrategy:pos?.girisAnalizi?.entryStrategy||pos?.entryStrategy||null,patternId:pos?.girisAnalizi?.patternId||pos?.patternId||snap.patternId,patternKodu:pos?.girisAnalizi?.patternKodu||pos?.patternKodu||snap.patternKodu,referansSeviye:pos?.girisAnalizi?.referansSeviye||pos?.referansSeviye||snap.referansSeviye,renkoBoxSize:pos?.girisAnalizi?.renkoBoxSize||pos?.renkoBoxSize||snap.renkoBoxSize,renkoEntryBrickDistance:pos?.girisAnalizi?.renkoEntryBrickDistance||pos?.renkoEntryBrickDistance||DEFAULT_BRICK()};
  pos.girisAnalizi=ga; const yon=String(pos?.yon||ga.yon||'').toUpperCase(); const patternCode=ga.patternKodu; const pusu={yon,referansSeviye:n(ga.referansSeviye),renkoBoxSize:n(ga.renkoBoxSize)}; const points=rawPath(pos,result);
  if(markBridge) bridgeMark(s,'ACCEPTED','RECORDED',pos); auditDecisionChain(s,pos,result,ga,pusu,points);
  const profile=ensureProfile(s,yon,patternCode,ga.patternId); profile.renkoSequence=ga.renkoSonTuglaDizisi||snap.renkoSonTuglaDizisi||patternCode; profile.renkoBb=ga.renkoBb||snap.renkoBb||null; profile.renkoSuperTrend=ga.renkoSuperTrend||pos?.renkoSuperTrend||null; profile.closed++;
  profile.lastReplay={at:new Date().toISOString(),tradeId,actualBrick:String(ga.entryEvolutionMode||'').toUpperCase()==='SHADOW_ONLY'?null:n(ga.renkoEntryBrickDistance,DEFAULT_BRICK()),selectedShadowBrick:n(ga.renkoEntryBrickDistance,DEFAULT_BRICK()),entryEvolutionMode:ga.entryEvolutionMode||'LIVE_AUTHORITY',entryTimingAuthority:ga.entryTimingAuthority||null,candidates:{}};
  for(const c of CANDIDATES()){ const replay=replayCandidate(pos,result,pusu,c,points); profile.lastReplay.candidates[c.toFixed(2)]=replay; observe(profile.candidates[c.toFixed(2)],replay.triggered,replay.net); }
  try { profile.lastAdaptiveDnaDecision=adaptiveDnaEntry.observe(pos,result,profile.lastReplay.candidates,tradeId); } catch(e) { profile.lastAdaptiveDnaError=e.message; }
  if(shouldEvaluate(profile)){ const pick=choose(profile); profile.lastEvaluationClosed=profile.closed; profile.lastDecision=pick.reason; if(pick.ready&&ayarlar.renkoGirisOtomatikAktiflestirme!==false){ profile.previousBrick=profile.activeBrick; profile.activeBrick=Number(pick.best.key); profile.changedAt=new Date().toISOString(); profile.history.unshift({at:profile.changedAt,from:profile.previousBrick,to:profile.activeBrick,closed:profile.closed,net:r(pick.best.net),pf:r(pick.best.pf),expectancy:r(pick.best.expectancy),reason:pick.reason}); profile.history=profile.history.slice(0,50); } }
  profile.lastUpdatedAt=new Date().toISOString(); s.processedIds[tradeId]={at:profile.lastUpdatedAt,sym:pos?.sym||null,pattern:patternCode}; s.health.lastAcceptedTradeId=tradeId; s.health.stateRecords=Object.keys(s.processedIds).length; return summaryProfile(profile);
}
function close(pos,result={}){
  const s=read(); const tradeId=deterministicId(pos,result); const ga0=pos?.girisAnalizi||{}; let skip=null;
  if(ayarlar.renkoGirisOgrenmeAktif===false) skip='LEARNING_DISABLED'; else if(/MANUAL_EXTERNAL_CLOSE|MANUAL_OVERRIDE/i.test(String(result?.reason||'')) || pos?.manualExternalClose===true) skip='MANUAL_EXTERNAL_CLOSE'; else if((ga0.entryStrategy||pos?.entryStrategy)!=='ST2_RENKO') skip='NOT_ST2_RENKO'; else if(result.restartGap===true||pos?.restartGap===true||pos?.restartRecovered===true||pos?.dataQuality==='RESTART_GAP'||pos?.learningEligible===false) skip='RESTART_GAP'; else if(s.processedIds[tradeId]) skip='DUPLICATE_CLOSE';
  const snap=ga0.pusuTuglasi||pos?.pusuTuglasi||{}; const yon=String(pos?.yon||ga0.yon||'').toUpperCase(); const patternCode=ga0.patternKodu||pos?.patternKodu||snap.patternKodu; const ref=n(ga0.referansSeviye||pos?.referansSeviye||snap.referansSeviye); const box=n(ga0.renkoBoxSize||pos?.renkoBoxSize||snap.renkoBoxSize); const points=skip?[]:rawPath(pos,result); const exit=n(result.exitPrice||result.kapanisFiyati);
  if(!skip&&(!yon||!patternCode)) skip='IDENTITY_MISSING'; if(!skip&&!(ref>0&&box>0)) skip='RENKO_REFERENCE_MISSING'; if(!skip&&(!exit||!points.length)) skip='PRICE_PATH_MISSING';
  if(skip){ bridgeMark(s,'SKIPPED',skip,pos); if(skip==='DUPLICATE_CLOSE') s.health.duplicateRejects++; else if(skip==='RESTART_GAP') s.health.restartGapRejects++; else s.health.otherRejects++; write(s,{allowEmpty:true}); return null; }
  const event={schema:1,type:'SCIENTIFIC_CLOSE',tradeId,acceptedAt:new Date().toISOString(),pos:JSON.parse(JSON.stringify(pos)),result:JSON.parse(JSON.stringify(result))};
  try { appendLedger(event); } catch(e){ s.health.saveErrors++; throw new Error(`LEDGER_WRITE_FAILED: ${e.message}`); }
  const out=applyAccepted(s,pos,result,tradeId,true); const lc=countLedger(); s.health.ledgerRecords=lc.rows; s.health.ledgerStatus=lc.invalid?'DEGRADED':'HEALTHY'; write(s); return out;
}
function summaryProfile(p){ const candidates=Object.entries(p?.candidates||{}).map(([key,val])=>({brick:Number(key),...metric(val)})).sort((a,b)=>a.brick-b.brick); return {...p,candidates}; }

function premierFor(sourceOrYon,pattern){
  try { return adaptiveDnaEntry.premierFor(sourceOrYon,pattern); }
  catch(e) { return {premier:false,reason:`ADAPTIVE_PREMIER_ERROR:${e.message}`,patternKey:profileKey(typeof sourceOrYon==='object'?sourceOrYon?.yon:sourceOrYon,pattern),closed:0,activeBrick:DEFAULT_BRICK(),net:0,pf:0,expectancy:0}; }
}

let summaryCache={sig:null,value:null};
function summaryFileSig(file){try{const st=fs.statSync(file);return `${st.mtimeMs}:${st.size}`;}catch(_){return '-';}}
function summary(){
  // Entry Mode Policy aynı taramada aynı özet kanıtını pusu başına tekrar ister.
  // State/ledger değişmedikçe tüm state JSON + ledger sayımını yeniden yapmak gereksizdir.
  const sig=`${summaryFileSig(STATE_FILE)}|${summaryFileSig(BACKUP_FILE)}|${summaryFileSig(LEDGER_FILE)}`;
  if(summaryCache.sig===sig&&summaryCache.value)return summaryCache.value;
  const s=read(); const profiles=Object.values(s.profiles||{}).map(summaryProfile); const total={profiles:profiles.length,closed:0,tp:0,sl:0,be:0,net:0,assigned:0}; for(const p of profiles){ total.closed+=n(p.closed); if(Math.abs(n(p.activeBrick,DEFAULT_BRICK())-DEFAULT_BRICK())>1e-9) total.assigned++; const cur=p.candidates.find(x=>x.brick===n(p.activeBrick,DEFAULT_BRICK())); if(cur){total.tp+=n(cur.tp);total.sl+=n(cur.sl);total.be+=n(cur.be);total.net+=n(cur.net);} }
  const value={version:VERSION,health:{...blankHealth(),...(s.health||{})},bridge:s.bridge,policy:{candidates:CANDIDATES(),firstAssign:FIRST_ASSIGN(),recalcStep:RECALC_STEP(),recentWindow:RECENT_WINDOW(),recentWeight:RECENT_WEIGHT(),defaultBrick:DEFAULT_BRICK()},recovery:s.recovery||null,total,profiles,decisionChain:{entry:{...blankAudit(),...(s?.decisionChain?.entry||{})},stop:{...blankAudit(),...(s?.decisionChain?.stop||{})},be:{...blankAudit(),...(s?.decisionChain?.be||{})},exit:{...blankAudit(),...(s?.decisionChain?.exit||{})},last:s?.decisionChain?.last||null,legacyEntryAuditV632:s?.legacyEntryAuditV632||null},bridge:{calls:n(s?.bridge?.calls),accepted:n(s?.bridge?.accepted),skipped:{...(s?.bridge?.skipped||{})},last:s?.bridge?.last||null}};
  summaryCache={sig,value};
  return value;
}
function telegram(){
  const x=summary();
  const profiles=x.profiles.slice().sort((a,b)=>b.closed-a.closed);
  const matured=profiles.filter(p=>p.closed>=FIRST_ASSIGN());
  const activeRows=profiles.map(p=>{
    const cur=p.candidates.find(c=>c.brick===n(p.activeBrick,DEFAULT_BRICK()))||metric({});
    const premier=p.closed>=5&&n(cur.net)>0&&n(cur.pf)>1&&n(cur.expectancy)>0;
    return {p,cur,premier};
  });
  const success=activeRows.reduce((a,r)=>a+n(r.cur.tp),0);
  const fail=activeRows.reduce((a,r)=>a+n(r.cur.sl),0);
  const be=activeRows.reduce((a,r)=>a+n(r.cur.be),0);
  const net=activeRows.reduce((a,r)=>a+n(r.cur.net),0);
  const gp=activeRows.reduce((a,r)=>a+n(r.cur.grossProfit),0);
  const gl=activeRows.reduce((a,r)=>a+n(r.cur.grossLoss),0);
  const pf=gl>0?gp/gl:(gp>0?999:0);
  const decisive=success+fail;
  const premierCount=activeRows.filter(r=>r.premier).length;
  const waiting=activeRows.filter(r=>r.p.closed<5).sort((a,b)=>b.p.closed-a.p.closed);

  const replayRows=CANDIDATES().map(brick=>{
    const key=brick.toFixed(2); let samples=0,triggered=0,tp=0,sl=0,beCount=0,netSum=0,gpSum=0,glSum=0;
    for(const p of profiles){ const m=metric(p.candidates?.find?.(c=>c.brick===brick)||p.candidates?.[key]||{}); samples+=n(m.samples);triggered+=n(m.triggered);tp+=n(m.tp);sl+=n(m.sl);beCount+=n(m.be);netSum+=n(m.net);gpSum+=n(m.grossProfit);glSum+=n(m.grossLoss); }
    const missed=Math.max(0,profiles.reduce((a,p)=>a+n(p.closed),0)-triggered);
    const decisive=tp+sl;
    return {brick,samples,triggered,missed,tp,sl,be:beCount,net:netSum,pf:glSum>0?gpSum/glSum:(gpSum>0?999:0),wr:decisive?tp/decisive*100:0,expectancy:triggered?netSum/triggered:0};
  });

  let t=`\n\n🧠 <b>ST2 RENKO GİRİŞ EVRİMİ</b>\n━━━━━━━━━━━━━━━━━━\n`;
  const hh=x.health||{}; t+=`💾 State ${hh.stateStatus||'UNKNOWN'} | Ledger ${hh.ledgerStatus||'UNKNOWN'} | State kayıt ${n(hh.stateRecords)} | Ledger kayıt ${n(hh.ledgerRecords)}\n`; t+=`🕒 Son kayıt ${hh.lastSuccessfulSaveAt||'YOK'} | Son kabul ${hh.lastAcceptedTradeId||'YOK'} | Restart yüklenen ${n(hh.loadedAfterRestart)}\n`; t+=`🧯 Duplicate ${n(hh.duplicateRejects)} | GAP ret ${n(hh.restartGapRejects)} | Diğer ret ${n(hh.otherRejects)} | Save hata ${n(hh.saveErrors)} | Load hata ${n(hh.loadErrors)}\n`; t+=`♻️ Backup recovery ${n(hh.backupRecoveries)} | Ledger rebuild ${n(hh.ledgerRebuilds)}\n`;
  t+=`📦 Pattern: ${profiles.length}/16 | Öğrenen: ${profiles.filter(p=>p.closed>0).length} | Olgun N${x.policy.firstAssign}+: ${matured.length}\n`;
  t+=`🏆 Premier şartını geçen: ${premierCount} | Varsayılan ${x.policy.defaultBrick.toFixed(2)} dışı öğrenilmiş atama: ${x.total.assigned}\n`;
  t+=`📊 Bilimsel kapanış: ${x.total.closed}\n`;
  if(x.recovery) t+=`♻️ Tarihsel hafıza kurtarıldı: ${n(x.recovery.profiles)} pattern | Kaynak ${path.basename(x.recovery.source||'YOK')}\n`;
  const skippedTotal=Object.values(x.bridge?.skipped||{}).reduce((a,v)=>a+n(v),0);
  const skipText=Object.entries(x.bridge?.skipped||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k} ${v}`).join(' | ')||'YOK';
  t+=`🔌 Kapanış köprüsü: Çağrı ${n(x.bridge?.calls)} | Kabul ${n(x.bridge?.accepted)} | Ret ${skippedTotal}\n`;
  t+=`🧾 Ret nedenleri: ${skipText}\n`;
  t+=`✅ Başarılı ${success} | ❌ Başarısız ${fail} | ⚖️ BE ${be}\n`;
  t+=`WR %${decisive?(success/decisive*100).toFixed(1):'0.0'} | Net ${net>=0?'+':''}${net.toFixed(4)} | PF ${pf>=999?'999.00':pf.toFixed(2)}\n`;

  const failedPatterns=activeRows
    .filter(r=>n(r.cur.sl)>0)
    .sort((a,b)=>n(b.cur.sl)-n(a.cur.sl)||n(a.cur.net)-n(b.cur.net)||a.p.key.localeCompare(b.p.key));
  t+=`
❌ <b>BAŞARISIZ PATTERN DAĞILIMI</b> — Toplam ${fail}
`;
  if(!failedPatterns.length) t+=`✅ Aktif giriş sonuçlarında başarısız pattern yok.
`;
  for(const r0 of failedPatterns){
    const decided0=n(r0.cur.tp)+n(r0.cur.sl);
    const wr0=decided0?(n(r0.cur.tp)/decided0*100):0;
    const status0=r0.premier?'🟢 PREMIER':(r0.p.closed>=5?'🔴 ŞART DIŞI':`🟡 N${r0.p.closed}/5`);
    t+=`${r0.p.yon} ${r0.p.patternCode} | Giriş ${n(r0.p.activeBrick,x.policy.defaultBrick).toFixed(2)} | N${n(r0.p.closed)} | ✅${n(r0.cur.tp)} ❌${n(r0.cur.sl)} ⚖️${n(r0.cur.be)} | WR %${wr0.toFixed(1)} | Net ${n(r0.cur.net)>=0?'+':''}${n(r0.cur.net).toFixed(4)} | PF ${n(r0.cur.pf).toFixed(2)} | ${status0}
`;
  }
  const failedCheck=failedPatterns.reduce((a,r)=>a+n(r.cur.sl),0);
  t+=`🧮 Başarısız mutabakatı: ${fail} = ${failedPatterns.map(r=>`${r.p.yon} ${r.p.patternCode} ${n(r.cur.sl)}`).join(' + ')||'0'} | Fark ${fail-failedCheck>=0?'+':''}${fail-failedCheck} ${fail===failedCheck?'✅':'⚠️'}
`;

  const dist={}; for(const r0 of activeRows){ const k=n(r0.p.activeBrick,x.policy.defaultBrick).toFixed(2); dist[k]=n(dist[k])+1; }
  t+=`🎯 Aktif giriş dağılımı: ${Object.entries(dist).sort((a,b)=>Number(a[0])-Number(b[0])).map(([k,v])=>`${k}→${v}`).join(' | ')||'YOK'}
`;
  t+=`ℹ️ İlk atama N${x.policy.firstAssign}; Premier için N≥5 + Net>0 + PF>1 + Exp>0.
`;
  t+=`
🔗 <b>KARAR ZİNCİRİ — ATANAN / UYGULANAN</b>
`;
  if(x.decisionChain?.legacyEntryAuditV632){
    const la=x.decisionChain.legacyEntryAuditV632;
    t+=`ℹ️ Eski giriş audit ayrıştırıldı: Atanan ${n(la.assigned)} | Eski eşleşen ${n(la.matched)} | Eski şüpheli ${n(la.mismatched)} | Yeni yönsel audit yalnız v6.3.3 sonrası kapanışlarla dolar.\n`;
  }
  for(const [key,label] of [['entry','🎯 Giriş'],['stop','🛡 Stop'],['be','⚖️ BE'],['exit','🏁 Exit']]){
    const a=x.decisionChain[key]||{};
    if(n(a.assigned)===0) t+=`${label}: Atanan 0 | Uygulanan 0 | Henüz doğrulanmış örnek yok | Eksik veri ${n(a.missing)}\n`;
    else { const rate=n(a.matched)/n(a.assigned)*100; t+=`${label}: Atanan ${n(a.assigned)} | Uygulanan ${n(a.applied)} | Eşleşen ${n(a.matched)} | Eşleşmeyen ${n(a.mismatched)} | Bilinmeyen ${n(a.unknown)} | Eksik veri ${n(a.missing)} | Uyum %${rate.toFixed(1)}\n`; const reasons=Object.entries(a.reasons||{}).sort((x,y)=>n(y[1])-n(x[1])).map(([k,v])=>`${k} ${v}`).join(' | '); if(reasons)t+=`   ↳ Neden: ${reasons}\n`; }
  }

  t+=`\n🧪 <b>PRICE-PATH REPLAY — GİRİŞ KARŞILAŞTIRMASI</b>\n`;
  for(const r0 of replayRows){
    const triggerRate=r0.samples?r0.triggered/r0.samples*100:0;
    t+=`${r0.brick.toFixed(2)} | Tetik ${r0.triggered}/${r0.samples} (%${triggerRate.toFixed(1)}) | ✅${r0.tp} ❌${r0.sl} ⚖️${r0.be} | WR %${r0.wr.toFixed(1)} | Net ${r0.net>=0?'+':''}${r0.net.toFixed(4)} | PF ${r0.pf>=999?'999.00':r0.pf.toFixed(2)} | Exp ${r0.expectancy>=0?'+':''}${r0.expectancy.toFixed(4)}\n`;
  }

  const allPatterns=activeRows.slice().sort((a,b)=>b.p.closed-a.p.closed||b.cur.net-a.cur.net||a.p.key.localeCompare(b.p.key));
  t+=`\n🧩 <b>TÜM PATTERNLER — AKTİF GİRİŞ SONUCU</b>\n`;
  if(!allPatterns.length) t+=`⏳ Henüz pattern kapanışı yok.\n`;
  for(const r0 of allPatterns){
    const decided=n(r0.cur.tp)+n(r0.cur.sl);
    const wr0=decided?(n(r0.cur.tp)/decided*100):0;
    const exp0=n(r0.cur.expectancy);
    const state=r0.premier?'🟢':(r0.p.closed>=5?'🔴':'🟡');
    t+=`${state} ${r0.p.yon} ${r0.p.patternCode} | G ${n(r0.p.activeBrick,x.policy.defaultBrick).toFixed(2)} | N${r0.p.closed} | ✅${n(r0.cur.tp)} ❌${n(r0.cur.sl)} ⚖️${n(r0.cur.be)} | WR %${wr0.toFixed(1)} | PF ${n(r0.cur.pf).toFixed(2)} | Exp ${exp0>=0?'+':''}${exp0.toFixed(4)} | Net ${n(r0.cur.net)>=0?'+':''}${n(r0.cur.net).toFixed(4)}\n`;
  }

  const best=activeRows.filter(r=>r.p.closed>0).sort((a,b)=>b.cur.net-a.cur.net||b.cur.pf-a.cur.pf).slice(0,5);
  t+=`\n🏅 <b>EN İYİ PATTERNLER</b>\n`;
  if(!best.length) t+=`⏳ Henüz kapanan ST2 Renko işlemi yok.\n`;
  for(const r0 of best){
    const status=r0.premier?'🟢 PREMIER':(r0.p.closed>=5?'🔴 ŞART DIŞI':`🟡 N${r0.p.closed}/5`);
    t+=`${r0.p.yon} ${r0.p.patternCode} | Giriş ${n(r0.p.activeBrick,x.policy.defaultBrick).toFixed(2)} | N${r0.p.closed} | ✅${n(r0.cur.tp)} ❌${n(r0.cur.sl)} ⚖️${n(r0.cur.be)} | Net ${n(r0.cur.net)>=0?'+':''}${n(r0.cur.net).toFixed(4)} | PF ${n(r0.cur.pf).toFixed(2)} | ${status}\n`;
  }

  const proof=best.slice(0,3);
  if(proof.length){
    t+=`\n🔬 <b>PATTERN'E ÖZEL REPLAY KANITI</b>\n`;
    for(const r0 of proof){
      t+=`\n<b>${r0.p.yon} ${r0.p.patternCode}</b> | Aktif ${n(r0.p.activeBrick,x.policy.defaultBrick).toFixed(2)} | N${r0.p.closed}\n`;
      const rows=r0.p.candidates.slice().sort((a,b)=>a.brick-b.brick);
      for(const c of rows){
        const marker=Math.abs(c.brick-n(r0.p.activeBrick,x.policy.defaultBrick))<1e-9?'✅ AKTİF':(n(c.triggered)<FIRST_ASSIGN()?'⚪ VERİ AZ':(n(c.net)>0&&n(c.pf)>1&&n(c.expectancy)>0?'🟢 UYGUN':'🔴 ZAYIF'));
        const triggerRate=n(c.samples)?n(c.triggered)/n(c.samples)*100:0;
        t+=`${c.brick.toFixed(2)} | Tetik ${n(c.triggered)}/${n(c.samples)} (%${triggerRate.toFixed(1)}) | ✅${n(c.tp)} ❌${n(c.sl)} ⚖️${n(c.be)} | WR %${n(c.winRate).toFixed(1)} | Net ${n(c.net)>=0?'+':''}${n(c.net).toFixed(4)} | PF ${n(c.pf).toFixed(2)} | ${marker}\n`;
      }
      const h=Array.isArray(r0.p.history)&&r0.p.history[0];
      if(h) t+=`🔄 Son değişim: ${n(h.from).toFixed(2)} → ${n(h.to).toFixed(2)} | ${h.reason} | N${n(h.closed)}\n`;
      else t+=`🧠 Karar: ${r0.p.lastDecision||'İlk bilimsel değerlendirme bekleniyor'}\n`;
      const eligibleRows=rows.filter(c=>n(c.triggered)>=FIRST_ASSIGN()&&n(c.net)>0&&n(c.pf)>1&&n(c.expectancy)>0&&n(c.weightedExpectancy)>0)
        .sort((a,b)=>n(b.net)-n(a.net)||n(b.score)-n(a.score)||n(b.weightedExpectancy)-n(a.weightedExpectancy)||n(a.brick)-n(b.brick));
      const leader=eligibleRows[0]||null;
      const active=rows.find(c=>Math.abs(n(c.brick)-n(r0.p.activeBrick,x.policy.defaultBrick))<1e-9)||null;
      const premierChecks=`N ${n(r0.p.closed)>=5?'✅':'❌'} | Net ${n(r0.cur.net)>0?'✅':'❌'} | PF ${n(r0.cur.pf)>1?'✅':'❌'} | Exp ${n(r0.cur.expectancy)>0?'✅':'❌'}`;
      const selectionState=leader&&active&&Math.abs(n(leader.brick)-n(active.brick))>1e-9?`Liderden farklı aktif korunuyor: ${r0.p.lastDecision||'FARK_ANLAMLI_DEGIL / değerlendirme periyodu bekleniyor'}`:'Aktif giriş mevcut liderle uyumlu';
      t+=`🧾 Seçim gerekçesi: ${leader?`Replay lideri ${n(leader.brick).toFixed(2)} Net ${n(leader.net)>=0?'+':''}${n(leader.net).toFixed(4)} / Skor ${n(leader.score).toFixed(4)}`:'Pozitif ve yeterli aday yok'} | Aktif ${active?n(active.brick).toFixed(2):'YOK'} | ${selectionState}\n`;
      t+=`⚙️ Politika: Net lider aday olur; aktif değişim yalnız yeniden-hesaplama adımında ve minimum skor/üstünlük eşiği aşılırsa yapılır.\n`;
      t+=`🏆 Premier kanıtı: ${premierChecks}\n`;
    }
  }

  if(waiting.length){
    t+=`\n⏳ <b>PATTERN GİRİŞ EVRİMİNDE N5'E EN YAKIN</b>\n`;
    for(const r0 of waiting.slice(0,5)) t+=`${r0.p.yon} ${r0.p.patternCode} | N${r0.p.closed}/5 | ${Math.max(0,5-r0.p.closed)} kapanış kaldı\n`;
  }
  return t;
}

module.exports={VERSION,STATE_FILE,BACKUP_FILE,LEDGER_FILE,blank,read,write,rebuildFromLedger,deterministicId,legacyStateFiles,recoverHistoricalState,CANDIDATES,DEFAULT_BRICK,FIRST_ASSIGN,RECALC_STEP,RECENT_WINDOW,RECENT_WEIGHT,profileKey,targetPrice,activeFor,premierFor,close,summary,telegram,metric,choose,replayCandidate,frozenRisk,frozenExit};
