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
const st1EntryGate = require('./87_st2_st1_entry_gate.js');

let baslangicPusuOzetiGonderildi = false;
let baslangicPusuOzetiIsleniyor = false;
let baslangicPusuKuyrugu = [];
const PUSU_BOOT_ID = `${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const PUSU_DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const PUSU_STARTUP_STAMP_FILE = path.join(PUSU_DATA_DIR, 'st2-startup-pusu-telegram.json');

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
        const gate = adaptiveDnaEntry.gateDecision(pusu, Number(pusu?.renkoEntryBrickDistance || 0.75));
        const key = adaptiveDnaEntry.dnaKey(gate.context || adaptiveDnaEntry.contextFrom(pusu));
        return {
            dnaKey: key,
            dnaId: dnaKisaId(key),
            executionMode: gate.executionMode || 'SHADOW',
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
        `🧬 ${premierQuality.metricText(evidence.takeover, { prefix: 'Takeover', hideOutcomeCounts: true })}`,
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


function entryEvolutionShadowTetikFiyati(pusu) {
    return entryEvolution.targetPrice(pusu, aktifTuglaMesafesi(pusu));
}

function canliTetikFiyati(pusu) {
    if (String(pusu?.yon || '').toUpperCase() === 'LONG') {
        return Number(pusu?.referansTuglaHigh || pusu?.referansSeviye || 0);
    }
    if (String(pusu?.yon || '').toUpperCase() === 'SHORT') {
        return Number(pusu?.referansTuglaLow || pusu?.referansSeviye || 0);
    }
    return 0;
}

// Geriye uyumlu dış isim: v6.12.0 itibarıyla gerçek tetik referans Renko tuğlasıdır.
function tetikFiyati(pusu) {
    return canliTetikFiyati(pusu);
}


function storeHazirla() {
    const store = h.state.st2Renko || (h.state.st2Renko = {});
    store.seriler ||= {};
    store.onaySerileri1m ||= {};
    store.pusular ||= {};
    store.sonPatternSignature ||= {};
    store.pusuTelegramBildirimleri ||= {};
    store.sonIptalPatternSignature ||= {};
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
        `🎯 Referans ${fiyatFormatla(pusu?.referansSeviye)} | Canlı tetik ${fiyatFormatla(target)} | Evolution shadow ${fiyatFormatla(entryEvolutionShadowTetikFiyati(pusu))} | Canlı ${fiyatFormatla(price)} | ST1 ${st?.trend || st?.superTrendYonu || 'YOK'}`,
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
    return renkoKanitiMetni(sym, pusu, tetikFiyati(pusu), Number(h.state.canliFiyatlar?.[sym] || 0), { trend: 'BEKLENIYOR' })
        .replace('🧱 ST2 RENKO/BINANCE KARŞILAŞTIRMA KANITI', '🪤 ST2 RENKO PUSU/BINANCE PROOF');
}

function auditBaslat() {
    return {
        zaman: Date.now(), evrenToplam: 0, acikPozisyonAtlandi: 0, veriEksik: 0, sureMs: 0, sembol: 0, atrHazir: 0, renkoHazir: 0, patternAday: 0, yeniPattern: 0, yeniPusu: 0,
        bbHazir: 0, bbLongTemas: 0, bbShortTemas: 0,
        patternDagilimi: {}, sonTemasRedleri: {}, yakinRedAdaylari: [],
        kaynakMumToplam: 0, renkoTuglaToplam: 0, renkoMin: null, renkoMax: 0,
        onay1mMumHazir: 0, onay1mAtrHazir: 0, onay1mRenkoHazir: 0,
        onay1mUp: 0, onay1mDown: 0, onay1mYetersiz: 0,
        longPusu: 0, shortPusu: 0, tetikBekleyen: 0,
        pusuDegerlendirilen: 0, fiyatTetigi: 0, fiyatBekleyen: 0, fiyatEksik: 0,
        stOnayi: 0, stReddi: 0, birlikteUygun: 0, pozisyonAcildi: 0, pozisyonReddedildi: 0,
        st1GateUygun: 0, st1GateBekleyen: 0, st1GateReddi: 0, tazeKirilim: 0,
        eskiKirilimEngeli: 0, gecGirisReddi: 0, st2ContextIptal: 0,
        red: {
            ATR_YETERSIZ: 0, RENKO_YETERSIZ: 0, PATTERN_YOK: 0,
            BB_YETERSIZ: 0, BB_GECERSIZ: 0, BB_TEMAS_YOK: 0, PUSU_SURESI_DOLDU: 0, ONAY_1M_RENKO_YETERSIZ: 0,
            LONG_ALT_BAND_TEMASI_YOK: 0, SHORT_UST_BAND_TEMASI_YOK: 0, ORTA_BAND_BOLGE_RED: 0,
            ST1_GATE_RED: 0, ST1_GEC_GIRIS: 0, ST2_CONTEXT_INVALIDATED: 0, LEGACY_PUSU_INVALIDATED: 0
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

function patternPususuGuncelle(sym, bricks, bollinger, boxSize, candles, audit = null) {
    const store = storeHazirla();
    const mevcutBaslangic = store.pusular[sym] || null;
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

        const yeniPusu = core.pusuOlustur(sym, match, scenario);
        const kaynakSonMum = Array.isArray(candles) ? candles.at(-1) : null;
        yeniPusu.kaynakSonKapaliMumZamani = Number(kaynakSonMum?.closeTime || 0);
        yeniPusu.sonSt2DogrulamaMumZamani = yeniPusu.kaynakSonKapaliMumZamani;
        yeniPusu.olusumZamani = Date.now();
        yeniPusu.pusuSchema = 2;
        yeniPusu.st2ContextValid = true;
        yeniPusu.entryTimingAuthority = 'ST1_GATE_RENKO_REFERENCE_BREAK';
        yeniPusu.entryEvolutionMode = 'SHADOW_ONLY';
        yeniPusu.canliTetikFiyati = canliTetikFiyati(yeniPusu);
        const ilkCanliFiyat = Number(h.state.canliFiyatlar?.[sym] || 0);
        yeniPusu.canliTetikKurulu = ilkCanliFiyat > 0 && (yeniPusu.yon === 'LONG'
            ? ilkCanliFiyat < yeniPusu.canliTetikFiyati
            : ilkCanliFiyat > yeniPusu.canliTetikFiyati);
        yeniPusu.sonCanliFiyat = ilkCanliFiyat > 0 ? ilkCanliFiyat : null;
        yeniPusu.gateYokkenKirilim = false;
        store.pusular[sym] = yeniPusu;

        const exactContext = exactContextHesapla(candles, match, bricks, bollinger, boxSize);
        yeniPusu.rbb = exactContext.rbb;
        yeniPusu.rbbw = exactContext.rbbw;
        yeniPusu.atrRegime = exactContext.atrRegime;
        yeniPusu.trend20 = exactContext.trend20;
        yeniPusu.exactContextSnapshot = exactContext;
        yeniPusu.renkoBb = { ...scenario, zone: exactContext.rbb, widthRegime: exactContext.rbbw };
        yeniPusu.renkoBoxSize = Number(boxSize || 0);
        yeniPusu.renkoSonTuglaDizisi = exactContext.renko6;
        yeniPusu.renkoSon10Tugla = tuglaKaniti(bricks, Number(ayarlar.renkoKanitTuglaSayisi || 10));
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
        console.log(`\n${pusuKaniti}\n`);

        const bildirimAnahtari = `${sym}|${signature}`;
        const dahaOnceBildirildi = Boolean(store.pusuTelegramBildirimleri[bildirimAnahtari]);
        if (!dahaOnceBildirildi) {
            store.pusuTelegramBildirimleri[bildirimAnahtari] = Date.now();
            if (ayarlar.renkoPusuKanitTelegram !== false) {
                if (!baslangicPusuOzetiGonderildi) {
                    baslangicPusuKuyrugu.push({ sym, yon: match.yon, patternId: match.patternId, patternKodu: yeniPusu.patternKodu, patternSignature: signature, pusuKaniti, ...gateOzeti });
                } else {
                    const patternId = String(match.patternId || 'PATTERN').trim();
                    const patternKodu = String(yeniPusu.patternKodu || match.patternCode || '').trim();
                    const patternEtiketi = patternKodu && !/^(undefined|null|nan)$/i.test(patternKodu)
                        ? `${patternId} (${patternKodu})`
                        : patternId;
                    const modEtiketi = gateOzeti.executionMode === 'PREMIER' ? '🏆 PREMIER' : gateOzeti.executionMode === 'SHADOW' ? '👻 SHADOW' : '❓ UNKNOWN';
                    const skorMetni = gateOzeti.relativeCohort > 0 ? ` | Skor ${gateOzeti.score.toFixed(1)}/${gateOzeti.scoreThreshold.toFixed(1)} | #${gateOzeti.relativeRank}/${gateOzeti.relativeCohort}` : '';
                    const skorAciklama = pusuSkorAciklama(gateOzeti);
                    const kisaMesaj = `🪤 <b>YENİ ST2 RENKO PUSU</b>\n${sym} ${match.yon} | ${patternEtiketi}\n🧬 DNA ${gateOzeti.dnaId} | ${modEtiketi}${skorMetni}\n🧾 ${gateOzeti.reason}\n${skorAciklama ? `${skorAciklama}\n` : ''}BB temas ✅ | Referans kırılım ${fiyatFormatla(yeniPusu.canliTetikFiyati)} | Entry Evolution shadow ${fiyatFormatla(entryEvolutionShadowTetikFiyati(yeniPusu))}\n⏳ Giriş: ST1 aynı yönlü 15m pusu + 3m ST ve taze canlı kırılım birlikte.`;
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
    if (!pusu) return false;

    const sourceTime = Number(pusu.kaynakSonKapaliMumZamani || 0);
    if (!(sourceTime > 0)) {
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        delete store.pusular[sym];
        if (audit) audit.red.LEGACY_PUSU_INVALIDATED++;
        console.log(`🧯 [ST2 LEGACY PUSU İPTAL] ${sym} ${pusu.yon} | Kapanmış 15m kaynak zamanı yok; eski pusu yeni girişte kullanılamaz.`);
        return true;
    }

    const kapanmisKaynakMumlar = (Array.isArray(candles) ? candles : [])
        .filter(c => Number(c?.closeTime || 0) > sourceTime && Number(c?.closeTime || 0) <= Date.now());
    const limit = Math.max(1, Number(ayarlar.maxPusuBeklemeMum ?? 3));
    pusu.gecenKaynakMumSayisi = kapanmisKaynakMumlar.length;
    if (kapanmisKaynakMumlar.length < limit) return false;

    store.sonIptalPatternSignature[sym] = pusu.patternSignature;
    delete store.pusular[sym];
    if (audit) audit.red.PUSU_SURESI_DOLDU++;
    console.log(`⏰ [ST2 PUSU İPTAL] ${sym} ${pusu.yon} | ${kapanmisKaynakMumlar.length}/${limit} kapanmış ${ayarlar.pusuPeriyodu || '15m'} mum geçti; eski Renko bağlamı taşınmadı.`);
    return true;
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

    // Entry Evolution seçimi korunur ancak v6.12.0'da yalnız shadow replay/kalite kanıtıdır.
    // Bu satır eski binding testleri ve bilimsel kanıt zinciri için bilinçli olarak korunur.
    const adaptiveEntryDecision = aktifTuglaKarari(pusu);
    const selectedEntryBrick = Number(adaptiveEntryDecision.brick);
    const target = entryEvolution.targetPrice(pusu, selectedEntryBrick);
    const liveTarget = canliTetikFiyati(pusu);
    const historicalEntryGate = adaptiveDnaEntry.gateDecision({
        ...pusu,
        renkoEntryBrickDistance: selectedEntryBrick,
        adaptiveDnaEntryDecision: adaptiveEntryDecision
    }, selectedEntryBrick);

    if (!(liveTarget > 0)) {
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        delete store.pusular[sym];
        if (audit) { audit.st1GateReddi++; audit.red.ST1_GATE_RED++; }
        console.log(`🧯 [ST2 PUSU İPTAL] ${sym} ${pusu.yon} | Referans Renko tetik seviyesi geçersiz.`);
        return false;
    }

    const renkoStShadow = onay1m || birDakikaRenkoSuperTrend(sym);
    const renkoStShadowUygun = pusu.yon === 'LONG' ? renkoStShadow?.trend === 'UP' : renkoStShadow?.trend === 'DOWN';
    if (audit) {
        if (renkoStShadowUygun) audit.stOnayi++;
        else audit.stReddi++;
    }

    const st1Gate = ayarlar.st2St1GirisKapisiAktif === false
        ? { uygun: true, hardReject: false, reason: 'ST1_GATE_CONFIG_DISABLED', superTrendYonu: null, trendPeriyodu: null, stKaynak: 'DISABLED' }
        : st1EntryGate.degerlendir(sym, pusu.yon, price, liveTarget);
    pusu.sonSt1Gate = {
        uygun: st1Gate.uygun === true,
        hardReject: st1Gate.hardReject === true,
        reason: st1Gate.reason || 'UNKNOWN',
        superTrendYonu: st1Gate.superTrendYonu || st1Gate.superTrend?.trend || null,
        trendPeriyodu: st1Gate.trendPeriyodu || st1Gate.superTrend?.periyot || null,
        stKaynak: st1Gate.stKaynak || st1Gate.superTrend?.kaynak || null,
        evaluatedAt: st1Gate.evaluatedAt || new Date().toISOString()
    };

    if (st1Gate.hardReject) {
        store.sonIptalPatternSignature[sym] = pusu.patternSignature;
        delete store.pusular[sym];
        if (audit) {
            audit.st1GateReddi++;
            audit.red.ST1_GATE_RED++;
            if (st1Gate.reason === 'ST1_GEC_GIRIS_SINIRI_ASILDI') {
                audit.gecGirisReddi++;
                audit.red.ST1_GEC_GIRIS++;
            }
        }
        console.log(`🧯 [ST1 GATE PUSU İPTAL] ${sym} ${pusu.yon} | ${st1Gate.reason}`);
        return false;
    }

    const tetikOncesiTaraf = pusu.yon === 'LONG' ? price < liveTarget : price > liveTarget;
    const tetikGecildi = pusu.yon === 'LONG' ? price >= liveTarget : price <= liveTarget;
    if (tetikOncesiTaraf) {
        pusu.canliTetikKurulu = true;
        pusu.gateYokkenKirilim = false;
    }

    const tazeKirilim = Boolean(pusu.canliTetikKurulu) && tetikGecildi;
    pusu.fiyatTetigiGoruldu = tazeKirilim;
    pusu.superTrendOnayi = st1Gate.uygun === true;
    pusu.sonCanliFiyat = price;

    if (audit) {
        if (tetikGecildi) audit.fiyatTetigi++;
        else audit.fiyatBekleyen++;
        if (st1Gate.uygun) audit.st1GateUygun++;
        else audit.st1GateBekleyen++;
        if (tazeKirilim) audit.tazeKirilim++;
        else if (tetikGecildi) audit.eskiKirilimEngeli++;
        if (tazeKirilim && st1Gate.uygun) audit.birlikteUygun++;
    }

    // Fiyat ST1 kapısı geçerli değilken kırdıysa eski kırılım latch edilmez.
    // Yeniden giriş için fiyatın referansın öbür tarafına dönüp tetik kapısını tekrar kurması gerekir.
    if (tazeKirilim && !st1Gate.uygun) {
        pusu.canliTetikKurulu = false;
        pusu.gateYokkenKirilim = true;
        pusu.gateYokkenKirilimZamani = Date.now();
        pusu.gateYokkenKirilimFiyati = price;
        console.log(`🧊 [ESKİ KIRILIM ENGELİ] ${sym} ${pusu.yon} | Referans ${fiyatFormatla(liveTarget)} kırıldı fakat ST1 aynı anda uygun değildi (${st1Gate.reason}). Reset + yeni kırılım beklenecek.`);
        return false;
    }

    if (!st1Gate.uygun || !tazeKirilim) return false;

    // Bu taze kırılım yalnız bir kez tüketilir. Emir katmanı reddetse bile eski kırılım tekrar kullanılmaz.
    pusu.canliTetikKurulu = false;
    pusu.tazeKirilimZamani = Date.now();
    pusu.tazeKirilimFiyati = price;

    const renkoKanit = renkoKanitiMetni(sym, pusu, liveTarget, price, {
        trend: st1Gate.superTrendYonu || st1Gate.superTrend?.trend || 'YOK'
    });
    console.log(`\n${renkoKanit}\n`);
    console.log(`🎯 [ST1-GATED RENKO TETİK] ${sym} ${pusu.yon} | Referans ${fiyatFormatla(liveTarget)} | Canlı ${fiyatFormatla(price)} | ST1 ${st1Gate.reason} | Evolution ${selectedEntryBrick.toFixed(2)}T SHADOW (${fiyatFormatla(target)})`);

    const girisAnalizi = {
        entryStrategy: 'ST2_RENKO',
        entryTimingAuthority: 'ST1_GATE_RENKO_REFERENCE_BREAK',
        entryEvolutionMode: 'SHADOW_ONLY',
        pusuPeriyodu: ayarlar.renkoKaynakPeriyodu || '15m',
        sniperPeriyodu: st1Gate.trendPeriyodu || ayarlar.superTrendPeriyodu || '3m',
        trendPeriyodu: st1Gate.trendPeriyodu || ayarlar.superTrendPeriyodu || '3m',
        hedefFiyati: pusu.referansSeviye,
        tetikFiyati: liveTarget,
        entryEvolutionShadowTetikFiyati: target,
        tetikYuzdesiAyar: 0,
        renkoEntryBrickDistance: selectedEntryBrick,
        adaptiveDnaEntryDecision: adaptiveEntryDecision,
        historicalEntryGate,
        entryDecisionBinding: {
            verified: Math.abs(Number(historicalEntryGate.brick) - selectedEntryBrick) <= 1e-9,
            selectedBrick: selectedEntryBrick,
            gateBrick: Number(historicalEntryGate.brick),
            targetPrice: liveTarget,
            shadowTargetPrice: target,
            source: 'RENKO_REFERENCE_BRICK_WITH_ST1_GATE',
            reason: st1Gate.reason || adaptiveEntryDecision.reason || historicalEntryGate.reason || 'UNKNOWN',
            timingAuthority: 'ST1_GATE_RENKO_REFERENCE_BREAK',
            evolutionMode: 'SHADOW_ONLY',
            frozenAt: new Date().toISOString()
        },
        tetikModu: 'RENKO_REFERENCE_BREAK_WITH_ST1_GATE',
        girisFiyati: price,
        tetikSapmaYuzde: Number(st1Gate.gecGiris?.sapmaYuzde || 0),
        gecGirisUygun: st1Gate.gecGiris?.uygun !== false,
        maxGirisSapmaYuzde: Number(st1Gate.gecGiris?.maxSapmaYuzde || ayarlar.maxGirisSapmaYuzde || 0),
        superTrendYonu: st1Gate.superTrendYonu || st1Gate.superTrend?.trend || null,
        stKaynak: `ST1_${st1Gate.stKaynak || st1Gate.superTrend?.kaynak || 'UNKNOWN'}`,
        st1EntryGate: st1Gate,
        st1PusuSenaryosu: st1Gate.pusu?.senaryo || null,
        st1PusuTargetLevel: Number(st1Gate.pusu?.targetLevel || 0),
        st1KendiTetigiKirildi: st1Gate.st1KendiTetigiKirildi === true,
        renkoOnay1mShadow: {
            trend: renkoStShadow?.trend || null,
            uygun: renkoStShadowUygun,
            boxSize: Number(store.onayBoxSize1m?.[sym] || 0),
            authority: 'SHADOW_ONLY'
        },
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
        gecenKaynakMumSayisi: Number(pusu.gecenKaynakMumSayisi || 0),
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
    console.log(`🧱 [ST2 RENKO AUDIT] Evren ${audit.evrenToplam} | Taranan ${audit.sembol} | Açık atlandı ${audit.acikPozisyonAtlandi} | Veri eksik ${audit.veriEksik} | Süre ${audit.sureMs} ms | Sembol ${audit.sembol} | 15m ATR ${audit.atrHazir} | Renko ${audit.renkoHazir} (min ${audit.renkoMin ?? 0}/max ${audit.renkoMax}) | Pattern aday ${audit.patternAday} | Yeni pattern ${audit.yeniPattern} | BB hazır ${audit.bbHazir} | BB temas L${audit.bbLongTemas}/S${audit.bbShortTemas} | 1m Renko ST ${audit.onay1mRenkoHazir} (UP ${audit.onay1mUp}/DOWN ${audit.onay1mDown}) | Yeni pusu L${audit.longPusu}/S${audit.shortPusu} | Aktif ${aktif.length}`);
    if (Number(audit.bildirimHafizaTemizlenen || 0) > 0) console.log(`🧹 [ST2 PUSU DEDUPE] Eski/fazla bildirim anahtarı temizlendi: ${audit.bildirimHafizaTemizlenen}`);
    console.log(`🔎 [ST2 GİRİŞ HUNİSİ] Tarama ${audit.sembol} → Renko ${audit.renkoHazir} → Aktif/Yeni pusu ${aktif.length}/${audit.yeniPusu} → Değerlendirilen ${audit.pusuDegerlendirilen} → ST1 uygun ${audit.st1GateUygun} → Taze kırılım ${audit.tazeKirilim} → Birlikte uygun ${audit.birlikteUygun} → Pozisyon ${audit.pozisyonAcildi} | Bekleyen: Tetik ${audit.fiyatBekleyen} ST1 ${audit.st1GateBekleyen} | Engelli: Eski kırılım ${audit.eskiKirilimEngeli} ST1 red ${audit.st1GateReddi} Geç giriş ${audit.gecGirisReddi} Bağlam ${audit.st2ContextIptal} | 1m Renko ST shadow Uygun ${audit.stOnayi}/Red ${audit.stReddi} | Pozisyon katmanı ${audit.pozisyonReddedildi}`);
    console.log(`🧱 [ST2 RENKO RED] ATR ${audit.red.ATR_YETERSIZ} | Renko ${audit.red.RENKO_YETERSIZ} | Pattern yok ${audit.red.PATTERN_YOK} | BB yetersiz ${audit.red.BB_YETERSIZ} | BB geçersiz ${audit.red.BB_GECERSIZ} | BB temas yok ${audit.red.BB_TEMAS_YOK} | Long alt temas yok ${audit.red.LONG_ALT_BAND_TEMASI_YOK} | Short üst temas yok ${audit.red.SHORT_UST_BAND_TEMASI_YOK} | Orta bölge red ${audit.red.ORTA_BAND_BOLGE_RED} | Pusu 15m süre ${audit.red.PUSU_SURESI_DOLDU} | ST1 red ${audit.red.ST1_GATE_RED} | Geç giriş ${audit.red.ST1_GEC_GIRIS} | ST2 bağlam ${audit.red.ST2_CONTEXT_INVALIDATED} | Legacy pusu ${audit.red.LEGACY_PUSU_INVALIDATED} | 1m ST shadow yetersiz ${audit.red.ONAY_1M_RENKO_YETERSIZ}`);
    const dagilim = Object.entries(audit.patternDagilimi || {}).sort().map(([k,v]) => `${k}:${v}`).join(' ') || 'YOK';
    console.log(`🧱 [ST2 RENKO PATTERN] ${dagilim}`);
    for (const [i, x] of (audit.yakinRedAdaylari || []).entries()) {
        console.log(`🔬 [ST2 RENKO YAKIN RED ${i + 1}] ${x.sym} ${x.yon} ${x.patternId} (${x.patternKodu}) | Sebep ${x.redSebep} | Band farkı ${x.bandFarkTugla.toFixed(4)} tuğla (${fiyatFormatla(x.bandFarkFiyat)}) | Tol ${x.toleransTugla.toFixed(2)} | Box ${fiyatFormatla(x.boxSize)} | BB A/O/U ${fiyatFormatla(x.altBand)}/${fiyatFormatla(x.ortaBand)}/${fiyatFormatla(x.ustBand)} | Son L/H/C ${fiyatFormatla(x.sonTuglaLow)}/${fiyatFormatla(x.sonTuglaHigh)}/${fiyatFormatla(x.sonTuglaClose)} | T ${zamanFormatla(x.sonTuglaZamani)} | Dizi ${x.tuglaDizisi || 'YOK'}`);
    }
}

async function taraVeDegerlendir() {
    const taramaBaslangici = Date.now();
    const store = storeHazirla();
    const audit = auditBaslat();
    audit.bildirimHafizaTemizlenen = pusuBildirimHafizasiniTemizle(store);
    audit.evrenToplam = (h.state.semboller || []).length;
    for (const sym of h.state.semboller || []) {
        if ((h.state.alinanlar || []).includes(sym) || (h.state.aktifShortlar || []).includes(sym)) { audit.acikPozisyonAtlandi++; continue; }
        audit.sembol++;
        const candles = h.state.yerelPusuHafizasi?.[sym];
        if (!Array.isArray(candles) || candles.length === 0) audit.veriEksik++;
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

        eskiPusuyuSuresiDolduysaSil(sym, bricks, candles, audit);
        const bbPeriod = Number(ayarlar.renkoBollingerPeriod || ayarlar.bollingerperiod || 20);
        if (bricks.length < bbPeriod) { audit.red.BB_YETERSIZ++; continue; }
        const bb = m.hesaplaBollinger(bricks.map(x => Number(x.close)));
        if (!core.bollingerHazirMi(bb)) { audit.red.BB_GECERSIZ++; continue; }
        audit.bbHazir++;
        patternPususuGuncelle(sym, bricks, bb, box, candles, audit);
        const onay1m = birDakikaRenkoSuperTrend(sym, audit);
        await pusuDegerlendir(sym, onay1m, audit);
    }
    audit.tetikBekleyen = Object.keys(store.pusular || {}).length;
    audit.sureMs = Date.now() - taramaBaslangici;
    h.state.st2TaramaSagligi = {
        durum: audit.veriEksik === 0 ? 'HEALTHY' : 'DEGRADED', evren: audit.evrenToplam,
        taranan: audit.sembol, acikPozisyonAtlandi: audit.acikPozisyonAtlandi, veriEksik: audit.veriEksik,
        atrHazir: audit.atrHazir, renkoHazir: audit.renkoHazir, sureMs: audit.sureMs,
        sonTamamlanma: new Date().toISOString()
    };
    auditLogla(audit);

    // Açılışta bulunan bütün mevcut pusular tek mesajda bir kez bildirilir.
    // Sonraki taramalarda yalnız yeni bulunan pusu kendi kanıt mesajıyla gönderilir.
    if (!baslangicPusuOzetiGonderildi && !baslangicPusuOzetiIsleniyor) {
        baslangicPusuOzetiIsleniyor = true;
        try {
            const benzersiz = [];
            const gorulen = new Set();
            for (const x of baslangicPusuKuyrugu) {
                const key = `${x.sym}|${x.patternSignature || `${x.yon}|${x.patternId}`}`;
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
                const satir = x => `${x.sym} ${x.yon} | ${x.patternId || x.patternKodu || 'PATTERN'} | ${x.executionMode === 'PREMIER' ? '🏆' : x.executionMode === 'SHADOW' ? '👻' : '❓'} DNA ${x.dnaId || 'YOK'}`;
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
    }
    return audit;
}

module.exports = {
    ...core,
    tetikFiyati,
    canliTetikFiyati,
    entryEvolutionShadowTetikFiyati,
    dnaKisaId,
    pusuGateOzeti,
    pusuBildirimHafizasiniTemizle,
    aktifTuglaMesafesi,
    storeHazirla,
    auditBaslat,
    birDakikaRenkoSuperTrend,
    bollingerHazirMi: core.bollingerHazirMi,
    bollingerSenaryosu,
    eskiPusuyuSuresiDolduysaSil,
    patternPususuGuncelle,
    pusuDegerlendir,
    taraVeDegerlendir
};
