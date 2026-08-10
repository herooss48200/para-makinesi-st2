require('dotenv').config();
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const learningValidation = require('./20_learning_validation.js');
const exitEvolutionDashboard = require('./45_exit_evolution_dashboard.js');
const dnaLeague = require('./46_dna_league_engine.js');
const premierObservation = require('./48_premier_observation_engine.js');
const adaptiveTradingLeague = require('./49_adaptive_trading_league.js');
const memorySafeIo = require('./53_memory_safe_io.js');
const exitVictoryAudit = require('./57_exit_victory_audit.js');
const realOrderReadiness = require('./50_real_order_readiness_bridge.js');
const labChampion = require('./61_lab_champion_engine.js');
const labPremier = require('./62_lab_premier_league.js');
const accountingContinuity = require('./65_accounting_continuity.js');
const renkoEntryEvolution = require('./73_st2_renko_entry_evolution.js');
const williamsCycleShadow = require('./88_st2_williams_cycle_shadow_lab.js');
const renkoEntryConfirmationShadow = require('./89_st2_renko_entry_confirmation_shadow_lab.js');
const renkoExitEvolution = require('./74_st2_renko_exit_evolution.js');
const realOrderPreparation = require('./67_real_order_preparation_intelligence.js');
const labLifecycle = require('./68_lab_lifecycle_evolution.js');
const operationIntelligence = require('./69_operation_intelligence_dashboard.js');
const st1Certification = require('./71_st1_final_certification.js');
const winningIntelligence = require('./75_st2_winning_intelligence.js');
const adaptiveDnaIntelligence = require('./77_st2_pattern_dna_intelligence.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');
const premierQuality = require('./83_st2_premier_quality_score.js');
const globalHistoricalReconciliation = require('./78_st2_global_historical_reconciliation.js');
const fs = require('fs');
const path = require('path');

const TELEGRAM_GUVENLI_LIMIT = 3600;
let sonLearningValidationKapanan = null;
let sonExitEvolutionReplaySayisi = null;
let sonDnaLeagueTransferKapanisi = null;
let sonPremierObservationKapanan = null;
let learningEvolutionBaseline = null;
let raporZinciriCalisiyor = false;
let raporTekrarIstegi = false;
let raporTekrarOneCikar = false;
let detayRaporCalisiyor = false;
let detayRaporTekrarIstegi = false;
let sonDetayRaporZamani = 0;
let globalHistoricalCache = { signature: null, text: '', createdAt: 0 };
let raporCalismaBaslangici = 0;
let sonSt2EntryEvolutionDetayImzasi = null;
let sonSt2ExitEvolutionDetayImzasi = null;
let sonExitVictoryReplay = null;
let dnaKartlariIlkGonderim = false;
let sonLabChampionKapanan = null;
let sonLabPremierKapanan = null;
let sonRealOrderPreparationMtime = null;
let sonSt1CertificationSignature = null;


function globalHistoricalTelegramCached() {
    const entry = renkoEntryEvolution.summary();
    const sig = `${Number(entry?.health?.stateRecords || 0)}|${Number(entry?.health?.ledgerRecords || 0)}|${Number(entry?.total?.closed || 0)}|${Number(h.state?.aktifPozisyonlar?.length || 0)}`;
    const ttl = Math.max(60000, Number(ayarlar.st2GlobalHistoricalCacheMs || 300000));
    if (globalHistoricalCache.signature === sig && globalHistoricalCache.text && Date.now() - globalHistoricalCache.createdAt < ttl) {
        return globalHistoricalCache.text;
    }
    const text = globalHistoricalReconciliation.telegram();
    globalHistoricalCache = { signature: sig, text, createdAt: Date.now() };
    return text;
}

function heapPressureHigh() {
    const m = process.memoryUsage();
    const limitMb = Math.max(128, Number(ayarlar.st2DetayRaporHeapLimitMb || 190));
    return (m.heapUsed / 1024 / 1024) >= limitMb;
}

function sayi(n, basamak = 2) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(basamak) : '0.00';
}

function yuzde(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : '0.00';
}

function pozisyonYon(p) {
    return String(p.yon || p.side || p.direction || '').toUpperCase();
}

function pozisyonSembol(p) {
    return p.sym || p.sembol || p.symbol || p.coin || p.girisAnalizi?.symbol || p.blackboxAcilis?.symbol || 'BILINMIYOR';
}

function pozisyonGiris(p) {
    return Number(p.girisFiyati || p.entryPrice || p.giris || p.entry || 0);
}

function pozisyonFiyat(p) {
    const sembol = pozisyonSembol(p);
    const canliFiyatlar = h.state.canliFiyatlar || {};
    return Number(
        canliFiyatlar[sembol] ||
        p.sonFiyat ||
        p.anlikFiyat ||
        p.currentPrice ||
        p.fiyat ||
        pozisyonGiris(p)
    );
}

function pozisyonKarYuzde(p) {
    // Canlı rapor sıralamasında kaynak doğruluğu önceliği:
    // 1) state.canliFiyatlar + giriş fiyatı, 2) pozisyondaki son fiyat,
    // 3) yalnız fiyat bulunamazsa önceden hesaplanmış PnL yüzdesi.
    const giris = pozisyonGiris(p);
    const fiyat = pozisyonFiyat(p);
    const yon = pozisyonYon(p);

    if (giris && fiyat) {
        if (yon === 'SHORT') return ((giris - fiyat) / giris) * 100;
        return ((fiyat - giris) / giris) * 100;
    }

    if (Number.isFinite(Number(p.anlikKarYuzde))) return Number(p.anlikKarYuzde);
    if (Number.isFinite(Number(p.karYuzde))) return Number(p.karYuzde);
    if (Number.isFinite(Number(p.pnlYuzde))) return Number(p.pnlYuzde);

    return 0;
}

function pozisyonKorunanKar(p) {
    const giris = pozisyonGiris(p);
    const yon = pozisyonYon(p);

    // Gerçek pozisyonda Telegram, eski yüzde alanından değil borsaya gerçekten
    // uygulanmış stop fiyatından konuşur. Renko/K1/K2 stopu ilerlerken
    // korunanKarYuzdesi legacy alanı 0 kalabildiği için onu yalnız fallback yap.
    if (p?.sanal === false && giris) {
        const gercekStopAdaylari = [
            p.realStopLastAppliedTrigger,
            p.sl,
            p.stopLoss,
            p.stop
        ];
        const gercekStop = gercekStopAdaylari
            .map(Number)
            .find(v => Number.isFinite(v) && v > 0);

        if (gercekStop) {
            if (yon === 'SHORT') return ((giris - gercekStop) / giris) * 100;
            return ((gercekStop - giris) / giris) * 100;
        }
    }

    if (Number.isFinite(Number(p.korunanKarYuzdesi))) return Number(p.korunanKarYuzdesi);
    if (Number.isFinite(Number(p.korunanKarYuzde))) return Number(p.korunanKarYuzde);
    if (Number.isFinite(Number(p.korunanKar))) return Number(p.korunanKar);

    const sl = Number(p.sanalStop || p.stopLoss || p.sl || p.stop || 0);
    if (!giris || !sl) return null;

    if (yon === 'SHORT') return ((giris - sl) / giris) * 100;
    return ((sl - giris) / giris) * 100;
}

function pozisyonKademe(p) {
    return p.tpKademe || p.kademe || p.sanalTpKademe || p.sonKademe || 0;
}


function anaPremierPozisyonuMu(p) {
    if (!p) return false;
    const karar = p.labPremierDecision || {};
    const gozlem = p.labPremierObservation || p.premierObservation || {};
    const track = String(karar.premierTrack || gozlem.premierTrack || p.premierTrackAtOpen || '').toUpperCase();
    const havuz = String(gozlem.observationPool || '').toUpperCase();
    const shadowOnly = p.liveShadowObservation === true || p.leagueShadowOnly === true || karar.virtualShadowOnly === true;

    if (shadowOnly || track.includes('REVERSE') || track.includes('BOTTOM') || track === 'PREMIER_SCORE_SHADOW') return false;
    if (havuz && havuz !== 'PREMIER' && p.sanal !== false) return false;
    return Boolean(
        karar.upperLayerIncluded === true || gozlem.upperLayerIncluded === true ||
        p.renkoPremierDecision?.premier === true || track === 'PREMIER_SCORE_RANKED'
    );
}

function pozisyonSatiri(p) {
    const sembol = pozisyonSembol(p);
    const yon = pozisyonYon(p);
    const kar = pozisyonKarYuzde(p);
    const korunan = pozisyonKorunanKar(p);
    const kademe = pozisyonKademe(p);

    let satir = `${sembol} ${yon} Anlık ${kar >= 0 ? '+' : ''}%${yuzde(kar)}`;

    if (korunan !== null) {
        satir += ` | SL ${korunan >= 0 ? '+' : ''}%${yuzde(korunan)}`;
    }

    if (kademe) {
        satir += ` | TP${kademe}`;
    }

    const atama = p.renkoExitAssignment || {};
    const takeover = Number(atama.assignedTakeoverPct);
    const trail = Number(atama.assignedTrailBricks);
    const atrMultiplier = Number(atama.assignedAtrMultiplier);
    const captureRatio = Number(atama.assignedCaptureRatio);
    const peak = Number.isFinite(Number(p.renkoExitPeak))
        ? renkoExitEvolution.peakProfitPct(p, Number(p.renkoExitPeak))
        : null;
    const protectionState = p.renkoProtectionState || (p.renkoExitActivated === true ? 'RENKO_TAKEOVER_AKTIF' : (p.breakevenAktif === true ? 'BE_AKTIF_TAKEOVER_BEKLIYOR' : 'ILK_KORUMA_BEKLIYOR'));
    const protectionView = ({
        ILK_KORUMA_BEKLIYOR: { stage: 'K0', label: 'Koruma bekliyor' },
        TAKEOVER_BEKLIYOR: { stage: 'K0', label: 'Takeover bekleniyor' },
        GUVENLI_KAR_ESIGI_BEKLENIYOR: { stage: 'K0', label: 'Güvenli kâr eşiği bekleniyor' },
        KOMISYON_GUVENLI_KORUMA_BEKLENIYOR: { stage: 'K0', label: 'Komisyon güvenli koruma bekleniyor' },
        BE_AKTIF_TAKEOVER_BEKLIYOR: { stage: 'K1', label: 'BE aktif, takeover bekleniyor' },
        BE_AKTIF_KOMISYON_GUVENLI_FIYAT_BEKLENIYOR: { stage: 'K1', label: 'BE aktif, brüt kâr tabanı bekleniyor' },
        BE_AKTIF_CANLI_AKTIVASYON_BEKLENIYOR: { stage: 'K1', label: 'BE aktif, canlı aktivasyon bekleniyor' },
        RENKO_TAKEOVER_AKTIF: { stage: 'K2', label: 'Renko yönetimi aktif' },
        ATR_TAKEOVER_AKTIF: { stage: 'K2', label: 'Öğrenen ATR yönetimi aktif' },
        RENKO_TUGLA_TAKIP_AKTIF: { stage: 'K2', label: 'Renko tuğla kâr takibi aktif' },
        DOGRUDAN_KAR_TABANI_ESIGI_BEKLENIYOR: { stage: 'K0', label: 'Doğrudan kâr tabanı eşiği bekleniyor' },
        MINIMUM_NET_KAR_TABANI_KILITLI: { stage: 'K1', label: 'Minimum net kâr tabanı kilitli' },
        KAR_TABANI_KILITLI_RENKO_AKTIVASYON_BEKLENIYOR: { stage: 'K1', label: 'Kâr tabanı kilitli, Renko aktivasyonu bekleniyor' },
        DOGRUDAN_AKTIVASYON_RENKO_TRAIL_AKTIF: { stage: 'K2', label: 'Doğrudan aktivasyonla Renko trail aktif' },
        NET_KAR_TABANI_KILITLI_TRAIL_AKTIF: { stage: 'K2', label: 'Min net kâr kilitli, Renko trail aktif' },
        RENKO_STOP_GUNCELLENDI: { stage: 'K3', label: 'Renko yönetimi stop güncelledi' },
        RENKO_STOP_KORUNUYOR: { stage: 'K3', label: 'Renko koruma stopu aktif' }
    })[protectionState] || { stage: p.renkoExitActivated === true ? 'K2' : (p.breakevenAktif === true ? 'K1' : 'K0'), label: 'Durum doğrulanıyor' };
    // Aşama ve açıklama aynı durum nesnesinden gelir; K2/K3 çelişkisi üretilemez.
    const stage = protectionView.stage;
    const stateLabel = protectionView.label;

    satir += ` | ${stage} ${stateLabel}`;
    const premierScore = p?.renkoPremierDecision?.premierScore || p?.labPremierDecision?.premierScore || {};
    if (Number.isFinite(Number(premierScore.score))) satir += ` | Skor ${Number(premierScore.score).toFixed(1)}/${Number(premierScore.threshold || 0).toFixed(1)} #${Number(premierScore.rank || 0)}/${Number(premierScore.cohortSize || 0)}`;
    const brickLive = String(atama.liveExitMode || '').toUpperCase() === 'SAFE_COMMISSION_BRICK_TRAIL';
    if (brickLive) {
        if (Number.isFinite(trail) && trail > 0) satir += ` | Canlı Trail ${trail.toFixed(2)}T`;
        if (Number.isFinite(Number(atama.assignedFloorArmProfitPct))) satir += ` | Taban tetik %${Number(atama.assignedFloorArmProfitPct).toFixed(2)}`;
        if (Number.isFinite(Number(atama.assignedActivationProfitPct))) satir += ` | Renko aktivasyon %${Number(atama.assignedActivationProfitPct).toFixed(2)}`;
        if (Number.isFinite(Number(atama.assignedSafeFloorPct))) satir += ` | Brüt taban %${Number(atama.assignedSafeFloorPct).toFixed(2)}`;
        const minNet = Number.isFinite(Number(atama.assignedMinimumNetProfitPct))
            ? Number(atama.assignedMinimumNetProfitPct)
            : Math.max(0, Number(atama.assignedSafeFloorPct || 0) - renkoExitEvolution.ROUND_TRIP_COMMISSION_PCT());
        satir += ` | Min net %${minNet.toFixed(2)}`;
        const kaynak = String(atama.trailSource || 'SAFE_DEFAULT_BRICK_TRAIL')
            .replace('NET_ECONOMY_LEARNED_BRICK_TRAIL', 'Öğrenilmiş')
            .replace('PERSISTED_BRICK_TRAIL', 'Kalıcı')
            .replace('SAFE_DEFAULT_BRICK_TRAIL', 'Varsayılan');
        satir += ` | ${kaynak}`;
        if (atama.assignmentId) satir += ` | ID ${String(atama.assignmentId).slice(0, 10)}`;
        satir += ` | ATR/MFE gölge`;
    } else {
        if (Number.isFinite(takeover)) satir += ` | Takeover %${takeover.toFixed(2)}`;
        if (Number.isFinite(atrMultiplier) && atrMultiplier > 0) satir += ` | ATR ${atrMultiplier.toFixed(2)}×`;
        else if (Number.isFinite(trail) && trail > 0) satir += ` | Trail ${trail.toFixed(2)}T`;
        if (Number.isFinite(captureRatio) && captureRatio > 0) satir += ` | MFE %${(captureRatio * 100).toFixed(0)}`;
    }
    if (peak !== null) satir += ` | Peak ${peak >= 0 ? '+' : ''}%${yuzde(peak)}`;
    if (p.renkoExitLastStopSourceLabel) satir += ` | ${p.renkoExitLastStopSourceLabel}`;
    const sonOlay = Array.isArray(p.renkoProtectionTimeline) ? p.renkoProtectionTimeline.at(-1) : null;
    if (sonOlay?.type) satir += ` | Son olay ${sonOlay.type}`;

    return satir;
}

function sonKapananSatiri(islem) {
    if (!islem) return '';

    const sembol = islem.sym || islem.sembol || islem.symbol || 'BILINMIYOR';
    const yon = String(islem.yon || islem.side || '').toUpperCase();
    const sonuc = islem.sonuc || islem.kapanisSebebi || islem.sebep || '-';

    const net = Number(
        islem.netKarZarar ??
        islem.netPnl ??
        islem.netPNL ??
        islem.pnl ??
        0
    );

    const yonText = yon ? `${yon} ` : '';
    return `${sembol} ${yonText}${sonuc} ${net >= 0 ? '+' : ''}${sayi(net, 2)} USDT`;
}

function telegramGuvenliMetin(metin) {
    return String(metin || '')
        .replace(/\((?:undefined|null|NaN)\)/gi, '')
        .replace(/\b(?:undefined|null|NaN)\b/gi, '-')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ');
}

function kisalt(metin, limit = TELEGRAM_GUVENLI_LIMIT) {
    // v6.8.1: Canlı rapor burada kesilmez. 1_hafiza.telegramMesajGonder
    // metni satır sınırlarında güvenli parçalara ayırır ve (1/N), (2/N) başlıklarıyla gönderir.
    // Önceden kullanılan slice(0, limit), son satırı "XRPU" gibi yarım bırakabiliyordu.
    // Parametre geriye dönük imza uyumu için korunur.
    void limit;
    return telegramGuvenliMetin(metin);
}


function learningEvolutionOzetMetni(s = {}) {
    try {
        const model = learningValidation.buildLearningValidationModel();
        let historicalOpened = 0;
        let historicalClosed = 0;
        const observed = Number(model.learningScore?.toplamDna || 0);
        const ready = Number(model.learningScore?.yeterliDna || 0);
        const leagueSizes = model.dnaLeague?.leagueSizes || {};
        const labLeague = labPremier.build({ persist: false });
        const continuity = accountingContinuity.snapshot(h.state.aktifPozisyonlar || []);
        const current = continuity.current || {};
        const canonical = continuity.canonical || {};
        const scientific = continuity.scientific || {};
        const premierPartition = scientific.premier || canonical.premier || {};
        const shadowPartition = scientific.shadow || canonical.shadow || {};
        const premierOpened = Number(premierPartition.opened ?? current.openedPremier ?? 0);
        const shadowOpened = Number(shadowPartition.opened ?? current.openedShadow ?? 0);
        const premierClosed = Number(premierPartition.closedScientific ?? current.closedPremier ?? 0);
        const shadowClosed = Number(shadowPartition.closedScientific ?? current.closedShadow ?? 0);
        const premierActive = Number(premierPartition.activeScientific ?? continuity.active?.premier ?? 0);
        const shadowActive = Number(shadowPartition.activeScientific ?? continuity.active?.shadow ?? 0);
        const learningOpened = premierOpened + shadowOpened;
        const learningClosed = premierClosed + shadowClosed;
        historicalOpened = learningOpened;
        historicalClosed = learningClosed;
        const learningActive = premierActive + shadowActive;
        const learningGapClosed = Number(premierPartition.closedGap || 0) + Number(shadowPartition.closedGap || 0);
        const learningGapActive = Number(premierPartition.activeGap || 0) + Number(shadowPartition.activeGap || 0);
        const learningDifference = Number(premierPartition.difference || 0) + Number(shadowPartition.difference || 0);
        if (!learningEvolutionBaseline) learningEvolutionBaseline = { observed, ready };
        const dObserved = observed - learningEvolutionBaseline.observed;
        const dReady = ready - learningEvolutionBaseline.ready;
        const delta = n => `${n >= 0 ? '+' : ''}${n}`;
        let text = `🧠 <b>ÖĞRENME DEVAM EDİYOR</b>\n`;
        text += `📦 Yeni bilimsel defter (Premier + Gölge): Açılan ${learningOpened} | Bilimsel kapanan ${learningClosed} | Aktif öğrenme ${learningActive}\n`;
        text += `🏆 Premier kanıtı: Açılan ${premierOpened} | Kapanan ${premierClosed} | Aktif ${premierActive}\n`;
        text += `👻 Gölge kanıtı: Açılan ${shadowOpened} | Kapanan ${shadowClosed} | Aktif ${shadowActive}\n`;
        text += `🛡️ Sonradan GAP karantinası: Kesin kapanan ${learningGapClosed} | Hâlen aktif ${learningGapActive} | Öğrenme dışı\n`;
        const overlapCorrection = Number(current.restartGapOverlapCorrection || 0);
        const rawGapBeforeRepair = Number(current.closedRestartGapRawBeforeRepair || 0);
        if (overlapCorrection !== 0 && rawGapBeforeRepair > 0) {
            text += `🧹 Eski sayaç çakışması onarıldı: GAP kapanan ${rawGapBeforeRepair} → ${Number(current.closedRestartGap || 0)} | Çift sayım ${overlapCorrection > 0 ? '-' : '+'}${Math.abs(overlapCorrection)}\n`;
        }
        text += `🧮 Öğrenme mutabakatı: ${learningOpened} = ${learningClosed} + ${learningGapClosed} + ${learningGapActive} + ${learningActive} | Fark ${learningDifference >= 0 ? '+' : ''}${learningDifference} ${learningDifference === 0 ? '✅' : '⚠️'}\n`;
        text += `📚 Tarihsel öğrenme arşivi: Açılış ${historicalOpened} | Bilimsel kapanış ${historicalClosed}\n`;
        text += `🧬 DNA: Hazır ${ready} (${delta(dReady)}) / Gözlenen ${observed} (${delta(dObserved)})\n`;
        text += `🎯 Tarihsel sonuç: Başarı %${yuzde(model.winRate)} | Exp ${model.expectancy >= 0 ? '+' : ''}${sayi(model.expectancy, 4)} | Net ${model.netKasa >= 0 ? '+' : ''}${sayi(model.netKasa, 2)} USDT\n`;
        const renkoScience = ayarlar.entryStrategyMode === 'ST2_RENKO' ? renkoEntryEvolution.summary().total : null;
        const bilimselTp = renkoScience ? Number(renkoScience.tp || 0) : (labLeague.allCandidates || []).reduce((a, x) => a + Number(x.liveMetrics?.tp || x.bucket?.tp || 0), 0);
        const bilimselSl = renkoScience ? Number(renkoScience.sl || 0) : (labLeague.allCandidates || []).reduce((a, x) => a + Number(x.liveMetrics?.sl || x.bucket?.sl || 0), 0);
        const bilimselBe = renkoScience ? Number(renkoScience.be || 0) : (labLeague.allCandidates || []).reduce((a, x) => a + Number(x.liveMetrics?.be || x.bucket?.be || 0), 0);
        const bilimselNet = renkoScience ? Number(renkoScience.net || 0) : (labLeague.allCandidates || []).reduce((a, x) => a + Number(x.liveMetrics?.net || x.bucket?.net || 0), 0);
        const bilimselKararli = bilimselTp + bilimselSl;
        text += `✅ Bilimsel sonuç: Başarılı ${bilimselTp} | Başarısız ${bilimselSl} | BE ${bilimselBe} | WR %${bilimselKararli ? ((bilimselTp / bilimselKararli) * 100).toFixed(1) : '0.0'} | Net ${bilimselNet >= 0 ? '+' : ''}${bilimselNet.toFixed(4)}\n`;
        text += `🏆 Premier çıkış şartı: Aynı LAB için N≥5, Net>0, PF>1 ve Expectancy>0\n`;
        text += `🗺️ Family Hafıza: 🏆 ${Number(leagueSizes.premier || 0)} | 🥈 ${Number(leagueSizes.championship || 0)} | 🌱 ${Number(leagueSizes.development || 0)} | 📚 ${Number(leagueSizes.historical || 0)} | Emir yetkisi yok\n`;
        text += `🧬 LAB Ligi: 🥇 Premier ${Number(labLeague.historicalPositiveCount || 0)} | 🥈 Championship/LAB ${Number(labLeague.labLeagueCount || 0)} | 🔁 Ters ayrı defter ${Number(labLeague.reversePremierCount || 0)}\n`;
        text += `🏃 Kâra yakın ${Number(labLeague.nearProfitCount || 0)} | Ters gölge ${Number(labLeague.reverseShadowCount || 0)} | ✅ İleri ${Number(labLeague.forwardVerifiedCount || 0)}\n`;
        if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
            const evo = renkoEntryEvolution.summary();
            text += `🧠 Entry Evolution: Pattern ${Number(evo.total?.profiles || 0)} | Bilimsel kapanış ${Number(evo.total?.closed || 0)} | Varsayılan dışı atama ${Number(evo.total?.assigned || 0)}\n`;
            text += `📨 0.25–1.50 replay ve Pattern ayrıntıları ikinci bölümde gönderilir.\n`;
        }
        text += `\n🛡️ <b>GAP / MUHASEBE DURUMU — ÖĞRENMEYE DAHİL DEĞİL</b>\n`;
        text += `Migration Gap: Yüklenen ${Number(continuity.legacy.activeAtMigration || 0)} | Kapanan ${Number(continuity.migrationBatchClosed || 0)} | Aktif ${Number(continuity.legacyActive || 0)} | Mutabakat ${continuity.migrationBatchDifference >= 0 ? '+' : ''}${continuity.migrationBatchDifference} ${continuity.migrationBatchReconciled ? '✅' : '⚠️'}\n`;
        text += `Restart Gap aktif ${Number(continuity.active?.restartGap || 0)} | Eski telemetri ${Number(continuity.legacy.restartGapHistoricalCounter || 0)}\n`;
        text += `Kesin pozisyon defteri: Açılan ${Number(current.opened || 0)} | Kapanan ${Number(current.closed || 0)} | Aktif ${Number(continuity.trackedActive || 0)} | Mutabakat ${continuity.difference >= 0 ? '+' : ''}${continuity.difference} ${continuity.reconciled ? '✅' : '⚠️'}\n`;
        text += `<i>Premier/Gölge sayaçları kalıcı kesin defterdir; yeniden başlatmada sıfırlanmaz ve GAP’a dönüştürülmez.</i>`;
        return text;
    } catch (err) {
        return `🧠 <b>Öğrenme:</b> aktif | Ayrıntılı sayaç hazırlanıyor.`;
    }
}


function st2AnaRaporOgrenmeOzeti() {
    const evo = renkoEntryEvolution.summary();
    const t = evo.total || {};
    const b = evo.bridge || {};
    const ret = Object.values(b.skipped || {}).reduce((a, v) => a + Number(v || 0), 0);
    const dagilim = {};
    for (const profil of evo.profiles || []) {
        const brick = Number(profil.activeBrick || evo.policy?.defaultBrick || 0.75).toFixed(2);
        dagilim[brick] = Number(dagilim[brick] || 0) + 1;
    }
    const dagilimMetni = Object.entries(dagilim)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([brick, adet]) => `${brick}→${adet}`)
        .join(' | ') || 'YOK';
    const sonDegisim = (evo.profiles || [])
        .map(p => ({ p, ts: Date.parse(p.lastChangeAt || p.updatedAt || 0) || 0 }))
        .sort((a, b) => b.ts - a.ts)[0]?.p;
    const sonDegisimMetni = sonDegisim?.lastChange
        ? `${sonDegisim.yon || ''} ${sonDegisim.patternKodu || sonDegisim.patternId || ''} | ${Number(sonDegisim.lastChange.from).toFixed(2)} → ${Number(sonDegisim.lastChange.to).toFixed(2)}`
        : 'YOK';
    return [
        `🧠 <b>ENTRY EVOLUTION</b>`,
        `Pattern ${Number(t.profiles || 0)}/16 | Bilimsel kayıt ${Number(t.closed || 0)} | Varsayılan dışı atama ${Number(t.assigned || 0)}`,
        `🎯 Tetiklenen ${Number(t.tp || 0) + Number(t.sl || 0) + Number(t.be || 0)} | Tetiklenmeyen ${Math.max(0, Number(t.closed || 0) - Number(t.tp || 0) - Number(t.sl || 0) - Number(t.be || 0))}`,
        `✅ Başarılı ${Number(t.tp || 0)} | ❌ Başarısız ${Number(t.sl || 0)} | ⚖️ BE ${Number(t.be || 0)} | Replay Net ${Number(t.net || 0) >= 0 ? '+' : ''}${Number(t.net || 0).toFixed(4)}`, 
        `🎯 Aktif giriş dağılımı: ${dagilimMetni}`,
        `🔄 Son giriş değişimi: ${sonDegisimMetni}`,
        `Köprü: Çağrı ${Number(b.calls || 0)} | Kabul ${Number(b.accepted || 0)} | Ret ${ret}`,
        `📨 Ayrıntılı 0.25–1.50 replay raporu ayrıca gönderilir.`
    ].join('\n');
}


function st2VeriSagligiOzeti() {
    const evren = h.state.sembolEvreniKaniti || {};
    const veri = h.state.sembolVeriSagligi || {};
    const tarama = h.state.st2TaramaSagligi || {};
    const istenen = Number(evren.requested || veri.istenen || ayarlar.taranacakCoinSayisi || 200);
    const secilen = Number(evren.count || veri.secilen || h.state.semboller?.length || 0);
    const durumlar = [evren.status, veri.durum, tarama.durum].filter(Boolean);
    const durum = durumlar.includes('CRITICAL') ? 'CRITICAL' : (durumlar.includes('DEGRADED') ? 'DEGRADED' : (durumlar.length ? 'HEALTHY' : 'BEKLIYOR'));
    return {
        istenen, secilen, durum,
        evrenMs: Number(evren.durationMs || veri.evrenYuklemeMs || 0),
        // Cache sayıları yardımcı/eski semboller yüzünden paydadan büyük görünemez.
        mumHazir: Math.min(secilen, Math.max(0, Number(veri.mumHazir || 0))),
        // 1m REST cache ile o cache'ten gerçekten hesaplanabilen Renko ST ayrı gerçeklerdir.
        // ST1 shadow ısınması core 1m sayacını artık ezmez.
        renko1mVeriHazir: Math.min(secilen, Math.max(0, Number(veri.renko1mVeriHazir ?? veri.sniperHazir ?? veri.superTrendHazir ?? 0))),
        superTrendHazir: Math.min(secilen, Math.max(0, Number(veri.renko1mVeriHazir ?? veri.sniperHazir ?? veri.superTrendHazir ?? 0))),
        renko1mStHazir: Math.min(secilen, Math.max(0, Number(veri.renko1mStHazir ?? tarama.onay1mRenkoHazir ?? 0))),
        renko1mStYetersiz: Math.max(0, Number(veri.renko1mStYetersiz ?? tarama.onay1mYetersiz ?? 0)),
        renko1mStDerinOnarim: Math.max(0, Number(veri.renko1mStDerinOnarim || 0)),
        st1ShadowHazir: Math.min(secilen, Math.max(0, Number(veri.st1ShadowHazir || 0))),
        hata: Number(veri.hata || 0) + Number(veri.mumHata || 0) + Number(veri.superTrendHata || 0),
        taranan: Number(tarama.taranan || 0),
        taramaEvreni: Number(tarama.evren || secilen || 0),
        veriEksik: Number(tarama.veriEksik || 0),
        taramaMs: Number(tarama.sureMs || 0),
        mumSonTur: Number(veri.mumSonTurGuncellenen || 0),
        stSonTur: Number(veri.superTrendSonTurGuncellenen || 0),
        pusuTazelemeCalisiyor: veri.pusuTazelemeCalisiyor === true,
        stTazelemeCalisiyor: veri.superTrendTazelemeCalisiyor === true,
        pusuDegerlendirilen: Number(tarama.pusuDegerlendirilen || 0), fiyatTetigi: Number(tarama.fiyatTetigi || 0),
        stOnayi: Number(tarama.stOnayi || 0), birlikteUygun: Number(tarama.birlikteUygun || 0),
        pozisyonAcildi: Number(tarama.pozisyonAcildi || 0), fiyatBekleyen: Number(tarama.fiyatBekleyen || 0), stReddi: Number(tarama.stReddi || 0)
    };
}

function st2ReplayKatmanOzeti(positions = []) {
    const rows = Array.isArray(positions) ? positions : [];
    // DNA Exit Replay yalnız gölge karşılaştırmadır; canlı stop ataması değildir.
    const exitAssignments = rows.map(p => p?.executionExitAssignment).filter(Boolean);
    const exitReady = exitAssignments.filter(x => x.ready === true || x.activeForPosition === true).length;
    const exitEvidenceMissing = exitAssignments.length - exitReady;
    const exitSamples = exitAssignments.reduce((a, x) => a + Number(x.samples || x.sampleCount || 0), 0);
    const takeover = renkoExitEvolution.summary(rows);
    const takeoverClosed = (takeover.profiles || []).reduce((a, x) => a + Number(x.closed || 0), 0);
    const takeoverLearned = (takeover.profiles || []).filter(x =>
        x?.brickEconomy?.economyEligible === true ||
        String(x?.online?.status || '').includes('ONLINE')
    ).length;
    return {
        exitReady,
        exitFallback: exitEvidenceMissing, // geriye uyumluluk; canlı fallback değildir.
        exitEvidenceMissing,
        exitSamples,
        takeoverProfiles: Number(takeover.profiles?.length || 0),
        takeoverClosed,
        takeoverLearned,
        takeoverAssigned: Number(takeover.runtime?.assigned || 0),
        takeoverActivated: Number(takeover.runtime?.activated || 0),
        takeoverWaiting: Number(takeover.runtime?.waiting || 0),
        takeoverLearnedActive: Number(takeover.runtime?.learned || 0),
        takeoverPersistedActive: Number(takeover.runtime?.persisted || 0),
        takeoverDefaultActive: Number(takeover.runtime?.defaults || 0),
        takeoverAssignmentErrors: Number(takeover.runtime?.assignmentErrors || 0)
    };
}


function st2HafifCanliRaporMetniOlustur() {
    // R19 LIVE CPU ISOLATION:
    // 30 sn operasyon paneli canlı trade event-loop'unda hiçbir ağır ledger/DNA/replay
    // özeti çalıştırmaz. Yalnız RAM state ve aktif pozisyon görüntüsü kullanılır.
    // Ağır bilimsel tablolar detay/log/state katmanında kalır.
    const tumAktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
    const aktifDagilim = accountingContinuity.activeBreakdown(tumAktifler);
    const premierAktifler = aktifDagilim.premierPositions.filter(anaPremierPozisyonuMu);
    const pusuKaynagi = ayarlar.entryStrategyMode === 'ST2_RENKO' ? h.state.st2Renko?.pusular : h.state.pusuListesi;
    const pusular = Object.values(pusuKaynagi || {});
    const pusuLong = pusular.filter(x => String(x.yon || '').toUpperCase() === 'LONG').length;
    const pusuShort = pusular.filter(x => String(x.yon || '').toUpperCase() === 'SHORT').length;
    const veriSagligi = st2VeriSagligiOzeti();
    const binanceSaat = typeof h.binanceTimeHealth === 'function' ? h.binanceTimeHealth() : { healthy: false, offsetMs: 0 };
    const tgSaglik = typeof h.telegramKuyrukOzeti === 'function' ? h.telegramKuyrukOzeti() : { critical: 0, panel: 0, detail: 0, transport: {} };
    const tgTransport = tgSaglik.transport || {};
    const priceRuntime = h.state.st2PriceRuntime || {};
    const priceCoverage = priceRuntime.coverage || {};
    const exchangeRec = h.state.st2ExchangeReconciliation || {};
    const entrySafety = h.state.st2RealEntrySafety || {};
    const exchangeAgeMs = Number(exchangeRec.lastOkAt || 0) > 0 ? Math.max(0, Date.now() - Number(exchangeRec.lastOkAt || 0)) : null;
    const warm = h.state.startupMarketWarmup || {};
    const firstScanPending = ayarlar.entryStrategyMode === 'ST2_RENKO'
        && h.state.startupMarketReady === true
        && h.state.st2FirstScanCompleted !== true
        && Number(veriSagligi.taranan || 0) === 0;
    const startupGate = h.state.startupMarketReady === true
        ? (firstScanPending ? 'READY/FIRST_SCAN_PENDING' : 'READY')
        : `${String(warm.durum || 'BEKLIYOR')}/${String(warm.asama || 'YOK')} ${Number(warm.islenen || 0)}/${Number(warm.toplam || veriSagligi.secilen || 0)}`;
    const offsetMetni = `${Number(binanceSaat.offsetMs || 0) >= 0 ? '+' : ''}${Number(binanceSaat.offsetMs || 0)}ms`;
    const scanInProgress = h.state.st2RenkoScanInProgress === true;
    const scanAgeMs = scanInProgress && Number(h.state.st2RenkoScanStartedAt || 0) > 0
        ? Math.max(0, Date.now() - Number(h.state.st2RenkoScanStartedAt || 0)) : 0;
    const startupProof = h.state.st2SafeStartupSnapshot || {};
    const stateN = Number.isFinite(Number(startupProof.stateCount)) ? Number(startupProof.stateCount) : null;
    const ledgerN = Number.isFinite(Number(startupProof.ledgerCount)) ? Number(startupProof.ledgerCount) : null;
    const stateLedgerText = stateN == null || ledgerN == null ? 'startup doğrulaması YOK' : `${stateN}/${ledgerN} ${stateN === ledgerN ? '✅' : '⚠️'} (startup)`;
    const kasa = h.state.basariOzeti || {};
    const kTp = Number(kasa.tp || 0), kSl = Number(kasa.sl || 0), kBe = Number(kasa.be || 0);
    const kNet = Number(kasa.netKarZarar || 0);
    const maxPozisyon = Math.max(1, Number(ayarlar.telegramCanliRaporMaxPozisyon || 5));
    const sirali = [...premierAktifler].sort((a, b) => pozisyonKarYuzde(b) - pozisyonKarYuzde(a)).slice(0, maxPozisyon);
    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const lines = [
        `📊 AGROS ST2 OPERASYON — ${require('./versiyon.js').botSurumu}`,
        `🕒 ${saat} | ${ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE'}`,
        `🛡️ State/Ledger ${stateLedgerText} | Aktif ${aktifDagilim.total} | Gerçek ${aktifDagilim.real} | Score-Premier ${premierAktifler.length} | Shadow Öğrenme ${aktifDagilim.shadow} | GAP ${aktifDagilim.restartGap}`,
        `🌐 Evren ${veriSagligi.secilen}/${veriSagligi.istenen} | Yükleme ${(veriSagligi.evrenMs / 1000).toFixed(1)} sn | Veri ${veriSagligi.durum}`,
        `📡 Hazır cache Mum ${veriSagligi.mumHazir}/${veriSagligi.secilen} | 1m Veri ${veriSagligi.renko1mVeriHazir}/${veriSagligi.secilen} | 1m Renko ST ${veriSagligi.renko1mStHazir}/${veriSagligi.secilen} | Yetersiz ${veriSagligi.renko1mStYetersiz} | Derin onarım ${veriSagligi.renko1mStDerinOnarim} | Hata ${veriSagligi.hata} | Son Renko tarama ${veriSagligi.taranan}/${veriSagligi.taramaEvreni} ${(veriSagligi.taramaMs / 1000).toFixed(1)} sn | Eksik ${veriSagligi.veriEksik}`,
        `⚙️ Canlı Zincir Saat ${binanceSaat.healthy ? 'HEALTHY' : 'DEGRADED'} ${offsetMetni} | Entry Gate ${startupGate} | Fiyat ${String(priceRuntime.source || 'BEKLIYOR')} ${Number(priceCoverage.fresh || 0)}/${Number(priceCoverage.total || 0)} | TG Native ${tgTransport.nativeCircuitOpen ? 'CIRCUIT' : 'OK'} Curl ${tgTransport.curlCircuitOpen ? 'CIRCUIT' : 'OK'} | Kuyruk ${Number(tgSaglik.critical || 0)}/${Number(tgSaglik.panel || 0)}/${Number(tgSaglik.detail || 0)}`,
        `🔁 Control Plane Mutabakat ${String(exchangeRec.status || (ayarlar.sanalEmirModu ? 'VIRTUAL' : 'BEKLIYOR'))}${exchangeAgeMs == null ? '' : ` ${Math.round(exchangeAgeMs / 1000)}sn`} | Gerçek Entry ${ayarlar.sanalEmirModu ? 'SANAL' : (entrySafety.ready === true ? 'READY' : `FAIL-CLOSED/${String(entrySafety.reason || 'NOT_READY')}`)} | Renko/Pusu bağımsız`,
        `🧵 Renko tarama ${scanInProgress ? `ÇALIŞIYOR ${Math.round(scanAgeMs / 1000)}sn` : 'BEKLIYOR'} | Panel CPU=RAM-ONLY`,
        `💰 Bot sonuç sayacı ✅${kTp} ❌${kSl} ⚖️${kBe} | Net ${kNet >= 0 ? '+' : ''}${kNet.toFixed(4)} | Bilimsel Premier/Shadow ağır ledger özeti 30sn panelden AYRILDI`,
        `🎯 Pusu ${pusular.length} | LONG ${pusuLong} | SHORT ${pusuShort}`,
        `🚪 Giriş hunisi Değerlendirilen ${veriSagligi.pusuDegerlendirilen} | Fiyat uygun ${veriSagligi.fiyatTetigi} | 1m ST uygun ${veriSagligi.stOnayi} | Birlikte ${veriSagligi.birlikteUygun} | Emir ${veriSagligi.pozisyonAcildi} | Bekleyen Fiyat ${veriSagligi.fiyatBekleyen} / ST ${veriSagligi.stReddi}`,
        `🎯 Giriş Yetkisi Golden ST2 Renko | Entry Evolution CANLI | 1m Renko ST | ST1 yalnız GÖLGE`
    ];
    if (sirali.length) {
        lines.push('', `📦 AKTİF SCORE-PREMIER (${sirali.length}/${premierAktifler.length})`);
        lines.push(...sirali.map(pozisyonSatiri));
    }
    lines.push('', 'ℹ️ Canlı panel RAM-only çalışır; ağır bilimsel replay/DNA/ledger hesapları trade loop dışında tutulur.');
    return telegramGuvenliMetin(lines.join('\n'));
}

function minimalCanliRaporMetniOlustur() {
    if (ayarlar.entryStrategyMode === 'ST2_RENKO') return st2HafifCanliRaporMetniOlustur();
    const tumAktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
    const aktifDagilim = accountingContinuity.activeBreakdown(tumAktifler);
    const premierAktifler = aktifDagilim.premierPositions.filter(anaPremierPozisyonuMu);
    const pusuKaynagi = ayarlar.entryStrategyMode === 'ST2_RENKO' ? h.state.st2Renko?.pusular : h.state.pusuListesi;
    const pusular = Object.values(pusuKaynagi || {});
    const pusuLong = pusular.filter(x => String(x.yon || '').toUpperCase() === 'LONG').length;
    const pusuShort = pusular.filter(x => String(x.yon || '').toUpperCase() === 'SHORT').length;
    const evo = renkoEntryEvolution.summary();
    const veriSagligi = st2VeriSagligiOzeti();
    const replayKatman = st2ReplayKatmanOzeti(tumAktifler);
    const wrShadow = williamsCycleShadow.summary();
    const entryConfirmShadow = renkoEntryConfirmationShadow.summary();
    const op = operationIntelligence.build(tumAktifler);
    const aggregate = op.model?.aggregate || {};
    const accounting = op.model?.accounting || {};
    const ledgerPartitions = operationIntelligence.scientificLedgerPartitions();
    const premierScientific = ledgerPartitions.premier || {};
    const realPremier = ledgerPartitions.realPremier || {};
    const shadow = ledgerPartitions.shadow || {};
    const maxPozisyon = Math.max(1, Number(ayarlar.telegramCanliRaporMaxPozisyon || 5));
    const sirali = [...premierAktifler].sort((a, b) => pozisyonKarYuzde(b) - pozisyonKarYuzde(a)).slice(0, maxPozisyon);
    const transitions = [...(op.model?.league?.sessionPromotions || []), ...(op.model?.league?.sessionDemotions || [])]
        .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 3);
    const pfMetni = v => Number(v) >= 999 ? '∞' : Number(v || 0).toFixed(2);
    const sign = (v, d = 4) => `${Number(v || 0) >= 0 ? '+' : ''}${Number(v || 0).toFixed(d)}`;
    const yonSatirlari = (etiket, ozet) => ['LONG', 'SHORT'].map(yon => {
        const x = ozet?.byDirection?.[yon] || {};
        return `↳ ${etiket} ${yon} N${Number(x.n || 0)} | ✅${Number(x.tp || 0)} ❌${Number(x.sl || 0)} ⚖️${Number(x.be || 0)} | WR %${Number(x.wr || 0).toFixed(1)} | Net ${sign(x.net)} | PF ${pfMetni(x.pf)}`;
    });
    const health = evo.health || {};
    const stateN = Number(health.stateRecords || 0);
    const ledgerN = Number(health.ledgerRecords || 0);
    const stateOk = stateN === ledgerN;
    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const binanceSaat = typeof h.binanceTimeHealth === 'function' ? h.binanceTimeHealth() : { healthy: false, offsetMs: 0 };
    const tgSaglik = typeof h.telegramKuyrukOzeti === 'function' ? h.telegramKuyrukOzeti() : { critical: 0, panel: 0, detail: 0, transport: {} };
    const tgTransport = tgSaglik.transport || {};
    const priceRuntime = h.state.st2PriceRuntime || {};
    const priceCoverage = priceRuntime.coverage || {};
    const exchangeRec = h.state.st2ExchangeReconciliation || {};
    const entrySafety = h.state.st2RealEntrySafety || {};
    const exchangeAgeMs = Number(exchangeRec.lastOkAt || 0) > 0 ? Math.max(0, Date.now() - Number(exchangeRec.lastOkAt || 0)) : null;
    const warm = h.state.startupMarketWarmup || {};
    const firstScanPending = ayarlar.entryStrategyMode === 'ST2_RENKO'
        && h.state.startupMarketReady === true
        && h.state.st2FirstScanCompleted !== true
        && Number(veriSagligi.taranan || 0) === 0;
    const startupGate = h.state.startupMarketReady === true
        ? (firstScanPending ? 'READY/FIRST_SCAN_PENDING' : 'READY')
        : `${String(warm.durum || 'BEKLIYOR')}/${String(warm.asama || 'YOK')} ${Number(warm.islenen || 0)}/${Number(warm.toplam || veriSagligi.secilen || 0)}`;
    const offsetMetni = `${Number(binanceSaat.offsetMs || 0) >= 0 ? '+' : ''}${Number(binanceSaat.offsetMs || 0)}ms`;
    const lines = [
        `📊 AGROS ST2 OPERASYON — ${require('./versiyon.js').botSurumu}`,
        `🕒 ${saat} | ${ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE'}`,
        `🛡️ State/Ledger ${stateN}/${ledgerN} ${stateOk ? '✅' : '⚠️'} | Aktif ${aktifDagilim.total} | Gerçek ${aktifDagilim.real} | Score-Premier ${premierAktifler.length} | Shadow Öğrenme ${aktifDagilim.shadow} | GAP ${aktifDagilim.restartGap}`,
        `🌐 Evren ${veriSagligi.secilen}/${veriSagligi.istenen} | Yükleme ${(veriSagligi.evrenMs / 1000).toFixed(1)} sn | Veri ${veriSagligi.durum}`,
        `📡 Hazır cache Mum ${veriSagligi.mumHazir}/${veriSagligi.secilen} | 1m Veri ${veriSagligi.renko1mVeriHazir}/${veriSagligi.secilen} | 1m Renko ST ${veriSagligi.renko1mStHazir}/${veriSagligi.secilen} | Yetersiz ${veriSagligi.renko1mStYetersiz} | Derin onarım ${veriSagligi.renko1mStDerinOnarim} | Hata ${veriSagligi.hata} | Son Renko tarama ${veriSagligi.taranan}/${veriSagligi.taramaEvreni} ${(veriSagligi.taramaMs / 1000).toFixed(1)} sn | Eksik ${veriSagligi.veriEksik}`,
        ...((veriSagligi.pusuTazelemeCalisiyor || veriSagligi.stTazelemeCalisiyor)
            ? [`🔄 Veri tazeleme sürüyor | Son tur Mum ${veriSagligi.mumSonTur} | ST ${veriSagligi.stSonTur} | Hazır cache korunuyor`]
            : []),
        `⚙️ Canlı Zincir Saat ${binanceSaat.healthy ? 'HEALTHY' : 'DEGRADED'} ${offsetMetni} | Entry Gate ${startupGate} | Fiyat ${String(priceRuntime.source || 'BEKLIYOR')} ${Number(priceCoverage.fresh || 0)}/${Number(priceCoverage.total || 0)} | TG Native ${tgTransport.nativeCircuitOpen ? 'CIRCUIT' : 'OK'} Curl ${tgTransport.curlCircuitOpen ? 'CIRCUIT' : 'OK'} | Kuyruk ${Number(tgSaglik.critical || 0)}/${Number(tgSaglik.panel || 0)}/${Number(tgSaglik.detail || 0)}`,
        `🔁 Control Plane Mutabakat ${String(exchangeRec.status || (ayarlar.sanalEmirModu ? 'VIRTUAL' : 'BEKLIYOR'))}${exchangeAgeMs == null ? '' : ` ${Math.round(exchangeAgeMs / 1000)}sn`} | Gerçek Entry ${ayarlar.sanalEmirModu ? 'SANAL' : (entrySafety.ready === true ? 'READY' : `FAIL-CLOSED/${String(entrySafety.reason || 'NOT_READY')}`)} | Renko/Pusu bağımsız`,
        `💰 Bilimsel Premier N${Number(premierScientific.n || 0)} | ✅${Number(premierScientific.tp || 0)} ❌${Number(premierScientific.sl || 0)} ⚖️${Number(premierScientific.be || 0)} | Net ${sign(premierScientific.net)} | PF ${pfMetni(premierScientific.pf)}`,
        ...yonSatirlari('Bilimsel', premierScientific),
        `💳 Gerçek Premier N${Number(realPremier.n || 0)} | ✅${Number(realPremier.tp || 0)} ❌${Number(realPremier.sl || 0)} ⚖️${Number(realPremier.be || 0)} | Net ${sign(realPremier.net)} | PF ${pfMetni(realPremier.pf)}`,
        ...yonSatirlari('Gerçek', realPremier),
        `👻 Shadow N${Number(shadow.n || 0)} | ✅${Number(shadow.tp || 0)} ❌${Number(shadow.sl || 0)} ⚖️${Number(shadow.be || 0)} | Net ${sign(shadow.net)} | PF ${pfMetni(shadow.pf)}`,
        ...yonSatirlari('Shadow', shadow),
        `🎯 Pusu ${pusular.length} | LONG ${pusuLong} | SHORT ${pusuShort}`,
        `🚪 Giriş hunisi Değerlendirilen ${veriSagligi.pusuDegerlendirilen} | Fiyat uygun ${veriSagligi.fiyatTetigi} | 1m ST uygun ${veriSagligi.stOnayi} | Birlikte ${veriSagligi.birlikteUygun} | Emir ${veriSagligi.pozisyonAcildi} | Bekleyen Fiyat ${veriSagligi.fiyatBekleyen} / ST ${veriSagligi.stReddi}`,
        `🎯 Giriş Yetkisi Golden ST2 Renko | Entry Evolution CANLI | 1m Renko ST | ST1 yalnız GÖLGE`,
        `🔬 W%R Dönüş Gölgesi N${Number(wrShadow.totals?.n || 0)} | Profil ${Number(wrShadow.profiles?.length || 0)} | 1m Renko uçtan nötre dönüş | Emir etkisi YOK`,
        `🧪 1m Renko Giriş Teyit Gölgesi Aynı pencere aday N${Number(entryConfirmShadow.sameWindow?.totals?.n || 0)} | Tam yaşam aday N${Number(entryConfirmShadow.lifecycle?.totals?.n || 0)} | Deney ${Number(entryConfirmShadow.activeExperiments || 0)} (Bekleyen ${Number(entryConfirmShadow.activeWaiting || 0)} / Açık ${Number(entryConfirmShadow.activeOpen || 0)}) | Emir etkisi YOK`,
        `🧪 DNA Exit Replay (GÖLGE) Kanıtlı ${replayKatman.exitReady} | Kanıt yetersiz ${replayKatman.exitEvidenceMissing} | Atama kanıtı N${replayKatman.exitSamples}`,
        `🧱 CANLI RENKO KÂR TAKİBİ Atanmış ${replayKatman.takeoverAssigned} | Devrede ${replayKatman.takeoverActivated} | Bekleyen ${replayKatman.takeoverWaiting} | Öğrenilmiş ${replayKatman.takeoverLearnedActive} | Kalıcı ${replayKatman.takeoverPersistedActive} | Varsayılan ${replayKatman.takeoverDefaultActive} | Hata ${replayKatman.takeoverAssignmentErrors}`,
    ];
    if (sirali.length) {
        lines.push('', `📦 AKTİF SCORE-PREMIER (${sirali.length}/${premierAktifler.length})`);
        lines.push(...sirali.map(pozisyonSatiri));
    }
    if (transitions.length) {
        lines.push('', '🔄 GERÇEK LİG HAREKETLERİ');
        lines.push(...transitions.map(x => `${x.type === 'SHADOW_TO_PREMIER' ? '⬆️' : '⬇️'} ${x.labKey || 'LAB'} | ${x.previousLeague || '-'} → ${x.newLeague || '-'} | ${x.reason || '-'}`));
    }
    if (accounting.reconciled === false) lines.push(`⚠️ Premier mutabakat farkı ${Number(accounting.difference || 0)}`);
    lines.push('', 'ℹ️ Ayrıntılı replay, DNA, BB/OHLC ve bilimsel tablolar yalnız log/state/ledger dosyalarında tutulur.');
    return telegramGuvenliMetin(lines.join('\n'));
}

function canliRaporMetniOlustur() {
    if (ayarlar.telegramMinimalOperasyonModu === true) return minimalCanliRaporMetniOlustur();
    const s = h.state.basariOzeti || {};
    const tumAktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
    const aktifDagilim = accountingContinuity.activeBreakdown(tumAktifler);
    const aktifler = ayarlar.sanalEmirModu
        ? aktifDagilim.premierPositions.filter(anaPremierPozisyonuMu)
        : aktifDagilim.realPositions;
    const pusuKaynagi = ayarlar.entryStrategyMode === 'ST2_RENKO' ? h.state.st2Renko?.pusular : h.state.pusuListesi;
    const pusuDegerleri = Object.values(pusuKaynagi || {});
    const analizOzeti = h.state.analizOzeti || {};

    const tp = Number(s.tp || 0);
    const sl = Number(s.sl || 0);
    const be = Number(s.be || 0);

    const sonucToplam = tp + sl;
    const toplamKapanan = tp + sl + be;
    const basariOrani = sonucToplam > 0 ? (tp / sonucToplam) * 100 : 0;

    const longAktif = aktifler.filter(p => pozisyonYon(p) === 'LONG').length;
    const shortAktif = aktifler.filter(p => pozisyonYon(p) === 'SHORT').length;

    const longPusu = pusuDegerleri.filter(x => String(x.yon || '').toUpperCase() === 'LONG').length;
    const shortPusu = pusuDegerleri.filter(x => String(x.yon || '').toUpperCase() === 'SHORT').length;
    const pusuDnaDagilimi = {premier:0,shadow:0,unknown:0,reasons:{}};
    for (const pusu of pusuDegerleri) {
        try {
            const gate = adaptiveDnaEntry.gateDecision(pusu, Number(pusu?.renkoEntryBrickDistance || 0.75));
            if (!adaptiveDnaEntry.contextComplete(gate.context)) pusuDnaDagilimi.unknown++;
            else if (gate.executionMode === 'PREMIER') pusuDnaDagilimi.premier++;
            else pusuDnaDagilimi.shadow++;
            const reason=gate.reason||'UNKNOWN'; pusuDnaDagilimi.reasons[reason]=(pusuDnaDagilimi.reasons[reason]||0)+1;
        } catch (_) { pusuDnaDagilimi.unknown++; }
    }
    const aktifShadowlar = tumAktifler.filter(p => p?.leagueShadowOnly === true && !p?.restartGap && !p?.restartRecovered);

    const listeLimiti = Math.min(10, aktifler.length);
    const sirali = [...aktifler].sort((a, b) => pozisyonKarYuzde(b) - pozisyonKarYuzde(a));
    const enKarli = sirali.slice(0, listeLimiti);
    const enRiskli = [...sirali].reverse().slice(0, listeLimiti);

    // Eski genel muhasebenin son kapananları üst katman raporuna alınmaz.
    // Böylece öğrenme kapanışları gerçek emir veya lig testi listesine karışmaz.
    const sonKapananlar = [];

    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const mod = ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE';

    let mesaj = '';

    mesaj += `📊 <b>PARA MAKİNESİ CANLI PORTFÖY</b>
`;
    mesaj += `🕒 ${saat} | ${mod}
`;
    mesaj += `━━━━━━━━━━━━━━━━━━
`;
    if (ayarlar.sanalEmirModu) {
        // Premier seçimi, aday ilerlemesi ve Exit görünürlüğü en üst bloktur.
        const operationModel = operationIntelligence.build(tumAktifler);
        const operationOzeti = operationIntelligence.telegram(tumAktifler, operationModel);
        mesaj += `${operationOzeti}\n`;
        const premierSonuc = operationModel.model?.aggregate || {};
        const entryEvolutionModel = renkoEntryEvolution.summary();
        const golgeSonuc = entryEvolutionModel.total || {};
        const adaptiveSummary = adaptiveDnaEntry.summary();
        const scorePolicy = premierQuality.activePolicy();
        const veriSagligi = st2VeriSagligiOzeti();
        const replayKatman = st2ReplayKatmanOzeti(tumAktifler);
    const wrShadow = williamsCycleShadow.summary();
    const entryConfirmShadow = renkoEntryConfirmationShadow.summary();
        const renkoPremierPattern = Number(adaptiveSummary.health?.historicalPremierProfiles || 0);
        const renkoShadowDna = Math.max(0, Number(adaptiveSummary.health?.historicalProfiles || 0) - renkoPremierPattern);
        mesaj += `\n📊 <b>CANLI SONUÇ ÖZETİ</b>\n`;
        mesaj += `🧬 Tarihsel exact Premier: ${renkoPremierPattern} | Exact Shadow/izleme: ${renkoShadowDna} | Canlı Premier pozisyon: ${aktifler.length}\n`;
        mesaj += `⭐ Premier modeli: ${scorePolicy.source} | Min ${Number(scorePolicy.minScore).toFixed(1)} | Q${Math.round(Number(scorePolicy.relativeQuantile) * 100)} | Max ${Number(scorePolicy.maxDynamic).toFixed(1)} | Canlı N${Number(scorePolicy.liveWindow)}\n`;
        mesaj += `⚖️ Ağırlık: PF ${scorePolicy.weights.historicalPf}% | Exp ${scorePolicy.weights.historicalExpectancy}% | Canlı ${scorePolicy.weights.liveForm}% | Entry ${scorePolicy.weights.entryEvolution}% | Takeover ${scorePolicy.weights.takeoverReplay}% | Örnek ${scorePolicy.weights.sampleConfidence}%\n`;
        mesaj += `🏆 Premier: N${Number(premierSonuc.closed || 0)} | ✅${Number(premierSonuc.tp || 0)} ❌${Number(premierSonuc.sl || 0)} ⚖️${Number(premierSonuc.be || 0)}\n`;
        mesaj += `🌐 Evren: ${veriSagligi.secilen}/${veriSagligi.istenen} | Yükleme ${(veriSagligi.evrenMs / 1000).toFixed(1)} sn | Veri ${veriSagligi.durum} | Tarama ${(veriSagligi.taramaMs / 1000).toFixed(1)} sn | Eksik ${veriSagligi.veriEksik}\n`;
        mesaj += `🚪 Entry Replay: N${Number(golgeSonuc.closed || 0)} | ✅${Number(golgeSonuc.tp || 0)} ❌${Number(golgeSonuc.sl || 0)} ⚖️${Number(golgeSonuc.be || 0)} | Net ${Number(golgeSonuc.net || 0) >= 0 ? '+' : ''}${Number(golgeSonuc.net || 0).toFixed(4)}\n`;
        mesaj += `🧪 1m Teyit Shadow: Aynı pencere aday N${Number(entryConfirmShadow.sameWindow?.totals?.n || 0)} | Tam yaşam aday N${Number(entryConfirmShadow.lifecycle?.totals?.n || 0)} | Deney ${Number(entryConfirmShadow.activeExperiments || 0)} | Bekleyen ${Number(entryConfirmShadow.activeWaiting || 0)} | Açık ${Number(entryConfirmShadow.activeOpen || 0)}\n`;
        mesaj += `🧪 DNA Exit Replay (GÖLGE): Kanıtlı ${replayKatman.exitReady} | Kanıt yetersiz ${replayKatman.exitEvidenceMissing} | Atama kanıtı N${replayKatman.exitSamples}\n`;
        mesaj += `🧱 CANLI RENKO KÂR TAKİBİ: Atanmış ${replayKatman.takeoverAssigned} | Devrede ${replayKatman.takeoverActivated} | Bekleyen ${replayKatman.takeoverWaiting} | Öğrenilmiş ${replayKatman.takeoverLearnedActive} | Kalıcı ${replayKatman.takeoverPersistedActive} | Varsayılan ${replayKatman.takeoverDefaultActive} | Hata ${replayKatman.takeoverAssignmentErrors}\n`;
        mesaj += `🔬 Tuğla Replay: Profil ${replayKatman.takeoverProfiles} | Kapanış N${replayKatman.takeoverClosed} | Ekonomi kanıtlı ${replayKatman.takeoverLearned}\n`;
        mesaj += `
━━━━━━━━━━━━━━━━━━
`;
        mesaj += `📦 <b>Premier aktif:</b> ${aktifler.length} / ${ayarlar.maxPozisyonSayisi || '-'} | 🟢 ${longAktif} | 🔴 ${shortAktif}
`;
        mesaj += `👻 <b>Gölge aktif:</b> ${aktifDagilim.shadow} | 🛡️ Restart Gap aktif: ${aktifDagilim.restartGap} | 📚 Toplam izlenen: ${aktifDagilim.total}
`;
        mesaj += `🎯 <b>Aktif Pusu:</b> ${pusuDegerleri.length} | 🟢 ${longPusu} | 🔴 ${shortPusu}
`;
        mesaj += `🧬 <b>Pusu DNA adayı:</b> 🏆 Premier ${pusuDnaDagilimi.premier} | 👻 Shadow ${pusuDnaDagilimi.shadow} | ❓ Eksik ${pusuDnaDagilimi.unknown}
`;
        const pusuKararNedenleri = Object.entries(pusuDnaDagilimi.reasons).sort((a,b)=>b[1]-a[1]).slice(0,3);
        if (pusuKararNedenleri.length) mesaj += `🔎 <b>Pusu karar nedenleri:</b> ${pusuKararNedenleri.map(([k,v])=>`${k} ${v}`).join(' | ')}
`;
        if (aktifShadowlar.length) {
            const shadowRows=aktifShadowlar.slice(0,3).map(p=>{ const q=p?.renkoPremierDecision?.premierScore||{}; return `${pozisyonSembol(p)} ${pozisyonYon(p)} | DNA ${p?.renkoPremierDecision?.dnaKey ? adaptiveDnaIntelligence.shortId(p.renkoPremierDecision.dnaKey) : 'YOK'} | Skor ${Number(q.score||0).toFixed(1)}/${Number(q.threshold||0).toFixed(1)} #${Number(q.rank||0)}/${Number(q.cohortSize||0)} | ${q.reason||p?.renkoPremierDecision?.reason||'SHADOW'}`; });
            mesaj += `👻 <b>Aktif Shadow kanıtı:</b> ${shadowRows.join(' || ')}${aktifShadowlar.length>3?` | +${aktifShadowlar.length-3} kayıt`:''}
`;
        }
        mesaj += `
━━━━━━━━━━━━━━━━━━
${ayarlar.entryStrategyMode === 'ST2_RENKO' ? st2AnaRaporOgrenmeOzeti() : learningEvolutionOzetMetni(s)}
`;
        if (ayarlar.entryStrategyMode === 'ST2_RENKO') mesaj += `

${globalHistoricalTelegramCached()}
`;
    } else {
        mesaj += `📦 <b>Aktif Pozisyon:</b> ${aktifler.length} / ${ayarlar.maxPozisyonSayisi || '-'}
`;
        mesaj += `🟢 Long: ${longAktif} | 🔴 Short: ${shortAktif}
`;
        mesaj += `🎯 <b>Aktif Pusu:</b> ${pusuDegerleri.length} | 🟢 ${longPusu} | 🔴 ${shortPusu}
`;
        const gercekOzet = premierObservation.realCompactTelegram(tumAktifler);
        mesaj += `
${gercekOzet}
`;
        mesaj += `
━━━━━━━━━━━━━━━━━━
🧠 <b>ÖĞRENME KATMANI AYRI ÇALIŞIYOR</b>
`;
        mesaj += `Sanal öğrenme ve geçmiş DNA sonuçları gerçek emir başarı/net kasasına dahil edilmez.
`;
    }


    const pozitifAktif = sirali.filter(p => Number(p?.anlikKarYuzde ?? p?.karYuzde ?? p?.pnlPct ?? 0) > 0).length;
    mesaj += `\n📊 <b>AKTİF PREMIER — ANLIK PERFORMANS SIRALAMASI (${enKarli.length}/${aktifler.length}, maks. 10)</b>\n`;
    if (aktifler.length && pozitifAktif === 0) mesaj += `ℹ️ Şu anda kârda Premier bulunmuyor.\n`;
    mesaj += enKarli.length
        ? enKarli.map(pozisyonSatiri).join('\n')
        : `Aktif pozisyon yok`;

    mesaj += `\n\n⚠️ <b>En Riskli Aktif Premier (${enRiskli.length}/${aktifler.length}, maks. 10)</b>\n`;
    mesaj += enRiskli.length
        ? enRiskli.map(pozisyonSatiri).join('\n')
        : `Aktif pozisyon yok`;
    if (aktifler.length > 0 && aktifler.length <= 4) {
        mesaj += `\n<i>Aktif Premier sayısı az olduğu için aynı pozisyonlar kâr ve risk sırasıyla gösterilir.</i>`;
    }

    if (sonKapananlar.length) {
        mesaj += `\n\n📌 <b>Son Kapanan 5</b>\n`;
        mesaj += sonKapananlar.map(sonKapananSatiri).filter(Boolean).join('\n');
    }

    mesaj += `\n━━━━━━━━━━━━━━━━━━\n`;
    mesaj += ayarlar.sanalEmirModu
        ? `<i>Canlı Portföy yalnız exact-context Premier sanal işlemlerini gösterir; negatif ve bilinmeyen bağlamlar Shadow defterinde öğrenir.</i>`
        : `<i>Canlı Portföy yalnız Binance gerçek emirlerini gösterir; sanal test ve öğrenme sayaçları karışmaz.</i>`;

    return kisalt(mesaj);
}

function kapananIslemSayisi() {
    const s = h.state.basariOzeti || {};
    return Number(s.tp || 0) + Number(s.sl || 0) + Number(s.be || 0);
}

async function learningValidationRaporuGonderGerekirse() {
    const kapanan = kapananIslemSayisi();
    const ilkCalisma = sonLearningValidationKapanan === null;
    const yeniKapanisVar = !ilkCalisma && kapanan !== sonLearningValidationKapanan;

    // Başlangıçta mevcut öğrenme durumunu bir kez göster.
    // Sonrasında yalnızca TP/SL/BE sayacı değiştiğinde yeni dashboard gönder.
    // Stop güncellemeleri ve Restart Gap muhasebe kapanışları rapor spam'i üretmez.
    if (!ilkCalisma && !yeniKapanisVar) return;

    sonLearningValidationKapanan = kapanan;

    try {
        const model = learningValidation.buildLearningValidationModel();
        const mesaj = learningValidation.telegramOzetMetni(model);
        await h.telegramMesajGonder(mesaj);
        console.log(`🧠 [AGROS INTELLIGENCE] Telegram raporu gönderildi | Kapanan: ${kapanan}`);
        // v4.8.0-fix.1: Family League artık yalnız hafızadır.
        // Eski Family Telegram/real-readiness yolu ana rapor zincirinden kesin olarak çağrılmaz.
    } catch (err) {
        console.error('❌ [AGROS INTELLIGENCE RAPOR HATASI]:', err.message);
    }
}


async function dnaLeagueRaporuGonderGerekirse(model = null) {
    if (ayarlar.dnaLeagueAktif === false || ayarlar.dnaLeagueTelegramAktif === false || ayarlar.familyLeagueEmirYetkisiAktif === false) return;

    try {
        const leagueModel = model || dnaLeague.build();
        if (!leagueModel) return;

        const transferKapanisi = Number(leagueModel.lastTransferTradeCount || 0);
        const ilkCalisma = sonDnaLeagueTransferKapanisi === null;
        const yeniTransferDonemi = !ilkCalisma && transferKapanisi !== sonDnaLeagueTransferKapanisi;
        const transferVar = Array.isArray(leagueModel.transfers) && leagueModel.transfers.length > 0;

        // Başlangıçta bir kez, sonrasında yalnızca transfer penceresi değiştiğinde gönder.
        if (!ilkCalisma && !yeniTransferDonemi && !transferVar) return;

        sonDnaLeagueTransferKapanisi = transferKapanisi;
        const mesaj = dnaLeague.telegramText(leagueModel, {
            limit: Math.max(1, Number(ayarlar.dnaLeagueTelegramTopAday || 3))
        });
        if (!mesaj) return;

        const sonuclar = await h.telegramMesajGonder(mesaj);
        const basarili = Array.isArray(sonuclar) && sonuclar.some(x => x?.sonuc?.ok);
        if (basarili) {
            const preparation = realOrderReadiness.buildPreparation(leagueModel);
            const hazirlikMesaji = realOrderReadiness.preparationTelegram(preparation, Math.max(1, Number(ayarlar.dnaLeagueTelegramTopAday || 3)));
            await h.telegramMesajGonder(hazirlikMesaji);
            console.log(`🏆 [DNA LEAGUE] Telegram raporu gönderildi | Premier: ${leagueModel.leagueSizes?.premier || 0} | Gerçek aday: ${preparation.readyCount || 0} | Transfer kapanışı: ${transferKapanisi}`);
        } else {
            console.error(`❌ [DNA LEAGUE TELEGRAM HATASI] Mesaj Telegram tarafından onaylanmadı | Transfer kapanışı: ${transferKapanisi}`);
        }
    } catch (err) {
        console.error('❌ [DNA LEAGUE RAPOR HATASI]:', err.message);
    }
}




async function labChampionRaporuGonderGerekirse() {
    if (ayarlar.labChampionAktif === false || ayarlar.labChampionTelegramAktif === false) return;
    try {
        const model = labChampion.build();
        const kapanan = Number(model.sourceClosed || 0);
        const ilk = sonLabChampionKapanan === null;
        const degisti = !ilk && kapanan !== sonLabChampionKapanan;
        const aralik = Math.max(1, Number(ayarlar.labChampionRaporHerKapanis || 5));
        if (!ilk && (!degisti || kapanan % aralik !== 0)) return;
        sonLabChampionKapanan = kapanan;
        const mesaj = labChampion.telegram(model, Math.max(1, Number(ayarlar.labChampionTelegramTopAday || 10)));
        if (mesaj) await h.telegramMesajGonder(mesaj);
        console.log(`🥇 [LAB CHAMPION] Telegram | Geçmiş ${kapanan} | Şampiyon ${model.championCount || 0} | Terfi hazır ${model.promotionReadyCount || 0} | Kayıp ${model.lostChampionCount || 0}`);
    } catch (err) {
        console.error('❌ [LAB CHAMPION RAPOR HATASI]:', err.message);
    }
}

async function labPremierRaporuGonderGerekirse() {
    if (ayarlar.labPremierAktif === false || ayarlar.labPremierTelegramAktif === false) return;
    try {
        const model = labPremier.summaryModel(h.state.aktifPozisyonlar || [], { force: true });
        const kapanan = Number(model.aggregate?.closed || 0);
        const ilk = sonLabPremierKapanan === null;
        const degisti = !ilk && kapanan !== sonLabPremierKapanan;
        const aralik = Math.max(1, Number(ayarlar.labPremierRaporHerKapanis || 5));
        if (!ilk && (!degisti || kapanan % aralik !== 0)) return;
        sonLabPremierKapanan = kapanan;
        const mesaj = labPremier.telegram(model, Math.max(1, Number(ayarlar.labPremierTelegramTopAday || 9)));
        if (mesaj) await h.telegramMesajGonder(mesaj);
        console.log(`🏁 [LAB PREMIER] Telegram | Premier LAB ${model.league?.premierCount || 0} | İleri ${model.league?.forwardVerifiedCount || 0} | Açılan ${model.accounting?.opened ?? model.aggregate?.opened ?? 0} | Bilimsel kapanan ${model.accounting?.closedScientific ?? kapanan} | Bilimsel aktif ${model.accounting?.activeScientific || 0} | GAP aktif ${model.accounting?.activeGap || 0} | Fark ${model.accounting?.difference || 0}`);
    } catch (err) {
        console.error('❌ [LAB PREMIER RAPOR HATASI]:', err.message);
    }
}

async function premierObservationRaporuGonderGerekirse() {
    if (ayarlar.premierObservationAktif === false || ayarlar.premierObservationTelegramAktif === false || ayarlar.familyLeagueEmirYetkisiAktif === false) return;
    try {
        const model = premierObservation.summaryModel(h.state.aktifPozisyonlar || []);
        const kapanan = Number(model.closed || 0);
        const ilk = sonPremierObservationKapanan === null;
        const aralik = Math.max(1, Number(ayarlar.premierObservationRaporHerKapanis || 5));
        const yeniPencere = !ilk && kapanan !== sonPremierObservationKapanan && kapanan % aralik === 0;
        if (!ilk && !yeniPencere) return;
        sonPremierObservationKapanan = kapanan;
        const mesaj = premierObservation.telegramFromModel(model);
        if (mesaj) await h.telegramMesajGonder(mesaj);
        console.log(`💎 [PREMIER OBSERVATION] Telegram raporu | Aktif ${model.active?.length || 0} | Kapanan ${kapanan} | Net ${Number(model.net||0).toFixed(4)}`);
    } catch (err) {
        console.error('❌ [PREMIER OBSERVATION RAPOR HATASI]:', err.message);
    }
}

async function adaptiveTradingLeagueRaporuGonderGerekirse() {
    if (ayarlar.adaptiveTradingLeagueAktif === false || ayarlar.adaptiveTradingLeagueTelegramAktif === false || ayarlar.familyLeagueEmirYetkisiAktif === false) return;
    try {
        const kapanan = kapananIslemSayisi();
        const aralik = Math.max(1, Number(ayarlar.adaptiveTradingLeagueRaporHerKapanis || 10));
        if (global.__agrosV4LastClosed !== undefined && kapanan === global.__agrosV4LastClosed) return;
        const ilk = global.__agrosV4LastClosed === undefined;
        global.__agrosV4LastClosed = kapanan;
        if (!ilk && kapanan % aralik !== 0) return;
        const mesaj = adaptiveTradingLeague.telegram(h.state.aktifPozisyonlar || []);
        if (mesaj) await h.telegramMesajGonder(mesaj);
        console.log(`🧠 [ADAPTIVE TRADING LEAGUE] Telegram raporu | Kapanan ${kapanan}`);
    } catch (err) {
        console.error('❌ [ADAPTIVE TRADING LEAGUE RAPOR HATASI]:', err.message);
    }
}

async function exitEvolutionDashboardGonderGerekirse() {
    if (ayarlar.exitEvolutionDashboardAktif === false) return;
    try {
        const model = exitEvolutionDashboard.buildDashboardModel();
        const replaySayisi = Number(model.totalTrades || 0);
        const ilkCalisma = sonExitEvolutionReplaySayisi === null;
        const yeniReplayVar = !ilkCalisma && replaySayisi !== sonExitEvolutionReplaySayisi;
        if (!ilkCalisma && !yeniReplayVar) return;
        sonExitEvolutionReplaySayisi = replaySayisi;
        const mesaj = exitEvolutionDashboard.telegramMetni(model);
        if (!mesaj) return;
        await h.telegramMesajGonder(mesaj);
        console.log(`🧬 [EXIT EVOLUTION DASHBOARD] Telegram raporu gönderildi | Replay: ${replaySayisi}`);
    } catch (err) {
        console.error('❌ [EXIT EVOLUTION DASHBOARD HATASI]:', err.message);
    }
}


async function exitVictoryVeDnaKartlariGonderGerekirse() {
    try {
        const audit = exitVictoryAudit.build(h.state.aktifPozisyonlar || []);
        const replaySayisi = Number(audit.health?.trades || 0);
        const ilk = sonExitVictoryReplay === null;
        const yeni = !ilk && replaySayisi !== sonExitVictoryReplay;
        if (!ilk && !yeni) return;
        sonExitVictoryReplay = replaySayisi;
        await h.telegramMesajGonder(exitVictoryAudit.telegram(audit));
        console.log(`🏁 [EXIT ZAFER DENETİMİ] Telegram | Replay ${replaySayisi} | Hazır atama ${audit.assignmentStats.ready}`);
        if (!dnaKartlariIlkGonderim || yeni) {
            await h.telegramMesajGonder(exitVictoryAudit.dnaTelegram(8));
            dnaKartlariIlkGonderim = true;
            console.log('🪪 [DNA KİMLİK KARTLARI] Telegram raporu gönderildi.');
        }
    } catch (err) {
        console.error('❌ [EXIT ZAFER / DNA KART RAPOR HATASI]:', err.message);
    }
}


async function realOrderPreparationRaporuGonderGerekirse() {
    if (ayarlar.realOrderPreparationIntelligenceAktif === false || ayarlar.realOrderPreparationTelegramAktif === false) return;
    try {
        const dataDir = path.join(__dirname, 'data');
        const replayPath = path.join(dataDir, 'exit-replay-results.jsonl');
        if (!fs.existsSync(replayPath)) return;
        const mtime = fs.statSync(replayPath).mtimeMs;
        if (sonRealOrderPreparationMtime !== null && mtime === sonRealOrderPreparationMtime) return;
        sonRealOrderPreparationMtime = mtime;
        const report = realOrderPreparation.run(dataDir, dataDir);
        const mesaj = realOrderPreparation.compactTelegram(report);
        if (mesaj) await h.telegramMesajGonder(mesaj);
        console.log(`🧪 [REAL ORDER PREPARATION] Telegram | Replay ${report.sourceCounts.replay} | Stop aday %${report.stop.recommendation.candidateStopPct} | Son-5 ${report.premier.recent5Decision}`);
    } catch (err) {
        console.error('❌ [REAL ORDER PREPARATION RAPOR HATASI]:', err.message);
    }
}


async function st1FinalCertificationRaporuGonderGerekirse() {
    if (ayarlar.st1FinalCertificationTelegramAktif === false) return;
    try {
        const model = st1Certification.build(h.state.aktifPozisyonlar || []);
        const signature = [
            model.premier?.accounting?.closedScientific || 0,
            model.premier?.trackMetrics?.bottomLong?.closed || 0,
            model.premier?.trackMetrics?.bottomShort?.closed || 0,
            model.premier?.trackMetrics?.reverse?.closed || 0,
            model.premier?.reversePipeline?.opened || 0,
            model.lifecycle?.stopChanged?.length || 0,
            model.lifecycle?.beChanged?.length || 0,
            model.audit?.assignmentStats?.ready || 0,
            model.audit?.assignmentStats?.mismatch || 0
        ].join('|');
        if (sonSt1CertificationSignature !== null && signature === sonSt1CertificationSignature) return;
        sonSt1CertificationSignature = signature;
        const mesaj = st1Certification.telegram(model);
        if (mesaj) await h.telegramMesajGonder(mesaj);
        console.log(`🧾 [ST2 FINAL CERTIFICATION] Telegram | Skor ${model.score.toFixed(1)} | ${model.status} | İmza ${signature}`);
    } catch (err) {
        console.error('❌ [ST2 FINAL CERTIFICATION HATASI]:', err.message);
    }
}

async function st2EntryEvolutionDetayiGonderGerekirse(oneCikar = false) {
    if (ayarlar.entryStrategyMode !== 'ST2_RENKO') return;
    const x = renkoEntryEvolution.summary();
    const imza = `${Number(x.total?.closed || 0)}|${Number(x.total?.profiles || 0)}|${Number(x.total?.assigned || 0)}|${x.bridge?.last?.at || ''}`;
    if (!oneCikar && sonSt2EntryEvolutionDetayImzasi === imza) return;
    try {
        const sonuclar = await h.telegramMesajGonder(renkoEntryEvolution.telegram(), { priority: 'detail' });
        const liste = Array.isArray(sonuclar) ? sonuclar : [];
        const basarili = liste.length > 0 && liste.every(x => x?.sonuc?.ok === true);
        if (!basarili) {
            console.error(`❌ [ST2 ENTRY EVOLUTION TELEGRAM] Ayrıntılı rapor doğrulanamadı; sonraki turda yeniden denenecek | Parça ${liste.length}`);
            return;
        }
        const intelligence = adaptiveDnaIntelligence.registry();
        if (Array.isArray(intelligence.profiles) && intelligence.profiles.length > 0) {
            const dnaSonuclar = await h.telegramMesajGonder(adaptiveDnaIntelligence.telegram(8), { priority: 'detail' });
            const dnaListe = Array.isArray(dnaSonuclar) ? dnaSonuclar : [];
            const dnaBasarili = dnaListe.length > 0 && dnaListe.every(x => x?.sonuc?.ok === true);
            if (!dnaBasarili) {
                console.error(`❌ [ADAPTIVE DNA INTELLIGENCE TELEGRAM] Rapor doğrulanamadı; sonraki turda yeniden denenecek | Parça ${dnaListe.length}`);
                return;
            }
        }
        sonSt2EntryEvolutionDetayImzasi = imza;
        console.log(`✅ [ST2 ENTRY EVOLUTION TELEGRAM] Ayrıntılı rapor + DNA intelligence gönderildi | Bilimsel kapanış ${Number(x.total?.closed || 0)} | Parça ${liste.length}`);
    } catch (err) {
        console.error(`❌ [ST2 ENTRY EVOLUTION TELEGRAM] ${err.message}`);
    }
}


async function st2ExitEvolutionDetayiGonderGerekirse(oneCikar = false) {
    if (ayarlar.entryStrategyMode !== 'ST2_RENKO' || ayarlar.renkoCikisEvolutionAktif !== true) return;
    const x = renkoExitEvolution.summary(h.state.aktifPozisyonlar || []);
    const totalClosed = x.profiles.reduce((a,p)=>a+Number(p.closed||0),0);
    const imza = `${totalClosed}|${x.profiles.length}|${x.state.updatedAt||''}`;
    if (!oneCikar && sonSt2ExitEvolutionDetayImzasi === imza) return;
    // Sıfır kapanışta da atama/fallback görünürlüğü korunur.
    try {
        const sonuclar = await h.telegramMesajGonder(renkoExitEvolution.telegram(h.state.aktifPozisyonlar || []), { priority: 'detail' });
        const liste = Array.isArray(sonuclar) ? sonuclar : [];
        if (!(liste.length > 0 && liste.every(x => x?.sonuc?.ok === true))) return;
        sonSt2ExitEvolutionDetayImzasi = imza;
        console.log(`✅ [ST2 EXIT EVOLUTION TELEGRAM] Bilimsel kapanış ${totalClosed} | Parça ${liste.length}`);
    } catch (err) { console.error(`❌ [ST2 EXIT EVOLUTION TELEGRAM] ${err.message}`); }
}

async function detayRaporlariniCalistir(oneCikar = false) {
    if (ayarlar.telegramMinimalOperasyonModu === true || ayarlar.telegramDetayRaporlariAktif === false) {
        console.log('ℹ️ [MINIMAL TELEGRAM] Entry/Exit/DNA ayrıntı raporları Telegram yerine log/state/ledger içinde tutuluyor.');
        return;
    }
    if (detayRaporCalisiyor) {
        detayRaporTekrarIstegi = true;
        return;
    }
    if (heapPressureHigh() && !oneCikar) {
        const m = memorySafeIo.ramMb();
        console.warn(`🧠 [DETAY RAPOR BASKI KORUMASI] Heap ${m.heapUsed} MB; detay raporu ertelendi.`);
        return;
    }
    detayRaporCalisiyor = true;
    try {
        await st2EntryEvolutionDetayiGonderGerekirse(oneCikar);
        await st2ExitEvolutionDetayiGonderGerekirse(oneCikar);
    } catch (err) {
        console.error(`⚠️ [DETAY RAPOR KUYRUK HATASI] ${err.message}`);
    } finally {
        detayRaporCalisiyor = false;
        if (detayRaporTekrarIstegi) {
            detayRaporTekrarIstegi = false;
            setTimeout(() => detayRaporlariniCalistir(false), 1000).unref?.();
        }
    }
}

async function raporGonder(oneCikar = false) {
    if (raporZinciriCalisiyor) {
        raporTekrarIstegi = true;
        raporTekrarOneCikar = raporTekrarOneCikar || oneCikar;
        const gecen = raporCalismaBaslangici ? Date.now() - raporCalismaBaslangici : 0;
        console.warn(`🛡️ [RAPOR COALESCE] Aktif panel ${gecen}ms; yeni istek tek güncel tekrar talebinde birleştirildi.`);
        return false;
    }
    raporZinciriCalisiyor = true;
    raporCalismaBaslangici = Date.now();
    try {
        const mesaj = canliRaporMetniOlustur();
        // R11: rapor üretim mutex'i Telegram ağ teslimini BEKLEMEZ.
        // Canlı panel kendi latest-only worker'ında teslim edilir; 30 sn cadence bir ağ timeout'u yüzünden kilitlenmez.
        if (ayarlar.canliRaporAktif) {
            try {
                Promise.resolve(h.telegramCanliRaporGuncelle(mesaj, oneCikar))
                    .catch(err => console.error(`⚠️ [CANLI PANEL TESLİM HATASI] ${err?.message || err}`));
            } catch (err) {
                console.error(`⚠️ [CANLI PANEL KUYRUK HATASI] ${err?.message || err}`);
            }
        } else if (oneCikar) {
            Promise.resolve(h.telegramMesajGonder(mesaj))
                .catch(err => console.error(`⚠️ [CANLI PANEL TEKİL HATASI] ${err?.message || err}`));
        }

        const detayIzinli = ayarlar.telegramMinimalOperasyonModu !== true && ayarlar.telegramDetayRaporlariAktif !== false;
        const detayAralikMs = Math.max(60000, Number(ayarlar.st2DetayRaporMinAralikMs || 900000));
        const startupGecikmeMs = Math.max(60000, Number(ayarlar.st2DetayRaporStartupGecikmeMs || 180000));
        const startupHazir = detayIzinli && process.uptime() * 1000 >= startupGecikmeMs;
        // Kritik kapanış/pusu mesajları için oneCikar ağır detay raporunu zorlamaz.
        // Detay yalnız warm-up sonrası ve kendi seyrek periyodunda çalışır.
        const detayZamani = startupHazir && (Date.now() - sonDetayRaporZamani >= detayAralikMs);
        if (detayZamani) {
            sonDetayRaporZamani = Date.now();
            setImmediate(() => detayRaporlariniCalistir(false));
        }
        const m = memorySafeIo.ramMb();
        console.log(`🧠 [ST2 CLEAN REPORT] Panel hızlı | Detay ${detayZamani ? 'ARKA_PLAN_KUYRUK' : 'SEYREKLESTIRILDI'} | RSS ${m.rss} MB | Heap ${m.heapUsed}/${m.heapTotal} MB`);
        return true;
    } catch (err) {
        console.error('❌ Rapor hazırlanırken hata oluştu:', err.message);
        return false;
    } finally {
        raporZinciriCalisiyor = false;
        raporCalismaBaslangici = 0;
        if (raporTekrarIstegi) {
            const tekrarOneCikar = raporTekrarOneCikar;
            raporTekrarIstegi = false;
            raporTekrarOneCikar = false;
            setTimeout(() => raporGonder(tekrarOneCikar).catch(err => console.error(`⚠️ [RAPOR TEKRAR HATASI] ${err.message}`)), 250).unref?.();
        }
    }
}

function raporTalepEt(oneCikar = false) {
    setImmediate(() => raporGonder(oneCikar).catch(err => console.error(`⚠️ [RAPOR TALEP HATASI] ${err.message}`)));
}

module.exports = { raporGonder, raporTalepEt, detayRaporlariniCalistir, canliRaporMetniOlustur, minimalCanliRaporMetniOlustur, st2EntryEvolutionDetayiGonderGerekirse, st2ExitEvolutionDetayiGonderGerekirse, learningValidationRaporuGonderGerekirse, dnaLeagueRaporuGonderGerekirse, labChampionRaporuGonderGerekirse, labPremierRaporuGonderGerekirse, premierObservationRaporuGonderGerekirse, adaptiveTradingLeagueRaporuGonderGerekirse, exitEvolutionDashboardGonderGerekirse, exitVictoryVeDnaKartlariGonderGerekirse, realOrderPreparationRaporuGonderGerekirse, st1FinalCertificationRaporuGonderGerekirse };
