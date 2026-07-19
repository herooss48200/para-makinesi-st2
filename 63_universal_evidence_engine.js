/**
 * AGROS v4.9.1 — UNIVERSAL EVIDENCE ENGINE
 * Strategy-agnostic historical/exit/live evidence evaluation.
 * Evidence is isolated by strategy key; it never grants real-order authority.
 */
const ayarlar = require('./ayarlar.js');
const VERSION = 'v4.9.1-UNIVERSAL-EVIDENCE-ENGINE';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,num(v)));}
function round(v,d=2){return Number(num(v).toFixed(d));}
function evaluate({strategyType='UNKNOWN',strategyKey='',historical={},exit={},live={}}={}){
  const minHistorical=Math.max(1,num(ayarlar.evidenceWarmStartMinHistorical,5));
  const targetHistorical=Math.max(minHistorical,num(ayarlar.evidenceWarmStartTargetHistorical,20));
  const minWr=num(ayarlar.evidenceWarmStartMinWinRate,60);
  const minPf=num(ayarlar.evidenceWarmStartMinPF,1);
  const minNet=num(ayarlar.evidenceWarmStartMinNet,0);
  const minExp=num(ayarlar.evidenceWarmStartMinExpectancy,0);
  const minExitSamples=Math.max(1,num(ayarlar.evidenceWarmStartExitMinSamples,5));
  const minConfidence=num(ayarlar.evidenceWarmStartMinConfidence,60);
  const total=num(historical.total ?? historical.closed);
  const wr=num(historical.winRate);
  const pf=num(historical.profitFactor);
  const net=num(historical.net);
  const exp=num(historical.expectancy);
  const exitSamples=num(exit.samples);
  const historicalPositive=total>=minHistorical && wr>=minWr && pf>minPf && net>minNet && exp>minExp;
  const exitPositive=Boolean(exit.positive && exit.ownLabExit !== false && exitSamples>=minExitSamples && num(exit.profitFactor)>1 && num(exit.netUsdt)>0);
  const sampleScore=clamp((total/targetHistorical)*100);
  const qualityScore=clamp((wr-minWr)*2 + Math.min(30,Math.max(0,(pf-1)*15)) + Math.min(20,Math.max(0,exp*50)) + 30);
  const exitScore=exitPositive ? clamp(50 + Math.min(25,(num(exit.profitFactor)-1)*15) + Math.min(15,exitSamples) + Math.min(10,Math.max(0,num(exit.beatRate)-50)/5)) : 0;
  const liveClosed=num(live.closed);
  const livePositive=liveClosed>0 && num(live.profitFactor)>1 && num(live.net)>0 && num(live.expectancy)>0;
  const liveScore=liveClosed ? clamp((Math.min(5,liveClosed)/5)*50 + (livePositive?50:0)) : 0;
  const confidence=round(sampleScore*0.4 + qualityScore*0.3 + exitScore*0.3,1);
  const warmStartEligible=Boolean(strategyKey && historicalPositive && exitPositive && confidence>=minConfidence);
  return {version:VERSION,strategyType,strategyKey,isolatedEvidence:true,historicalPositive,exitPositive,livePositive,warmStartEligible,confidence,scores:{sample:round(sampleScore,1),quality:round(qualityScore,1),exit:round(exitScore,1),live:round(liveScore,1)},counts:{historical:total,exit:exitSamples,live:liveClosed},thresholds:{minHistorical,minWr,minPf,minNet,minExp,minExitSamples,minConfidence},realTradingAuthorized:false};
}
module.exports={VERSION,evaluate};
