'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({}) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === './motor.js') return { fiyatKlip: (_s, v) => Number(v) };
  if (request === './2_rapor.js') return { raporGonder: async () => {} };
  if (request === './5_kalici_hafiza.js') return { kaydet: () => {} };
  if (request === './62_n5_premier_economy.js') return { close: () => {} };
  if (request === './73_st2_renko_entry_evolution.js') return { close: () => {} };
  if (request === './94_st2_15m_confirmed_evidence.js') return { recordLiveClose: () => {} };
  if (request === './85_st2_real_order_execution.js') return { finalizeExchangeClose: async () => ({}) };
  if (request === './86_st2_close_lifecycle.js') return { commitRealClose: () => ({ ok: false }), scheduleCloseReport: () => {} };
  return originalLoad.call(this, request, parent, isMain);
};
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r314-test-'));

const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const p = require('./4_pozisyon.js');
const versiyon = require('./versiyon.js');

(async () => {
  assert(String(versiyon.botSurumu).includes('R31.4'));
  assert.strictEqual(Number(ayarlar.gercekPozisyonMutabakatTimeoutMs), 20000);
  assert.strictEqual(Number(ayarlar.gercekPozisyonMutabakatSingleFlightMaxAgeMs), 60000);
  assert.strictEqual(Number(ayarlar.gercekKapanisMutabakatReadTimeoutMs), 6000);

  let calls = 0;
  h.state.aktifPozisyonlar = [{ sanal:false, sym:'REDUSDT', yon:'LONG' }];
  let snap = await p.exchangePositionSnapshot({
    futuresPositionRisk: async () => { calls++; return [{symbol:'REDUSDT', positionAmt:'2'}]; }
  });
  assert.strictEqual(snap.exchangeOk, true, 'tracked exchange position must verify');
  assert.strictEqual(h.state.st2PositionRiskRead.snapshotSafe, true);
  assert(Number(h.state.st2PositionRiskRead.snapshotVerifiedAt) > 0);

  snap = await p.exchangePositionSnapshot({
    futuresPositionRisk: async () => { calls++; return [{symbol:'BTCUSDT', positionAmt:'0.01'}]; }
  });
  assert.strictEqual(snap.exchangeOk, false, 'unknown exchange position must fail closed');
  assert(String(snap.error).includes('EXCHANGE_UNTRACKED_POSITION'));
  assert.strictEqual(h.state.st2PositionRiskRead.snapshotSafe, false);

  h.state.aktifPozisyonlar = [];
  snap = await p.exchangePositionSnapshot({
    futuresPositionRisk: async () => { calls++; return []; }
  });
  assert.strictEqual(snap.exchangeOk, true, 'zero local positions must still verify exchange snapshot');
  assert(calls >= 3, 'exchange snapshot must be queried even with zero local positions');

  const bot = fs.readFileSync('./bot.js', 'utf8');
  const pos = fs.readFileSync('./4_pozisyon.js', 'utf8');
  const exec = fs.readFileSync('./85_st2_real_order_execution.js', 'utf8');
  const report = fs.readFileSync('./2_rapor.js', 'utf8');
  assert(bot.includes('exchangeFinalizeTask'), 'close accounting must have separate task');
  assert(bot.includes('const snapshot = await p.exchangePositionSnapshot();'), 'background reconcile must refresh snapshot first');
  assert(bot.indexOf('rec.lastOkAt = rec.lastFinishAt') < bot.indexOf("p.izSurmeyiGuncelle({ reconcileOnly: true, exchangeSnapshot"), 'snapshot must refresh REAL liveness before close accounting');
  assert(bot.includes('snapshotFresh'), 'REAL safety must accept fresh verified position snapshot');
  assert(pos.includes('gercekPozisyonMutabakatSingleFlightMaxAgeMs'), 'hung single-flight must rotate');
  assert(pos.includes('EXCHANGE_UNTRACKED_POSITION'), 'unknown exchange position must fail closed');
  assert(exec.includes('boundedReconcileClient'), 'close finalize API calls must be deadline bounded');
  assert(exec.includes('fastReconcile'), 'background close finalization must use bounded fast path');
  assert(report.includes('Snapshot ${posRead.snapshotSafe'), 'panel must expose snapshot liveness');
  assert(report.includes('Finalize ${String(finalize.status'), 'panel must expose close-finalize state');

  console.log('✅ R31.4 snapshot liveness passed | positionRisk refresh decoupled from close accounting | unknown exchange position fail-closed | hung single-flight rotates | close finalize bounded');
})().catch(err => { console.error(err); process.exit(1); });
