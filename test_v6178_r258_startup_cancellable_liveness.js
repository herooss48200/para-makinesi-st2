
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
const ayarlar=require('./ayarlar.js');
const h=require('./1_hafiza.js');
const ag=require('./64_binance_network_resilience.js');
const rev=require('./revizyon.js');
const version=require('./versiyon.js');
function candles(tf,count){const ms=tf==='15m'?900000:60000,end=Date.now()-ms;return Array.from({length:count},(_,i)=>{const t=end-(count-i)*ms,b=100+i*.5;return{openTime:t,closeTime:t+ms-1,open:String(b),high:String(b+.7),low:String(b-.4),close:String(b+.4),volume:'1000'};});}
(async()=>{
  assert.strictEqual(version.botSurumu,'6.13.5-R25.8-STARTUP-CANCELLABLE-LIVENESS-N5-20SLOT-20USDT');
  assert.strictEqual(Number(ayarlar.binanceStartupNetworkConcurrency),4);
  assert.strictEqual(Number(ayarlar.binanceStartupAgIsciSayisi),4);
  const originalStartup=ag.binanceStartupMumlariCek, originalShared=ag.binanceMumlariCek;
  const saved={core:ayarlar.taranacakCoinSayisi,ratio:ayarlar.startupMarketReadyOrani,deadline:ayarlar.binanceStartupSymbolDeadlineMs,repairDeadline:ayarlar.binanceStartupRepairSymbolDeadlineMs};
  const log=console.log,warn=console.warn;
  try{
    rev._resetScheduleForTest(); ayarlar.taranacakCoinSayisi=8; ayarlar.startupMarketReadyOrani=.75; ayarlar.binanceStartupSymbolDeadlineMs=1000; ayarlar.binanceStartupRepairSymbolDeadlineMs=1000;
    const core=Array.from({length:8},(_,i)=>`ABT${i+1}USDT`); h.state.st2CoreUniverseSymbols=[...core]; h.state.semboller=[...core]; h.state.sembolVeriSagligi={}; h.state.startupMarketReady=false; h.state.startupMarketWarmup={};
    let shared=0,active=0,peak=0,aborted=0,hungOnce=false,calls=0;
    ag.binanceMumlariCek=async()=>{shared++;throw new Error('SHARED_NOT_ALLOWED');};
    ag.binanceStartupMumlariCek=(sym,tf,limit,opts={})=>{
      calls++; active++; peak=Math.max(peak,active);
      if(!hungOnce && sym===core[0] && tf==='15m'){
        hungOnce=true;
        return new Promise((resolve,reject)=>{
          const signal=opts.signal;
          const done=(err)=>{active--; if(err) reject(err); else resolve(candles(tf,Math.max(30,Number(limit)||80)));};
          if(signal?.aborted){aborted++; const e=new Error('ABORTED');e.code='EABORTED';return done(e);}
          signal?.addEventListener('abort',()=>{aborted++;const e=new Error('ABORTED');e.code='EABORTED';done(e);},{once:true});
        });
      }
      return new Promise(r=>setTimeout(()=>{active--;r(candles(tf,Math.max(tf==='15m'?30:80,Number(limit)||80)));},15));
    };
    console.log=()=>{}; console.warn=()=>{};
    const t=Date.now(); const summary=await rev.derinGecmisiInsaEt({concurrency:8,workers:8,symbolDeadlineMs:1000,repairSymbolDeadlineMs:1000}); const elapsed=Date.now()-t;
    assert.strictEqual(shared,0); assert(aborted>=1,'hung startup request signal ile abort edilmedi'); assert(peak<=8,`caller envelope 8 üstüne çıktı: ${peak}`); assert(elapsed<5000,`cancellable startup liveness çok yavaş: ${elapsed}ms`); assert(summary.pusuHazir>=6); assert(summary.trendHazir>=6);
    const netSrc=fs.readFileSync('./64_binance_network_resilience.js','utf8'), revSrc=fs.readFileSync('./revizyon.js','utf8');
    assert(netSrc.includes("signal.addEventListener('abort'"),'HTTPS abort signal desteği yok'); assert(netSrc.includes("err.code = 'EABORTED'"),'abort error authority yok'); assert(revSrc.includes('startupAbortController'),'symbol abort controller yok'); assert(revSrc.includes('[STARTUP LIVENESS]'),'10sn startup liveness kanıtı yok');
    log(`✅ R25.8 cancellable startup liveness passed | hung request aborted ${aborted} | peak caller ${peak} | shared ${shared} | ${elapsed}ms`);
  } finally {ag.binanceStartupMumlariCek=originalStartup;ag.binanceMumlariCek=originalShared;ayarlar.taranacakCoinSayisi=saved.core;ayarlar.startupMarketReadyOrani=saved.ratio;ayarlar.binanceStartupSymbolDeadlineMs=saved.deadline;ayarlar.binanceStartupRepairSymbolDeadlineMs=saved.repairDeadline;console.log=log;console.warn=warn;rev._resetScheduleForTest();}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
