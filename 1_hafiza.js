require('dotenv').config();
const Binance = require('binance-api-node').default;
const https = require('https');
const ayarlar = require('./ayarlar.js');

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    baseURL: process.env.BINANCE_BASE_URL || 'https://testnet.binancefuture.com'
});

const state = {
    semboller: [],
    basamaklar: {},
    canliFiyatlar: {},
    yerelPusuHafizasi: {},
    pusuListesi: {},
    st2Renko: { seriler: {}, onaySerileri1m: {}, pusular: {}, sonIslenenTugla: {}, boxSize: {}, onayBoxSize1m: {}, audit: null },
    aktifPozisyonlar: [],
    alinanlar: [],
    aktifShortlar: [],
    sniperSuperTrend: {},
    sniperMumlar: {},
    sniperCanliMumlar: {},
    sniperSuperTrendCanli: {},
    trendSuperTrend: {},
    trendMumlar: {},
    trendCanliMumlar: {},
    trendSuperTrendCanli: {},
    sniperBollinger: {},
    sonPusuMumZamani: {},
    sonPusuTaramaZamani: 0,
    sonSniperGuncellemeZamani: 0,
    sonTrendGuncellemeZamani: 0,
    sonDurumLoglari: {},
    cooldownBitis: 0,
    canliRaporMesajlari: {},
    canliRaporSonGonderimZamani: {},
    sonCanliRaporMetni: '',
    gunlukLimitTarihi: new Date().toISOString().slice(0, 10),
    gunlukAcilanEmirSayisi: 0,
    basariOzeti: {
        tp: 0,
        sl: 0,
        be: 0,
        longTp: 0,
        longSl: 0,
        longBe: 0,
        shortTp: 0,
        shortSl: 0,
        shortBe: 0,
        toplamAcilanEmir: 0,
        toplamHacim: 0,
        toplamKomisyon: 0,
        netKarZarar: 0
    },
    analizOzeti: {
        surum: '2.1.14.2',
        sonGuncelleme: new Date().toISOString(),
        long: { acilan: 0, kalite: { A: 0, B: 0, C: 0, D: 0, YOK: 0 }, tp: 0, sl: 0, be: 0, netKarZarar: 0, toplamKomisyon: 0 },
        short: { acilan: 0, kalite: { A: 0, B: 0, C: 0, D: 0, YOK: 0 }, tp: 0, sl: 0, be: 0, netKarZarar: 0, toplamKomisyon: 0 },
        son10Islem: []
    },
    sanalEmirSayaci: 1,
    executionOzet: null,
    restartGapOzet: null,
    accountingContinuity: null
};

const TELEGRAM_CHAT_IDS = (process.env.AGROS_ST2_TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const TELEGRAM_TOKEN = process.env.AGROS_ST2_TELEGRAM_TOKEN;

const TELEGRAM_TIMEOUT_MS = Math.max(12000, Number(process.env.AGROS_ST2_TELEGRAM_TIMEOUT_MS || 30000));
const TELEGRAM_RETRY_COUNT = Math.max(0, Math.min(3, Number(process.env.AGROS_ST2_TELEGRAM_RETRY_COUNT || 2)));
const TELEGRAM_MIN_INTERVAL_MS = Math.max(100, Number(process.env.AGROS_ST2_TELEGRAM_MIN_INTERVAL_MS || 400));
let telegramKuyruk = Promise.resolve();
let telegramSonIstekZamani = 0;

function bekle(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function telegramHamIstegiAt(path, veri) {
    return new Promise((resolve) => {
        if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
            resolve({ ok: false, description: 'Telegram bilgileri eksik' });
            return;
        }

        const postData = JSON.stringify(veri);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${TELEGRAM_TOKEN}/${path}`,
            method: 'POST',
            timeout: TELEGRAM_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Connection': 'keep-alive'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (!parsed.ok && res.statusCode >= 500) parsed.transient = true;
                    resolve(parsed);
                } catch (e) {
                    resolve({ ok: false, raw: body, statusCode: res.statusCode, transient: res.statusCode >= 500 });
                }
            });
        });

        req.setTimeout(TELEGRAM_TIMEOUT_MS, () => req.destroy(new Error(`TELEGRAM_TIMEOUT:${TELEGRAM_TIMEOUT_MS}ms`)));
        req.on('error', (err) => resolve({ ok: false, description: err.message, transient: true }));
        req.write(postData);
        req.end();
    });
}

async function telegramDayanikliIstegiAt(path, veri) {
    let son = null;
    for (let deneme = 0; deneme <= TELEGRAM_RETRY_COUNT; deneme++) {
        const gecen = Date.now() - telegramSonIstekZamani;
        if (gecen < TELEGRAM_MIN_INTERVAL_MS) await bekle(TELEGRAM_MIN_INTERVAL_MS - gecen);
        telegramSonIstekZamani = Date.now();
        son = await telegramHamIstegiAt(path, veri);
        if (son?.ok) return son;

        const aciklama = String(son?.description || son?.raw || '');
        const rateLimited = aciklama.includes('Too Many Requests') || Number(son?.error_code) === 429;
        const transient = son?.transient === true || aciklama.includes('TIMEOUT') || aciklama.includes('ECONNRESET') || aciklama.includes('EAI_AGAIN') || rateLimited;
        if (!transient || deneme >= TELEGRAM_RETRY_COUNT) break;
        const retryAfterMs = Math.max(1000, Number(son?.parameters?.retry_after || 0) * 1000, 1000 * (deneme + 1));
        console.log(`⚠️ Telegram geçici hata; yeniden denenecek ${deneme + 1}/${TELEGRAM_RETRY_COUNT} | ${aciklama || 'geçici hata'}`);
        await bekle(retryAfterMs);
    }
    if (!son?.ok) console.error(`❌ Telegram HTTP Hatası: ${son?.description || son?.raw || 'bilinmeyen hata'}`);
    return son || { ok: false, description: 'Telegram yanıtı alınamadı' };
}

function yerelTelegramIstegiAt(path, veri) {
    const is = () => telegramDayanikliIstegiAt(path, veri);
    const sonuc = telegramKuyruk.then(is, is);
    telegramKuyruk = sonuc.catch(() => null);
    return sonuc;
}

function telegramMetniParcala(mesaj, limit = 3900) {
    const text = String(mesaj || '');
    if (text.length <= limit) return [text];

    const satirlar = text.split('\n');
    const parcalar = [];
    let aktif = '';

    for (const satir of satirlar) {
        const eklenecek = aktif ? aktif + '\n' + satir : satir;
        if (eklenecek.length <= limit) {
            aktif = eklenecek;
            continue;
        }
        if (aktif) parcalar.push(aktif);
        if (satir.length <= limit) {
            aktif = satir;
        } else {
            for (let i = 0; i < satir.length; i += limit) {
                parcalar.push(satir.slice(i, i + limit));
            }
            aktif = '';
        }
    }
    if (aktif) parcalar.push(aktif);
    return parcalar;
}

function telegramHtmlTemizle(mesaj) {
    return String(mesaj || '')
        .replace(/<\/?b>/g, '')
        .replace(/<\/?i>/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

async function telegramMesajGonder(mesaj) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
        console.log('⚠️ Telegram bilgileri eksik, mesaj gönderilmedi.');
        return [];
    }

    const sonuclar = [];
    const parcalar = telegramMetniParcala(mesaj);

    for (const chat_id of TELEGRAM_CHAT_IDS) {
        for (let idx = 0; idx < parcalar.length; idx++) {
            const parcaBaslik = parcalar.length > 1 ? `(${idx + 1}/${parcalar.length})\n` : '';
            const text = parcaBaslik + parcalar[idx];
            try {
                let sonuc = await yerelTelegramIstegiAt('sendMessage', {
                    chat_id,
                    text,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });

                // Telegram HTML parse hatası veya uzun mesaj yüzünden kritik kapanış mesajları kaybolmasın.
                // HTML sürümü başarısız olursa aynı parçayı düz metin olarak tekrar gönderiyoruz.
                if (!sonuc || !sonuc.ok) {
                    const aciklama = sonuc?.description || sonuc?.raw || 'bilinmeyen hata';
                    const timeout = String(aciklama).includes('TIMEOUT');
                    if (!timeout) {
                        console.log(`⚠️ Telegram HTML/parse iletim sorunu: ${chat_id} | ${aciklama} | Düz metin bir kez deneniyor.`);
                        sonuc = await yerelTelegramIstegiAt('sendMessage', {
                            chat_id,
                            text: telegramHtmlTemizle(text),
                            disable_web_page_preview: true
                        });
                    } else {
                        console.log(`⚠️ Telegram timeout: ${chat_id} | Aynı mesaj yinelenmedi; sonraki rapor turu bekleniyor.`);
                    }
                }

                sonuclar.push({ chat_id, parca: idx + 1, toplamParca: parcalar.length, sonuc });
                if (!sonuc || !sonuc.ok) {
                    console.log(`⚠️ Telegram iletim sorunu: ${chat_id} | ${sonuc?.description || sonuc?.raw || 'bilinmeyen hata'}`);
                }
            } catch (err) {
                console.error(`❌ Telegram Hatası: ${err.message}`);
                sonuclar.push({ chat_id, parca: idx + 1, toplamParca: parcalar.length, sonuc: { ok: false, description: err.message } });
            }
        }
    }
    return sonuclar;
}

async function telegramMesajDuzenle(chat_id, message_id, mesaj) {
    try {
        return await yerelTelegramIstegiAt('editMessageText', {
            chat_id,
            message_id,
            text: mesaj,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    } catch (err) {
        console.error(`❌ Telegram düzenleme hatası: ${err.message}`);
        return { ok: false, description: err.message };
    }
}

async function telegramMesajSil(chat_id, message_id) {
    try {
        return await yerelTelegramIstegiAt('deleteMessage', { chat_id, message_id });
    } catch (err) {
        console.error(`❌ Telegram silme hatası: ${err.message}`);
        return { ok: false, description: err.message };
    }
}

async function telegramCanliRaporGuncelle(mesaj, oneCikar = false) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return;

    const now = Date.now();
    const yenidenGondermeMs = ayarlar.canliRaporYenidenGondermeMs || 0;

    for (const chat_id of TELEGRAM_CHAT_IDS) {
        const kayitliMesajId = state.canliRaporMesajlari[chat_id];
        const sonGonderim = state.canliRaporSonGonderimZamani[chat_id] || 0;
        const sureDoldu = yenidenGondermeMs > 0 && now - sonGonderim >= yenidenGondermeMs;
        const yeniMesajGonder = oneCikar || !kayitliMesajId || sureDoldu;

        if (!yeniMesajGonder && kayitliMesajId) {
            if (state.sonCanliRaporMetni === mesaj) continue;
            const duzenleme = await telegramMesajDuzenle(chat_id, kayitliMesajId, mesaj);
            if (duzenleme?.ok) continue;
            console.log(`⚠️ Canlı rapor düzenlenemedi, yeni rapor mesajı atılıyor: ${duzenleme?.description || 'bilinmeyen hata'}`);
        }

        // Önce yeni canlı raporu gönder. Telegram geçici hata verirse eski panel ekranda kalsın.
        let gonderim = await yerelTelegramIstegiAt('sendMessage', {
            chat_id,
            text: mesaj,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        // HTML parse sorunu yaşanırsa canlı panel tamamen kaybolmasın; düz metni bir kez dene.
        if (!gonderim?.ok) {
            const aciklama = gonderim?.description || gonderim?.raw || 'bilinmeyen hata';
            console.log(`⚠️ Canlı rapor HTML ile gönderilemedi: ${chat_id} | ${aciklama} | Düz metin deneniyor.`);
            gonderim = await yerelTelegramIstegiAt('sendMessage', {
                chat_id,
                text: telegramHtmlTemizle(mesaj),
                disable_web_page_preview: true
            });
        }

        if (gonderim?.ok && gonderim.result?.message_id) {
            const yeniMesajId = gonderim.result.message_id;
            state.canliRaporMesajlari[chat_id] = yeniMesajId;
            state.canliRaporSonGonderimZamani[chat_id] = now;

            // Yeni panel doğrulandıktan sonra eski paneli temizle.
            if (kayitliMesajId && kayitliMesajId !== yeniMesajId && ayarlar.canliRaporEskiMesajiSil) {
                await telegramMesajSil(chat_id, kayitliMesajId).catch(() => {});
            }
        } else {
            console.log(`⚠️ Canlı rapor gönderilemedi; eski panel korunuyor: ${chat_id} | ${gonderim?.description || gonderim?.raw || 'bilinmeyen hata'}`);
        }
    }

    state.sonCanliRaporMetni = mesaj;
}

module.exports = {
    client,
    state,
    telegramMesajGonder,
    telegramMesajDuzenle,
    telegramMesajSil,
    telegramCanliRaporGuncelle
};
