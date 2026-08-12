'use strict';
const assert=require('assert');
const fs=require('fs');
const version=require('./versiyon.js');
const settings=require('./ayarlar.js');

assert.strictEqual(version.botSurumu,'6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL');
const rev=fs.readFileSync('./revizyon.js','utf8');
const net=fs.readFileSync('./64_binance_network_resilience.js','utf8');
assert(!rev.includes('startupAgOverrides'),'R5 startup transport override must remain absent');
assert(!rev.includes('bulkAgOverrides'),'R5 bulk transport override must remain absent');
assert(!rev.includes('marketBulkRefreshOwner'),'R5 bulk refresh lock must remain absent');
assert(!rev.includes('eksikSembolleriOneAl'),'R6 missing-first scheduler must remain absent from rollback engine');
assert(rev.includes('function cacheHazirSayisi(cache)') && rev.includes('filter(sym => aktif.has(String(sym))).length'),'post-R4 active-universe cache accounting shim must be preserved');

// R12 live-liveness recovery intentionally isolates the control-plane ticker without changing
// the known-good bulk KLINE retry/spacing/cache semantics.
assert(net.includes('timeoutMs: 15000') && net.includes('retries: 2') && net.includes('concurrency: 3'),'R8 bulk defaults must stay intact');
assert(net.includes("return kuyrukluIstek(key, () => httpsJson(url"),'KLINE requests must stay on the shared bounded queue');
assert(net.includes('const criticalTickerAgent = new https.Agent'),'dedicated ticker agent missing');
const tickerBlock=net.slice(net.indexOf('function binanceFiyatlariCek'),net.indexOf('async function havuzdaCalistir'));
assert(tickerBlock.includes('agent: criticalTickerAgent'),'global ticker must use dedicated agent');
assert(!tickerBlock.includes("kuyrukluIstek('TICKER:ALL'"),'global ticker must not share bulk KLINE queue');
assert(net.includes('HARD_TIMEOUT'),'socket-wait-inclusive wall clock deadline missing');

assert.strictEqual(Number(settings.binanceAgEszamanlilik),3);
assert.strictEqual(Number(settings.binanceAgIsciSayisi),8);
assert.strictEqual(Number(settings.binanceStartupAgEszamanlilik),8);
assert.strictEqual(Number(settings.binanceStartupAgIsciSayisi),16);
assert.strictEqual(Number(settings.binanceAgTimeoutMs),15000);
assert.strictEqual(Number(settings.binanceAgRetry),2);
assert.strictEqual(Number(settings.binanceTopluVeriRetryMs),90000);
assert.strictEqual(Number(settings.futuresTickerRetry),0);
assert(Number(settings.futuresTickerTimeoutMs)<=6000);
console.log('✅ v6.13.5-R17 market-data contract passed | R8 bulk semantics preserved + dedicated fail-fast ticker isolation');
