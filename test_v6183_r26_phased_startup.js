'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r26-phased-'));
process.env.AGROS_DATA_DIR = tmp;
process.env.AGROS_REAL_ORDER_LOCK_FILE = path.join(tmp, 'r26-phased-test.pidlock');
process.env.SANAL_EMIR_MODU = 'false';

const h = require('./1_hafiza.js');
h.state.basamaklar = {
  BTCUSDT: { pricePrecision: 2, quantityPrecision: 3, tickSize: 0.1, stepSize: 0.001, minQty: 0.001, minNotional: 5 },
  ETHUSDT: { pricePrecision: 2, quantityPrecision: 3, tickSize: 0.01, stepSize: 0.001, minQty: 0.001, minNotional: 5 }
};
const exec = require('./85_st2_real_order_execution.js');

(async () => {
  let calls = 0;
  const client = {
    futuresPositionRisk: async () => {
      calls++;
      return [
        { symbol: 'BTCUSDT', positionAmt: '0.010', entryPrice: '60000', positionSide: 'BOTH' },
        { symbol: 'ETHUSDT', positionAmt: '-0.200', entryPrice: '3000', positionSide: 'BOTH' }
      ];
    }
  };
  const snap = await exec.startupSafetySnapshot(client);
  assert.strictEqual(calls, 1, 'safety snapshot must use one bounded positionRisk read');
  assert.strictEqual(snap.positions.length, 2);
  assert.strictEqual(snap.positions[0].sanal, false);
  assert.strictEqual(snap.positions[1].sanal, false);
  assert.strictEqual(snap.safetyOnly, true);
  assert.strictEqual(snap.blocked, true, 'new real entry must remain blocked before full reconcile');

  const bot = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');
  assert(bot.includes("ready: () => h.state.startupMarketReady === true"), 'panel must wait for market READY');
  assert(bot.includes("FULL_RECONCILIATION_DEFERRED_UNTIL_MARKET_READY"), 'full reconcile must be deferred');
  assert(bot.includes("GERÇEK FULL MUTABAKAT POST-WARMUP"), 'full reconcile must start post-warmup');
  assert(!bot.includes("st2ExchangeReconcileBackground('STARTUP')"), 'background reconcile must not start during warmup');
  assert(bot.includes("MARKET_WARMUP_NOT_READY"), 'real entry safety must include market gate');

  console.log('✅ R26 phased startup passed | 1 bounded positionRisk safety snapshot | full reconcile + panel deferred until READY | real entry market-gated');
})().finally(() => {
  try { exec.cleanupProcessLock(); } catch (_) {}
  fs.rmSync(tmp, { recursive: true, force: true });
}).catch(err => { console.error(err); process.exit(1); });
