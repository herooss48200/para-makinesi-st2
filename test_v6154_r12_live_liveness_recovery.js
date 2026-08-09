'use strict';
const assert=require('assert');
const fs=require('fs');
const https=require('https');
const {EventEmitter}=require('events');
const version=require('./versiyon.js');
const settings=require('./ayarlar.js');
const ag=require('./64_binance_network_resilience.js');

(async()=>{
  assert.strictEqual(version.botSurumu,'6.13.5-R12-RENKO-1M-ST-READINESS-ENTRY-FUNNEL');
  const bot=fs.readFileSync('./bot.js','utf8');
  const rev=fs.readFileSync('./revizyon.js','utf8');
  const report=fs.readFileSync('./2_rapor.js','utf8');
  const renko=fs.readFileSync('./72_st2_renko_entry.js','utf8');
  const pos=fs.readFileSync('./4_pozisyon.js','utf8');

  assert(bot.includes('[ST2 MAIN LOOP WATCHDOG]'),'main-loop stage watchdog missing');
  assert(bot.includes("donguAsama = 'FUTURES_PRICES'") && bot.includes("donguAsama = 'POSITION_PROTECTION'") && bot.includes("donguAsama = 'RENKO_SCAN'"),'main-loop stage truth missing');
  assert(bot.includes("const st2StartupBos = ayarlar.entryStrategyMode === 'ST2_RENKO' && h.state.startupMarketReady !== true && h.state.aktifPozisyonlar.length === 0"),'empty startup ticker bypass missing');
  assert(bot.includes("h.state.st2FirstScanCompleted = true"),'first-scan completion state missing');
  assert(report.includes('READY/FIRST_SCAN_PENDING'),'panel must distinguish cache READY from first Renko audit');

  const finallyBlock=rev.slice(rev.indexOf('} finally {',rev.indexOf('async function derinGecmisiInsaEt')),rev.indexOf('async function pusuVerileriniTazele'));
  assert(!finallyBlock.includes('periyodikTazelemeyiBaslat();'),'bulk refresh must not start before first Renko audit');
  const firstAudit=bot.indexOf('ST2 İLK TARAMA TAMAMLANDI');
  const coreStart=bot.indexOf('revizyon.periyodikTazelemeyiBaslat()',firstAudit);
  const shadowStart=bot.indexOf('revizyon.st1ShadowTazelemeyiBaslat()',firstAudit);
  assert(firstAudit>0 && coreStart>firstAudit && shadowStart>coreStart,'first audit must precede core and ST1-shadow refresh scheduling');
  assert.strictEqual(settings.st1ShadowPeriyodikAktif,true);
  assert.strictEqual(Number(settings.st1ShadowIstekRetry),0);
  assert.strictEqual(Number(settings.futuresTickerRetry),0);
  assert(Number(settings.futuresTickerTimeoutMs)<=6000);

  assert(renko.includes('williamsCycleShadow.update(sym, bricks, { persist: false })'),'Williams must be RAM-only inside 200-symbol scan');
  assert(renko.includes('williamsCycleShadow.scheduleFlush()'),'Williams batched flush missing');
  assert(pos.includes('renkoEntryConfirmationShadowTelegramArkaPlan'),'shadow Telegram nonblocking helper missing');

  // Dynamic proof: a hung LOW KLINE task cannot block the dedicated control-plane ticker.
  ag._testReset();
  ag.configure({concurrency:1});
  let releaseLow;
  const low=ag.kuyrukluIstek('LIVENESS_LOW_HANG',()=>new Promise(resolve=>{releaseLow=resolve;}),{priority:'LOW',retries:0});
  await new Promise(r=>setTimeout(r,20));
  const original=https.request;
  let seenAgent=null;
  https.request=function fakeTicker(url,options,cb){
    seenAgent=options.agent;
    const req=new EventEmitter();
    req.setTimeout=()=>req;
    req.destroy=err=>setImmediate(()=>req.emit('error',err));
    req.end=()=>{
      const res=new EventEmitter(); res.statusCode=200; res.headers={};
      setImmediate(()=>{cb(res);res.emit('data',Buffer.from('[{"symbol":"BTCUSDT","price":"123.45"}]'));res.emit('end');});
    };
    return req;
  };
  let prices;
  try{
    prices=await Promise.race([
      ag.binanceFiyatlariCek({timeoutMs:1000,retries:0,cacheTtlMs:0,label:'LIVENESS_TICKER'}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('DEDICATED_TICKER_BLOCKED')),400))
    ]);
  }finally{https.request=original;}
  assert.strictEqual(prices.BTCUSDT,'123.45');
  assert.strictEqual(seenAgent,ag._criticalTickerAgent);
  releaseLow('DONE'); await low; ag._testReset();

  console.log('✅ v6.13.5-R12 live liveness recovery passed | first audit isolated + dedicated ticker + batched Williams + nonblocking shadow TG');
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
