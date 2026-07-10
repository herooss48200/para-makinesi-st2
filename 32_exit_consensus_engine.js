/**
 * AGROS v3.10.0 - EXIT CONSENSUS ENGINE
 * Replay, Behavior Intelligence ve uzman motorların ortak exit görüşünü üretir.
 * Yalnızca öğrenme/öneri katmanıdır; gerçek pozisyonu kapatmaz.
 */
const VERSION='v3.10.0-EXIT-CONSENSUS';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=1){return Number(num(v).toFixed(d));}
function conf(samples,min,agreement){if(samples<min)return'DUSUK';if(samples<30||agreement<60)return'ORTA';if(samples<100||agreement<80)return'YUKSEK';return'COK_YUKSEK';}
function classifyExit(best,intel,profit,time,trend,vol,ladder){
  const label=String(best?.label||'');
  if(intel?.primaryProtection==='GUVENLI_KADEMEDE_KORU'&&ladder?.safestProfitStage)return`KADEME_${ladder.safestProfitStage.stage}_SONRASI_KAR_KORUMA`;
  if(intel?.primaryProtection==='YORGUNLUK_ONCESI_KORU'&&time?.fatigueStart?.minute)return`${Math.round(num(time.fatigueStart.minute))}_DAKIKA_ONCESI_KORUMA`;
  if(intel?.primaryProtection==='TREND_KIRILMASINDA_KORU')return'TREND_KIRILMASINDA_KAR_KORUMA';
  if(intel?.primaryProtection==='YUKSEK_VOLDA_KORU')return'YUKSEK_VOLATILITEDE_SIKI_KORUMA';
  if(label.includes('Sabit TP'))return label.toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g,'_');
  if(label.includes('Dakika'))return label.toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g,'_');
  if(label.includes('MFE Koruma'))return label.toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g,'_');
  if(profit?.optimalTarget?.level)return`SABIT_TP_${num(profit.optimalTarget.level).toFixed(2)}`;
  return'VERI_BIRIKIYOR';
}
function buildOne(exitProfile,intel,profit,time,trend,vol,ladder,options={}){
  const min=Math.max(1,num(options.minSample,10));const samples=Math.min(num(exitProfile?.samples),num(intel?.samples));
  const votes=[];const best=exitProfile?.bestExit||null;
  if(best&&num(best.samples)>=min)votes.push({source:'REPLAY',view:best.label,weight:2});
  if(intel?.primaryProtection&&intel.primaryProtection!=='STANDART_KORUMA')votes.push({source:'BEHAVIOR_INTELLIGENCE',view:intel.primaryProtection,weight:2});
  if(profit?.ready&&profit.averageGivebackPct>0)votes.push({source:'PROFIT',view:profit.averageGivebackPct>=num(profit.mfe?.median)*.45?'KARI_ERKEN_KORU':'KARI_TASI',weight:1});
  if(time?.ready&&time.fatigueStart?.minute)votes.push({source:'TIME',view:`YORGUNLUK_${Math.round(num(time.fatigueStart.minute))}_DK`,weight:1});
  if(trend?.ready&&trend.character==='TREND_KIRILGAN')votes.push({source:'TREND',view:'TREND_KIRILMASINDA_KORU',weight:1});
  if(vol?.ready&&(vol.character==='HIGH_VOL_FRAGILE'||vol.character==='CHAOTIC_NOISY'))votes.push({source:'VOLATILITY',view:'YUKSEK_VOLDA_KORU',weight:1});
  if(ladder?.ready&&ladder.safestProfitStage)votes.push({source:'LADDER',view:`KADEME_${ladder.safestProfitStage.stage}`,weight:2});
  const ready=!!best&&!!intel?.ready&&samples>=min;
  const supportWeight=votes.reduce((s,x)=>s+num(x.weight),0);const maxWeight=10;const agreementPct=round(Math.min(100,supportWeight/maxWeight*100),1);
  const recommendation=ready?classifyExit(best,intel,profit,time,trend,vol,ladder):'VERI_BIRIKIYOR';
  return{version:VERSION,key:exitProfile?.key||intel?.key||'SIGNATURE_YOK',label:exitProfile?.label||intel?.label||'SIGNATURE_YOK',samples,minimumSample:min,ready,confidence:conf(samples,min,agreementPct),recommendation,bestReplay:best?{id:best.key,label:best.label,samples:best.samples,deltaUsdt:best.deltaUsdt,beatRate:best.beatRate,winRate:best.winRate,profitFactor:best.profitFactor}:null,safestProfitStage:ladder?.safestProfitStage||null,fatigueMinute:time?.fatigueStart?.minute??null,behaviorCharacter:intel?.generalCharacter||'VERI_BIRIKIYOR',agreementPct,voteCount:votes.length,votes,summary:!ready?`Exit Consensus için veri birikiyor (${samples}/${min}).`:`${recommendation}; ${votes.length} uzman görüşü, mutabakat %${agreementPct}.`,executionPolicy:'ORACLE_ONLY_NO_TRADE_ENGINE_EFFECT'};
}
function buildModel(exitDna,behaviorIntelligence,profitModel,timeModel,trendModel,volModel,ladderModel,options={}){
  const maps=[behaviorIntelligence,profitModel,timeModel,trendModel,volModel,ladderModel].map(m=>new Map((m?.dna||[]).map(x=>[x.key,x])));
  const dna=(exitDna||[]).map(x=>buildOne(x,maps[0].get(x.key),maps[1].get(x.key),maps[2].get(x.key),maps[3].get(x.key),maps[4].get(x.key),maps[5].get(x.key),options)).sort((a,b)=>b.samples-a.samples||b.agreementPct-a.agreementPct);
  return{version:VERSION,createdAt:new Date().toISOString(),dataPolicy:'Replay ve Behavior uzmanlarının ortak exit görüşüdür; Trade Engine veya gerçek exit kararını değiştirmez.',totalDna:dna.length,readyDna:dna.filter(x=>x.ready).length,dna,strongConsensus:dna.filter(x=>x.ready&&x.agreementPct>=70).slice(0,20)};
}
module.exports={VERSION,classifyExit,buildOne,buildModel};
