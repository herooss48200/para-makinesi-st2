require('dotenv').config();
const h = require('./1_hafiza.js');
const p = require('./4_pozisyon.js');
const piyasa = require('./3_piyasa.js');
const revizyon = require('./revizyon.js');
const ayarlar = require('./ayarlar.js');
const rapor = require('./2_rapor.js');
const versiyonBilgi = require('./versiyon.js');

let donguCalisiyor = false;
let sonOzetLog = 0;
let sonCanliRapor = 0;

async function baslat() {
    console.log('=== [PARA MAKİNESİ AUTOMATION SYSTEM] STARTING ===');
    console.log(`🧩 Versiyon: ${versiyonBilgi.kisaOzet()}`);

    try {
        await piyasa.sembolleriYukle();
        await piyasa.acikPozisyonlariBorsadanDevral();
        await revizyon.derinGecmisiInsaEt();

        const s = h.state.basariOzeti;
        const emirModu = ayarlar.sanalEmirModu ? 'SANAL EMİR MODU' : 'BINANCE EMİR MODU';
        const baslangicMesaji = `🚀 <b>PARA MAKİNESİ BOTU AKTİF</b>\n\n` +
            `🧪 Emir Modu: ${emirModu}\n` +
            `🧩 Versiyon: ${versiyonBilgi.telegramOzet()}\n` +
            `📊 Strateji: ${ayarlar.pusuPeriyodu} pusu + ${ayarlar.sniperPeriyodu} sniper\n` +
            `📡 İzlenen Sembol: ${h.state.semboller.length}\n` +
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
