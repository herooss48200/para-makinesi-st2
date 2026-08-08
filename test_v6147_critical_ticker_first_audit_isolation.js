'use strict';
const assert = require('assert');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');
const ag = require('./64_binance_network_resilience.js');
const version = require('./versiyon.js');
const ayarlar = require('./ayarlar.js');

(async () => {
  assert.strictEqual(version.botSurumu, '6.13.5-R16-PRICE-FALLBACK-FULL-CHAIN-RECOVERY');
  assert.strictEqual(ayarlar.futuresTickerRetry, 0, 'ticker retry must fail-fast; next main-loop tick is the retry');
  assert(Number(ayarlar.futuresTickerTimeoutMs) <= 6000, 'ticker wall deadline must stay short');

  const rev = fs.readFileSync('./revizyon.js', 'utf8');
  const bot = fs.readFileSync('./bot.js', 'utf8');
  const net = fs.readFileSync('./64_binance_network_resilience.js', 'utf8');

  const finallyBlock = rev.slice(rev.indexOf('} finally {', rev.indexOf('async function derinGecmisiInsaEt')), rev.indexOf('async function pusuVerileriniTazele'));
  assert(!finallyBlock.includes('periyodikTazelemeyiBaslat();'), 'startup must not arm bulk periodic refresh before first Renko audit');
  const firstAuditPos = bot.indexOf('ST2 İLK TARAMA TAMAMLANDI');
  const periodicPos = bot.indexOf('revizyon.periyodikTazelemeyiBaslat()', firstAuditPos);
  const shadowPos = bot.indexOf('revizyon.st1ShadowTazelemeyiBaslat()', firstAuditPos);
  assert(firstAuditPos > 0 && periodicPos > firstAuditPos && shadowPos > periodicPos, 'first audit must precede core periodic and shadow scheduling');
  assert(net.includes("active < (configuredConcurrency + 1)"), 'CRITICAL overflow slot missing');
  assert(net.includes('HARD_TIMEOUT'), 'wall-clock request deadline missing');

  // Queue proof: one hung LOW task must not prevent CRITICAL task from starting.
  ag._testReset();
  ag.configure({ concurrency: 1 });
  let releaseLow;
  const low = ag.kuyrukluIstek('TEST_LOW_HANG', () => new Promise(resolve => { releaseLow = resolve; }), { priority: 'LOW', retries: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));
  const criticalStart = Date.now();
  const critical = await Promise.race([
    ag.kuyrukluIstek('TEST_CRITICAL', () => Promise.resolve('CRITICAL_OK'), { priority: 'CRITICAL', retries: 0 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('CRITICAL_OVERFLOW_NOT_STARTED')), 400))
  ]);
  assert.strictEqual(critical, 'CRITICAL_OK');
  assert(Date.now() - criticalStart < 400, 'critical request waited behind bulk slot');
  releaseLow('LOW_DONE');
  await low;

  // Transport proof: req.setTimeout is deliberately inert; wall timer must still reject.
  const originalRequest = https.request;
  https.request = function fakeNeverGetsSocket() {
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.end = () => {};
    req.destroy = (err) => setImmediate(() => req.emit('error', err));
    return req;
  };
  const started = Date.now();
  let hardErr = null;
  try {
    await ag._httpsJson('https://example.invalid/fapi/v1/ticker/price', { timeoutMs: 1000, label: 'TEST_TICKER' });
  } catch (err) {
    hardErr = err;
  } finally {
    https.request = originalRequest;
  }
  const elapsed = Date.now() - started;
  assert(hardErr, 'hard deadline must reject a socket-starved request');
  assert(/HARD_TIMEOUT:1000ms/.test(String(hardErr.message)), `unexpected hard timeout error: ${hardErr.message}`);
  assert(elapsed >= 850 && elapsed < 1800, `hard deadline elapsed ${elapsed}ms`);

  ag._testReset();
  console.log(`✅ v6.13.5-R16 critical ticker + first-audit isolation passed | CRITICAL overflow <400ms | hard deadline ${elapsed}ms`);
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
