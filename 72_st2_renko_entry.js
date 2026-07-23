const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const m = require('./motor.js');
const core = require('./72_st2_renko_core.js');

function tetikFiyati(pusu) { return core.tetikFiyati(pusu, ayarlar.renkoTetikYuzdesi ?? ayarlar.tetikYuzdesi ?? 0); }
function pusuOlustur(sym, yon, brick, scenario) { return core.pusuOlustur(sym, yon, brick, scenario); }

function storeHazirla() {
    const store = h.state.st2Renko || (h.state.st2Renko = {});
    store.seriler ||= {};
    store.onaySerileri1m ||= {};
    store.pusular ||= {};
    store.sonIslenenTugla ||= {};
    store.boxSize ||= {};
    store.onayBoxSize1m ||= {};
    return store;
}

function auditBaslat() {
    return {
        zaman: Date.now(), sembol: 0, atrHazir: 0, renkoHazir: 0, yeniTugla: 0,
        bbHazir: 0, bbLongTemas: 0, bbShortTemas: 0,
        onay1mMumHazir: 0, onay1mAtrHazir: 0, onay1mRenkoHazir: 0,
        onay1mUp: 0, onay1mDown: 0, onay1mYetersiz: 0,
        longPusu: 0, shortPusu: 0, tetikBekleyen: 0,
        red: { ATR_YETERSIZ: 0, RENKO_YETERSIZ: 0, YENI_TUGLA_YOK: 0, BB_YETERSIZ: 0, BB_TEMAS_YOK: 0, ONAY_1M_RENKO_YETERSIZ: 0 }
    };
}

function birDakikaRenkoSuperTrend(sym, audit) {
    const store = storeHazirla();
    const mumlar = h.state.sniperMumlar?.[sym];
    const min = Number(ayarlar.renkoOnayAtrPeriod || 14) + 2;
    if (!Array.isArray(mumlar) || mumlar.length < min) {
        audit.onay1mYetersiz++; audit.red.ONAY_1M_RENKO_YETERSIZ++;
        return { trend: null, value: 0, bricks: [] };
    }
    audit.onay1mMumHazir++;
    const box = core.atr(mumlar, Number(ayarlar.renkoOnayAtrPeriod || 14));
    if (!(box > 0)) {
        audit.onay1mYetersiz++; audit.red.ONAY_1M_RENKO_YETERSIZ++;
        return { trend: null, value: 0, bricks: [] };
    }
    audit.onay1mAtrHazir++;
    const bricks = core.renkoUret(mumlar, box);
    store.onaySerileri1m[sym] = bricks;
    store.onayBoxSize1m[sym] = box;
    const st = m.hesaplaSuperTrend(
        bricks,
        Number(ayarlar.renkoOnaySuperTrendPeriod || 10),
        Number(ayarlar.renkoOnaySuperTrendMultiplier || 3)
    );
    if (!bricks.length || !st?.trend) {
        audit.onay1mYetersiz++; audit.red.ONAY_1M_RENKO_YETERSIZ++;
        return { trend: null, value: 0, bricks };
    }
    audit.onay1mRenkoHazir++;
    if (st.trend === 'UP') audit.onay1mUp++;
    if (st.trend === 'DOWN') audit.onay1mDown++;
    return { ...st, bricks };
}

function yeniTuglayiIsle(sym, brick, bollinger, stTrend, audit = null) {
    const store = storeHazirla();
    let pusu = store.pusular[sym];
    if (pusu) {
        core.aktifPusudaTuglaIsle(pusu, brick, stTrend);
        return pusu;
    }

    const longScenario = m.pusuSenaryosuTespit(brick, null, bollinger, 'LONG');
    if (brick.color === 'RED' && longScenario.senaryo) {
        store.pusular[sym] = pusuOlustur(sym, 'LONG', brick, longScenario);
        if (audit) { audit.bbLongTemas++; audit.longPusu++; }
        return store.pusular[sym];
    }
    const shortScenario = m.pusuSenaryosuTespit(brick, null, bollinger, 'SHORT');
    if (brick.color === 'GREEN' && shortScenario.senaryo) {
        store.pusular[sym] = pusuOlustur(sym, 'SHORT', brick, shortScenario);
        if (audit) { audit.bbShortTemas++; audit.shortPusu++; }
        return store.pusular[sym];
    }
    if (audit) audit.red.BB_TEMAS_YOK++;
    return null;
}

async function pusuDegerlendir(sym, onay1m = null) {
    const store = storeHazirla();
    const pusu = store.pusular[sym];
    if (!pusu) return false;
    const price = Number(h.state.canliFiyatlar[sym]);
    const target = tetikFiyati(pusu);
    if (price > 0 && ((pusu.yon === 'LONG' && price >= target) || (pusu.yon === 'SHORT' && price <= target))) pusu.fiyatTetigiGoruldu = true;

    const st = onay1m || birDakikaRenkoSuperTrend(sym, auditBaslat());
    if ((pusu.yon === 'LONG' && st.trend === 'UP') || (pusu.yon === 'SHORT' && st.trend === 'DOWN')) pusu.superTrendOnayi = true;

    const valid = pusu.tuglaSayaci <= Number(ayarlar.maxPusuBeklemeTugla || 3);
    if (valid && pusu.donusTuglasiKapandi && pusu.fiyatTetigiGoruldu && pusu.superTrendOnayi) {
        const girisAnalizi = {
            entryStrategy: 'ST2_RENKO', pusuPeriyodu: ayarlar.renkoKaynakPeriyodu || '15m',
            sniperPeriyodu: ayarlar.renkoOnayPeriyodu || '1m', trendPeriyodu: '1m_RENKO', hedefFiyati: pusu.referansSeviye,
            tetikFiyati: target, tetikYuzdesiAyar: Number(ayarlar.renkoTetikYuzdesi || 0),
            tetikModu: 'RENKO_REFERANS_BUFFER', girisFiyati: price, superTrendYonu: st.trend,
            stKaynak: '1m_RENKO', senaryo: pusu.senaryo, pusuSayaci: pusu.tuglaSayaci,
            maxPusuBeklemeMum: Number(ayarlar.maxPusuBeklemeTugla || 3),
            renkoBoxSize: store.boxSize?.[sym] || 0,
            renkoOnayBoxSize1m: store.onayBoxSize1m?.[sym] || 0,
            pusuTuglasi: { ...pusu }
        };
        const ok = await m.pozisyonAc(sym, pusu.yon, price, girisAnalizi);
        if (ok) delete store.pusular[sym];
        return ok;
    }
    if (pusu.tuglaSayaci >= Number(ayarlar.maxPusuBeklemeTugla || 3)) delete store.pusular[sym];
    return false;
}

function auditLogla(audit) {
    const store = storeHazirla();
    store.audit = audit;
    const now = Date.now();
    if (now - Number(store.sonAuditLogZamani || 0) < Number(ayarlar.renkoAuditLogMs || 60000)) return;
    store.sonAuditLogZamani = now;
    const aktif = Object.values(store.pusular || {});
    console.log(`🧱 [ST2 RENKO AUDIT] Sembol ${audit.sembol} | 15m ATR ${audit.atrHazir} | Renko ${audit.renkoHazir} | Yeni tuğla ${audit.yeniTugla} | BB hazır ${audit.bbHazir} | BB temas L${audit.bbLongTemas}/S${audit.bbShortTemas} | 1m Renko ST ${audit.onay1mRenkoHazir} (UP ${audit.onay1mUp}/DOWN ${audit.onay1mDown}) | Yeni pusu L${audit.longPusu}/S${audit.shortPusu} | Aktif tetik bekleyen ${aktif.length}`);
    console.log(`🧱 [ST2 RENKO RED] ATR ${audit.red.ATR_YETERSIZ} | Renko ${audit.red.RENKO_YETERSIZ} | Yeni tuğla yok ${audit.red.YENI_TUGLA_YOK} | BB yetersiz ${audit.red.BB_YETERSIZ} | BB temas yok ${audit.red.BB_TEMAS_YOK} | 1m Renko ST yetersiz ${audit.red.ONAY_1M_RENKO_YETERSIZ}`);
}

async function taraVeDegerlendir() {
    const store = storeHazirla();
    const audit = auditBaslat();
    for (const sym of h.state.semboller) {
        if (h.state.alinanlar.includes(sym) || h.state.aktifShortlar.includes(sym)) continue;
        audit.sembol++;
        const candles = h.state.yerelPusuHafizasi[sym];
        const box = core.atr(candles, Number(ayarlar.renkoAtrPeriod || 14));
        if (!(box > 0)) { audit.red.ATR_YETERSIZ++; continue; }
        audit.atrHazir++;
        const bricks = core.renkoUret(candles, box);
        if (!bricks.length) { audit.red.RENKO_YETERSIZ++; continue; }
        audit.renkoHazir++;
        store.seriler[sym] = bricks;
        store.boxSize[sym] = box;
        const onay1m = birDakikaRenkoSuperTrend(sym, audit);
        const lastId = Number(store.sonIslenenTugla[sym] || 0);
        const yeniler = bricks.filter(x => x.id > lastId);
        if (!yeniler.length) audit.red.YENI_TUGLA_YOK++;
        audit.yeniTugla += yeniler.length;
        for (const brick of yeniler) {
            const upto = bricks.filter(x => x.id <= brick.id);
            const bb = m.hesaplaBollinger(upto.map(x => x.close));
            if (bb.upper.length) {
                audit.bbHazir++;
                yeniTuglayiIsle(sym, brick, bb, onay1m.trend, audit);
            } else audit.red.BB_YETERSIZ++;
            store.sonIslenenTugla[sym] = brick.id;
            await pusuDegerlendir(sym, onay1m);
        }
        await pusuDegerlendir(sym, onay1m);
    }
    audit.tetikBekleyen = Object.keys(store.pusular || {}).length;
    auditLogla(audit);
    return audit;
}

module.exports = { ...core, tetikFiyati, pusuOlustur, birDakikaRenkoSuperTrend, yeniTuglayiIsle, pusuDegerlendir, taraVeDegerlendir };
