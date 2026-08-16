const fs = require('fs');
const assert = require('assert');

const bot = fs.readFileSync('./bot.js', 'utf8');
const exec = fs.readFileSync('./85_st2_real_order_execution.js', 'utf8');
const version = require('./versiyon').botSurumu;

assert(version.includes('R25.9-BOOTSTRAP-RECONCILE-DECOUPLED'), 'R25.9 version missing');
assert(bot.includes("rec.status = 'STARTUP_BACKGROUND'"), 'startup reconcile background state missing');
assert(bot.includes('Yeni gerçek entry FAIL-CLOSED | Startup devam ediyor'), 'fail-closed continuation proof missing');
assert(bot.includes('startupExchangeReconcileTask = Promise.resolve()'), 'startup reconcile must be detached');
assert(!bot.includes('await piyasa.acikPozisyonlariBorsadanDevral();\n        {\n            const rec = st2ExchangeReconcileState();'), 'real startup reconcile is still synchronously blocking');
assert(bot.indexOf('setImmediate(() => {\n            Promise.resolve(revizyon.derinGecmisiInsaEt())') > bot.indexOf("rec.status = 'STARTUP_BACKGROUND'"), 'market warmup must remain after detached reconciliation setup');
assert(exec.includes("signedReadDeadline(() => client.futuresPositionRisk(), 'FUTURES_POSITION_RISK_TIMEOUT')"), 'startup position-risk read deadline missing');
assert(exec.includes("ayarlar.gercekPozisyonMutabakatTimeoutMs || 8000"), '8s signed read timeout authority missing');
(async () => {
  const realExecution = require('./85_st2_real_order_execution.js');
  const started = Date.now();
  await assert.rejects(
    () => realExecution._test.signedReadDeadline(() => new Promise(() => {}), 'TEST_SIGNED_READ_TIMEOUT', 2000),
    /TEST_SIGNED_READ_TIMEOUT:2000ms/
  );
  const elapsed = Date.now() - started;
  assert(elapsed >= 1900 && elapsed < 3500, `signed read deadline elapsed unexpected: ${elapsed}`);
  console.log(`✅ R25.9 bootstrap reconcile decoupled passed | startup continues fail-closed | signed read timeout ${elapsed}ms | Premier/stop untouched`);
})().catch(err => { console.error(err.stack || err); process.exit(1); });
