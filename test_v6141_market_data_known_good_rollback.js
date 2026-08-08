'use strict';
const assert=require('assert');
const fs=require('fs');
const version=require('./versiyon.js');
const settings=require('./ayarlar.js');

assert.strictEqual(version.botSurumu,'6.13.5-R16-PRICE-FALLBACK-FULL-CHAIN-RECOVERY');
const rev=fs.readFileSync('./revizyon.js','utf8');
const net=fs.readFileSync('./64_binance_network_resilience.js','utf8');

// R8 known-good bulk market-data architecture remains intact.
assert(!rev.includes('startupAgOverrides'),'R5 startup transport override must remain absent');
assert(!rev.includes('bulkAgOverrides'),'R5 bulk transport override must remain absent');
assert(!rev.includes('marketBulkRefreshOwner'),'R5 bulk refresh lock must remain absent');
assert(!rev.includes('eksikSembolleriOneAl'),'R6 missing-first scheduler must remain absent from rollback engine');
assert(rev.includes('function cacheHazirSayisi(cache)') && rev.includes('filter(sym => aktif.has(String(sym))).length'),'post-R4 active-universe cache accounting shim must be preserved');
assert(!net.includes('QUEUE_WAIT_TIMEOUT'),'R5 queue-expiry layer must remain absent');
assert(net.includes('keepAlive: true'),'known-good keep-alive transport must remain');
assert(net.includes("scheduling: 'lifo'"),'known-good agent scheduling must remain');
assert(net.includes('requestSpacingMs: 35'),'known-good request spacing must remain');

// R14 is the only intentional network delta: one CRITICAL overflow socket + wall-clock hard timeout.
assert(net.includes('maxSockets: DEFAULTS.concurrency + 1'),'R14 reserved critical socket missing');
assert(net.includes("nextTask?.priority >= priorityValue('CRITICAL')"),'R14 CRITICAL overflow gate missing');
assert(net.includes('HARD_TIMEOUT'),'R14 wall-clock timeout missing');

assert.strictEqual(Number(settings.binanceAgEszamanlilik),3);
assert.strictEqual(Number(settings.binanceAgIsciSayisi),8);
assert.strictEqual(Number(settings.binanceStartupAgEszamanlilik),8);
assert.strictEqual(Number(settings.binanceStartupAgIsciSayisi),16);
assert.strictEqual(Number(settings.binanceAgTimeoutMs),15000);
assert.strictEqual(Number(settings.binanceAgRetry),2);
assert.strictEqual(Number(settings.binanceTopluVeriRetryMs),90000);
assert.strictEqual(Number(settings.futuresTickerTimeoutMs),6000);
assert.strictEqual(Number(settings.futuresTickerRetry),0);
console.log('✅ v6.13.5-R16 network baseline passed | R8 bulk semantics preserved + reserved CRITICAL slot + wall-clock deadline');
