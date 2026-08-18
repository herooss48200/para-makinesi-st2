require('dotenv').config();
const Binance = require('binance-api-node').default;
const https = require('https');
const ayarlar = require('./ayarlar.js');
const binanceEndpointAuthority = require('./86_st2_binance_endpoint_authority.js');
const binanceTimeAuthorityFactory = require('./87_st2_binance_time_authority.js');

const binanceEndpoint = binanceEndpointAuthority.resolve();
const binanceTimeAuthority = binanceTimeAuthorityFactory.create({
    baseUrl: binanceEndpoint.httpFutures,
    syncIntervalMs: Number(ayarlar.binanceTimeSyncIntervalMs || 300000),
    maxAgeMs: Number(ayarlar.binanceTimeMaxAgeMs || 600000),
    timeoutMs: Number(ayarlar.binanceTimeSyncTimeoutMs || 5000),
    samples: Number(ayarlar.binanceTimeSyncSamples || 3)
});
const client = Binance(binanceEndpointAuthority.clientOptions(
    process.env.BINANCE_API_KEY,
    process.env.BINANCE_API_SECRET,
    {
        getTime: () => binanceTimeAuthority.now(),
        recvWindow: Number(ayarlar.binanceSignedRecvWindowMs || 15000)
    }
));
const SIGNED_FUTURES_METHODS = [
    'futuresPositionRisk', 'futuresMarginType', 'futuresLeverage',
    'futuresOpenOrders', 'futuresOrder', 'futuresGetOrder', 'futuresAllOrders',
    'futuresCancelOrder', 'futuresGetOpenAlgoOrders', 'futuresGetAlgoOrder',
    'futuresCreateAlgoOrder', 'futuresCancelAlgoOrder', 'futuresUserTrades'
];
binanceTimeAuthority.wrapClient(client, SIGNED_FUTURES_METHODS, { recvWindow: Number(ayarlar.binanceSignedRecvWindowMs || 15000) });

const state = {
    semboller: [],
    sembolEvreniKaniti: null,
    sembolVeriSagligi: { durum: 'BEKLIYOR', istenen: 0, secilen: 0, mumHazir: 0, superTrendHazir: 0, mumSonTurGuncellenen: 0, superTrendSonTurGuncellenen: 0, pusuTazelemeCalisiyor: false, superTrendTazelemeCalisiyor: false, hata: 0, sonGuncelleme: null },
    st2TaramaSagligi: { durum: 'BEKLIYOR', evren: 0, taranan: 0, veriEksik: 0, sureMs: 0, sonTamamlanma: null },
    startupMarketReady: false,
    startupMarketWarmup: { durum: 'BEKLIYOR', baslangic: null, tamamlanma: null, pusuHazir: 0, trendHazir: 0, oran: 0, hata: 0 },
    basamaklar: {},
    canliFiyatlar: {},
    canliFiyatMeta: {},
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
    canliRaporSonTeslimZamani: {},
    sonCanliRaporMetni: '',
    // v6.13.5-R10: Canlı panel metni yalnız gerçekten teslim edilen chat için ilerletilir.
    canliRaporSonMetinleri: {},
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
    manualCloseLocks: {}
};

const TELEGRAM_CHAT_IDS = (process.env.AGROS_ST2_TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
const TELEGRAM_TOKEN = process.env.AGROS_ST2_TELEGRAM_TOKEN;
const { execFile } = require('child_process');

const TELEGRAM_TIMEOUT_MS = Math.max(5000, Number(process.env.AGROS_ST2_TELEGRAM_TIMEOUT_MS || 12000));
const TELEGRAM_RETRY_COUNT = Math.max(0, Math.min(2, Number(process.env.AGROS_ST2_TELEGRAM_RETRY_COUNT || 1)));
const TELEGRAM_MIN_INTERVAL_MS = Math.max(120, Number(process.env.AGROS_ST2_TELEGRAM_MIN_INTERVAL_MS || 250));
const TELEGRAM_NATIVE_CIRCUIT_MS = Math.max(30000, Number(process.env.AGROS_ST2_TELEGRAM_NATIVE_CIRCUIT_MS || 120000));
const TELEGRAM_CURL_CIRCUIT_MS = Math.max(60000, Number(process.env.AGROS_ST2_TELEGRAM_CURL_CIRCUIT_MS || 600000));
const TELEGRAM_ERROR_LOG_INTERVAL_MS = Math.max(30000, Number(process.env.AGROS_ST2_TELEGRAM_ERROR_LOG_INTERVAL_MS || 300000));
const TELEGRAM_CRITICAL_PROBE_INTERVAL_MS = Math.max(10000, Number(process.env.AGROS_ST2_TELEGRAM_CRITICAL_PROBE_INTERVAL_MS || 30000));
const telegramHttpsAgent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 2, maxFreeSockets: 1, keepAliveMsecs: 1500 });
const telegramIsKuyruklari = { critical: [], panel: [], detail: [] };
const telegramKuyrukLimitleri = { critical: 40, panel: 2, detail: 4 };
let telegramKritikWorkerCalisiyor = false;
let telegramBulkWorkerCalisiyor = false;
const telegramSonIstekZamani = { critical: 0, panel: 0, bulk: 0 };
let telegramCanliPanelWorkerCalisiyor = false;
let telegramCanliPanelBekleyen = null;
const telegramTransport = {
    nativeCircuitUntil: 0,
    curlCircuitUntil: 0,
    nativeConsecutiveFailures: 0,
    curlConsecutiveFailures: 0,
    lastNativeProbeAt: 0,
    lastCurlProbeAt: 0,
    outageSince: null,
    recoveredAt: null
};
const telegramErrorLog = { lastAt: 0, key: '', suppressed: 0 };
const telegramStats = {
    enqueued: { critical: 0, panel: 0, detail: 0 },
    delivered: { critical: 0, panel: 0, detail: 0 },
    failed: { critical: 0, panel: 0, detail: 0 },
    dropped: { critical: 0, panel: 0, detail: 0 },
    nativeFailed: 0,
    curlFallbackOk: 0,
    curlFallbackFailed: 0,
    nativeBypassed: 0,
    circuitFastFail: 0,
    ambiguousDelivery: 0,
    errorLogsSuppressed: 0,
    lastDeliveryAt: null,
    lastError: null,
    livePanel: { requested: 0, delivered: 0, failed: 0, lastRequestedAt: null, lastDeliveredAt: null, lastMode: null }
};

function bekle(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function telegramOncelik(options = {}) {
    const p = String(options.priority || 'critical').toLowerCase();
    return p === 'detail' || p === 'panel' ? p : 'critical';
}
function telegramTransportOzeti() {
    const now = Date.now();
    return {
        nativeCircuitOpen: telegramTransport.nativeCircuitUntil > now,
        nativeCircuitUntil: telegramTransport.nativeCircuitUntil || null,
        curlCircuitOpen: telegramTransport.curlCircuitUntil > now,
        curlCircuitUntil: telegramTransport.curlCircuitUntil || null,
        nativeConsecutiveFailures: telegramTransport.nativeConsecutiveFailures,
        curlConsecutiveFailures: telegramTransport.curlConsecutiveFailures,
        outageSince: telegramTransport.outageSince,
        recoveredAt: telegramTransport.recoveredAt
    };
}
function telegramKuyrukOzeti() {
    return {
        critical: telegramIsKuyruklari.critical.length,
        panel: telegramIsKuyruklari.panel.length,
        detail: telegramIsKuyruklari.detail.length,
        worker: { critical: telegramKritikWorkerCalisiyor, bulk: telegramBulkWorkerCalisiyor },
        transport: telegramTransportOzeti(),
        ...JSON.parse(JSON.stringify(telegramStats))
    };
}
function telegramSiradakiIs(lane) {
    if (lane === 'critical') return telegramIsKuyruklari.critical.shift() || null;
    if (telegramIsKuyruklari.panel.length) return telegramIsKuyruklari.panel.shift();
    if (telegramIsKuyruklari.detail.length) return telegramIsKuyruklari.detail.shift();
    return null;
}
function telegramBulkCircuitOpen() {
    const now = Date.now();
    return telegramTransport.nativeCircuitUntil > now && telegramTransport.curlCircuitUntil > now;
}
function telegramPanelCircuitProbeUygun(priority, now = Date.now()) {
    return priority === 'panel'
        && telegramTransport.nativeCircuitUntil > now
        && telegramTransport.curlCircuitUntil > now
        && now - Number(telegramTransport.lastNativeProbeAt || 0) >= TELEGRAM_CRITICAL_PROBE_INTERVAL_MS;
}
function telegramNativeProbeIzinli(priority, options = {}, now = Date.now()) {
    const nativeOpen = telegramTransport.nativeCircuitUntil > now;
    return !nativeOpen || ((priority === 'critical' || options.allowCircuitProbe === true)
        && now - Number(telegramTransport.lastNativeProbeAt || 0) >= TELEGRAM_CRITICAL_PROBE_INTERVAL_MS);
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
    if (priority !== 'critical' && telegramBulkCircuitOpen()) {
        // Canlı panel tamamen sessiz kalmasın: iki transport circuit'i açıkken panel hattı
        // kontrollü aralıkla taze Native IPv4 probe yapabilir. Detail işleri yine hızlı düşer.
        const panelProbeDue = telegramPanelCircuitProbeUygun(priority);
        if (!panelProbeDue) {
            telegramStats.dropped[priority]++;
            telegramStats.circuitFastFail++;
            job.resolve({ ok: false, dropped: true, circuitOpen: true, description: 'TELEGRAM_TRANSPORT_CIRCUIT_OPEN' });
            return;
        }
        job.options = { ...(job.options || {}), allowCircuitProbe: true };
    }
    const limit = telegramKuyrukLimitleri[priority];
    if (queue.length >= limit) {
        const old = queue.shift();
        telegramStats.dropped[priority]++;
        old.resolve({ ok: false, dropped: true, description: `${priority} Telegram kuyruk sınırı aşıldı` });
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

function telegramTransportHatasi(result) {
    if (!result || result.ok === true) return false;
    const text = String(result.description || result.raw || '');
    return result.transient === true || /TIMEOUT|ECONNRESET|EPIPE|EAI_AGAIN|socket|CURL_|EMPTY_RESPONSE|INVALID_JSON|HTTP_5\d\d/i.test(text);
}
function telegramDuzMetinFallbackUygun(result) {
    if (!result || result.ok === true || result.coalesced || result.dropped) return false;
    // Teslim belirsizliği veya ulaşım arızasında ikinci gönderim çift mesaj üretebilir.
    if (result.ambiguousDelivery === true || result.circuitOpen === true || telegramTransportHatasi(result)) return false;
    const text = String(result.description || result.raw || '');
    // Yalnız Telegram'ın HTML/entity ayrıştırma reddinde aynı mesajı düz metinle bir kez düzelt.
    return /can't parse entities|parse entities|unsupported start tag|bad request.*entity/i.test(text);
}
function telegramIdempotentIstekMi(apiPath, options = {}) {
    return options.idempotent === true || String(apiPath || '') === 'editMessageText';
}
function telegramIdempotentSonucNormalize(result, apiPath, options = {}) {
    if (!result || result.ok === true || !telegramIdempotentIstekMi(apiPath, options)) return result;
    const text = String(result.description || result.raw || '');
    // Native edit aslında ulaştıysa güvenli tekrar Telegram'dan "message is not modified" dönebilir.
    // Bu, editMessageText için teslim kanıtıdır; sendMessage için ASLA başarı sayılmaz.
    if (/message is not modified/i.test(text)) {
        return { ...result, ok: true, idempotentAlreadyApplied: true, description: 'EDIT_ALREADY_APPLIED' };
    }
    return result;
}
function telegramTransportKaydet(transport, result) {
    const ok = result?.ok === true;
    const now = Date.now();
    if (ok) {
        const hadOutage = Boolean(telegramTransport.outageSince);
        if (transport === 'native') {
            telegramTransport.nativeConsecutiveFailures = 0;
            telegramTransport.nativeCircuitUntil = 0;
        } else {
            telegramTransport.curlConsecutiveFailures = 0;
            telegramTransport.curlCircuitUntil = 0;
        }
        if (hadOutage) {
            telegramTransport.outageSince = null;
            telegramTransport.recoveredAt = new Date(now).toISOString();
            const suppressed = telegramErrorLog.suppressed;
            telegramErrorLog.suppressed = 0;
            console.log(`✅ [TELEGRAM ULAŞIMI DÜZELDİ] Taşıma ${transport.toUpperCase()} | Bastırılan tekrar ${suppressed}`);
        }
        return;
    }
    if (!telegramTransportHatasi(result)) return;
    if (!telegramTransport.outageSince) telegramTransport.outageSince = new Date(now).toISOString();
    if (transport === 'native') {
        telegramTransport.nativeConsecutiveFailures++;
        if (telegramTransport.nativeConsecutiveFailures >= 3) telegramTransport.nativeCircuitUntil = now + TELEGRAM_NATIVE_CIRCUIT_MS;
    } else {
        telegramTransport.curlConsecutiveFailures++;
        // curl boş/bozuk yanıtı, curl hattının hemen devre dışı kalması için yeterlidir.
        if (/EMPTY_RESPONSE|INVALID_JSON/i.test(String(result?.description || '')) || telegramTransport.curlConsecutiveFailures >= 2) {
            telegramTransport.curlCircuitUntil = now + TELEGRAM_CURL_CIRCUIT_MS;
            telegramTransport.nativeCircuitUntil = Math.min(telegramTransport.nativeCircuitUntil, now);
        }
    }
}
function telegramHataLogla(result, priority) {
    const aciklama = String(result?.description || result?.raw || 'bilinmeyen hata').slice(0, 300);
    const key = `${priority}:${aciklama}`;
    const now = Date.now();
    if (telegramErrorLog.key === key && now - telegramErrorLog.lastAt < TELEGRAM_ERROR_LOG_INTERVAL_MS) {
        telegramErrorLog.suppressed++;
        telegramStats.errorLogsSuppressed++;
        return;
    }
    const ek = telegramErrorLog.suppressed > 0 ? ` | Önceki tekrar bastırıldı ${telegramErrorLog.suppressed}` : '';
    telegramErrorLog.key = key;
    telegramErrorLog.lastAt = now;
    telegramErrorLog.suppressed = 0;
    console.error(`❌ [TELEGRAM ULAŞIM HATASI] ${priority.toUpperCase()} | ${aciklama}${ek}`);
}

function telegramNativeIstegiAt(apiPath, veri, options = {}) {
    return new Promise((resolve) => {
        if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
            resolve({ ok: false, description: 'Telegram bilgileri eksik' });
            return;
        }
        const postData = JSON.stringify(veri);
        const timeoutMs = Math.max(2500, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS));
        const freshConnection = options.freshConnection === true;
        let settled = false;
        let req = null;
        let hardTimer = null;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            if (hardTimer) clearTimeout(hardTimer);
            resolve(value);
        };
        const requestOptions = {
            hostname: 'api.telegram.org', port: 443,
            path: `/bot${TELEGRAM_TOKEN}/${apiPath}`,
            method: 'POST', timeout: timeoutMs, family: 4,
            agent: freshConnection ? false : telegramHttpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Connection': freshConnection ? 'close' : 'keep-alive',
                'User-Agent': 'AGROS-ST2/6.13.5-R20'
            }
        };
        // R18: req.setTimeout socket atamasından önce geçen DNS/connect/Agent beklemesini garanti etmez.
        // Canlı panel worker'ı 15 dakika sessiz kalamasın diye istek yaratılmadan önce wall-clock deadline başlar.
        hardTimer = setTimeout(() => {
            const err = new Error(`TELEGRAM_HARD_TIMEOUT:${timeoutMs}ms`);
            err.code = 'ETIMEDOUT';
            if (req) req.destroy(err);
            finish({ ok: false, description: err.message, transient: true, transport: 'NATIVE_IPV4', ambiguousDelivery: true });
        }, timeoutMs);
        req = https.request(requestOptions, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (!body.trim()) {
                    finish({ ok: false, description: 'NATIVE_EMPTY_RESPONSE', statusCode: res.statusCode, transient: true, transport: 'NATIVE_IPV4', ambiguousDelivery: res.statusCode >= 200 && res.statusCode < 300 });
                    return;
                }
                try {
                    const parsed = JSON.parse(body);
                    parsed.statusCode = res.statusCode;
                    parsed.transport = 'NATIVE_IPV4';
                    if (!parsed.ok && res.statusCode >= 500) parsed.transient = true;
                    finish(parsed);
                } catch (_) {
                    finish({ ok: false, description: 'NATIVE_INVALID_JSON_RESPONSE', raw: body.slice(0, 500), statusCode: res.statusCode, transient: true, transport: 'NATIVE_IPV4', ambiguousDelivery: res.statusCode >= 200 && res.statusCode < 300 });
                }
            });
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`TELEGRAM_TIMEOUT:${timeoutMs}ms`)));
        req.on('error', err => finish({ ok: false, description: err.message, transient: true, transport: 'NATIVE_IPV4', ambiguousDelivery: /TIMEOUT|ECONNRESET|EPIPE/i.test(String(err.message || err)) }));
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
        const marker = '__AGROS_HTTP_STATUS__:';
        const args = ['-4', '--http1.1', '-sS', '--connect-timeout', '3', '--max-time', String(timeoutSeconds), '--no-keepalive', '-X', 'POST', url, '-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(veri), '-w', `\n${marker}%{http_code}`];
        execFile('curl', args, { timeout: timeoutMs + 1500, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            const out = String(stdout || '');
            const markerIndex = out.lastIndexOf(`\n${marker}`);
            const raw = (markerIndex >= 0 ? out.slice(0, markerIndex) : out).trim();
            const statusCode = markerIndex >= 0 ? Number(out.slice(markerIndex + marker.length + 1).trim()) : 0;
            if (err) {
                const aciklama = String(err.message || err);
                resolve({
                    ok: false,
                    description: `CURL_FALLBACK:${aciklama}`,
                    raw: String(stderr || ''),
                    statusCode,
                    transient: true,
                    transport: 'CURL_IPV4',
                    ambiguousDelivery: /TIMEOUT|TIMED OUT|ETIMEDOUT|ECONNRESET/i.test(aciklama)
                });
                return;
            }
            if (!raw) {
                resolve({ ok: false, description: 'CURL_EMPTY_RESPONSE', raw: String(stderr || ''), statusCode, transient: true, transport: 'CURL_IPV4', ambiguousDelivery: true });
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                parsed.transport = 'CURL_IPV4';
                parsed.statusCode = statusCode;
                if (!parsed.ok && statusCode >= 500) parsed.transient = true;
                resolve(parsed);
            } catch (_) {
                resolve({ ok: false, description: 'CURL_INVALID_JSON_RESPONSE', raw: raw.slice(0, 500), statusCode, transient: true, transport: 'CURL_IPV4', ambiguousDelivery: statusCode >= 200 && statusCode < 300 });
            }
        });
    });
}

async function telegramTekDeneme(apiPath, veri, options = {}) {
    const priority = telegramOncelik(options);
    const now = Date.now();
    const nativeOpen = telegramTransport.nativeCircuitUntil > now;
    const curlOpen = telegramTransport.curlCircuitUntil > now;
    const atMostOnce = options.atMostOnce === true;
    const idempotent = telegramIdempotentIstekMi(apiPath, options);
    const nativeTimeout = priority === 'critical'
        ? Math.min(6000, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS))
        : Math.min(3500, Number(options.timeoutMs || TELEGRAM_TIMEOUT_MS));

    // Tekil pusu gibi at-most-once mesajlar tek taze Native bağlantı kullanır.
    // Timeout/bağlantı kopması belirsiz teslimdir; ikinci taşıma ile çift mesaj riski alınmaz.
    if (atMostOnce) {
        const one = await telegramNativeIstegiAt(apiPath, veri, { ...options, timeoutMs: nativeTimeout, freshConnection: true });
        telegramTransportKaydet('native', one);
        if (one?.ambiguousDelivery) telegramStats.ambiguousDelivery++;
        return { ...one, singleDelivery: true };
    }

    const nativeProbeAllowed = telegramNativeProbeIzinli(priority, options, now);
    if (nativeProbeAllowed) {
        telegramTransport.lastNativeProbeAt = now;
        // Telegram bildirim hacmi düşüktür; stale keep-alive soketi yerine her teslimde taze
        // IPv4 TLS bağlantısı kullanmak uzun süre çalışan AWS sürecinde daha güvenilirdir.
        const native = await telegramNativeIstegiAt(apiPath, veri, { ...options, timeoutMs: nativeTimeout, freshConnection: true });
        telegramTransportKaydet('native', native);
        const nativeNormalized = telegramIdempotentSonucNormalize(native, apiPath, options);
        if (nativeNormalized?.ok) return nativeNormalized;
        telegramStats.nativeFailed++;
        if (native?.ambiguousDelivery) {
            telegramStats.ambiguousDelivery++;
            // sendMessage gibi çoğaltılabilir çağrılarda belirsiz teslimde tekrar YOK.
            // editMessageText idempotenttir: aynı message_id + aynı metin curl ile güvenle doğrulanabilir.
            if (!idempotent) return native;
        }
        if (!telegramTransportHatasi(native)) return nativeNormalized;
    } else {
        telegramStats.nativeBypassed++;
    }

    if (curlOpen) {
        telegramStats.circuitFastFail++;
        return { ok: false, transient: true, circuitOpen: true, description: 'TELEGRAM_CURL_CIRCUIT_OPEN' };
    }
    telegramTransport.lastCurlProbeAt = now;
    const curl = await telegramCurlIstegiAt(apiPath, veri, options);
    telegramTransportKaydet('curl', curl);
    const curlNormalized = telegramIdempotentSonucNormalize(curl, apiPath, options);
    if (curlNormalized?.ok) {
        telegramStats.curlFallbackOk++;
        return curlNormalized;
    }
    telegramStats.curlFallbackFailed++;
    if (curl?.ambiguousDelivery) telegramStats.ambiguousDelivery++;
    return curlNormalized;
}

async function telegramDayanikliIstegiAt(apiPath, veri, options = {}) {
    let son = null;
    const priority = telegramOncelik(options);
    const idempotent = telegramIdempotentIstekMi(apiPath, options);
    const defaultRetry = priority === 'critical' ? TELEGRAM_RETRY_COUNT : 0;
    const retryCount = Math.max(0, Math.min(2, Number.isFinite(Number(options.retryCount)) ? Number(options.retryCount) : defaultRetry));
    for (let deneme = 0; deneme <= retryCount; deneme++) {
        const lane = priority === 'critical' ? 'critical' : (priority === 'panel' ? 'panel' : 'bulk');
        const gecen = Date.now() - telegramSonIstekZamani[lane];
        if (gecen < TELEGRAM_MIN_INTERVAL_MS) await bekle(TELEGRAM_MIN_INTERVAL_MS - gecen);
        telegramSonIstekZamani[lane] = Date.now();
        son = await telegramTekDeneme(apiPath, veri, { ...options, priority });
        if (son?.ok || (son?.ambiguousDelivery === true && !idempotent)) return son;
        const aciklama = String(son?.description || son?.raw || '');
        const rateLimited = aciklama.includes('Too Many Requests') || Number(son?.error_code) === 429;
        const transient = telegramTransportHatasi(son) || rateLimited;
        if (!transient || deneme >= retryCount || son?.circuitOpen) break;
        const retryAfterMs = Math.max(750, Number(son?.parameters?.retry_after || 0) * 1000, 750 * (deneme + 1));
        await bekle(retryAfterMs);
    }
    if (!son?.ok && !son?.coalesced && !son?.dropped) telegramHataLogla(son, priority);
    return son || { ok: false, description: 'Telegram yanıtı alınamadı' };
}

function telegramPanelDirectIstegiAt(apiPath, veri, options = {}) {
    // R20: Canlı panel zaten kendi latest-only worker'ında serialize edilir.
    // Generic bulk/detail kuyruğuna tekrar sokmak paneli bilimsel/detail trafik arkasında bırakıyordu.
    return telegramDayanikliIstegiAt(apiPath, veri, { ...options, priority: 'panel', retryCount: 0, directPanel: true });
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
                if (!telegramMinimalModuAktif() && options.atMostOnce !== true && telegramDuzMetinFallbackUygun(sonuc)) {
                    sonuc = await yerelTelegramIstegiAt('sendMessage', {
                        chat_id, text: telegramHtmlTemizle(text), disable_web_page_preview: true
                    }, { ...options, priority, retryCount: 0 });
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
        timeoutMs: Math.max(6000, Number(options.timeoutMs || 10000)),
        retryCount: 0,
        priority: 'critical',
        atMostOnce: true,
        freshConnection: true
    });
}

// Açılış gibi mutlaka görünmesi gereken kritik bildirimler için teslim-öncelikli hat.
// Tekil pusu hattı at-most-once kalır; startup ise Native IPv4 -> curl IPv4 fallback
// ve sınırlı retry kullanır. Belirsiz teslimde çift mesaj üretmemek için tekrar yapılmaz.
async function telegramMesajGonderKritikTeslim(mesaj, options = {}) {
    return telegramMesajGonder(mesaj, {
        ...options,
        timeoutMs: Math.max(8000, Number(options.timeoutMs || 12000)),
        retryCount: Math.max(0, Math.min(2, Number(options.retryCount ?? TELEGRAM_RETRY_COUNT))),
        priority: 'critical',
        atMostOnce: false
    });
}
async function telegramMesajDuzenle(chat_id, message_id, mesaj, options = {}) {
    try {
        const hazir = telegramGonderimHazirla(mesaj);
        const payload = { chat_id, message_id, text: hazir.text, disable_web_page_preview: true };
        if (hazir.parseMode) payload.parse_mode = hazir.parseMode;
        const editOptions = { ...options, priority: options.priority || 'panel', retryCount: Number.isFinite(Number(options.retryCount)) ? Number(options.retryCount) : 1, idempotent: true, coalesceKey: options.coalesceKey || `panel-edit:${chat_id}` };
        return options.directPanel === true
            ? await telegramPanelDirectIstegiAt('editMessageText', payload, editOptions)
            : await yerelTelegramIstegiAt('editMessageText', payload, editOptions);
    } catch (err) {
        return { ok: false, description: err.message };
    }
}
async function telegramMesajSil(chat_id, message_id, options = {}) {
    try { return await yerelTelegramIstegiAt('deleteMessage', { chat_id, message_id }, { ...options, priority: options.priority || 'panel' }); }
    catch (err) { return { ok: false, description: err.message }; }
}
function telegramEditYeniMesajGerektirir(result) {
    const text = String(result?.description || result?.raw || '').toLowerCase();
    if (!text) return false;
    return text.includes('message to edit not found')
        || text.includes("message can't be edited")
        || text.includes('message can not be edited')
        || text.includes('message_id_invalid');
}

async function telegramCanliRaporTeslimEt(mesaj, oneCikar = false) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return;
    const now = Date.now();
    const hazir = telegramGonderimHazirla(mesaj);
    const guvenliMesaj = hazir.text;
    const yenidenGondermeMs = ayarlar.canliRaporYenidenGondermeMs || 0;
    const panelTimeoutMs = Math.max(3000, Math.min(8000, Number(ayarlar.telegramCanliPanelTimeoutMs || 6000)));
    for (const chat_id of TELEGRAM_CHAT_IDS) {
        const kayitliMesajId = state.canliRaporMesajlari[chat_id];
        const sonGonderim = state.canliRaporSonGonderimZamani[chat_id] || 0;
        const sureDoldu = yenidenGondermeMs > 0 && now - sonGonderim >= yenidenGondermeMs;
        const yeniMesajGonder = oneCikar || !kayitliMesajId || sureDoldu;
        const sonBasariliMetin = state.canliRaporSonMetinleri[chat_id] || '';
        let sonEditSonucu = null;

        if (!yeniMesajGonder && kayitliMesajId) {
            if (sonBasariliMetin === guvenliMesaj) continue;
            sonEditSonucu = await telegramMesajDuzenle(chat_id, kayitliMesajId, guvenliMesaj, { priority: 'panel', retryCount: 0, timeoutMs: panelTimeoutMs, coalesceKey: `live-panel:${chat_id}`, directPanel: true });
            if (sonEditSonucu?.ok) {
                state.canliRaporSonMetinleri[chat_id] = guvenliMesaj;
                state.canliRaporSonTeslimZamani[chat_id] = Date.now();
                state.sonCanliRaporMetni = guvenliMesaj;
                telegramStats.livePanel.delivered++;
                telegramStats.delivered.panel++;
                telegramStats.lastDeliveryAt = new Date().toISOString();
                telegramStats.livePanel.lastDeliveredAt = new Date().toISOString();
                telegramStats.livePanel.lastMode = 'EDIT_DIRECT';
                continue;
            }
            // Coalesced iş teslim kanıtı değildir. Yeni iş gerçekten teslim edilmeden hafıza ilerletilmez.
            if (sonEditSonucu?.coalesced) continue;
            // Timeout/transport/ambiguous edit hatasında yeni sendMessage üretme: bu hem gecikmeyi
            // büyütür hem çift panel riski yaratır. Sonraki 30 sn tick aynı message_id'yi yeniden dener.
            if (!telegramEditYeniMesajGerektirir(sonEditSonucu)) {
                telegramStats.livePanel.failed++;
                telegramStats.failed.panel++;
                telegramHataLogla({
                    ...sonEditSonucu,
                    description: `CANLI_PANEL_EDIT_RETRY_NEXT_TICK:${sonEditSonucu?.description || sonEditSonucu?.raw || 'bilinmeyen hata'}`
                }, 'panel');
                continue;
            }
        }

        const payload = { chat_id, text: guvenliMesaj, disable_web_page_preview: true };
        if (hazir.parseMode) payload.parse_mode = hazir.parseMode;
        let gonderim = await telegramPanelDirectIstegiAt('sendMessage', payload,
            { priority: 'panel', retryCount: 0, timeoutMs: panelTimeoutMs, coalesceKey: `live-panel:${chat_id}`, directPanel: true });
        if (!telegramMinimalModuAktif() && telegramDuzMetinFallbackUygun(gonderim)) {
            gonderim = await telegramPanelDirectIstegiAt('sendMessage', {
                chat_id, text: telegramHtmlTemizle(guvenliMesaj), disable_web_page_preview: true
            }, { priority: 'panel', retryCount: 0, timeoutMs: panelTimeoutMs, coalesceKey: `live-panel-plain:${chat_id}`, directPanel: true });
        }
        if (gonderim?.ok && gonderim.result?.message_id) {
            const yeniMesajId = gonderim.result.message_id;
            state.canliRaporMesajlari[chat_id] = yeniMesajId;
            state.canliRaporSonGonderimZamani[chat_id] = now;
            state.canliRaporSonTeslimZamani[chat_id] = Date.now();
            state.canliRaporSonMetinleri[chat_id] = guvenliMesaj;
            state.sonCanliRaporMetni = guvenliMesaj;
            telegramStats.livePanel.delivered++;
            telegramStats.delivered.panel++;
            telegramStats.lastDeliveryAt = new Date().toISOString();
            telegramStats.livePanel.lastDeliveredAt = new Date().toISOString();
            telegramStats.livePanel.lastMode = 'SEND_DIRECT';
            if (kayitliMesajId && kayitliMesajId !== yeniMesajId && ayarlar.canliRaporEskiMesajiSil) {
                // Eski panel temizliği yeni panel teslimini/worker'ı bekletmez; panel işleri detail temizliğinden önceliklidir.
                Promise.resolve(telegramMesajSil(chat_id, kayitliMesajId, {
                    priority: 'detail', retryCount: 0, timeoutMs: panelTimeoutMs, coalesceKey: `old-live-panel-delete:${chat_id}`
                })).catch(() => {});
            }
            continue;
        }

        const teslimHatasi = gonderim || sonEditSonucu || { description: 'CANLI_RAPOR_TESLIM_SONUCU_YOK' };
        if (!teslimHatasi?.coalesced) {
            telegramStats.livePanel.failed++;
            telegramStats.failed.panel++;
            telegramHataLogla({
                ...teslimHatasi,
                description: `CANLI_RAPOR_TESLIM_EDILEMEDI:${teslimHatasi?.description || teslimHatasi?.raw || 'bilinmeyen hata'}`
            }, 'panel');
        }
    }
}

async function telegramCanliPanelWorkerCalistir() {
    if (telegramCanliPanelWorkerCalisiyor) return;
    telegramCanliPanelWorkerCalisiyor = true;
    try {
        while (telegramCanliPanelBekleyen) {
            const job = telegramCanliPanelBekleyen;
            telegramCanliPanelBekleyen = null;
            try {
                await telegramCanliRaporTeslimEt(job.mesaj, job.oneCikar);
            } catch (err) {
                telegramHataLogla({ description: `CANLI_PANEL_WORKER:${err?.message || err}` }, 'panel');
            }
        }
    } finally {
        telegramCanliPanelWorkerCalisiyor = false;
        if (telegramCanliPanelBekleyen) {
            const immediate = setImmediate(() => telegramCanliPanelWorkerCalistir().catch(err =>
                telegramHataLogla({ description: `CANLI_PANEL_WORKER_RESTART:${err?.message || err}` }, 'panel')));
            immediate.unref?.();
        }
    }
}

function telegramCanliRaporGuncelle(mesaj, oneCikar = false) {
    if (!TELEGRAM_TOKEN || TELEGRAM_CHAT_IDS.length === 0) return { queued: false, reason: 'TELEGRAM_NOT_CONFIGURED' };
    telegramStats.livePanel.requested++;
    telegramStats.livePanel.lastRequestedAt = new Date().toISOString();
    const once = oneCikar === true || telegramCanliPanelBekleyen?.oneCikar === true;
    const replaced = Boolean(telegramCanliPanelBekleyen);
    telegramCanliPanelBekleyen = { mesaj: String(mesaj || ''), oneCikar: once, queuedAt: Date.now() };
    if (!telegramCanliPanelWorkerCalisiyor) {
        const immediate = setImmediate(() => telegramCanliPanelWorkerCalistir().catch(err =>
            telegramHataLogla({ description: `CANLI_PANEL_WORKER_START:${err?.message || err}` }, 'panel')));
        immediate.unref?.();
    }
    return { queued: true, latestOnly: true, replaced };
}

async function binanceTimeSync(options = {}) {
    return binanceTimeAuthority.sync(options);
}
function binanceTimeStartPeriodic() { return binanceTimeAuthority.start(); }
function binanceTimeHealth() { return binanceTimeAuthority.health(); }

module.exports = {
    client,
    binanceEndpoint,
    binanceTimeSync,
    binanceTimeStartPeriodic,
    binanceTimeHealth,
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
    telegramMetniTekMesajaIndir,
    _test: {
        telegramTransportHatasi,
        telegramDuzMetinFallbackUygun,
        telegramIdempotentIstekMi,
        telegramIdempotentSonucNormalize,
        telegramTransportKaydet,
        telegramTransportOzeti,
        telegramHataLogla,
        telegramTransport,
        telegramStats,
        telegramErrorLog,
        telegramEditYeniMesajGerektirir,
        telegramCanliPanelDurum: () => ({ workerCalisiyor: telegramCanliPanelWorkerCalisiyor, bekleyen: Boolean(telegramCanliPanelBekleyen) }),
        telegramPanelCircuitProbeUygun,
        telegramNativeProbeIzinli,
        telegramPanelDirectIstegiAt
    }
};
