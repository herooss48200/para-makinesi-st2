/** AGROS v4.5.5 — 27/27 runtime denetimi + yeni emir self-test + canlı atama kanıtı. */
const replay = require('./22_exit_replay_engine.js');
const health = require('./54_exit_health_check.js');
const cards = require('./55_dna_identity_card_engine.js');
const dynamic = require('./47_dynamic_dna_exit_engine.js');
const executor = require('./51_sanal_dynamic_exit_executor.js');

const VERSION = 'v4.5.5-EXIT-SOURCE-OF-TRUTH-FINAL';
const CORE_EXPECTED = 27;

function n(v,d=0){v=Number(v);return Number.isFinite(v)?v:d;}
function classify(model){
  const c=String(model.className||'UNKNOWN');
  if(c==='TIME_EXIT') return 'TIME';
  if(c==='FIXED_TP') return 'FIXED_TP';
  if(c==='MFE_PROTECTION') return 'MFE';
  if(c==='ATR_TRAILING') return 'ATR';
  if(c==='TREND_EXIT') return 'TREND';
  if(c==='ALTERNATIVE_LADDER') return 'LADDER';
  if(c==='DYNAMIC_EXIT') return 'DYNAMIC';
  if(c==='HYBRID_EXIT') return 'HYBRID';
  return c;
}
function coreCatalogSummary(){
  const models=replay.algorithms();
  const groups={};
  for(const m of models){const k=classify(m);groups[k]=(groups[k]||0)+1;}
  const configured=models.length;
  return {coreExpected:CORE_EXPECTED,configured,variantCount:Math.max(0,configured-CORE_EXPECTED),groups};
}
function runtimeCoverage(){
  const models=replay.algorithms();
  const supported=models.filter(x=>executor.isSupported(x.id));
  const unsupported=models.filter(x=>!executor.isSupported(x.id));
  return {total:models.length,supported:supported.length,unsupported:unsupported.map(x=>({id:x.id,label:x.label,className:x.className})),complete:unsupported.length===0};
}
function assignmentPreflight(limit=8){
  const model=dynamic.readModel()||{};
  const source=Array.isArray(model.dna)&&model.dna.length?model.dna:(model.dnaBase||[]);
  const seen=new Set(),rows=[];
  for(const d of source){
    const key=String(d?.key||'');
    if(!key||seen.has(key))continue;
    seen.add(key);
    const side=key.includes('YON=SHORT')?'SHORT':'LONG';
    const pos={sym:'SELFTEST',yon:side,sanal:true,acilisZamani:Date.now(),blackboxAcilis:{strategySignature:{key,shortKey:key}}};
    const plan=dynamic.selectForPosition(pos,model,{persistDecision:false});
    rows.push({dna:key,ready:Boolean(plan?.ready),algorithmId:plan?.selectedAlgorithmId||'ACTUAL',algorithmLabel:plan?.selectedAlgorithmLabel||'Mevcut Kademe Sistemi',samples:n(plan?.samples),supported:plan?.ready?executor.isSupported(plan.selectedAlgorithmId):false,scope:plan?.selectionScope||'NONE'});
  }
  const ready=rows.filter(x=>x.ready),executable=ready.filter(x=>x.supported),unsupported=ready.filter(x=>!x.supported);
  return {profiles:rows.length,ready:ready.length,executable:executable.length,unsupported:unsupported.length,rows:executable.slice(0,limit),unsupportedRows:unsupported.slice(0,limit)};
}
function activeAssignments(positions=[]){
  const rows=[];
  for(const p of positions||[]){
    const plan=p?.exitPlanShadow||null;
    if(!plan) continue;
    rows.push({
      symbol:p.sym||p.symbol||'?', side:String(p.yon||p.side||'').toUpperCase(),
      dna:plan.signature||'SIGNATURE_YOK', ready:Boolean(plan.ready),
      algorithmId:plan.selectedAlgorithmId||'ACTUAL', algorithmLabel:plan.selectedAlgorithmLabel||'Mevcut Kademe Sistemi',
      samples:n(plan.samples), beatRate:n(plan.beatRate), pf:n(plan.profitFactor),
      frozen:Boolean(p?.adaptiveExecution?.frozenExit||p?.premierObservation?.frozenExit||p?.exitPlanFrozen),
      activeForVirtual:Boolean(p?.exitPlanActiveForVirtual),
      restartRecovered:Boolean(p?.restartRecovered),
      reason:plan.reason||p?.executionExitAssignment?.reason||'',
      bindingSource:p?.executionExitAssignment?.bindingSource||'LEGACY_OR_UNKNOWN'
    });
  }
  return rows;
}
function build(positions=[]){
  const h=health.build();
  const catalog=coreCatalogSummary();
  const models=(h.models||[]).map(x=>({...x,family:classify(x)}));
  const nonTime=models.filter(x=>x.family!=='TIME');
  const activeNonTime=nonTime.filter(x=>x.health==='ACTIVE').sort((a,b)=>n(b.winner)-n(a.winner)||n(b.deltaUsdt)-n(a.deltaUsdt));
  const neverTriggered=nonTime.filter(x=>x.triggered===0||x.health==='NEVER_TRIGGERED');
  const noData=nonTime.filter(x=>x.health==='NO_DATA'||x.dataAvailable===0);
  const assignments=activeAssignments(positions);
  const coverage=runtimeCoverage();
  const preflight=assignmentPreflight();
  const liveAssignments=assignments.filter(x=>!x.restartRecovered);
  const recoveredAssignments=assignments.filter(x=>x.restartRecovered);
  return {version:VERSION,createdAt:new Date().toISOString(),catalog,coverage,preflight,health:h,activeNonTime,neverTriggered,noData,assignments,assignmentStats:{total:assignments.length,ready:assignments.filter(x=>x.ready).length,virtualActive:assignments.filter(x=>x.activeForVirtual).length,fallback:assignments.filter(x=>!x.ready).length,recovered:recoveredAssignments.length,recoveredProtected:recoveredAssignments.filter(x=>!x.activeForVirtual).length,newPositions:liveAssignments.length,newReady:liveAssignments.filter(x=>x.ready).length,newVirtualActive:liveAssignments.filter(x=>x.activeForVirtual).length,newFallback:liveAssignments.filter(x=>!x.ready).length}};
}
function telegram(model,limit=8){
  const m=model||build([]), g=m.catalog.groups||{};
  let t=`\n\n🏁 <b>EXIT ZAFER DENETİMİ — v4.5.5</b>\n`;
  t+=`🧠 Çekirdek algoritma: <b>${m.catalog.coreExpected}</b> | Aktif ayar varyantı: <b>${m.catalog.configured}</b> | Ek varyant: ${m.catalog.variantCount}\n`;
  t+=`🧩 Dağılım: Zaman ${g.TIME||0} | TP ${g.FIXED_TP||0} | MFE ${g.MFE||0} | ATR ${g.ATR||0} | Trend ${g.TREND||0} | Kademe ${g.LADDER||0} | Dinamik ${g.DYNAMIC||0} | Hibrit ${g.HYBRID||0}\n`;
  t+=`🧪 Canlı executor kapsamı: <b>${m.coverage.supported}/${m.coverage.total}</b> | Desteklenmeyen: ${m.coverage.unsupported.length}\n`;
  t+=`🔬 Yeni emir self-test: Profil ${m.preflight.profiles} | Exit hazır ${m.preflight.ready} | Uygulanabilir ${m.preflight.executable} | Hatalı ${m.preflight.unsupported}\n`;
  t+=`📦 Replay: ${m.health.trades} | Zaman dışı aktif: ${m.activeNonTime.length} | Hiç tetiklenmeyen: ${m.neverTriggered.length} | Verisiz: ${m.noData.length}\n`;
  const top=m.activeNonTime.slice(0,limit);
  t+=`\n⚙️ <b>ZAMAN DIŞI MODELLER</b>\n`;
  t+=top.length?top.map((x,i)=>`${i+1}. ${x.label} | Tetik ${x.triggered}/${x.evaluated} | Winner ${x.winner} | Δ ${n(x.deltaUsdt)>=0?'+':''}${n(x.deltaUsdt).toFixed(2)}`).join('\n'):'Aktif zaman dışı model bulunamadı — bu doğrudan hata/eksik veri alarmıdır.';
  if(m.noData.length) t+=`\n🚨 Verisiz: ${m.noData.slice(0,5).map(x=>x.label).join(', ')}`;
  if(m.neverTriggered.length) t+=`\n⚠️ Tetiklenmeyen: ${m.neverTriggered.slice(0,5).map(x=>x.label).join(', ')}`;
  t+=`\n\n🔗 <b>YENİ EMİR EXIT ATAMA KANITI</b>\nYeni pozisyon ${m.assignmentStats.newPositions} | Hazır ${m.assignmentStats.newReady} | Sanalda aktif ${m.assignmentStats.newVirtualActive} | Gerçek fallback ${m.assignmentStats.newFallback}\n`;
  t+=`🛡️ Restart-gap eski pozisyon: ${m.assignmentStats.recovered} | Dinamik uygulanmıyor: ${m.assignmentStats.recoveredProtected} (bilinmeyen fiyat yolu korunuyor)\n`;
  const live=m.assignments.filter(x=>!x.restartRecovered).slice(0,8);
  t+=live.map((x,i)=>`${i+1}. ${x.symbol} ${x.side} → ${x.algorithmLabel} | N${x.samples} | Beat %${x.beatRate.toFixed(1)} | ${x.activeForVirtual?'AKTİF':'FALLBACK'}`).join('\n')||'Henüz v4.5.5 sonrası açılmış canlı yeni pozisyon yok; yukarıdaki self-test seçim ve executor yolunu şimdi doğruladı.';
  if(m.preflight.rows.length)t+=`\n✅ Self-test örnekleri: ${m.preflight.rows.slice(0,3).map(x=>`${x.algorithmLabel} (N${x.samples})`).join(' | ')}`;
  if(m.coverage.unsupported.length)t+=`\n🚨 Executor dışı: ${m.coverage.unsupported.map(x=>x.label).join(', ')}`;
  return t;
}
function dnaTelegram(limit=8){return cards.telegram(cards.build(),limit);}
module.exports={VERSION,CORE_EXPECTED,classify,coreCatalogSummary,runtimeCoverage,assignmentPreflight,activeAssignments,build,telegram,dnaTelegram};
