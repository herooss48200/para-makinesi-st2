'use strict';
const fs = require('fs');
const assert = require('assert');
const { createCoordinator, ORDER } = require('./66_identity_chain_repair.js');
const ag = require('./64_binance_network_resilience.js');

function mockSnapshot() {
  return {
    symbol: 'SKLUSDT',
    yon: 'SHORT',
    strategySignature: {
      key: 'YON=SHORT|BTC=0001|COIN=0001|BTC_TF=4H|COIN_TF=4H|BB=ORTA_UST',
      dnaId: 171,
      dnaLabel: 'DNA #171',
      labDnaId: 378,
      labDnaLabel: 'LAB #378'
    }
  };
}

(async () => {
  const calls = [];
  const coordinator = createCoordinator({
    blackbox: {
      snapshotAl: async () => { calls.push('RAW_SNAPSHOT'); return mockSnapshot(); }
    },
    dnaHierarchy: {
      decoratePosition: pos => {
        calls.push('IDENTITY');
        Object.assign(pos, {
          dnaId: 171, dnaLabel: 'DNA #171', dnaIdentityKey: 'YON=SHORT|BTC=0001|COIN=0001',
          labDnaId: 378, labDnaLabel: 'LAB #378', labIdentityKey: 'YON=SHORT|BTC=0001|COIN=0001|BB=ORTA_UST',
          fullDnaId: 365, fullDnaLabel: 'FULL #365', fullIdentityKey: 'YON=SHORT|BTC=0001|COIN=0001|BB=ORTA_UST|PUSU=YESIL_MUM_UST_BAND'
        });
        return {
          family: { id: 171, label: 'DNA #171', key: pos.dnaIdentityKey },
          lab: { id: 378, label: 'LAB #378', key: pos.labIdentityKey },
          full: { id: 365, label: 'FULL #365', key: pos.fullIdentityKey }
        };
      }
    },
    dnaLeague: {
      attachToPosition: pos => { calls.push('LEAGUE_FAMILY'); return pos.dnaLeagueProfile = { league: 'DEVELOPMENT' }; }
    },
    dnaExitSelector: {
      attachToPosition: pos => { calls.push('EXIT_SELECTOR'); return pos.exitPlanShadow = { ready: true, selectedAlgorithmId: 'TIME_10M' }; }
    },
    realOrderBridge: {
      evaluate: pos => {
        calls.push('READINESS');
        pos.realOrderReadiness = {
          key: mockSnapshot().strategySignature.key,
          dnaLabel: 'DNA #171', league: 'DEVELOPMENT'
        };
        pos.executionExitAssignment = {
          algorithmId: 'TIME_10M', label: '10 Dakika Exit', assignmentId: 'DNA #171|TIME_10M|TEST', activeForPosition: true
        };
        return pos.realOrderReadiness;
      }
    },
    labPremier: {
      evaluate: pos => {
        calls.push('LEAGUE_LAB');
        return pos.labPremierDecision = {
          familyDnaLabel: 'DNA #171', labDnaLabel: 'LAB #378', fullDnaLabel: 'FULL #365',
          labLeague: 'DEVELOPMENT', proofLevel: 'LEARNING', upperLayerIncluded: false
        };
      },
      applyToPosition: (pos, decision) => {
        calls.push('EXIT_FINAL');
        pos.labPremierDecision = decision;
        pos.leagueShadowOnly = true;
        return decision;
      }
    }
  });

  const prepared = await coordinator.prepare({
    sym: 'SKLUSDT', yon: 'SHORT', sanal: true,
    girisAnalizi: { senaryo: 'YESIL_MUM_UST_BAND' }
  });
  assert.deepStrictEqual(calls, ['RAW_SNAPSHOT', 'IDENTITY', 'LEAGUE_FAMILY', 'LEAGUE_LAB', 'EXIT_SELECTOR', 'READINESS', 'EXIT_FINAL']);
  assert.strictEqual(prepared.dnaLabel, 'DNA #171');
  assert.strictEqual(prepared.labDnaLabel, 'LAB #378');
  assert.strictEqual(prepared.fullDnaLabel, 'FULL #365');
  assert(!JSON.stringify(prepared).includes('#YOK'), 'Hazırlanan zincirde #YOK bulunmamalı');
  assert.deepStrictEqual(prepared.identityChainAudit.completed, ['IDENTITY', 'LEAGUE', 'EXIT']);

  const livePosition = { sym: 'SKLUSDT', yon: 'SHORT', sanal: true };
  coordinator.copyPrepared(livePosition, prepared);
  coordinator.markStage(livePosition, 'BLACKBOX');
  coordinator.markStage(livePosition, 'TELEGRAM');
  assert.strictEqual(livePosition.identityChainAudit.status, 'COMPLETE');
  assert.deepStrictEqual(livePosition.identityChainAudit.completed, ORDER);

  const failedCalls = [];
  const failCoordinator = createCoordinator({
    blackbox: { snapshotAl: async () => { failedCalls.push('RAW_SNAPSHOT'); return null; } },
    dnaHierarchy: { decoratePosition: () => { failedCalls.push('IDENTITY'); } },
    dnaLeague: { attachToPosition: () => { failedCalls.push('LEAGUE'); } },
    dnaExitSelector: { attachToPosition: () => { failedCalls.push('EXIT'); } },
    realOrderBridge: { evaluate: () => { failedCalls.push('READINESS'); } },
    labPremier: { evaluate: () => { failedCalls.push('LAB'); }, applyToPosition: () => {} }
  });
  await assert.rejects(() => failCoordinator.prepare({ sym: 'FAILUSDT', yon: 'LONG' }), /IDENTITY_CHAIN_SNAPSHOT_YOK/);
  assert.deepStrictEqual(failedCalls, ['RAW_SNAPSHOT'], 'Snapshot yoksa kimlik/League/Exit çalışmamalı');

  const motor = fs.readFileSync('motor.js', 'utf8');
  const prepareAt = motor.indexOf('await identityChain.prepare(hazirKimlik');
  const virtualPushAt = motor.indexOf('h.state.aktifPozisyonlar.push(yeniPozisyon);');
  const copyAt = motor.indexOf('identityChain.copyPrepared(yeniPozisyon, hazirKimlik)');
  const blackboxAt = motor.indexOf("blackbox.kayitYaz(yeniPozisyon, 'ACILIS'");
  const telegramAt = motor.indexOf('const telegramGonderildi = await h.telegramMesajGonder(');
  assert(prepareAt >= 0 && copyAt >= 0 && virtualPushAt >= 0 && copyAt < virtualPushAt, 'Kimlik zinciri state kaydından önce kopyalanmalı');
  assert(blackboxAt >= 0 && telegramAt >= 0 && blackboxAt < telegramAt, 'BlackBox Telegramdan önce tamamlanmalı');
  assert(!motor.includes('Emir öncesi snapshot alınamadı'), 'Anonim devam eden eski snapshot catch yolu kaldırılmalı');

  // Ortak kuyrukta giriş snapshotı kritik öncelikle arka plan işlerinin önüne geçmeli.
  ag._testReset();
  ag.configure({ concurrency: 1 });
  const order = [];
  let releaseBlocker;
  const blockerGate = new Promise(resolve => { releaseBlocker = resolve; });
  const blocker = ag.kuyrukluIstek('BLOCKER', async () => { order.push('BLOCKER'); await blockerGate; }, { retries: 0, requestSpacingMs: 0 });
  await ag.sleep(5);
  const low1 = ag.kuyrukluIstek('LOW1', async () => { order.push('LOW1'); }, { retries: 0, requestSpacingMs: 0, priority: 'LOW' });
  const promotedLow = ag.kuyrukluIstek('PROMOTE', async () => { order.push('PROMOTED'); }, { retries: 0, requestSpacingMs: 0, priority: 'LOW' });
  const promotedCritical = ag.kuyrukluIstek('PROMOTE', async () => { throw new Error('dedupe failed'); }, { retries: 0, requestSpacingMs: 0, priority: 'CRITICAL' });
  const high = ag.kuyrukluIstek('HIGH', async () => { order.push('HIGH'); }, { retries: 0, requestSpacingMs: 0, priority: 'CRITICAL' });
  releaseBlocker();
  await Promise.all([blocker, low1, promotedLow, promotedCritical, high]);
  assert.deepStrictEqual(order, ['BLOCKER', 'PROMOTED', 'HIGH', 'LOW1']);
  assert(ag.durumOzeti().promoted >= 1, 'Bekleyen aynı istek kritik önceliğe yükseltilmeli');

  console.log('✅ v5.0.6 Identity Chain Repair passed | DNA/LAB/FULL + snapshot + deterministic order + queue priority');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
