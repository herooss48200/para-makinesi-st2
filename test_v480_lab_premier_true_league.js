const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const labPremier = require('./62_lab_premier_league.js');

const protectedFiles = [labPremier.STATE_FILE, labPremier.MODEL_FILE, labPremier.TRADES_FILE];
const snapshots = new Map(protectedFiles.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
function remove(file) { try { fs.unlinkSync(file); } catch (_) {} }
function restore() {
  for (const file of protectedFiles) {
    remove(file);
    const value = snapshots.get(file);
    if (value) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value);
    }
  }
}

const oldHistoricalTest = ayarlar.labPremierTarihselTestAktif;
const oldForwardRequired = ayarlar.labPremierIleriDogrulamaZorunlu;
try {
  protectedFiles.forEach(remove);
  ayarlar.labPremierTarihselTestAktif = true;
  ayarlar.labPremierIleriDogrulamaZorunlu = false;

  const baseChampion = {
    labDnaId: 67,
    labDnaLabel: 'LAB #67',
    labKey: 'YON=LONG|BTC=0011|COIN=0010|BB=ORTA_ALT',
    familyDnaId: 32,
    familyDnaLabel: 'DNA #32',
    familyKey: 'YON=LONG|BTC=0011|COIN=0010',
    label: 'LONG | BTC[1h+4h] | Coin[1h] | BB ORTA_ALT',
    historicalCandidate: true,
    historical: { total: 28, winRate: 89.2857, profitFactor: 5.81, expectancy: 0.4088, net: 11.45 },
    exit: {
      algorithmId: 'TIME_120M', algorithmLabel: '120 Dakika Exit', samples: 18,
      profitFactor: 4.54, netUsdt: 8.8, beatRate: 80, positive: true, ownLabExit: true,
      ready: true, currentRegime: { key: 'RANGE|VOL_HIGH' }
    },
    forward: { eligible: false, metrics: { closed: 0, profitFactor: 0, expectancy: 0, net: 0 } }
  };
  const waitingExit = {
    ...baseChampion,
    labDnaId: 68,
    labDnaLabel: 'LAB #68',
    labKey: 'YON=LONG|BTC=0011|COIN=0010|BB=ORTA',
    label: 'LAB exit waiting',
    exit: { ...baseChampion.exit, positive: false, ownLabExit: true }
  };
  const verified = {
    ...baseChampion,
    labDnaId: 69,
    labDnaLabel: 'LAB #69',
    labKey: 'YON=SHORT|BTC=0010|COIN=0001|BB=ORTA_UST',
    familyDnaId: 181,
    familyDnaLabel: 'DNA #181',
    familyKey: 'YON=SHORT|BTC=0010|COIN=0001',
    forward: { eligible: true, metrics: { closed: 5, profitFactor: 2.2, expectancy: 0.12, net: 0.6 } }
  };

  const league = labPremier.build({ catalogue: { labChampions: [baseChampion, waitingExit, verified] }, persist: false });
  assert.strictEqual(league.authority, 'LAB_DNA_ONLY');
  assert.strictEqual(league.policy.familyOrderAuthority, false, 'Family emir yetkisi taşımamalı');
  assert.strictEqual(league.policy.labPremierOrderAuthority, true);
  assert.strictEqual(league.policy.championshipOrderAuthority, false);
  assert.strictEqual(league.policy.championshipSizeMultiplier, 0, 'Eski Championship 0.25 kaldırılmalı');
  assert.strictEqual(league.policy.premierSizeMultiplier, 1, 'Tüm LAB Premier eşit x1 yarışmalı');
  assert.strictEqual(league.premierCount, 3, 'Pozitif giriş DNA özel Exit beklerken de güvenli fallback ile Premier’e girmeli');
  assert.strictEqual(league.championshipCount, 0, 'Giriş kanıtlı LAB yalnız özel Exit eksik diye gölgede kalmamalı');
  assert.strictEqual(league.exitValidatedCount, 2);
  assert.strictEqual(league.entryFallbackCount, 1);
  assert.strictEqual(league.forwardVerifiedCount, 1);
  assert.strictEqual(league.historicalTestCount, 1);

  const decision = {
    version: labPremier.VERSION,
    at: new Date().toISOString(),
    symbol: 'TESTUSDT', side: 'LONG',
    familyDnaId: 32, familyDnaLabel: 'DNA #32', familyKey: baseChampion.familyKey,
    labDnaId: 67, labDnaLabel: 'LAB #67', labKey: baseChampion.labKey,
    fullDnaId: 1, fullDnaLabel: 'FULL #1', fullKey: `${baseChampion.labKey}|PUSU=KIRMIZI_MUM_ALT_BAND`,
    labLeague: 'PREMIER', proofLevel: 'HISTORICAL_POSITIVE_EXIT_TEST',
    admissionReason: 'test', upperLayerIncluded: true, virtualShadowOnly: false,
    sizeMultiplier: 1, historical: baseChampion.historical, forward: baseChampion.forward,
    exit: baseChampion.exit, realTradingAuthorized: false, allowed: true, reasons: []
  };
  const pos = { sanal: true, sym: 'TESTUSDT', yon: 'LONG', sanalOrderId: 'LAB-P-1', girisFiyati: 100, miktar: 1 };
  labPremier.applyToPosition(pos, decision);
  assert.strictEqual(pos.leagueShadowOnly, false);
  assert.strictEqual(pos.virtualAccountIncluded, true);
  assert.strictEqual(pos.executionExitAssignment.algorithmId, 'TIME_120M');
  assert.strictEqual(pos.executionExitAssignment.scope, 'LAB_PREMIER_OWN_EXIT');
  assert.strictEqual(pos.exitPlanShadow.selectedAlgorithmId, pos.executionExitAssignment.algorithmId, 'Frozen/shadow exit çakışmamalı');
  assert.strictEqual(pos.executionExitAssignment.activeForPosition, true);

  const fallbackDecision = {
    ...decision,
    labDnaId: 68, labDnaLabel: 'LAB #68', labKey: waitingExit.labKey,
    proofLevel: 'HISTORICAL_ENTRY_PROVEN_FALLBACK', exitValidated: false,
    safeExitFallback: true, entryProven: true, exit: waitingExit.exit
  };
  const fallbackPos = {
    sanal: true,
    executionExitAssignment: {
      ready: true, algorithmId: 'TIME_15M', label: '15 Dakika Exit',
      activeForPosition: true, scope: 'BASE_DNA_LEAK_TEST'
    },
    exitPlanActiveForVirtual: true
  };
  labPremier.applyToPosition(fallbackPos, fallbackDecision);
  assert.strictEqual(fallbackPos.leagueShadowOnly, false, 'Entry-Proven DNA Premier üst katmana alınmalı');
  assert.strictEqual(fallbackPos.virtualAccountIncluded, true);
  assert.strictEqual(fallbackPos.executionExitAssignment.algorithmId, 'ACTUAL', 'Family dinamik Exit sızıntısı güvenli kademe ile ezilmeli');
  assert.strictEqual(fallbackPos.executionExitAssignment.scope, 'LAB_PREMIER_ENTRY_PROVEN_FALLBACK');
  assert.strictEqual(fallbackPos.executionExitAssignment.ready, false);
  assert.strictEqual(fallbackPos.exitPlanActiveForVirtual, false);
  assert.ok(labPremier.snapshot(fallbackPos), 'Entry-Proven fallback Premier kasasında izlenmeli');
  labPremier.close(fallbackPos, { net: -0.2, commission: 0.05, outcome: 'SL' });

  const activeBefore = 0;
  const observation = labPremier.snapshot(pos);
  assert.ok(observation);
  assert.strictEqual(observation.secondOrderCreated, false);
  assert.strictEqual(activeBefore, 0, 'LAB Premier yeni ikinci pozisyon oluşturmaz');
  const closed = labPremier.close(pos, { net: 0.7, commission: 0.05, outcome: 'TP' });
  assert.strictEqual(closed.labDnaLabel, 'LAB #67');
  assert.strictEqual(closed.net, 0.7);
  assert.strictEqual(closed.realTradingAuthorized, false);

  const state = labPremier.readState();
  assert.strictEqual(state.aggregate.opened, 2);
  assert.strictEqual(state.aggregate.closed, 2);
  assert.strictEqual(state.aggregate.tp, 1);
  assert.ok(Math.abs(state.aggregate.net - 0.5) < 1e-9);

  const shadowPos = { sanal: true, executionExitAssignment: { algorithmId: 'ACTUAL', activeForPosition: false } };
  labPremier.applyToPosition(shadowPos, {
    ...decision, labDnaLabel: 'LAB #68', labKey: waitingExit.labKey,
    labLeague: 'CHAMPIONSHIP', proofLevel: 'OWN_EXIT_PENDING', upperLayerIncluded: false,
    virtualShadowOnly: true, sizeMultiplier: 0, exit: waitingExit.exit
  });
  assert.strictEqual(shadowPos.leagueShadowOnly, true);
  assert.strictEqual(shadowPos.virtualAccountIncluded, false);
  assert.strictEqual(shadowPos.executionExitAssignment.algorithmId, 'ACTUAL', 'Gölge LAB’a Premier Exit’i zorlanmamalı');
  assert.strictEqual(labPremier.snapshot(shadowPos), null, 'Championship üst kasa hesabı açmamalı');

  const text = labPremier.telegram({ league }, 9);
  assert.ok(text.includes('LAB PREMIER'));
  assert.ok(text.includes('Family rolü: kalıcı piyasa hafızası'));
  assert.ok(text.includes('Giriş kanıtı Premier sanal teste yeter'));
  assert.ok(text.includes('Mevcut Kademe güvenli fallback'));
  assert.ok(text.includes('LAB #67'));
  assert.ok(!text.includes('gerçek emir yetkisi açık'));

  const audit = labPremier.audit();
  assert.strictEqual(audit.familyOrderAuthority, false);
  assert.strictEqual(audit.labPremierOrderAuthority, true);
  assert.strictEqual(audit.championshipSizeMultiplier, 0);
  assert.strictEqual(audit.secondOrderCreated, false);
  assert.strictEqual(audit.realTradingAuthorized, false);

  console.log('✅ v4.8.0 LAB Premier regression passed | Entry-Proven fallback + own Exit active + zero second order + real gate closed');
} finally {
  ayarlar.labPremierTarihselTestAktif = oldHistoricalTest;
  ayarlar.labPremierIleriDogrulamaZorunlu = oldForwardRequired;
  restore();
}
