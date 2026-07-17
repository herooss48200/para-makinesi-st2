const assert = require('assert');
const ayarlar = require('./ayarlar.js');
const bridge = require('./50_real_order_readiness_bridge.js');
const executor = require('./51_sanal_dynamic_exit_executor.js');

const oldVirtual = ayarlar.sanalDynamicExitAktif;
try {
  ayarlar.sanalDynamicExitAktif = true;
  const source = {
    dnaLeagueProfile: { league: 'PREMIER' },
    exitPlanShadow: {
      ready: true,
      selectedAlgorithmId: 'TIME_15M',
      selectedAlgorithmLabel: '15 Dakika Exit'
    },
    realOrderReadiness: { allowed: true, league: 'PREMIER' },
    executionExitAssignment: {
      ready: true,
      algorithmId: 'TIME_15M',
      label: '15 Dakika Exit',
      assignmentId: 'DNA|TIME_15M|TEST',
      activeForPosition: true,
      immutable: true
    },
    exitPlanActiveForVirtual: true
  };
  const position = {
    sym: 'TESTUSDT', yon: 'LONG', sanal: true,
    girisFiyati: 100, acilisZamani: Date.now() - (16 * 60 * 1000)
  };

  bridge.copyDecisionToPosition(position, source);

  assert.deepStrictEqual(position.dnaLeagueProfile, source.dnaLeagueProfile);
  assert.deepStrictEqual(position.exitPlanShadow, source.exitPlanShadow);
  assert.deepStrictEqual(position.realOrderReadiness, source.realOrderReadiness);
  assert.ok(position.executionExitAssignment, 'Donmuş exit ataması pozisyona kopyalanmalı');
  assert.notStrictEqual(position.executionExitAssignment, source.executionExitAssignment, 'Atama ayrı nesne olmalı');
  assert.strictEqual(position.executionExitAssignment.algorithmId, 'TIME_15M');
  assert.strictEqual(position.executionExitAssignment.activeForPosition, true);
  assert.strictEqual(position.exitPlanActiveForVirtual, true);

  source.executionExitAssignment.algorithmId = 'TIME_30M';
  assert.strictEqual(position.executionExitAssignment.algorithmId, 'TIME_15M', 'Kaynak değişse bile pozisyonun donmuş exit kimliği değişmemeli');

  const result = executor.evaluate(position, 101);
  assert.strictEqual(result.active, true, 'Kopyalanan dinamik exit aktif olmalı');
  assert.strictEqual(result.close, true, '15 dakika tamamlandığı için kapanış üretmeli');
  assert.strictEqual(result.algorithmId, 'TIME_15M');
  assert.strictEqual(result.assignmentId, 'DNA|TIME_15M|TEST');

  console.log('✅ Frozen exit position binding test passed');
} finally {
  ayarlar.sanalDynamicExitAktif = oldVirtual;
}
