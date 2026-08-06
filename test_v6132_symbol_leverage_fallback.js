'use strict';
const assert = require('assert');
const policy = require('./91_st2_symbol_leverage_policy.js');

(async () => {
  const calls = [];
  const client = { async futuresLeverage({ symbol, leverage }) {
    calls.push({ symbol, leverage });
    if (symbol === 'HUSDT' && leverage > 3) throw new Error(`Leverage ${leverage} is not valid`);
    return { symbol, leverage };
  }};
  const fallback = await policy.negotiate({ symbol: 'HUSDT', requestedLeverage: 5, client });
  assert.strictEqual(fallback.effective, 3);
  assert.deepStrictEqual(calls.map(x => x.leverage), [5, 4, 3]);

  const exact = await policy.negotiate({ symbol: 'BTCUSDT', requestedLeverage: 5, client });
  assert.strictEqual(exact.effective, 5);

  await assert.rejects(() => policy.negotiate({
    symbol: 'FAILUSDT', requestedLeverage: 5,
    client: { futuresLeverage: async ({ leverage }) => { throw new Error(`Leverage ${leverage} is not valid`); } }
  }), /SEMBOL_KALDIRAC_UYUMLU_DEGIL/);

  await assert.rejects(() => policy.negotiate({
    symbol: 'NETUSDT', requestedLeverage: 5,
    client: { futuresLeverage: async () => { throw new Error('ECONNRESET'); } }
  }), /ECONNRESET/);

  const motorSource = require('fs').readFileSync('./motor.js', 'utf8');
  assert(motorSource.includes("require('./91_st2_symbol_leverage_policy.js')"));
  assert(motorSource.includes('risk.marginUsdt * kaldirac * ligBoyutCarpani'));
  assert(motorSource.includes('KALDIRAC_FALLBACK_BOYUT_FAIL_CLOSED'));
  console.log('✅ v6.13.2 symbol leverage fallback + margin-preserving sizing + fail-closed isolation passed');
})().catch(err => { console.error(err.stack || err); process.exitCode = 1; });
