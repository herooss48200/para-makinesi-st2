/**
 * AGROS v3.6.8 - DNA BEHAVIOR PROFILE
 * Profit Potential ve Time Behavior modellerini tek açıklanabilir DNA kartında birleştirir.
 * Trade Engine kararını değiştirmez.
 */
const VERSION = 'v3.6.8-DNA-BEHAVIOR-PROFILE';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=2){return Number(num(v).toFixed(d));}
function confidence(samples,minSample=10){
  if(samples<minSample)return 'DUSUK';
  if(samples<30)return 'ORTA';
  if(samples<100)return 'YUKSEK';
  return 'COK_YUKSEK';
}
function profitCharacter(p){
  if(!p?.ready)return 'VERI_BIRIKIYOR';
  const reach=num(p.optimalTarget?.reachRate), give=num(p.averageGivebackPct), mfe=num(p.mfe?.median);
  if(reach>=80 && give<=Math.max(.15,mfe*.25))return 'ISTIKRARLI_KAR_URETEN';
  if(give>=Math.max(.35,mfe*.45))return 'KARI_GERI_VEREN';
  if(num(p.optimalTarget?.level)>=1.5 && reach>=55)return 'YUKSEK_POTANSIYELLI';
  if(mfe<.6)return 'SINIRLI_KAR_POTANSIYELI';
  return 'DENGELI_KAR_KARAKTERI';
}
function timeCharacter(t){return t?.character || 'VERI_BIRIKIYOR';}
function riskLevel(p,t){
  if(!p?.ready || !t?.ready)return 'BELIRSIZ';
  const give=num(p.averageGivebackPct), mfe=Math.max(.01,num(p.mfe?.median));
  const fatigue=num(t.fatigueStart?.minute,999), opportunity=num(t.opportunityWindow?.minute,0);
  if(give/mfe>=.65 || (fatigue<999 && fatigue<=opportunity+10))return 'YUKSEK';
  if(give/mfe>=.35 || t.diminishingReturnMinute!==null)return 'ORTA';
  return 'DUSUK';
}
function narrative(profile){
  if(!profile.ready)return `Örnek sayısı yetersiz; karakter oluşumu için veri birikiyor (${profile.samples}/${profile.minimumSample}).`;
  const parts=[];
  const t=profile.time;
  const p=profile.profit;
  if(t.character==='HIZLI_DNA')parts.push('Hızlı olgunlaşan');
  else if(t.character==='ORTA_HIZLI_DNA')parts.push('Orta hızda olgunlaşan');
  else if(t.character==='YAVAS_DNA')parts.push('Geç olgunlaşan');
  else if(t.character==='UZUN_SOLUKLU_DNA')parts.push('Uzun soluklu');
  else parts.push('Zaman karakteri gelişen');
  if(p.character==='KARI_GERI_VEREN')parts.push('kârı geri verme eğilimi yüksek');
  else if(p.character==='ISTIKRARLI_KAR_URETEN')parts.push('istikrarlı kâr üreten');
  else if(p.character==='YUKSEK_POTANSIYELLI')parts.push('yüksek kâr potansiyelli');
  else if(p.character==='SINIRLI_KAR_POTANSIYELI')parts.push('kâr tavanı sınırlı');
  else parts.push('dengeli kâr karakterli');
  if(t.fatigueStart?.minute)parts.push(`yaklaşık ${t.fatigueStart.minute}. dakikadan sonra yorulma sinyali veren`);
  return parts.join(', ') + ' DNA.';
}
function buildProfile(profit,time,options={}){
  const minSample=Math.max(1,num(options.minSample,10));
  const samples=Math.min(num(profit?.samples),num(time?.samples));
  const ready=!!profit?.ready && !!time?.ready && samples>=minSample;
  const profile={
    key:profit?.key||time?.key||'SIGNATURE_YOK',
    label:profit?.label||time?.label||profit?.key||time?.key||'SIGNATURE_YOK',
    samples,minimumSample:minSample,ready,confidence:confidence(samples,minSample),
    profit:{
      character:profitCharacter(profit),
      medianMfePct:round(profit?.mfe?.median,4),
      averageGivebackPct:round(profit?.averageGivebackPct,4),
      safeExitZone:profit?.safeExitZone||null,
      optimalTarget:profit?.optimalTarget||null
    },
    time:{
      character:timeCharacter(time),
      averagePeakMinute:round(time?.averagePeakMinute,2),
      averageFirstPositiveMinute:round(time?.averageFirstPositiveMinute,2),
      opportunityWindow:time?.opportunityWindow||null,
      fatigueStart:time?.fatigueStart||null,
      diminishingReturnMinute:time?.diminishingReturnMinute??null
    }
  };
  profile.risk=riskLevel(profit,time);
  profile.summary=narrative(profile);
  return profile;
}
function buildModel(profitModel,timeModel,options={}){
  const pMap=new Map((profitModel?.dna||[]).map(x=>[x.key,x]));
  const tMap=new Map((timeModel?.dna||[]).map(x=>[x.key,x]));
  const keys=[...new Set([...pMap.keys(),...tMap.keys()])];
  const dna=keys.map(k=>buildProfile(pMap.get(k),tMap.get(k),options)).sort((a,b)=>b.samples-a.samples);
  return {
    version:VERSION,createdAt:new Date().toISOString(),
    dataPolicy:'Profit Potential ve Time Behavior birleştirilir; yalnızca açıklanabilir öğrenme profili üretilir, canlı emir kararı verilmez.',
    totalDna:dna.length,readyDna:dna.filter(x=>x.ready).length,dna,
    highRisk:dna.filter(x=>x.ready&&x.risk==='YUKSEK').slice(0,20),
    stableProfit:dna.filter(x=>x.ready&&x.profit.character==='ISTIKRARLI_KAR_URETEN').slice(0,20)
  };
}
module.exports={VERSION,buildProfile,buildModel,profitCharacter,riskLevel};
