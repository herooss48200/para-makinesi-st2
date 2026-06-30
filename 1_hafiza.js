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
    aktifPozisyonlar: [],
    alinanlar: [],
    aktifShortlar: [],
    sniperSuperTrend: {},
    sniperMumlar: {},
    sniperBollinger: {},
    sonPusuMumZamani: {},
    sonPusuTaramaZamani: 0,
    sonSniperGuncellemeZamani: 0,
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
    sanalEmirSayaci: 1
};

const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

function yerelTelegramIstegiAt(path, veri) {
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
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ ok: false, raw: body });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`❌ Telegram HTTP Hatası: ${err.message}`);
            resolve({ ok: false, description: err.message });
        });

        req.write(postData);
        req.end();
    });
}

async function telegramMesajGonder(mesaj) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
        console.log('⚠️ Telegram bilgileri eksik, mesaj gönderilmedi.');
        return [];
    }

    const sonuclar = [];
    for (const chat_id of TELEGRAM_CHAT_IDS) {
        try {
            const sonuc = await yerelTelegramIstegiAt('sendMessage', {
                chat_id,
                text: mesaj,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            sonuclar.push({ chat_id, sonuc });
            if (!sonuc || !sonuc.ok) {
                console.log(`⚠️ Telegram iletim sorunu: ${chat_id} | ${sonuc?.description || 'bilinmeyen hata'}`);
            }
        } catch (err) {
            console.error(`❌ Telegram Hatası: ${err.message}`);
            sonuclar.push({ chat_id, sonuc: { ok: false, description: err.message } });
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

        if (kayitliMesajId && ayarlar.canliRaporEskiMesajiSil) {
            await telegramMesajSil(chat_id, kayitliMesajId).catch(() => {});
        }

        const gonderim = await yerelTelegramIstegiAt('sendMessage', {
            chat_id,
            text: mesaj,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        if (gonderim?.ok && gonderim.result?.message_id) {
            state.canliRaporMesajlari[chat_id] = gonderim.result.message_id;
            state.canliRaporSonGonderimZamani[chat_id] = now;
        } else {
            console.log(`⚠️ Canlı rapor gönderilemedi: ${chat_id} | ${gonderim?.description || 'bilinmeyen hata'}`);
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
