'use strict';
const assert = require('assert');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');
const ag = require('./64_binance_network_resilience.js');
const version = require('./versiyon.js');

(async () => {
  assert.strictEqual(version.botSurumu, '6.13.5-R25.4-STARTUP-CORE-LIVENESS-N5-20SLOT-20USDT');
  const bot = fs.readFileSync('./bot.js', 'utf8');
  const net = fs.readFileSync('./64_binance_network_resilience.js', 'utf8');
  assert(bot.includes("const st2StartupBos = ayarlar.entryStrategyMode === 'ST2_RENKO' && h.state.startupMarketReady !== true && h.state.aktifPozisyonlar.length === 0"), 'startup no-position ticker bypass missing');
  assert(bot.includes('if (st2StartupBos) return;'), 'startup bypass must return before FUTURES_PRICES');
  assert(net.includes('const criticalTickerAgent = new https.Agent'), 'dedicated ticker agent missing');
  assert(net.includes('agent: criticalTickerAgent'), 'ticker must use dedicated agent');
  assert(!net.slice(net.indexOf('function binanceFiyatlariCek'), net.indexOf('async function havuzdaCalistir')).includes("kuyrukluIstek('TICKER:ALL'"), 'ticker must not use shared bulk queue');

  // Dynamic transport proof: poison the shared queue with a hung LOW task. Dedicated ticker must still complete.
  ag._testReset();
  ag.configure({ concurrency: 1 });
  let releaseLow;
  const low = ag.kuyrukluIstek('LOW_HANG_R15', () => new Promise(resolve => { releaseLow = resolve; }), { priority: 'LOW', retries: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));

  const originalRequest = https.request;
  let seenAgent = null;
  https.request = function fakeTickerRequest(url, options, cb) {
    seenAgent = options.agent;
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.destroy = err => setImmediate(() => req.emit('error', err));
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = {};
      setImmediate(() => {
        cb(res);
        res.emit('data', Buffer.from('[{"symbol":"BTCUSDT","price":"123.45"}]'));
        res.emit('end');
      });
    };
    return req;
  };
  let prices;
  try {
    prices = await Promise.race([
      ag.binanceFiyatlariCek({ timeoutMs: 1000, retries: 0, label: 'R15_TEST_TICKER', cacheTtlMs: 0 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DEDICATED_TICKER_BLOCKED_BY_BULK')), 400))
    ]);
  } finally {
    https.request = originalRequest;
  }
  assert.strictEqual(prices.BTCUSDT, '123.45');
  assert.strictEqual(seenAgent, ag._criticalTickerAgent, 'ticker did not use dedicated agent');
  releaseLow('LOW_DONE');
  await low;
  ag._testReset();
  console.log('✅ v6.13.5-R16 dedicated ticker + startup isolation passed | ticker bypasses shared bulk queue/agent');
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
