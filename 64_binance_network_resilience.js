'use strict';

/**
 * AGROS v5.0.3 - SHARED BINANCE REQUEST QUEUE / URL HOTFIX
 *
 * Tüm halka açık Binance piyasa verisi aynı global kuyruğu kullanır.
 * - Gerçek global eşzamanlılık sınırı
 * - Aynı istek için in-flight birleştirme
 * - Kısa süreli güvenli cache
 * - Abort edilebilir HTTPS timeout (arkada asılı promise bırakmaz)
 * - Kontrollü retry + jitter
 * - Toplu hata sayacı; sembol başına log fırtınası yok
 */
const https = require('https');
const { URL } = require('url');
const MARKET_DATA_BASE_URL = String(process.env.BINANCE_MARKET_DATA_BASE_URL || 'https://fapi.binance.com').replace(/\/$/, '');

const DEFAULTS = {
    timeoutMs: 15000,
    retries: 2,
    baseDelayMs: 900,
    maxDelayMs: 5000,
    concurrency: 3,
    requestSpacingMs: 35,
    cacheTtlMs: 0
};

const agent = new https.Agent({
    keepAlive: true,
    // R14: normal bulk concurrency + 1 reserved emergency socket for CRITICAL requests.
    maxSockets: DEFAULTS.concurrency + 1,
    maxFreeSockets: DEFAULTS.concurrency + 1,
    scheduling: 'lifo',
    keepAliveMsecs: 1000
});

const queue = [];
const inFlightByKey = new Map();
const taskByKey = new Map();
const cache = new Map();
let active = 0;
let configuredConcurrency = DEFAULTS.concurrency;
let lastStartAt = 0;
let pumpTimer = null;
let nextId = 1;

const stats = {
    queued: 0,
    started: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    deduped: 0,
    cacheHit: 0,
    timeout: 0,
    transientFailure: 0,
    promoted: 0,
    lastError: '',
    lastErrorAt: 0
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function configure(options = {}) {
    const wanted = Math.max(1, Math.min(10, Number(options.concurrency) || configuredConcurrency));
    configuredConcurrency = wanted;
    // R14: bulk KLINE tasks remain bounded by configuredConcurrency in pump();
    // only a queued CRITICAL task may use the single overflow slot.
    agent.maxSockets = wanted + 1;
    agent.maxFreeSockets = wanted + 1;
    pump();
    return durumOzeti();
}

function timeoutIle(promise, timeoutMs, label = 'BINANCE_REQUEST_TIMEOUT') {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                const err = new Error(`${label}:${timeoutMs}ms`);
                err.code = 'ETIMEDOUT';
                reject(err);
            }, timeoutMs);
            if (typeof timer.unref === 'function') timer.unref();
        })
    ]).finally(() => clearTimeout(timer));
}

function geciciAgHatasi(err) {
    const mesaj = String(err?.message || err || '').toLowerCase();
    const kod = String(err?.code || '').toUpperCase();
    const status = Number(err?.statusCode || err?.status || 0);
    return status === 408 || status === 418 || status === 429 || status >= 500 || [
        'socket hang up',
        'before secure tls connection',
        'econnreset',
        'etimedout',
        'eai_again',
        'timeout',
        '429',
        '1095',
        'network',
        'fetch failed',
        'service unavailable',
        'bad gateway'
    ].some(x => mesaj.includes(x)) || [
        'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED',
        'ECONNREFUSED', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'
    ].includes(kod);
}

function hataKaydet(err) {
    stats.failed++;
    stats.lastError = String(err?.message || err || 'BILINMEYEN').slice(0, 240);
    stats.lastErrorAt = Date.now();
    if (String(err?.code || '').toUpperCase() === 'ETIMEDOUT' || /timeout/i.test(stats.lastError)) stats.timeout++;
    if (geciciAgHatasi(err)) stats.transientFailure++;
}

function cacheTemizle() {
    const now = Date.now();
    if (cache.size < 500) return;
    for (const [key, row] of cache.entries()) {
        if (!row || row.expiresAt <= now) cache.delete(key);
    }
}

async function retryIleCalistir(fn, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    let sonHata;
    for (let deneme = 0; deneme <= cfg.retries; deneme++) {
        try {
            return await fn(deneme);
        } catch (err) {
            sonHata = err;
            if (!geciciAgHatasi(err) || deneme >= cfg.retries) throw err;
            stats.retried++;
            const retryAfterMs = Math.max(0, Number(err?.retryAfterMs || 0));
            const gecikme = retryAfterMs || (Math.min(cfg.maxDelayMs, cfg.baseDelayMs * (2 ** deneme)) + Math.floor(Math.random() * 300));
            await sleep(gecikme);
        }
    }
    throw sonHata;
}


function priorityValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value || '').toUpperCase();
    if (text === 'CRITICAL') return 100;
    if (text === 'HIGH') return 50;
    if (text === 'LOW') return -10;
    return 0;
}

function queueSort() {
    queue.sort((a, b) => (b.priority - a.priority) || (a.id - b.id));
}

function pump() {
    if (pumpTimer) return;
    const run = () => {
        pumpTimer = null;
        while (queue.length) {
            const nextTask = queue[0];
            const criticalOverflow = nextTask?.priority >= priorityValue('CRITICAL') && active < (configuredConcurrency + 1);
            if (!(active < configuredConcurrency || criticalOverflow)) break;
            const task = queue.shift();
            const spacing = Math.max(0, Number(task.options.requestSpacingMs ?? DEFAULTS.requestSpacingMs));
            const wait = Math.max(0, (lastStartAt + spacing) - Date.now());
            if (wait > 0) {
                queue.unshift(task);
                pumpTimer = setTimeout(run, wait);
                if (typeof pumpTimer.unref === 'function') pumpTimer.unref();
                return;
            }
            task.status = 'active';
            active++;
            lastStartAt = Date.now();
            stats.started++;
            Promise.resolve()
                .then(() => retryIleCalistir(task.fn, task.options))
                .then(value => {
                    stats.succeeded++;
                    const ttl = Math.max(0, Number(task.options.cacheTtlMs || 0));
                    if (task.key && ttl > 0) cache.set(task.key, { value, expiresAt: Date.now() + ttl });
                    task.resolve(value);
                })
                .catch(err => {
                    hataKaydet(err);
                    task.reject(err);
                })
                .finally(() => {
                    active--;
                    if (task.key && inFlightByKey.get(task.key) === task.promise) inFlightByKey.delete(task.key);
                    if (task.key && taskByKey.get(task.key) === task) taskByKey.delete(task.key);
                    cacheTemizle();
                    pump();
                });
        }
    };
    run();
}

function kuyrukluIstek(key, fn, options = {}) {
    const normalizedKey = String(key || '').trim();
    const now = Date.now();
    if (normalizedKey) {
        const cached = cache.get(normalizedKey);
        if (cached && cached.expiresAt > now) {
            stats.cacheHit++;
            return Promise.resolve(cached.value);
        }
        if (inFlightByKey.has(normalizedKey)) {
            stats.deduped++;
            const existingTask = taskByKey.get(normalizedKey);
            const requestedPriority = priorityValue(options.priority);
            if (existingTask?.status === 'queued' && requestedPriority > existingTask.priority) {
                existingTask.priority = requestedPriority;
                existingTask.options.priority = requestedPriority;
                queueSort();
                stats.promoted++;
                pump();
            }
            return inFlightByKey.get(normalizedKey);
        }
    }

    let resolveTask;
    let rejectTask;
    const promise = new Promise((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
    });
    const task = {
        id: nextId++,
        key: normalizedKey,
        fn,
        options: { ...DEFAULTS, ...options },
        resolve: resolveTask,
        reject: rejectTask,
        promise,
        priority: priorityValue(options.priority),
        status: 'queued'
    };
    if (normalizedKey) {
        inFlightByKey.set(normalizedKey, promise);
        taskByKey.set(normalizedKey, task);
    }
    queue.push(task);
    queueSort();
    stats.queued++;
    pump();
    return promise;
}

/** Eski çağrılar için uyumluluk. Kuyruğu atlamaz. */
function istekYap(fn, options = {}) {
    const key = String(options.key || `${options.label || 'GENERIC'}:${nextId}`);
    return kuyrukluIstek(key, () => timeoutIle(fn(), options.timeoutMs || DEFAULTS.timeoutMs, options.label || 'BINANCE_REQUEST_TIMEOUT'), options);
}

function publicUrlOlustur(pathname, params = undefined) {
    const base = new URL(`${MARKET_DATA_BASE_URL}/`);
    const relativePath = String(pathname || '').replace(/^\/+/, '');
    if (!relativePath) throw new Error('BINANCE_PUBLIC_URL_PATH_EMPTY');
    const url = new URL(relativePath, base);
    if (params) {
        const entries = params instanceof URLSearchParams ? params.entries() : Object.entries(params);
        for (const [key, value] of entries) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(String(key), String(value));
        }
    }
    return url.toString();
}

function httpsJson(urlString, options = {}) {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULTS.timeoutMs));
    const label = options.label || 'BINANCE_HTTP';
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        let settled = false;
        let req = null;
        let hardTimer = null;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            if (hardTimer) clearTimeout(hardTimer);
            fn(value);
        };
        // R14: req.setTimeout() alone does not bound time spent waiting for an Agent socket.
        // This wall-clock timer starts before a socket is assigned and therefore bounds the
        // complete lifecycle (Agent queue + connect + response).
        hardTimer = setTimeout(() => {
            const err = new Error(`${label}:HARD_TIMEOUT:${timeoutMs}ms`);
            err.code = 'ETIMEDOUT';
            if (req) req.destroy(err);
            finish(reject, err);
        }, timeoutMs);
        req = https.request(url, {
            method: 'GET',
            family: 4,
            agent,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'AGROS/5.0.3',
                'Connection': 'keep-alive'
            }
        }, res => {
            const chunks = [];
            let bytes = 0;
            res.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > 8 * 1024 * 1024) {
                    req.destroy(new Error(`${label}:RESPONSE_TOO_LARGE`));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                const statusCode = Number(res.statusCode || 0);
                if (statusCode < 200 || statusCode >= 300) {
                    const err = new Error(`${label}:HTTP_${statusCode}:${body.slice(0, 180)}`);
                    err.statusCode = statusCode;
                    const retryAfter = Number(res.headers['retry-after'] || 0);
                    if (retryAfter > 0) err.retryAfterMs = retryAfter * 1000;
                    finish(reject, err);
                    return;
                }
                try {
                    finish(resolve, JSON.parse(body));
                } catch (parseErr) {
                    const err = new Error(`${label}:INVALID_JSON:${parseErr.message}`);
                    err.code = 'INVALID_JSON';
                    finish(reject, err);
                }
            });
        });
        req.setTimeout(timeoutMs, () => {
            const err = new Error(`${label}:TIMEOUT:${timeoutMs}ms`);
            err.code = 'ETIMEDOUT';
            req.destroy(err);
        });
        req.on('error', err => finish(reject, err));
        req.end();
    });
}

function mumCacheTtl(interval) {
    const tf = String(interval || '').toLowerCase();
    if (tf.endsWith('m')) return 12000;
    if (tf.endsWith('h')) return 30000;
    return 10000;
}

function binanceMumlariCek(symbol, interval, limit = 80, options = {}) {
    const sym = String(symbol || '').toUpperCase();
    const tf = String(interval || '3m');
    const lim = Math.max(1, Math.min(1500, Number(limit) || 80));
    const key = `KLINES:${sym}:${tf}:${lim}`;
    const url = publicUrlOlustur('/fapi/v1/klines', { symbol: sym, interval: tf, limit: lim });
    const cfg = { ...DEFAULTS, ...options, cacheTtlMs: options.cacheTtlMs ?? mumCacheTtl(tf) };
    return kuyrukluIstek(key, () => httpsJson(url, {
        timeoutMs: cfg.timeoutMs,
        label: cfg.label || `KLINES:${sym}:${tf}`
    }).then(rows => (rows || []).map(row => ({
        openTime: Number(row[0]),
        open: String(row[1]),
        high: String(row[2]),
        low: String(row[3]),
        close: String(row[4]),
        volume: String(row[5]),
        closeTime: Number(row[6])
    }))), cfg);
}

function binanceFiyatlariCek(options = {}) {
    const cfg = { ...DEFAULTS, ...options, cacheTtlMs: options.cacheTtlMs ?? 700 };
    const url = publicUrlOlustur('/fapi/v1/ticker/price');
    return kuyrukluIstek('TICKER:ALL', () => httpsJson(url, {
        timeoutMs: cfg.timeoutMs,
        label: cfg.label || 'TICKER_ALL'
    }).then(rows => {
        const out = {};
        for (const row of rows || []) {
            if (row?.symbol && row?.price !== undefined) out[row.symbol] = String(row.price);
        }
        return out;
    }), cfg);
}

async function havuzdaCalistir(items, worker, concurrency = DEFAULTS.concurrency) {
    const liste = Array.from(items || []);
    const sonuc = new Array(liste.length);
    let index = 0;
    async function calisan() {
        while (true) {
            const mevcut = index++;
            if (mevcut >= liste.length) return;
            try {
                sonuc[mevcut] = { ok: true, value: await worker(liste[mevcut], mevcut) };
            } catch (error) {
                sonuc[mevcut] = { ok: false, error };
            }
        }
    }
    const adet = Math.max(1, Math.min(Number(concurrency) || 1, liste.length || 1));
    await Promise.all(Array.from({ length: adet }, () => calisan()));
    return sonuc;
}

function durumOzeti({ reset = false } = {}) {
    const out = {
        active,
        queuedNow: queue.length,
        concurrency: configuredConcurrency,
        inFlight: inFlightByKey.size,
        cacheSize: cache.size,
        ...stats
    };
    if (reset) {
        for (const key of Object.keys(stats)) {
            if (typeof stats[key] === 'number') stats[key] = 0;
        }
        stats.lastError = '';
        stats.lastErrorAt = 0;
    }
    return out;
}

function testReset() {
    queue.length = 0;
    inFlightByKey.clear();
    taskByKey.clear();
    cache.clear();
    active = 0;
    configuredConcurrency = DEFAULTS.concurrency;
    lastStartAt = 0;
    if (pumpTimer) clearTimeout(pumpTimer);
    pumpTimer = null;
    for (const key of Object.keys(stats)) stats[key] = typeof stats[key] === 'number' ? 0 : '';
}

module.exports = {
    DEFAULTS,
    sleep,
    configure,
    timeoutIle,
    geciciAgHatasi,
    istekYap,
    kuyrukluIstek,
    binanceMumlariCek,
    binanceFiyatlariCek,
    havuzdaCalistir,
    durumOzeti,
    _publicUrlOlustur: publicUrlOlustur,
    _httpsJson: httpsJson,
    _testReset: testReset
};
