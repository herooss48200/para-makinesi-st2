const assert = require('assert');
const fs = require('fs');
const ayarlar = require('./ayarlar.js');
const evidence = require('./63_universal_evidence_engine.js');
const labPremier = require('./62_lab_premier_league.js');
const dynamicExecutor = require('./51_sanal_dynamic_exit_executor.js');

const oldFallback = ayarlar.labPremierEntryProvenFallbackAktif;
const oldHistorical = ayarlar.labPremierTarihselTestAktif;
const oldForward = ayarlar.labPremierIleriDogrulamaZorunlu;
const oldDynamic = ayarlar.sanalDynamicExitAktif;
try {
  ayarlar.labPremierEntryProvenFallbackAktif = true;
  ayarlar.labPremierTarihselTestAktif = true;
  ayarlar.labPremierIleriDogrulamaZorunlu = false;
  ayarlar.sanalDynamicExitAktif = true;

  const historical = { total: 8, winRate: 62.5, profitFactor: 1.8, net: 1.2, expectancy: 0.15 };
  const recent = { total: 5, winRate: 60, profitFactor: 1.5, net: 0.75, expectancy: 0.15 };
  const noExit = { positive: false, ownLabExit: false, samples: 0, profitFactor: 0, netUsdt: 0, ready: false };
  const evHistorical = evidence.evaluate({
    strategyType: 'LAB_DNA', strategyKey: 'LAB-HIST', historical, recent: {}, exit: noExit, live: {}
  });
  assert.strictEqual(evHistorical.entryHistoricalEligible, true);
  assert.strictEqual(evHistorical.entryAdmissionEligible, true);
  assert.strictEqual(evHistorical.exitPositive, false);
  assert.strictEqual(evHistorical.admissionEligible, false, 'Eski Exit-Validated kapı ayrı kalmalı');

  const evRecent = evidence.evaluate({
    strategyType: 'LAB_DNA', strategyKey: 'LAB-RECENT', historical: { total: 2, profitFactor: 0.5, net: -1, expectancy: -0.5 },
    recent, exit: noExit, live: {}
  });
  assert.strictEqual(evRecent.entryRecentProvisionalEligible, true);

  const historicalCandidate = {
    labDnaId: 1001, labDnaLabel: 'LAB #1001', labKey: 'YON=LONG|BTC=0001|COIN=0010|BB=ORTA_ALT',
    familyDnaId: 1, familyDnaLabel: 'DNA #1', familyKey: 'YON=LONG|BTC=0001|COIN=0010', label: 'Historical entry proven',
    historicalCandidate: false, entryProvenCandidate: true, historicalEntryCandidate: true,
    historical, recent5: {}, exit: noExit, evidence: evHistorical,
    forward: { eligible: false, metrics: { closed: 0, profitFactor: 0, net: 0, expectancy: 0 } }
  };
  const recentCandidate = {
    labDnaId: 1002, labDnaLabel: 'LAB #1002', labKey: 'YON=SHORT|BTC=0010|COIN=0100|BB=ORTA_UST',
    familyDnaId: 2, familyDnaLabel: 'DNA #2', familyKey: 'YON=SHORT|BTC=0010|COIN=0100', label: 'Recent entry proven',
    historicalCandidate: false, entryProvenCandidate: true, recent5EntryCandidate: true,
    historical: { total: 2, winRate: 50, profitFactor: 0.5, net: -1, expectancy: -0.5 }, recent5: recent,
    exit: noExit, evidence: evRecent,
    forward: { eligible: false, metrics: { closed: 0, profitFactor: 0, net: 0, expectancy: 0 } }
  };
  const weakEvidence = evidence.evaluate({
    strategyType: 'LAB_DNA', strategyKey: 'LAB-WEAK',
    historical: { total: 20, profitFactor: 0.8, net: -2, expectancy: -0.1 }, recent: {}, exit: noExit, live: {}
  });
  const weakCandidate = {
    labDnaId: 1003, labDnaLabel: 'LAB #1003', labKey: 'YON=LONG|BTC=1111|COIN=1111|BB=ORTA',
    familyDnaLabel: 'DNA #3', label: 'Weak', historicalCandidate: false,
    historical: { total: 20, profitFactor: 0.8, net: -2, expectancy: -0.1 }, recent5: {}, exit: noExit,
    evidence: weakEvidence, forward: { eligible: false, metrics: {} }
  };

  const league = labPremier.build({
    catalogue: { labChampions: [], evidenceCandidates: [historicalCandidate, recentCandidate, weakCandidate] },
    persist: false
  });
  assert.strictEqual(league.premierCount, 2, 'İki pozitif giriş DNA özel Exit olmadan Premier’e alınmalı');
  assert.strictEqual(league.entryFallbackCount, 2);
  assert.strictEqual(league.exitValidatedCount, 0);
  assert.strictEqual(league.policy.ownLabExitRequiredForVirtualPremierAdmission, false);
  assert.strictEqual(league.policy.ownLabExitRequiredForRealTrading, true);
  assert.strictEqual(league.allCandidates.find(x => x.labDnaId === 1003).labLeague, 'DEVELOPMENT');

  const row = league.premier.find(x => x.labDnaId === 1001);
  assert.strictEqual(row.proofLevel, 'HISTORICAL_ENTRY_PROVEN_FALLBACK');
  const decision = {
    version: labPremier.VERSION, at: new Date().toISOString(), symbol: 'SAFEUSDT', side: 'LONG',
    familyDnaId: 1, familyDnaLabel: 'DNA #1', familyKey: historicalCandidate.familyKey,
    labDnaId: 1001, labDnaLabel: 'LAB #1001', labKey: historicalCandidate.labKey,
    fullDnaId: 1, fullDnaLabel: 'FULL #1', fullKey: `${historicalCandidate.labKey}|PUSU=X`,
    labLeague: 'PREMIER', proofLevel: row.proofLevel, admissionReason: row.admissionReason,
    entryProven: true, exitValidated: false, safeExitFallback: true,
    upperLayerIncluded: true, virtualShadowOnly: false, sizeMultiplier: 1,
    historical, recent5: {}, evidence: evHistorical, forward: historicalCandidate.forward, exit: noExit,
    realTradingAuthorized: false, allowed: true, reasons: []
  };
  const pos = {
    sanal: true, sym: 'SAFEUSDT', yon: 'LONG', girisFiyati: 100, acilisZamani: Date.now(),
    executionExitAssignment: {
      ready: true, algorithmId: 'ATR_TRAIL_1_5X', label: 'ATR Trailing 1.5x',
      scope: 'BASE_DNA_SHOULD_NOT_LEAK', activeForPosition: true
    },
    exitPlanActiveForVirtual: true
  };
  labPremier.applyToPosition(pos, decision);
  assert.strictEqual(pos.leagueShadowOnly, false);
  assert.strictEqual(pos.virtualAccountIncluded, true);
  assert.strictEqual(pos.executionExitAssignment.algorithmId, 'ACTUAL');
  assert.strictEqual(pos.executionExitAssignment.scope, 'LAB_PREMIER_ENTRY_PROVEN_FALLBACK');
  assert.strictEqual(pos.executionExitAssignment.activeForPosition, false);
  assert.strictEqual(pos.exitPlanShadow.ready, false);
  assert.strictEqual(pos.exitPlanActiveForVirtual, false);
  const executor = dynamicExecutor.evaluate(pos, 101);
  assert.strictEqual(executor.active, false);
  assert.strictEqual(executor.reason, 'KANITLI_EXIT_YOK', 'Fallback mevcut kademe sistemine bırakılmalı');

  const validatedExit = {
    positive: true, ownLabExit: true, samples: 6, profitFactor: 1.7, netUsdt: 0.9, beatRate: 65,
    algorithmId: 'TIME_30M', algorithmLabel: '30 Dakika Exit', ready: true
  };
  const validatedEvidence = evidence.evaluate({ strategyType: 'LAB_DNA', strategyKey: historicalCandidate.labKey, historical, exit: validatedExit, live: {} });
  const validated = labPremier.build({ catalogue: { labChampions: [{
    ...historicalCandidate, historicalCandidate: true, exit: validatedExit, evidence: validatedEvidence
  }], evidenceCandidates: [] }, persist: false });
  assert.strictEqual(validated.premierCount, 1);
  assert.strictEqual(validated.exitValidatedCount, 1);
  assert.strictEqual(validated.entryFallbackCount, 0);
  assert.strictEqual(validated.premier[0].realTradingAuthorized, false);

  const telegram = labPremier.telegram({ league }, 9);
  assert.ok(telegram.includes('Entry-Proven/Fallback 2'));
  assert.ok(telegram.includes('Mevcut Kademe Sistemi'));
  assert.ok(telegram.includes('Gerçek emir için kendi Exit + ileri kanıt zorunlu'));

  const championSource = fs.readFileSync(require.resolve('./61_lab_champion_engine.js'), 'utf8');
  assert.ok(championSource.includes('baseRow.entryProvenCandidate || baseRow.warmStartCandidate'), 'Entry-Proven aday katalogdan düşmemeli');
  console.log('✅ v5.0.10 Entry-Proven Premier safe fallback passed | strong DNA races, ACTUAL fallback frozen, own Exit upgrades, real gate closed');
} finally {
  ayarlar.labPremierEntryProvenFallbackAktif = oldFallback;
  ayarlar.labPremierTarihselTestAktif = oldHistorical;
  ayarlar.labPremierIleriDogrulamaZorunlu = oldForward;
  ayarlar.sanalDynamicExitAktif = oldDynamic;
}
