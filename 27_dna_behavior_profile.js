/**
 * AGROS v3.7.0 - DNA BEHAVIOR PROFILE
 * Profit, Time, Trend ve Volatility davranışlarını tek açıklanabilir DNA kartında birleştirir.
 * Trade Engine kararını değiştirmez.
 */
const VERSION = 'v3.7.0-DNA-BEHAVIOR-PROFILE';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=2){return Number(num(v).toFixed(d));}
function confidence(samples,minSample=10){if(samples<minSample)return'DUSUK';if(samples<30)return'ORTA';if(samples<100)return'YUKSEK';return'COK_YUKSEK';}
function profitCharacter(p){
  if(!p?.ready)return'VERI_BIRIKIYOR';
  const reach=num(p.optimalTarget?.reachRate),give=num(p.averageGivebackPct),mfe=num(p.mfe?.median);
  if(reach>=80&&give<=Math.max(.15,mfe*.25))return'ISTIKRARLI_KAR_URETEN';
  if(give>=Math.max(.35,mfe*.45))return'KARI_GERI_VEREN';
  if(num(p.optimalTarget?.level)>=1.5&&reach>=55)return'YUKSEK_POTANSIYELLI';
  if(mfe<.6)return'SINIRLI_KAR_POTANSIYELI';
  return'DENGELI_KAR_KARAKTERI';
}
function timeCharacter(t){return t?.character||'VERI_BIRIKIYOR';}
function trendCharacter(t){return t?.character||'VERI_BIRIKIYOR';}
function volatilityCharacter(v){return v?.character||'VERI_BIRIKIYOR';}
function riskLevel(p,t,tr,v){
  if(!p?.ready||!t?.ready)return'BELIRSIZ';
  const give=num(p.averageGivebackPct),mfe=Math.max(.01,num(p.mfe?.median));
  const fatigue=num(t.fatigueStart?.minute,999),opportunity=num(t.opportunityWindow?.minute,0);
  if(v?.ready&&(v.character==='CHAOTIC_NOISY'||v.character==='HIGH_VOL_FRAGILE'))return'YUKSEK';
  if(tr?.ready&&tr.character==='TREND_KIRILGAN')return'YUKSEK';
  if(give/mfe>=.65||(fatigue<999&&fatigue<=opportunity+10))return'YUKSEK';
  if(give/mfe>=.35||t.diminishingReturnMinute!==null||(tr?.ready&&num(tr.breakRate)>=40))return'ORTA';
  return'DUSUK';
}
function narrative(profile){
  if(!profile.ready)return`Örnek sayısı yetersiz; birleşik karakter için veri birikiyor (${profile.samples}/${profile.minimumSample}).`;
  const parts=[];const t=profile.time,p=profile.profit,tr=profile.trend,v=profile.volatility;
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
  if(tr.character==='TREND_DAYANIKLI')parts.push('trendi dayanıklı');
  else if(tr.character==='TREND_KIRILGAN')parts.push('trend kırılganlığı yüksek');
  else if(tr.character==='TREND_GERI_KAZANAN')parts.push('trend kırılması sonrası toparlanabilen');
  if(v.character==='VOL_EXPANSION_RUNNER')parts.push('oynaklık genişlemesinde hızlanan');
  else if(v.character==='VOL_COMPRESSION_BREAKOUT')parts.push('sıkışma sonrası açılan');
  else if(v.character==='LOW_VOL_STEADY')parts.push('düşük oynaklıkta düzenli');
  else if(v.character==='HIGH_VOL_FRAGILE')parts.push('yüksek oynaklıkta kırılgan');
  else if(v.character==='CHAOTIC_NOISY')parts.push('gürültülü fiyat yoluna sahip');
  if(t.fatigueStart?.minute)parts.push(`yaklaşık ${t.fatigueStart.minute}. dakikadan sonra yorulma sinyali veren`);
  return parts.join(', ')+ ' DNA.';
}
function buildProfile(profit,time,trend,volatility,options={}){
  const minSample=Math.max(1,num(options.minSample,10));
  const coreSamples=Math.min(num(profit?.samples),num(time?.samples));
  const available=[coreSamples];
  if(trend)available.push(num(trend.samples));
  if(volatility)available.push(num(volatility.pathQualifiedSamples,volatility.samples));
  const samples=Math.min(...available.filter(x=>Number.isFinite(x)));
  const ready=!!profit?.ready&&!!time?.ready&&(!trend||!!trend.ready)&&(!volatility||!!volatility.ready)&&samples>=minSample;
  const profile={
    key:profit?.key||time?.key||trend?.key||volatility?.key||'SIGNATURE_YOK',
    label:profit?.label||time?.label||trend?.label||volatility?.label||profit?.key||time?.key||'SIGNATURE_YOK',
    samples,minimumSample:minSample,ready,confidence:confidence(samples,minSample),
    profit:{character:profitCharacter(profit),medianMfePct:round(profit?.mfe?.median,4),averageGivebackPct:round(profit?.averageGivebackPct,4),safeExitZone:profit?.safeExitZone||null,optimalTarget:profit?.optimalTarget||null},
    time:{character:timeCharacter(time),averagePeakMinute:round(time?.averagePeakMinute,2),averageFirstPositiveMinute:round(time?.averageFirstPositiveMinute,2),opportunityWindow:time?.opportunityWindow||null,fatigueStart:time?.fatigueStart||null,diminishingReturnMinute:time?.diminishingReturnMinute??null},
    trend:{character:trendCharacter(trend),alignmentRate:round(trend?.alignmentRate,1),breakRate:round(trend?.breakRate,1),newHighAfterBreakRate:round(trend?.newHighAfterBreakRate,1),averageBreakMinute:trend?.averageBreakMinute??null},
    volatility:{character:volatilityCharacter(volatility),realizedVolatilityPct:round(volatility?.realizedVolatilityPct,5),averageAbsStepPct:round(volatility?.averageAbsStepPct,5),expansionRate:round(volatility?.expansionRate,1),noisyRate:round(volatility?.noisyRate,1),pathEfficiencyPct:round(volatility?.averagePathEfficiencyPct,1),averagePeakVolMinute:volatility?.averagePeakVolMinute??null}
  };
  profile.risk=riskLevel(profit,time,trend,volatility);profile.summary=narrative(profile);return profile;
}
function buildModel(profitModel,timeModel,trendModel,volatilityModel,options={}){
  // Eski üç argümanlı çağrılarla geriye uyumluluk.
  if(trendModel&&!Array.isArray(trendModel.dna)&&(!volatilityModel||!Array.isArray(volatilityModel.dna))){options=trendModel;trendModel=null;volatilityModel=null;}
  const maps=[profitModel,timeModel,trendModel,volatilityModel].map(m=>new Map((m?.dna||[]).map(x=>[x.key,x])));
  const keys=[...new Set(maps.flatMap(m=>[...m.keys()]))];
  const dna=keys.map(k=>buildProfile(maps[0].get(k),maps[1].get(k),maps[2].get(k),maps[3].get(k),options)).sort((a,b)=>b.samples-a.samples);
  return{version:VERSION,createdAt:new Date().toISOString(),dataPolicy:'Profit, Time, Trend ve Volatility davranışları açıklanabilir tek profilde birleştirilir; canlı emir kararı verilmez.',totalDna:dna.length,readyDna:dna.filter(x=>x.ready).length,dna,highRisk:dna.filter(x=>x.ready&&x.risk==='YUKSEK').slice(0,20),stableProfit:dna.filter(x=>x.ready&&x.profit.character==='ISTIKRARLI_KAR_URETEN').slice(0,20)};
}
module.exports={VERSION,buildProfile,buildModel,profitCharacter,riskLevel};
