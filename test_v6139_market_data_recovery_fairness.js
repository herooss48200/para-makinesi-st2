'use strict';
const assert = require('assert');
const fs = require('fs');
const Module = require('module');

function candles(tfMs,count,base=100){
  const start=Date.now()-tfMs*(count+2);
  return Array.from({length:count},(_,i)=>{const open=base+(i*0.25);const close=open+0.20;return {openTime:start+i*tfMs,closeTime:start+(i+1)*tfMs-1,open:String(open),high:String(close+0.15),low:String(open-0.15),close:String(close),volume:'1'};});
}

(async()=>{
  const source=fs.readFileSync('./revizyon.js','utf8');
  assert(!source.includes('marketStartupRepairRounds'), 'R6 repair scheduler must be retired with R5 engine');
  assert(!source.includes('recoveryMode'), 'R6 missing-first scheduler must not remain active');

  const ayarlar={
    entryStrategyMode:'ST2_RENKO',renkoKaynakPeriyodu:'15m',pusuPeriyodu:'15m',sniperPeriyodu:'1m',superTrendPeriyodu:'3m',
    bollingerperiod:20,renkoKaynakMumLimiti:250,renkoOnayAtrPeriod:14,superTrendPeriod:10,startupMarketReadyOrani:.95,
    binanceAgEszamanlilik:3,binanceAgIsciSayisi:8,binanceStartupAgEszamanlilik:8,binanceStartupAgIsciSayisi:16,
    binanceAgTimeoutMs:15000,binanceAgRetry:2,binanceAgRetryTabanMs:1,kapanmisMumYayinGecikmesiMs:3000,binanceTopluVeriRetryMs:90000,taranacakCoinSayisi:200
  };
  const symbols=['AAAUSDT','BBBUSDT','CCCUSDT','DDDUSDT'];
  const h={state:{semboller:symbols,yerelPusuHafizasi:{},sonPusuMumZamani:{},sniperMumlar:{},sniperCanliMumlar:{},sniperSuperTrend:{},sniperSuperTrendCanli:{},trendMumlar:{},trendCanliMumlar:{},trendSuperTrend:{},trendSuperTrendCanli:{},canliFiyatlar:{},startupMarketReady:false,startupMarketWarmup:{},sembolVeriSagligi:{}}};
  let calls=0;
  const ag={configure(){},configureStartup(){},async binanceMumlariCek(sym,tf,limit){calls++; const ms=tf==='15m'?900000:tf==='3m'?180000:60000; return candles(ms,Number(limit),100);},async binanceStartupMumlariCek(sym,tf,limit){calls++; const ms=tf==='15m'?900000:tf==='3m'?180000:60000; return candles(ms,Number(limit),100);},async havuzdaCalistir(items,worker){const out=[];for(const item of items){try{out.push({ok:true,value:await worker(item)});}catch(error){out.push({ok:false,error});}}return out;}};
  const motor={hesaplaSuperTrend:()=>({trend:'UP',value:1})};
  const original=Module._load;
  Module._load=function(req,parent,isMain){if(parent?.filename?.endsWith('revizyon.js')){if(req==='./ayarlar.js')return ayarlar;if(req==='./1_hafiza.js')return h;if(req==='./motor.js')return motor;if(req==='./64_binance_network_resilience.js')return ag;}return original.apply(this,arguments);};
  let rev;
  try{delete require.cache[require.resolve('./revizyon.js')];rev=require('./revizyon.js');}finally{Module._load=original;}
  const r=await rev.derinGecmisiInsaEt({concurrency:4,workers:8});
  assert.strictEqual(r.ready,true,'known-good startup must open gate with healthy data');
  assert.strictEqual(calls,symbols.length*2,'known-good startup must make exactly two core history calls per symbol');
  assert.strictEqual(h.state.sembolVeriSagligi.mumHata,0);
  assert.strictEqual(h.state.sembolVeriSagligi.superTrendHata,0);
  rev._resetScheduleForTest();
  console.log('✅ v6.13.5-R8 known-good startup passed | full core load + fail-closed accounting');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
