'use strict';

function atr(mumlar, period = 14) {
    if (!Array.isArray(mumlar) || mumlar.length < period + 1) return 0;
    const tr = [];
    for (let i = 1; i < mumlar.length; i++) {
        const c = mumlar[i];
        const prev = mumlar[i - 1];
        tr.push(Math.max(
            Number(c.high) - Number(c.low),
            Math.abs(Number(c.high) - Number(prev.close)),
            Math.abs(Number(c.low) - Number(prev.close))
        ));
    }
    const son = tr.slice(-period).filter(Number.isFinite);
    return son.length === period ? son.reduce((a, b) => a + b, 0) / son.length : 0;
}

function renkoUret(mumlar, boxSize) {
    if (!Array.isArray(mumlar) || !mumlar.length || !(boxSize > 0)) return [];
    const bricks = [];
    let close = Number(mumlar[0].close);
    let id = 0;
    if (!Number.isFinite(close)) return [];

    for (let i = 1; i < mumlar.length; i++) {
        const candle = mumlar[i];
        const price = Number(candle.close);
        if (!Number.isFinite(price)) continue;
        while (price >= close + boxSize) {
            const open = close;
            close += boxSize;
            bricks.push({ id: ++id, open, high: close, low: open, close, color: 'GREEN', closeTime: candle.closeTime });
        }
        while (price <= close - boxSize) {
            const open = close;
            close -= boxSize;
            bricks.push({ id: ++id, open, high: open, low: close, close, color: 'RED', closeTime: candle.closeTime });
        }
    }
    return bricks;
}


function bollingerHazirMi(bb) {
    return Boolean(
        bb && Array.isArray(bb.upper) && Array.isArray(bb.lower) &&
        bb.upper.length && bb.lower.length &&
        Number.isFinite(Number(bb.upper.at(-1))) &&
        Number.isFinite(Number(bb.lower.at(-1))) &&
        Number.isFinite(Number(bb.mid))
    );
}

function renkKodu(bricks) {
    return bricks.map(b => b.color === 'GREEN' ? 'G' : 'R').join('');
}

const LONG_4 = {
    RRRR: { patternId: 'L01', family: 'L1', referenceIndex: 3, referenceType: 'SON_KIRMIZI_HIGH' },
    GRRR: { patternId: 'L02', family: 'L1', referenceIndex: 3, referenceType: 'SON_KIRMIZI_HIGH' },
    RGRR: { patternId: 'L03', family: 'L1', referenceIndex: 3, referenceType: 'SON_KIRMIZI_HIGH' },
    GGRR: { patternId: 'L04', family: 'L1', referenceIndex: 3, referenceType: 'SON_KIRMIZI_HIGH' },
    RRGR: { patternId: 'L05', family: 'L2', referenceIndex: 2, referenceType: 'SON_YESIL_HIGH' },
    RGGR: { patternId: 'L06', family: 'L2', referenceIndex: 2, referenceType: 'SON_YESIL_HIGH' },
    GRGR: { patternId: 'L07', family: 'L2', referenceIndex: 2, referenceType: 'SON_YESIL_HIGH' },
    GGGR: { patternId: 'L08', family: 'L2', referenceIndex: 2, referenceType: 'SON_YESIL_HIGH' }
};

const SPECIAL_LONG_5 = 'RGGRR';

function longPatternTespit(bricks) {
    if (!Array.isArray(bricks) || bricks.length < 4) return null;

    // Özel 5'li, 4'lü son-ek eşleşmesinden önce değerlendirilir ve ayrı DNA etiketi alır.
    if (bricks.length >= 5) {
        const last5 = bricks.slice(-5);
        if (renkKodu(last5) === SPECIAL_LONG_5) {
            const ref = last5[4];
            return {
                yon: 'LONG', patternId: 'L09', family: 'L3', patternLength: 5,
                patternCode: SPECIAL_LONG_5, referenceType: 'SON_KIRMIZI_HIGH',
                referenceBrick: ref, referenceLevel: Number(ref.high), bricks: last5
            };
        }
    }

    const last4 = bricks.slice(-4);
    const code = renkKodu(last4);
    const def = LONG_4[code];
    if (!def) return null;
    const ref = last4[def.referenceIndex];
    return {
        yon: 'LONG', ...def, patternLength: 4, patternCode: code,
        referenceBrick: ref, referenceLevel: Number(ref.high), bricks: last4
    };
}

function shortPatternTespit(bricks) {
    if (!Array.isArray(bricks) || bricks.length < 4) return null;
    const mirrored = bricks.map(b => ({ ...b, color: b.color === 'GREEN' ? 'RED' : 'GREEN' }));
    const longMatch = longPatternTespit(mirrored);
    if (!longMatch) return null;
    const mirroredTail = mirrored.slice(-longMatch.patternLength);
    const originalBricks = bricks.slice(-longMatch.patternLength);
    const refOffset = mirroredTail.findIndex(b => b === longMatch.referenceBrick);
    const ref = originalBricks[refOffset >= 0 ? refOffset : originalBricks.length - 1];
    return {
        ...longMatch,
        yon: 'SHORT',
        patternId: longMatch.patternId.replace('L', 'S'),
        patternCode: renkKodu(originalBricks),
        referenceType: longMatch.referenceType === 'SON_KIRMIZI_HIGH' ? 'SON_YESIL_LOW' : 'SON_KIRMIZI_LOW',
        referenceBrick: ref,
        referenceLevel: Number(ref.low),
        bricks: originalBricks
    };
}

function patternTespit(bricks, yon) {
    return yon === 'SHORT' ? shortPatternTespit(bricks) : longPatternTespit(bricks);
}

function patternSignature(match) {
    if (!match) return '';
    const tail = match.bricks.map(b => `${b.color}:${b.closeTime}:${Number(b.close).toFixed(12)}`).join('|');
    return `${match.yon}:${match.patternId}:${tail}`;
}

function tetikFiyati(pusu, pctValue) {
    const pct = Number(pctValue || 0) / 100;
    return pusu.yon === 'LONG'
        ? Number(pusu.referansSeviye) * (1 + pct)
        : Number(pusu.referansSeviye) * (1 - pct);
}

function pusuOlustur(sym, match, scenario) {
    if (!match || !match.referenceBrick) throw new Error('ST2 Renko pusu için geçerli pattern eşleşmesi zorunludur.');
    return {
        sym,
        entryStrategy: 'ST2_RENKO',
        yon: match.yon,
        patternId: match.patternId,
        patternAilesi: match.family,
        patternKodu: match.patternCode,
        patternUzunlugu: match.patternLength,
        patternSignature: patternSignature(match),
        referansTipi: match.referenceType,
        referansSeviye: match.referenceLevel,
        referansTuglaId: match.referenceBrick.id,
        referansTuglaRengi: match.referenceBrick.color,
        referansTuglaHigh: match.referenceBrick.high,
        referansTuglaLow: match.referenceBrick.low,
        sonKapaliTuglaId: match.bricks.at(-1).id,
        sonKapaliTuglaRengi: match.bricks.at(-1).color,
        sonKapaliTuglaZamani: match.bricks.at(-1).closeTime,
        fiyatTetigiGoruldu: false,
        superTrendOnayi: false,
        senaryo: scenario?.senaryo || null,
        bollingerDurumu: scenario || null,
        olusumZamani: Date.now()
    };
}

module.exports = {
    atr,
    renkoUret,
    bollingerHazirMi,
    renkKodu,
    longPatternTespit,
    shortPatternTespit,
    patternTespit,
    patternSignature,
    tetikFiyati,
    pusuOlustur
};
