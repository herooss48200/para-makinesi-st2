
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

function candleSeries(tf,count,trendStep=0.4){
  const stepMs=tf==='15m'?15*60_000:60_000;
  const end=Date.now()-stepMs;
  return Array.from({length:count},(_,i)=>{const openTime=end-(count-i)*stepMs;const base=100+i*trendStep;return{openTime,closeTime:openTime+stepMs-1,open:String(base),high:String(base+0.5),low:String(base-0.3),close:String(base+0.35),volume:'1000'};});
}

(async()=>{
  const originalFetch=ag.binanceStartupMumlariCek;
  const originalThreshold=ayarlar.startupMarketReadyOrani;
  const originalCore=ayarlar.taranacakCoinSayisi;
  const originalConcurrency=ayarlar.binanceStartupAgEszamanlilik;
  const originalWorkers=ayarlar.binanceStartupAgIsciSayisi;
  const originalLog=console.log, originalWarn=console.warn;
  try{
    rev._resetScheduleForTest();
    ayarlar.startupMarketReadyOrani=0.95;
    ayarlar.taranacakCoinSayisi=20;
    ayarlar.binanceStartupAgEszamanlilik=8;
    ayarlar.binanceStartupAgIsciSayisi=8;
    const core=Array.from({length:20},(_,i)=>`QUEUE${String(i+1).padStart(2,'0')}USDT`);
    h.state.st2CoreUniverseSymbols=[...core];h.state.semboller=[...core];h.state.sembolVeriSagligi={};h.state.startupMarketReady=false;h.state.startupMarketWarmup={};

    // Fake the real shared network queue: only 4 requests may be ACTIVE. All callers receive a
    // promise immediately; extra work waits in this queue. Under the broken R25.5 outer 35s-style
    // deadline (40ms here), workers would abandon queued promises and submit more symbols, causing
    // the queue to grow beyond the bounded 8-worker x 2-leg envelope.
    let active=0,maxActive=0,maxQueued=0,started=0,completed=0;
    const q=[];
    const pump=()=>{
      maxQueued=Math.max(maxQueued,q.length);
      while(active<4&&q.length){
        const t=q.shift(); active++; started++; maxActive=Math.max(maxActive,active);
        setTimeout(()=>{
          active--;completed++;
          const rows=t.tf==='15m'?candleSeries('15m',Math.max(30,t.limit),0.25):candleSeries('1m',Math.max(80,t.limit),0.45);
          t.resolve(rows); pump();
        },70);
      }
    };
    ag.binanceStartupMumlariCek=(sym,tf,limit,opts={})=>new Promise((resolve,reject)=>{q.push({sym,tf,limit:Number(limit),opts,resolve,reject});maxQueued=Math.max(maxQueued,q.length);pump();});
    console.log=()=>{};console.warn=()=>{};

    const startedAt=Date.now();
    const summary=await rev.derinGecmisiInsaEt({concurrency:8,workers:8,symbolDeadlineMs:40,repairSymbolDeadlineMs:40,initialRequestTimeoutMs:40,initialRequestRetries:0});
    const elapsed=Date.now()-startedAt;
    assert.strictEqual(summary.ready,true,'queue-bound startup tüm sağlıklı isteklerde READY olmalı');
    assert.strictEqual(h.state.startupMarketWarmup.islenen,20,'20 core sembol tamamlanmalı');
    assert.strictEqual(h.state.sembolVeriSagligi.mumHazir,20,'15m cache 20/20 olmalı');
    assert.strictEqual(h.state.sembolVeriSagligi.renko1mVeriHazir,20,'1m cache 20/20 olmalı');
    assert.strictEqual(maxActive,4,'shared network active concurrency 4 simülasyonu bozuldu');
    assert(maxQueued<=12,`queued request runaway: maxQueued=${maxQueued}; 8 worker x 2 leg ile 4 aktif sonrası en fazla 12 beklemeli`);
    assert.strictEqual(started,40,'ilk turda tam 40 request çalışmalı; stale duplicate/repair request oluşmamalı');
    assert.strictEqual(completed,40,'tüm ilk tur requestleri tamamlanmalı');
    assert(elapsed>=600 && elapsed<1600,`queue-bound akış beklenmeyen süre: ${elapsed}ms`);
    const src=fs.readFileSync('./revizyon.js','utf8');
    assert(!src.includes('startupDeadlineIle('),'R25.6 outer queue-wait deadline kaldırılmadı');
    assert(src.includes("startupMumCek(sym, pusuTf, pusuMumLimiti(), `START_CANDLE:${sym}`"),'15m initial request dedicated startup promiseini beklemiyor');
    assert(src.includes("startupMumCek(sym, sniperTf, renko1mBaseLimit(), `START_SNIPER:${sym}`"),'1m initial request dedicated startup promiseini beklemiyor');
    originalLog(`✅ R25.6 queue-bound behavior preserved under R25.8 cancellable dedicated startup transport | 4 active + max queued ${maxQueued} | 40/40 request complete | no stale deadline duplicates | ${elapsed}ms`);
  } finally {
    ag.binanceStartupMumlariCek=originalFetch;
    ayarlar.startupMarketReadyOrani=originalThreshold;ayarlar.taranacakCoinSayisi=originalCore;ayarlar.binanceStartupAgEszamanlilik=originalConcurrency;ayarlar.binanceStartupAgIsciSayisi=originalWorkers;
    console.log=originalLog;console.warn=originalWarn;rev._resetScheduleForTest();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
