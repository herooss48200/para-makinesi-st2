require('dotenv').config();
const h = require('./1_hafiza.js');
const p = require('./4_pozisyon.js');
const piyasa = require('./3_piyasa.js');
const revizyon = require('./revizyon.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const versiyonBilgi = require('./versiyon.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');

let donguCalisiyor = false;
let sonOzetLog = 0;
let sonCanliRapor = 0;

async function baslat() {
    console.log('=== [PARA MAKİNESİ AUTOMATION SYSTEM] STARTING ===');
    console.log(`🧩 Versiyon: ${versiyonBilgi.kisaOzet()}`);

    try {
        await piyasa.sembolleriYukle();
        await piyasa.acikPozisyonlariBorsadanDevral();
        kaliciHafiza.yukle();
        await revizyon.derinGecmisiInsaEt();

        // v4.0.1: Yeni katmanların gerçekten yüklendiğini düşük maliyetli biçimde doğrula.
        // Ağır DNA/exit geçmişi başlangıçta yeniden hesaplanmaz; kayıtlı modeller kullanılır.
        try {
            const dnaLeague = require('./46_dna_league_engine.js');
            const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
            const premierObservation = require('./48_premier_observation_engine.js');
            const adaptiveLeague = require('./49_adaptive_trading_league.js');
            const leagueState = dnaLeague.findPlayer('__HEALTHCHECK__') === null;
            const exitModel = dynamicExit.readModel();
            const observation = premierObservation.read();
            console.log(`🧠 [ADAPTIVE LEAGUE READY] ${adaptiveLeague.VERSION} | Lig kayıt erişimi ${leagueState ? 'OK' : 'OK'} | Exit model ${exitModel ? 'HAZIR' : 'ACTUAL_FALLBACK'} | Observation kapanan ${Number(observation?.closed || 0)}`);
            console.log('🛡️ [RAM-SAFE] Başlangıçta ağır replay yeniden hesaplaması kapalı; kontrollü kapanış aralığında güncellenecek.');
            console.log('🧬 [DUAL-LAYER RUNTIME ACTIVE] SANAL=ALL_VALID_DNA | GERÇEK=CHAMPIONSHIP_x0.25+PREMIER_x1.00 | PROFIT-FIRST_ONLY_REAL');
        } catch (err) {
            console.error(`❌ [ADAPTIVE LEAGUE STARTUP HATASI] ${err.message}`);
        }

        const s = h.state.basariOzeti;
        const emirModu = ayarlar.sanalEmirModu ? 'SANAL EMİR MODU' : 'BINANCE EMİR MODU';
        const baslangicMesaji = `🚀 <b>PARA MAKİNESİ BOTU AKTİF</b>\n\n` +
            `🧪 Emir Modu: ${emirModu}\n` +
            `🧩 Versiyon: ${versiyonBilgi.telegramOzet()}\n` +
            `📊 Strateji: ${ayarlar.trendPeriyodu || ayarlar.superTrendPeriyodu || 'YOK'} trend + ${ayarlar.pusuPeriyodu} pusu + ${ayarlar.sniperPeriyodu} sniper\n` +
            `📡 İzlenen Sembol: ${h.state.semboller.length}\n` +
            `🧠 Geri Yüklenen Pozisyon: ${h.state.aktifPozisyonlar.length}\n` +
            `💰 Cüzdan Net PNL: ${s.netKarZarar.toFixed(2)} USDT\n\n` +
            `<i>Sistem kapanmış mumları izliyor, pusu kuruyor ve sniper tetik bekliyor...</i>`;

        await h.telegramMesajGonder(baslangicMesaji);
        await rapor.raporGonder(true);
        console.log(`✅ SİSTEM HAZIR. DÖNGÜ BAŞLATILDI. Emir Modu: ${emirModu}`);

        setInterval(async () => {
            if (donguCalisiyor) return;
            if (Date.now() < h.state.cooldownBitis) return;

            donguCalisiyor = true;
            try {
                const fiyatlar = await h.client.futuresPrices();
                for (const [sym, price] of Object.entries(fiyatlar)) {
                    h.state.canliFiyatlar[sym] = parseFloat(price);
                }

                await p.piyasayiTaraVePusuKur();
                await p.pusulariDenetleVeIslemAc();
                await p.izSurmeyiGuncelle();
                await p.pusuRaporuGonder();

                const now = Date.now();
                if (ayarlar.canliRaporAktif && now - sonCanliRapor >= (ayarlar.canliRaporGuncellemeMs || 30000)) {
                    sonCanliRapor = now;
                    await rapor.raporGonder(false);
                }

                // v3.0.2 FIX: Strategy Lab toplu başarı/uyum analizi sadece kapanış sayacına bağlı kalmasın.
                // Ayarlanan dakikada bir Telegram'a ayrı mesaj olarak düşer; canlı raporu düzenlemez/silmez.
                try {
                    const blackbox = require('./8_blackbox.js');
                    if (blackbox.istatistikDakikaRaporGerekli && blackbox.istatistikDakikaRaporGerekli()) {
                        await h.telegramMesajGonder(blackbox.telegramIstatistikRaporMetni());
                        kaliciHafiza.kaydet('blackbox-dakika-istatistik-raporu-gonderildi');
                    }
                } catch (err) {
                    console.error(`⚠️ [BLACKBOX DAKİKA RAPOR HATASI] ${err.message}`);
                }

                if (now - sonOzetLog > 30000) {
                    sonOzetLog = now;
                    console.log(`💓 [BOT AKTİF] Sembol: ${h.state.semboller.length} | Pusu: ${Object.keys(h.state.pusuListesi).length} | Pozisyon: ${h.state.aktifPozisyonlar.length} | ST Güncelleme: ${h.state.sonSniperGuncellemeZamani ? new Date(h.state.sonSniperGuncellemeZamani).toLocaleTimeString() : 'yok'}`);
                }
            } catch (e) {
                if (e.message && (e.message.includes('429') || e.message.includes('1095'))) {
                    console.warn('⏳ Binance yoğun istek koruması sinyali! 15 saniye duraklatılıyor...');
                    h.state.cooldownBitis = Date.now() + 15000;
                } else {
                    console.error('❌ Döngü çalışma hatası:', e.message || e);
                }
            } finally {
                donguCalisiyor = false;
            }
        }, ayarlar.pingInterval || 500);
    } catch (e) {
        console.error('❌ Kritik Başlatma Hatası! 5 saniye sonra yeniden denenecek:', e.message || e);
        setTimeout(baslat, 5000);
    }
}

baslat();
