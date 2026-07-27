'use strict';

/**
 * AGROS ST2 Pattern DNA Intelligence
 * Registry 2.0 + Confidence + Similarity + Expectation + Evolution
 * Shadow/read-only intelligence layer. Trade Engine kararını değiştirmez.
 */
const adaptive = require('./76_st2_adaptive_dna_entry.js');
const crypto = require('crypto');

const VERSION = 'v6.3.4-SESSION-NEUTRAL-EXACT-DNA-INTELLIGENCE';
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function r(v,d=4){return Number(n(v).toFixed(d));}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,n(v)));}
function avg(xs=[]){return xs.length?xs.reduce((a,b)=>a+n(b),0)/xs.length:0;}


function shortId(key=''){return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0,10).toUpperCase();}
function statusReason(profile){
  const d=profile.decision||{}, liveN=(profile.closes||[]).length, h=d.historical||null;
  const histPremier=adaptive.positiveEvidence(h,adaptive.HISTORICAL_PREMIER_MIN_N());
  const livePremier=adaptive.positiveEvidence(d.live,adaptive.LAST_N,true);
  if(livePremier)return 'LIVE_N3_PREMIER_CONFIRMED';
  if(histPremier&&liveN<3)return 'HISTORICAL_EXACT_PREMIER_READY';
  if(histPremier)return 'HISTORICAL_EXACT_PREMIER_LIVE_REVIEW';
  if(!h&&liveN<3)return 'EXACT_DNA_UNSEEN_SHADOW + LIVE_N3_LEARNING';
  if(!h)return 'EXACT_DNA_UNSEEN_SHADOW';
  if(liveN<3)return 'HISTORICAL_EXACT_NOT_PREMIER + LIVE_N3_LEARNING';
  if(n(h.n)<adaptive.HISTORICAL_PREMIER_MIN_N())return 'MINIMUM_N_EKSIK_SHADOW';
  return 'SHADOW_IZLEME';
}

function qualityScore(m){
  if(!m||!n(m.n)) return 0;
  const sample=clamp(n(m.n)/50*100);
  const pf=clamp((n(m.pf)-0.8)/1.7*100);
  const exp=clamp((n(m.expectancy)+0.05)/0.30*100);
  const net=clamp((n(m.net)+0.25)/3.25*100);
  const wr=clamp((n(m.wr)-35)/45*100);
  return r(sample*0.25+pf*0.25+exp*0.25+net*0.15+wr*0.10,1);
}
function recentStability(rows=[]){
  if(!rows.length)return 0;
  const values=rows.map(x=>n(x.net));
  const positive=values.filter(x=>x>0).length/values.length*100;
  const mean=avg(values);
  const variance=avg(values.map(x=>(x-mean)**2));
  const volatilityPenalty=clamp(Math.sqrt(variance)*100,0,40);
  return r(clamp(positive-volatilityPenalty+20),1);
}
function confidence(profile){
  const d=profile.decision||{};
  const historical=d.historical||null;
  const live=d.live||null;
  const recent=(profile.closes||[]).slice(-10).map(row=>{
    const key=Number(d.brick||profile.activeBrick||0.75).toFixed(2);
    return row.candidates?.[key]||null;
  }).filter(Boolean);
  const historicalQuality=qualityScore(historical);
  const liveQuality=qualityScore(live);
  const stability=recentStability(recent);
  const sample=clamp((profile.closes||[]).length/50*100);
  const regimeCompleteness=clamp(['yon','pattern','rbb','rbbw','renko6','atr','trend20'].filter(k=>profile.context?.[k]&&profile.context[k]!=='UNKNOWN').length/7*100);
  const score=r(historicalQuality*0.35+liveQuality*0.25+stability*0.20+sample*0.10+regimeCompleteness*0.10,1);
  return {score,historicalQuality,liveQuality,stability:r(stability,1),sample:r(sample,1),regimeCompleteness:r(regimeCompleteness,1),grade:score>=85?'A+':score>=75?'A':score>=65?'B':score>=50?'C':'LAB'};
}
function contextSimilarity(a={},b={}){
  const weights={yon:20,pattern:25,rbb:14,rbbw:11,renko6:16,atr:7,trend20:7};
  let got=0,total=0;
  for(const [k,w] of Object.entries(weights)){
    const av=String(a[k]||'UNKNOWN'),bv=String(b[k]||'UNKNOWN');
    if(av==='UNKNOWN'||bv==='UNKNOWN')continue;
    total+=w;
    if(av===bv)got+=w;
    else if(k==='renko6'){
      let same=0;for(let i=1;i<=Math.min(av.length,bv.length);i++){if(av.at(-i)===bv.at(-i))same++;else break;}
      got+=w*(same/Math.max(av.length,bv.length));
    }
  }
  return total?r(got/total*100,1):0;
}
function nearest(profile,profiles=[],limit=5){
  return profiles.filter(x=>x.key!==profile.key).map(x=>({key:x.key,context:x.context,similarity:contextSimilarity(profile.context,x.context),activeBrick:x.decision?.brick,confidence:x.confidence?.score,expectation:x.expectation})).filter(x=>x.similarity>0).sort((a,b)=>b.similarity-a.similarity||n(b.confidence)-n(a.confidence)).slice(0,limit);
}
function expectation(profile){
  const d=profile.decision||{};
  const active=Number(d.brick||profile.activeBrick||0.75).toFixed(2);
  const samples=(profile.closes||[]).map(x=>x.candidates?.[active]).filter(Boolean);
  const live=adaptive.metric(samples);
  const h=d.historical||{};
  const liveWeight=clamp(samples.length/50,0,0.60);
  const histWeight=1-liveWeight;
  return {
    activeBrick:Number(active),n:samples.length,
    pf:r(n(h.pf)*histWeight+n(live.pf)*liveWeight,2),
    expectancy:r(n(h.expectancy)*histWeight+n(live.expectancy)*liveWeight,4),
    net:r(n(h.net)*histWeight+n(live.net)*liveWeight,4),
    wr:r(n(h.wr)*histWeight+n(live.wr)*liveWeight,2),
    historicalWeight:r(histWeight*100,1),liveWeight:r(liveWeight*100,1),
    mfe:null,mae:null,durationMinutes:null,
    note:'MFE/MAE/süre, kapanış replay kaydında mevcut olduğunda otomatik dolar.'
  };
}
function evolution(profile){
  const changes=profile.changes||[];
  const closes=profile.closes||[];
  const d=profile.decision||{};
  const key=Number(d.brick||profile.activeBrick||0.75).toFixed(2);
  const last3=adaptive.metric(closes.slice(-3).map(x=>x.candidates?.[key]).filter(Boolean));
  const prev3=adaptive.metric(closes.slice(-6,-3).map(x=>x.candidates?.[key]).filter(Boolean));
  const delta=r(last3.expectancy-prev3.expectancy,4);
  const trend=last3.n<3?'LIVE_N3_BEKLENIYOR':delta>0.02?'GUCLENIYOR':delta<-0.02?'ZAYIFLIYOR':'YATAY';
  return {trend,expectancyDelta:delta,last3,previous3:prev3,changeCount:changes.length,lastChange:changes[0]||null};
}
function registry(){
  const base=adaptive.summary();
  const profiles=(base.profiles||[]).map(p=>({...p}));
  for(const p of profiles){p.confidence=confidence(p);p.expectation=expectation(p);p.evolution=evolution(p);}
  for(const p of profiles){p.nearest=nearest(p,profiles,5);}
  return {version:VERSION,generatedAt:new Date().toISOString(),policy:{exactHistoricalPremier:true,unknownExactShadow:true,liveN3PromotionDemotion:true,tradeEngineChanged:false},health:base.health,profiles};
}
function telegram(limit=10){
  const reg=registry();
  let t=`🧠 <b>ADAPTIVE DNA INTELLIGENCE</b>\n${VERSION}\n📚 Geçmişten hazır DNA ${reg.health?.historicalProfiles||0} | Tarihsel sinyal ${reg.health?.historicalSignals||0} | Canlı kapanış ${reg.health?.observed||0}\n🏆 Güçlü exact tarihsel DNA doğrudan Premier | 👻 Bilinmeyen/negatif exact DNA Shadow öğrenme | Trade Engine değişmedi.\n`;
  for(const p of reg.profiles.slice(0,limit)){
    const c=p.context,d=p.decision,cf=p.confidence,e=p.expectation,ev=p.evolution,near=p.nearest?.[0];
    const hist=d.historical||null, id=shortId(p.key), reason=statusReason(p);
    const league=adaptive.positiveEvidence(hist,adaptive.HISTORICAL_PREMIER_MIN_N())?'PREMIER':'SHADOW';
    t+=`
🧬 <b>DNA ${id} | ${c.yon} ${c.pattern}</b> | Güven ${cf.score}/100 | Lig ${league} | Güven sınıfı ${cf.grade}
`+
      `🔑 Exact ${id} | RBB=${c.rbb} | RBBW=${c.rbbw} | RENKO6=${c.renko6}
`+
      `🌐 ATR=${c.atr} | TREND20=${c.trend20} | SESSION=REFERANS_ONLY
`+
      `🎯 Aktif ${Number(d.brick).toFixed(2)} | Kaynak ${d.source||d.reason} | ${d.reason}
`+
      `📚 Tarihsel ${hist?Number(hist.brick).toFixed(2):'YOK'} | N${n(hist?.n)} WR %${n(hist?.wr).toFixed(1)} PF ${n(hist?.pf).toFixed(2)} Net ${n(hist?.net)>=0?'+':''}${n(hist?.net).toFixed(4)} Exp ${n(hist?.expectancy)>=0?'+':''}${n(hist?.expectancy).toFixed(4)}
`+
      `⚡ Canlı ${d.live?Number(d.live.brick).toFixed(2):'YOK'} | N${(p.closes||[]).length} | Durum ${reason}
`+
      `🏷️ Lig ${adaptive.positiveEvidence(hist,adaptive.HISTORICAL_PREMIER_MIN_N())?'PREMIER':'SHADOW'} | Exact kanıt ${hist?'VAR':'YOK'} | En yakın DNA Premier yetkisi YOK
`+
      `🧮 Güven: Tarih ${cf.historicalQuality} | Canlı ${cf.liveQuality} | Stabilite ${cf.stability} | Örnek ${cf.sample} | Bağlam ${cf.regimeCompleteness}
`+
      `📈 Beklenti PF ${e.pf.toFixed(2)} | Exp ${e.expectancy>=0?'+':''}${e.expectancy.toFixed(4)} | ${ev.trend}
`+
      `${near?`🔗 En yakın DNA ${shortId(near.key)} %${near.similarity.toFixed(1)} | Güven ${n(near.confidence).toFixed(1)} | YALNIZ REFERANS/SHADOW`:'🔗 Benzer DNA yok'}
`;
  }
  return t.trim();
}
module.exports={VERSION,shortId,statusReason,qualityScore,recentStability,confidence,contextSimilarity,nearest,expectation,evolution,registry,telegram};
