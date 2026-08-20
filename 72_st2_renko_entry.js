'use strict';

const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const m = require('./motor.js');
const core = require('./72_st2_renko_core.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');
const premierQuality = require('./83_st2_premier_quality_score.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pusuNotificationDedupe = require('./81_st2_pusu_notification_dedupe.js');
const renkoEntryModePolicy = require('./90_st2_renko_entry_mode_policy.js');

// R31.1 LIVE AUTHORITY: gerçek giriş kaynağı ayarlar.renkoCanliKaynakPeriyotlari ile sınırlıdır.
// Üretimde yalnız 15m aktiftir; 1m yalnız Renko-ST teyididir. Higher-TF aggregation helper'ları
// geçmiş kayıt/geri dönüş uyumluluğu için tutulur, gerçek entry taramasına katılmaz.
let AKTIF_KAYNAK_TF = null;
const TF_MS = Object.freeze({ '15m': 15*60_000, '30m': 30*60_000, '1h': 60*60_000, '2h': 2*60*60_000, '4h': 4*60*60_000 });
function canliKaynakTfListesi() {
    const raw = Array.isArray(ayarlar.renkoCanliKaynakPeriyotlari) && ayarlar.renkoCanliKaynakPeriyotlari.length
        ? ayarlar.renkoCanliKaynakPeriyotlari : [ayarlar.renkoKaynakPeriyodu || '15m'];
    return [...new Set(raw.map(x => String(x || '').trim().toLowerCase()).filter(x => TF_MS[x]))];
}
function kaynakTf() { return AKTIF_KAYNAK_TF || canliKaynakTfListesi()[0] || '15m'; }
function tfCandleBirlesimi(sym, tf = kaynakTf()) {
    const src = h.state.yerelPusuHafizasi?.[sym];
    if (!Array.isArray(src) || !src.length) return [];
    if (tf === '15m') return src;
    const targetMs = TF_MS[tf];
    const baseMs = TF_MS['15m'];
    const expected = Math.max(1, Math.round(targetMs / baseMs));
    const groups = new Map();
    for (const c of src) {
        const openTime = Number(c?.openTime || 0);
        const closeTime = Number(c?.closeTime || 0);
        if (!(openTime > 0) || !(closeTime > 0)) continue;
        const bucket = Math.floor(openTime / targetMs) * targetMs;
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket).push(c);
    }
    const out = [];
    for (const [bucket, rows0] of [...groups.entries()].sort((a,b)=>a[0]-b[0])) {
        const rows = [...rows0].sort((a,b)=>Number(a.openTime||0)-Number(b.openTime||0));
        if (rows.length !== expected) continue;
        if (Number(rows[0]?.openTime || 0) !== bucket) continue;
        let contiguous = true;
        for (let i=1;i<rows.length;i++) {
            if (Number(rows[i]?.openTime || 0) - Number(rows[i-1]?.openTime || 0) !== baseMs) { contiguous = false; break; }
        }
        if (!contiguous) continue;
        const last = rows.at(-1);
        if (Number(last?.closeTime || 0) < bucket + targetMs - 2_000) continue;
        out.push({
            openTime: bucket,
            open: String(rows[0].open),
            high: String(Math.max(...rows.map(x=>Number(x.high)))),
            low: String(Math.min(...rows.map(x=>Number(x.low)))),
            close: String(last.close),
            volume: String(rows.reduce((a,x)=>a+Number(x.volume||0),0)),
            closeTime: Number(last.closeTime)
        });
    }
    return out;
}
// v6.12.3 compatibility marker: entryTimingAuthority: 'RENKO_EVOLUTION_1M_RENKO_ST'

let baslangicPusuOzetiGonderildi = false;
let baslangicPusuOzetiIsleniyor = false;
let baslangicPusuKuyrugu = [];
const PUSU_BOOT_ID = `${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const PUSU_DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const PUSU_STARTUP_STAMP_FILE = path.join(PUSU_DATA_DIR, 'st2-startup-pusu-telegram.json');

function renkoProofConsoleAktif() {
    if (ayarlar.renkoProofConsoleAktif === true) return true;
    return /^(1|true|yes|on)$/i.test(String(process.env.AGROS_ST2_RENKO_PROOF_CONSOLE || ''));
}
function renkoProofConsoleYaz(metin) {
    if (renkoProofConsoleAktif()) console.log(`\n${metin}\n`);
}

function pusuStartupStampOku() {
    try { return JSON.parse(fs.readFileSync(PUSU_STARTUP_STAMP_FILE, 'utf8')); }
    catch (_) { return {}; }
}
function pusuStartupStampYaz(signature, count) {
    try {
        fs.mkdirSync(PUSU_DATA_DIR, { recursive: true });
        fs.writeFileSync(PUSU_STARTUP_STAMP_FILE, JSON.stringify({ bootId: PUSU_BOOT_ID, signature, count, lastSentAt: Date.now() }, null, 2));
    } catch (e) { console.log(`⚠️ [ST2 AÇILIŞ PUSU STAMP] ${e.message}`); }
}



function dnaKisaId(key = '') {
    return crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 10).toUpperCase();
}

function pusuGateOzeti(pusu) {
    try {
        const gate = adaptiveDnaEntry.gateDecision(pusu, Number(pusu?.renkoEntryBrickDistance || entryEvolution.DEFAULT_BRICK()));
        const key = adaptiveDnaEntry.dnaKey(gate.context || adaptiveDnaEntry.contextFrom(pusu));
        return {
            dnaKey: key,
            dnaId: dnaKisaId(key),
            executionMode: gate.executionMode || 'REJECT',
            reason: gate.reason || 'UNKNOWN',
            completion: gate.completion || null,
            premierScore: gate.premierScore || null,
            score: Number(gate.premierScore?.score || 0),
            scoreThreshold: Number(gate.premierScore?.threshold || 0),
            relativeRank: Number(gate.premierScore?.rank || 0),
            relativeCohort: Number(gate.premierScore?.cohortSize || 0),
            liveLast5: gate.liveLast5 || null,
            policySource: gate.premierScore?.policySource || premierQuality.activePolicy().source
        };
    } catch (error) {
        return { dnaKey: null, dnaId: 'YOK', executionMode: 'UNKNOWN', reason: `GATE_ERROR:${error.message}`, completion: null };
    }
}


function pusuSkorAciklama(gateOzeti = {}) {
    const q = gateOzeti.premierScore || {};
    if (!Number.isFinite(Number(q.score))) return '';
    const selected = q.selected === true || gateOzeti.executionMode === 'PREMIER';
    const karar = selected
        ? `Skor eşiği geçti: ${Number(q.score).toFixed(1)} ≥ ${Number(q.threshold || 0).toFixed(1)}`
        : `Skor eşiğin altında: ${Number(q.score).toFixed(1)} < ${Number(q.threshold || 0).toFixed(1)}`;
    const evidence = q.evidence || {};
    const last5 = gateOzeti.liveLast5 || null;
    const model = q.policySource || gateOzeti.policySource || 'DEFAULT';
    const lines = [
        `⭐ <b>Premier nedeni:</b> ${karar} | Sıra #${Number(q.rank || 0)}/${Number(q.cohortSize || 0)}`,
        `🧮 ${premierQuality.weightedComponentText(q)}`,
        `📚 ${premierQuality.metricText(evidence.historical, { prefix: 'Tarihsel' })}`,
        `🕔 ${last5 ? premierQuality.metricText(last5, { prefix: 'Son 5' }) : 'Son 5 N0'}`,
        `🚪 ${premierQuality.metricText(evidence.entry, { prefix: 'Entry' })}`,
        `⚙️ Model ${model}${q.calibrationGeneratedAt ? ` | Kalibrasyon ${q.calibrationGeneratedAt}` : ''}`
    ];
    return lines.join('\n');
}

function pusuBildirimHafizasiniTemizle(store, now = Date.now()) {
    return pusuNotificationDedupe.temizle(store, {
        now,
        ttlHours: Number(ayarlar.renkoPusuBildirimHafizaSaat || 168),
        maxEntries: Number(ayarlar.renkoPusuBildirimHafizaMax || 5000)
    });
}



function bucket(value, cuts, labels) {
    const x = Number(value || 0);
    for (let i = 0; i < cuts.length; i++) if (x < cuts[i]) return labels[i];
    return labels[labels.length - 1];
}

function exactContextHesapla(candles, match, bricks, bb, boxSize) {
    const son = Array.isArray(candles) ? candles.at(-1) : null;
    const close = Number(son?.close ?? son?.[4] ?? 0);
    const upper = Number(Array.isArray(bb?.upper) ? bb.upper.at(-1) : bb?.upper);
    const lower = Number(Array.isArray(bb?.lower) ? bb.lower.at(-1) : bb?.lower);
    const mid = Number(bb?.mid || 0);
    const reference = Number(match?.referenceLevel || 0);
    let rbb = 'UNKNOWN';
    if (upper > lower && reference > 0) {
        const pos = (reference - lower) / (upper - lower);
        rbb = pos <= 0.10 ? 'ALT' : pos <= 0.40 ? 'ORTA_ALT' : pos <= 0.60 ? 'ORTA' : pos <= 0.90 ? 'ORTA_UST' : 'UST';
    }
    const atrPct = close > 0 ? Number(boxSize || 0) / close * 100 : 0;
    const bbWidthPct = mid > 0 && upper > lower ? (upper - lower) / mid * 100 : 0;
    const recent = (Array.isArray(candles) ? candles.slice(-20) : [])
        .map(x => Number(x?.close ?? x?.[4] ?? 0)).filter(x => x > 0);
    const slopePct = recent.length >= 20 ? (recent.at(-1) / recent[0] - 1) * 100 : 0;
    return {
        rbb,
        rbbw: bucket(bbWidthPct, [0.8, 1.6, 3.0], ['DAR', 'NORMAL', 'GENIS', 'COK_GENIS']),
        atrRegime: bucket(atrPct, [0.20, 0.45, 0.80], ['DUSUK', 'NORMAL', 'YUKSEK', 'COK_YUKSEK']),
        trend20: slopePct > 0.60 ? 'UP' : slopePct < -0.60 ? 'DOWN' : 'YATAY',
        atrPct,
        bbWidthPct,
        trend20SlopePct: slopePct,
        renko6: (Array.isArray(bricks) ? bricks.slice(-6) : []).map(x => x.color === 'GREEN' ? 'G' : 'R').join('') || 'UNKNOWN'
    };
}

function aktifTuglaKarari(pusu) {
    const fallback = entryEvolution.activeFor(pusu?.yon, pusu?.patternKodu);
    return adaptiveDnaEntry.select(pusu || {}, fallback);
}

function aktifTuglaMesafesi(pusu) {
    return Number(aktifTuglaKarari(pusu).brick);
}


function canliTetikFiyati(pusu) {
    const frozen = Number(pusu?.renkoEntryBrickDistance);
    const brick = Number.isFinite(frozen) && frozen > 0 ? frozen : aktifTuglaMesafesi(pusu);
    return entryEvolution.targetPrice(pusu, brick);
}

function tetikFiyati(pusu) {
    return canliTetikFiyati(pusu);
}


function storeHazirla() {
    const tf = kaynakTf();
    h.state.st2RenkoTf ||= {};
    const store = tf === '15m'
        ? (h.state.st2Renko || (h.state.st2Renko = {}))
        : (h.state.st2RenkoTf[tf] || (h.state.st2RenkoTf[tf] = {}));
    store.sourceTimeframe = tf;
    store.seriler ||= {};
    store.onaySerileri1m ||= {};
    store.pusular ||= {};
    store.sonPatternSignature ||= {};
    store.pusuTelegramBildirimleri ||= {};
    store.sonIptalPatternSignature ||= {};
    store.sonIptalPusuEventZamani ||= {};
    store.sonPusuEventZamani ||= {};
    store.boxSize ||= {};
    store.onayBoxSize1m ||= {};
    store.sonKaynakMumZamani ||= {};
    return store;
}


function fiyatFormatla(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'YOK';
    return Math.abs(n) >= 1 ? n.toFixed(8) : n.toPrecision(10);
}

function pusuTetikSunumu(pusu) {
    const mode = String(pusu?.entryMode || pusu?.entryModeDecisionAtSignal?.selectedMode || 'DIRECT').toUpperCase();
    const rawOffset = Number(pusu?.entryModeOffsetT || pusu?.renkoEntryBrickDistance || entryEvolution.DEFAULT_BRICK());
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : Number(entryEvolution.DEFAULT_BRICK());
    if (mode === 'CONFIRMED') return `${offset.toFixed(2)}T → ${kaynakTf()} kapanmış dönüş sonrası hesaplanacak`;
    const target = Number(pusu?.canliTetikFiyati);
    const resolved = target > 0 ? target : canliTetikFiyati(pusu);
    return `${offset.toFixed(2)}T → ${resolved > 0 ? fiyatFormatla(resolved) : 'GEÇERSİZ'}`;
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
        `⏱️ Kaynak ${pusu?.sourceTimeframe || kaynakTf()} kapanmış mum | ATR(${Number(ayarlar.renkoAtrPeriod || 14)}) | Box ${fiyatFormatla(pusu?.renkoBoxSize)}`,
        `📊 BB: Alt ${fiyatFormatla(bb.altBand)} | Orta ${fiyatFormatla(bb.ortaBand)} | Üst ${fiyatFormatla(bb.ustBand)}`,
        `📐 Band farkı: ${fiyatFormatla(bb.bandFarkFiyat)} fiyat / ${Number(bb.bandFarkTugla || 0).toFixed(4)} tuğla | Tolerans ${Number(bb.toleransTugla || 0).toFixed(2)} tuğla (${fiyatFormatla(bb.toleransFiyat)}) | Temas ${bb.temas ? 'TRUE ✅' : 'FALSE ❌'}`,
        `🎯 Referans ${fiyatFormatla(pusu?.referansSeviye)} | Entry Evolution tetik ${Number(target) > 0 ? fiyatFormatla(target) : (String(pusu?.entryMode || '').toUpperCase() === 'CONFIRMED' ? `${Number(pusu?.entryModeOffsetT || pusu?.renkoEntryBrickDistance || 0.25).toFixed(2)}T / ${pusu?.sourceTimeframe || kaynakTf()} kapanmış dönüş sonrası` : 'YOK')} | Canlı ${fiyatFormatla(price)} | 1m Renko ST ${st?.trend || 'YOK'}`,
        `🧬 Son ${bricks.length} tuğla: ${dizi || 'YOK'}`,
        ...satirlar
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
    const olusumTarget = String(pusu?.entryMode || '').toUpperCase() === 'CONFIRMED' ? null : tetikFiyati(pusu);
    return renkoKanitiMetni(sym, pusu, olusumTarget, Number(h.state.canliFiyatlar?.[sym] || 0), { trend: 'BEKLENIYOR' })
        .replace('🧱 ST2 RENKO/BINANCE KARŞILAŞTIRMA KANITI', '🪤 ST2 RENKO PUSU/BINANCE PROOF');
}

function auditBaslat() {
    return {
        zaman: Date.now(), evrenToplam: 0, acikPozisyonAtlandi: 0, veriEksik: 0, sureMs: 0, sembol: 0, atrHazir: 0, renkoHazir: 0, patternAday: 0, yeniPattern: 0, yeniPusu: 0,
        bbHazir: 0, bbLongTemas: 0, bbShortTemas: 0,
        patternDagilimi: {}, sonTemasRedleri: {}, yakinRedAdaylari: [],
        kaynakMumToplam: 0, renkoTuglaToplam: 0, renkoMin: null, renkoMax: 0,
        onay1mMumHazir: 0, onay1mAtrHazir: 0, onay1mRenkoHazir: 0,
        onay1mUp: 0, onay1mDown: 0, onay1mYetersiz: 0, onay1mTuglaYetersiz: 0, onay1mStHesapYetersiz: 0,
        longPusu: 0, shortPusu: 0, tetikBekleyen: 0,
        pusuDegerlendirilen: 0, fiyatTetigi: 0, fiyatBekleyen: 0, fiyatEksik: 0,
        stOnayi: 0, stReddi: 0, birlikteUygun: 0, pozisyonAcildi: 0, pozisyonReddedildi: 0,
        entryModeDirect: 0, entryModeConfirmed: 0, confirmedReady: 0, confirmedWaiting: 0,
        directPriceWaiting: 0, confirmedPriceWaiting: 0, confirmedWaitReasons: {},
        sourceTimeframe: kaynakTf(), sourceUnchangedFastPath: 0,
        tazeKirilim: 0,
        eskiKirilimEngeli: 0, gecGirisReddi: 0, st2ContextIptal: 0,
        red: {
            ATR_YETERSIZ: 0, RENKO_YETERSIZ: 0, PATTERN_YOK: 0,
            BB_YETERSIZ: 0, BB_GECERSIZ: 0, BB_TEMAS_YOK: 0, PUSU_SURESI_DOLDU: 0, ONAY_1M_RENKO_YETERSIZ: 0,
            LONG_ALT_BAND_TEMASI_YOK: 0, SHORT_UST_BAND_TEMASI_YOK: 0, ORTA_BAND_BOLGE_RED: 0,
            ST2_CONTEXT_INVALIDATED: 0, LEGACY_PUSU_INVALIDATED: 0
        }
    };
}

function birDakikaRenkoSuperTrend(sym, audit = auditBaslat()) {
    const store = storeHazirla();
    const mumlar = h.state.sniperMumlar?.[sym];
    const min = Number(ayarlar.renkoOnayAtrPeriod || 14) + 2;
    if (!Array.isArray(mumlar) || mumlar.length < min) {
        audit.onay1mYetersiz++; audit.red.ONAY_1M_RENKO_YETERSIZ++;
        return { trend: null, value: 0, bricks: [], reason: 'RAW_1M_YETERSIZ' };
    }
    audit.onay1mMumHazir++;

    // R12: revizyon warmup/refresh gerçek 1m Renko-ST'yi önceden hesaplar.
    // Aynı son kapanmış 1m mum için tekrar ağır Renko üretme; hazır cache'i kullan.
    const sonCloseTime = Number(mumlar.at(-1)?.closeTime || 0);
    const pre = h.state.renko1mStCache?.[sym];
    if (pre && Number(pre.sourceCloseTime || 0) === sonCloseTime && ['UP','DOWN'].includes(String(pre.trend || '').toUpperCase())) {
        const bricks = Array.isArray(pre.bricks) ? pre.bricks : [];
        const box = Number(pre.boxSize || 0);
        store.onaySerileri1m[sym] = bricks;
        store.onayBoxSize1m[sym] = box;
        audit.onay1mAtrHazir++;
        audit.onay1mRenkoHazir++;
        if (pre.trend === 'UP') audit.onay1mUp++;
        if (pre.trend === 'DOWN') audit.onay1mDown++;
        return { trend: pre.trend, value: Number(pre.value || 0), bricks, cached: true };
    }

    // R12 scan liveness: 1m Renko-ST'nin tek hesaplama otoritesi warmup/refresh katmanıdır.
    // Startup zaten 80 -> 240 -> 480 kapanmış 1m mum ile derin onarım dener. Buna rağmen
    // cache READY değilse 200-sembol giriş taraması içinde aynı pahalı Renko'yu tekrar üretmek
    // bütün taramayı tek bir sembol yüzünden dakikalarca bloke edebilir. Hazır olmayan sembol
    // fail-closed kalır; diğer READY semboller taranmaya devam eder.
    audit.onay1mYetersiz++;
    audit.onay1mStHesapYetersiz++;
    audit.red.ONAY_1M_RENKO_YETERSIZ++;
    return {
        trend: null,
        value: 0,
        bricks: [],
        reason: pre ? 'RENKO_1M_CACHE_STALE' : 'RENKO_1M_CACHE_YOK',
        sourceCloseTime: sonCloseTime,
        cachedCloseTime: Number(pre?.sourceCloseTime || 0),
        scanFailClosed: true
    };
}

function bollingerSenaryosu(match, bollinger, boxSize) {
    return core.renkoBollingerSenaryosu(
        match,
        bollinger,
        boxSize,
        Number(ayarlar.renkoBbTemasToleransTugla ?? 0.25)
    );
}

function patternPususuGuncelle(sym, bricks, bollinger, boxSize, candles, audit = null) {
    const store = storeHazirla();
    const mevcutBaslangic = store.pusular[sym] || null;

    // R21: CONFIRMED pusu oluştuğu 15m bağlamıyla dondurulur. Beklenen renk dönüşü
    // doğal olarak son patterni değiştireceği için, dönüş geldi diye pusu yenilenmez/iptal edilmez.
    // R23.2: CONFIRMED yaşamını legacy 3-tuğla expiry değil, ilk reversal + fresh fractional pencere yönetir.
    if (mevcutBaslangic && String(mevcutBaslangic.entryMode || '').toUpperCase() === 'CONFIRMED') {
        mevcutBaslangic.sonSt2DogrulamaMumZamani = Number(candles?.at(-1)?.closeTime || mevcutBaslangic.sonSt2DogrulamaMumZamani || 0);
        mevcutBaslangic.st2ContextValid = true;
        mevcutBaslangic.confirmed15mContextFrozen = true;
        return mevcutBaslangic;
    }

    const longMatch = core.longPatternTespit(bricks);
    const shortMatch = core.shortPatternTespit(bricks);
    const candidates = [longMatch, shortMatch].filter(Boolean);
    if (audit) audit.patternAday += candidates.length;

    if (!candidates.length) {
        if (audit) audit.red.PATTERN_YOK++;
        if (mevcutBaslangic) {
            store.sonIptalPatternSignature[sym] = mevcutBaslangic.patternSignature;
            delete store.pusular[sym];
            if (audit) { audit.st2ContextIptal++; audit.red.ST2_CONTEXT_INVALIDATED++; }
            console.log(`🧯 [ST2 PUSU İPTAL] ${sym} ${mevcutBaslangic.yon} | Güncel kapanmış 15m Renko patterni artık geçerli değil.`);
        }
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
        const mevcut = store.pusular[sym] || null;
        if (mevcut && mevcut.patternSignature === signature && mevcut.yon === match.yon) {
            mevcut.sonSt2DogrulamaMumZamani = Number(candles?.at(-1)?.closeTime || 0);
            mevcut.st2ContextValid = true;
            return mevcut;
        }

        if (mevcut) {
            store.sonIptalPatternSignature[sym] = mevcut.patternSignature;
            delete store.pusular[sym];
            if (audit) { audit.st2ContextIptal++; audit.red.ST2_CONTEXT_INVALIDATED++; }
            console.log(`♻️ [ST2 PUSU YENİLENDİ] ${sym} | ${mevcut.patternSignature} → ${signature}`);
        }

        // Süresi dolmuş, karşıtlaşmış veya kullanılmış aynı mantıksal Renko olayı yeniden açılamaz.
        if (store.sonIptalPatternSignature[sym] === signature) continue;

        // R23.2: ATR yeniden hesaplandığında signature değişse bile aynı/eskimiş Renko olayı
        // yeni pusu gibi dirilemez. Yeni pusu için daha yeni kapanmış Renko olayı zorunludur.
        const adayEventZamani = Number(match?.bricks?.at(-1)?.closeTime || 0);
        const blokEventZamani = Math.max(
            Number(store.sonIptalPusuEventZamani?.[sym] || 0),
            Number(store.sonPusuEventZamani?.[sym] || 0)
        );
        if (adayEventZamani > 0 && blokEventZamani > 0 && adayEventZamani <= blokEventZamani) continue;

        const yeniPusu = core.pusuOlustur(sym, match, scenario);
        const kaynakSonMum = Array.isArray(candles) ? candles.at(-1) : null;
        yeniPusu.kaynakSonKapaliMumZamani = Number(kaynakSonMum?.closeTime || 0);
        yeniPusu.sonSt2DogrulamaMumZamani = yeniPusu.kaynakSonKapaliMumZamani;
        yeniPusu.olusumZamani = Date.now();
        yeniPusu.pusuSchema = 2;
        yeniPusu.st2ContextValid = true;
        yeniPusu.entryEvolutionMode = 'LIVE_AUTHORITY';
        const ilkCanliFiyat = Number(h.state.canliFiyatlar?.[sym] || 0);
        yeniPusu.sonCanliFiyat = ilkCanliFiyat > 0 ? ilkCanliFiyat : null;
        store.pusular[sym] = yeniPusu;
        if (adayEventZamani > 0) store.sonPusuEventZamani[sym] = adayEventZamani;

        const exactContext = exactContextHesapla(candles, match, bricks, bollinger, boxSize);
        yeniPusu.rbb = exactContext.rbb;
        yeniPusu.rbbw = exactContext.rbbw;
        yeniPusu.atrRegime = exactContext.atrRegime;
        yeniPusu.trend20 = exactContext.trend20;
        yeniPusu.exactContextSnapshot = exactContext;
        yeniPusu.renkoBb = { ...scenario, zone: exactContext.rbb, widthRegime: exactContext.rbbw };
        yeniPusu.renkoBoxSize = Number(boxSize || 0);
        yeniPusu.sourceTimeframe = kaynakTf();

        // R30.2 CONFIRMED_RENKO_SOURCE_FROZEN:
        // Rolling son-N 15m cache'in ilk mumu kaydıkça Renko anchor/geometrisi
        // yeniden hizalanmasın. Pusu anındaki kapanmış kaynak dizi korunur;
        // daha sonra yalnız yeni kapanmış mumlar bunun sonuna eklenir.
        yeniPusu.renkoSourceCandles = (Array.isArray(candles) ? candles : []).map(c => ({
            openTime: Number(c?.openTime || 0),
            open: String(c?.open ?? ''),
            high: String(c?.high ?? ''),
            low: String(c?.low ?? ''),
            close: String(c?.close ?? ''),
            volume: String(c?.volume ?? ''),
            closeTime: Number(c?.closeTime || 0)
        }));
        yeniPusu.renkoSourceAnchorOpenTime = Number(yeniPusu.renkoSourceCandles?.[0]?.openTime || 0);
        yeniPusu.renkoSonTuglaDizisi = exactContext.renko6;
        yeniPusu.renkoSon10Tugla = tuglaKaniti(bricks, Number(ayarlar.renkoKanitTuglaSayisi || 10));
        const frozenEntryDecision = aktifTuglaKarari(yeniPusu);
        const entryModeDecision = renkoEntryModePolicy.select(yeniPusu);
        yeniPusu.entryModeDecisionAtSignal = entryModeDecision;
        yeniPusu.entryMode = entryModeDecision.selectedMode;
        yeniPusu.entryModeOffsetT = Number(entryModeDecision.selectedOffsetT);
        yeniPusu.entryTimingAuthority = entryModeDecision.selectedMode === 'CONFIRMED'
            ? `CLOSED_${kaynakTf().toUpperCase()}_RENKO_REVERSAL_PLUS_OFFSET_1M_ST`
            : 'RENKO_EVOLUTION_1M_RENKO_ST';
        // DIRECT offset mevcut Entry Evolution / Adaptive DNA otoritesinden gelir.
        // CONFIRMED offset pusu sonrasında kapanmış 15m Renko dönüş tuğlasından sonra ölçülür.
        // 1m Renko SuperTrend yalnız son sniper/yön teyididir.
        yeniPusu.renkoEntryBrickDistance = entryModeDecision.selectedMode === 'DIRECT'
            ? Number(frozenEntryDecision.brick || entryEvolution.DEFAULT_BRICK())
            : Number(entryModeDecision.selectedOffsetT || 0.25);
        yeniPusu.adaptiveEntryDecisionAtSignal = frozenEntryDecision;
        yeniPusu.canliTetikFiyati = entryModeDecision.selectedMode === 'DIRECT' ? canliTetikFiyati(yeniPusu) : null;
        const pusuKaniti = pusuOlusumKanitiMetni(sym, yeniPusu);
        yeniPusu.renkoPusuKanitMetni = pusuKaniti;
        const gateOzeti = pusuGateOzeti(yeniPusu);
        yeniPusu.exactDnaKeyAtSignal = gateOzeti.dnaKey;
        yeniPusu.exactDnaIdAtSignal = gateOzeti.dnaId;
        yeniPusu.historicalExecutionModeAtSignal = gateOzeti.executionMode;
        yeniPusu.historicalGateReasonAtSignal = gateOzeti.reason;
        yeniPusu.historicalCompletionAtSignal = gateOzeti.completion;
        yeniPusu.premierScoreAtSignal = gateOzeti.premierScore;
        yeniPusu.premierScoreValueAtSignal = gateOzeti.score;
        renkoProofConsoleYaz(pusuKaniti);

        const bildirimAnahtari = `${sym}|${signature}`;
        const dahaOnceBildirildi = Boolean(store.pusuTelegramBildirimleri[bildirimAnahtari]);
        if (!dahaOnceBildirildi) {
            store.pusuTelegramBildirimleri[bildirimAnahtari] = Date.now();
            if (ayarlar.renkoPusuKanitTelegram !== false) {
                if (!baslangicPusuOzetiGonderildi) {
                    baslangicPusuKuyrugu.push({ sym, sourceTimeframe: kaynakTf(), yon: match.yon, patternId: match.patternId, patternKodu: yeniPusu.patternKodu, patternSignature: signature, pusuKaniti, ...gateOzeti });
                } else {
                    const patternId = String(match.patternId || 'PATTERN').trim();
                    const patternKodu = String(yeniPusu.patternKodu || match.patternCode || '').trim();
                    const patternEtiketi = patternKodu && !/^(undefined|null|nan)$/i.test(patternKodu)
                        ? `${patternId} (${patternKodu})`
                        : patternId;
                    const modEtiketi = gateOzeti.executionMode === 'PREMIER' ? '🏆 PREMIER' : '⛔ REJECT';
                    const skorMetni = gateOzeti.relativeCohort > 0 ? ` | Skor ${gateOzeti.score.toFixed(1)}/${gateOzeti.scoreThreshold.toFixed(1)} | #${gateOzeti.relativeRank}/${gateOzeti.relativeCohort}` : '';
                    const skorAciklama = pusuSkorAciklama(gateOzeti);
                    const kisaMesaj = `🪤 <b>YENİ ST2 RENKO PUSU</b>
${sym} ${match.yon} | ${patternEtiketi}
🧬 DNA ${gateOzeti.dnaId} | ${modEtiketi}${skorMetni}
🧾 ${gateOzeti.reason}
${skorAciklama ? `${skorAciklama}
` : ''}BB temas ✅ | Referans ${fiyatFormatla(yeniPusu.referansSeviye)} | Entry Evolution ${pusuTetikSunumu(yeniPusu)}
⏳ Giriş: CONFIRMED ise pusu sonrası kapanmış 15m Renko dönüşü + seçilen T seviyesi; 1m Renko SuperTrend yalnız son yön teyidi. .`;
                    h.telegramMesajGonderTekil(kisaMesaj, { coalesceKey: `st2-yeni-pusu:${bildirimAnahtari}` })
                        .then(sonuclar => {
                            const ok = Array.isArray(sonuclar) && sonuclar.length > 0 && sonuclar.every(x => x?.sonuc?.ok === true);
                            const belirsiz = Array.isArray(sonuclar) && sonuclar.some(x => x?.sonuc?.ambiguousDelivery === true);
                            console.log(`${ok ? '✅' : '⚠️'} [ST2 RENKO YENİ PUSU] ${sym} | ${ok ? 'TEKİL TESLİM OK' : belirsiz ? 'TESLİM BELİRSİZ; ÇİFT GÖNDERİMİ ÖNLEMEK İÇİN TEKRAR YOK' : 'TESLİM BAŞARISIZ; AYNI OLAY TEKRARLANMAYACAK'}`);
                        })
                        .catch(e => console.log(`⚠️ [ST2 RENKO YENİ PUSU] Telegram gönderimi başarısız ${sym}: ${e.message}`));
                }
            }
        }
        store.sonPatternSignature[sym] = signature;
        if (audit) {
            audit.yeniPattern++;
            audit.yeniPusu++;
            if (match.yon === 'LONG') { audit.bbLongTemas++; audit.longPusu++; }
            else { audit.bbShortTemas++; audit.shortPusu++; }
        }
        return yeniPusu;
    }

    if (mevcutBaslangic && store.pusular[sym]) {
        store.sonIptalPatternSignature[sym] = mevcutBaslangic.patternSignature;
        delete store.pusular[sym];
        if (audit) { audit.st2ContextIptal++; audit.red.ST2_CONTEXT_INVALIDATED++; }
        console.log(`🧯 [ST2 PUSU İPTAL] ${sym} ${mevcutBaslangic.yon} | Güncel Renko/BB bağlamı aynı yönlü pusuyu doğrulamıyor.`);
    }
    if (audit) audit.red.BB_TEMAS_YOK++;
    return null;
}

function eskiPusuyuSuresiDolduysaSil(sym, bricks, candles, audit = null) {
    const store = storeHazirla();
    const pusu = store.pusular[sym];
    if (!pusu || !Array.isArray(bricks) || !bricks.length) return false;

    const sourceTime = Number(pusu.sonKapaliTuglaZamani || pusu.referansTuglaCloseTime || 0);
    if (!(sourceTime > 0)) {
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        store.sonIptalPusuEventZamani[sym] = Math.max(
            Number(store.sonIptalPusuEventZamani[sym] || 0),
            Number(bricks.at(-1)?.closeTime || 0)
        );
        delete store.pusular[sym];
        if (audit?.red) audit.red.LEGACY_PUSU_INVALIDATED = Number(audit.red.LEGACY_PUSU_INVALIDATED || 0) + 1;
        console.log(`🧯 [ST2 PUSU İPTAL] ${sym} ${pusu.yon} | Renko oluşum tuğlası zamanı yok.`);
        return true;
    }

    const sonra = bricks.filter(b => Number(b?.closeTime || 0) > sourceTime).length;
    pusu.gecenRenkoTuglaSayisi = sonra;

    const frozenMode = String(
        pusu?.entryModeDecisionAtSignal?.selectedMode ||
        pusu?.entryMode ||
        ''
    ).toUpperCase();

    // R23.2 CONFIRMED_LEGACY_EXPIRY_BYPASS:
    // CONFIRMED pusu zaten ilk kapanmış 15m reversal + 0.25/0.50/0.75T bekler.
    // Legacy 3-tuğla sayaç bu lifecycle'ı reversal değerlendirilmeden öldüremez.
    if (ayarlar.renkoGirisModuZorlaConfirmed === true || frozenMode === 'CONFIRMED') {
        pusu.legacyExpiryBypassedForConfirmed = true;
        return false;
    }

    const limit = Math.max(1, Number(ayarlar.maxPusuBeklemeTugla || 3));
    if (sonra < limit) return false;

    store.sonIptalPatternSignature[sym] = pusu.patternSignature;
    store.sonIptalPusuEventZamani[sym] = Math.max(
        Number(store.sonIptalPusuEventZamani[sym] || 0),
        Number(bricks.at(-1)?.closeTime || 0)
    );
    delete store.pusular[sym];
    if (audit?.red) audit.red.PUSU_SURESI_DOLDU = Number(audit.red.PUSU_SURESI_DOLDU || 0) + 1;
    console.log(`⏰ [ST2 PUSU İPTAL] ${sym} ${pusu.yon} | ${sonra}/${limit} yeni Renko tuğlası geçti; pusu süresi doldu.`);
    return true;
}


function entryModeDecisionForPusu(pusu = {}) {
    if (typeof renkoEntryModePolicy.selectFrozen === 'function') {
        return renkoEntryModePolicy.selectFrozen(pusu);
    }

    // Geriye dönük test/runtime adapter'ları yalnız select() expose ediyorsa aynı
    // frozen sözleşmesini burada koru. Production policy selectFrozen() kullanır.
    const frozen = pusu?.entryModeDecisionAtSignal || null;
    const forceConfirmed = ayarlar.renkoGirisModuZorlaConfirmed === true;
    const frozenMode = String(frozen?.selectedMode || '').toUpperCase();
    if (frozen && (!forceConfirmed || frozenMode === 'CONFIRMED')) return frozen;

    const selected = renkoEntryModePolicy.select(pusu);
    if (forceConfirmed && frozen && String(selected?.selectedMode || '').toUpperCase() === 'CONFIRMED') {
        return {
            ...selected,
            migratedFromMode: frozenMode || null,
            forcedMigrationAt: new Date().toISOString(),
            migrationReason: 'R23_1_FORCE_CONFIRMED_EXISTING_PUSU'
        };
    }
    return selected;
}

async function pusuDegerlendir(sym, onay1m = null, audit = null) {
    const store = storeHazirla();
    const pusu = store.pusular[sym];
    if (!pusu) return false;

    if (audit) audit.pusuDegerlendirilen++;
    const price = Number(h.state.canliFiyatlar?.[sym] || 0);
    if (!(price > 0)) {
        if (audit) audit.fiyatEksik++;
        return false;
    }

    // Golden Renko: Adaptive/Entry Evolution kararı kalite-yeterlilik kanıtı olarak dondurulur.
    // Gerçek zamanlama otoritesi R23.1'de ayrı ve frozen CONFIRMED policy kararıdır.
    const adaptiveEntryDecision = pusu.adaptiveEntryDecisionAtSignal || aktifTuglaKarari(pusu);
    const entryModeDecision = entryModeDecisionForPusu(pusu);
    pusu.entryModeDecisionAtSignal = entryModeDecision;
    pusu.entryMode = entryModeDecision.selectedMode;
    pusu.entryModeOffsetT = Number(entryModeDecision.selectedOffsetT);
    if (audit) {
        if (entryModeDecision.selectedMode === 'CONFIRMED') audit.entryModeConfirmed = Number(audit.entryModeConfirmed || 0) + 1;
        else audit.entryModeDirect = Number(audit.entryModeDirect || 0) + 1;
    }
    const selectedEntryBrick = Number(entryModeDecision.selectedMode === 'DIRECT'
        ? (pusu.renkoEntryBrickDistance || adaptiveEntryDecision.brick || entryEvolution.DEFAULT_BRICK())
        : (entryModeDecision.selectedOffsetT || ayarlar.renkoGirisTeyitVarsayilanTugla || 0.25));

    // Migration sonrası pusu üzerindeki görünür/frozen alanları da tek otoriteyle eşitle.
    // Böylece rapor, confirmationTarget ve gerçek emir aynı mode/offset'i görür.
    pusu.entryTimingAuthority = entryModeDecision.selectedMode === 'CONFIRMED'
        ? `CLOSED_${kaynakTf().toUpperCase()}_RENKO_REVERSAL_PLUS_OFFSET_1M_ST`
        : 'RENKO_EVOLUTION_1M_RENKO_ST';
    pusu.renkoEntryBrickDistance = selectedEntryBrick;
    if (entryModeDecision.selectedMode === 'CONFIRMED') pusu.canliTetikFiyati = null;

    const renkoBricks15mForMode = store.seriler?.[sym] || [];
    const confirmationGate = entryModeDecision.selectedMode === 'CONFIRMED'
        ? renkoEntryModePolicy.confirmationTarget(pusu, renkoBricks15mForMode, Number(store.boxSize?.[sym] || pusu.renkoBoxSize || 0))
        : null;
    const target = entryModeDecision.selectedMode === 'CONFIRMED'
        ? Number(confirmationGate?.targetPrice || 0)
        : entryEvolution.targetPrice(pusu, selectedEntryBrick);
    if (entryModeDecision.selectedMode === 'CONFIRMED' && confirmationGate?.ready === true) {
        const confirmationKey = `${Number(confirmationGate?.reversal?.confirmation?.closeTime || 0)}|${Number(target || 0)}`;
        pusu.confirmation15m = {
            timeframe: pusu.sourceTimeframe || kaynakTf(),
            pair: confirmationGate?.reversal?.pair || null,
            basePrice: Number(confirmationGate?.basePrice || 0),
            boxSize: Number(confirmationGate?.boxSize || 0),
            offsetT: Number(confirmationGate?.offsetT || selectedEntryBrick),
            targetPrice: Number(target || 0),
            confirmationBrickId: confirmationGate?.reversal?.confirmation?.id ?? null,
            confirmationCloseTime: Number(confirmationGate?.reversal?.confirmation?.closeTime || 0),
            previousBrickId: confirmationGate?.reversal?.previous?.id ?? null,
            previousColor: confirmationGate?.reversal?.previous?.color || null,
            previousHigh: Number(confirmationGate?.reversal?.previous?.high || 0),
            previousLow: Number(confirmationGate?.reversal?.previous?.low || 0),
            previousClose: Number(confirmationGate?.reversal?.previous?.close || 0),
            previousCloseTime: Number(confirmationGate?.reversal?.previous?.closeTime || 0),
            authority: `CLOSED_${(pusu.sourceTimeframe || kaynakTf()).toUpperCase()}_RENKO_REVERSAL_PLUS_OFFSET_FIRST_REVERSAL_FROZEN`
        };
        if (pusu.son15mConfirmationLogKey !== confirmationKey) {
            pusu.son15mConfirmationLogKey = confirmationKey;
            console.log(`✅ [CONFIRMED ${String(pusu.sourceTimeframe || kaynakTf()).toUpperCase()} DÖNÜŞ HAZIR] ${sym} ${pusu.yon} | ${pusu.confirmation15m.pair || 'YOK'} | Base ${fiyatFormatla(pusu.confirmation15m.basePrice)} | Offset ${selectedEntryBrick.toFixed(2)}T | Tetik ${fiyatFormatla(target)} | 1m Renko ST son teyit`);
        }
    }
    const historicalEntryGateRaw = adaptiveDnaEntry.gateDecision({
        ...pusu,
        renkoEntryBrickDistance: selectedEntryBrick,
        adaptiveDnaEntryDecision: adaptiveEntryDecision
    }, selectedEntryBrick);
    // Premier/Shadow yeterlilik kapısı ile giriş zamanlaması birbirinden ayrıdır.
    // CONFIRMED modunda gate'in öğrendiği DIRECT tuğla yalnız yeterlilik kanıtıdır;
    // gerçek tetik offset'i seçilmiş CONFIRMED değeridir.
    const historicalEntryGate = entryModeDecision.selectedMode === 'CONFIRMED'
        ? { ...historicalEntryGateRaw, qualificationBrick: Number(historicalEntryGateRaw.brick), brick: selectedEntryBrick, entryMode: 'CONFIRMED' }
        : historicalEntryGateRaw;

    if (!(target > 0)) {
        if (entryModeDecision.selectedMode === 'CONFIRMED') {
            const confirmedReason = confirmationGate?.reason || 'CONFIRMATION_NOT_READY';
            const terminalConfirmedReasons = new Set([
                'CONFIRMED_WINDOW_EXPIRED_AFTER_NEXT_15M_RENKO',
                'CONFIRMATION_15M_FROZEN_BRICK_NOT_FOUND',
                'CONFIRMATION_15M_REFERENCE_NOT_IN_SERIES'
            ]);

            if (terminalConfirmedReasons.has(confirmedReason)) {
                store.sonIptalPatternSignature[sym] = pusu.patternSignature;
                store.sonIptalPusuEventZamani[sym] = Math.max(
                    Number(store.sonIptalPusuEventZamani[sym] || 0),
                    Number(renkoBricks15mForMode.at(-1)?.closeTime || 0),
                    Number(pusu.sonKapaliTuglaZamani || 0)
                );
                delete store.pusular[sym];
                if (audit) {
                    audit.st2ContextIptal = Number(audit.st2ContextIptal || 0) + 1;
                    if (audit.red) audit.red.ST2_CONTEXT_INVALIDATED = Number(audit.red.ST2_CONTEXT_INVALIDATED || 0) + 1;
                }
                console.log(`🧯 [CONFIRMED PUSU GEÇ GİRİŞ İPTAL] ${sym} ${pusu.yon} | ${confirmedReason} | Eski hareket kovalanmayacak.`);
                return false;
            }

            pusu.confirmationWaitReason = confirmedReason;
            pusu.sonCanliFiyat = price;
            if (audit) {
                audit.fiyatBekleyen++;
                audit.confirmedWaiting = Number(audit.confirmedWaiting || 0) + 1;
                audit.confirmedWaitReasons ||= {};
                audit.confirmedWaitReasons[pusu.confirmationWaitReason] = Number(audit.confirmedWaitReasons[pusu.confirmationWaitReason] || 0) + 1;
            }
            return false;
        }
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        delete store.pusular[sym];
        console.log(`🧯 [ST2 PUSU İPTAL] ${sym} ${pusu.yon} | DIRECT Entry Evolution tetik seviyesi geçersiz.`);
        return false;
    }

    const renkoSt = onay1m || birDakikaRenkoSuperTrend(sym);
    const fiyatUygun = pusu.yon === 'LONG' ? price >= target : price <= target;
    const stUygun = pusu.yon === 'LONG' ? renkoSt?.trend === 'UP' : renkoSt?.trend === 'DOWN';
    pusu.fiyatTetigiGoruldu = fiyatUygun;
    pusu.superTrendOnayi = stUygun;
    pusu.sonCanliFiyat = price;

    if (audit) {
        if (fiyatUygun) audit.fiyatTetigi++;
        else {
            audit.fiyatBekleyen++;
            if (entryModeDecision.selectedMode === 'CONFIRMED') audit.confirmedPriceWaiting = Number(audit.confirmedPriceWaiting || 0) + 1;
            else audit.directPriceWaiting = Number(audit.directPriceWaiting || 0) + 1;
        }
        if (entryModeDecision.selectedMode === 'CONFIRMED') audit.confirmedReady = Number(audit.confirmedReady || 0) + 1;
        if (stUygun) audit.stOnayi++; else audit.stReddi++;
        if (fiyatUygun && stUygun) audit.birlikteUygun++;
    }

    // Eski başarılı davranış: yeniden çaprazlama/taze kırılım zorunluluğu yoktur.
    // Fiyat seçilmiş seviyenin doğru tarafında ve 1m Renko ST aynı yöndeyse giriş yapılır.
    if (!fiyatUygun || !stUygun) return false;

    // DIRECT gerçek kapısı: izin verilmeyen tuğla profili canlı runtime'a alınmaz.
    const directRealGate = m.gercekDirectTuglaKapisi({
        entryStrategy: 'ST2_RENKO',
        entryMode: entryModeDecision.selectedMode,
        renkoEntryBrickDistance: selectedEntryBrick,
        entryModeOffsetT: selectedEntryBrick
    });
    if (entryModeDecision.selectedMode === 'DIRECT' && directRealGate?.allowed !== true) {
        if (audit) audit.pozisyonReddedildi = Number(audit.pozisyonReddedildi || 0) + 1;
        const izinli = (directRealGate?.allowedBricks || []).map(x => Number(x).toFixed(2) + 'T').join(',') || '0.50T,1.00T';
        console.log(`⛔ [DIRECT T RED] ${sym} ${pusu.yon} | ${selectedEntryBrick.toFixed(2)}T gerçek emir YOK | İzinli ${izinli}`);
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        delete store.pusular[sym];
        return false;
    }
    const renkoKanit = renkoKanitiMetni(sym, pusu, target, price, renkoSt);
    renkoProofConsoleYaz(renkoKanit);
    console.log(`🎯 [GOLDEN RENKO TETİK] ${sym} ${pusu.yon} | Mode ${entryModeDecision.selectedMode} | Offset ${selectedEntryBrick.toFixed(2)}T ${fiyatFormatla(target)} | Canlı ${fiyatFormatla(price)} | 1m Renko ST ${renkoSt?.trend || 'YOK'}`);

    const girisAnalizi = {
        entryStrategy: 'ST2_RENKO',
        entryTimingAuthority: entryModeDecision.selectedMode === 'CONFIRMED' ? `CLOSED_${kaynakTf().toUpperCase()}_RENKO_REVERSAL_PLUS_OFFSET_1M_ST` : 'RENKO_EVOLUTION_1M_RENKO_ST',
        entryEvolutionMode: 'LIVE_AUTHORITY',
        entryMode: entryModeDecision.selectedMode,
        entryModeOffsetT: selectedEntryBrick,
        entryModeDecision: entryModeDecision,
        confirmationGate: confirmationGate,
        pusuPeriyodu: pusu.sourceTimeframe || kaynakTf(),
        sourceTimeframe: pusu.sourceTimeframe || kaynakTf(),
        sniperPeriyodu: ayarlar.renkoOnayPeriyodu || '1m',
        trendPeriyodu: '1m_RENKO',
        hedefFiyati: pusu.referansSeviye,
        tetikFiyati: target,
        tetikYuzdesiAyar: Number(ayarlar.renkoTetikYuzdesi || 0),
        renkoEntryBrickDistance: selectedEntryBrick,
        adaptiveDnaEntryDecision: adaptiveEntryDecision,
        historicalEntryGate,
        entryDecisionBinding: {
            verified: Math.abs(Number(historicalEntryGate.brick) - selectedEntryBrick) <= 1e-9,
            selectedBrick: selectedEntryBrick,
            gateBrick: Number(historicalEntryGate.brick),
            targetPrice: target,
            source: adaptiveEntryDecision.source || 'RENKO_ENTRY_EVOLUTION',
            reason: adaptiveEntryDecision.reason || historicalEntryGate.reason || 'UNKNOWN',
            timingAuthority: entryModeDecision.selectedMode === 'CONFIRMED' ? `CLOSED_${kaynakTf().toUpperCase()}_RENKO_REVERSAL_PLUS_OFFSET_1M_ST` : 'RENKO_EVOLUTION_1M_RENKO_ST',
            evolutionMode: 'LIVE_AUTHORITY',
            frozenAt: new Date().toISOString()
        },
        tetikModu: entryModeDecision.selectedMode === 'CONFIRMED' ? `RENKO_${kaynakTf().toUpperCase()}_CLOSED_REVERSAL_PLUS_OFFSET` : 'RENKO_PATTERN_ADAPTIVE_BRICK_DISTANCE',
        girisFiyati: price,
        superTrendYonu: renkoSt?.trend || null,
        stKaynak: '1m_RENKO',
        senaryo: pusu.senaryo,
        patternId: pusu.patternId,
        patternAilesi: pusu.patternAilesi,
        patternKodu: pusu.patternKodu,
        patternUzunlugu: pusu.patternUzunlugu,
        referansTipi: pusu.referansTipi,
        referansSeviye: pusu.referansSeviye,
        referansTuglaHigh: pusu.referansTuglaHigh,
        referansTuglaLow: pusu.referansTuglaLow,
        renkoBoxSize: store.boxSize?.[sym] || pusu.renkoBoxSize || 0,
        renkoBb: pusu.renkoBb || null,
        rbb: pusu.rbb,
        rbbw: pusu.rbbw,
        atrRegime: pusu.atrRegime,
        trend20: pusu.trend20,
        exactContextSnapshot: pusu.exactContextSnapshot || null,
        renkoBbTemasToleransTugla: Number(ayarlar.renkoBbTemasToleransTugla ?? 0.25),
        renkoSonTuglaDizisi: pusu.renkoSonTuglaDizisi || pusu.patternKodu,
        renkoSon10Tugla: pusu.renkoSon10Tugla || [],
        renkoKanitMetni: renkoKanit,
        pusuDebug: renkoKanit,
        kaynakSonKapaliMumZamani: pusu.kaynakSonKapaliMumZamani,
        gecenRenkoTuglaSayisi: Number(pusu.gecenRenkoTuglaSayisi || 0),
        renkoOnayBoxSize1m: store.onayBoxSize1m?.[sym] || 0,
        pusuTuglasi: { ...pusu }
    };

    const ok = await m.pozisyonAc(sym, pusu.yon, price, girisAnalizi);
    if (audit) { if (ok) audit.pozisyonAcildi++; else audit.pozisyonReddedildi++; }
    if (ok) {
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        delete store.pusular[sym];
    }
    return ok;
}


function auditLogla(audit) {
    const store = storeHazirla();
    store.audit = audit;
    const now = Date.now();
    if (now - Number(store.sonAuditLogZamani || 0) < Number(ayarlar.renkoAuditLogMs || 60000)) return;
    store.sonAuditLogZamani = now;
    const aktif = Object.values(store.pusular || {});
    console.log(`🧱 [ST2 RENKO AUDIT] Evren ${audit.evrenToplam} | Taranan ${audit.sembol} | Açık atlandı ${audit.acikPozisyonAtlandi} | Veri eksik ${audit.veriEksik} | Süre ${audit.sureMs} ms | Sembol ${audit.sembol} | ${kaynakTf()} ATR ${audit.atrHazir} | Renko ${audit.renkoHazir} (min ${audit.renkoMin ?? 0}/max ${audit.renkoMax}) | Pattern aday ${audit.patternAday} | Yeni pattern ${audit.yeniPattern} | BB hazır ${audit.bbHazir} | BB temas L${audit.bbLongTemas}/S${audit.bbShortTemas} | 1m Renko ST ${audit.onay1mRenkoHazir} (UP ${audit.onay1mUp}/DOWN ${audit.onay1mDown}) | Yeni pusu L${audit.longPusu}/S${audit.shortPusu} | Aktif ${aktif.length}`);
    if (Number(audit.bildirimHafizaTemizlenen || 0) > 0) console.log(`🧹 [ST2 PUSU DEDUPE] Eski/fazla bildirim anahtarı temizlendi: ${audit.bildirimHafizaTemizlenen}`);
    const confirmedReasons = Object.entries(audit.confirmedWaitReasons || {}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(',') || 'YOK';
    console.log(`🔎 [ST2 GİRİŞ HUNİSİ] Tarama ${audit.sembol} → Renko ${audit.renkoHazir} → Aktif/Yeni pusu ${aktif.length}/${audit.yeniPusu} → Değerlendirilen ${audit.pusuDegerlendirilen} → Mode D/C ${Number(audit.entryModeDirect||0)}/${Number(audit.entryModeConfirmed||0)} → Evolution fiyat uygun ${audit.fiyatTetigi} → 1m Renko ST uygun ${audit.stOnayi} → Birlikte uygun ${audit.birlikteUygun} → Pozisyon ${audit.pozisyonAcildi} | Bekleyen: DIRECT fiyat ${Number(audit.directPriceWaiting||0)} | CONFIRMED ${kaynakTf()} dönüş ${Number(audit.confirmedWaiting||0)} [${confirmedReasons}] | CONFIRMED fiyat ${Number(audit.confirmedPriceWaiting||0)} | 1m ST ${audit.stReddi} | Bağlam iptal ${audit.st2ContextIptal} | Pozisyon katmanı ${audit.pozisyonReddedildi}`);
    console.log(`🧱 [ST2 RENKO RED] ATR ${audit.red.ATR_YETERSIZ} | Renko ${audit.red.RENKO_YETERSIZ} | Pattern yok ${audit.red.PATTERN_YOK} | BB yetersiz ${audit.red.BB_YETERSIZ} | BB geçersiz ${audit.red.BB_GECERSIZ} | BB temas yok ${audit.red.BB_TEMAS_YOK} | Long alt temas yok ${audit.red.LONG_ALT_BAND_TEMASI_YOK} | Short üst temas yok ${audit.red.SHORT_UST_BAND_TEMASI_YOK} | Orta bölge red ${audit.red.ORTA_BAND_BOLGE_RED} | Pusu Renko süre ${audit.red.PUSU_SURESI_DOLDU} | Geç giriş hard red 0 | ST2 bağlam ${audit.red.ST2_CONTEXT_INVALIDATED} | Legacy pusu ${audit.red.LEGACY_PUSU_INVALIDATED} | 1m Renko ST yetersiz ${audit.red.ONAY_1M_RENKO_YETERSIZ} (tuğla ${audit.onay1mTuglaYetersiz} / hesap ${audit.onay1mStHesapYetersiz})`);
    const dagilim = Object.entries(audit.patternDagilimi || {}).sort().map(([k,v]) => `${k}:${v}`).join(' ') || 'YOK';
    console.log(`🧱 [ST2 RENKO PATTERN] ${dagilim}`);
    for (const [i, x] of (audit.yakinRedAdaylari || []).entries()) {
        console.log(`🔬 [ST2 RENKO YAKIN RED ${i + 1}] ${x.sym} ${x.yon} ${x.patternId} (${x.patternKodu}) | Sebep ${x.redSebep} | Band farkı ${x.bandFarkTugla.toFixed(4)} tuğla (${fiyatFormatla(x.bandFarkFiyat)}) | Tol ${x.toleransTugla.toFixed(2)} | Box ${fiyatFormatla(x.boxSize)} | BB A/O/U ${fiyatFormatla(x.altBand)}/${fiyatFormatla(x.ortaBand)}/${fiyatFormatla(x.ustBand)} | Son L/H/C ${fiyatFormatla(x.sonTuglaLow)}/${fiyatFormatla(x.sonTuglaHigh)}/${fiyatFormatla(x.sonTuglaClose)} | T ${zamanFormatla(x.sonTuglaZamani)} | Dizi ${x.tuglaDizisi || 'YOK'}`);
    }
}

async function taraVeDegerlendirTekTf(tf) {
    AKTIF_KAYNAK_TF = tf;
    const taramaBaslangici = Date.now();
    const store = storeHazirla();
    const audit = auditBaslat();
    audit.bildirimHafizaTemizlenen = pusuBildirimHafizasiniTemizle(store);
    audit.evrenToplam = (h.state.semboller || []).length;
    for (const sym of h.state.semboller || []) {
        let sembolBaslangicMs = Date.now();
        let tAtrMs = 0, tRenkoMs = 0, tExpireMs = 0, tBbMs = 0, tPatternMs = 0, tOnay1mMs = 0, tPusuMs = 0;
        const acikPozisyonVar = (h.state.alinanlar || []).includes(sym) || (h.state.aktifShortlar || []).includes(sym);
        audit.sembol++;
        // R11: uzun 200-sembol taramada timer/Telegram/ağ callback'lerine düzenli fırsat ver.
        // Sembol sırası, hesaplama ve karar matematiği aynıdır; yalnız event-loop fairness sağlanır.
        const yieldEvery = Math.max(1, Number(ayarlar.renkoRuntimeYieldEverySembol || 8));
        if (audit.sembol % yieldEvery === 0) {
            const yieldBaslangic = Date.now();
            await new Promise(resolve => setImmediate(resolve));
            const yieldGecikmeMs = Date.now() - yieldBaslangic;
            if (yieldGecikmeMs >= Math.max(250, Number(ayarlar.renkoEventLoopStarvationLogMs || 1000))) {
                console.warn(`⚠️ [ST2 EVENT LOOP STARVATION] ${yieldGecikmeMs} ms | Sıradaki ${sym} | Renko tarama ${audit.sembol}/${audit.evrenToplam}`);
            }
            // Sembol performans ölçümü scheduler/event-loop beklemesini sembol hesabına yazmaz.
            sembolBaslangicMs = Date.now();
        }
        const candles = tfCandleBirlesimi(sym, kaynakTf());
        if (!Array.isArray(candles) || candles.length === 0) { audit.veriEksik++; continue; }
        audit.kaynakMumToplam += candles.length;
        const sourceCloseTime = Number(candles.at(-1)?.closeTime || 0);

        // Bir baska TF ayni sembolde gercek pozisyon actiysa bu TF'nin eski pususu kapanis sonrasi
        // gecikmis girise donusemez. Yeni kaynak Renko olayi beklenir.
        if (acikPozisyonVar) {
            const stale = store.pusular?.[sym];
            if (stale) {
                store.sonIptalPatternSignature[sym] = stale.patternSignature;
                store.sonIptalPusuEventZamani[sym] = Math.max(Number(store.sonIptalPusuEventZamani[sym] || 0), sourceCloseTime, Number(stale.sonKapaliTuglaZamani || 0));
                delete store.pusular[sym];
                console.log(`🔒 [MTF SEMBOL KILIDI] ${kaynakTf()} ${sym} | Başka TF gerçek pozisyon açık; eski pusu iptal.`);
            }
            audit.acikPozisyonAtlandi++;
            continue;
        }

        // Kapanmis kaynak mum degismediyse ATR/Renko/BB/pattern yeniden uretilmez.
        // Aktif pusu varsa yalniz canli fiyat + hazir 1m Renko-ST ile gate degerlendirilir.
        if (sourceCloseTime > 0 && Number(store.sonKaynakMumZamani?.[sym] || 0) === sourceCloseTime) {
            audit.sourceUnchangedFastPath++;
            if (store.pusular?.[sym]) {
                const onay1m = birDakikaRenkoSuperTrend(sym, audit);
                await pusuDegerlendir(sym, onay1m, audit);
            }
            continue;
        }
        const atrBaslangicMs = Date.now();
        const liveAtrBox = core.atr(candles, Number(ayarlar.renkoAtrPeriod || 14));
        const aktifPusuForBox = store.pusular?.[sym] || null;
        const aktifPusuMode = String(
            aktifPusuForBox?.entryModeDecisionAtSignal?.selectedMode ||
            aktifPusuForBox?.entryMode ||
            ''
        ).toUpperCase();
        let renkoCandles = candles;

        if (
            aktifPusuForBox &&
            (ayarlar.renkoGirisModuZorlaConfirmed === true || aktifPusuMode === 'CONFIRMED')
        ) {
            const frozenSource = Array.isArray(aktifPusuForBox.renkoSourceCandles)
                ? aktifPusuForBox.renkoSourceCandles
                : [];

            // Eski R30.1 pusularında frozen source yoksa yeniden hizalanmış
            // Renko ile gerçek emir üretmek yerine fail-closed iptal et.
            if (!frozenSource.length) {
                store.sonIptalPatternSignature[sym] = aktifPusuForBox.patternSignature;
                delete store.pusular[sym];
                console.log(`🧯 [CONFIRMED RENKO SOURCE YOK] ${sym} | Legacy pusu fail-closed iptal; yeni pusu frozen 15m kaynakla kurulacak.`);
                continue;
            }

            const merged = new Map();
            // R31 FALSE-BRICK HARDENING: frozen history is immutable. Current rolling cache may
            // only APPEND candles newer than the frozen source; old OHLC cannot overwrite anchor history.
            for (const c of frozenSource) {
                const key = Number(c?.openTime || c?.closeTime || 0);
                if (key > 0) merged.set(key, c);
            }
            const frozenMaxKey = Math.max(0, ...[...merged.keys()]);
            for (const c of (Array.isArray(candles) ? candles : [])) {
                const key = Number(c?.openTime || c?.closeTime || 0);
                if (key > frozenMaxKey) merged.set(key, c);
            }

            renkoCandles = [...merged.values()].sort(
                (a, b) =>
                    Number(a?.openTime || a?.closeTime || 0) -
                    Number(b?.openTime || b?.closeTime || 0)
            );

            // Anormal derecede uzun yaşamda sınırsız state büyümesine izin verme.
            if (renkoCandles.length > 1000) {
                store.sonIptalPatternSignature[sym] = aktifPusuForBox.patternSignature;
                delete store.pusular[sym];
                console.log(`🧯 [CONFIRMED RENKO SOURCE LIMIT] ${sym} | ${renkoCandles.length} mum; pusu fail-closed iptal.`);
                continue;
            }

            aktifPusuForBox.renkoSourceCandles = renkoCandles;
        }

        const frozenConfirmedBox = aktifPusuForBox && (
            ayarlar.renkoGirisModuZorlaConfirmed === true || aktifPusuMode === 'CONFIRMED'
        ) ? Number(aktifPusuForBox.renkoBoxSize || 0) : 0;

        // R23.2 CONFIRMED_RENKO_BOX_FROZEN:
        // Pusu kurulduktan sonra ATR değişimi 15m Renko geometrisini/base'i yeniden yazamaz.
        const box = frozenConfirmedBox > 0 ? frozenConfirmedBox : liveAtrBox;
        tAtrMs = Date.now() - atrBaslangicMs;
        if (!(box > 0)) { audit.red.ATR_YETERSIZ++; continue; }
        audit.atrHazir++;
        // Canlı karar yalnız son Renko patterni/BB/W%R ve birkaç-tuğla pusu yaşını kullanır.
        // Binlerce eski tuğlayı nesne olarak üretmek ilk 200-sembol auditini dakikalarca uzatabiliyordu.
        // renkoUretSon matematiği tam üretimin son N tuğlasıyla bit-bit eşdeğerdir; totalCount yalnız audit içindir.
        const liveTail = Math.max(
            64,
            Number(ayarlar.renkoCanliTaramaMaxTugla || 128),
            Number(ayarlar.renkoBollingerPeriod || ayarlar.bollingerperiod || 20) + 16,
            Number(ayarlar.maxPusuBeklemeTugla || 3) + 16
        );
        const renkoBaslangicMs = Date.now();
        const bricks = typeof core.renkoUretSon === 'function'
            ? core.renkoUretSon(renkoCandles, box, liveTail)
            : core.renkoUret(renkoCandles, box);
        tRenkoMs = Date.now() - renkoBaslangicMs;
        const toplamTugla = Math.max(bricks.length, Number(bricks.totalCount || bricks.length));
        audit.renkoTuglaToplam += toplamTugla;
        audit.renkoMin = audit.renkoMin === null ? toplamTugla : Math.min(audit.renkoMin, toplamTugla);
        audit.renkoMax = Math.max(audit.renkoMax, toplamTugla);
        if (bricks.length < 4) { audit.red.RENKO_YETERSIZ++; continue; }
        audit.renkoHazir++;
        store.seriler[sym] = bricks;
        store.boxSize[sym] = box;
        store.sonKaynakMumZamani[sym] = sourceCloseTime;

        const expireBaslangicMs = Date.now();
        eskiPusuyuSuresiDolduysaSil(sym, bricks, candles, audit);
        tExpireMs = Date.now() - expireBaslangicMs;
        const bbPeriod = Number(ayarlar.renkoBollingerPeriod || ayarlar.bollingerperiod || 20);
        if (bricks.length < bbPeriod) { audit.red.BB_YETERSIZ++; continue; }
        const bbBaslangicMs = Date.now();
        const bb = m.hesaplaBollinger(bricks.map(x => Number(x.close)));
        tBbMs = Date.now() - bbBaslangicMs;
        if (!core.bollingerHazirMi(bb)) { audit.red.BB_GECERSIZ++; continue; }
        audit.bbHazir++;
        const patternBaslangicMs = Date.now();
        patternPususuGuncelle(sym, bricks, bb, box, candles, audit);
        tPatternMs = Date.now() - patternBaslangicMs;
        const onayBaslangicMs = Date.now();
        const onay1m = birDakikaRenkoSuperTrend(sym, audit);
        tOnay1mMs = Date.now() - onayBaslangicMs;
        const pusuBaslangicMs = Date.now();
        await pusuDegerlendir(sym, onay1m, audit);
        tPusuMs = Date.now() - pusuBaslangicMs;
        const sembolToplamMs = Date.now() - sembolBaslangicMs;
        const slowEsikMs = Math.max(250, Number(ayarlar.renkoSlowSymbolLogMs || 1000));
        if (sembolToplamMs >= slowEsikMs) {
            console.log(`🐢 [ST2 RENKO SLOW SYMBOL] ${sym} | Toplam ${sembolToplamMs} ms | ATR ${tAtrMs} | Renko${kaynakTf()} ${tRenkoMs} | Expire ${tExpireMs} | BB ${tBbMs} | Pattern/DNA ${tPatternMs} | 1mST ${tOnay1mMs} | PusuGate ${tPusuMs}`);
        }
        if (audit.sembol % 25 === 0 && Date.now() - taramaBaslangici >= 5000) {
            console.log(`⏱️ [ST2 RENKO SCAN İLERLEME] ${audit.sembol}/${audit.evrenToplam} | ${Date.now() - taramaBaslangici} ms | Son ${sym} | Renko ${audit.renkoHazir} | Pusu ${Object.keys(store.pusular || {}).length}`);
        }
    }

    audit.tetikBekleyen = Object.keys(store.pusular || {}).length;
    audit.sureMs = Date.now() - taramaBaslangici;
    h.state.st2TaramaSagligi = {
        sourceTimeframe: kaynakTf(),
        durum: audit.veriEksik === 0 ? 'HEALTHY' : 'DEGRADED', evren: audit.evrenToplam,
        taranan: audit.sembol, acikPozisyonAtlandi: audit.acikPozisyonAtlandi, veriEksik: audit.veriEksik,
        atrHazir: audit.atrHazir, renkoHazir: audit.renkoHazir,
        onay1mMumHazir: audit.onay1mMumHazir, onay1mAtrHazir: audit.onay1mAtrHazir,
        onay1mRenkoHazir: audit.onay1mRenkoHazir, onay1mUp: audit.onay1mUp, onay1mDown: audit.onay1mDown,
        onay1mYetersiz: audit.onay1mYetersiz, onay1mTuglaYetersiz: audit.onay1mTuglaYetersiz, onay1mStHesapYetersiz: audit.onay1mStHesapYetersiz, sureMs: audit.sureMs,
        pusuDegerlendirilen: audit.pusuDegerlendirilen, fiyatTetigi: audit.fiyatTetigi, fiyatBekleyen: audit.fiyatBekleyen, fiyatEksik: audit.fiyatEksik,
        stOnayi: audit.stOnayi, stReddi: audit.stReddi, birlikteUygun: audit.birlikteUygun, pozisyonAcildi: audit.pozisyonAcildi, pozisyonReddedildi: audit.pozisyonReddedildi,
        entryModeDirect: audit.entryModeDirect, entryModeConfirmed: audit.entryModeConfirmed, confirmedReady: audit.confirmedReady, confirmedWaiting: audit.confirmedWaiting,
        directPriceWaiting: audit.directPriceWaiting, confirmedPriceWaiting: audit.confirmedPriceWaiting, confirmedWaitReasons: { ...(audit.confirmedWaitReasons || {}) },
        sonTamamlanma: new Date().toISOString()
    };
    h.state.st2TfTaramaSagligi ||= {};
    h.state.st2TfTaramaSagligi[kaynakTf()] = { ...(h.state.st2TaramaSagligi || {}) };
    auditLogla(audit);

    // Açılışta bulunan bütün mevcut pusular tek mesajda bir kez bildirilir.
    // Sonraki taramalarda yalnız yeni bulunan pusu kendi kanıt mesajıyla gönderilir.
    // R16 scan-liveness: Telegram teslimi Renko audit/ilk tarama dönüşünü ASLA bloke etmez.
    if (!baslangicPusuOzetiGonderildi && !baslangicPusuOzetiIsleniyor) {
        baslangicPusuOzetiIsleniyor = true;
        setImmediate(async () => {
            try {
            const benzersiz = [];
            const gorulen = new Set();
            for (const x of baslangicPusuKuyrugu) {
                const key = `${x.sourceTimeframe || '15m'}|${x.sym}|${x.patternSignature || `${x.yon}|${x.patternId}`}`;
                if (gorulen.has(key)) continue;
                gorulen.add(key);
                benzersiz.push(x);
            }
            if (ayarlar.renkoPusuKanitTelegram === false || benzersiz.length === 0) {
                baslangicPusuOzetiGonderildi = true;
                baslangicPusuKuyrugu = [];
                console.log(`✅ [ST2 AÇILIŞ PUSU ÖZETİ] ${benzersiz.length} pusu | Telegram özeti gerekmiyor`);
            } else {
                const longlar = benzersiz.filter(x => x.yon === 'LONG');
                const shortlar = benzersiz.filter(x => x.yon === 'SHORT');
                const satir = x => `${x.sourceTimeframe || '15m'} | ${x.sym} ${x.yon} | ${x.patternId || x.patternKodu || 'PATTERN'} | ${x.executionMode === 'PREMIER' ? '🏆' : '⛔'} DNA ${x.dnaId || 'YOK'}`;
                const maxSatir = ayarlar.telegramMinimalOperasyonModu === true
                    ? Math.max(1, Number(ayarlar.telegramAcilisPusuMaxSatir || 6))
                    : benzersiz.length;
                const gosterilen = benzersiz.slice(0, maxSatir);
                const kalan = Math.max(0, benzersiz.length - gosterilen.length);
                const mesaj = [
                    `🔔 <b>ST2 AÇILIŞ PUSU ÖZETİ</b>`,
                    `📊 Mevcut ${benzersiz.length} | LONG ${longlar.length} | SHORT ${shortlar.length}`,
                    ...gosterilen.map(satir),
                    ...(kalan ? [`… +${kalan} pusu loglarda`] : []),
                    `ℹ️ Bundan sonra yalnız yeni bulunan pusu kısa mesajla bildirilir.`
                ].join('\n');
                const signature = crypto.createHash('sha1').update(benzersiz.map(x => `${x.sym}|${x.patternSignature}`).sort().join('||')).digest('hex');
                const onceki = pusuStartupStampOku();
                const tekrarPenceresiMs = Math.max(60000, Number(ayarlar.renkoPusuStartupTekrarBastirMs || 900000));
                const ayniOzetYakinda = onceki.signature === signature && Date.now() - Number(onceki.lastSentAt || 0) < tekrarPenceresiMs;
                if (ayniOzetYakinda || onceki.bootId === PUSU_BOOT_ID) {
                    baslangicPusuOzetiGonderildi = true;
                    baslangicPusuKuyrugu = [];
                    console.log(`⏭️ [ST2 AÇILIŞ PUSU ÖZETİ] Aynı açılış özeti tekrar bastırıldı | ${benzersiz.length} pusu`);
                } else {
                    const sonuclar = await h.telegramMesajGonderTekil(mesaj, { coalesceKey: `st2-acilis-pusu:${signature}` });
                    const ok = Array.isArray(sonuclar) && sonuclar.length > 0 && sonuclar.every(x => x?.sonuc?.ok === true);
                    const belirsiz = Array.isArray(sonuclar) && sonuclar.some(x => x?.sonuc?.ambiguousDelivery === true);
                    if (ok || belirsiz) {
                        pusuStartupStampYaz(signature, benzersiz.length);
                        baslangicPusuOzetiGonderildi = true;
                        baslangicPusuKuyrugu = [];
                    }
                    console.log(`${ok ? '✅' : '⚠️'} [ST2 AÇILIŞ PUSU ÖZETİ] ${benzersiz.length} pusu | Telegram ${ok ? 'TEKİL TESLİM OK' : belirsiz ? 'TESLİM BELİRSİZ; AYNI BOOTTA TEKRAR YOK' : 'BAŞARISIZ; SONRAKİ TARAMADA YENİDEN DENEYECEK'}`);
                }
            }
            } catch (e) {
                console.log(`⚠️ [ST2 AÇILIŞ PUSU ÖZETİ] Telegram gönderimi başarısız: ${e.message} | Sonraki taramada yeniden denenecek`);
            } finally {
                baslangicPusuOzetiIsleniyor = false;
            }
        });
    }
    return audit;
}

async function taraVeDegerlendir() {
    const audits = {};
    const oncekiTf = AKTIF_KAYNAK_TF;
    try {
        for (const tf of canliKaynakTfListesi()) {
            AKTIF_KAYNAK_TF = tf;
            audits[tf] = await taraVeDegerlendirTekTf(tf);
        }
        const toplam = Object.values(audits).reduce((acc,a)=>{
            acc.sembol += Number(a?.sembol || 0);
            acc.renkoHazir += Number(a?.renkoHazir || 0);
            acc.pozisyonAcildi += Number(a?.pozisyonAcildi || 0);
            acc.yeniPusu += Number(a?.yeniPusu || 0);
            acc.sureMs += Number(a?.sureMs || 0);
            return acc;
        }, { sembol:0, renkoHazir:0, pozisyonAcildi:0, yeniPusu:0, sureMs:0, timeframes:audits });
        h.state.st2MultiTfLastAudit = toplam;
        return toplam;
    } finally {
        AKTIF_KAYNAK_TF = oncekiTf;
    }
}

module.exports = {
    ...core,
    tetikFiyati,
    canliTetikFiyati,
    pusuTetikSunumu,
    dnaKisaId,
    pusuGateOzeti,
    pusuBildirimHafizasiniTemizle,
    aktifTuglaMesafesi,
    storeHazirla,
    canliKaynakTfListesi,
    tfCandleBirlesimi,
    auditBaslat,
    birDakikaRenkoSuperTrend,
    bollingerHazirMi: core.bollingerHazirMi,
    bollingerSenaryosu,
    eskiPusuyuSuresiDolduysaSil,
    patternPususuGuncelle,
    entryModeDecisionForPusu,
    pusuDegerlendir,
    taraVeDegerlendir
};
