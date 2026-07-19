const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const family = require('./59_dna_identity_registry.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');
const labChampion = require('./61_lab_champion_engine.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');

const protectedFiles = [
  family.REGISTRY_FILE, family.BACKUP_FILE, family.JOURNAL_FILE, `${family.REGISTRY_FILE}.lock`,
  hierarchy.REGISTRY_FILE, hierarchy.BACKUP_FILE, hierarchy.JOURNAL_FILE,
  labChampion.STATE_FILE, labChampion.TRADES_FILE, labChampion.MODEL_FILE
];
const snapshots = new Map(protectedFiles.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
const oldSummary = h.state.blackboxOzet;
const oldActive = h.state.aktifPozisyonlar;
const oldReadModel = dynamicExit.readModel;
const oldSelect = dynamicExit.selectForPosition;
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
  h.state.blackboxOzet = oldSummary;
  h.state.aktifPozisyonlar = oldActive;
  dynamicExit.readModel = oldReadModel;
  dynamicExit.selectForPosition = oldSelect;
}
function bucket({ toplam, tp, sl, be = 0, net, kar, zarar, etiket, key }) {
  return { toplam, tp, sl, be, net, karToplam: kar, zararToplam: zarar, etiket, key };
}

try {
  protectedFiles.forEach(remove);
  fs.mkdirSync(path.dirname(family.REGISTRY_FILE), { recursive: true });

  const familyKey = 'YON=LONG|BTC=0011|COIN=0010';
  const labRaw = `${familyKey}|BTC_TF=1H+4H|COIN_TF=1H|BB=ORTA_ALT`;
  const labKey = `${familyKey}|BB=ORTA_ALT`;
  const fullA = `${labKey}|PUSU=KIRMIZI_MUM_ALT_BAND`;
  const fullB = `${labKey}|PUSU=KIRMIZI_MUM_ALT_BAND_V2`;
  const otherLab = 'YON=SHORT|BTC=1111|COIN=1111|BB=ORTA_UST';
  const otherFull = `${otherLab}|PUSU=YESIL_MUM_UST_BAND`;

  // Existing Family DNA #32 is part of the permanent history and must never be renumbered.
  const registry = {
    version: family.VERSION,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    nextId: 33, count: 1,
    entries: {
      [familyKey]: { id: 32, label: 'DNA #32', key: familyKey, aliases: [labRaw], firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), firstSource: 'TEST', lastSource: 'TEST' }
    },
    audit: { valid: true, duplicateIds: [], duplicateKeys: [], maxId: 32, nextId: 33 }
  };
  fs.writeFileSync(family.REGISTRY_FILE, JSON.stringify(registry));
  fs.writeFileSync(family.BACKUP_FILE, JSON.stringify(registry));
  assert.strictEqual(family.readRegistry({ refresh: true }).entries[familyKey].id, 32);

  const summary = {
    long: { toplam: 28 }, short: { toplam: 2075 },
    exactComboStats: {
      [labRaw]: bucket({ toplam: 28, tp: 25, sl: 3, net: 11.45, kar: 13.84, zarar: 2.39, key: labRaw, etiket: 'LONG | BTC[1h+4h] 2/4 | Coin[1h] 1/4 | BB ORTA_ALT' }),
      [otherLab]: bucket({ toplam: 2075, tp: 900, sl: 1175, net: -100, kar: 500, zarar: 600, key: otherLab, etiket: 'OTHER' })
    },
    fullSignatureStats: {
      [fullA]: bucket({ toplam: 18, tp: 17, sl: 1, net: 8.2, kar: 8.8, zarar: 0.6, key: fullA, etiket: 'Full A' }),
      [fullB]: bucket({ toplam: 10, tp: 8, sl: 2, net: 3.25, kar: 4.0, zarar: 0.75, key: fullB, etiket: 'Full B' }),
      [otherFull]: bucket({ toplam: 2075, tp: 900, sl: 1175, net: -100, kar: 500, zarar: 600, key: otherFull, etiket: 'Other Full' })
    }
  };
  h.state.blackboxOzet = summary;
  h.state.aktifPozisyonlar = [];

  dynamicExit.readModel = () => ({ currentRegime: { key: 'RANGE|VOL_HIGH' } });
  dynamicExit.selectForPosition = () => ({
    ready: true,
    selectedAlgorithmId: 'TIME_30M', selectedAlgorithmLabel: '30 Dakika Exit',
    samples: 28, beatRate: 80.8, profitFactor: 5.81, netUsdt: 11.99,
    selectionScope: 'EXACT_REGIME_VOLATILITY', selectionQuality: 'POSITIVE_CONFIRMED',
    signature: `${familyKey}|DETAIL=ORTA_ALT`, currentRegime: { key: 'RANGE|VOL_HIGH' }, reason: 'LAB OWN EXIT'
  });

  const before = JSON.stringify(summary);
  const migration = hierarchy.bootstrapFromBlackbox(summary, { source: 'V470_TEST' });
  assert.strictEqual(migration.coverage.baseClosed, 2103);
  assert.strictEqual(migration.coverage.labClosed, 2103);
  assert.strictEqual(migration.coverage.fullClosed, 2103);
  assert.strictEqual(migration.coverage.complete, true, '2103 kapanış LAB/FULL katmanında eksiksiz kapsanmalı');
  assert.strictEqual(summary.exactComboStats[labRaw].toplam, 28, 'Tarihsel sayaç değişmemeli');
  assert.strictEqual(summary.exactComboStats[labRaw].net, 11.45, 'Tarihsel net değişmemeli');

  const labId = hierarchy.findLab(labRaw);
  const fullIdA = hierarchy.findFull(fullA);
  const fullIdB = hierarchy.findFull(fullB);
  assert.ok(labId && labId.id > 0 && labId.label !== 'LAB #YOK');
  assert.strictEqual(labId.familyId, 32, 'LAB şampiyonu mevcut DNA #32 ailesinde kalmalı');
  assert.ok(fullIdA && fullIdB && fullIdA.id !== fullIdB.id, 'Pusu varyantları ayrı FULL kimlik almalı');
  assert.strictEqual(fullIdA.labKey, labKey);
  assert.strictEqual(hierarchy.audit().valid, true);

  // Corrupt main registry must recover from backup + append-only journal without ID reuse.
  const labBeforeRecovery = labId.id;
  const fullBeforeRecovery = fullIdA.id;
  fs.writeFileSync(hierarchy.REGISTRY_FILE, '{BOZUK JSON');
  const recovered = hierarchy.readRegistry({ refresh: true });
  assert.strictEqual(recovered.lab[labKey].id, labBeforeRecovery, 'LAB ID bozulma sonrası değişmemeli');
  assert.strictEqual(recovered.full[fullA].id, fullBeforeRecovery, 'FULL ID bozulma sonrası değişmemeli');
  const recoveredMaxLabId = Math.max(...Object.values(recovered.lab).map(row => Number(row.id) || 0));
  const newLab = hierarchy.ensureLab('YON=LONG|BTC=1010|COIN=0101|BB=ORTA', { source: 'RECOVERY_ID_TEST' });
  assert.ok(newLab.id > recoveredMaxLabId, 'Kurtarma sonrası eski LAB ID tekrar kullanılmamalı');
  assert.strictEqual(hierarchy.findLab(labRaw).id, labBeforeRecovery);

  const model = labChampion.build({ summary, dynamicModel: dynamicExit.readModel(), persist: false });
  assert.strictEqual(model.sourceClosed, 2103);
  assert.strictEqual(model.championCount, 1, '28 örnekli altın DNA şampiyon listesinde olmalı');
  assert.strictEqual(model.lostChampionCount, 0);
  const champion = model.labChampions[0];
  assert.strictEqual(champion.familyDnaLabel, 'DNA #32');
  assert.strictEqual(champion.historical.total, 28);
  assert.ok(Math.abs(champion.historical.winRate - 89.2857) < 0.01);
  assert.ok(Math.abs(champion.historical.profitFactor - 5.79079) < 0.05);
  assert.strictEqual(champion.historical.net, 11.45);
  assert.strictEqual(champion.fullChildren.length, 2);
  assert.strictEqual(champion.exit.ownLabExit, true);
  assert.strictEqual(champion.exit.positive, true);
  assert.strictEqual(champion.promotionReady, false, 'İleri kanıt olmadan terfi hazır denmemeli');
  assert.strictEqual(model.policy.realTradingAuthorized, false);
  assert.strictEqual(model.policy.secondOrderCreated, false);

  // Five new virtual outcomes use the same position/replay path; no second position is created.
  for (let i = 0; i < 5; i++) {
    const pos = {
      sanal: true, sym: `TEST${i}USDT`, yon: 'LONG', tradeId: `T-${i}`,
      blackboxAcilis: { strategySignature: { key: labRaw, shortKey: 'L_B0011_C0010_ORTA_ALT', yon: 'LONG', btcBits: '0011', coinBits: '0010', bb: 'ORTA_ALT' } },
      girisAnalizi: { pusuKalite: { senaryo: 'KIRMIZI_MUM_ALT_BAND' } },
      exitPlanShadow: dynamicExit.selectForPosition()
    };
    const activeBefore = h.state.aktifPozisyonlar.length;
    const observation = labChampion.snapshot(pos);
    assert.ok(observation, 'Lab şampiyonu aynı sanal pozisyonda izlenmeli');
    assert.strictEqual(h.state.aktifPozisyonlar.length, activeBefore, 'Lab köprüsü ikinci pozisyon/emir oluşturmamalı');
    assert.strictEqual(observation.secondOrderCreated, false);
    const replay = { input: { tradeId: pos.tradeId }, results: [{ algorithmId: 'TIME_30M', netUsdt: 0.8 }] };
    const row = labChampion.close(pos, { netKarZarar: -0.2, komisyon: 0.02 }, replay);
    assert.strictEqual(row.replayEvaluated, true);
    assert.strictEqual(row.selectedExitNet, 0.8);
    assert.strictEqual(row.realTradingAuthorized, false);
  }

  const proven = labChampion.build({ summary, dynamicModel: dynamicExit.readModel(), persist: false });
  assert.strictEqual(proven.labChampions[0].forward.eligible, true, 'N5 PF/Net/Exp pozitif ileri kanıt geçmeli');
  assert.strictEqual(proven.labChampions[0].promotionReady, true, 'Tarihsel + kendi Exit + ileri kanıt birleşince sanal terfi hazır olmalı');
  assert.strictEqual(proven.labChampions[0].realTradingAuthorized, false, 'Lab köprüsü gerçek emir yetkisi veremez');

  const text = labChampion.telegram(proven, 5);
  assert.ok(text.includes('2000+ ÖĞRENME'));
  assert.ok(text.includes('DNA #32'));
  assert.ok(text.includes(labId.label));
  assert.ok(text.includes('Tarihsel N28'));
  assert.ok(text.includes('TERFİ HAZIR'));
  assert.ok(!text.includes('LAB #YOK'));
  assert.ok(!text.includes('FULL #YOK'));

  // Decoration may add IDs only; historical values must remain untouched.
  const after = JSON.parse(JSON.stringify(summary));
  const stripped = value => JSON.parse(JSON.stringify(value, (k, v) => /DnaId|DnaLabel|IdentityKey/.test(k) ? undefined : v));
  assert.deepStrictEqual(stripped(after), stripped(JSON.parse(before)), 'Göç sayaç/performans değerlerini değiştirmemeli');

  console.log('✅ v4.7.0 Golden Full DNA + Lab Champion tests passed | DNA #32 preserved, N28 restored, 2103/2103 coverage, zero second order, real gate closed');
} finally {
  restore();
}
