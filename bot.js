require('dotenv').config();
const h = require('./1_hafiza.js');
const p = require('./4_pozisyon.js');
const piyasa = require('./3_piyasa.js');
const revizyon = require('./revizyon.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const versiyonBilgi = require('./versiyon.js');
const kaliciHafiza = require('./5_kalici_hafiza.js');
const binanceAg = require('./64_binance_network_resilience.js');
const accountingContinuity = require('./65_accounting_continuity.js');
const globalHistoricalRuntime = require('./79_st2_global_historical_runtime.js');
binanceAg.configure({ concurrency: ayarlar.binanceAgEszamanlilik || 3 });

let donguCalisiyor = false;
let sonOzetLog = 0;
let sonCanliRapor = 0;

async function baslat() {
    console.log('=== [PARA MAKİNESİ AUTOMATION SYSTEM] STARTING ===');
    console.log(`🧩 Versiyon: ${versiyonBilgi.kisaOzet()}`);

    try {
        kaliciHafiza.yukle();
        const safeStartup = require('./74_st2_safe_startup.js');
        safeStartup.verifyOrThrow();
        await piyasa.sembolleriYukle();
        await piyasa.acikPozisyonlariBorsadanDevral();
        accountingContinuity.initializeMigration();
        kaliciHafiza.kaydet('accounting-continuity-migration');
        await revizyon.derinGecmisiInsaEt();

        const historicalRuntimeStatus = globalHistoricalRuntime.activate();
        console.log(`🌍 [GLOBAL HISTORICAL RUNTIME] ${historicalRuntimeStatus.activation} | Coin ${historicalRuntimeStatus.readyCoins}/${historicalRuntimeStatus.coins} | Sinyal ${historicalRuntimeStatus.signals} | Pattern ${historicalRuntimeStatus.patterns} | Mutabakat ${historicalRuntimeStatus.reconciliationOk ? 'OK' : 'BEKLIYOR'}`);

        // v4.0.1: Yeni katmanların gerçekten yüklendiğini düşük maliyetli biçimde doğrula.
        // Ağır DNA/exit geçmişi başlangıçta yeniden hesaplanmaz; kayıtlı modeller kullanılır.
        try {
            const dnaLeague = require('./46_dna_league_engine.js');
            const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
            const premierObservation = require('./48_premier_observation_engine.js');
            const adaptiveLeague = require('./49_adaptive_trading_league.js');
            const labPremier = require('./62_lab_premier_league.js');
            const leagueState = dnaLeague.findPlayer('__HEALTHCHECK__') === null;
            let exitModel = dynamicExit.readModel();
            if (exitModel && (!Array.isArray(exitModel.dnaBase) || exitModel.version !== dynamicExit.VERSION)) {
                console.log(`🧬 [EXIT MODEL MIGRATION] Eski anahtar modeli algılandı (${exitModel.version || 'BILINMIYOR'}). DNA aile eşleştirmesi bir kez yenileniyor...`);
                exitModel = dynamicExit.updateFromReplay();
                console.log(`✅ [EXIT MODEL MIGRATION] ${Number(exitModel?.totalBaseDna || 0)} temel DNA exit profili hazır.`);
            }
            const observation = premierObservation.read();
            const labModel = labPremier.build();
            console.log(`🧩 [LEGACY COMPATIBILITY MEMORY] ${adaptiveLeague.VERSION} | Kimlik/audit uyumluluğu ${leagueState ? 'OK' : 'OK'} | Premier/Shadow yetkisi YOK | Eski observation kapanan ${Number(observation?.closed || 0)}`);
            console.log(`🧩 [LEGACY EXIT COMPATIBILITY] ${labPremier.VERSION} | Eski kayıt ${Number(labModel?.premierCount || 0)} | İleri kayıt ${Number(labModel?.forwardVerifiedCount || 0)} | Exit uyumluluğu ${exitModel ? 'HAZIR' : 'ACTUAL_FALLBACK'} | Yeni Premier yetkisi YOK`);
            console.log('🛡️ [RAM-SAFE] Ağır replay yalnız model eskiyse bir kez, sonrasında kontrollü 25 kapanış aralığında güncellenir.');
            console.log('🧬 [ST2 EXACT-CONTEXT RUNTIME ACTIVE] POZİTİF_CONTEXT=PREMIER | NEGATİF/BİLİNMEYEN=SHADOW | SHADOW_N3_TERFİ=AKTİF | LEGACY=COMPATIBILITY_ONLY | GERÇEK=FAIL_CLOSED');
        } catch (err) {
            console.error(`❌ [ADAPTIVE LEAGUE STARTUP HATASI] ${err.message}`);
        }

        const emirModu = ayarlar.sanalEmirModu ? 'SANAL EMİR MODU' : 'BINANCE EMİR MODU';
        const baslangicMesaji = `🚀 <b>PARA MAKİNESİ BOTU AKTİF</b>\n\n` +
            `🧪 Emir Modu: ${emirModu}\n` +
            `🧩 Versiyon: ${versiyonBilgi.telegramOzet()}\n` +
            `📊 Strateji: ${ayarlar.renkoOnayPeriyodu || '1m'} Renko SuperTrend onayı + ${ayarlar.renkoKaynakPeriyodu || ayarlar.pusuPeriyodu} Renko pusu + canlı fiyat tetik\n` +
            `📡 İzlenen Sembol: ${h.state.semboller.length}\n` +
            `🧠 Geri Yüklenen Pozisyon: ${h.state.aktifPozisyonlar.length}\n` +
            `🧬 Sanal öğrenme: Renko exact-context Premier/Shadow\n` +
            `🏆 Tarihsel pozitif exact-context: Premier sanal işlem\n` +
            `👻 Negatif veya bilinmeyen exact-context: Shadow sanal öğrenme\n` +
            `🔄 Shadow terfisi: bağımsız tamamlanmış N3 blok + Net>0 + PF≥1.30 + Exp>0 + en az 2/3 kazanım\n` +
            `🔒 Gerçek emir: fail-closed\n` +
            `🛡️ Binance minimumu karşılanmazsa emir güvenle atlanır.\n` +
            `🗃️ Eski muhasebe/başarı sayıları korunuyor; açılış ekranında gizlendi.\n\n` +
            `<i>Sistem kapanmış mumları izliyor, pusu kuruyor ve sniper tetik bekliyor...</i>`;

        const fs = require('fs');
        const path = require('path');
        const startupStampFile = path.join(process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data'), 'st2-startup-telegram.json');
        let startupLastSentAt = 0;
        try { startupLastSentAt = Number(JSON.parse(fs.readFileSync(startupStampFile, 'utf8'))?.lastSentAt || 0); } catch (_) {}
        const startupCooldownMs = 10 * 60 * 1000;
        if (Date.now() - startupLastSentAt >= startupCooldownMs) {
            await h.telegramMesajGonder(baslangicMesaji);
            try { fs.mkdirSync(path.dirname(startupStampFile), { recursive: true }); fs.writeFileSync(startupStampFile, JSON.stringify({ lastSentAt: Date.now(), version: versiyonBilgi.botSurumu }, null, 2)); } catch (e) { console.error(`⚠️ [ST2 STARTUP TELEGRAM STAMP] ${e.message}`); }
        } else {
            console.log(`⏭️ [ST2 STARTUP TELEGRAM] Tekrar başlangıç mesajı bastırıldı | Son gönderim ${new Date(startupLastSentAt).toISOString()}`);
        }
        await rapor.raporGonder(true);
        console.log(`✅ SİSTEM HAZIR. DÖNGÜ BAŞLATILDI. Emir Modu: ${emirModu}`);

        setInterval(async () => {
            if (donguCalisiyor) return;
            if (Date.now() < h.state.cooldownBitis) return;

            donguCalisiyor = true;
            try {
                const fiyatlar = await binanceAg.binanceFiyatlariCek({ timeoutMs: ayarlar.binanceAgTimeoutMs || 15000, retries: ayarlar.binanceAgRetry ?? 2, baseDelayMs: ayarlar.binanceAgRetryTabanMs || 900, label: 'FUTURES_PRICES' });
                for (const [sym, price] of Object.entries(fiyatlar)) {
                    h.state.canliFiyatlar[sym] = parseFloat(price);
                }

                if (ayarlar.entryStrategyMode === 'ST2_RENKO') {
                    await require('./72_st2_renko_entry.js').taraVeDegerlendir();
                } else {
                    await p.piyasayiTaraVePusuKur();
                    await p.pusulariDenetleVeIslemAc();
                }
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
                    if (ayarlar.entryStrategyMode !== 'ST2_RENKO' && blackbox.istatistikDakikaRaporGerekli && blackbox.istatistikDakikaRaporGerekli()) {
                        await h.telegramMesajGonder(blackbox.telegramIstatistikRaporMetni());
                        kaliciHafiza.kaydet('blackbox-dakika-istatistik-raporu-gonderildi');
                    }
                } catch (err) {
                    console.error(`⚠️ [BLACKBOX DAKİKA RAPOR HATASI] ${err.message}`);
                }

                if (now - sonOzetLog > 30000) {
                    sonOzetLog = now;
                    const agDurum = binanceAg.durumOzeti({ reset: true });
                    console.log(`💓 [BOT AKTİF] Sembol: ${h.state.semboller.length} | Pusu: ${Object.keys(ayarlar.entryStrategyMode === 'ST2_RENKO' ? (h.state.st2Renko?.pusular || {}) : h.state.pusuListesi).length} | Pozisyon: ${h.state.aktifPozisyonlar.length} | ST Güncelleme: ${h.state.sonSniperGuncellemeZamani ? new Date(h.state.sonSniperGuncellemeZamani).toLocaleTimeString() : 'yok'} | Ağ: OK ${agDurum.succeeded}, Hata ${agDurum.failed}, Retry ${agDurum.retried}, Birleşen ${agDurum.deduped}, Kuyruk ${agDurum.queuedNow}`);
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
