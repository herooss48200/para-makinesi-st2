'use strict';

// AGROS ST2 R29.1 — HA Market Structure Authority
// Kesin sözleşme:
// 1) Strict HA zamanlaması ayrı katmandır: kapanmış pusu -> kapanmış teyit -> yalnız sonraki 15m gövde kırılımı.
// 2) Formasyon izni OR mantığıdır: doğru Fincan/Kulp giriş FAZI VEYA doğru Butterfly D/PRZ.
// 3) Bollinger rejimi ortam/konum kontrolüdür; tek başına AL sinyali üretmez.
// 4) Bu modül emir göndermez ve Renko zincirine dokunmaz.

const ayarlar = require('./ayarlar.js');
const formation = require('./77_st2_ha_formation_intelligence.js');

const VERSION = 'R29.1-HA-MARKET-STRUCTURE-FORMATION-OR';

function n(v, d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,n(v))); }
function avg(a){ const x=(a||[]).map(Number).filter(Number.isFinite); return x.length?x.reduce((s,v)=>s+v,0)/x.length:0; }
function percentileRank(values, value){
  const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return 50;
  let le=0; for(const x of a) if(x<=value) le++;
  return clamp((le/a.length)*100,0,100);
}
function rows(series, lookback){ return (Array.isArray(series)?series:[]).slice(-Math.max(8,Math.floor(n(lookback,64)))); }
function closes(series){ return (series||[]).map(x=>n(x?.close)).filter(x=>x>0); }

function bollingerAt(series, period=20, mult=2, endOffset=0){
  const arr=closes(series); const p=Math.max(2,Math.floor(n(period,20)));
  const end=Math.max(0,arr.length-Math.max(0,Math.floor(n(endOffset))));
  if(end<p) return null;
  const w=arr.slice(end-p,end); const mid=avg(w);
  const variance=avg(w.map(x=>(x-mid)*(x-mid))); const sd=Math.sqrt(variance);
  return mid>0?{mid,upper:mid+n(mult,2)*sd,lower:mid-n(mult,2)*sd}:null;
}

function bbRegime(series, suppliedBb=null){
  const period=Math.max(2,Math.floor(n(ayarlar.heikinAshiBollingerPeriod,20)));
  const mult=n(ayarlar.heikinAshiBollingerCarpani,2);
  const lookback=Math.max(40,Math.floor(n(ayarlar.heikinAshiBbRegimeBakisMum,80)));
  const s=rows(series,Math.max(lookback,period+8));
  const current=suppliedBb&&n(suppliedBb.mid)>0?suppliedBb:bollingerAt(s,period,mult,0);
  if(!current) return {ready:false,regime:'UNKNOWN',percentile:50,widthPct:0,priceZonePct:50,midSlopeAtrPerBar:0};
  const widths=formation.bollingerWidthSeries(s,period,mult).slice(-lookback);
  const widthPct=((n(current.upper)-n(current.lower))/Math.max(n(current.mid),1e-12))*100;
  const pct=percentileRank(widths,widthPct);
  const widePct=clamp(n(ayarlar.heikinAshiBbWidePercentile,72),55,95);
  const extremePct=clamp(n(ayarlar.heikinAshiBbExtremePercentile,90),widePct+1,99);
  const narrowPct=clamp(n(ayarlar.heikinAshiBbNarrowPercentile,28),1,widePct-1);
  const regime=pct>=extremePct?'EXTREME_WIDE':pct>=widePct?'WIDE':pct<=narrowPct?'NARROW':'NORMAL';
  const last=n(s.at(-1)?.close);
  const span=Math.max(n(current.upper)-n(current.lower),1e-12);
  const priceZonePct=clamp(((last-n(current.lower))/span)*100,-50,150);
  const bbPast=bollingerAt(s,period,mult,4);
  const a=Math.max(formation.atr(s,14),1e-12);
  const midSlopeAtrPerBar=bbPast?((n(current.mid)-n(bbPast.mid))/a)/4:0;
  return {ready:true,regime,percentile:pct,widthPct,priceZonePct,midSlopeAtrPerBar,mid:n(current.mid),upper:n(current.upper),lower:n(current.lower)};
}

function recentSlope(series, bars=3){
  const s=rows(series,Math.max(4,bars+1)); const c=s.slice(-Math.max(2,bars+1)).map(x=>n(x.close));
  if(c.length<2) return 0;
  return (c.at(-1)-c[0])/Math.max(1,c.length-1);
}

function cupPhase(series, direction='BULL', lookback=64){
  const bull=String(direction).toUpperCase()!=='BEAR';
  const s=rows(series,Math.max(20,lookback));
  if(s.length<20) return {detected:false,phase:'NONE',score:0,direction:bull?'BULL':'BEAR'};
  const highs=s.map(x=>n(x.high)), lows=s.map(x=>n(x.low)), cls=s.map(x=>n(x.close));
  const a=Math.max(formation.atr(s,14),1e-12);
  const pivotValue=bull?Math.min(...lows):Math.max(...highs);
  const pivotIndex=(bull?lows:highs).indexOf(pivotValue);
  if(pivotIndex<4 || pivotIndex>s.length-6) return {detected:false,phase:'NONE',score:0,direction:bull?'BULL':'BEAR',pivotIndex};

  const leftRim=bull?Math.max(...highs.slice(0,pivotIndex)):Math.min(...lows.slice(0,pivotIndex));
  const afterHigh=highs.slice(pivotIndex+1), afterLow=lows.slice(pivotIndex+1);
  if(!afterHigh.length) return {detected:false,phase:'NONE',score:0,direction:bull?'BULL':'BEAR'};
  const rightRim=bull?Math.max(...afterHigh):Math.min(...afterLow);
  const rightRimIndex=pivotIndex+1+(bull?afterHigh.indexOf(rightRim):afterLow.indexOf(rightRim));
  const conservativeRim=bull?Math.min(leftRim,rightRim):Math.max(leftRim,rightRim);
  const depth=bull?conservativeRim-pivotValue:pivotValue-conservativeRim;
  if(!(depth>0)) return {detected:false,phase:'NONE',score:0,direction:bull?'BULL':'BEAR'};
  const depthAtr=depth/a;
  const rimDiff=Math.abs(leftRim-rightRim)/depth;
  const cupDetected=depthAtr>=0.8 && rimDiff<=0.85;
  if(!cupDetected) return {detected:false,phase:'NONE',score:0,direction:bull?'BULL':'BEAR',depthAtr,rimDiff,pivotIndex};

  const current=cls.at(-1);
  const progress=clamp(bull?(current-pivotValue)/depth:(pivotValue-current)/depth,-0.5,1.8);
  const post=s.slice(rightRimIndex+1);
  let phase='NONE', handle=false, handleDepthRatio=0, handleExtreme=0, handleRecovery=0;
  const rightLegProgress=clamp(bull?(rightRim-pivotValue)/depth:(pivotValue-rightRim)/depth,0,2);

  if(post.length>=2 && rightLegProgress>=0.72){
    handleExtreme=bull?Math.min(...post.map(x=>n(x.low))):Math.max(...post.map(x=>n(x.high)));
    const pullback=bull?rightRim-handleExtreme:handleExtreme-rightRim;
    handleDepthRatio=pullback/depth;
    const noCupBreak=bull?handleExtreme>pivotValue+depth*0.18:handleExtreme<pivotValue-depth*0.18;
    handle=noCupBreak && handleDepthRatio>=0.07 && handleDepthRatio<=0.55;
    if(handle){
      const range=Math.max(pullback,1e-12);
      handleRecovery=clamp(bull?(current-handleExtreme)/range:(handleExtreme-current)/range,-0.5,1.5);
      const slope=recentSlope(s,3);
      const reversal=bull?slope>0:slope<0;
      if(handleRecovery<=0.15) phase=bull?'HANDLE_BOTTOM':'INVERSE_HANDLE_TOP';
      else if(reversal && handleRecovery>=0.25) phase=bull?'HANDLE_REVERSAL':'INVERSE_HANDLE_REVERSAL';
      else phase=bull?'HANDLE_PULLBACK':'INVERSE_HANDLE_BOUNCE';
    }
  }
  if(!handle){
    if(progress<=0.38) phase=bull?'CUP_BOTTOM':'INVERSE_CUP_TOP';
    else if(progress<0.82) phase=bull?'RIGHT_RISE':'RIGHT_FALL';
    else if(progress<=1.08) phase=bull?'RIGHT_RIM':'INVERSE_RIGHT_RIM';
    else phase=bull?'BREAKOUT_EXTENDED':'BREAKDOWN_EXTENDED';
  }

  let score=0;
  if(depthAtr>=2) score+=35; else if(depthAtr>=1.2) score+=25; else score+=15;
  if(rimDiff<=0.30) score+=25; else if(rimDiff<=0.55) score+=18; else score+=8;
  if(pivotIndex>=Math.floor(s.length*0.20)&&pivotIndex<=Math.floor(s.length*0.75)) score+=15;
  if(rightLegProgress>=0.75) score+=15;
  if(handle) score+=10;
  return {detected:true,phase,score:clamp(score,0,100),direction:bull?'BULL':'BEAR',pivotIndex,pivotAge:s.length-1-pivotIndex,pivotValue,leftRim,rightRim,rightRimIndex,depth,depthAtr,rimDiff,progress,rightLegProgress,handle,handleDepthRatio,handleExtreme,handleRecovery};
}

function butterflyContext(series){
  const b=formation.detectButterfly(series);
  const minScore=clamp(n(ayarlar.heikinAshiButterflyMinScore,72),60,95);
  const maxAtr=Math.max(0.25,n(ayarlar.heikinAshiButterflyMaxPrzAtr,0.9));
  const maxAge=Math.max(1,Math.floor(n(ayarlar.heikinAshiButterflyMaxDAge,4)));
  const strong=!!(b&&b.valid&&b.nearPrz&&n(b.score)>=minScore&&n(b.dDistanceAtr,99)<=maxAtr&&n(b.dAge,99)<=maxAge);
  return {...b,strong};
}

function formationDecision({side, macro, bb, bullCupLarge, bullCupSmall, bearCupLarge, bearCupSmall, butterfly, slope}){
  const yon=String(side||'').toUpperCase();
  const bullCup=bullCupSmall?.detected?bullCupSmall:bullCupLarge;
  const bearCup=bearCupSmall?.detected?bearCupSmall:bearCupLarge;
  const bullCupScale=bullCupSmall?.detected?'SMALL':bullCupLarge?.detected?'BIG':'NONE';
  const bearCupScale=bearCupSmall?.detected?'SMALL':bearCupLarge?.detected?'BIG':'NONE';
  const bullButterfly=!!(butterfly?.strong&&butterfly.direction==='BULLISH');
  const bearButterfly=!!(butterfly?.strong&&butterfly.direction==='BEARISH');

  let cupHandlePhaseAllow=false, cupAllowReason=null;
  let butterflyPrzAllow=false, butterflyAllowReason=null;

  if(yon==='LONG'){
    const cupBottomReversal=!!(bullCup?.detected&&bullCup.phase==='CUP_BOTTOM'&&macro?.higherLow&&n(macro?.scoreBottom)>=70&&n(slope)>0);
    const handleReversal=!!(bullCup?.detected&&bullCup.phase==='HANDLE_REVERSAL');
    cupHandlePhaseAllow=cupBottomReversal||handleReversal;
    cupAllowReason=handleReversal?'CUP_HANDLE_REVERSAL_LONG':cupBottomReversal?'CUP_BOTTOM_REVERSAL_LONG':null;
    butterflyPrzAllow=bullButterfly;
    butterflyAllowReason=bullButterfly?`BULLISH_BUTTERFLY_D_PRZ_${n(butterfly.score).toFixed(0)}`:null;
  } else if(yon==='SHORT'){
    const cupTopReversal=!!(bearCup?.detected&&bearCup.phase==='INVERSE_CUP_TOP'&&macro?.lowerHigh&&n(macro?.scoreTop)>=70&&n(slope)<0);
    const handleReversal=!!(bearCup?.detected&&bearCup.phase==='INVERSE_HANDLE_REVERSAL');
    cupHandlePhaseAllow=cupTopReversal||handleReversal;
    cupAllowReason=handleReversal?'INVERSE_CUP_HANDLE_REVERSAL_SHORT':cupTopReversal?'INVERSE_CUP_TOP_REVERSAL_SHORT':null;
    butterflyPrzAllow=bearButterfly;
    butterflyAllowReason=bearButterfly?`BEARISH_BUTTERFLY_D_PRZ_${n(butterfly.score).toFixed(0)}`:null;
  }

  // Kullanıcının kesin kuralı: Fincan/Kulp doğru AL fazında VEYA Butterfly doğru D/PRZ'de.
  const formationAllow = cupHandlePhaseAllow || butterflyPrzAllow;
  return {formationAllow,cupHandlePhaseAllow,butterflyPrzAllow,cupAllowReason,butterflyAllowReason,bullCup,bearCup,bullCupScale,bearCupScale,bullButterfly,bearButterfly};
}

function evaluate(series, side, suppliedBb=null){
  const yon=String(side||'').toUpperCase();
  if(ayarlar.heikinAshiStructureAuthorityAktif===false) return {enabled:false,allowed:true,veto:false,quality:100,label:'AUTH_OFF',reasons:[],support:[],formation:{formationAllow:true}};
  const macro=formation.macroContext(series,suppliedBb);
  const bb=bbRegime(series,suppliedBb);
  const bullCupLarge=cupPhase(series,'BULL',Math.max(48,Math.floor(n(ayarlar.heikinAshiCupBuyukBakisMum,80))));
  const bullCupSmall=cupPhase(series,'BULL',Math.max(20,Math.floor(n(ayarlar.heikinAshiCupKucukBakisMum,28))));
  const bearCupLarge=cupPhase(series,'BEAR',Math.max(48,Math.floor(n(ayarlar.heikinAshiCupBuyukBakisMum,80))));
  const bearCupSmall=cupPhase(series,'BEAR',Math.max(20,Math.floor(n(ayarlar.heikinAshiCupKucukBakisMum,28))));
  const butterfly=butterflyContext(series);
  const slope=recentSlope(series,3);
  const f=formationDecision({side:yon,macro,bb,bullCupLarge,bullCupSmall,bearCupLarge,bearCupSmall,butterfly,slope});
  const reasons=[], support=[];

  const bullScore=n(macro?.bullStructureScore), bearScore=n(macro?.bearStructureScore);
  const pos=n(macro?.rangePositionPct,50);
  const downStrong=macro?.ready && (n(macro.trendMoveAtr)<=-1.0 || bearScore>=72 || n(bb.midSlopeAtrPerBar)<=-0.10);
  const upStrong=macro?.ready && (n(macro.trendMoveAtr)>=1.0 || bullScore>=72 || n(bb.midSlopeAtrPerBar)>=0.10);
  const wide=bb.regime==='WIDE'||bb.regime==='EXTREME_WIDE';

  // OR formasyon izni gerçek giriş için zorunludur.
  if(f.cupAllowReason) support.push(f.cupAllowReason);
  if(f.butterflyAllowReason) support.push(f.butterflyAllowReason);
  if(!f.formationAllow) reasons.push('FORMATION_ENTRY_PHASE_NOT_READY');

  // Bollinger rejimi AL sinyali üretmez; ortamın ters/çok geç konumunu veto eder.
  if(yon==='LONG' && bb.priceZonePct>=82) reasons.push(`BB_LONG_TOO_HIGH_Z${n(bb.priceZonePct).toFixed(0)}`);
  if(yon==='SHORT' && bb.priceZonePct<=18) reasons.push(`BB_SHORT_TOO_LOW_Z${n(bb.priceZonePct).toFixed(0)}`);
  if(wide&&yon==='LONG'&&downStrong&&bb.priceZonePct<55&&!f.formationAllow) reasons.push(`WIDE_BB_STRONG_DOWN_BOUNCE_LONG_P${n(bb.percentile).toFixed(0)}`);
  if(wide&&yon==='SHORT'&&upStrong&&bb.priceZonePct>45&&!f.formationAllow) reasons.push(`WIDE_BB_STRONG_UP_BOUNCE_SHORT_P${n(bb.percentile).toFixed(0)}`);
  if(wide&&yon==='LONG'&&downStrong&&f.formationAllow) support.push(`BB_COUNTERTREND_REVERSAL_CONTEXT_LONG_P${n(bb.percentile).toFixed(0)}`);
  if(wide&&yon==='SHORT'&&upStrong&&f.formationAllow) support.push(`BB_COUNTERTREND_REVERSAL_CONTEXT_SHORT_P${n(bb.percentile).toFixed(0)}`);
  if(wide&&yon==='SHORT'&&downStrong&&bb.priceZonePct>=42) support.push(`WIDE_BB_DOWN_TREND_PULLBACK_SHORT_P${n(bb.percentile).toFixed(0)}`);
  if(wide&&yon==='LONG'&&upStrong&&bb.priceZonePct<=58) support.push(`WIDE_BB_UP_TREND_PULLBACK_LONG_P${n(bb.percentile).toFixed(0)}`);

  // Fincan yanlış fazları ayrıca açıklayıcı hard-veto olarak tutulur.
  const sideCup=yon==='LONG'?f.bullCup:f.bearCup;
  if(sideCup?.detected){
    const badLong={RIGHT_RISE:'CUP_RIGHT_RISE_CHASE',RIGHT_RIM:'LONG_AT_CUP_RIGHT_RIM',BREAKOUT_EXTENDED:'LONG_AFTER_CUP_EXTENDED_BREAKOUT',HANDLE_PULLBACK:'LONG_DURING_HANDLE_PULLBACK',HANDLE_BOTTOM:'LONG_HANDLE_BOTTOM_WAIT_REVERSAL'};
    const badShort={RIGHT_FALL:'INVERSE_CUP_RIGHT_FALL_CHASE',INVERSE_RIGHT_RIM:'SHORT_AT_INVERSE_CUP_RIGHT_RIM',BREAKDOWN_EXTENDED:'SHORT_AFTER_INVERSE_CUP_EXTENDED_BREAKDOWN',INVERSE_HANDLE_BOUNCE:'SHORT_DURING_INVERSE_HANDLE_BOUNCE',INVERSE_HANDLE_TOP:'SHORT_INVERSE_HANDLE_TOP_WAIT_REVERSAL'};
    const bad=yon==='LONG'?badLong[sideCup.phase]:badShort[sideCup.phase];
    if(bad) reasons.push(bad);
  }

  // Karşı yöndeki güçlü Butterfly D/PRZ asla geçilmez.
  if(f.bearButterfly&&yon==='LONG') reasons.push(`LONG_IN_BEARISH_BUTTERFLY_D_PRZ_${n(butterfly.score).toFixed(0)}`);
  if(f.bullButterfly&&yon==='SHORT') reasons.push(`SHORT_IN_BULLISH_BUTTERFLY_D_PRZ_${n(butterfly.score).toFixed(0)}`);

  // Yapı bilgisi kalite/diagnostic olarak kalır; doğru formasyon AL fazının yerine geçmez.
  let q=50;
  q += yon==='LONG'?clamp((bullScore-bearScore)*0.14,-14,14):clamp((bearScore-bullScore)*0.14,-14,14);
  if(f.cupHandlePhaseAllow) q+=22;
  if(f.butterflyPrzAllow) q+=24;
  if(yon==='LONG'&&pos<=30) q+=6;
  if(yon==='SHORT'&&pos>=70) q+=6;
  if(yon==='LONG'&&bearScore>=82&&!f.butterflyPrzAllow) q-=10;
  if(yon==='SHORT'&&bullScore>=82&&!f.butterflyPrzAllow) q-=10;
  q=clamp(Math.round(q),0,100);

  const veto=reasons.length>0;
  const label=veto?'STRUCTURE_VETO':f.butterflyPrzAllow&&f.cupHandlePhaseAllow?'FORMATION_DUAL_ALLOW':f.butterflyPrzAllow?'BUTTERFLY_PRZ_ALLOW':'CUP_HANDLE_PHASE_ALLOW';
  return {
    enabled:true,side:yon,allowed:!veto,veto,hardVeto:veto,qualityReject:false,quality:q,minQuality:n(ayarlar.heikinAshiStructureMinQuality,64),label,reasons,support,
    macro,bb,butterfly,
    cup:{bullLarge:bullCupLarge,bullSmall:bullCupSmall,bearLarge:bearCupLarge,bearSmall:bearCupSmall,selectedBull:f.bullCup,selectedBear:f.bearCup,selectedBullScale:f.bullCupScale,selectedBearScale:f.bearCupScale},
    formation:{formationAllow:f.formationAllow,cupHandlePhaseAllow:f.cupHandlePhaseAllow,butterflyPrzAllow:f.butterflyPrzAllow,cupAllowReason:f.cupAllowReason,butterflyAllowReason:f.butterflyAllowReason},
    regime:{downStrong,upStrong,wide}, slope
  };
}

function fmt(v, digits=8){
  const x=Number(v); if(!Number.isFinite(x)) return '-';
  const a=Math.abs(x);
  const d=a>=100?4:a>=1?6:digits;
  return x.toFixed(d).replace(/0+$/,'').replace(/\.$/,'');
}
function cupEvidence(a){
  const side=String(a?.side||'').toUpperCase(); const c=a?.cup||{};
  const cup=side==='SHORT'?c.selectedBear:c.selectedBull;
  const scale=side==='SHORT'?c.selectedBearScale:c.selectedBullScale;
  if(!cup?.detected) return null;
  const inverse=side==='SHORT';
  return {
    scale:scale||'?', phase:cup.phase||'NONE', score:n(cup.score),
    pivotLabel:inverse?'Tepe':'Dip', pivot:n(cup.pivotValue), leftRim:n(cup.leftRim), rightRim:n(cup.rightRim),
    depthAtr:n(cup.depthAtr), handle:!!cup.handle, handleExtreme:n(cup.handleExtreme),
    handleDepthPct:n(cup.handleDepthRatio)*100, handleRecoveryPct:n(cup.handleRecovery)*100,
    progressPct:n(cup.progress)*100
  };
}
function butterflyEvidence(a){
  const b=a?.butterfly;
  if(!b?.valid) return null;
  const pts=b.points||{}; const r=b.ratios||{};
  return {
    direction:b.direction||'?', score:n(b.score), strong:!!b.strong, nearPrz:!!b.nearPrz,
    X:n(pts.X?.price), A:n(pts.A?.price), B:n(pts.B?.price), C:n(pts.C?.price), D:n(pts.D?.price),
    bXa:n(r.bXa), cAb:n(r.cAb), dXa:n(r.dXa), bcProj:n(r.bcProj), abcd:n(r.abcd),
    dAge:n(b.dAge), dDistanceAtr:n(b.dDistanceAtr)
  };
}
function evidenceLines(a){
  if(!a||a.enabled===false) return ['AUTH OFF'];
  const out=[]; const bb=a.bb||{}; const f=a.formation||{};
  out.push(`BB ${String(bb.regime||'?')} | P${n(bb.percentile).toFixed(0)} | Zone %${n(bb.priceZonePct).toFixed(0)} | Alt/Orta/Üst ${fmt(bb.lower)}/${fmt(bb.mid)}/${fmt(bb.upper)}`);
  const c=cupEvidence(a);
  if(c){
    out.push(`☕ ${c.scale} ${c.phase} | Skor ${c.score.toFixed(0)} | Sol/Dip-Sağ ${fmt(c.leftRim)}/${fmt(c.pivot)}/${fmt(c.rightRim)} | Derinlik ${c.depthAtr.toFixed(2)} ATR`);
    if(c.handle) out.push(`↳ Kulp uç ${fmt(c.handleExtreme)} | Derinlik %${c.handleDepthPct.toFixed(0)} | Toparlanma %${c.handleRecoveryPct.toFixed(0)}`);
  } else out.push('☕ Fincan/Kulp: uygun faz yok');
  const b=butterflyEvidence(a);
  if(b){
    out.push(`🦋 ${b.direction} | Skor ${b.score.toFixed(0)} | ${b.strong?'D/PRZ AL':'PRZ AL DEĞİL'} | X/A/B/C/D ${fmt(b.X)}/${fmt(b.A)}/${fmt(b.B)}/${fmt(b.C)}/${fmt(b.D)}`);
    out.push(`↳ B/XA ${b.bXa.toFixed(3)} | C/AB ${b.cAb.toFixed(3)} | D/XA ${b.dXa.toFixed(3)} | BC ${b.bcProj.toFixed(3)} | AB=CD ${b.abcd.toFixed(3)} | D yaş ${b.dAge.toFixed(0)} | PRZ ${b.dDistanceAtr.toFixed(2)} ATR`);
  } else out.push('🦋 Butterfly: güncel geçerli D/PRZ yok');
  out.push(`FORM OR: CUP/HANDLE ${f.cupHandlePhaseAllow?'AL':'YOK'} | BUTTERFLY ${f.butterflyPrzAllow?'AL':'YOK'} | SONUÇ ${f.formationAllow?'AL':'BEKLE/VETO'}`);
  if(Array.isArray(a.reasons)&&a.reasons.length) out.push(`VETO: ${a.reasons.join(',')}`);
  if(Array.isArray(a.support)&&a.support.length) out.push(`DESTEK: ${a.support.join(',')}`);
  return out;
}
function evidenceText(a){ return evidenceLines(a).join('\n'); }

function shortSummary(a){
  if(!a||a.enabled===false) return 'AUTH OFF';
  const bb=a.bb||{}; const cup=a.cup||{}; const f=a.formation||{};
  const sideCup=String(a.side||'').toUpperCase()==='SHORT'?cup.selectedBear:cup.selectedBull;
  const cupText=sideCup&&sideCup.detected?` | CUP ${sideCup.phase}`:'';
  const bf=a.butterfly?.strong?` | ${a.butterfly.direction==='BULLISH'?'BULL':'BEAR'} BF ${n(a.butterfly.score).toFixed(0)}`:'';
  const orGate=f.formationAllow?` | FORM ${f.cupHandlePhaseAllow?'CUP':''}${f.cupHandlePhaseAllow&&f.butterflyPrzAllow?'+':''}${f.butterflyPrzAllow?'BF':''}`:' | FORM WAIT';
  return `${a.label} | BB ${String(bb.regime||'?')} P${n(bb.percentile).toFixed(0)} Z${n(bb.priceZonePct).toFixed(0)}${orGate}${cupText}${bf}`;
}

module.exports={VERSION,bollingerAt,bbRegime,cupPhase,butterflyContext,formationDecision,evaluate,shortSummary,cupEvidence,butterflyEvidence,evidenceLines,evidenceText,_internals:{percentileRank,recentSlope}};
