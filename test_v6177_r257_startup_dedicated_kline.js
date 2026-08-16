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

function candles(tf,count,step=0.45){
  const ms=tf==='15m'?900000:60000; const end=Date.now()-ms;
  return Array.from({length:count},(_,i)=>{const openTime=end-(count-i)*ms;const b=100+i*step;return{openTime,closeTime:openTime+ms-1,open:String(b),high:String(b+0.6),low:String(b-0.4),close:String(b+0.35),volume:'1000'};});
}

(async()=>{
  assert.strictEqual(version.botSurumu,'6.13.5-R25.9-BOOTSTRAP-RECONCILE-DECOUPLED-N5-20SLOT-20USDT');
  const originalStartup=ag.binanceStartupMumlariCek;
  const originalShared=ag.binanceMumlariCek;
  const originalThreshold=ayarlar.startupMarketReadyOrani;
  const originalCore=ayarlar.taranacakCoinSayisi;
  const originalNet=ayarlar.binanceStartupNetworkConcurrency;
  const originalWorkers=ayarlar.binanceStartupAgIsciSayisi;
  const log=console.log,warn=console.warn;
  try{
    rev._resetScheduleForTest();
    ayarlar.startupMarketReadyOrani=0.95; ayarlar.taranacakCoinSayisi=20;
    ayarlar.binanceStartupNetworkConcurrency=8; ayarlar.binanceStartupAgIsciSayisi=8;
    const core=Array.from({length:20},(_,i)=>`DED${String(i+1).padStart(2,'0')}USDT`);
    h.state.st2CoreUniverseSymbols=[...core]; h.state.semboller=[...core]; h.state.sembolVeriSagligi={};
    h.state.startupMarketReady=false; h.state.startupMarketWarmup={};
    let sharedCalls=0,startupCalls=0,active=0,peak=0;
    ag.binanceMumlariCek=async()=>{sharedCalls++;throw new Error('SHARED_QUEUE_MUST_NOT_BE_USED_BY_STARTUP');};
    ag.binanceStartupMumlariCek=async(sym,tf,limit,opts={})=>{
      startupCalls++; active++; peak=Math.max(peak,active);
      await new Promise(r=>setTimeout(r,8)); active--;
      return candles(tf,Math.max(tf==='15m'?30:80,Number(limit)||80));
    };
    console.log=()=>{};console.warn=()=>{};
    const summary=await rev.derinGecmisiInsaEt({concurrency:8,workers:8});
    assert.strictEqual(summary.ready,true,'dedicated startup transport gate READY olmalı');
    assert.strictEqual(sharedCalls,0,'startup shared Binance KLINE queue kullanmamalı');
    assert.strictEqual(startupCalls,40,'20 core x 15m+1m = 40 dedicated request olmalı');
    assert(peak<=8 && peak>=4,`R25.8 worker/socket bounded dedicated request envelope beklenmiyor: peak=${peak}`);
    assert.strictEqual(h.state.sembolVeriSagligi.mumHazir,20);
    assert.strictEqual(h.state.sembolVeriSagligi.renko1mStHazir,20);

    const netSrc=fs.readFileSync('./64_binance_network_resilience.js','utf8');
    const revSrc=fs.readFileSync('./revizyon.js','utf8');
    assert(netSrc.includes('const startupKlineAgent = new https.Agent'),'dedicated startup HTTPS agent yok');
    assert(netSrc.includes("req.once('socket', startHardTimer)"),'HTTP hard timeout socket assignment sonrası başlamıyor');
    const beforeSocket=netSrc.slice(netSrc.indexOf('function httpsJson'),netSrc.indexOf("req.once('socket', startHardTimer)"));
    assert(!beforeSocket.includes('startHardTimer();'),'hard timeout socket assignment öncesinde tetikleniyor');
    assert(revSrc.includes('ag.binanceStartupMumlariCek'),'revizyon dedicated startup fetch kullanmıyor');
    assert(!revSrc.includes("ag.configure({ concurrency: startupNetworkConcurrency })"),'startup shared queue concurrency değiştirmemeli');
    log(`✅ R25.8 dedicated startup KLINE preserved | shared calls 0 | dedicated 40/40 | peak ${peak} | socket-bound timeout`);
  } finally {
    ag.binanceStartupMumlariCek=originalStartup; ag.binanceMumlariCek=originalShared;
    ayarlar.startupMarketReadyOrani=originalThreshold; ayarlar.taranacakCoinSayisi=originalCore;
    ayarlar.binanceStartupNetworkConcurrency=originalNet; ayarlar.binanceStartupAgIsciSayisi=originalWorkers;
    console.log=log;console.warn=warn;rev._resetScheduleForTest();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
