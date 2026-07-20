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

const TELEGRAM_GUVENLI_LIMIT = 3600;
let sonLearningValidationKapanan = null;
let sonExitEvolutionReplaySayisi = null;
let sonDnaLeagueTransferKapanisi = null;
let sonPremierObservationKapanan = null;
let learningEvolutionBaseline = null;
let raporZinciriCalisiyor = false;
let sonExitVictoryReplay = null;
let dnaKartlariIlkGonderim = false;
let sonLabChampionKapanan = null;
let sonLabPremierKapanan = null;

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
    return Number(
        h.state.canliFiyatlar[sembol] ||
        p.sonFiyat ||
        p.anlikFiyat ||
        p.currentPrice ||
        p.fiyat ||
        pozisyonGiris(p)
    );
}

function pozisyonKarYuzde(p) {
    if (Number.isFinite(Number(p.anlikKarYuzde))) return Number(p.anlikKarYuzde);
    if (Number.isFinite(Number(p.karYuzde))) return Number(p.karYuzde);
    if (Number.isFinite(Number(p.pnlYuzde))) return Number(p.pnlYuzde);

    const giris = pozisyonGiris(p);
    const fiyat = pozisyonFiyat(p);
    const yon = pozisyonYon(p);

    if (!giris || !fiyat) return 0;

    if (yon === 'SHORT') return ((giris - fiyat) / giris) * 100;
    return ((fiyat - giris) / giris) * 100;
}

function pozisyonKorunanKar(p) {
    if (Number.isFinite(Number(p.korunanKarYuzdesi))) return Number(p.korunanKarYuzdesi);
    if (Number.isFinite(Number(p.korunanKarYuzde))) return Number(p.korunanKarYuzde);
    if (Number.isFinite(Number(p.korunanKar))) return Number(p.korunanKar);

    const giris = pozisyonGiris(p);
    const sl = Number(p.sanalStop || p.stopLoss || p.sl || p.stop || 0);
    const yon = pozisyonYon(p);

    if (!giris || !sl) return null;

    if (yon === 'SHORT') return ((giris - sl) / giris) * 100;
    return ((sl - giris) / giris) * 100;
}

function pozisyonKademe(p) {
    return p.tpKademe || p.kademe || p.sanalTpKademe || p.sonKademe || 0;
}

function pozisyonSatiri(p) {
    const sembol = pozisyonSembol(p);
    const yon = pozisyonYon(p);
    const kar = pozisyonKarYuzde(p);
    const korunan = pozisyonKorunanKar(p);
    const kademe = pozisyonKademe(p);

    let satir = `${sembol} ${yon} ${kar >= 0 ? '+' : ''}%${yuzde(kar)}`;

    if (korunan !== null) {
        satir += ` | SL ${korunan >= 0 ? '+' : ''}%${yuzde(korunan)}`;
    }

    if (kademe) {
        satir += ` | K${kademe}`;
    }

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

function kisalt(metin, limit = TELEGRAM_GUVENLI_LIMIT) {
    const text = String(metin || '');
    if (text.length <= limit) return text;

    // HTML etiketlerinin ortasında kesilen mesaj Telegram tarafından reddedilir.
    // Uzun canlı raporu önce düz metne çevirip sonra güvenli sınırda kesiyoruz.
    const duzMetin = text
        .replace(/<\/?pre>/g, '')
        .replace(/<\/?b>/g, '')
        .replace(/<\/?i>/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

    return duzMetin.slice(0, limit - 90) +
        `\n\n⚠️ Rapor güvenlik nedeniyle kısaltıldı.`;
}


function learningEvolutionOzetMetni(s = {}) {
    try {
        const model = learningValidation.buildLearningValidationModel();
        const historicalOpened = Number(s.toplamAcilanEmir || 0);
        const historicalClosed = Number(model.kapanan || 0);
        const observed = Number(model.learningScore?.toplamDna || 0);
        const ready = Number(model.learningScore?.yeterliDna || 0);
        const leagueSizes = model.dnaLeague?.leagueSizes || {};
        const labLeague = labPremier.build({ persist: false });
        const continuity = accountingContinuity.snapshot(h.state.aktifPozisyonlar || []);
        const current = continuity.current || {};
        const canonical = continuity.canonical || {};
        const premierPartition = canonical.premier || {};
        const shadowPartition = canonical.shadow || {};
        const premierOpened = Number(premierPartition.opened ?? current.openedPremier ?? 0);
        const shadowOpened = Number(shadowPartition.opened ?? current.openedShadow ?? 0);
        const premierClosed = Number(premierPartition.closedScientific ?? current.closedPremier ?? 0);
        const shadowClosed = Number(shadowPartition.closedScientific ?? current.closedShadow ?? 0);
        const premierActive = Number(premierPartition.activeScientific ?? continuity.active?.premier ?? 0);
        const shadowActive = Number(shadowPartition.activeScientific ?? continuity.active?.shadow ?? 0);
        const learningOpened = premierOpened + shadowOpened;
        const learningClosed = premierClosed + shadowClosed;
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
        text += `🗺️ Family Hafıza: 🏆 ${Number(leagueSizes.premier || 0)} | 🥈 ${Number(leagueSizes.championship || 0)} | 🌱 ${Number(leagueSizes.development || 0)} | 📚 ${Number(leagueSizes.historical || 0)} | Emir yetkisi yok\n`;
        text += `🧬 LAB Ligi: 🏆 Premier ${Number(labLeague.premierCount || 0)} | ✅ İleri doğrulanmış ${Number(labLeague.forwardVerifiedCount || 0)} | 🥈 Gölge ${Number(labLeague.championshipCount || 0)}\n`;
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

function canliRaporMetniOlustur() {
    const s = h.state.basariOzeti || {};
    const tumAktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
    const aktifDagilim = accountingContinuity.activeBreakdown(tumAktifler);
    const aktifler = ayarlar.sanalEmirModu
        ? aktifDagilim.premierPositions
        : aktifDagilim.realPositions;
    const pusuDegerleri = Object.values(h.state.pusuListesi || {});
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

    const sirali = [...aktifler].sort((a, b) => pozisyonKarYuzde(b) - pozisyonKarYuzde(a));
    const enKarli = sirali.slice(0, 5);
    const enRiskli = [...sirali].reverse().slice(0, 5);

    // Eski genel muhasebenin son kapananları üst katman raporuna alınmaz.
    // Böylece öğrenme kapanışları gerçek emir veya lig testi listesine karışmaz.
    const sonKapananlar = [];

    const saat = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const mod = ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE';

    let mesaj = '';

    mesaj += `📊 <b>PARA MAKİNESİ CANLI PORTFÖY</b>\n`;
    mesaj += `🕒 ${saat} | ${mod}\n`;
    mesaj += `━━━━━━━━━━━━━━━━━━\n`;
    if (ayarlar.sanalEmirModu) {
        mesaj += `📦 <b>Premier aktif:</b> ${aktifDagilim.premier} / ${ayarlar.maxPozisyonSayisi || '-'} | 🟢 ${longAktif} | 🔴 ${shortAktif}
`;
        mesaj += `👻 <b>Gölge aktif:</b> ${aktifDagilim.shadow} | 🛡️ Restart Gap aktif: ${aktifDagilim.restartGap} | 📚 Toplam izlenen: ${aktifDagilim.total}
`;
    } else {
        mesaj += `📦 <b>Aktif Pozisyon:</b> ${aktifler.length} / ${ayarlar.maxPozisyonSayisi || '-'}
`;
        mesaj += `🟢 Long: ${longAktif} | 🔴 Short: ${shortAktif}
`;
    }
    mesaj += `🎯 <b>Aktif Pusu:</b> ${pusuDegerleri.length} | 🟢 ${longPusu} | 🔴 ${shortPusu}\n`;
    if (ayarlar.sanalEmirModu) {
        const leagueTestOzeti = labPremier.compactTelegram(tumAktifler);
        mesaj += `
${leagueTestOzeti}
`;
        mesaj += `
━━━━━━━━━━━━━━━━━━
${learningEvolutionOzetMetni(s)}
`;
    } else {
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


    mesaj += `\n🏆 <b>En Karlı 5</b>\n`;
    mesaj += enKarli.length
        ? enKarli.map(pozisyonSatiri).join('\n')
        : `Aktif pozisyon yok`;

    mesaj += `\n\n⚠️ <b>En Riskli 5</b>\n`;
    mesaj += enRiskli.length
        ? enRiskli.map(pozisyonSatiri).join('\n')
        : `Aktif pozisyon yok`;

    if (sonKapananlar.length) {
        mesaj += `\n\n📌 <b>Son Kapanan 5</b>\n`;
        mesaj += sonKapananlar.map(sonKapananSatiri).filter(Boolean).join('\n');
    }

    mesaj += `\n━━━━━━━━━━━━━━━━━━\n`;
    mesaj += ayarlar.sanalEmirModu
        ? `<i>Canlı Portföy yalnız LAB Premier sanal testini gösterir; Family ve diğer LAB'lar gölgede öğrenir.</i>`
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
        console.log(`🏁 [LAB PREMIER] Telegram | Premier LAB ${model.league?.premierCount || 0} | İleri ${model.league?.forwardVerifiedCount || 0} | Açılan ${model.aggregate?.opened || 0} | Kapanan ${kapanan}`);
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

async function raporGonder(oneCikar = false) {
    if (raporZinciriCalisiyor) {
        console.warn('🛡️ [RAPOR GUARD] Önceki rapor zinciri sürüyor; çakışan çağrı atlandı.');
        return;
    }
    raporZinciriCalisiyor = true;
    try {
        const mesaj = canliRaporMetniOlustur();

        if (ayarlar.canliRaporAktif) {
            await h.telegramCanliRaporGuncelle(mesaj, oneCikar);
        } else if (oneCikar) {
            await h.telegramMesajGonder(mesaj);
        }

        const ramTrace = (etiket) => {
            const m = memorySafeIo.ramMb();
            console.log(`🧠 [RAM TRACE] ${etiket} | RSS ${m.rss} MB | Heap ${m.heapUsed}/${m.heapTotal} MB`);
        };
        ramTrace('Rapor zinciri başlangıç');
        await learningValidationRaporuGonderGerekirse();
        ramTrace('Learning Validation sonrası');
        await exitEvolutionDashboardGonderGerekirse();
        ramTrace('Exit Evolution sonrası');
        await exitVictoryVeDnaKartlariGonderGerekirse();
        ramTrace('Exit Victory + DNA Cards sonrası');
        await labChampionRaporuGonderGerekirse();
        ramTrace('Lab Champion sonrası');
        await labPremierRaporuGonderGerekirse();
        ramTrace('LAB Premier sonrası');
    } catch (err) {
        console.error('❌ Rapor hazırlanırken hata oluştu:', err.message);
    } finally {
        raporZinciriCalisiyor = false;
    }
}

module.exports = { raporGonder, canliRaporMetniOlustur, learningValidationRaporuGonderGerekirse, dnaLeagueRaporuGonderGerekirse, labChampionRaporuGonderGerekirse, labPremierRaporuGonderGerekirse, premierObservationRaporuGonderGerekirse, adaptiveTradingLeagueRaporuGonderGerekirse, exitEvolutionDashboardGonderGerekirse, exitVictoryVeDnaKartlariGonderGerekirse };
