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
        const opened = Number(s.toplamAcilanEmir || 0);
        const closed = Number(model.kapanan || 0);
        const observed = Number(model.learningScore?.toplamDna || 0);
        const ready = Number(model.learningScore?.yeterliDna || 0);
        const leagueSizes = model.dnaLeague?.leagueSizes || {};

        if (!learningEvolutionBaseline) {
            learningEvolutionBaseline = { opened, closed, observed, ready };
        }

        const dOpened = opened - learningEvolutionBaseline.opened;
        const dClosed = closed - learningEvolutionBaseline.closed;
        const dObserved = observed - learningEvolutionBaseline.observed;
        const dReady = ready - learningEvolutionBaseline.ready;
        const delta = n => `${n >= 0 ? '+' : ''}${n}`;

        let text = `🧠 <b>ÖĞRENME DEVAM EDİYOR</b>
`;
        text += `📦 Açılan ${opened} (${delta(dOpened)}) | Kapanan ${closed} (${delta(dClosed)})
`;
        text += `🎯 Başarı %${yuzde(model.winRate)} | Exp ${model.expectancy >= 0 ? '+' : ''}${sayi(model.expectancy, 4)} | Net ${model.netKasa >= 0 ? '+' : ''}${sayi(model.netKasa, 2)} USDT
`;
        text += `🧬 DNA: Hazır ${ready} (${delta(dReady)}) / Gözlenen ${observed} (${delta(dObserved)})
`;
        text += `🔄 Dinamik Lig: 🏆 ${Number(leagueSizes.premier || 0)} | 🥈 ${Number(leagueSizes.championship || 0)} | 🌱 ${Number(leagueSizes.development || 0)} | 📚 ${Number(leagueSizes.historical || 0)}
`;
        text += `<i>Parantez içi değişim bu bot çalışmasından itibaren.</i>`;
        return text;
    } catch (err) {
        return `🧠 <b>Öğrenme:</b> aktif | Ayrıntılı sayaç hazırlanıyor.`;
    }
}

function canliRaporMetniOlustur() {
    const s = h.state.basariOzeti || {};
    const tumAktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
    const aktifler = ayarlar.sanalEmirModu
        ? tumAktifler.filter(p => p?.sanal !== false && ['PREMIER', 'CHAMPIONSHIP'].includes(String(p?.premierObservation?.learningTrack || '')))
        : tumAktifler.filter(p => p?.sanal === false);
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
    mesaj += `📦 <b>Aktif Pozisyon:</b> ${aktifler.length} / ${ayarlar.maxPozisyonSayisi || '-'}\n`;
    mesaj += `🟢 Long: ${longAktif} | 🔴 Short: ${shortAktif}\n`;
    mesaj += `🎯 <b>Aktif Pusu:</b> ${pusuDegerleri.length} | 🟢 ${longPusu} | 🔴 ${shortPusu}\n`;
    if (ayarlar.sanalEmirModu) {
        const leagueTestOzeti = premierObservation.compactTelegram(tumAktifler);
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
        ? `<i>Canlı Portföy yalnız Premier/Championship sanal testini gösterir; alt lig öğrenmesi ayrı raporlanır.</i>`
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
        await dnaLeagueRaporuGonderGerekirse(model.dnaLeague);
    } catch (err) {
        console.error('❌ [AGROS INTELLIGENCE RAPOR HATASI]:', err.message);
    }
}


async function dnaLeagueRaporuGonderGerekirse(model = null) {
    if (ayarlar.dnaLeagueAktif === false || ayarlar.dnaLeagueTelegramAktif === false) return;

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

async function premierObservationRaporuGonderGerekirse() {
    if (ayarlar.premierObservationAktif === false || ayarlar.premierObservationTelegramAktif === false) return;
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
    if (ayarlar.adaptiveTradingLeagueAktif === false || ayarlar.adaptiveTradingLeagueTelegramAktif === false) return;
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
        await premierObservationRaporuGonderGerekirse();
        ramTrace('Premier Observation sonrası');
        await adaptiveTradingLeagueRaporuGonderGerekirse();
        ramTrace('Adaptive League sonrası');
    } catch (err) {
        console.error('❌ Rapor hazırlanırken hata oluştu:', err.message);
    } finally {
        raporZinciriCalisiyor = false;
    }
}

module.exports = { raporGonder, canliRaporMetniOlustur, learningValidationRaporuGonderGerekirse, dnaLeagueRaporuGonderGerekirse, labChampionRaporuGonderGerekirse, premierObservationRaporuGonderGerekirse, adaptiveTradingLeagueRaporuGonderGerekirse, exitEvolutionDashboardGonderGerekirse, exitVictoryVeDnaKartlariGonderGerekirse };
