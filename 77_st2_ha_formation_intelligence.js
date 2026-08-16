'use strict';

// AGROS ST2 R28 — HA formasyon bağlamı.
// Amaç: HA pusu hacmini düşürmeden, giriş anında yapının yanlış tarafına emir açmayı engellemek.
// - Fincan/kulp geometrisi HA serisi üzerinde okunur (gürültü azaltma).
// - Kelebek harmonik oranları gerçek 15m kaynak fiyat pivotları üzerinde ölçülür.
// - Formasyonlar giriş üretmez; yalnız HA teyit + gövde kırılımına destek/veto bağlamı verir.

const ayarlar = require('./ayarlar.js');

const VERSION = 'R28.1-HA-FORMATION-CUP-HANDLE-BUTTERFLY-STRUCTURE';

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, n(v))); }
function avg(arr) { const a=(arr||[]).map(Number).filter(Number.isFinite); return a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0; }
function median(arr) {
  const a=(arr||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
  if (!a.length) return 0;
  const m=Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}
function pct(a,b) { return b ? ((a-b)/Math.abs(b))*100 : 0; }

function trueRangeSeries(series) {
  const out=[];
  for (let i=0;i<(series||[]).length;i++) {
    const c=series[i]; const prev=i ? series[i-1] : null;
    const hi=n(c?.high), lo=n(c?.low), pc=n(prev?.close, n(c?.open));
    if (!(hi>0 && lo>0)) continue;
    out.push(Math.max(hi-lo, Math.abs(hi-pc), Math.abs(lo-pc)));
  }
  return out;
}
function atr(series, period=14) {
  const tr=trueRangeSeries(series); const p=Math.max(2,Math.floor(n(period,14)));
  return avg(tr.slice(-p));
}
function bollingerWidthSeries(series, period=20, mult=2) {
  const closes=(series||[]).map(x=>n(x?.close)).filter(x=>x>0); const out=[];
  const p=Math.max(2,Math.floor(n(period,20)));
  for(let i=p-1;i<closes.length;i++) {
    const w=closes.slice(i-p+1,i+1); const mid=avg(w);
    const variance=avg(w.map(x=>(x-mid)*(x-mid))); const sd=Math.sqrt(variance);
    out.push(mid>0 ? ((2*n(mult,2)*sd)/mid)*100 : 0);
  }
  return out;
}

function macroContext(series, bb=null) {
  const lookback=Math.max(32,Math.floor(n(ayarlar.heikinAshiFormasyonBakisMum,64)));
  const rows=(series||[]).slice(-lookback);
  if(rows.length<24) return { ready:false, scoreBottom:0, scoreTop:0, rangePositionPct:50 };
  const highs=rows.map(x=>n(x.high)), lows=rows.map(x=>n(x.low)), closes=rows.map(x=>n(x.close));
  const maxHigh=Math.max(...highs), minLow=Math.min(...lows), range=maxHigh-minLow;
  if(!(range>0)) return { ready:false, scoreBottom:0, scoreTop:0, rangePositionPct:50 };
  const last=rows.at(-1), current=n(last.close);
  const rangePos=clamp(((current-minLow)/range)*100,0,100);
  const lowIndex=lows.indexOf(minLow), highIndex=highs.indexOf(maxHigh);
  const a=Math.max(atr(rows,14), range/1000);

  const peakBeforeLow=lowIndex>0 ? Math.max(...highs.slice(0,lowIndex+1)) : maxHigh;
  const troughBeforeHigh=highIndex>0 ? Math.min(...lows.slice(0,highIndex+1)) : minLow;
  const downImpulseAtr=(peakBeforeLow-minLow)/a;
  const upImpulseAtr=(maxHigh-troughBeforeHigh)/a;
  const lowAge=rows.length-1-lowIndex, highAge=rows.length-1-highIndex;

  const recent=rows.slice(-14);
  const recentLows=recent.map(x=>n(x.low)); const recentHighs=recent.map(x=>n(x.high));
  const bottomBand=minLow + range*0.12; const topBand=maxHigh - range*0.12;
  const bottomTouches=recentLows.filter(x=>x<=bottomBand).length;
  const topTouches=recentHighs.filter(x=>x>=topBand).length;
  const recentHalf=Math.max(4,Math.floor(recent.length/2));
  const firstRecentLow=Math.min(...recentLows.slice(0,recentHalf));
  const lastRecentLow=Math.min(...recentLows.slice(recentHalf));
  const firstRecentHigh=Math.max(...recentHighs.slice(0,recentHalf));
  const lastRecentHigh=Math.max(...recentHighs.slice(recentHalf));
  const higherLow=lastRecentLow > firstRecentLow + a*0.05;
  const lowerLow=lastRecentLow < firstRecentLow - a*0.05;
  const higherHigh=lastRecentHigh > firstRecentHigh + a*0.05;
  const lowerHigh=lastRecentHigh < firstRecentHigh - a*0.05;

  // Son 12 kapanmış HA mumdaki devam yapısını ATR cinsinden ölç.
  // Amaç tek bir BB temasıyla güçlü HH/HL yükselişine SHORT veya LL/LH düşüşüne LONG açmamak.
  const trendRows=rows.slice(-Math.min(12,rows.length));
  const trendHead=avg(trendRows.slice(0,Math.min(3,trendRows.length)).map(x=>n(x.close)));
  const trendTail=avg(trendRows.slice(-Math.min(3,trendRows.length)).map(x=>n(x.close)));
  const trendMoveAtr=a>0?(trendTail-trendHead)/a:0;
  let bullStructure=0, bearStructure=0;
  if(trendMoveAtr>=2) bullStructure+=38; else if(trendMoveAtr>=1) bullStructure+=28; else if(trendMoveAtr>=0.5) bullStructure+=16;
  if(trendMoveAtr<=-2) bearStructure+=38; else if(trendMoveAtr<=-1) bearStructure+=28; else if(trendMoveAtr<=-0.5) bearStructure+=16;
  if(higherLow) bullStructure+=24;
  if(higherHigh) bullStructure+=24;
  if(lowerHigh) bearStructure+=24;
  if(lowerLow) bearStructure+=24;
  if(rangePos>=55) bullStructure+=10;
  if(rangePos<=45) bearStructure+=10;
  if(bb && n(bb.mid)>0) {
    if(current>n(bb.mid)) bullStructure+=8;
    if(current<n(bb.mid)) bearStructure+=8;
  }
  bullStructure=clamp(bullStructure,0,100);
  bearStructure=clamp(bearStructure,0,100);

  const widths=bollingerWidthSeries(rows, Number(ayarlar.heikinAshiBollingerPeriod||20), Number(ayarlar.heikinAshiBollingerCarpani||2));
  const currentWidth=bb && n(bb.mid)>0 ? ((n(bb.upper)-n(bb.lower))/n(bb.mid))*100 : n(widths.at(-1));
  const widthMedian=median(widths.slice(-20));
  const squeezeRatio=widthMedian>0 ? currentWidth/widthMedian : 1;
  const squeezed=squeezeRatio<=0.78;

  let bottom=0, top=0;
  if(rangePos<=20) bottom+=30; else if(rangePos<=35) bottom+=22; else if(rangePos<=45) bottom+=10;
  if(rangePos>=80) top+=30; else if(rangePos>=65) top+=22; else if(rangePos>=55) top+=10;
  if(downImpulseAtr>=5) bottom+=22; else if(downImpulseAtr>=3) bottom+=15; else if(downImpulseAtr>=2) bottom+=8;
  if(upImpulseAtr>=5) top+=22; else if(upImpulseAtr>=3) top+=15; else if(upImpulseAtr>=2) top+=8;
  if(lowAge>=3) bottom+=10; if(highAge>=3) top+=10;
  if(bottomTouches>=3) bottom+=14; else if(bottomTouches>=2) bottom+=8;
  if(topTouches>=3) top+=14; else if(topTouches>=2) top+=8;
  if(higherLow) bottom+=12; if(lowerHigh) top+=12;
  if(squeezed) { if(rangePos<=40) bottom+=12; if(rangePos>=60) top+=12; }

  return {
    ready:true,
    rangePositionPct:rangePos,
    rangeHigh:maxHigh, rangeLow:minLow, atr:a,
    downImpulseAtr, upImpulseAtr, lowAge, highAge,
    bottomTouches, topTouches, higherLow, lowerLow, higherHigh, lowerHigh,
    trendMoveAtr, bullStructureScore:bullStructure, bearStructureScore:bearStructure,
    bbWidthPct:currentWidth, bbWidthMedianPct:widthMedian, squeezeRatio, squeezed,
    scoreBottom:clamp(bottom,0,100), scoreTop:clamp(top,0,100)
  };
}

function cupGeometry(series, direction='BULL', lookback=24) {
  const rows=(series||[]).slice(-Math.max(14,Math.floor(n(lookback,24))));
  if(rows.length<14) return { detected:false, score:0, handle:false };
  const bull=String(direction).toUpperCase()!=='BEAR';
  const highs=rows.map(x=>n(x.high)), lows=rows.map(x=>n(x.low));
  const a=Math.max(atr(rows,14), 1e-12);
  const pivotVals=bull?lows:highs;
  const pivotValue=bull?Math.min(...pivotVals):Math.max(...pivotVals);
  const pivotIndex=pivotVals.indexOf(pivotValue);
  if(pivotIndex<3 || pivotIndex>rows.length-5) return { detected:false, score:0, handle:false, pivotIndex };

  const leftVals=bull?highs.slice(0,pivotIndex):lows.slice(0,pivotIndex);
  const rightVals=bull?highs.slice(pivotIndex+1):lows.slice(pivotIndex+1);
  if(!leftVals.length||!rightVals.length) return { detected:false, score:0, handle:false };
  const leftRim=bull?Math.max(...leftVals):Math.min(...leftVals);
  const rightRim=bull?Math.max(...rightVals):Math.min(...rightVals);
  const depth=bull ? Math.min(leftRim,rightRim)-pivotValue : pivotValue-Math.max(leftRim,rightRim);
  const depthAtr=depth/a;
  if(!(depth>0)) return { detected:false, score:0, handle:false, depthAtr };
  const rimDiff=Math.abs(leftRim-rightRim)/depth;
  const nearPivot=rows.filter(x=> bull ? n(x.low)<=pivotValue+depth*0.25 : n(x.high)>=pivotValue-depth*0.25).length;
  const rightRecovery=bull ? (rightRim-pivotValue)/depth : (pivotValue-rightRim)/depth;

  const rightStart=pivotIndex+1;
  const rightRimLocalIndex=bull ? highs.slice(rightStart).indexOf(rightRim)+rightStart : lows.slice(rightStart).indexOf(rightRim)+rightStart;
  const post=rows.slice(rightRimLocalIndex+1);
  let handle=false, handleDepthRatio=0;
  if(post.length>=2) {
    const handleExtreme=bull ? Math.min(...post.map(x=>n(x.low))) : Math.max(...post.map(x=>n(x.high)));
    const pullback=bull ? rightRim-handleExtreme : handleExtreme-rightRim;
    handleDepthRatio=depth>0?pullback/depth:0;
    const noBreak=bull ? handleExtreme>pivotValue+depth*0.20 : handleExtreme<pivotValue-depth*0.20;
    handle=noBreak && handleDepthRatio>=0.08 && handleDepthRatio<=0.55;
  }

  let score=0;
  if(depthAtr>=2) score+=28; else if(depthAtr>=1.2) score+=20; else if(depthAtr>=0.7) score+=10;
  if(rimDiff<=0.35) score+=20; else if(rimDiff<=0.70) score+=12;
  if(nearPivot>=3) score+=20; else if(nearPivot>=2) score+=12;
  if(rightRecovery>=0.75) score+=18; else if(rightRecovery>=0.55) score+=10;
  if(handle) score+=14;
  score=clamp(score,0,100);
  return {
    detected:score>=60, score, direction:bull?'BULL':'BEAR', handle, handleDepthRatio,
    pivotIndex, pivotAge:rows.length-1-pivotIndex, pivotValue, leftRim, rightRim,
    depth, depthAtr, rimDiff, nearPivot, rightRecovery
  };
}

function realRowsFromHa(series) {
  return (series||[]).map((x,i)=>({
    index:i, openTime:n(x?.openTime), closeTime:n(x?.closeTime),
    open:n(x?.source?.open,n(x?.open)), high:n(x?.source?.high,n(x?.high)),
    low:n(x?.source?.low,n(x?.low)), close:n(x?.source?.close,n(x?.close))
  })).filter(x=>x.high>0&&x.low>0&&x.close>0);
}

function extractPivots(series, span=2) {
  const rows=realRowsFromHa(series); const s=Math.max(1,Math.floor(n(span,2))); const raw=[];
  for(let i=s;i<rows.length-s;i++) {
    const w=rows.slice(i-s,i+s+1), c=rows[i];
    const maxH=Math.max(...w.map(x=>x.high)), minL=Math.min(...w.map(x=>x.low));
    const isH=c.high>=maxH, isL=c.low<=minL;
    if(isH&&isL) {
      const mid=(c.high+c.low)/2; const prev=n(rows[i-1]?.close,mid);
      raw.push(Math.abs(c.high-prev)>=Math.abs(c.low-prev)?{type:'HIGH',price:c.high,index:i,time:c.closeTime}:{type:'LOW',price:c.low,index:i,time:c.closeTime});
    } else if(isH) raw.push({type:'HIGH',price:c.high,index:i,time:c.closeTime});
    else if(isL) raw.push({type:'LOW',price:c.low,index:i,time:c.closeTime});
  }
  const out=[];
  for(const p of raw) {
    const last=out.at(-1);
    if(!last||last.type!==p.type) out.push({...p});
    else if((p.type==='HIGH'&&p.price>last.price)||(p.type==='LOW'&&p.price<last.price)) out[out.length-1]={...p};
  }
  return out;
}

function nearTarget(v,target,tol) { return Math.max(0,1-Math.abs(n(v)-target)/tol); }
function inRangeScore(v,lo,hi,edge=0.10) {
  const x=n(v); if(x>=lo&&x<=hi) return 1;
  if(x<lo&&x>=lo-edge) return (x-(lo-edge))/edge;
  if(x>hi&&x<=hi+edge) return ((hi+edge)-x)/edge;
  return 0;
}

function validateButterflyPoints(points) {
  if(!Array.isArray(points)||points.length!==5) return { valid:false, score:0, reason:'POINT_COUNT' };
  const [X,A,B,C,D]=points; const types=points.map(x=>x.type).join('-');
  const bullish=types==='LOW-HIGH-LOW-HIGH-LOW'; const bearish=types==='HIGH-LOW-HIGH-LOW-HIGH';
  if(!bullish&&!bearish) return { valid:false, score:0, reason:'PIVOT_TYPES', types };
  const xa=Math.abs(n(A.price)-n(X.price)); const ab=Math.abs(n(B.price)-n(A.price)); const bc=Math.abs(n(C.price)-n(B.price)); const cd=Math.abs(n(D.price)-n(C.price));
  if(!(xa>0&&ab>0&&bc>0&&cd>0)) return { valid:false, score:0, reason:'ZERO_LEG' };
  if(bullish && !(B.price>X.price && B.price<A.price && C.price>B.price && C.price<A.price && D.price<X.price)) return { valid:false, score:0, reason:'BULL_GEOMETRY' };
  if(bearish && !(B.price<X.price && B.price>A.price && C.price<B.price && C.price>A.price && D.price>X.price)) return { valid:false, score:0, reason:'BEAR_GEOMETRY' };

  const bXa=ab/xa;
  const cAb=bc/ab;
  const dXa=Math.abs(n(D.price)-n(A.price))/xa;
  const bcProj=cd/bc;
  const abcd=cd/ab;
  const bScore=nearTarget(bXa,0.786,0.12);
  const cScore=inRangeScore(cAb,0.382,0.886,0.08);
  const dScore=nearTarget(dXa,1.27,0.18);
  const bcScore=inRangeScore(bcProj,1.50,2.70,0.25);
  const abcdScore=Math.max(nearTarget(abcd,1.0,0.22),nearTarget(abcd,1.27,0.22));
  const score=Math.round(100*(0.28*bScore+0.14*cScore+0.30*dScore+0.14*bcScore+0.14*abcdScore));
  return {
    valid:score>=68, score, direction:bullish?'BULLISH':'BEARISH',
    ratios:{ bXa, cAb, dXa, bcProj, abcd }, points:{X,A,B,C,D},
    reason:score>=68?'VALID':'RATIO_QUALITY'
  };
}

function detectButterfly(series) {
  const lookback=Math.max(48,Math.floor(n(ayarlar.heikinAshiFormasyonBakisMum,64))+24);
  const rows=(series||[]).slice(-lookback); if(rows.length<40) return { valid:false,score:0,reason:'ROWS' };
  const pivots=extractPivots(rows,2); if(pivots.length<5) return { valid:false,score:0,reason:'PIVOTS',pivotCount:pivots.length };
  let best=null;
  const start=Math.max(0,pivots.length-12);
  for(let i=start;i<=pivots.length-5;i++) {
    const candidate=validateButterflyPoints(pivots.slice(i,i+5));
    if(!candidate.valid) continue;
    const d=candidate.points.D; const age=rows.length-1-n(d.index);
    const a=Math.max(atr(rows,14),1e-12); const current=n(rows.at(-1)?.source?.close,n(rows.at(-1)?.close));
    const dDistanceAtr=Math.abs(current-n(d.price))/a;
    const recent=age<=8 && dDistanceAtr<=1.8;
    const enriched={...candidate, dAge:age, dDistanceAtr, nearPrz:recent};
    if(recent && (!best || enriched.score>best.score)) best=enriched;
  }
  return best || { valid:false,score:0,reason:'NO_RECENT_VALID',pivotCount:pivots.length };
}

function formationGate(series, side, bb=null) {
  const yon=String(side||'').toUpperCase();
  const enabled=ayarlar.heikinAshiFormasyonAktif!==false;
  if(!enabled) return { enabled:false, allowed:true, veto:false, reasons:[], support:[], label:'FORM_OFF' };
  const macro=macroContext(series,bb);
  const smallBull=cupGeometry(series,'BULL',20);
  const smallBear=cupGeometry(series,'BEAR',20);
  const largeBull=cupGeometry(series,'BULL',Math.max(36,Math.floor(n(ayarlar.heikinAshiFormasyonBakisMum,64))));
  const largeBear=cupGeometry(series,'BEAR',Math.max(36,Math.floor(n(ayarlar.heikinAshiFormasyonBakisMum,64))));
  const butterfly=detectButterfly(series);
  const vetoThreshold=clamp(n(ayarlar.heikinAshiFormasyonVetoSkor,70),55,95);
  const reasons=[], support=[];

  const bottomStrong=macro.ready && macro.scoreBottom>=vetoThreshold && macro.downImpulseAtr>=2.5;
  const topStrong=macro.ready && macro.scoreTop>=vetoThreshold && macro.upImpulseAtr>=2.5;
  const bullishCup=(largeBull.detected||smallBull.detected) && macro.rangePositionPct<=45;
  const bearishCup=(largeBear.detected||smallBear.detected) && macro.rangePositionPct>=55;
  const bullishButterfly=butterfly.valid&&butterfly.nearPrz&&butterfly.direction==='BULLISH';
  const bearishButterfly=butterfly.valid&&butterfly.nearPrz&&butterfly.direction==='BEARISH';
  const bullishReversalEvidence=bullishCup||bullishButterfly;
  const bearishReversalEvidence=bearishCup||bearishButterfly;
  const bullContinuation=macro.ready && n(macro.bullStructureScore)>=70 && !bearishReversalEvidence;
  const bearContinuation=macro.ready && n(macro.bearStructureScore)>=70 && !bullishReversalEvidence;

  if(yon==='LONG') {
    if(bottomStrong) support.push(`BIG_CUP_BOTTOM_${macro.scoreBottom}`);
    if(bullContinuation) support.push(`BULLISH_HH_HL_STRUCTURE_${macro.bullStructureScore}`);
    if(bullishCup) support.push(`${smallBull.detected?'SMALL_CUP':'BIG_CUP'}${smallBull.handle||largeBull.handle?'_HANDLE':''}`);
    if(bullishButterfly) support.push(`BULLISH_BUTTERFLY_${butterfly.score}`);
    if(topStrong) reasons.push(`TOP_AFTER_STRONG_RALLY_${macro.scoreTop}`);
    if(bearContinuation) reasons.push(`LONG_AGAINST_BEARISH_STRUCTURE_${macro.bearStructureScore}`);
    if(bearishCup) reasons.push(`INVERSE_CUP_TOP_${Math.max(largeBear.score,smallBear.score)}`);
    if(bearishButterfly) reasons.push(`BEARISH_BUTTERFLY_PRZ_${butterfly.score}`);
  } else if(yon==='SHORT') {
    if(topStrong && !bullContinuation) support.push(`BIG_INVERSE_CUP_TOP_${macro.scoreTop}`);
    if(bearishCup) support.push(`${smallBear.detected?'SMALL_INVERSE_CUP':'BIG_INVERSE_CUP'}${smallBear.handle||largeBear.handle?'_HANDLE':''}`);
    if(bearishButterfly) support.push(`BEARISH_BUTTERFLY_${butterfly.score}`);
    if(bottomStrong) reasons.push(`BOTTOM_AFTER_STRONG_DROP_${macro.scoreBottom}`);
    if(bullContinuation) reasons.push(`SHORT_AGAINST_BULLISH_STRUCTURE_${macro.bullStructureScore}`);
    if(bullishCup) reasons.push(`CUP_BOTTOM_${Math.max(largeBull.score,smallBull.score)}`);
    if(bullishButterfly) reasons.push(`BULLISH_BUTTERFLY_PRZ_${butterfly.score}`);
  }

  const veto=ayarlar.heikinAshiFormasyonVetoAktif!==false && reasons.length>0;
  const scoreSupport=Math.max(0,macro.scoreBottom*(yon==='LONG')+macro.scoreTop*(yon==='SHORT'), smallBull.detected&&yon==='LONG'?smallBull.score:0, smallBear.detected&&yon==='SHORT'?smallBear.score:0, bullishButterfly&&yon==='LONG'?butterfly.score:0, bearishButterfly&&yon==='SHORT'?butterfly.score:0);
  const scoreConflict=Math.max(0,macro.scoreTop*(yon==='LONG')+macro.scoreBottom*(yon==='SHORT'), smallBear.detected&&yon==='LONG'?smallBear.score:0, smallBull.detected&&yon==='SHORT'?smallBull.score:0, bullishButterfly&&yon==='SHORT'?butterfly.score:0, bearishButterfly&&yon==='LONG'?butterfly.score:0);
  return {
    enabled:true, allowed:!veto, veto, reasons, support,
    label:veto?'FORMATION_VETO':support.length?'FORMATION_SUPPORT':'FORMATION_NEUTRAL',
    scoreSupport:Math.round(scoreSupport), scoreConflict:Math.round(scoreConflict),
    macro, structure:{ bullContinuation, bearContinuation }, cup:{ smallBull, smallBear, largeBull, largeBear }, butterfly
  };
}

function shortSummary(gate) {
  if(!gate||gate.enabled===false) return 'FORM OFF';
  const m=gate.macro||{}; const b=gate.butterfly||{};
  const pos=Number.isFinite(Number(m.rangePositionPct))?`Konum %${n(m.rangePositionPct).toFixed(0)}`:'Konum ?';
  const zone=n(m.scoreBottom)>=n(m.scoreTop)?`Dip ${n(m.scoreBottom).toFixed(0)}`:`Tepe ${n(m.scoreTop).toFixed(0)}`;
  const bf=b.valid&&b.nearPrz?` | ${b.direction==='BULLISH'?'Bull':'Bear'} Butterfly ${n(b.score).toFixed(0)}`:'';
  const cup=gate.support?.some(x=>x.includes('CUP'))?' | CUP+':'';
  const structure=n(m.bullStructureScore)>=70?` | BULL ${n(m.bullStructureScore).toFixed(0)}`:n(m.bearStructureScore)>=70?` | BEAR ${n(m.bearStructureScore).toFixed(0)}`:'';
  return `${gate.label} | ${pos} | ${zone}${structure}${cup}${bf}`;
}

module.exports={
  VERSION, atr, bollingerWidthSeries, macroContext, cupGeometry,
  extractPivots, validateButterflyPoints, detectButterfly, formationGate, shortSummary,
  _internals:{avg,median,realRowsFromHa}
};
