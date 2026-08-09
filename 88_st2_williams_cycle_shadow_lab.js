'use strict';

/**
 * AGROS ST2 Williams %R Cycle Shadow Lab
 *
 * Amaç:
 * - Ana ST2 Renko girişini ASLA açmaz veya engellemez.
 * - Kapanmış 1m ATR-Renko tuğlaları üzerinde Williams %R(14) hesaplar.
 * - Dar ekstrem bölgeleri izler:
 *     tepe  : -10 .. 0
 *     dip   : -100 .. -90
 * - Ayrı ziyaretleri T1/T2/T3+ ve D1/D2/D3+ olarak sayar.
 * - Uç bölgede kalmayı tek başına destek saymaz; nötr bölgeye doğru dönüşü arar.
 * - LONG: yakın dipten yukarı dönüş; SHORT: yakın tepeden aşağı dönüş.
 * - Sonuçları yalnız shadow ledger/state dosyalarına yazar.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.12.3-WILLIAMS-TURN-SHADOW-LAB';
const DATA_DIR = process.env.AGROS_DATA_DIR
    ? path.resolve(process.env.AGROS_DATA_DIR)
    : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-williams-cycle-shadow.json');
const LEDGER_FILE = path.join(DATA_DIR, 'st2-williams-cycle-shadow-ledger.jsonl');

let stateCache = null;
let stateDirty = false;
let flushScheduled = false;

function n(value, fallback = 0) {
    const x = Number(value);
    return Number.isFinite(x) ? x : fallback;
}

function round(value, digits = 6) {
    return Number(n(value).toFixed(digits));
}

function settings() {
    return {
        active: ayarlar.williamsCycleShadowAktif !== false,
        period: Math.max(2, n(ayarlar.williamsCyclePeriod, 14)),
        topEnter: Math.min(0, Math.max(-100, n(ayarlar.williamsCycleTepeEsigi, -10))),
        topExit: Math.min(0, Math.max(-100, n(ayarlar.williamsCycleTepeResetEsigi, -20))),
        bottomEnter: Math.min(0, Math.max(-100, n(ayarlar.williamsCycleDipEsigi, -90))),
        bottomExit: Math.min(0, Math.max(-100, n(ayarlar.williamsCycleDipResetEsigi, -80))),
        turnMaxBricks: Math.max(1, Math.floor(n(ayarlar.williamsCycleDonusMaxTugla, 3))),
        turnMinDelta: Math.max(0, n(ayarlar.williamsCycleDonusMinFark, 0.01)),
        neutralMid: Math.min(-1, Math.max(-99, n(ayarlar.williamsCycleGecNotrEsigi, -50)))
    };
}

function ensureDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function blankProfile() {
    return {
        n: 0, tp: 0, sl: 0, be: 0,
        net: 0, grossProfit: 0, grossLoss: 0,
        mfeSum: 0, maeSum: 0, fastStop: 0,
        lastAt: null
    };
}

function blankState() {
    return {
        version: VERSION,
        updatedAt: null,
        settings: settings(),
        symbols: {},
        profiles: {},
        totals: blankProfile(),
        processedCloseIds: {}
    };
}

function hydrate(raw) {
    const base = blankState();
    const out = {
        ...base,
        ...(raw && typeof raw === 'object' ? raw : {}),
        settings: settings(),
        symbols: { ...(raw?.symbols || {}) },
        profiles: { ...(raw?.profiles || {}) },
        totals: { ...blankProfile(), ...(raw?.totals || {}) },
        processedCloseIds: { ...(raw?.processedCloseIds || {}) }
    };
    for (const [key, value] of Object.entries(out.profiles)) {
        out.profiles[key] = { ...blankProfile(), ...(value || {}) };
    }
    return out;
}

function readState() {
    if (stateCache) return stateCache;
    try {
        stateCache = hydrate(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    } catch (_) {
        stateCache = blankState();
    }
    return stateCache;
}

function saveState() {
    const state = readState();
    state.version = VERSION;
    state.settings = settings();
    state.updatedAt = new Date().toISOString();
    ensureDir();
    const tmp = `${STATE_FILE}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
    stateDirty = false;
}

function flush() {
    if (!stateDirty) return false;
    saveState();
    return true;
}

function scheduleFlush() {
    if (!stateDirty || flushScheduled) return false;
    flushScheduled = true;
    setImmediate(() => {
        try { flush(); }
        catch (error) { console.error(`⚠️ [W%R SHADOW FLUSH] ${error.message}`); }
        finally { flushScheduled = false; }
    });
    return true;
}

function appendLedger(row) {
    ensureDir();
    fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(row)}\n`);
}

function williamsR(bricks, period = settings().period) {
    const source = Array.isArray(bricks) ? bricks : [];
    if (source.length < period) return null;
    const window = source.slice(-period);
    const highs = window.map(x => n(x?.high, NaN)).filter(Number.isFinite);
    const lows = window.map(x => n(x?.low, NaN)).filter(Number.isFinite);
    const close = n(window.at(-1)?.close, NaN);
    if (highs.length !== period || lows.length !== period || !Number.isFinite(close)) return null;
    const highest = Math.max(...highs);
    const lowest = Math.min(...lows);
    if (!(highest > lowest)) return -50;
    return Math.max(-100, Math.min(0, ((highest - close) / (highest - lowest)) * -100));
}

function zoneFor(value, cfg = settings()) {
    if (!Number.isFinite(Number(value))) return 'UNKNOWN';
    const x = Number(value);
    if (x >= cfg.topEnter && x <= 0) return 'TOP';
    if (x <= cfg.bottomEnter && x >= -100) return 'BOTTOM';
    return 'NEUTRAL';
}

function blankSymbol() {
    return {
        lastBrickKey: null,
        lastValue: null,
        previousValue: null,
        lastDelta: 0,
        brickSeq: 0,
        lastTopSeq: null,
        lastBottomSeq: null,
        currentZone: 'UNKNOWN',
        lastExtreme: null,
        topCount: 0,
        bottomCount: 0,
        precedingTopCount: 0,
        precedingBottomCount: 0,
        topArmed: true,
        bottomArmed: true,
        lastTopAt: null,
        lastBottomAt: null,
        lastEvent: null,
        events: []
    };
}

function eventCountLabel(prefix, count) {
    const value = Math.max(0, n(count));
    if (value <= 0) return `${prefix}0`;
    if (value >= 3) return `${prefix}3P`;
    return `${prefix}${value}`;
}

function advanceState(previous, value, brickKey, at = Date.now(), cfg = settings()) {
    const s = { ...blankSymbol(), ...(previous || {}) };
    if (brickKey != null && String(brickKey) === String(s.lastBrickKey)) return { state: s, event: null, changed: false };
    const before = {
        currentZone: s.currentZone, lastExtreme: s.lastExtreme,
        topArmed: s.topArmed, bottomArmed: s.bottomArmed,
        topCount: s.topCount, bottomCount: s.bottomCount,
        precedingTopCount: s.precedingTopCount, precedingBottomCount: s.precedingBottomCount
    };

    const x = Number(value);
    const previousValue = Number.isFinite(Number(s.lastValue)) ? Number(s.lastValue) : null;
    s.previousValue = previousValue;
    s.lastDelta = previousValue == null || !Number.isFinite(x) ? 0 : round(x - previousValue, 4);
    s.brickSeq = Math.max(0, n(s.brickSeq)) + 1;
    s.lastBrickKey = brickKey == null ? `${at}` : String(brickKey);
    s.lastValue = Number.isFinite(x) ? round(x, 4) : null;
    s.currentZone = zoneFor(x, cfg);

    // Histerezis: tepe/dip sınır çevresindeki küçük titreşimleri yeni ziyaret sayma.
    if (Number.isFinite(x) && x <= cfg.topExit) s.topArmed = true;
    if (Number.isFinite(x) && x >= cfg.bottomExit) s.bottomArmed = true;

    let event = null;
    if (s.currentZone === 'TOP' && s.topArmed) {
        if (s.lastExtreme === 'TOP') {
            s.topCount = Math.max(1, n(s.topCount)) + 1;
        } else {
            s.precedingBottomCount = Math.max(0, n(s.bottomCount));
            s.topCount = 1;
            s.bottomCount = 0;
        }
        s.lastExtreme = 'TOP';
        s.topArmed = false;
        s.lastTopAt = at;
        s.lastTopSeq = s.brickSeq;
        event = {
            type: 'TOP', count: s.topCount,
            precedingBottomCount: s.precedingBottomCount,
            value: round(x, 4), at
        };
    } else if (s.currentZone === 'BOTTOM' && s.bottomArmed) {
        if (s.lastExtreme === 'BOTTOM') {
            s.bottomCount = Math.max(1, n(s.bottomCount)) + 1;
        } else {
            s.precedingTopCount = Math.max(0, n(s.topCount));
            s.bottomCount = 1;
            s.topCount = 0;
        }
        s.lastExtreme = 'BOTTOM';
        s.bottomArmed = false;
        s.lastBottomAt = at;
        s.lastBottomSeq = s.brickSeq;
        event = {
            type: 'BOTTOM', count: s.bottomCount,
            precedingTopCount: s.precedingTopCount,
            value: round(x, 4), at
        };
    }

    if (event) {
        s.lastEvent = event;
        s.events = [...(Array.isArray(s.events) ? s.events : []), event].slice(-30);
    }
    const significantChange = Boolean(event)
        || before.currentZone !== s.currentZone
        || before.lastExtreme !== s.lastExtreme
        || before.topArmed !== s.topArmed
        || before.bottomArmed !== s.bottomArmed
        || before.topCount !== s.topCount
        || before.bottomCount !== s.bottomCount
        || before.precedingTopCount !== s.precedingTopCount
        || before.precedingBottomCount !== s.precedingBottomCount;
    return { state: s, event, changed: significantChange };
}

function update(sym, bricks, options = {}) {
    const cfg = settings();
    if (!cfg.active) return null;
    const source = Array.isArray(bricks) ? bricks : [];
    const last = source.at(-1);
    if (!last) return null;
    const value = williamsR(source, cfg.period);
    if (!Number.isFinite(value)) return null;
    const key = last.closeTime || last.id || `${source.length}:${last.close}`;
    const state = readState();
    const result = advanceState(state.symbols[sym], value, key, Number(last.closeTime || Date.now()), cfg);
    state.symbols[sym] = result.state;
    if (result.changed) {
        stateDirty = true;
        if (options.persist !== false) saveState();
    }
    if (result.event) {
        console.log(`🧪 [W%R SHADOW EVENT] ${sym} | ${result.event.type} ${result.event.count >= 3 ? '3+' : result.event.count} | W%R ${result.event.value.toFixed(2)} | Emir etkisi YOK`);
    }
    return { value: round(value, 4), zone: result.state.currentZone, event: result.event, state: result.state };
}

function snapshotFromState(sym, yon, symbolState, value = null) {
    const s = { ...blankSymbol(), ...(symbolState || {}) };
    const direction = String(yon || '').toUpperCase();
    const zone = s.currentZone || zoneFor(value);
    let pattern = 'NO_CYCLE';
    let supported = false;
    let sourceCount = 0;
    let currentCount = 0;
    let turnState = 'NO_RECENT_EXTREME';
    const cfg = settings();
    const seq = Math.max(0, n(s.brickSeq));
    const delta = n(s.lastDelta);
    const recentBottom = s.lastBottomSeq != null && seq - n(s.lastBottomSeq) <= cfg.turnMaxBricks;
    const recentTop = s.lastTopSeq != null && seq - n(s.lastTopSeq) <= cfg.turnMaxBricks;

    if (direction === 'LONG') {
        sourceCount = Math.max(0, n(s.precedingTopCount));
        currentCount = Math.max(0, n(s.bottomCount));
        if (recentBottom && delta > cfg.turnMinDelta) {
            turnState = Number(s.lastValue) > cfg.neutralMid ? 'LATE_NEUTRAL' : 'VALID_TURN';
        } else if (recentBottom && Math.abs(delta) <= cfg.turnMinDelta) {
            turnState = 'EXTREME_STUCK';
        } else if (recentTop && delta < -cfg.turnMinDelta) {
            turnState = 'OPPOSITE_TURN';
        }
        supported = sourceCount > 0 && currentCount > 0 && turnState === 'VALID_TURN';
        if (sourceCount > 0 && currentCount > 0) pattern = `${eventCountLabel('T', sourceCount)}-${eventCountLabel('D', currentCount)}`;
    } else if (direction === 'SHORT') {
        sourceCount = Math.max(0, n(s.precedingBottomCount));
        currentCount = Math.max(0, n(s.topCount));
        if (recentTop && delta < -cfg.turnMinDelta) {
            turnState = Number(s.lastValue) < cfg.neutralMid ? 'LATE_NEUTRAL' : 'VALID_TURN';
        } else if (recentTop && Math.abs(delta) <= cfg.turnMinDelta) {
            turnState = 'EXTREME_STUCK';
        } else if (recentBottom && delta > cfg.turnMinDelta) {
            turnState = 'OPPOSITE_TURN';
        }
        supported = sourceCount > 0 && currentCount > 0 && turnState === 'VALID_TURN';
        if (sourceCount > 0 && currentCount > 0) pattern = `${eventCountLabel('D', sourceCount)}-${eventCountLabel('T', currentCount)}`;
    }

    return {
        version: VERSION,
        shadowOnly: true,
        blocksEntry: false,
        sym,
        yon: direction,
        value: Number.isFinite(Number(value)) ? round(value, 4) : s.lastValue,
        zone,
        supported,
        pattern,
        turnState,
        lastDelta: round(s.lastDelta, 4),
        recentExtremeAge: direction === 'LONG' && s.lastBottomSeq != null ? seq - n(s.lastBottomSeq) : direction === 'SHORT' && s.lastTopSeq != null ? seq - n(s.lastTopSeq) : null,
        sourceCount,
        currentCount,
        topCount: Math.max(0, n(s.topCount)),
        bottomCount: Math.max(0, n(s.bottomCount)),
        precedingTopCount: Math.max(0, n(s.precedingTopCount)),
        precedingBottomCount: Math.max(0, n(s.precedingBottomCount)),
        thresholds: settings(),
        capturedAt: new Date().toISOString()
    };
}

function entrySnapshot(sym, yon, bricks) {
    const updated = update(sym, bricks);
    const state = readState();
    const snapshot = snapshotFromState(sym, yon, state.symbols[sym], updated?.value);
    console.log(`🔬 [W%R TURN SHADOW ENTRY] ${sym} ${String(yon).toUpperCase()} | ${snapshot.pattern} | ${snapshot.turnState} | Bölge ${snapshot.zone} | W%R ${Number(snapshot.value ?? -999).toFixed(2)} | Δ ${Number(snapshot.lastDelta || 0).toFixed(2)} | Destek ${snapshot.supported ? 'EVET' : 'HAYIR'} | Emir etkisi YOK`);
    return snapshot;
}

function addOutcome(profile, result = {}) {
    const p = { ...blankProfile(), ...(profile || {}) };
    const net = n(result.net ?? result.netKarZarar);
    const outcome = String(result.outcome || result.sonuc || '').toUpperCase();
    p.n++;
    if (outcome === 'TP') p.tp++;
    else if (outcome === 'SL') p.sl++;
    else if (outcome === 'BE') p.be++;
    else if (net > 0.000001) p.tp++;
    else if (net < -0.000001) p.sl++;
    else p.be++;
    p.net += net;
    if (net > 0) p.grossProfit += net;
    if (net < 0) p.grossLoss += Math.abs(net);
    p.mfeSum += n(result.mfeYuzde ?? result.mfePct);
    p.maeSum += n(result.maeYuzde ?? result.maePct);
    const durationMs = n(result.durationMs ?? result.sureMs);
    if ((outcome === 'SL' || net < 0) && durationMs > 0 && durationMs <= 15 * 60 * 1000) p.fastStop++;
    p.lastAt = new Date().toISOString();
    return p;
}

function close(pos, result = {}) {
    const snap = pos?.girisAnalizi?.williamsCycleShadow || pos?.williamsCycleShadow;
    if (!snap || snap.shadowOnly !== true) return { accepted: false, reason: 'NO_WILLIAMS_SHADOW_SNAPSHOT' };
    if (result.restartGap === true) return { accepted: false, reason: 'RESTART_GAP' };

    const state = readState();
    const tradeId = String(pos?.tradeId || pos?.id || pos?.positionId || pos?.sanalOrderId || '').trim();
    const closeId = tradeId;
    if (closeId && state.processedCloseIds?.[closeId]) return { accepted: false, reason: 'DUPLICATE_CLOSE', closeId };
    const supportKey = snap.supported ? 'SUPPORTED' : 'UNSUPPORTED';
    const key = `${String(pos?.yon || snap.yon || 'UNKNOWN').toUpperCase()}|${snap.pattern || 'NO_CYCLE'}|${snap.zone || 'UNKNOWN'}|${supportKey}`;
    state.profiles[key] = addOutcome(state.profiles[key], result);
    state.totals = addOutcome(state.totals, result);
    if (closeId) {
        state.processedCloseIds[closeId] = new Date().toISOString();
        const ids = Object.keys(state.processedCloseIds);
        if (ids.length > 5000) {
            ids.sort((a, b) => String(state.processedCloseIds[a]).localeCompare(String(state.processedCloseIds[b])));
            for (const id of ids.slice(0, ids.length - 5000)) delete state.processedCloseIds[id];
        }
    }
    saveState();

    const row = {
        type: 'WILLIAMS_CYCLE_SHADOW_CLOSE',
        version: VERSION,
        at: new Date().toISOString(),
        sym: pos?.sym || snap.sym,
        yon: pos?.yon || snap.yon,
        tradeId: tradeId || null,
        closeId: closeId || null,
        profileKey: key,
        snapshot: snap,
        result: {
            outcome: result.outcome || result.sonuc || null,
            net: round(result.net ?? result.netKarZarar),
            commission: round(result.commission ?? result.komisyon),
            mfeYuzde: round(result.mfeYuzde ?? result.mfePct),
            maeYuzde: round(result.maeYuzde ?? result.maePct),
            durationMs: n(result.durationMs ?? result.sureMs),
            reason: result.reason || result.kapanisSebebi || null
        }
    };
    appendLedger(row);
    console.log(`📚 [W%R SHADOW CLOSE] ${row.sym} ${row.yon} | ${snap.pattern} ${supportKey} | Net ${row.result.net >= 0 ? '+' : ''}${row.result.net.toFixed(4)} | Emir öğrenmesine etkisi YOK`);
    return { accepted: true, key, row };
}

function metricView(raw = {}) {
    const x = { ...blankProfile(), ...(raw || {}) };
    return {
        ...x,
        net: round(x.net),
        pf: x.grossLoss > 0 ? round(x.grossProfit / x.grossLoss, 3) : (x.grossProfit > 0 ? 999 : 0),
        expectancy: x.n > 0 ? round(x.net / x.n, 6) : 0,
        wr: (x.tp + x.sl) > 0 ? round((x.tp / (x.tp + x.sl)) * 100, 2) : 0,
        avgMfe: x.n > 0 ? round(x.mfeSum / x.n, 4) : 0,
        avgMae: x.n > 0 ? round(x.maeSum / x.n, 4) : 0,
        fastStopRate: x.n > 0 ? round((x.fastStop / x.n) * 100, 2) : 0
    };
}

function summary() {
    const state = readState();
    return {
        version: VERSION,
        settings: settings(),
        symbols: Object.keys(state.symbols || {}).length,
        totals: metricView(state.totals),
        profiles: Object.entries(state.profiles || {})
            .map(([key, value]) => ({ key, ...metricView(value) }))
            .sort((a, b) => b.n - a.n || b.net - a.net)
    };
}

function resetForTest() {
    stateCache = blankState();
    stateDirty = false;
    flushScheduled = false;
    return stateCache;
}

module.exports = {
    VERSION,
    settings,
    williamsR,
    zoneFor,
    advanceState,
    snapshotFromState,
    update,
    flush,
    scheduleFlush,
    entrySnapshot,
    close,
    summary,
    _resetForTest: resetForTest
};
