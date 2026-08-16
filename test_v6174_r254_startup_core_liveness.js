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

function candleSeries(tf, count, trendStep=0.4){
  const stepMs = tf==='15m' ? 15*60_000 : 60_000;
  const end = Date.now() - stepMs;
  return Array.from({length:count},(_,i)=>{
    const openTime=end-(count-i)*stepMs;
    const base=100+i*trendStep;
    return {openTime,closeTime:openTime+stepMs-1,open:String(base),high:String(base+0.5),low:String(base-0.3),close:String(base+0.35),volume:'1000'};
  });
}

(async()=>{
  const originalFetch = ag.binanceMumlariCek;
  const originalThreshold = ayarlar.startupMarketReadyOrani;
  const originalCore = ayarlar.taranacakCoinSayisi;
  const originalStartupConcurrency = ayarlar.binanceStartupAgEszamanlilik;
  const originalStartupWorkers = ayarlar.binanceStartupAgIsciSayisi;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs=[];
  try {
    rev._resetScheduleForTest();
    ayarlar.startupMarketReadyOrani=0.95;
    ayarlar.taranacakCoinSayisi=20;
    ayarlar.binanceStartupAgEszamanlilik=4;
    ayarlar.binanceStartupAgIsciSayisi=8;

    const core=Array.from({length:20},(_,i)=>`CORE${String(i+1).padStart(2,'0')}USDT`);
    const extras=['OLDPOS1USDT','OLDPOS2USDT','OLDPOS3USDT'];
    const hang=core[19];
    h.state.st2CoreUniverseSymbols=[...core];
    h.state.semboller=[...core,...extras];
    h.state.sembolVeriSagligi={};
    h.state.startupMarketReady=false;
    h.state.startupMarketWarmup={};

    const calls=[];
    ag.binanceMumlariCek=async (sym,tf,limit)=>{
      calls.push({sym,tf,limit:Number(limit)});
      // Initial 80-candle 1m call for one core symbol never resolves.
      // R25.4 must deadline it, finish the first pass and recover it in 240-candle repair.
      if(sym===hang && tf==='1m' && Number(limit)<=80) return new Promise(resolve=>setTimeout(()=>resolve(candleSeries('1m',80,0.45)),1000));
      if(tf==='15m') return candleSeries('15m',Math.max(30,Number(limit)||30),0.25);
      return candleSeries('1m',Math.max(80,Number(limit)||80),0.45);
    };
    console.log=(...a)=>logs.push(a.join(' '));
    console.warn=(...a)=>logs.push(a.join(' '));

    const started=Date.now();
    const summary=await rev.derinGecmisiInsaEt({concurrency:4,workers:8,symbolDeadlineMs:40,repairSymbolDeadlineMs:200});
    const elapsed=Date.now()-started;

    assert(elapsed<3000,`asılı sembol startupı bloke etti: ${elapsed}ms`);
    assert.strictEqual(summary.total,20,'startup denominator yalnız 20 core sembol olmalı');
    assert.strictEqual(summary.protectionExtra,3,'restart koruma ekstra sembolleri ayrı tutulmalı');
    assert.strictEqual(summary.ready,true,'derin onarım sonrası gate açılmalı');
    assert(summary.derinOnarimToplam>=1,'asılı/yetersiz sembol derin onarıma girmeli');
    assert.strictEqual(h.state.startupMarketWarmup.islenen,20,'deadline olan sembol de ilk turda tamamlanmış sayılmalı');
    assert.strictEqual(h.state.startupMarketWarmup.toplam,20,'warmup toplamı core evren olmalı');
    assert.strictEqual(h.state.sembolVeriSagligi.secilen,20,'panel readiness denominatorü core evren olmalı');
    assert.strictEqual(h.state.sembolVeriSagligi.hata,0,'başarıyla onarılan ilk-tur hata final hata olarak kalmamalı');
    assert(extras.every(sym=>h.state.semboller.includes(sym)),'koruma-extra sembolleri core warmup sonunda canlı sembol listesinden düşmemeli');
    assert.strictEqual(h.state.renko1mStHazirlik[hang]?.ready,true,'deadline sembolü 240/480 repair ile geri kazanılmalı');
    assert(!calls.some(x=>extras.includes(x.sym)),'koruma-extra sembolleri startup core candle fetchine girmemeli');
    assert(calls.some(x=>x.sym===hang && x.tf==='1m' && x.limit>=Number(ayarlar.renkoOnayDerinOnarimMumLimiti)),'deadline sembolü derin 1m repair görmedi');
    assert(logs.some(x=>x.includes('[STARTUP SYMBOL DEADLINE]')),'deadline observability logu yok');
    assert(logs.some(x=>x.includes('[1m RENKO ST DERİN ONARIM]')),'derin onarım logu yok');
    assert(logs.some(x=>x.includes('[1m RENKO ST DERİN ONARIM SONUÇ]')),'repair sonrası gate/coverage kanıtı yok');

    const marketSrc=fs.readFileSync('./3_piyasa.js','utf8');
    const revSrc=fs.readFileSync('./revizyon.js','utf8');
    assert(marketSrc.includes('st2CoreUniverseSymbols'),'core universe snapshot yok');
    assert(marketSrc.includes('st2ProtectionExtraSymbols'),'protection extra ayrımı yok');
    assert(revSrc.includes('STARTUP_SYMBOL_DEADLINE'),'per-symbol startup deadline yok');
    assert(revSrc.includes('startupCoreSymbols()'),'startup core universe authority yok');

    originalLog('✅ R25.4 startup core liveness passed | 200-core authority + protection-extra isolation + hung-symbol deadline + 240/480 repair + final error truth');
  } finally {
    ag.binanceMumlariCek=originalFetch;
    ayarlar.startupMarketReadyOrani=originalThreshold;
    ayarlar.taranacakCoinSayisi=originalCore;
    ayarlar.binanceStartupAgEszamanlilik=originalStartupConcurrency;
    ayarlar.binanceStartupAgIsciSayisi=originalStartupWorkers;
    console.log=originalLog;
    console.warn=originalWarn;
    rev._resetScheduleForTest();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
