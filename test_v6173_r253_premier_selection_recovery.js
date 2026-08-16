
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(req, parent, isMain) {
  if (req === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (req === 'binance-api-node') return { default: () => ({}) };
  if (req === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (req === 'technicalindicators') return {};
  return originalLoad.call(this, req, parent, isMain);
};

process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r253-premier-'));
const ayarlar = require('./ayarlar.js');
const quality = require('./83_st2_premier_quality_score.js');
const league = require('./62_lab_premier_league.js');

assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 20, 'R25.3 gerçek slot 20 olmalı');
assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac, 20, 'pozisyon başına notional 20 USDT kalmalı');
assert.strictEqual(ayarlar.labCanliLigMinKapanis, 5, 'N5 lifecycle değiştirilmemeli');
assert.deepStrictEqual(quality.scoreCoinVetoBits().sort(), ['1000','1001']);

function score(selected, hardReasons = []) {
  return {
    score: selected ? 80 : 45, threshold: 60, selected, executionMode: selected ? 'PREMIER' : 'SHADOW',
    reason: selected ? 'PREMIER_SCORE_SELECTED' : 'PREMIER_SCORE_BELOW_RELATIVE_THRESHOLD',
    hardReasons, policySource: 'CALIBRATED', rank: 1, cohortSize: 20
  };
}
function review(currentLeague, net, pf, expectancy) {
  return {
    complete: true, currentLeague,
    metrics: { closed: 5, tp: currentLeague === 'PREMIER' ? 4 : 2, sl: currentLeague === 'PREMIER' ? 1 : 3, be: 0, net, profitFactor: pf, expectancy, winRate: currentLeague === 'PREMIER' ? 80 : 40 },
    thresholds: { minClosed: 5, minPf: 1, minNet: 0, minExpectancy: 0 }
  };
}

// OOS ile doğrulanmış kötü Score cohort: normal score seçse bile COIN1000/1001 yeni gerçek Premier olamaz.
for (const coin of ['1000','1001']) {
  const r = quality.resolveSelectionAuthority(score(true), null, { labKey: `YON=LONG|BTC=1100|COIN=${coin}|BB=UST`, baseTrack: 'PREMIER_SCORE_SHADOW' });
  assert.strictEqual(r.selected, false, `${coin} normal Score-Premier veto edilmedi`);
  assert.strictEqual(r.selectionAuthority.authority, 'PREMIER_SCORE_OOS_COHORT_FILTER');
  assert.strictEqual(r.selectionAuthority.scoreCoinVeto, true);
}

// Kontrol cohort: COIN1100 normal Score-Premier yolunu kullanmaya devam eder.
const clean = quality.resolveSelectionAuthority(score(true), null, { labKey: 'YON=LONG|BTC=1100|COIN=1100|BB=UST', baseTrack: 'PREMIER_SCORE_SHADOW' });
assert.strictEqual(clean.selected, true);
assert.strictEqual(clean.selectionAuthority.authority, 'PREMIER_QUALITY_SCORE');

// İyi Shadow aynı tam LAB bağlamında N5 pozitif ekonomi kanıtladığında geniş cohort veto kalkar.
const recovered = quality.resolveSelectionAuthority(score(false, ['PREMIER_SCORE_MIN_SAMPLE_N2/3']), review('PREMIER', 0.75, 2.4, 0.15), {
  labKey: 'YON=LONG|BTC=1100|COIN=1001|BB=ORTA_UST', baseTrack: 'HISTORICAL_CONTEXT_SHADOW'
});
assert.strictEqual(recovered.selected, true, 'N5 pozitif Shadow Premier recovery üretmedi');
assert.strictEqual(recovered.reason, 'LAB_LIVE_N5_POSITIVE_ECONOMY_OVERRIDE');
assert.strictEqual(recovered.hardReasons.length, 0, 'N5 live proof tarihsel örnek yetersizliğini aşabilmeli');
assert.strictEqual(recovered.selectionAuthority.authority, 'LAB_LIVE_N5_ECONOMY');

// Kötü Premier N5 negatif ekonomi üretirse yüksek Score bile sonraki girişte veto edilir.
const demoted = quality.resolveSelectionAuthority(score(true), review('SHADOW', -1.2, 0.45, -0.24), {
  labKey: 'YON=LONG|BTC=1110|COIN=1100|BB=UST', baseTrack: 'PREMIER_SCORE_RANKED'
});
assert.strictEqual(demoted.selected, false, 'N5 negatif ekonomi yüksek Scoreu veto etmedi');
assert.strictEqual(demoted.reason, 'LAB_LIVE_N5_NEGATIVE_ECONOMY_VETO');

// Güçlü Renko Premier N5 oluşana kadar Score düşüklüğü yüzünden ezilmez.
const renko = quality.resolveSelectionAuthority(score(false, ['PREMIER_SCORE_MIN_SAMPLE_N2/3']), null, {
  labKey: 'YON=SHORT|BTC=1111|COIN=1000|BB=ALT', baseTrack: 'RENKO_PATTERN_PREMIER'
});
assert.strictEqual(renko.selected, true, 'RENKO_PATTERN_PREMIER korunmadı');
assert.strictEqual(renko.reason, 'RENKO_PATTERN_PREMIER_PRESERVED');

// Yapısal context hatası N5 pozitif olsa bile gerçek emir fail-closed kalmalı.
const structural = quality.resolveSelectionAuthority(score(false, ['EXACT_CONTEXT_INCOMPLETE']), review('PREMIER', 1, 3, 0.2), {
  labKey: 'YON=LONG|BTC=1100|COIN=1001|BB=UST', baseTrack: 'HISTORICAL_CONTEXT_SHADOW'
});
assert.strictEqual(structural.selected, false);
assert.strictEqual(structural.hardReasons[0], 'EXACT_CONTEXT_INCOMPLETE');

// At-open identity daha sonraki applyToPosition çağrısında yeniden yazılmamalı.
const openPos = { sanal: true, premierTrackAtOpen: 'PREMIER_SCORE_RANKED', labLeagueAtOpen: 'PREMIER', labProofLevelAtOpen: 'ST2_PREMIER_SCORE_SELECTED' };
league.applyToPosition(openPos, {
  upperLayerIncluded: false, labLeague: 'DEVELOPMENT', premierTrack: 'PREMIER_SCORE_SHADOW', proofLevel: 'LAB_LIVE_N5_DEMOTED_TO_SHADOW',
  observationEligible: true, virtualShadowOnly: true, exit: null, labKey: 'YON=LONG|BTC=1100|COIN=1100|BB=UST'
});
assert.strictEqual(openPos.premierTrackAtOpen, 'PREMIER_SCORE_RANKED', 'açık Premier track kimliği Shadowa çevrildi');
assert.strictEqual(openPos.labLeagueAtOpen, 'PREMIER', 'açık Premier lig kimliği Shadowa çevrildi');

const motorSource = fs.readFileSync('./motor.js','utf8');
assert(motorSource.includes('premierSelectionFrozenAtOpen === true'), 'motor açık pozisyon final seçim freeze guard eksik');
assert(motorSource.includes("'LAB_LIVE_PROMOTED_PREMIER'"), 'N5 recovery track binding eksik');
assert(motorSource.includes("'RENKO_PATTERN_PREMIER'"), 'Renko Premier preservation binding eksik');

Module._load = originalLoad;
console.log('✅ R25.3 Premier selection recovery passed | OOS COIN1000/1001 veto + N5 Shadow recovery/demotion + Renko preserve + at-open freeze + 20 slot x 20USDT');
