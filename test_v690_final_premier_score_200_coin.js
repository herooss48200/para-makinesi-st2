'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v690-'));
const ayarlar = require('./ayarlar.js');
const quality = require('./83_st2_premier_quality_score.js');
const operation = require('./82_st2_operation_transparency.js');

assert.strictEqual(Number(ayarlar.taranacakCoinSayisi), 200, 'izlenen evren 200 coin olmalı');
assert.strictEqual(Object.values(quality.WEIGHTS).reduce((a, b) => a + b, 0), 100, 'Premier Score ağırlıkları %100 olmalı');
const context = { yon: 'LONG', pattern: 'RRRR', rbb: 'ALT', rbbw: 'NORMAL', renko6: 'RRRGRR', atr: 'ORTA', trend20: 'UP' };
const cohortScores = [42, 48, 52, 56, 60, 64, 68];
const strong = quality.evaluate({
  context, historicalPoolComplete: true, cohortScores,
  historical: { n: 24, pf: 2.4, expectancy: 0.24, net: 5.76, wr: 71 },
  live: { n: 6, pf: 1.9, expectancy: 0.18, net: 1.08, wr: 67 },
  entry: { n: 12, pf: 1.8, expectancy: 0.15, net: 1.8, wr: 67, reason: 'ENTRY_REPLAY_ACTIVE' },
  takeover: { n: 10, pf: 1.7, expectancy: 0.13, net: 1.3, wr: 60, mfeCapture: 76, avgGiveback: 0.08, confidence: 0.71, reason: 'TAKEOVER_REPLAY_ACTIVE' }
});
assert.strictEqual(strong.selected, true, `güçlü aday Premier olmalı: ${JSON.stringify(strong)}`);
assert(strong.score >= strong.threshold, 'güçlü aday eşiği geçmeli');
assert(strong.rank >= 1 && strong.cohortSize >= cohortScores.length, 'göreceli sıra üretilmeli');

const weak = quality.evaluate({
  context, historicalPoolComplete: true, cohortScores,
  historical: { n: 8, pf: 0.55, expectancy: -0.18, net: -1.44, wr: 25 },
  live: { n: 3, pf: 0.4, expectancy: -0.2, net: -0.6, wr: 33 },
  entry: { n: 3, pf: 0.6, expectancy: -0.12, net: -0.36, wr: 33 },
  takeover: { n: 3, pf: 0.5, expectancy: -0.1, net: -0.3, wr: 33, mfeCapture: 25, avgGiveback: 0.30 }
});
assert.strictEqual(weak.selected, false, 'zayıf aday Shadow olmalı');
assert.strictEqual(weak.reason, 'PREMIER_SCORE_BELOW_RELATIVE_THRESHOLD');

const incomplete = quality.evaluate({ context: { yon: 'LONG', pattern: 'RRRR' }, historicalPoolComplete: true, historical: { n: 20, pf: 3, expectancy: 1, net: 20 }, cohortScores });
assert.strictEqual(incomplete.selected, false, 'eksik exact-context fail-closed kalmalı');
assert.strictEqual(incomplete.reason, 'EXACT_CONTEXT_INCOMPLETE');

const pos = {
  sym: 'FINALUSDT', yon: 'LONG', girisFiyati: 1.01, sl: 0.99, tp: 1.05, acilisZamani: Date.now() - 60000,
  dnaLabel: 'DNA #1', labDnaLabel: 'LAB #2', fullDnaLabel: 'FULL #3',
  labPremierDecision: { upperLayerIncluded: true, premierScore: strong },
  renkoPremierDecision: { source: 'HISTORICAL_EXACT', closed: 24, pf: 2.4, expectancy: 0.24, net: 5.76, reason: strong.reason, activeBrick: 0.5, premierScore: strong },
  girisAnalizi: { renkoEntryBrickDistance: 0.5, referansSeviye: 1, tetikFiyati: 1.005, renkoBbState: 'ALT' },
  executionExitAssignment: { ready: false, label: 'Mevcut Kademe Sistemi', samples: 0, reason: 'EXIT_FALLBACK_N0' },
  renkoExitAssignment: { assignedTakeoverPct: 0.5, assignedSafeFloorPct: 0.2, assignedAtrMultiplier: 1.5, assignedCaptureRatio: 0.75, profileSamples: 6, profileConfidence: 0.6, takeoverSource: 'ONLINE_LEARNED_PROFILE' },
  journey: { mfeYuzde: 1.2, maeYuzde: -0.3 }
};
const open = operation.openingText(pos, { pricePrecision: 4 });
for (const text of ['Premier Score', 'ENTRY REPLAY', 'EXIT REPLAY', 'TAKEOVER REPLAY', 'Exit replay kanıtı: FALLBACK | N0']) assert(open.includes(text), `açılış ayrımı eksik: ${text}`);
const close = operation.closingText(pos, { title: 'KAPANDI', exitPrice: 1.02, pricePrecision: 4, reason: 'MFE KORUMA', outcome: 'TP', fiyatKarYuzdesi: 1, grossPnl: 0.5, commission: 0.05, netPnl: 0.45, replayUnavailableReason: 'EXIT_REPLAY_SELECTION_VALIDATION_NOT_AVAILABLE' });
for (const text of ['ENTRY REPLAY', 'EXIT REPLAY', 'TAKEOVER REPLAY', 'EXIT_FALLBACK_N0', 'TAKEOVER PROFİLİ ATANDI', 'EXIT_REPLAY_SELECTION_VALIDATION_NOT_AVAILABLE']) assert(close.includes(text), `kapanış ayrımı eksik: ${text}`);
assert(open.length < 3400 && close.length < 3400, `Telegram güvenli sınır aşıldı: ${open.length}/${close.length}`);

const reportSource = fs.readFileSync('2_rapor.js', 'utf8');
assert(reportSource.includes('🌐 Evren'), 'Telegram evren görünürlüğü eksik');
assert(reportSource.includes('Tarama'), 'Telegram tarama süresi eksik');
assert(reportSource.includes('Veri ${veriSagligi.durum}'), 'Telegram veri sağlığı eksik');
const closeSource = fs.readFileSync('4_pozisyon.js', 'utf8');
for (const reason of ['PRICE_PATH_MISSING', 'EXIT_REPLAY_ENGINE_RETURNED_NULL', 'EXIT_REPLAY_SELECTION_VALIDATION_NOT_AVAILABLE', 'RESTART_GAP_SCIENTIFICALLY_EXCLUDED', 'MANUAL_EXTERNAL_CLOSE_SCIENTIFICALLY_EXCLUDED']) assert(closeSource.includes(reason), `kesin replay nedeni eksik: ${reason}`);
const motorSource = fs.readFileSync('motor.js', 'utf8');
assert(motorSource.includes("authority: 'ST2_PREMIER_QUALITY_SCORE'"), 'Premier Score nihai otorite değil');
assert(motorSource.includes('premierQuality.applyLabReview'), 'canlı form puan düzeltmesine bağlanmamış');
assert(!motorSource.includes("const finalPremier = !exactLiveDemoted && !labLiveDemoted &&"), 'eski katı lig kapısı aktif kalmamalı');

console.log('✅ AGROS ST2 v6.9.0 final Premier Score + 200 coin + replay separation passed');
