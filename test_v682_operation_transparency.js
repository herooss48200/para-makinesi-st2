'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v682-transparency-'));
process.env.AGROS_DATA_DIR = tmp;

const operation = require('./82_st2_operation_transparency.js');
const pos = {
  sym: 'JTOUSDT', yon: 'LONG', girisFiyati: 0.508, sl: 0.50038, tp: 0.515,
  acilisZamani: Date.now() - 13 * 60 * 1000,
  dnaLabel: 'DNA #187', labDnaLabel: 'LAB #237', fullDnaLabel: 'FULL #172',
  labPremierDecision: { upperLayerIncluded: true, proofLevel: 'HISTORICAL_ADAPTIVE_RENKO_PREMIER' },
  girisAnalizi: { renkoEntryBrickDistance: 0.25, referansSeviye: 0.5067, tetikFiyati: 0.5076, patternKodu: 'RRRR', renkoBbState: 'ORTA_ALT' },
  renkoExitAssignment: { assignedTakeoverPct: 0.28, assignedSafeFloorPct: 0.15, assignedAtrMultiplier: 1.09, assignedCaptureRatio: 0.85, profileSamples: 19, takeoverSource: 'ONLINE_LEARNED_PROFILE' },
  journey: { mfeYuzde: 0.669, maeYuzde: 0 },
  renkoExitActivated: true, renkoProtectionStage: 'K3', renkoExitLastStopSourceLabel: 'Öğrenilmiş MFE kâr koruma',
  renkoProtectionTimeline: [
    { type: 'ASSIGNMENT', at: new Date(Date.now() - 13 * 60 * 1000).toISOString(), stage: 'K0' },
    { type: 'TAKEOVER_ACTIVE', at: new Date(Date.now() - 8 * 60 * 1000).toISOString(), price: 0.5095, profitPct: 0.30 },
    { type: 'NEW_PEAK', at: new Date(Date.now() - 3 * 60 * 1000).toISOString(), price: 0.5114, peakProfitPct: 0.669 },
    { type: 'STOP_MOVED', at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), oldStop: 0.5087, stop: 0.5108, reason: 'MFE_KORUMA', reasonLabel: 'Öğrenilmiş MFE kâr koruma' }
  ]
};
const opening = operation.openingText(pos, { real: false, pricePrecision: 6 });
for (const heading of ['GİRİŞ KARARI', 'AÇILIŞ BAĞLAMI', 'AÇILIŞ YÖNETİM PLANI', 'SABİTLENENLER', 'DİNAMİK ÇALIŞACAKLAR']) assert(opening.includes(heading), `açılış mesajında ${heading} eksik`);
assert(opening.includes('0.25 tuğla'));
assert(opening.includes('Takeover: +%0.28'));

const closing = operation.closingText(pos, {
  title: '[EXACT-CONTEXT PREMIER SANAL POZİSYON KAPANDI]', emoji: '✅', league: 'PREMIER', proof: 'HISTORICAL_ADAPTIVE_RENKO_PREMIER',
  openedAtText: '30.07.2026 16:20:56', closedAtText: '30.07.2026 16:34:28', durationText: '13dk 32sn', exitPrice: 0.510883,
  pricePrecision: 6, reason: 'Öğrenilmiş MFE kâr koruma', outcome: 'TP', fiyatKarYuzdesi: 0.567, grossPnl: 0.565, commission: 0.0996, netPnl: 0.4654
});
for (const heading of ['GİRİŞ KARARI', 'AÇILIŞ YÖNETİM PLANI', 'GERÇEKLEŞEN YÖNETİM', 'FİYAT YOLU VE KORUMA', 'KAPANIŞ']) assert(closing.includes(heading), `kapanış mesajında ${heading} eksik`);
assert(closing.includes('Takeover: <b>EVET</b>'));
assert(closing.includes('MFE Capture: %84.8'));
assert(!closing.includes('256 İMZA'), 'operasyon kapanışı bilimsel veri yığını içermemeli');

// Metot ataması bütün işlemleri kapsar: takeover öncesi SL de, takeover sonrası kâr da.
const scoreboard = require('./52_exit_method_scoreboard.js');
const p1 = { sym: 'A', yon: 'LONG', renkoExitAssignment: { assignedTakeoverPct: 0.28, assignedAtrMultiplier: 1.09, assignedCaptureRatio: 0.85 } };
scoreboard.open(p1); const s1 = scoreboard.close(p1, { outcome: 'SL', net: -1, commission: 0.1 });
assert.strictEqual(s1.assignment.preTakeoverSl, 1);
const p2 = { sym: 'B', yon: 'LONG', renkoExitAssignment: { assignedTakeoverPct: 0.28, assignedAtrMultiplier: 1.09, assignedCaptureRatio: 0.85 }, renkoExitActivated: true };
scoreboard.open(p2); const s2 = scoreboard.close(p2, { outcome: 'TP', net: 2, commission: 0.1 });
assert.strictEqual(s2.assignment.assigned, 2);
assert.strictEqual(s2.assignment.closed, 2);
assert.strictEqual(s2.assignment.preTakeoverSl, 1);
assert.strictEqual(s2.assignment.postTakeoverProfit, 1);
assert.strictEqual(s2.assignment.reconciled, true);
assert.strictEqual(s2.assignment.net, 1);

// Global optimizer aynı tetiklenen işlem evrenini karşılaştırır.
const evolution = require('./73_st2_renko_entry_evolution.js');
const global = require('./78_st2_global_historical_reconciliation.js');
evolution.read = () => ({ profiles: {} });
evolution.replayCandidate = posRow => posRow.sym === 'AUSDT'
  ? { triggered: true, net: 2, mfePct: 1, maePct: -0.2 }
  : { triggered: false, net: 0 };
const rows = [
  { closeId: 'A', pos: { sym: 'AUSDT', yon: 'LONG', girisAnalizi: { patternKodu: 'RRRR', renkoEntryBrickDistance: 0.75 } }, result: { net: 1 } },
  { closeId: 'B', pos: { sym: 'BUSDT', yon: 'LONG', girisAnalizi: { patternKodu: 'RGRR', renkoEntryBrickDistance: 0.75 } }, result: { net: 3 } }
];
const opt = global.optimizedEconomy(rows);
assert.strictEqual(opt.triggeredActual.n, 1);
assert.strictEqual(opt.triggeredActual.net, 1);
assert.strictEqual(opt.all.n, 1);
assert.strictEqual(opt.all.net, 2);
assert.strictEqual(opt.notTriggeredActual.net, 3);
assert.strictEqual(opt.theoreticalTotal.n, 2);
assert.strictEqual(opt.theoreticalTotal.net, 5, 'teorik toplam = tetiklenmeyen gerçek + tetiklenen replay');

const closeSource = fs.readFileSync('./4_pozisyon.js', 'utf8');
assert(closeSource.includes('operationTransparency.closingText'), 'ana kapanış yaşam döngüsü mesajını kullanmalı');
assert(closeSource.includes('blackbox.bilimselKapanisMetni'), 'bilimsel analiz ayrı mesaj olmalı');
assert(!closeSource.includes('blackbox.kapanisAnalizMetni(pos'), 'eski karışık kapanış analizi ana mesaja eklenmemeli');
assert(closeSource.includes('!restartGapIslemi && !manuelDisKapanis'), 'manuel dış kapanış bilimsel öğrenmeye girmemeli');

const blackboxSource = fs.readFileSync('./8_blackbox.js', 'utf8');
assert(blackboxSource.includes('BİRİKİMLİ GENİŞ 256 İMZA PERFORMANSI'));
assert(blackboxSource.includes('EXACT İMZA + BB PERFORMANSI'));
assert(blackboxSource.includes('Kararlı sonuç WR'));
const replaySource = fs.readFileSync('./22_exit_replay_engine.js', 'utf8');
assert(replaySource.includes("BU İŞLEMİN EXIT REPLAY SONUCU"));
assert(replaySource.includes("AYNI DNA'NIN BİRİKİMLİ EXIT PROFİLİ"));
assert(replaySource.includes('Canlı karar yetkisi'));
assert(replaySource.includes('Mutabakat: HESAPLANAMADI'));
console.log('✅ AGROS ST2 v6.8.2 operation lifecycle + scientific separation + same-universe analytics passed');
