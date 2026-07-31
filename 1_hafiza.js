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
    sembolEvreniKaniti: null,
    sembolVeriSagligi: { durum: 'BEKLIYOR', istenen: 0, secilen: 0, mumHazir: 0, superTrendHazir: 0, hata: 0, sonGuncelleme: null },
    st2TaramaSagligi: { durum: 'BEKLIYOR', evren: 0, taranan: 0, veriEksik: 0, sureMs: 0, sonTamamlanma: null },
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
const { execFile } = require('child_process');

const TELEGRAM_TIMEOUT_MS = Math.max(8000, Number(process.env.AGROS_ST2_TELEGRAM_TIMEOUT_MS || 15000));
const TELEGRAM_RETRY_COUNT = Math.max(0, Math.min(3, Number(process.env.AGROS_ST2_TELEGRAM_RETRY_COUNT || 2)));
const TELEGRAM_MIN_INTERVAL_MS = Math.max(80, Number(process.env.AGROS_ST2_TELEGRAM_MIN_INTERVAL_MS || 180));
const telegramHttpsAgent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 4, maxFreeSockets: 2 });
const telegramIsKuyruklari = { critical: [], panel: [], detail: [] };
const telegramKuyrukLimitleri = { critical: 100, panel: 4, detail: 8 };
let telegramKritikWorkerCalisiyor = false;
let telegramBulkWorkerCalisiyor = false;
const telegramSonIstekZamani = { critical: 0, bulk: 0 };
let telegramNativeBypassUntil = 0;
const TELEGRAM_NATIVE_BYPASS_MS = Math.max(60000, Number(process.env.AGROS_ST2_TELEGRAM_NATIVE_BYPASS_MS || 600000));
const telegramStats = {
    enqueued: { critical: 0, panel: 0, detail: 0 },
    delivered: { critical: 0, panel: 0, detail: 0 },
    failed: { critical: 0, panel: 0, detail: 0 },
    dropped: { critical: 0, panel: 0, detail: 0 },
    nativeFailed: 0,
    curlFallbackOk: 0,
    curlFallbackFailed: 0,
    nativeBypassed: 0,
    lastDeliveryAt: null,
    lastError: null
};

function bekle(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function telegramOncelik(options = {}) {
    const p = String(options.priority || 'critical').toLowerCase();
    return p === 'detail' || p === 'panel' ? p : 'critical';
}
function telegramKuyrukOzeti() {
    return {
        critical: telegramIsKuyruklari.critical.length,
        panel: telegramIsKuyruklari.panel.length,
        detail: telegramIsKuyruklari.detail.length,
        worker: { critical: telegramKritikWorkerCalisiyor, bulk: telegramBulkWorkerCalisiyor },
        nativeBypassUntil: telegramNativeBypassUntil || null,
        ...JSON.parse(JSON.stringify(telegramStats))
    };
}
function telegramSiradakiIs(lane) {
    if (lane === 'critical') return telegramIsKuyruklari.critical.shift() || null;
    if (telegramIsKuyruklari.panel.length) return telegramIsKuyruklari.panel.shift();
    if (telegramIsKuyruklari.detail.length) return telegramIsKuyruklari.detail.shift();
    return null;
}
function telegramKuyrugaEkle(job) {
    const priority = telegramOncelik(job.options);
    const queue = telegramIsKuyruklari[priority];
    const coalesceKey = job.options?.coalesceKey;
    if (coalesceKey) {
        const oldIndex = queue.findIndex(x => x.options?.coalesceKey === coalesceKey);
        if (oldIndex >= 0) {
            const [old] = queue.splice(oldIndex, 1);
            telegramStats.dropped[priority]++;
            old.resolve({ ok: false, coalesced: true, description: 'Daha güncel Telegram işiyle birleştirildi' });
        }
    }
    const limit = telegramKuyrukLimitleri[priority];
    if (queue.length >= limit) {
        if (priority === 'critical') {
            const old = queue.shift();
            telegramStats.dropped.critical++;
            old.resolve({ ok: false, dropped: true, description: 'Kritik Telegram kuyruk sınırı aşıldı' });
        } else {
            const old = queue.shift();
            telegramStats.dropped[priority]++;
            old.resolve({ ok: false, dropped: true, description: `${priority} Telegram işi güncel iş için düşürüldü` });
        }
    }
    queue.push(job);
    telegramStats.enqueued[priority]++;
    telegramWorkerBaslat(priority === 'critical' ? 'critical' : 'bulk');
}
async function telegramWorkerBaslat(lane) {
    if (lane === 'critical') {
        if (telegramKritikWorkerCalisiyor) return;
        telegramKritikWorkerCalisiyor = true;
    } else {
        if (telegramBulkWorkerCalisiyor) return;
        telegramBulkWorkerCalisiyor = true;
    }
    try {
        while (true) {
            const job = telegramSiradakiIs(lane);
            if (!job) break;
            const priority = telegramOncelik(job.options);
            try {
                const sonuc = await telegramDayanikliIstegiAt(job.path, job.veri, { ...job.options, _insideWorker: true });
                if (sonuc?.ok) {
                    telegramStats.delivered[priority]++;
                    telegramStats.lastDeliveryAt = new Date().toISOString();
                } else {
                    telegramStats.failed[priority]++;
                    telegramStats.lastError = sonuc?.description || sonuc?.raw || 'Telegram teslim doğrulanmadı';
                }
                job.resolve(sonuc);
            } catch (err) {
                telegramStats.failed[priority]++;
                telegramStats.lastError = err.message;
                job.resolve({ ok: false, description: err.message });
            }
        }
    } finally {
        if (lane === 'critical') {
            telegramKritikWorkerCalisiyor = false;
            if (telegramIsKuyruklari.critical.length) telegramWorkerBaslat('critical');
        } else {
            telegramBulkWorkerCalisiyor = false;
            if (telegramIsKuyruklari.panel.length || telegramIsKuyruklari.detail.length) telegramWorkerBaslat('bulk');
        }
    }
}

function telegramNativeIstegiAt(apiPath, veri, options = {}) {
    return new Promise((resolve) => {
        if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
            resolve({ ok: false, description: 'Telegram bilgileri eksik' });
            return;
        }
        const postData = JSON.stringify(veri);
        const timeoutMs = Math.max(2500, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS));
        const requestOptions = {
            hostname: 'api.telegram.org', port: 443,
            path: `/bot${TELEGRAM_TOKEN}/${apiPath}`,
            method: 'POST', timeout: timeoutMs, family: 4,
            agent: telegramHttpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Connection': 'keep-alive'
            }
        };
        const req = https.request(requestOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (!parsed.ok && res.statusCode >= 500) parsed.transient = true;
                    resolve(parsed);
                } catch (_) {
                    resolve({ ok: false, raw: body, statusCode: res.statusCode, transient: res.statusCode >= 500 });
                }
            });
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`TELEGRAM_TIMEOUT:${timeoutMs}ms`)));
        req.on('error', err => resolve({ ok: false, description: err.message, transient: true, transport: 'NATIVE_IPV4' }));
        req.write(postData);
        req.end();
    });
}

function telegramCurlIstegiAt(apiPath, veri, options = {}) {
    return new Promise((resolve) => {
        if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
            resolve({ ok: false, description: 'Telegram bilgileri eksik' });
            return;
        }
        const timeoutMs = Math.max(2500, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS));
        const timeoutSeconds = Math.max(3, Math.ceil(timeoutMs / 1000));
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${apiPath}`;
        const args = ['-4', '-sS', '--connect-timeout', '3', '--max-time', String(timeoutSeconds), '-X', 'POST', url, '-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(veri)];
        execFile('curl', args, { timeout: timeoutMs + 1500, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                const aciklama = String(err.message || err);
                resolve({
                    ok: false,
                    description: `CURL_FALLBACK:${aciklama}`,
                    raw: String(stderr || ''),
                    transient: true,
                    transport: 'CURL_IPV4',
                    ambiguousDelivery: /TIMEOUT|TIMED OUT|ETIMEDOUT/i.test(aciklama)
                });
                return;
            }
            const raw = String(stdout || '').trim();
            if (!raw) {
                resolve({ ok: false, description: 'CURL_EMPTY_RESPONSE', raw: String(stderr || ''), transient: true, transport: 'CURL_IPV4' });
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                parsed.transport = 'CURL_IPV4';
                resolve(parsed);
            } catch (_) {
                resolve({ ok: false, description: 'CURL_INVALID_JSON_RESPONSE', raw: raw.slice(0, 500), transient: true, transport: 'CURL_IPV4' });
            }
        });
    });
}

async function telegramTekDeneme(apiPath, veri, options = {}) {
    const priority = telegramOncelik(options);
    const nativeTimeout = priority === 'critical'
        ? Math.min(2500, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS))
        : Math.min(4000, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS));

    // Tekil kritik bildirimlerde (startup/pusu) yalnız bir taşıma denemesi yapılır.
    // Native timeout sonrası curl fallback aynı Telegram mesajını iki kez teslim edebildiği için
    // preferCurl+atMostOnce hattı doğrudan curl kullanır; retry/fallback yapmaz.
    if (options.preferCurl === true) {
        const curlDirect = await telegramCurlIstegiAt(apiPath, veri, options);
        if (curlDirect?.ok) {
            telegramStats.curlFallbackOk++;
            telegramNativeBypassUntil = Date.now() + TELEGRAM_NATIVE_BYPASS_MS;
            return { ...curlDirect, singleDelivery: true };
        }
        telegramStats.curlFallbackFailed++;
        if (options.atMostOnce === true) return { ...curlDirect, singleDelivery: true };
    }

    // AWS yolunda Native HTTPS ardışık biçimde başarısızsa her mesajı aynı timeout'a sokma.
    // Curl IPv4 doğrulandıktan sonra süreli devre kesici aktif olur; süre bitince Native tekrar denenir.
    if (Date.now() < telegramNativeBypassUntil) {
        telegramStats.nativeBypassed++;
        const curlDirect = await telegramCurlIstegiAt(apiPath, veri, options);
        if (curlDirect?.ok) {
            telegramStats.curlFallbackOk++;
            return curlDirect;
        }
        telegramStats.curlFallbackFailed++;
        const nativeEmergency = await telegramNativeIstegiAt(apiPath, veri, { ...options, timeoutMs: nativeTimeout });
        if (nativeEmergency?.ok) {
            telegramNativeBypassUntil = 0;
            return { ...nativeEmergency, transport: 'NATIVE_IPV4_EMERGENCY' };
        }
        telegramStats.nativeFailed++;
        return curlDirect || nativeEmergency;
    }

    const native = await telegramNativeIstegiAt(apiPath, veri, { ...options, timeoutMs: nativeTimeout });
    if (native?.ok) {
        telegramNativeBypassUntil = 0;
        return { ...native, transport: 'NATIVE_IPV4' };
    }
    telegramStats.nativeFailed++;
    const curl = await telegramCurlIstegiAt(apiPath, veri, options);
    if (curl?.ok) {
        telegramStats.curlFallbackOk++;
        telegramNativeBypassUntil = Date.now() + TELEGRAM_NATIVE_BYPASS_MS;
        console.log(`✅ [TELEGRAM TRANSPORT] ${priority} Native IPv4 başarısız; curl IPv4 fallback doğrulandı. Native devre kesici ${Math.round(TELEGRAM_NATIVE_BYPASS_MS / 60000)} dk aktif.`);
        return curl;
    }
    telegramStats.curlFallbackFailed++;
    return curl || native;
}

async function telegramDayanikliIstegiAt(apiPath, veri, options = {}) {
    let son = null;
    const priority = telegramOncelik(options);
    const defaultRetry = priority === 'critical' ? TELEGRAM_RETRY_COUNT : 0;
    const retryCount = Math.max(0, Math.min(2, Number.isFinite(Number(options.retryCount)) ? Number(options.retryCount) : defaultRetry));
    for (let deneme = 0; deneme <= retryCount; deneme++) {
        const lane = priority === 'critical' ? 'critical' : 'bulk';
        const gecen = Date.now() - telegramSonIstekZamani[lane];
        if (gecen < TELEGRAM_MIN_INTERVAL_MS) await bekle(TELEGRAM_MIN_INTERVAL_MS - gecen);
        telegramSonIstekZamani[lane] = Date.now();
        son = await telegramTekDeneme(apiPath, veri, { ...options, priority });
        if (son?.ok) return son;
        const aciklama = String(son?.description || son?.raw || '');
        const rateLimited = aciklama.includes('Too Many Requests') || Number(son?.error_code) === 429;
        const transient = son?.transient === true || /TIMEOUT|ECONNRESET|EAI_AGAIN|CURL_FALLBACK/i.test(aciklama) || rateLimited;
        if (!transient || deneme >= retryCount) break;
        const retryAfterMs = Math.max(500, Number(son?.parameters?.retry_after || 0) * 1000, 500 * (deneme + 1));
        console.log(`⚠️ Telegram kritik geçici hata; yeniden denenecek ${deneme + 1}/${retryCount} | ${aciklama || 'geçici hata'}`);
        await bekle(retryAfterMs);
    }
    if (!son?.ok) console.error(`❌ Telegram HTTP Hatası: ${son?.description || son?.raw || 'bilinmeyen hata'}`);
    return son || { ok: false, description: 'Telegram yanıtı alınamadı' };
}

function yerelTelegramIstegiAt(apiPath, veri, options = {}) {
    return new Promise(resolve => telegramKuyrugaEkle({ path: apiPath, veri, options, resolve }));
}

function telegramMetniParcala(mesaj, limit = 3900) {
    const text = String(mesaj || '');
    if (text.length <= limit) return [text];
    const satirlar = text.split('\n');
    const parcalar = [];
    let aktif = '';
    for (const satir of satirlar) {
        const eklenecek = aktif ? aktif + '\n' + satir : satir;
        if (eklenecek.length <= limit) { aktif = eklenecek; continue; }
        if (aktif) parcalar.push(aktif);
        if (satir.length <= limit) aktif = satir;
        else {
            for (let i = 0; i < satir.length; i += limit) parcalar.push(satir.slice(i, i + limit));
            aktif = '';
        }
    }
    if (aktif) parcalar.push(aktif);
    return parcalar;
}
function telegramHtmlTemizle(mesaj) {
    return String(mesaj || '').replace(/<\/?b>/g, '').replace(/<\/?i>/g, '').replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function telegramMinimalModuAktif() {
    return ayarlar.telegramMinimalOperasyonModu === true;
}

function telegramTekMesajLimiti() {
    return Math.max(1200, Math.min(3500, Number(ayarlar.telegramMesajMaxKarakter || 3400)));
}

function telegramMetniTekMesajaIndir(mesaj, limit = telegramTekMesajLimiti()) {
    const temiz = telegramHtmlTemizle(mesaj)
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (temiz.length <= limit) return temiz;

    const dipnot = '\n\nℹ️ Ayrıntılı bilimsel kayıt loglarda tutuluyor.';
    const hedef = Math.max(200, limit - dipnot.length);
    const satirlar = temiz.split('\n');
    const secilen = [];
    let toplam = 0;
    for (const satir of satirlar) {
        const aday = toplam + (secilen.length ? 1 : 0) + satir.length;
        if (aday > hedef) break;
        secilen.push(satir);
        toplam = aday;
    }
    if (!secilen.length) secilen.push(temiz.slice(0, hedef));
    return (secilen.join('\n').trimEnd() + dipnot).slice(0, limit);
}

function telegramGonderimHazirla(mesaj) {
    if (telegramMinimalModuAktif()) {
        return { text: telegramMetniTekMesajaIndir(mesaj), parseMode: null };
    }
    return { text: String(mesaj || ''), parseMode: 'HTML' };
}

async function telegramMesajGonder(mesaj, options = {}) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
        console.log('⚠️ Telegram bilgileri eksik, mesaj gönderilmedi.');
        return [];
    }
    const priority = telegramOncelik(options);
    const sonuclar = [];
    const hazir = telegramGonderimHazirla(mesaj);
    const parcalar = telegramMinimalModuAktif() ? [hazir.text] : telegramMetniParcala(hazir.text);
    for (const chat_id of TELEGRAM_CHAT_IDS) {
        for (let idx = 0; idx < parcalar.length; idx++) {
            const parcaBaslik = parcalar.length > 1 ? `(${idx + 1}/${parcalar.length})\n` : '';
            const text = parcaBaslik + parcalar[idx];
            try {
                const payload = { chat_id, text, disable_web_page_preview: true };
                if (hazir.parseMode) payload.parse_mode = hazir.parseMode;
                let sonuc = await yerelTelegramIstegiAt('sendMessage', payload,
                    { ...options, priority, coalesceKey: options.coalesceKey ? `${options.coalesceKey}:${chat_id}:${idx}` : undefined });
                if (!telegramMinimalModuAktif() && !sonuc?.ok && !sonuc?.coalesced && !sonuc?.dropped && options.atMostOnce !== true) {
                    const aciklama = sonuc?.description || sonuc?.raw || 'bilinmeyen hata';
                    if (!/TIMEOUT/i.test(String(aciklama))) {
                        sonuc = await yerelTelegramIstegiAt('sendMessage', {
                            chat_id, text: telegramHtmlTemizle(text), disable_web_page_preview: true
                        }, { ...options, priority });
                    }
                }
                sonuclar.push({ chat_id, parca: idx + 1, toplamParca: parcalar.length, sonuc });
            } catch (err) {
                sonuclar.push({ chat_id, parca: idx + 1, toplamParca: parcalar.length, sonuc: { ok: false, description: err.message } });
            }
        }
    }
    return sonuclar;
}
async function telegramMesajGonderHizli(mesaj) {
    return telegramMesajGonder(mesaj, { timeoutMs: 5000, retryCount: 0, priority: 'critical' });
}
async function telegramMesajGonderTekil(mesaj, options = {}) {
    return telegramMesajGonder(mesaj, {
        ...options,
        timeoutMs: Math.max(8000, Number(options.timeoutMs || 12000)),
        retryCount: 0,
        priority: 'critical',
        preferCurl: true,
        atMostOnce: true
    });
}

// Açılış gibi mutlaka görünmesi gereken kritik bildirimler için teslim-öncelikli hat.
// Tekil pusu hattı at-most-once kalır; startup ise Native IPv4 -> curl IPv4 fallback
// ve kontrollü retry kullanır. Böylece geçici Telegram/AWS ağ kesintisinde mesaj kaybolmaz.
async function telegramMesajGonderKritikTeslim(mesaj, options = {}) {
    return telegramMesajGonder(mesaj, {
        ...options,
        timeoutMs: Math.max(12000, Number(options.timeoutMs || 18000)),
        retryCount: Math.max(1, Math.min(3, Number(options.retryCount ?? TELEGRAM_RETRY_COUNT))),
        priority: 'critical',
        preferCurl: false,
        atMostOnce: false
    });
}
async function telegramMesajDuzenle(chat_id, message_id, mesaj, options = {}) {
    try {
        const hazir = telegramGonderimHazirla(mesaj);
        const payload = { chat_id, message_id, text: hazir.text, disable_web_page_preview: true };
        if (hazir.parseMode) payload.parse_mode = hazir.parseMode;
        return await yerelTelegramIstegiAt('editMessageText', payload,
            { ...options, priority: options.priority || 'panel', coalesceKey: options.coalesceKey || `panel-edit:${chat_id}` });
    } catch (err) {
        return { ok: false, description: err.message };
    }
}
async function telegramMesajSil(chat_id, message_id, options = {}) {
    try { return await yerelTelegramIstegiAt('deleteMessage', { chat_id, message_id }, { ...options, priority: options.priority || 'panel' }); }
    catch (err) { return { ok: false, description: err.message }; }
}
async function telegramCanliRaporGuncelle(mesaj, oneCikar = false) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return;
    const now = Date.now();
    const hazir = telegramGonderimHazirla(mesaj);
    const guvenliMesaj = hazir.text;
    const yenidenGondermeMs = ayarlar.canliRaporYenidenGondermeMs || 0;
    for (const chat_id of TELEGRAM_CHAT_IDS) {
        const kayitliMesajId = state.canliRaporMesajlari[chat_id];
        const sonGonderim = state.canliRaporSonGonderimZamani[chat_id] || 0;
        const sureDoldu = yenidenGondermeMs > 0 && now - sonGonderim >= yenidenGondermeMs;
        const yeniMesajGonder = oneCikar || !kayitliMesajId || sureDoldu;
        if (!yeniMesajGonder && kayitliMesajId) {
            if (state.sonCanliRaporMetni === guvenliMesaj) continue;
            const duzenleme = await telegramMesajDuzenle(chat_id, kayitliMesajId, guvenliMesaj, { priority: 'panel', coalesceKey: `live-panel:${chat_id}` });
            if (duzenleme?.ok || duzenleme?.coalesced) continue;
        }
        const payload = { chat_id, text: guvenliMesaj, disable_web_page_preview: true };
        if (hazir.parseMode) payload.parse_mode = hazir.parseMode;
        let gonderim = await yerelTelegramIstegiAt('sendMessage', payload,
            { priority: 'panel', retryCount: 0, coalesceKey: `live-panel:${chat_id}` });
        if (!telegramMinimalModuAktif() && !gonderim?.ok && !gonderim?.coalesced && !gonderim?.dropped) {
            gonderim = await yerelTelegramIstegiAt('sendMessage', {
                chat_id, text: telegramHtmlTemizle(guvenliMesaj), disable_web_page_preview: true
            }, { priority: 'panel', retryCount: 0, coalesceKey: `live-panel-plain:${chat_id}` });
        }
        if (gonderim?.ok && gonderim.result?.message_id) {
            const yeniMesajId = gonderim.result.message_id;
            state.canliRaporMesajlari[chat_id] = yeniMesajId;
            state.canliRaporSonGonderimZamani[chat_id] = now;
            if (kayitliMesajId && kayitliMesajId !== yeniMesajId && ayarlar.canliRaporEskiMesajiSil) {
                await telegramMesajSil(chat_id, kayitliMesajId, { priority: 'panel' }).catch(() => {});
            }
        }
    }
    state.sonCanliRaporMetni = guvenliMesaj;
}

module.exports = {
    client,
    state,
    telegramMesajGonder,
    telegramMesajGonderHizli,
    telegramMesajGonderTekil,
    telegramMesajGonderKritikTeslim,
    telegramMesajDuzenle,
    telegramMesajSil,
    telegramCanliRaporGuncelle,
    telegramKuyrukOzeti,
    telegramMinimalModuAktif,
    telegramTekMesajLimiti,
    telegramMetniTekMesajaIndir
};
