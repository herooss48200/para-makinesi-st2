'use strict';
const assert=require('assert');
const fs=require('fs');
const ayarlar=require('./ayarlar.js');
const version=require('./versiyon.js');
const ag=require('./64_binance_network_resilience.js');

(async()=>{
  assert.strictEqual(version.botSurumu,'6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL');
  assert.strictEqual(Number(ayarlar.binanceStartupAgEszamanlilik),8);
  assert.strictEqual(Number(ayarlar.binanceStartupAgIsciSayisi),16);
  assert.strictEqual(Number(ayarlar.binanceAgTimeoutMs),15000);
  assert.strictEqual(Number(ayarlar.binanceAgRetry),2);
  assert.strictEqual(Number(ayarlar.binanceTopluVeriRetryMs),90000);
  for(const k of ['binanceStartupTimeoutMs','binanceStartupRetry','binanceStartupQueueTimeoutMs','binanceBulkRefreshTimeoutMs','binanceBulkRefreshRetry']) assert.strictEqual(ayarlar[k],undefined,`${k} must be retired`);
  const rev=fs.readFileSync('./revizyon.js','utf8');
  assert(rev.includes("mumCek(sym, pusuTf, pusuMumLimiti(), `START_CANDLE:${sym}`, 'HIGH')"),'startup must use shared proven network policy');
  assert(!rev.includes('startupAgOverrides'),'startup-specific aggressive transport must be gone');
  assert(!rev.includes('bulkAgOverrides'),'bulk-specific aggressive transport must be gone');
  const net=fs.readFileSync('./64_binance_network_resilience.js','utf8');
  assert(!net.includes('QUEUE_WAIT_TIMEOUT'),'R5 queue-expiry layer must be rolled back');
  ag._testReset();
  let attempts=0;
  const value=await ag.istekYap(async()=>{attempts++; if(attempts<=2){const e=new Error('temporary');e.code='ETIMEDOUT';throw e;}return 'OK';},{key:'R8_RETRY',label:'R8_RETRY',timeoutMs:15000,retries:2,baseDelayMs:1,maxDelayMs:2,priority:'HIGH'});
  assert.strictEqual(value,'OK'); assert.strictEqual(attempts,3);
  console.log('✅ v6.13.5-R8 transport rollback passed | shared 15s+2retry policy, no R5 queue expiry');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
