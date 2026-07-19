'use strict';
const assert = require('assert');
const ag = require('./64_binance_network_resilience.js');

(async () => {
  ag._testReset();
  ag.configure({ concurrency: 2 });

  let active = 0;
  let maxActive = 0;
  const jobs = Array.from({ length: 8 }, (_, i) => ag.kuyrukluIstek(
    `Q:${i}`,
    async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await ag.sleep(8);
      active--;
      return i;
    },
    { retries: 0, requestSpacingMs: 0 }
  ));
  const values = await Promise.all(jobs);
  assert.deepStrictEqual(values, [0,1,2,3,4,5,6,7]);
  assert(maxActive <= 2, `global concurrency exceeded: ${maxActive}`);

  let calls = 0;
  const first = ag.kuyrukluIstek('SAME:CANDLE', async () => {
    calls++;
    await ag.sleep(10);
    return { ok: true };
  }, { retries: 0, requestSpacingMs: 0, cacheTtlMs: 1000 });
  const second = ag.kuyrukluIstek('SAME:CANDLE', async () => {
    calls++;
    return { ok: false };
  }, { retries: 0, requestSpacingMs: 0, cacheTtlMs: 1000 });
  const [a, b] = await Promise.all([first, second]);
  assert.deepStrictEqual(a, { ok: true });
  assert.deepStrictEqual(b, { ok: true });
  assert.strictEqual(calls, 1, 'in-flight request was not coalesced');

  const cached = await ag.kuyrukluIstek('SAME:CANDLE', async () => {
    calls++;
    return { ok: false };
  }, { retries: 0, requestSpacingMs: 0, cacheTtlMs: 1000 });
  assert.deepStrictEqual(cached, { ok: true });
  assert.strictEqual(calls, 1, 'cache did not prevent duplicate request');

  let attempts = 0;
  const retried = await ag.kuyrukluIstek('RETRY:ONE', async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('socket hang up');
      err.code = 'ECONNRESET';
      throw err;
    }
    return 42;
  }, { retries: 1, baseDelayMs: 1, maxDelayMs: 2, requestSpacingMs: 0 });
  assert.strictEqual(retried, 42);
  assert.strictEqual(attempts, 2);

  const summary = ag.durumOzeti();
  assert(summary.deduped >= 1);
  assert(summary.cacheHit >= 1);
  assert(summary.retried >= 1);
  console.log('✅ v5.0.2 shared request queue passed | global limit + coalescing + cache + retry');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
