/**
 * AGROS v3.5.2 Position Sizing Audit
 *
 * Amaç:
 * - Emir miktarı sıfıra/limit altına düştüğünde tahmin yürütmek yerine hesap zincirini kaydetmek.
 * - BTC/ETH/XMR gibi fiyatı yüksek sembollerde minQty/minNotional neden karşılanmıyor sorusunu netleştirmek.
 * - Trade Engine riskini otomatik büyütmeden sadece teşhis + kontrollü atlama yapmak.
 */

const SON_LOG_ARALIGI_MS = 15 * 60 * 1000;

function sayi(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function fmt(value, digits = 8) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'NA';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return n.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

function sebepBul({ guvenliMiktar, minQty, notional, minNotional, toplamDolar, gerekliNotional }) {
    if (!Number.isFinite(guvenliMiktar) || guvenliMiktar <= 0) return 'QTY_ZERO_OR_INVALID';
    if (guvenliMiktar < minQty) return 'MIN_QTY_ALTINDA';
    if (notional < minNotional) return 'MIN_NOTIONAL_ALTINDA';
    if (toplamDolar < gerekliNotional) return 'AYRILAN_NOTIONAL_YETERSIZ';
    return 'BILINMEYEN_MIKTAR_RED';
}

function auditHesapla({ symbol, yon, canliFiyat, ayarlar, kural, hamMiktar, guvenliMiktar, stepSize }) {
    const kaldirac = sayi(ayarlar.mevcutKaldirac, 1);
    const marjin = sayi(ayarlar.calisilmakIstenenUsdtMiktar, 0);
    const toplamDolar = marjin * kaldirac;
    const fiyat = sayi(canliFiyat, 0);
    const minQty = sayi(kural.minQty, 0);
    const minNotional = sayi(kural.minNotional, 5);
    const notional = sayi(guvenliMiktar, 0) * fiyat;
    const minQtyNotional = minQty * fiyat;
    const gerekliNotional = Math.max(minNotional, minQtyNotional);
    const gerekliMarjin = kaldirac > 0 ? gerekliNotional / kaldirac : gerekliNotional;
    const eksikNotional = Math.max(0, gerekliNotional - toplamDolar);
    const eksikMarjin = Math.max(0, gerekliMarjin - marjin);
    const sebep = sebepBul({ guvenliMiktar, minQty, notional, minNotional, toplamDolar, gerekliNotional });

    return {
        symbol,
        yon,
        sebep,
        fiyat,
        marjin,
        kaldirac,
        toplamDolar,
        hamMiktar: sayi(hamMiktar, 0),
        guvenliMiktar: sayi(guvenliMiktar, 0),
        notional,
        minQty,
        minNotional,
        minQtyNotional,
        gerekliNotional,
        gerekliMarjin,
        eksikNotional,
        eksikMarjin,
        stepSize: sayi(stepSize || kural.stepSize, 0),
        quantityPrecision: kural.quantityPrecision,
        pricePrecision: kural.pricePrecision,
        zaman: Date.now()
    };
}

function loglanabilirMi(state, audit) {
    state.positionSizingAudit = state.positionSizingAudit || { lastLog: {}, counts: {}, recent: [] };
    const key = `${audit.symbol}_${audit.yon}_${audit.sebep}`;
    const son = state.positionSizingAudit.lastLog[key] || 0;
    const now = Date.now();
    if (now - son > SON_LOG_ARALIGI_MS) {
        state.positionSizingAudit.lastLog[key] = now;
        return true;
    }
    return false;
}

function kaydet(state, audit) {
    state.positionSizingAudit = state.positionSizingAudit || { lastLog: {}, counts: {}, recent: [] };
    const key = `${audit.symbol}_${audit.yon}_${audit.sebep}`;
    state.positionSizingAudit.counts[key] = (state.positionSizingAudit.counts[key] || 0) + 1;
    state.positionSizingAudit.recent.unshift({
        t: audit.zaman,
        symbol: audit.symbol,
        yon: audit.yon,
        sebep: audit.sebep,
        fiyat: audit.fiyat,
        marjin: audit.marjin,
        kaldirac: audit.kaldirac,
        toplamDolar: audit.toplamDolar,
        hamMiktar: audit.hamMiktar,
        guvenliMiktar: audit.guvenliMiktar,
        notional: audit.notional,
        minQty: audit.minQty,
        minNotional: audit.minNotional,
        gerekliNotional: audit.gerekliNotional,
        gerekliMarjin: audit.gerekliMarjin,
        eksikMarjin: audit.eksikMarjin,
        stepSize: audit.stepSize
    });
    state.positionSizingAudit.recent = state.positionSizingAudit.recent.slice(0, 50);
}

function logla(state, audit) {
    kaydet(state, audit);

    if (!loglanabilirMi(state, audit)) return;

    console.log(
        `🧮 [POSITION SIZING AUDIT] ${audit.symbol} ${audit.yon} | Sebep: ${audit.sebep}\n` +
        `   Marjin=${fmt(audit.marjin, 4)} USDT | Kaldıraç=${fmt(audit.kaldirac, 2)}x | Ayrılan Notional=${fmt(audit.toplamDolar, 4)} USDT\n` +
        `   Fiyat=${fmt(audit.fiyat, 8)} | RawQty=${fmt(audit.hamMiktar, 10)} | Step=${fmt(audit.stepSize, 10)} | SafeQty=${fmt(audit.guvenliMiktar, 10)}\n` +
        `   Notional=${fmt(audit.notional, 4)} | MinQty=${fmt(audit.minQty, 10)} | MinNotional=${fmt(audit.minNotional, 4)} | MinQtyNotional≈${fmt(audit.minQtyNotional, 4)}\n` +
        `   Gerekli Notional≈${fmt(audit.gerekliNotional, 4)} | Gerekli Marjin≈${fmt(audit.gerekliMarjin, 4)} | Eksik Marjin≈${fmt(audit.eksikMarjin, 4)}\n` +
        `   Aksiyon: Emir açılmadı, pusu temizlenecek. Risk otomatik büyütülmedi.`
    );
}

module.exports = {
    auditHesapla,
    logla
};
