'use strict';

/**
 * AGROS ST2 R25.1 — MACD REPLAY SHADOW INTELLIGENCE
 *
 * - Emir/stop yetkisi YOKTUR.
 * - Mevcut kapanmış 1m + 15m mum cache'ini kullanır; yeni Binance isteği açmaz.
 * - Girişte 1m/15m MACD fotoğrafı alır.
 * - Açık pozisyonda histogram momentumunu izler; DECAY yalnız gözlemdir.
 * - +%1.50 ve üzeri MFE'de OPPOSED/REVERSAL_WARNING yalnız SHADOW kâr-koruma adayı üretir.
 * - 0.25T/0.50T/0.75T legacy confirmation shadow tetiklerinde de snapshot alınabilir.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.13.5-R25.1-MACD-REPLAY-SHADOW-INTELLIGENCE';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'st2-macd-shadow-ledger.jsonl');

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function round(v, digits = 6) { return Number(n(v).toFixed(digits)); }
function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
function nowIso(at = Date.now()) { return new Date(n(at, Date.now())).toISOString(); }
function enabled() { return ayarlar.macdShadowAktif !== false; }
function liveState() {
    try { return require('./1_hafiza.js').state || {}; }
    catch (_) { return {}; }
}
function settings() {
    return {
        fast: Math.max(2, Math.floor(n(ayarlar.macdShadowFastPeriod, 12))),
        slow: Math.max(3, Math.floor(n(ayarlar.macdShadowSlowPeriod, 26))),
        signal: Math.max(2, Math.floor(n(ayarlar.macdShadowSignalPeriod, 9))),
        decayBars: Math.max(2, Math.floor(n(ayarlar.macdShadowDecayArdisikCubuk, 2))),
        profitWatchPct: Math.max(0, n(ayarlar.macdShadowKarKorumaEsikYuzde, 1.50)),
        minHistEpsilon: Math.max(0, n(ayarlar.macdShadowHistogramEpsilon, 1e-12)),
        timelineCap: Math.max(20, Math.floor(n(ayarlar.macdShadowTimelineSakla, 120)))
    };
}

function ema(values, period) {
    const src = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    if (src.length < period) return [];
    const k = 2 / (period + 1);
    let current = src.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const out = Array(period - 1).fill(null);
    out.push(current);
    for (let i = period; i < src.length; i++) {
        current = src[i] * k + current * (1 - k);
        out.push(current);
    }
    return out;
}

function macdSeriesFromCloses(closes, cfg = settings()) {
    const src = (Array.isArray(closes) ? closes : []).map(Number).filter(Number.isFinite);
    if (src.length < cfg.slow + cfg.signal + 2) return [];
    const fast = ema(src, cfg.fast);
    const slow = ema(src, cfg.slow);
    const macd = src.map((_, i) => (Number.isFinite(fast[i]) && Number.isFinite(slow[i])) ? fast[i] - slow[i] : null);
    const validMacd = macd.filter(Number.isFinite);
    const sigValid = ema(validMacd, cfg.signal);
    const signal = Array(src.length).fill(null);
    let j = 0;
    for (let i = 0; i < macd.length; i++) {
        if (!Number.isFinite(macd[i])) continue;
        signal[i] = sigValid[j++] ?? null;
    }
    return src.map((close, i) => {
        const m = macd[i];
        const s = signal[i];
        return {
            close,
            macd: Number.isFinite(m) ? m : null,
            signal: Number.isFinite(s) ? s : null,
            histogram: Number.isFinite(m) && Number.isFinite(s) ? m - s : null
        };
    }).filter(x => Number.isFinite(x.histogram));
}

function directionalHistogram(direction, histogram) {
    const d = String(direction || '').toUpperCase();
    return d === 'SHORT' ? -n(histogram) : n(histogram);
}

function consecutiveIncreasing(values, count, eps = 0) {
    if (!Array.isArray(values) || values.length < count + 1) return false;
    const tail = values.slice(-(count + 1));
    for (let i = 1; i < tail.length; i++) if (!(tail[i] > tail[i - 1] + eps)) return false;
    return true;
}
function consecutiveDecreasing(values, count, eps = 0) {
    if (!Array.isArray(values) || values.length < count + 1) return false;
    const tail = values.slice(-(count + 1));
    for (let i = 1; i < tail.length; i++) if (!(tail[i] < tail[i - 1] - eps)) return false;
    return true;
}

function classify(direction, rows, cfg = settings()) {
    const usable = (Array.isArray(rows) ? rows : []).filter(x => Number.isFinite(Number(x?.histogram)));
    if (usable.length < cfg.decayBars + 2) return { ready: false, state: 'INSUFFICIENT' };
    const tail = usable.slice(-Math.max(cfg.decayBars + 3, 6));
    const directional = tail.map(x => directionalHistogram(direction, x.histogram));
    const current = directional.at(-1);
    const previous = directional.at(-2);
    const strengthening = consecutiveIncreasing(directional, cfg.decayBars, cfg.minHistEpsilon);
    const weakening = consecutiveDecreasing(directional, cfg.decayBars, cfg.minHistEpsilon);
    const aligned = current > cfg.minHistEpsilon;
    const opposed = current < -cfg.minHistEpsilon;
    const crossedAgainst = previous >= -cfg.minHistEpsilon && current < -cfg.minHistEpsilon;
    const crossedWith = previous <= cfg.minHistEpsilon && current > cfg.minHistEpsilon;
    const decay = aligned && weakening;
    const earlyRecovery = !aligned && consecutiveIncreasing(directional, cfg.decayBars, cfg.minHistEpsilon);
    let state = 'FLAT';
    if (crossedAgainst) state = 'REVERSAL_WARNING';
    else if (decay) state = 'DECAY';
    else if (aligned && strengthening) state = 'STRONG';
    else if (aligned) state = 'ALIGN';
    else if (earlyRecovery) state = 'EARLY_RECOVERY';
    else if (opposed) state = 'OPPOSED';
    return {
        ready: true,
        state,
        aligned,
        opposed,
        strengthening,
        decay,
        earlyRecovery,
        crossedAgainst,
        crossedWith,
        directionalHistogram: round(current, 10),
        previousDirectionalHistogram: round(previous, 10),
        histogram: round(tail.at(-1).histogram, 10),
        macd: round(tail.at(-1).macd, 10),
        signal: round(tail.at(-1).signal, 10),
        lastDirectionalBars: directional.slice(-4).map(x => round(x, 10))
    };
}

function candleSnapshot(candles, direction, timeframe, at = Date.now()) {
    const cfg = settings();
    const closed = (Array.isArray(candles) ? candles : [])
        .filter(x => n(x?.closeTime, 0) <= at && n(x?.close, 0) > 0)
        .slice(-Math.max(80, cfg.slow + cfg.signal + 20));
    const rows = macdSeriesFromCloses(closed.map(x => n(x.close)), cfg);
    const c = classify(direction, rows, cfg);
    return {
        version: VERSION,
        shadowOnly: true,
        blocksEntry: false,
        changesStop: false,
        timeframe,
        source: timeframe === '1m' ? 'CLOSED_1M_CACHE' : 'CLOSED_15M_CACHE',
        evaluatedAt: nowIso(at),
        closeTime: n(closed.at(-1)?.closeTime, 0),
        close: n(closed.at(-1)?.close, 0),
        bars: closed.length,
        ...c
    };
}

function deriveEntryCohort(oneMinute = {}, fifteenMinute = {}) {
    const one = String(oneMinute?.state || 'INSUFFICIENT').toUpperCase();
    const fifteen = String(fifteenMinute?.state || 'INSUFFICIENT').toUpperCase();
    const early15 = ['OPPOSED', 'EARLY_RECOVERY'].includes(fifteen);
    const oneStrong = one === 'STRONG';
    const oneSupports = ['STRONG', 'ALIGN'].includes(one);
    let name = 'MACD_BASELINE_SHADOW';
    if (oneStrong && early15) name = 'MACD_EARLY_REVERSAL_PREMIER_SHADOW';
    else if (oneSupports && early15) name = 'MACD_EARLY_REVERSAL_SHADOW';
    else if (oneSupports && ['STRONG', 'ALIGN', 'DECAY'].includes(fifteen)) name = 'MACD_FULL_ALIGNMENT_SHADOW';
    return {
        name,
        shadowOnly: true,
        blocksEntry: false,
        changesStop: false,
        premierCandidate: name === 'MACD_EARLY_REVERSAL_PREMIER_SHADOW',
        replayEvidence: name === 'MACD_EARLY_REVERSAL_PREMIER_SHADOW'
            ? 'R25_ENTRY_REPLAY_1M_STRONG_15M_OPPOSED_OR_EARLY_RECOVERY'
            : 'R25_ENTRY_REPLAY_OBSERVE_ONLY'
    };
}

function profitShadowDecision(peakPct, oneMinuteState) {
    const state = String(oneMinuteState || '').toUpperCase();
    const watched = n(peakPct) + 1e-9 >= settings().profitWatchPct;
    const decayObservation = watched && state === 'DECAY';
    const protectionCandidate = watched && ['REVERSAL_WARNING', 'OPPOSED'].includes(state);
    return {
        watched,
        decayObservation,
        protectionCandidate,
        suggestedProtectedProfitPct: protectionCandidate ? suggestedProtectedProfit(n(peakPct)) : null,
        shadowOnly: true,
        changesStop: false
    };
}

function entrySnapshot(sym, direction, at = Date.now(), stateOverride = null) {
    if (!enabled()) return { version: VERSION, shadowOnly: true, enabled: false };
    const state = stateOverride || liveState();
    const oneMinute = candleSnapshot(state.sniperMumlar?.[sym], direction, '1m', at);
    const fifteenMinute = candleSnapshot(state.yerelPusuHafizasi?.[sym], direction, '15m', at);
    return {
        version: VERSION,
        enabled: true,
        shadowOnly: true,
        authority: 'OBSERVE_ONLY',
        blocksEntry: false,
        changesStop: false,
        sym: String(sym || '').toUpperCase(),
        direction: String(direction || '').toUpperCase(),
        at: nowIso(at),
        oneMinute,
        fifteenMinute,
        entryCohort: deriveEntryCohort(oneMinute, fifteenMinute)
    };
}

function movePct(direction, entry, price) {
    const e = n(entry), p = n(price);
    if (!(e > 0 && p > 0)) return 0;
    return String(direction).toUpperCase() === 'SHORT' ? ((e - p) / e) * 100 : ((p - e) / e) * 100;
}
function mfePct(pos, currentPct = 0) {
    return Math.max(
        0,
        n(currentPct),
        n(pos?.journey?.mfeYuzde),
        n(pos?.journey?.mfePct),
        n(pos?.execution?.mfeYuzde),
        n(pos?.execution?.mfePct),
        n(pos?.maxKarYuzde),
        n(pos?.yuzdeselEkonomiZirveKarYuzde)
    );
}
function suggestedProtectedProfit(peakPct) {
    const activation = n(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde, 1.50);
    const firstLock = n(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde, 1.00);
    const step = Math.max(0.05, n(ayarlar.confirmedYuzdeselEkonomiAdimYuzde, 0.50));
    const distance = Math.max(0, n(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde, 0.50));
    if (peakPct + 1e-9 < activation) return null;
    const stage = Math.max(0, Math.floor((peakPct - activation + 1e-9) / step));
    const stagePeak = activation + stage * step;
    return round(Math.max(firstLock, stagePeak - distance), 4);
}
function appendLedger(row) {
    if (ayarlar.macdShadowLedgerAktif === false) return;
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(row)}\n`);
    } catch (e) {
        console.log(`⚠️ [MACD SHADOW LEDGER] ${e.message}`);
    }
}
function compactFrame(frame) {
    return frame ? {
        timeframe: frame.timeframe,
        closeTime: frame.closeTime,
        state: frame.state,
        histogram: frame.histogram,
        directionalHistogram: frame.directionalHistogram,
        macd: frame.macd,
        signal: frame.signal,
        decay: frame.decay === true,
        strengthening: frame.strengthening === true,
        earlyRecovery: frame.earlyRecovery === true
    } : null;
}
function recordEntry(posOrMeta = {}, snapshot = null, at = Date.now()) {
    const snap = snapshot || entrySnapshot(posOrMeta.sym, posOrMeta.yon, at);
    appendLedger({
        type: 'MACD_SHADOW_ENTRY', version: VERSION, at: nowIso(at), shadowOnly: true,
        sym: posOrMeta.sym, yon: posOrMeta.yon,
        entryMode: posOrMeta?.girisAnalizi?.entryMode || posOrMeta?.entryMode || null,
        entryT: n(posOrMeta?.girisAnalizi?.entryModeOffsetT, n(posOrMeta?.entryModeOffsetT)),
        oneMinute: compactFrame(snap?.oneMinute), fifteenMinute: compactFrame(snap?.fifteenMinute),
        entryCohort: clone(snap?.entryCohort)
    });
    return snap;
}

function updatePosition(pos, price, at = Date.now(), stateOverride = null) {
    if (!enabled() || !pos) return { changed: false, event: null };
    const snap = entrySnapshot(pos.sym, pos.yon, at, stateOverride);
    const one = snap.oneMinute || {};
    if (!one.ready || !(one.closeTime > 0)) return { changed: false, event: null, snapshot: snap };
    const lastProcessed = n(pos?.macdShadowLatest?.oneMinute?.closeTime, 0);
    if (lastProcessed === one.closeTime) return { changed: false, event: null, snapshot: snap };
    const currentPct = movePct(pos.yon, pos.girisFiyati, price);
    const peakPct = mfePct(pos, currentPct);
    const previousState = String(pos?.macdShadowLatest?.oneMinute?.state || '');
    const decision = profitShadowDecision(peakPct, one.state);
    const watched = decision.watched;
    const protect = decision.protectionCandidate;
    const decayObservation = decision.decayObservation;
    const suggested = decision.suggestedProtectedProfitPct;
    const event = {
        type: protect ? 'MACD_SHADOW_PROFIT_PROTECTION_CANDIDATE' : (decayObservation ? 'MACD_SHADOW_DECAY_OBSERVATION' : 'MACD_SHADOW_MOMENTUM'),
        version: VERSION,
        at: nowIso(at),
        closeTime: one.closeTime,
        sym: pos.sym,
        yon: pos.yon,
        shadowOnly: true,
        blocksEntry: false,
        changesStop: false,
        currentPct: round(currentPct, 4),
        mfePct: round(peakPct, 4),
        state: one.state,
        previousState: previousState || null,
        decay: one.decay === true,
        decayObservation,
        opposedWarning: one.state === 'OPPOSED',
        reversalWarning: one.state === 'REVERSAL_WARNING',
        suggestedProtectedProfitPct: suggested,
        oneMinute: compactFrame(one),
        fifteenMinute: compactFrame(snap.fifteenMinute)
    };
    pos.macdShadowLatest = snap;
    if (!Array.isArray(pos.macdShadowTimeline)) pos.macdShadowTimeline = [];
    const meaningful = protect || decayObservation || previousState !== one.state;
    if (meaningful) {
        pos.macdShadowTimeline.push(event);
        const cap = settings().timelineCap;
        if (pos.macdShadowTimeline.length > cap) pos.macdShadowTimeline = pos.macdShadowTimeline.slice(-cap);
        appendLedger(event);
        console.log(`🟣 [MACD SHADOW] ${pos.sym} ${pos.yon} | 1m ${one.state} | MFE +%${peakPct.toFixed(2)} | Anlık ${currentPct >= 0 ? '+' : ''}%${currentPct.toFixed(2)}${suggested !== null ? ` | SHADOW koruma adayı +%${suggested.toFixed(2)}` : (decayObservation ? ' | DECAY yalnız gözlem' : '')} | Emir/stop etkisi YOK`);
    }
    return { changed: true, meaningful, event, snapshot: snap };
}

function close(pos, result = {}, at = Date.now()) {
    if (!enabled() || !pos) return null;
    const entry = pos?.girisAnalizi?.macdShadowAtEntry || pos?.macdShadowAtEntry || null;
    const timeline = Array.isArray(pos?.macdShadowTimeline) ? pos.macdShadowTimeline : [];
    const protectionSignals = timeline.filter(x => x.type === 'MACD_SHADOW_PROFIT_PROTECTION_CANDIDATE');
    const firstProtection = protectionSignals[0] || null;
    const row = {
        type: 'MACD_SHADOW_CLOSE', version: VERSION, at: nowIso(at), shadowOnly: true,
        sym: pos.sym, yon: pos.yon,
        outcome: result.outcome || null, net: n(result.net), exitPrice: n(result.exitPrice), reason: result.reason || null,
        mfePct: mfePct(pos, n(result.fiyatKarYuzdesi)),
        entry: entry ? { oneMinute: compactFrame(entry.oneMinute), fifteenMinute: compactFrame(entry.fifteenMinute), entryCohort: clone(entry.entryCohort) } : null,
        firstProtectionSignal: firstProtection ? clone(firstProtection) : null,
        protectionSignalCount: protectionSignals.length,
        last: pos.macdShadowLatest ? { oneMinute: compactFrame(pos.macdShadowLatest.oneMinute), fifteenMinute: compactFrame(pos.macdShadowLatest.fifteenMinute) } : null
    };
    appendLedger(row);
    pos.macdShadowClose = row;
    return row;
}

function telegramText(pos) {
    const entry = pos?.girisAnalizi?.macdShadowAtEntry || pos?.macdShadowAtEntry;
    const timeline = Array.isArray(pos?.macdShadowTimeline) ? pos.macdShadowTimeline : [];
    const first = timeline.find(x => x.type === 'MACD_SHADOW_PROFIT_PROTECTION_CANDIDATE');
    if (!entry && !first) return '';
    const e1 = entry?.oneMinute?.state || 'YOK';
    const e15 = entry?.fifteenMinute?.state || 'YOK';
    const cohort = entry?.entryCohort?.name || 'MACD_BASELINE_SHADOW';
    const signal = first
        ? `İlk ters-momentum adayı: MFE +%${n(first.mfePct).toFixed(2)} | Anlık ${n(first.currentPct) >= 0 ? '+' : ''}%${n(first.currentPct).toFixed(2)} | Shadow kilit adayı +%${n(first.suggestedProtectedProfitPct).toFixed(2)}`
        : 'Ters-momentum kâr-koruma adayı oluşmadı';
    return `\n\n🟣 <b>MACD SHADOW</b>\nGiriş 1m ${e1} | 15m ${e15} | ${cohort}\n${signal}\nEmir/stop etkisi: YOK`;
}

module.exports = {
    VERSION, LEDGER_FILE, settings, ema, macdSeriesFromCloses, classify, candleSnapshot,
    entrySnapshot, deriveEntryCohort, profitShadowDecision, recordEntry, updatePosition, close, telegramText, suggestedProtectedProfit,
    _movePct: movePct, _mfePct: mfePct
};
