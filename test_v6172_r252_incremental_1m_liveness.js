'use strict';
const assert=require('assert');
const fs=require('fs');
const Module=require('module');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(request==='dotenv') return {config:()=>({parsed:{}})};
  if(request==='binance-api-node') return {default:()=>({})};
  return originalLoad.call(this,request,parent,isMain);
};
const version=require('./versiyon.js');
const ayarlar=require('./ayarlar.js');
const ag=require('./64_binance_network_resilience.js');
const h=require('./1_hafiza.js');
const rev=require('./revizyon.js');

function candle(closeTime, close=100){
  return {openTime:closeTime-59999,closeTime,open:String(close-0.05),high:String(close+0.08),low:String(close-0.08),close:String(close),volume:'100'};
}

(async()=>{
  assert(version.botSurumu.includes('R25.3-PREMIER-SELECTION-RECOVERY'));
  assert.strictEqual(Number(ayarlar.binanceAgEszamanlilik),3);
  assert.strictEqual(Number(ayarlar.binanceStartupNetworkConcurrency),4);
  assert.strictEqual(Number(ayarlar.renkoOnayRefreshRetry),0);
  assert(Number(ayarlar.renkoOnayRefreshTimeoutMs)<=6000);
  const src=fs.readFileSync('./revizyon.js','utf8');
  const bot=fs.readFileSync('./bot.js','utf8');
  assert(src.includes('function mumSerisiBirlestir'));
  assert(src.includes('renko1mIncrementalFetchLimit'));
  assert(src.includes("priority: 'LOW'"));
  assert(src.includes('requestRetries: Math.max(0, Number(ayarlar.renkoOnayRefreshRetry ?? 0))'));
  assert(src.includes('if (options.networkConcurrency != null) ag.configure'));
  assert(bot.includes('ready: () => true'));

  rev._resetScheduleForTest();
  const now=Date.now();
  const sym='R252TESTUSDT';
  h.state.semboller=[sym];
  h.state.yerelPusuHafizasi={ [sym]: Array.from({length:40},(_,i)=>candle(now-(40-i)*900000,100+i*0.01)) };
  h.state.sniperMumlar={ [sym]: Array.from({length:240},(_,i)=>candle(now-(240-i)*60000,100+i*0.5)) };
  h.state.renko1mStHazirlik={ [sym]: {ready:true,sourceLimit:240,sourceCloseTime:h.state.sniperMumlar[sym].at(-1).closeTime} };
  h.state.renko1mStCache={};
  h.state.startupMarketReady=true;
  h.state.sembolVeriSagligi={};
  const original=ag.binanceMumlariCek;
  const limits=[];
  try{
    ag.binanceMumlariCek=async (_s,tf,limit)=>{
      limits.push({tf,limit});
      if(tf==='1m') return Array.from({length:Number(limit)},(_,i)=>candle(now-(Number(limit)-i-1)*60000,220+i*0.5));
      return h.state.yerelPusuHafizasi[sym];
    };
    const out=await rev.superTrendHesapla(false,{skipTrend:true,priority:'LOW',requestTimeoutMs:1000,requestRetries:0});
    assert.strictEqual(out.skipped,false);
    const one=limits.find(x=>x.tf==='1m');
    assert(one,'1m refresh request missing');
    assert(one.limit<=Number(ayarlar.renkoOnayIncrementalMumMax),'periodic refresh must use bounded incremental window');
    assert(!limits.some(x=>x.tf==='1m' && x.limit>=Number(ayarlar.renkoOnayDerinOnarimMumLimiti)),'healthy periodic refresh must not refetch full 240/480 history');
    assert(h.state.sniperMumlar[sym].length>=200,'existing deep history must be preserved/merged');
  } finally { ag.binanceMumlariCek=original; rev._resetScheduleForTest(); }
  console.log('✅ R25.2 incremental 1m liveness passed | small refresh window + preserved history + startup-visible panel');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
