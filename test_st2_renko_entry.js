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
