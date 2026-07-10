/**
 * AGROS v3.9.0 - BEHAVIOR INTELLIGENCE PLATFORM
 * Beş Behavior motorunun açıklanabilir ortak zekâ katmanı.
 * Trade Engine'e emir, stop veya TP kararı göndermez.
 */
const VERSION='v3.9.0-BEHAVIOR-INTELLIGENCE';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=1){return Number(num(v).toFixed(d));}
function confidence(samples,min){if(samples<min)return'DUSUK';if(samples<30)return'ORTA';if(samples<100)return'YUKSEK';return'COK_YUKSEK';}
function pushUnique(a,v){if(v&&!a.includes(v))a.push(v);}
function signalSet(p={}){
  const positive=[],negative=[],protect=[],environment=[];
  const pc=p.profit?.character,tc=p.time?.character,tr=p.trend?.character,vc=p.volatility?.character,lc=p.ladder?.character;
  if(pc==='ISTIKRARLI_KAR_URETEN')pushUnique(positive,'ISTIKRARLI_KAR');
  if(pc==='YUKSEK_POTANSIYELLI')pushUnique(positive,'YUKSEK_KAR_POTANSIYELI');
  if(pc==='KARI_GERI_VEREN'){pushUnique(negative,'KAR_GERI_VERME');pushUnique(protect,'KARI_ERKEN_KORU');}
  if(pc==='SINIRLI_KAR_POTANSIYELI')pushUnique(negative,'SINIRLI_KAR_TAVANI');
  if(tc==='HIZLI_DNA'||tc==='ORTA_HIZLI_DNA')pushUnique(positive,'ERKEN_OLGUNLASMA');
  if(tc==='YAVAS_DNA'||tc==='UZUN_SOLUKLU_DNA')pushUnique(environment,'SABIRLI_TASIMA');
  if(p.time?.fatigueStart?.minute){pushUnique(negative,'ZAMAN_YORGUNLUGU');pushUnique(protect,'YORGUNLUK_ONCESI_KORU');}
  if(tr==='TREND_DAYANIKLI'){pushUnique(positive,'TREND_DAYANIKLILIGI');pushUnique(environment,'TREND_DEVAMI');}
  if(tr==='TREND_KIRILGAN'){pushUnique(negative,'TREND_KIRILGANLIGI');pushUnique(protect,'TREND_KIRILMASINDA_KORU');}
  if(tr==='TREND_GERI_KAZANAN')pushUnique(positive,'TREND_TOPARLAMA');
  if(vc==='VOL_EXPANSION_RUNNER'){pushUnique(positive,'VOL_GENISLEMESINDE_HIZLANIR');pushUnique(environment,'VOLATILITE_GENISLEMESI');}
  if(vc==='VOL_COMPRESSION_BREAKOUT')pushUnique(environment,'SIKISMA_SONRASI_ACILIM');
  if(vc==='LOW_VOL_STEADY'){pushUnique(positive,'DUSUK_VOL_DENGESI');pushUnique(environment,'DUSUK_VOLATILITE');}
  if(vc==='HIGH_VOL_FRAGILE'||vc==='CHAOTIC_NOISY'){pushUnique(negative,'YUKSEK_VOL_RISKI');pushUnique(protect,'YUKSEK_VOLDA_KORU');}
  if(lc==='ISTIKRARLI_TIRMANAN')pushUnique(positive,'ISTIKRARLI_KADEME_TIRMANISI');
  if(lc==='UZUN_KADEME_KOSUCUSU')pushUnique(positive,'YUKSEK_KADEME_POTANSIYELI');
  if(lc==='KADEME_SONRASI_GERI_VEREN'){pushUnique(negative,'KADEME_GERI_DONUSU');pushUnique(protect,'GUVENLI_KADEMEDE_KORU');}
  if(lc==='ERKEN_SONEN')pushUnique(negative,'ERKEN_KADEME_SONUMU');
  return{positive,negative,protect,environment};
}
function generalCharacter(p,s){
  if(!p.ready)return'VERI_BIRIKIYOR';
  if(s.negative.includes('KAR_GERI_VERME')&&s.negative.includes('KADEME_GERI_DONUSU'))return'KARI_ERKEN_KORUNMASI_GEREKEN_DNA';
  if(s.positive.includes('ERKEN_OLGUNLASMA')&&s.positive.includes('TREND_DAYANIKLILIGI'))return'ERKEN_GUCLENEN_TREND_DNA';
  if(s.positive.includes('YUKSEK_KAR_POTANSIYELI')&&s.positive.includes('YUKSEK_KADEME_POTANSIYELI'))return'YUKSEK_POTANSIYELLI_UZUN_KOSUCU';
  if(s.negative.includes('YUKSEK_VOL_RISKI')||s.negative.includes('TREND_KIRILGANLIGI'))return'KIRILGAN_KORUMA_GEREKTIREN_DNA';
  if(s.positive.length>=3&&s.negative.length===0)return'GUCLU_DENGELI_DNA';
  if(s.negative.length>=3)return'YUKSEK_RISKLI_DNA';
  return'DENGELI_DAVRANIS_DNA';
}
function buildOne(p,options={}){
  const min=Math.max(1,num(options.minSample,10));
  const samples=num(p?.samples);const ready=!!p?.ready&&samples>=min;const s=signalSet(p||{});
  const active=5;const supporting=Math.min(active,s.positive.length+s.protect.length);const conflicts=Math.min(active,Math.max(0,s.positive.length&&s.negative.length?Math.min(s.positive.length,s.negative.length):0));
  const agreement=round((supporting/active)*100,1),conflict=round((conflicts/active)*100,1);
  const safest=p?.ladder?.safestProfitStage?.stage??null;
  const protection=s.protect[0]||'STANDART_KORUMA';
  return{version:VERSION,key:p?.key||'SIGNATURE_YOK',label:p?.label||p?.key||'SIGNATURE_YOK',samples,minimumSample:min,ready,confidence:confidence(samples,min),generalCharacter:generalCharacter({...p,ready},s),strengths:s.positive,weaknesses:s.negative,preferredEnvironments:s.environment,protectionSignals:s.protect,primaryProtection:protection,safestProfitStage:safest,motorAgreementCount:supporting,motorCount:active,agreementPct:agreement,conflictCount:conflicts,conflictPct:conflict,risk:p?.risk||'BELIRSIZ',summary:!ready?`Behavior Intelligence için veri birikiyor (${samples}/${min}).`:`${generalCharacter({...p,ready},s)}; mutabakat ${supporting}/${active}, risk ${p?.risk||'BELIRSIZ'}, ana koruma ${protection}.`};
}
function buildModel(profileModel,options={}){
  const dna=(profileModel?.dna||[]).map(x=>buildOne(x,options)).sort((a,b)=>b.samples-a.samples||b.agreementPct-a.agreementPct);
  return{version:VERSION,createdAt:new Date().toISOString(),dataPolicy:'Beş Behavior motorunun açıklanabilir birleşimidir; canlı emir kararı üretmez.',totalDna:dna.length,readyDna:dna.filter(x=>x.ready).length,dna,highAgreement:dna.filter(x=>x.ready&&x.motorAgreementCount>=4).slice(0,20),highRisk:dna.filter(x=>x.ready&&x.risk==='YUKSEK').slice(0,20)};
}
module.exports={VERSION,signalSet,buildOne,buildModel};
