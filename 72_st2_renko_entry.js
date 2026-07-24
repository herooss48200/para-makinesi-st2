'use strict';

const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const m = require('./motor.js');
const core = require('./72_st2_renko_core.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');

function aktifTuglaMesafesi(pusu) {
    return entryEvolution.activeFor(pusu?.yon, pusu?.patternKodu);
}

function tetikFiyati(pusu) {
    return entryEvolution.targetPrice(pusu, aktifTuglaMesafesi(pusu));
}


function storeHazirla() {
    const store = h.state.st2Renko || (h.state.st2Renko = {});
    store.seriler ||= {};
    store.onaySerileri1m ||= {};
    store.pusular ||= {};
    store.sonPatternSignature ||= {};
    store.boxSize ||= {};
    store.onayBoxSize1m ||= {};
    return store;
}


function fiyatFormatla(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'YOK';
    return Math.abs(n) >= 1 ? n.toFixed(8) : n.toPrecision(10);
}

function zamanFormatla(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return 'YOK';
    return new Date(n).toISOString();
}

function tuglaKaniti(bricks, limit = 10) {
    return (Array.isArray(bricks) ? bricks.slice(-Math.max(1, limit)) : []).map(b => ({
        id: Number(b.id || 0),
        renk: b.color === 'GREEN' ? 'G' : 'R',
        open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close),
        closeTime: Number(b.closeTime || 0)
    }));
}

function renkoKanitiMetni(sym, pusu, target, price, st) {
    const bb = pusu?.renkoBb || {};
    const bricks = Array.isArray(pusu?.renkoSon10Tugla) ? pusu.renkoSon10Tugla : [];
    const dizi = bricks.map(b => b.renk).join('');
    const satirlar = bricks.map(b =>
        `#${b.id} ${b.renk} O:${fiyatFormatla(b.open)} H:${fiyatFormatla(b.high)} L:${fiyatFormatla(b.low)} C:${fiyatFormatla(b.close)} T:${zamanFormatla(b.closeTime)}`
    );
    return [
        `🧱 ST2 RENKO/BINANCE KARŞILAŞTIRMA KANITI`,
        `🪙 ${sym} | Yön ${pusu?.yon || 'YOK'} | Pattern ${pusu?.patternId || 'YOK'} (${pusu?.patternKodu || 'YOK'})`,
        `⏱️ Kaynak ${ayarlar.renkoKaynakPeriyodu || '15m'} kapanmış mum | ATR(${Number(ayarlar.renkoAtrPeriod || 14)}) | Box ${fiyatFormatla(pusu?.renkoBoxSize)}`,
        `📊 BB: Alt ${fiyatFormatla(bb.altBand)} | Orta ${fiyatFormatla(bb.ortaBand)} | Üst ${fiyatFormatla(bb.ustBand)}`,
        `📐 Band farkı: ${fiyatFormatla(bb.bandFarkFiyat)} fiyat / ${Number(bb.bandFarkTugla || 0).toFixed(4)} tuğla | Tolerans ${Number(bb.toleransTugla || 0).toFixed(2)} tuğla (${fiyatFormatla(bb.toleransFiyat)}) | Temas ${bb.temas ? 'TRUE ✅' : 'FALSE ❌'}`,
        `🎯 Referans ${fiyatFormatla(pusu?.referansSeviye)} | Tetik ${fiyatFormatla(target)} | Canlı ${fiyatFormatla(price)} | 1m Renko ST ${st?.trend || 'YOK'}`,
        `🧬 Son ${bricks.length} tuğla: ${dizi || 'YOK'}`,
        ...satirlar,
        `ℹ️ Binance kontrolü: aynı sembol, aynı ATR kutu ayarı ve aynı son kapanış zamanında renk/OHLC/BB temasını karşılaştır.`
    ].join('\n');

}

function yakinRedAdayiEkle(audit, sym, match, scenario, bricks, boxSize) {
    if (!audit || !match || !scenario) return;
    const fark = Number(scenario.bandFarkTugla);
    if (!Number.isFinite(fark)) return;
    const kayit = {
        sym,
        yon: match.yon,
        patternId: match.patternId,
        patternKodu: match.patternCode,
        redSebep: scenario.redSebep || 'YOK',
        bandFarkTugla: fark,
        bandFarkFiyat: Number(scenario.bandFarkFiyat || 0),
        boxSize: Number(boxSize || 0),
        altBand: Number(scenario.altBand || 0),
        ortaBand: Number(scenario.ortaBand || 0),
        ustBand: Number(scenario.ustBand || 0),
        toleransTugla: Number(scenario.toleransTugla || 0),
        toleransFiyat: Number(scenario.toleransFiyat || 0),
        sonTuglaLow: Number(scenario.sonTuglaLow || 0),
        sonTuglaHigh: Number(scenario.sonTuglaHigh || 0),
        sonTuglaClose: Number(scenario.sonTuglaClose || 0),
        sonTuglaZamani: Number(scenario.sonTuglaZamani || 0),
        tuglaDizisi: tuglaKaniti(bricks, Number(ayarlar.renkoKanitTuglaSayisi || 10)).map(x => x.renk).join('')
    };
    audit.yakinRedAdaylari.push(kayit);
    audit.yakinRedAdaylari.sort((a, b) => Math.abs(a.bandFarkTugla) - Math.abs(b.bandFarkTugla));
    if (audit.yakinRedAdaylari.length > Math.max(1, Number(ayarlar.renkoYakinRedKanitSayisi || 3))) {
        audit.yakinRedAdaylari.length = Math.max(1, Number(ayarlar.renkoYakinRedKanitSayisi || 3));
    }
}

function pusuOlusumKanitiMetni(sym, pusu) {
    return renkoKanitiMetni(sym, pusu, tetikFiyati(pusu), Number(h.state.canliFiyatlar?.[sym] || 0), { trend: 'BEKLENIYOR' })
        .replace('🧱 ST2 RENKO/BINANCE KARŞILAŞTIRMA KANITI', '🪤 ST2 RENKO PUSU/BINANCE PROOF');
}

function auditBaslat() {
    return {
        zaman: Date.now(), sembol: 0, atrHazir: 0, renkoHazir: 0, patternAday: 0, yeniPattern: 0, yeniPusu: 0,
        bbHazir: 0, bbLongTemas: 0, bbShortTemas: 0,
        patternDagilimi: {}, sonTemasRedleri: {}, yakinRedAdaylari: [],
        kaynakMumToplam: 0, renkoTuglaToplam: 0, renkoMin: null, renkoMax: 0,
        onay1mMumHazir: 0, onay1mAtrHazir: 0, onay1mRenkoHazir: 0,
        onay1mUp: 0, onay1mDown: 0, onay1mYetersiz: 0,
        longPusu: 0, shortPusu: 0, tetikBekleyen: 0,
        red: {
            ATR_YETERSIZ: 0, RENKO_YETERSIZ: 0, PATTERN_YOK: 0,
            BB_YETERSIZ: 0, BB_GECERSIZ: 0, BB_TEMAS_YOK: 0, PUSU_SURESI_DOLDU: 0, ONAY_1M_RENKO_YETERSIZ: 0,
            LONG_ALT_BAND_TEMASI_YOK: 0, SHORT_UST_BAND_TEMASI_YOK: 0, ORTA_BAND_BOLGE_RED: 0
        }
    };
}

function birDakikaRenkoSuperTrend(sym, audit = auditBaslat()) {
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

function bollingerSenaryosu(match, bollinger, boxSize) {
    return core.renkoBollingerSenaryosu(
        match,
        bollinger,
        boxSize,
        Number(ayarlar.renkoBbTemasToleransTugla ?? 0.25)
    );
}

function patternPususuGuncelle(sym, bricks, bollinger, boxSize, audit = null) {
    const store = storeHazirla();
    const longMatch = core.longPatternTespit(bricks);
    const shortMatch = core.shortPatternTespit(bricks);
    const candidates = [longMatch, shortMatch].filter(Boolean);
    if (audit) audit.patternAday += candidates.length;
    if (!candidates.length) {
        if (audit) audit.red.PATTERN_YOK++;
        return null;
    }

    for (const match of candidates) {
        if (audit) audit.patternDagilimi[match.patternId] = Number(audit.patternDagilimi[match.patternId] || 0) + 1;
        const scenario = bollingerSenaryosu(match, bollinger, boxSize);
        if (!scenario?.senaryo) {
            if (audit && scenario?.redSebep) {
                yakinRedAdayiEkle(audit, sym, match, scenario, bricks, boxSize);
                audit.sonTemasRedleri[scenario.redSebep] = Number(audit.sonTemasRedleri[scenario.redSebep] || 0) + 1;
                if (scenario.redSebep === 'LONG_ALT_BAND_TEMASI_YOK') audit.red.LONG_ALT_BAND_TEMASI_YOK++;
                else if (scenario.redSebep === 'SHORT_UST_BAND_TEMASI_YOK') audit.red.SHORT_UST_BAND_TEMASI_YOK++;
                else if (scenario.redSebep.includes('ORTA_BAND')) audit.red.ORTA_BAND_BOLGE_RED++;
            }
            continue;
        }
        const signature = core.patternSignature(match);
        const mevcut = store.pusular[sym];
        if (mevcut?.patternSignature === signature) return mevcut;
        if (!mevcut && store.sonPatternSignature[sym] === signature) continue;

        store.pusular[sym] = core.pusuOlustur(sym, match, scenario);
        store.pusular[sym].renkoBb = { ...scenario };
        store.pusular[sym].renkoBoxSize = Number(boxSize || 0);
        store.pusular[sym].renkoSonTuglaDizisi = match.bricks.map(b => b.color === 'GREEN' ? 'G' : 'R').join('');
        store.pusular[sym].renkoSon10Tugla = tuglaKaniti(bricks, Number(ayarlar.renkoKanitTuglaSayisi || 10));
        const pusuKaniti = pusuOlusumKanitiMetni(sym, store.pusular[sym]);
        store.pusular[sym].renkoPusuKanitMetni = pusuKaniti;
        console.log(`\n${pusuKaniti}\n`);
        if (ayarlar.renkoPusuKanitTelegram !== false) {
            h.telegramMesajGonder(pusuKaniti).catch(e => console.log(`⚠️ [ST2 RENKO PROOF] Telegram gönderimi başarısız ${sym}: ${e.message}`));
        }
        store.sonPatternSignature[sym] = signature;
        if (audit) {
            audit.yeniPattern++;
            audit.yeniPusu++;
            if (match.yon === 'LONG') { audit.bbLongTemas++; audit.longPusu++; }
            else { audit.bbShortTemas++; audit.shortPusu++; }
        }
        return store.pusular[sym];
    }

    if (audit) audit.red.BB_TEMAS_YOK++;
    return null;
}

function eskiPusuyuSuresiDolduysaSil(sym, bricks, audit = null) {
    const store = storeHazirla();
    const pusu = store.pusular[sym];
    if (!pusu || !Array.isArray(bricks) || !bricks.length) return false;
    const sonra = bricks.filter(b => Number(b.closeTime) > Number(pusu.sonKapaliTuglaZamani)).length;
    const limit = Math.max(1, Number(ayarlar.maxPusuBeklemeTugla || 3));
    if (sonra < limit) return false;
    delete store.pusular[sym];
    if (audit) audit.red.PUSU_SURESI_DOLDU++;
    return true;
}

async function pusuDegerlendir(sym, onay1m = null) {
    const store = storeHazirla();
    const pusu = store.pusular[sym];
    if (!pusu) return false;

    const price = Number(h.state.canliFiyatlar[sym]);
    const target = tetikFiyati(pusu);
    const st = onay1m || birDakikaRenkoSuperTrend(sym);
    const fiyatUygun = price > 0 && (pusu.yon === 'LONG' ? price >= target : price <= target);
    const stUygun = pusu.yon === 'LONG' ? st.trend === 'UP' : st.trend === 'DOWN';
    pusu.fiyatTetigiGoruldu = fiyatUygun;
    pusu.superTrendOnayi = stUygun;

    // Tetik ve 1m Renko ST aynı değerlendirme anında geçerli olmalıdır; eski onay latch edilmez.
    if (!fiyatUygun || !stUygun) return false;

    const renkoKanit = renkoKanitiMetni(sym, pusu, target, price, st);
    console.log(`\n${renkoKanit}\n`);

    const girisAnalizi = {
        entryStrategy: 'ST2_RENKO',
        pusuPeriyodu: ayarlar.renkoKaynakPeriyodu || '15m',
        sniperPeriyodu: ayarlar.renkoOnayPeriyodu || '1m',
        trendPeriyodu: '1m_RENKO',
        hedefFiyati: pusu.referansSeviye,
        tetikFiyati: target,
        tetikYuzdesiAyar: Number(ayarlar.renkoTetikYuzdesi || 0),
        renkoEntryBrickDistance: aktifTuglaMesafesi(pusu),
        tetikModu: 'RENKO_PATTERN_ADAPTIVE_BRICK_DISTANCE',
        girisFiyati: price,
        superTrendYonu: st.trend,
        stKaynak: '1m_RENKO',
        senaryo: pusu.senaryo,
        patternId: pusu.patternId,
        patternAilesi: pusu.patternAilesi,
        patternKodu: pusu.patternKodu,
        patternUzunlugu: pusu.patternUzunlugu,
        referansTipi: pusu.referansTipi,
        referansSeviye: pusu.referansSeviye,
        renkoBoxSize: store.boxSize?.[sym] || 0,
        renkoBb: pusu.renkoBb || null,
        renkoBbTemasToleransTugla: Number(ayarlar.renkoBbTemasToleransTugla ?? 0.25),
        renkoSonTuglaDizisi: pusu.renkoSonTuglaDizisi || pusu.patternKodu,
        renkoSon10Tugla: pusu.renkoSon10Tugla || [],
        renkoKanitMetni: renkoKanit,
        pusuDebug: renkoKanit,
        renkoOnayBoxSize1m: store.onayBoxSize1m?.[sym] || 0,
        pusuTuglasi: { ...pusu }
    };
    const ok = await m.pozisyonAc(sym, pusu.yon, price, girisAnalizi);
    if (ok) delete store.pusular[sym];
    return ok;
}

function auditLogla(audit) {
    const store = storeHazirla();
    store.audit = audit;
    const now = Date.now();
    if (now - Number(store.sonAuditLogZamani || 0) < Number(ayarlar.renkoAuditLogMs || 60000)) return;
    store.sonAuditLogZamani = now;
    const aktif = Object.values(store.pusular || {});
    console.log(`🧱 [ST2 RENKO AUDIT] Sembol ${audit.sembol} | 15m ATR ${audit.atrHazir} | Renko ${audit.renkoHazir} (min ${audit.renkoMin ?? 0}/max ${audit.renkoMax}) | Pattern aday ${audit.patternAday} | Yeni pattern ${audit.yeniPattern} | BB hazır ${audit.bbHazir} | BB temas L${audit.bbLongTemas}/S${audit.bbShortTemas} | 1m Renko ST ${audit.onay1mRenkoHazir} (UP ${audit.onay1mUp}/DOWN ${audit.onay1mDown}) | Yeni pusu L${audit.longPusu}/S${audit.shortPusu} | Aktif ${aktif.length}`);
    console.log(`🧱 [ST2 RENKO RED] ATR ${audit.red.ATR_YETERSIZ} | Renko ${audit.red.RENKO_YETERSIZ} | Pattern yok ${audit.red.PATTERN_YOK} | BB yetersiz ${audit.red.BB_YETERSIZ} | BB geçersiz ${audit.red.BB_GECERSIZ} | BB temas yok ${audit.red.BB_TEMAS_YOK} | Long alt temas yok ${audit.red.LONG_ALT_BAND_TEMASI_YOK} | Short üst temas yok ${audit.red.SHORT_UST_BAND_TEMASI_YOK} | Orta bölge red ${audit.red.ORTA_BAND_BOLGE_RED} | Pusu süresi doldu ${audit.red.PUSU_SURESI_DOLDU} | 1m ST yetersiz ${audit.red.ONAY_1M_RENKO_YETERSIZ}`);
    const dagilim = Object.entries(audit.patternDagilimi || {}).sort().map(([k,v]) => `${k}:${v}`).join(' ') || 'YOK';
    console.log(`🧱 [ST2 RENKO PATTERN] ${dagilim}`);
    for (const [i, x] of (audit.yakinRedAdaylari || []).entries()) {
        console.log(`🔬 [ST2 RENKO YAKIN RED ${i + 1}] ${x.sym} ${x.yon} ${x.patternId} (${x.patternKodu}) | Sebep ${x.redSebep} | Band farkı ${x.bandFarkTugla.toFixed(4)} tuğla (${fiyatFormatla(x.bandFarkFiyat)}) | Tol ${x.toleransTugla.toFixed(2)} | Box ${fiyatFormatla(x.boxSize)} | BB A/O/U ${fiyatFormatla(x.altBand)}/${fiyatFormatla(x.ortaBand)}/${fiyatFormatla(x.ustBand)} | Son L/H/C ${fiyatFormatla(x.sonTuglaLow)}/${fiyatFormatla(x.sonTuglaHigh)}/${fiyatFormatla(x.sonTuglaClose)} | T ${zamanFormatla(x.sonTuglaZamani)} | Dizi ${x.tuglaDizisi || 'YOK'}`);
    }
}

async function taraVeDegerlendir() {
    const store = storeHazirla();
    const audit = auditBaslat();
    for (const sym of h.state.semboller || []) {
        if ((h.state.alinanlar || []).includes(sym) || (h.state.aktifShortlar || []).includes(sym)) continue;
        audit.sembol++;
        const candles = h.state.yerelPusuHafizasi?.[sym];
        audit.kaynakMumToplam += Array.isArray(candles) ? candles.length : 0;
        const box = core.atr(candles, Number(ayarlar.renkoAtrPeriod || 14));
        if (!(box > 0)) { audit.red.ATR_YETERSIZ++; continue; }
        audit.atrHazir++;
        const bricks = core.renkoUret(candles, box);
        audit.renkoTuglaToplam += bricks.length;
        audit.renkoMin = audit.renkoMin === null ? bricks.length : Math.min(audit.renkoMin, bricks.length);
        audit.renkoMax = Math.max(audit.renkoMax, bricks.length);
        if (bricks.length < 4) { audit.red.RENKO_YETERSIZ++; continue; }
        audit.renkoHazir++;
        store.seriler[sym] = bricks;
        store.boxSize[sym] = box;

        eskiPusuyuSuresiDolduysaSil(sym, bricks, audit);
        const bbPeriod = Number(ayarlar.renkoBollingerPeriod || ayarlar.bollingerperiod || 20);
        if (bricks.length < bbPeriod) { audit.red.BB_YETERSIZ++; continue; }
        const bb = m.hesaplaBollinger(bricks.map(x => Number(x.close)));
        if (!core.bollingerHazirMi(bb)) { audit.red.BB_GECERSIZ++; continue; }
        audit.bbHazir++;
        patternPususuGuncelle(sym, bricks, bb, box, audit);
        const onay1m = birDakikaRenkoSuperTrend(sym, audit);
        await pusuDegerlendir(sym, onay1m);
    }
    audit.tetikBekleyen = Object.keys(store.pusular || {}).length;
    auditLogla(audit);
    return audit;
}

module.exports = {
    ...core,
    tetikFiyati,
    aktifTuglaMesafesi,
    storeHazirla,
    birDakikaRenkoSuperTrend,
    bollingerHazirMi: core.bollingerHazirMi,
    bollingerSenaryosu,
    eskiPusuyuSuresiDolduysaSil,
    patternPususuGuncelle,
    pusuDegerlendir,
    taraVeDegerlendir
};
