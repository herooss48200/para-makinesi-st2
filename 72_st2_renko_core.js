function atr(mumlar, period = 14) {
    if (!Array.isArray(mumlar) || mumlar.length < period + 1) return 0;
    const tr = [];
    for (let i = 1; i < mumlar.length; i++) {
        const c = mumlar[i], prev = mumlar[i - 1];
        tr.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
    }
    const son = tr.slice(-period);
    return son.reduce((a, b) => a + b, 0) / son.length;
}
function renkoUret(mumlar, boxSize) {
    if (!Array.isArray(mumlar) || !mumlar.length || !(boxSize > 0)) return [];
    const bricks = [];
    let close = Number(mumlar[0].close), id = 0;
    for (let i = 1; i < mumlar.length; i++) {
        const candle = mumlar[i], price = Number(candle.close);
        while (price >= close + boxSize) {
            const open = close; close += boxSize;
            bricks.push({ id: ++id, open, high: close, low: open, close, color: 'GREEN', closeTime: candle.closeTime });
        }
        while (price <= close - boxSize) {
            const open = close; close -= boxSize;
            bricks.push({ id: ++id, open, high: open, low: close, close, color: 'RED', closeTime: candle.closeTime });
        }
    }
    return bricks;
}
function tetikFiyati(pusu, pctValue) {
    const pct = Number(pctValue || 0) / 100;
    return pusu.yon === 'LONG' ? pusu.referansSeviye * (1 + pct) : pusu.referansSeviye * (1 - pct);
}
function pusuOlustur(sym, yon, brick, scenario) {
    return { sym, entryStrategy: 'ST2_RENKO', yon, pusuTuglaRengi: brick.color,
        pusuTuglaOpen: brick.open, pusuTuglaHigh: brick.high, pusuTuglaLow: brick.low,
        pusuTuglaClose: brick.close, pusuTuglaId: brick.id,
        referansSeviye: yon === 'LONG' ? brick.high : brick.low, tuglaSayaci: 0,
        donusTuglasiKapandi: false, fiyatTetigiGoruldu: false, superTrendOnayi: false,
        senaryo: scenario.senaryo, olusumZamani: Date.now() };
}
function aktifPusudaTuglaIsle(pusu, brick, stTrend) {
    pusu.tuglaSayaci += 1;
    const donusRengi = pusu.yon === 'LONG' ? 'GREEN' : 'RED';
    if (!pusu.donusTuglasiKapandi && brick.color === donusRengi) {
        pusu.donusTuglasiKapandi = true; pusu.donusTuglasiId = brick.id; pusu.donusTuglasiClose = brick.close;
    }
    if ((pusu.yon === 'LONG' && stTrend === 'UP') || (pusu.yon === 'SHORT' && stTrend === 'DOWN')) pusu.superTrendOnayi = true;
    return pusu;
}
module.exports = { atr, renkoUret, tetikFiyati, pusuOlustur, aktifPusudaTuglaIsle };
