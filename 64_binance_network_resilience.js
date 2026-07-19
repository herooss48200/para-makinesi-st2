'use strict';

const DEFAULTS = {
    timeoutMs: 12000,
    retries: 2,
    baseDelayMs: 700,
    maxDelayMs: 4000,
    concurrency: 5
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function timeoutIle(promise, timeoutMs, label = 'BINANCE_REQUEST_TIMEOUT') {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label}:${timeoutMs}ms`)), timeoutMs);
        })
    ]).finally(() => clearTimeout(timer));
}

function geciciAgHatasi(err) {
    const mesaj = String(err?.message || err || '').toLowerCase();
    const kod = String(err?.code || '').toUpperCase();
    return [
        'socket hang up',
        'before secure tls connection',
        'econnreset',
        'etimedout',
        'eai_again',
        'timeout',
        '429',
        '1095',
        'network',
        'fetch failed'
    ].some(x => mesaj.includes(x)) || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED'].includes(kod);
}

async function istekYap(fn, options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    let sonHata;

    for (let deneme = 0; deneme <= cfg.retries; deneme++) {
        try {
            return await timeoutIle(fn(deneme), cfg.timeoutMs, cfg.label || 'BINANCE_REQUEST_TIMEOUT');
        } catch (err) {
            sonHata = err;
            if (!geciciAgHatasi(err) || deneme >= cfg.retries) throw err;
            const gecikme = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * (2 ** deneme)) + Math.floor(Math.random() * 250);
            await sleep(gecikme);
        }
    }

    throw sonHata;
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

module.exports = {
    DEFAULTS,
    sleep,
    timeoutIle,
    geciciAgHatasi,
    istekYap,
    havuzdaCalistir
};
