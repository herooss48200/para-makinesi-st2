/** AGROS v4.5.2 — 27 çekirdek exit denetimi + canlı atama kanıtı. */
const replay = require('./22_exit_replay_engine.js');
const health = require('./54_exit_health_check.js');
const cards = require('./55_dna_identity_card_engine.js');

const VERSION = 'v4.5.2-EXIT-VICTORY-AUDIT';
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
      activeForVirtual:Boolean(p?.exitPlanActiveForVirtual)
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
  return {version:VERSION,createdAt:new Date().toISOString(),catalog,health:h,activeNonTime,neverTriggered,noData,assignments,assignmentStats:{total:assignments.length,ready:assignments.filter(x=>x.ready).length,virtualActive:assignments.filter(x=>x.activeForVirtual).length,fallback:assignments.filter(x=>!x.ready).length}};
}
function telegram(model,limit=8){
  const m=model||build([]), g=m.catalog.groups||{};
  let t=`\n\n🏁 <b>EXIT ZAFER DENETİMİ — v4.5.2</b>\n`;
  t+=`🧠 Çekirdek algoritma: <b>${m.catalog.coreExpected}</b> | Aktif ayar varyantı: <b>${m.catalog.configured}</b> | Ek varyant: ${m.catalog.variantCount}\n`;
  t+=`🧩 Dağılım: Zaman ${g.TIME||0} | TP ${g.FIXED_TP||0} | MFE ${g.MFE||0} | ATR ${g.ATR||0} | Trend ${g.TREND||0} | Kademe ${g.LADDER||0} | Dinamik ${g.DYNAMIC||0} | Hibrit ${g.HYBRID||0}\n`;
  t+=`📦 Replay: ${m.health.trades} | Zaman dışı aktif: ${m.activeNonTime.length} | Hiç tetiklenmeyen: ${m.neverTriggered.length} | Verisiz: ${m.noData.length}\n`;
  const top=m.activeNonTime.slice(0,limit);
  t+=`\n⚙️ <b>ZAMAN DIŞI MODELLER</b>\n`;
  t+=top.length?top.map((x,i)=>`${i+1}. ${x.label} | Tetik ${x.triggered}/${x.evaluated} | Winner ${x.winner} | Δ ${n(x.deltaUsdt)>=0?'+':''}${n(x.deltaUsdt).toFixed(2)}`).join('\n'):'Aktif zaman dışı model bulunamadı — bu doğrudan hata/eksik veri alarmıdır.';
  if(m.noData.length) t+=`\n🚨 Verisiz: ${m.noData.slice(0,5).map(x=>x.label).join(', ')}`;
  if(m.neverTriggered.length) t+=`\n⚠️ Tetiklenmeyen: ${m.neverTriggered.slice(0,5).map(x=>x.label).join(', ')}`;
  t+=`\n\n🔗 <b>YENİ EMİR EXIT ATAMA KANITI</b>\nAktif plan ${m.assignmentStats.total} | Hazır ${m.assignmentStats.ready} | Sanalda uygulanan ${m.assignmentStats.virtualActive} | Fallback ${m.assignmentStats.fallback}\n`;
  t+=m.assignments.slice(0,8).map((x,i)=>`${i+1}. ${x.symbol} ${x.side} → ${x.algorithmLabel} | N${x.samples} | Beat %${x.beatRate.toFixed(1)} | ${x.activeForVirtual?'AKTİF':'GÖLGE/FALLBACK'}`).join('\n')||'Henüz exit planı bağlı aktif pozisyon yok.';
  return t;
}
function dnaTelegram(limit=8){return cards.telegram(cards.build(),limit);}
module.exports={VERSION,CORE_EXPECTED,classify,coreCatalogSummary,activeAssignments,build,telegram,dnaTelegram};
