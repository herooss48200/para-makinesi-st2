'use strict';

/**
 * AGROS ST2 Renko Entry Evolution
 * - Her yön + son-4 pattern için bağımsız giriş tuğla mesafesi öğrenir.
 * - Başlangıç 0.25 tuğladır.
 * - İlk seçim 3 karşılaştırılabilir kapanışta yapılır.
 * - Sonraki değerlendirme her 5 yeni kapanışta yapılır.
 * - Tarih korunur; son pencere daha yüksek ağırlık taşır.
 * - Yalnız yeni pozisyona atanır; açık pozisyonun seviyesi değişmez.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');

const VERSION = 'v5.5.9-fix.2-ST2-RENKO-IDENTITY-CLOSE-BINDING';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-renko-entry-evolution.json');

const CANDIDATES = () => (Array.isArray(ayarlar.renkoGirisAdayTugla)
  ? ayarlar.renkoGirisAdayTugla : [0.25, 0.50, 0.75, 1.00, 1.25, 1.50])
  .map(Number).filter(x => x > 0).sort((a,b)=>a-b);
const FIRST_ASSIGN = () => Math.max(3, Number(ayarlar.renkoGirisIlkAtamaKapanis || 3));
const RECALC_STEP = () => Math.max(1, Number(ayarlar.renkoGirisYenidenHesaplamaAdimi || 5));
const RECENT_WINDOW = () => Math.max(3, Number(ayarlar.renkoGirisGuncelPencere || 10));
const RECENT_WEIGHT = () => Math.min(0.9, Math.max(0.5, Number(ayarlar.renkoGirisGuncelAgirlik || 0.65)));
const MIN_IMPROVEMENT = () => Math.max(0, Number(ayarlar.renkoGirisMinSkorIyilesme || 0.005));

function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function r(v,d=6){ return Number(n(v).toFixed(d)); }
function blankMetric(){ return { samples:0, triggered:0, tp:0, sl:0, be:0, net:0, grossProfit:0, grossLoss:0, recent:[] }; }
function blank(){ return { version:VERSION, updatedAt:null, profiles:{}, bridge:{calls:0,accepted:0,skipped:{},last:null} }; }
function bridgeMark(s,status,reason,pos){
  s.bridge={calls:n(s?.bridge?.calls),accepted:n(s?.bridge?.accepted),skipped:{...(s?.bridge?.skipped||{})},last:s?.bridge?.last||null};
  s.bridge.calls++;
  if(status==='ACCEPTED') s.bridge.accepted++; else s.bridge.skipped[reason]=n(s.bridge.skipped[reason])+1;
  s.bridge.last={at:new Date().toISOString(),status,reason,sym:pos?.sym||null,yon:pos?.yon||null,entryStrategy:pos?.girisAnalizi?.entryStrategy||null,patternCode:pos?.girisAnalizi?.patternKodu||null};
}
function ensure(){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); }
function read(){ ensure(); const x=io.readJsonBounded(STATE_FILE,null,{maxBytes:16*1024*1024}); return {...blank(),...(x||{}),profiles:{...(x?.profiles||{})}}; }
function write(s){ ensure(); s.version=VERSION; s.updatedAt=new Date().toISOString(); io.writeJsonAtomic(STATE_FILE,s); return s; }
function profileKey(yon, patternCode){ return `${String(yon||'').toUpperCase()}|${String(patternCode||'').toUpperCase()}`; }
function recentMetric(arr=[]){ const out=blankMetric(); for(const x of arr){ add(out,n(x?.net),false); } return out; }
function metric(raw={}){
  const m={...blankMetric(),...raw,recent:Array.isArray(raw.recent)?raw.recent.slice(-RECENT_WINDOW()):[]};
  m.pf=m.grossLoss>0?m.grossProfit/m.grossLoss:(m.grossProfit>0?999:0);
  m.expectancy=m.samples?m.net/m.samples:0;
  m.winRate=(m.tp+m.sl)>0?(m.tp/(m.tp+m.sl))*100:0;
  const rm=recentMetric(m.recent); rm.pf=rm.grossLoss>0?rm.grossProfit/rm.grossLoss:(rm.grossProfit>0?999:0); rm.expectancy=rm.samples?rm.net/rm.samples:0;
  const rw=rm.samples?RECENT_WEIGHT():0, hw=1-rw;
  m.recentMetrics=rm;
  m.weightedExpectancy=(m.expectancy*hw)+(rm.expectancy*rw);
  m.weightedPf=(Math.min(m.pf,10)*hw)+(Math.min(rm.pf,10)*rw);
  m.score=m.weightedExpectancy + Math.max(0,m.weightedPf-1)*0.01;
  return m;
}
function add(m,net,pushRecent=true){
  m.samples=n(m.samples)+1; m.triggered=n(m.triggered)+1; m.net=n(m.net)+net;
  if(net>0.000001){m.tp=n(m.tp)+1;m.grossProfit=n(m.grossProfit)+net;}
  else if(net<-0.000001){m.sl=n(m.sl)+1;m.grossLoss=n(m.grossLoss)+Math.abs(net);}
  else m.be=n(m.be)+1;
  if(pushRecent) m.recent=[...(Array.isArray(m.recent)?m.recent:[]),{net:r(net),at:Date.now()}].slice(-RECENT_WINDOW());
}
function ensureProfile(s,yon,patternCode,patternId){
  const key=profileKey(yon,patternCode); let p=s.profiles[key];
  if(!p) p=s.profiles[key]={key,yon:String(yon).toUpperCase(),patternCode:String(patternCode).toUpperCase(),patternId:patternId||'',activeBrick:0.25,previousBrick:null,closed:0,lastEvaluationClosed:0,candidates:{},history:[]};
  for(const c of CANDIDATES()){ const k=c.toFixed(2); p.candidates[k]||=blankMetric(); }
  return p;
}
function activeFor(yon,patternCode){ const s=read(); return n(s.profiles[profileKey(yon,patternCode)]?.activeBrick,0.25); }
function targetPrice(pusu,brickDistance){ const ref=n(pusu?.referansSeviye); const box=n(pusu?.renkoBoxSize); if(!(ref>0&&box>0)) return 0; return String(pusu.yon).toUpperCase()==='SHORT'?ref-(brickDistance*box):ref+(brickDistance*box); }
function shouldEvaluate(p){ return p.closed>=FIRST_ASSIGN() && (p.lastEvaluationClosed===0 || p.closed-p.lastEvaluationClosed>=RECALC_STEP()); }
function choose(p){
  const rows=Object.entries(p.candidates||{}).map(([key,val])=>({key,...metric(val)}));
  const eligible=rows.filter(x=>x.samples>=FIRST_ASSIGN()&&x.net>0&&x.pf>1&&x.expectancy>0&&x.weightedExpectancy>0)
    .sort((a,b)=>b.net-a.net||b.score-a.score||b.weightedExpectancy-a.weightedExpectancy||Number(a.key)-Number(b.key));
  const best=eligible[0]||null; const current=rows.find(x=>x.key===n(p.activeBrick,0.25).toFixed(2))||null;
  if(!best) return {ready:false,best:null,current,reason:`N${FIRST_ASSIGN()}_VE_POZITIF_NET_BEKLENIYOR`};
  if(best.key===n(p.activeBrick,0.25).toFixed(2)) return {ready:false,best,current,reason:'MEVCUT_GIRIS_ZATEN_EN_COK_NET_KAZANDIRIYOR'};
  if(current&&current.samples>=FIRST_ASSIGN()&&best.score<=current.score+MIN_IMPROVEMENT()) return {ready:false,best,current,reason:'FARK_ANLAMLI_DEGIL'};
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
  const yon=String(pusu.yon).toUpperCase(), entry=targetPrice(pusu,brickDistance), activeAtOpen=n(pos?.girisAnalizi?.renkoEntryBrickDistance,0.25);
  let triggerIndex=points.findIndex(x=>yon==='SHORT'?x.p<=entry:x.p>=entry);
  if(triggerIndex<0 && brickDistance<=activeAtOpen+1e-9) triggerIndex=0;
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
function close(pos,result={}){
  const s=read();
  const snap=pos?.girisAnalizi?.pusuTuglasi||pos?.pusuTuglasi||{};
  const ga={
    ...(pos?.girisAnalizi||{}),
    entryStrategy:pos?.girisAnalizi?.entryStrategy||pos?.entryStrategy||null,
    patternId:pos?.girisAnalizi?.patternId||pos?.patternId||snap.patternId,
    patternKodu:pos?.girisAnalizi?.patternKodu||pos?.patternKodu||snap.patternKodu,
    referansSeviye:pos?.girisAnalizi?.referansSeviye||pos?.referansSeviye||snap.referansSeviye,
    renkoBoxSize:pos?.girisAnalizi?.renkoBoxSize||pos?.renkoBoxSize||snap.renkoBoxSize,
    renkoEntryBrickDistance:pos?.girisAnalizi?.renkoEntryBrickDistance||pos?.renkoEntryBrickDistance||0.25
  };
  pos.girisAnalizi=ga;
  let skip=null;
  if(ayarlar.renkoGirisOgrenmeAktif===false) skip='LEARNING_DISABLED';
  else if(ga.entryStrategy!=='ST2_RENKO') skip='NOT_ST2_RENKO';
  else if(result.restartGap===true||pos?.restartGap===true) skip='RESTART_GAP';
  const yon=String(pos?.yon||ga.yon||'').toUpperCase(); const patternCode=ga.patternKodu;
  if(!skip&&(!yon||!patternCode)) skip='IDENTITY_MISSING';
  const pusu={yon,referansSeviye:n(ga.referansSeviye),renkoBoxSize:n(ga.renkoBoxSize)};
  if(!skip&&!(pusu.referansSeviye>0&&pusu.renkoBoxSize>0)) skip='RENKO_REFERENCE_MISSING';
  const points=skip?[]:rawPath(pos,result); const exit=n(result.exitPrice||result.kapanisFiyati);
  if(!skip&&(!exit||!points.length)) skip='PRICE_PATH_MISSING';
  if(skip){ bridgeMark(s,'SKIPPED',skip,pos); write(s); return null; }
  bridgeMark(s,'ACCEPTED','RECORDED',pos);
  const profile=ensureProfile(s,yon,patternCode,ga.patternId); profile.closed++;
  profile.lastReplay={at:new Date().toISOString(),actualBrick:n(ga.renkoEntryBrickDistance,0.25),candidates:{}};
  for(const c of CANDIDATES()){
    const replay=replayCandidate(pos,result,pusu,c,points);
    profile.lastReplay.candidates[c.toFixed(2)]=replay;
    if(!replay.triggered) continue;
    add(profile.candidates[c.toFixed(2)],replay.net);
  }
  if(shouldEvaluate(profile)){
    const pick=choose(profile); profile.lastEvaluationClosed=profile.closed; profile.lastDecision=pick.reason;
    if(pick.ready&&ayarlar.renkoGirisOtomatikAktiflestirme!==false){
      profile.previousBrick=profile.activeBrick; profile.activeBrick=Number(pick.best.key); profile.changedAt=new Date().toISOString();
      profile.history.unshift({at:profile.changedAt,from:profile.previousBrick,to:profile.activeBrick,closed:profile.closed,net:r(pick.best.net),pf:r(pick.best.pf),expectancy:r(pick.best.expectancy),reason:pick.reason}); profile.history=profile.history.slice(0,50);
    }
  }
  profile.lastUpdatedAt=new Date().toISOString(); write(s); return summaryProfile(profile);
}
function summaryProfile(p){ const candidates=Object.entries(p?.candidates||{}).map(([key,val])=>({brick:Number(key),...metric(val)})).sort((a,b)=>a.brick-b.brick); return {...p,candidates}; }
function summary(){ const s=read(); const profiles=Object.values(s.profiles||{}).map(summaryProfile); const total={profiles:profiles.length,closed:0,tp:0,sl:0,be:0,net:0,assigned:0}; for(const p of profiles){ total.closed+=n(p.closed); if(n(p.activeBrick)!==0.25) total.assigned++; const cur=p.candidates.find(x=>x.brick===n(p.activeBrick,0.25)); if(cur){total.tp+=n(cur.tp);total.sl+=n(cur.sl);total.be+=n(cur.be);total.net+=n(cur.net);} } return {version:VERSION,policy:{candidates:CANDIDATES(),firstAssign:FIRST_ASSIGN(),recalcStep:RECALC_STEP(),recentWindow:RECENT_WINDOW(),recentWeight:RECENT_WEIGHT(),defaultBrick:0.25},total,profiles,bridge:{calls:n(s?.bridge?.calls),accepted:n(s?.bridge?.accepted),skipped:{...(s?.bridge?.skipped||{})},last:s?.bridge?.last||null}}; }
function telegram(){
  const x=summary();
  const profiles=x.profiles.slice().sort((a,b)=>b.closed-a.closed);
  const matured=profiles.filter(p=>p.closed>=FIRST_ASSIGN());
  const activeRows=profiles.map(p=>{
    const cur=p.candidates.find(c=>c.brick===n(p.activeBrick,0.25))||metric({});
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
    return {brick,samples,triggered,missed,tp,sl,be:beCount,net:netSum,pf:glSum>0?gpSum/glSum:(gpSum>0?999:0)};
  });

  let t=`\n\n🧠 <b>ST2 RENKO GİRİŞ EVRİMİ</b>\n━━━━━━━━━━━━━━━━━━\n`;
  t+=`📦 Pattern: ${profiles.length}/16 | Öğrenen: ${profiles.filter(p=>p.closed>0).length} | Olgun N${x.policy.firstAssign}+: ${matured.length}\n`;
  t+=`🏆 Premier şartını geçen: ${premierCount} | 0.25 dışı atama: ${x.total.assigned}\n`;
  t+=`📊 Bilimsel kapanış: ${x.total.closed}\n`;
  const skippedTotal=Object.values(x.bridge?.skipped||{}).reduce((a,v)=>a+n(v),0);
  const skipText=Object.entries(x.bridge?.skipped||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k} ${v}`).join(' | ')||'YOK';
  t+=`🔌 Kapanış köprüsü: Çağrı ${n(x.bridge?.calls)} | Kabul ${n(x.bridge?.accepted)} | Ret ${skippedTotal}\n`;
  t+=`🧾 Ret nedenleri: ${skipText}\n`;
  t+=`✅ Başarılı ${success} | ❌ Başarısız ${fail} | ⚖️ BE ${be}\n`;
  t+=`WR %${decisive?(success/decisive*100).toFixed(1):'0.0'} | Net ${net>=0?'+':''}${net.toFixed(4)} | PF ${pf>=999?'999.00':pf.toFixed(2)}\n`;
  t+=`ℹ️ İlk atama N${x.policy.firstAssign}; Premier için N≥5 + Net>0 + PF>1 + Exp>0.\n`;

  t+=`\n🧪 <b>PRICE-PATH REPLAY — GİRİŞ KARŞILAŞTIRMASI</b>\n`;
  for(const r0 of replayRows){
    t+=`${r0.brick.toFixed(2)} | Tetik ${r0.triggered} | Kaçan ${r0.missed} | ✅${r0.tp} ❌${r0.sl} ⚖️${r0.be} | Net ${r0.net>=0?'+':''}${r0.net.toFixed(4)} | PF ${r0.pf>=999?'999.00':r0.pf.toFixed(2)}\n`;
  }

  const allPatterns=activeRows.slice().sort((a,b)=>b.p.closed-a.p.closed||b.cur.net-a.cur.net||a.p.key.localeCompare(b.p.key));
  t+=`\n🧩 <b>TÜM PATTERNLER — AKTİF GİRİŞ SONUCU</b>\n`;
  if(!allPatterns.length) t+=`⏳ Henüz pattern kapanışı yok.\n`;
  for(const r0 of allPatterns){
    const decided=n(r0.cur.tp)+n(r0.cur.sl);
    const wr0=decided?(n(r0.cur.tp)/decided*100):0;
    const exp0=n(r0.cur.expectancy);
    const state=r0.premier?'🟢':(r0.p.closed>=5?'🔴':'🟡');
    t+=`${state} ${r0.p.yon} ${r0.p.patternCode} | G ${n(r0.p.activeBrick,0.25).toFixed(2)} | N${r0.p.closed} | ✅${n(r0.cur.tp)} ❌${n(r0.cur.sl)} ⚖️${n(r0.cur.be)} | WR %${wr0.toFixed(1)} | PF ${n(r0.cur.pf).toFixed(2)} | Exp ${exp0>=0?'+':''}${exp0.toFixed(4)} | Net ${n(r0.cur.net)>=0?'+':''}${n(r0.cur.net).toFixed(4)}\n`;
  }

  const best=activeRows.filter(r=>r.p.closed>0).sort((a,b)=>b.cur.net-a.cur.net||b.cur.pf-a.cur.pf).slice(0,5);
  t+=`\n🏅 <b>EN İYİ PATTERNLER</b>\n`;
  if(!best.length) t+=`⏳ Henüz kapanan ST2 Renko işlemi yok.\n`;
  for(const r0 of best){
    const status=r0.premier?'🟢 PREMIER':(r0.p.closed>=5?'🔴 ŞART DIŞI':`🟡 N${r0.p.closed}/5`);
    t+=`${r0.p.yon} ${r0.p.patternCode} | Giriş ${n(r0.p.activeBrick,0.25).toFixed(2)} | N${r0.p.closed} | ✅${n(r0.cur.tp)} ❌${n(r0.cur.sl)} ⚖️${n(r0.cur.be)} | Net ${n(r0.cur.net)>=0?'+':''}${n(r0.cur.net).toFixed(4)} | PF ${n(r0.cur.pf).toFixed(2)} | ${status}\n`;
  }

  const proof=best.slice(0,3);
  if(proof.length){
    t+=`\n🔬 <b>PATTERN'E ÖZEL REPLAY KANITI</b>\n`;
    for(const r0 of proof){
      t+=`\n<b>${r0.p.yon} ${r0.p.patternCode}</b> | Aktif ${n(r0.p.activeBrick,0.25).toFixed(2)} | N${r0.p.closed}\n`;
      const rows=r0.p.candidates.slice().sort((a,b)=>a.brick-b.brick);
      for(const c of rows){
        const marker=Math.abs(c.brick-n(r0.p.activeBrick,0.25))<1e-9?'✅ AKTİF':(n(c.samples)<FIRST_ASSIGN()?'⚪ VERİ AZ':(n(c.net)>0&&n(c.pf)>1&&n(c.expectancy)>0?'🟢 UYGUN':'🔴 ZAYIF'));
        t+=`${c.brick.toFixed(2)} | N${n(c.samples)} | ✅${n(c.tp)} ❌${n(c.sl)} ⚖️${n(c.be)} | Net ${n(c.net)>=0?'+':''}${n(c.net).toFixed(4)} | PF ${n(c.pf).toFixed(2)} | ${marker}\n`;
      }
      const h=Array.isArray(r0.p.history)&&r0.p.history[0];
      if(h) t+=`🔄 Son değişim: ${n(h.from).toFixed(2)} → ${n(h.to).toFixed(2)} | ${h.reason} | N${n(h.closed)}\n`;
      else t+=`🧠 Karar: ${r0.p.lastDecision||'İlk bilimsel değerlendirme bekleniyor'}\n`;
    }
  }

  if(waiting.length){
    t+=`\n⏳ <b>PREMIER'E EN YAKIN</b>\n`;
    for(const r0 of waiting.slice(0,5)) t+=`${r0.p.yon} ${r0.p.patternCode} | N${r0.p.closed}/5 | ${Math.max(0,5-r0.p.closed)} kapanış kaldı\n`;
  }
  return t;
}

module.exports={VERSION,STATE_FILE,CANDIDATES,FIRST_ASSIGN,RECALC_STEP,RECENT_WINDOW,RECENT_WEIGHT,profileKey,targetPrice,activeFor,close,summary,telegram,metric,choose,replayCandidate,frozenRisk,frozenExit};
