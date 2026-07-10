/**
 * AGROS v3.6.9 - TREND BEHAVIOR ENGINE
 * Her DNA'nın işlem yönüyle uyumlu trend, trend zayıflaması ve trend kırılması sonrasındaki
 * kâr/geri-verme davranışını öğrenir. Trade Engine kararını değiştirmez.
 */
const VERSION='v3.6.9-TREND-BEHAVIOR';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function round(v,d=2){return Number(num(v).toFixed(d));}
function expected(side){return String(side).toUpperCase()==='LONG'?'UP':'DOWN';}
function minute(start,ts){return Math.max(0,(num(ts)-num(start))/60000);}
function ensure(root,input){
  const key=input.signatureShort||input.signatureKey||'SIGNATURE_YOK';
  root.version=VERSION; root.totalTrades=num(root.totalTrades); root.byDna=root.byDna||{};
  if(!root.byDna[key]) root.byDna[key]={key,label:input.signatureLabel||key,samples:0,trendObservedTrades:0,alignedAtEntry:0,breakObserved:0,recoveryObserved:0,breakMinuteSum:0,pnlAtBreakSum:0,postBreakBestSum:0,postBreakWorstSum:0,postBreakGivebackSum:0,newHighAfterBreak:0,alignedDurationSum:0,trendPoints:0,alignedPoints:0,againstPoints:0,unknownPoints:0};
  return root.byDna[key];
}
function analyzeTrade(input){
  const rows=(input.pathRows||[]).filter(x=>x&&x.ts).sort((a,b)=>a.ts-b.ts);
  const exp=expected(input.side); let firstKnown=null,firstBreak=null,recovery=null,peak=-Infinity,peakBeforeBreak=-Infinity,postBest=-Infinity,postWorst=Infinity;
  let alignedPoints=0,againstPoints=0,unknownPoints=0;
  for(const p of rows){
    const trend=String(p.stTrend||'').toUpperCase(); const pnl=num(p.pnlPct);
    peak=Math.max(peak,pnl);
    if(!trend){unknownPoints++; continue;}
    if(!firstKnown) firstKnown=p;
    const aligned=trend===exp;
    if(aligned){alignedPoints++; if(firstBreak&&!recovery) recovery=p;}
    else {againstPoints++; if(!firstBreak){firstBreak=p; peakBeforeBreak=peak;}}
    if(firstBreak){postBest=Math.max(postBest,pnl); postWorst=Math.min(postWorst,pnl);}
  }
  const observed=alignedPoints+againstPoints>0;
  const entryAligned=firstKnown?String(firstKnown.stTrend).toUpperCase()===exp:false;
  const breakMinute=firstBreak?minute(input.startTs,firstBreak.ts):null;
  const pnlAtBreak=firstBreak?num(firstBreak.pnlPct):null;
  const giveback=firstBreak?Math.max(0,peakBeforeBreak-num(input.actualGrossPct)):0;
  return {observed,entryAligned,firstBreak,recovery,breakMinute,pnlAtBreak,postBest:firstBreak?postBest:null,postWorst:firstBreak?postWorst:null,giveback,newHighAfterBreak:firstBreak&&postBest>peakBeforeBreak+0.0001,alignedDuration:firstBreak?breakMinute:minute(input.startTs,input.closeTs),alignedPoints,againstPoints,unknownPoints,totalPoints:rows.length};
}
function addTrade(root,input){
  if(!root||!input)return null; const b=ensure(root,input),a=analyzeTrade(input); b.samples++; root.totalTrades++;
  b.trendPoints+=a.totalPoints; b.alignedPoints+=a.alignedPoints; b.againstPoints+=a.againstPoints; b.unknownPoints+=a.unknownPoints;
  if(a.observed){b.trendObservedTrades++; if(a.entryAligned)b.alignedAtEntry++; b.alignedDurationSum+=a.alignedDuration;}
  if(a.firstBreak){b.breakObserved++; b.breakMinuteSum+=a.breakMinute; b.pnlAtBreakSum+=a.pnlAtBreak; b.postBreakBestSum+=a.postBest; b.postBreakWorstSum+=a.postWorst; b.postBreakGivebackSum+=a.giveback; if(a.newHighAfterBreak)b.newHighAfterBreak++; if(a.recovery)b.recoveryObserved++;}
  return a;
}
function character(x){
  if(!x.ready)return 'VERI_BIRIKIYOR';
  if(x.breakRate<=20&&x.alignmentRate>=75)return 'TREND_DAYANIKLI';
  if(x.breakRate>=65&&x.newHighAfterBreakRate<=20)return 'TREND_KIRILGAN';
  if(x.breakRate>=40&&x.recoveryRate>=45)return 'TREND_GERI_KAZANAN';
  if(x.averageBreakMinute!==null&&x.averageBreakMinute<=20)return 'ERKEN_TREND_KAYBI';
  return 'DENGELI_TREND_KARAKTERI';
}
function buildModel(root,options={}){
  const min=Math.max(1,num(options.minSample,10)); const dna=Object.values(root?.byDna||{}).map(b=>{
    const obs=num(b.trendObservedTrades),br=num(b.breakObserved),pts=num(b.alignedPoints)+num(b.againstPoints),samples=num(b.samples);
    const x={key:b.key,label:b.label,samples,minimumSample:min,ready:samples>=min&&obs>=min,coverageRate:samples?round(obs/samples*100,1):0,alignmentRate:pts?round(num(b.alignedPoints)/pts*100,1):0,entryAlignmentRate:obs?round(num(b.alignedAtEntry)/obs*100,1):0,breakRate:obs?round(br/obs*100,1):0,recoveryRate:br?round(num(b.recoveryObserved)/br*100,1):0,newHighAfterBreakRate:br?round(num(b.newHighAfterBreak)/br*100,1):0,averageBreakMinute:br?round(num(b.breakMinuteSum)/br,1):null,averageAlignedDurationMinute:obs?round(num(b.alignedDurationSum)/obs,1):null,averagePnlAtBreakPct:br?round(num(b.pnlAtBreakSum)/br,4):null,averagePostBreakBestPct:br?round(num(b.postBreakBestSum)/br,4):null,averagePostBreakWorstPct:br?round(num(b.postBreakWorstSum)/br,4):null,averageGivebackAfterBreakPct:br?round(num(b.postBreakGivebackSum)/br,4):null};
    x.character=character(x); x.summary=!x.ready?`Trend davranışı için veri birikiyor (${samples}/${min}).`:`${x.character}; trend kırılma oranı %${x.breakRate}, kırılma sonrası yeni zirve oranı %${x.newHighAfterBreakRate}${x.averageBreakMinute!==null?`, ortalama kırılma ${x.averageBreakMinute}. dakika`:''}.`; return x;
  }).sort((a,b)=>b.samples-a.samples);
  return {version:VERSION,createdAt:new Date().toISOString(),dataPolicy:'Fiyat yolu üzerindeki kaydedilmiş SuperTrend yönleri kullanılır; canlı çıkış kararı verilmez.',totalTrades:num(root?.totalTrades),totalDna:dna.length,readyDna:dna.filter(x=>x.ready).length,dna,fragile:dna.filter(x=>x.ready&&x.character==='TREND_KIRILGAN').slice(0,20),durable:dna.filter(x=>x.ready&&x.character==='TREND_DAYANIKLI').slice(0,20)};
}
module.exports={VERSION,analyzeTrade,addTrade,buildModel,character};
