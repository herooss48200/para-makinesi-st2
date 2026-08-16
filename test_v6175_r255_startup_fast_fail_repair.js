'use strict';
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request,parent,isMain){
  if(request==='dotenv') return {config:()=>({parsed:{}})};
  if(request==='binance-api-node') return {default:()=>({})};
  return originalLoad.call(this,request,parent,isMain);
};
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const ag = require('./64_binance_network_resilience.js');
const rev = require('./revizyon.js');

function candleSeries(tf,count,trendStep=0.4){
  const stepMs=tf==='15m'?15*60_000:60_000;
  const end=Date.now()-stepMs;
  return Array.from({length:count},(_,i)=>{
    const openTime=end-(count-i)*stepMs;
    const base=100+i*trendStep;
    return {openTime,closeTime:openTime+stepMs-1,open:String(base),high:String(base+0.5),low:String(base-0.3),close:String(base+0.35),volume:'1000'};
  });
}

(async()=>{
  const originalFetch=ag.binanceStartupMumlariCek;
  const originalThreshold=ayarlar.startupMarketReadyOrani;
  const originalCore=ayarlar.taranacakCoinSayisi;
  const originalStartupConcurrency=ayarlar.binanceStartupAgEszamanlilik;
  const originalStartupWorkers=ayarlar.binanceStartupAgIsciSayisi;
  const originalLog=console.log;
  const originalWarn=console.warn;
  const logs=[];
  try {
    rev._resetScheduleForTest();
    ayarlar.startupMarketReadyOrani=0.95;
    ayarlar.taranacakCoinSayisi=20;
    ayarlar.binanceStartupAgEszamanlilik=4;
    ayarlar.binanceStartupAgIsciSayisi=4;

    const core=Array.from({length:20},(_,i)=>`FAST${String(i+1).padStart(2,'0')}USDT`);
    const hang15=core[18];
    const hang1m=core[19];
    h.state.st2CoreUniverseSymbols=[...core];
    h.state.semboller=[...core];
    h.state.sembolVeriSagligi={};
    h.state.startupMarketReady=false;
    h.state.startupMarketWarmup={};

    const calls=[];
    ag.binanceStartupMumlariCek=async (sym,tf,limit,opts={})=>{
      calls.push({sym,tf,limit:Number(limit),opts:{...opts}});
      if(sym===hang15 && tf==='15m' && String(opts.label||'').startsWith('START_CANDLE:')) {
        const err=new Error('ACTIVE_15M_TIMEOUT'); err.code='ETIMEDOUT';
        return new Promise((_,reject)=>setTimeout(()=>reject(err),50));
      }
      if(sym===hang1m && tf==='1m' && Number(limit)<=80) {
        const err=new Error('ACTIVE_1M_TIMEOUT'); err.code='ETIMEDOUT';
        return new Promise((_,reject)=>setTimeout(()=>reject(err),50));
      }
      if(tf==='15m') return candleSeries('15m',Math.max(30,Number(limit)||30),0.25);
      return candleSeries('1m',Math.max(80,Number(limit)||80),0.45);
    };
    console.log=(...a)=>logs.push(a.join(' '));
    console.warn=(...a)=>logs.push(a.join(' '));

    const started=Date.now();
    const summary=await rev.derinGecmisiInsaEt({
      concurrency:4,workers:4,
      initialRequestTimeoutMs:1200,initialRequestRetries:0,initialRequestRetryBaseMs:111,
      repairRequestTimeoutMs:1400,repairRequestRetries:1,repairRequestRetryBaseMs:222
    });
    const elapsed=Date.now()-started;

    assert(elapsed<3000,`fast-fail startup bloke oldu: ${elapsed}ms`);
    assert.strictEqual(summary.ready,true,'15m + 1m repair sonrası gate açılmalı');
    assert(summary.pusuOnarimToplam>=1,'15m ilk-tur başarısızlığı repair kapsamına girmeli');
    assert(summary.derinOnarimToplam>=1,'1m ilk-tur başarısızlığı derin repair kapsamına girmeli');
    assert(h.state.yerelPusuHafizasi[hang15]?.length>=20,'15m eksik sembol repair ile geri kazanılmadı');
    assert.strictEqual(h.state.renko1mStHazirlik[hang1m]?.ready,true,'1m eksik sembol derin repair ile geri kazanılmadı');

    const initial=calls.find(x=>x.tf==='1m' && x.limit<=80 && String(x.opts.label||'').startsWith('START_SNIPER:'));
    assert(initial,'initial 1m call bulunamadı');
    assert.strictEqual(Number(initial.opts.timeoutMs),1200,'initial startup timeout override bağlanmadı');
    assert.strictEqual(Number(initial.opts.retries),0,'initial startup retry hızlı fail olmalı');

    const repair15=calls.find(x=>x.sym===hang15 && x.tf==='15m' && String(x.opts.label||'').startsWith('START_15M_REPAIR:'));
    assert(repair15,'15m repair çağrısı yok');
    assert.strictEqual(Number(repair15.opts.timeoutMs),1400,'repair timeout override bağlanmadı');
    assert.strictEqual(Number(repair15.opts.retries),1,'repair retry bütçesi korunmadı');

    const src=fs.readFileSync('./revizyon.js','utf8');
    const cfg=fs.readFileSync('./ayarlar.js','utf8');
    assert(src.includes('[15m STARTUP ONARIM]'),'15m startup repair gözlemlenebilirliği yok');
    assert(src.includes('initialRequestOptions'),'initial fast-fail request policy yok');
    assert(src.includes('repairRequestOptions'),'repair request policy yok');
    assert(cfg.includes('binanceStartupRequestRetry: 0'),'production initial startup retry 0 değil');
    assert(!src.includes('startupDeadlineIle('),'queue-wait outer deadline R25.8 içinde kalmamalı');
    assert(cfg.includes('cancellable symbol deadline'),'R25.8 cancellable startup config açıklaması yok');
    assert(logs.some(x=>x.includes('[15m STARTUP ONARIM]')),'15m repair logu üretilmedi');
    assert(logs.some(x=>x.includes('[1m RENKO ST DERİN ONARIM]')),'1m repair logu üretilmedi');

    originalLog('✅ R25.5 repair behavior preserved under R25.8 | active-request timeout + 15m repair + 1m 240/480 repair + 200-core fail-forward');
  } finally {
    ag.binanceStartupMumlariCek=originalFetch;
    ayarlar.startupMarketReadyOrani=originalThreshold;
    ayarlar.taranacakCoinSayisi=originalCore;
    ayarlar.binanceStartupAgEszamanlilik=originalStartupConcurrency;
    ayarlar.binanceStartupAgIsciSayisi=originalStartupWorkers;
    console.log=originalLog;
    console.warn=originalWarn;
    rev._resetScheduleForTest();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
