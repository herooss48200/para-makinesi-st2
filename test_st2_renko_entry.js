'use strict';
const assert = require('assert');
const r = require('./72_st2_renko_core.js');

const b = (id, color) => ({
    id, color, open: 100 + id, close: 100 + id,
    high: 101 + id, low: 99 + id, closeTime: id * 1000
});

const longCases = [
    ['RRRR', 'L01', 'L1', 4], ['GRRR', 'L02', 'L1', 4],
    ['RGRR', 'L03', 'L1', 4], ['GGRR', 'L04', 'L1', 4],
    ['RRGR', 'L05', 'L2', 3], ['RGGR', 'L06', 'L2', 3],
    ['GRGR', 'L07', 'L2', 3], ['GGGR', 'L08', 'L2', 3]
];
for (const [code, id, family, refPosition] of longCases) {
    const bricks = [...code].map((c, i) => b(i + 1, c === 'R' ? 'RED' : 'GREEN'));
    const m = r.longPatternTespit(bricks);
    assert(m, `${code} eşleşmedi`);
    assert.strictEqual(m.patternId, id);
    assert.strictEqual(m.family, family);
    assert.strictEqual(m.referenceBrick.id, refPosition);
}

const special = [...'RGGRR'].map((c, i) => b(i + 1, c === 'R' ? 'RED' : 'GREEN'));
const specialMatch = r.longPatternTespit(special);
assert.strictEqual(specialMatch.patternId, 'L09');
assert.strictEqual(specialMatch.patternLength, 5);
assert.strictEqual(specialMatch.referenceBrick.id, 5);

const shortMirror = [...'GGGG'].map((c, i) => b(i + 1, c === 'G' ? 'GREEN' : 'RED'));
const shortMatch = r.shortPatternTespit(shortMirror);
assert.strictEqual(shortMatch.patternId, 'S01');
assert.strictEqual(shortMatch.referenceType, 'SON_YESIL_LOW');
assert.strictEqual(shortMatch.referenceBrick.id, 4);

assert.strictEqual(r.tetikFiyati({ yon: 'LONG', referansSeviye: 100 }, 0.05), 100.05);
assert.strictEqual(r.tetikFiyati({ yon: 'SHORT', referansSeviye: 100 }, 0.05), 99.95);
const pusu = r.pusuOlustur('TEST', specialMatch, { senaryo: 'KIRMIZI_MUM_ALT_BAND' });
assert.strictEqual(pusu.patternId, 'L09');
assert.strictEqual(pusu.patternAilesi, 'L3');
assert.strictEqual(pusu.referansSeviye, specialMatch.referenceLevel);

const candles = [];
let close = 100;
for (let i = 0; i < 30; i++) {
    const prev = close;
    close += i < 15 ? -0.2 : 0.25;
    candles.push({ open: prev, high: Math.max(prev, close) + 0.1, low: Math.min(prev, close) - 0.1, close, closeTime: i + 1 });
}
assert(r.atr(candles, 14) > 0);
assert(r.renkoUret(candles, 0.5).length > 0);
console.log('✅ ST2 Renko 9-pattern + mirror SHORT contract tests passed');

// Sprint 2: canlı BB derinliği ve sözleşme testi.
const deepCandles = [];
let deepClose = 100;
for (let i = 0; i < 250; i++) {
    const prev = deepClose;
    deepClose += (i % 12 < 6 ? -0.35 : 0.42);
    deepCandles.push({ open: prev, high: Math.max(prev, deepClose) + 0.08, low: Math.min(prev, deepClose) - 0.08, close: deepClose, closeTime: 10_000 + i });
}
const deepAtr = r.atr(deepCandles, 14);
const deepBricks = r.renkoUret(deepCandles, deepAtr);
assert(deepBricks.length >= 20, `250 mum BB(20) için yetersiz Renko üretti: ${deepBricks.length}`);
const closes = deepBricks.slice(-20).map(x => x.close);
const mid = closes.reduce((a, b) => a + b, 0) / closes.length;
const sd = Math.sqrt(closes.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / closes.length);
const deepBb = { mid, upper: [mid + 2 * sd], lower: [mid - 2 * sd] };
assert(r.bollingerHazirMi(deepBb), 'Renko Bollinger sözleşmesi hazır değil');
assert.strictEqual(r.bollingerHazirMi({ mid: 100, upper: 101, lower: 99 }), false);
console.log(`✅ ST2 Sprint 2 BB depth contract passed (${deepBricks.length} Renko bricks)`);

// v5.5.4: ST2-only Renko BB teması; orta/üst bölgedeki kırmızı tuğla LONG üretmemeli.
const lowerTouchMatch = r.longPatternTespit([
    b(101, 'RED'), b(102, 'RED'), b(103, 'RED'),
    { ...b(104, 'RED'), open: 100, high: 100, low: 99, close: 99 }
]);
const strictBb = { mid: 102, upper: [105], lower: [99] };
const lowerTouch = r.renkoBollingerSenaryosu(lowerTouchMatch, strictBb, 1, 0.25);
assert.strictEqual(lowerTouch.senaryo, 'RENKO_KIRMIZI_ALT_BAND');
assert.strictEqual(lowerTouch.temas, true);

const middleRedMatch = r.longPatternTespit([
    b(201, 'RED'), b(202, 'RED'), b(203, 'RED'),
    { ...b(204, 'RED'), open: 104, high: 104, low: 103, close: 103 }
]);
const middleRed = r.renkoBollingerSenaryosu(middleRedMatch, strictBb, 1, 0.25);
assert.strictEqual(middleRed.senaryo, null);
assert(['LONG_ALT_BAND_TEMASI_YOK', 'LONG_TUGLA_ORTA_BAND_ALTINDA_DEGIL'].includes(middleRed.redSebep));

// Tek kutuluk ters hareket standart Renko'da ters tuğla oluşturmamalı; iki kutuda oluşturmalı.
const reversalCandles = [
    { open: 100, high: 100, low: 100, close: 100, closeTime: 1 },
    { open: 100, high: 102, low: 100, close: 102, closeTime: 2 },
    { open: 102, high: 102, low: 101, close: 101, closeTime: 3 },
    { open: 101, high: 101, low: 100, close: 100, closeTime: 4 }
];
const reversalBricks = r.renkoUret(reversalCandles, 1);
assert.strictEqual(r.renkKodu(reversalBricks), 'GGR', `Beklenen GGR, gelen ${r.renkKodu(reversalBricks)}`);
console.log('✅ ST2 Renko chart-consistency + strict BB touch tests passed');
