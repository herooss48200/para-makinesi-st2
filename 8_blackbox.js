'use strict';

// AGROS ST2 R26 CORE N5 CONTEXT SNAPSHOT
// Eski BlackBox rapor/feature/importance/exit laboratuvarları kaldırılmıştır.
// Bu dosyanın tek görevi Premier/N5 için YON+BTC+COIN+BB kimliğini üretmektir.

const ayarlar = require('./ayarlar.js');
const dnaIdentity = require('./59_dna_identity_registry.js');
const dnaHierarchy = require('./60_hierarchical_dna_identity_registry.js');
const binanceAg = require('./64_binance_network_resilience.js');

const TFS = ayarlar.blackboxTimeframes || ['5m', '15m', '1h', '4h'];
const BLACKBOX_REQUEST_TIMEOUT_MS = Math.max(3000, Number(ayarlar.blackboxRequestTimeoutMs || 5000));
const BLACKBOX_SNAPSHOT_TIMEOUT_MS = Math.max(BLACKBOX_REQUEST_TIMEOUT_MS * 4, Number(ayarlar.blackboxSnapshotTimeoutMs || 30000));

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function yonTrend(yon) { return String(yon || '').toUpperCase() === 'SHORT' ? 'DOWN' : 'UP'; }
function trendDegeri(v) { const x = String(v || '').toUpperCase(); return x === 'UP' || x === 'DOWN' ? x : 'YOK'; }
function tfTrendDegeri(matrix, tf) { return trendDegeri(matrix?.[tf]?.trend); }
function tfListeMetni(list) { return list?.length ? list.join('+') : '-'; }

function timeoutIle(promise, ms, code) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => { const e = new Error(code); e.code = code; reject(e); }, ms);
            timer.unref?.();
        })
    ]).finally(() => clearTimeout(timer));
}

function uyumluTfListesi(matrix, yon) {
    const hedef = yonTrend(yon);
    return TFS.filter(tf => tfTrendDegeri(matrix, tf) === hedef);
}
function karsiTfListesi(matrix, yon) {
    const hedef = yonTrend(yon);
    return TFS.filter(tf => { const t = tfTrendDegeri(matrix, tf); return t !== 'YOK' && t !== hedef; });
}
function uyumBitleri(matrix, yon) {
    const hedef = yonTrend(yon);
    return TFS.map(tf => { const t = tfTrendDegeri(matrix, tf); return t === 'YOK' ? 'Y' : (t === hedef ? '1' : '0'); }).join('');
}
function uyumSay(matrix, yon) {
    const hedef = yonTrend(yon);
    let uygun = 0, toplam = 0;
    for (const tf of TFS) {
        const t = tfTrendDegeri(matrix, tf);
        if (t === 'UP' || t === 'DOWN') { toplam++; if (t === hedef) uygun++; }
    }
    return { uygun, toplam, metin: `${uygun}/${toplam}` };
}

function normalizeMum(m) {
    if (Array.isArray(m)) return { openTime:n(m[0]), open:n(m[1]), high:n(m[2]), low:n(m[3]), close:n(m[4]), volume:n(m[5]), closeTime:n(m[6]) };
    return { openTime:n(m?.openTime || m?.openTimeMillis), closeTime:n(m?.closeTime || m?.closeTimeMillis), open:n(m?.open), high:n(m?.high), low:n(m?.low), close:n(m?.close), volume:n(m?.volume) };
}

async function mumlariCek(symbol, interval, limit = 80) {
    const raw = await binanceAg.binanceMumlariCek(symbol, interval, limit, {
        timeoutMs: Math.max(BLACKBOX_REQUEST_TIMEOUT_MS, Number(ayarlar.binanceAgTimeoutMs || 15000)),
        retries: ayarlar.binanceAgRetry ?? 1,
        baseDelayMs: ayarlar.binanceAgRetryTabanMs || 900,
        label: `N5_CONTEXT:${symbol}:${interval}`,
        priority: 'CRITICAL'
    });
    return (raw || []).map(normalizeMum).filter(x => x.open > 0 && x.high > 0 && x.low > 0 && x.close > 0);
}

function hesaplaSuperTrend(mumlar, period = ayarlar.superTrendPeriod || 10, multiplier = ayarlar.superTrendMultiplier || 3) {
    if (!mumlar || mumlar.length < period + 2) return { trend: 'YOK', value: 0 };
    const tr = [];
    for (let i = 0; i < mumlar.length; i++) {
        tr.push(i === 0 ? mumlar[i].high - mumlar[i].low : Math.max(
            mumlar[i].high - mumlar[i].low,
            Math.abs(mumlar[i].high - mumlar[i - 1].close),
            Math.abs(mumlar[i].low - mumlar[i - 1].close)
        ));
    }
    const atr = new Array(mumlar.length).fill(null);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += tr[i];
    atr[period - 1] = sum / period;
    for (let i = period; i < mumlar.length; i++) atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
    const upper = new Array(mumlar.length).fill(null), lower = new Array(mumlar.length).fill(null), st = new Array(mumlar.length).fill(null);
    let trend = 'UP';
    for (let i = period; i < mumlar.length; i++) {
        const hl2 = (mumlar[i].high + mumlar[i].low) / 2;
        const bu = hl2 + multiplier * atr[i], bl = hl2 - multiplier * atr[i];
        if (i === period) {
            upper[i] = bu; lower[i] = bl; trend = mumlar[i].close >= bl ? 'UP' : 'DOWN'; st[i] = trend === 'UP' ? lower[i] : upper[i]; continue;
        }
        upper[i] = (bu < upper[i - 1] || mumlar[i - 1].close > upper[i - 1]) ? bu : upper[i - 1];
        lower[i] = (bl > lower[i - 1] || mumlar[i - 1].close < lower[i - 1]) ? bl : lower[i - 1];
        trend = st[i - 1] === upper[i - 1] ? (mumlar[i].close <= upper[i] ? 'DOWN' : 'UP') : (mumlar[i].close >= lower[i] ? 'UP' : 'DOWN');
        st[i] = trend === 'UP' ? lower[i] : upper[i];
    }
    return { trend, value: Number(st.at(-1) || 0) };
}

function hesaplaBollinger(mumlar) {
    const period = Number(ayarlar.bollingerperiod || 20);
    if (!mumlar || mumlar.length < period) return null;
    const closes = mumlar.slice(-period).map(x => x.close);
    const mid = closes.reduce((a,b)=>a+b,0) / period;
    const variance = closes.reduce((a,b)=>a + Math.pow(b-mid,2),0) / period;
    const sd = Math.sqrt(variance), upper = mid + Number(ayarlar.bollingercarpani || 2)*sd, lower = mid - Number(ayarlar.bollingercarpani || 2)*sd;
    const close = closes.at(-1), width = upper-lower, pos = width > 0 ? (close-lower)/width : null;
    let bolge = 'YOK';
    if (pos !== null) bolge = pos < .20 ? 'ALT' : pos < .45 ? 'ORTA_ALT' : pos <= .55 ? 'ORTA' : pos <= .80 ? 'ORTA_UST' : 'UST';
    return { lower, mid, upper, close, position:pos, bolge, widthYuzde:mid ? width/mid*100 : null };
}

async function varlikSnapshot(symbol) {
    const bbTf = ayarlar.blackboxBollingerTf || ayarlar.pusuPeriyodu || '15m';
    const rows = await Promise.all(TFS.map(async tf => {
        const mumlar = await mumlariCek(symbol, tf, Math.max(80, Number(ayarlar.superTrendPeriod || 10) * 5));
        const st = hesaplaSuperTrend(mumlar);
        if (!['UP','DOWN'].includes(st.trend)) throw new Error(`N5_CONTEXT_TREND_INCOMPLETE:${symbol}:${tf}`);
        return { tf, st, bb: tf === bbTf ? hesaplaBollinger(mumlar) : null };
    }));
    const superTrend = {}; let bollinger = null;
    for (const row of rows) { superTrend[row.tf] = row.st; if (row.bb) bollinger = row.bb; }
    if (!bollinger) throw new Error(`N5_CONTEXT_BB_INCOMPLETE:${symbol}:${bbTf}`);
    return { symbol, superTrend, bollinger };
}

function strategySignatureOlustur(symbol, yon, btc, coin) {
    const y = String(yon || '').toUpperCase();
    const btcUyumlu = uyumluTfListesi(btc?.superTrend, y), coinUyumlu = uyumluTfListesi(coin?.superTrend, y);
    const btcBits = uyumBitleri(btc?.superTrend, y), coinBits = uyumBitleri(coin?.superTrend, y);
    const bb = coin?.bollinger?.bolge || 'YOK';
    // Family registry geriye uyumluluk için BTC_TF/COIN_TF alanlarını korur; LAB anahtarı bunları normalize ederek YON+BTC+COIN+BB kullanır.
    const key = `YON=${y}|BTC=${btcBits}|COIN=${coinBits}|BTC_TF=${tfListeMetni(btcUyumlu)}|COIN_TF=${tfListeMetni(coinUyumlu)}|BB=${bb}`;
    const family = dnaIdentity.ensure(key, { source: 'ST2_CORE_N5_CONTEXT' }) || {};
    const lab = dnaHierarchy.ensureLab(key, { source: 'ST2_CORE_N5_CONTEXT' });
    return {
        dnaId: family.id || null, dnaLabel: family.label || 'DNA #YOK', identityKey: family.key || dnaIdentity.identityKey(key),
        labDnaId: lab?.id || null, labDnaLabel: lab?.label || 'LAB #YOK', labIdentityKey: lab?.key || dnaHierarchy.labKey(key),
        yon:y, symbol, btcBits, coinBits, bb, key,
        btcUyumluTf:btcUyumlu, coinUyumluTf:coinUyumlu,
        btcKarsiTf:karsiTfListesi(btc?.superTrend,y), coinKarsiTf:karsiTfListesi(coin?.superTrend,y)
    };
}

async function snapshotAl(symbol, yon, kayitTipi = 'ACILIS') {
    const zaman = new Date().toISOString();
    const [btc, coin] = await timeoutIle(
        Promise.all([varlikSnapshot('BTCUSDT'), varlikSnapshot(symbol)]),
        BLACKBOX_SNAPSHOT_TIMEOUT_MS,
        `N5_CONTEXT_SNAPSHOT_TIMEOUT:${symbol}`
    );
    const btcUyum = uyumSay(btc.superTrend, yon), coinUyum = uyumSay(coin.superTrend, yon);
    return {
        kayitTipi, zaman, symbol, yon, btc, coin,
        uyum: { btc:btcUyum, coin:coinUyum, toplam:{uygun:btcUyum.uygun+coinUyum.uygun, toplam:btcUyum.toplam+coinUyum.toplam} },
        strategySignature: strategySignatureOlustur(symbol, yon, btc, coin)
    };
}

module.exports = { snapshotAl, strategySignatureOlustur, hesaplaSuperTrend, hesaplaBollinger, varlikSnapshot };
