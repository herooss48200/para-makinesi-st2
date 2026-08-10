'use strict';

/**
 * AGROS ST2 — 1m Renko Entry Confirmation Full-Lifecycle Shadow Lab
 *
 * Amaç:
 * - Golden Renko canlı girişini ASLA açmaz, geciktirmez veya engellemez.
 * - LONG  : kapanmış RED -> GREEN dönüşünden sonra +0.25T/+0.50T/+0.75T.
 * - SHORT : kapanmış GREEN -> RED dönüşünden sonra -0.25T/-0.50T/-0.75T.
 * - Ana işlem kapanınca iki ayrı kanıt üretir:
 *   1) SAME_WINDOW: ana kapanış anındaki karşılaştırma.
 *   2) FULL_LIFECYCLE: aday kendi tetik/stop/Renko koruma yaşamını sürdürür.
 * - Açık deneyler state dosyasına yazılır ve restart sonrası devam eder.
 * - Bu modül emir göndermez. R22.1 sonrası LEGACY 1m Full Lifecycle yalnız tanı/hafıza katmanıdır;
 *   gerçek DIRECT/CONFIRMED seçiminde oy kullanmaz. Tek gerçek emir kapısı 72/motor zinciridir.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ayarlar = require('./ayarlar.js');
const renkoExitEvolution = require('./74_st2_renko_exit_evolution.js');
const sanalDynamicExit = require('./51_sanal_dynamic_exit_executor.js');

const VERSION = 'v6.12.3-R2-RENKO-ENTRY-CONFIRMATION-FULL-LIFECYCLE-SHADOW';
const DATA_DIR = process.env.AGROS_DATA_DIR
    ? path.resolve(process.env.AGROS_DATA_DIR)
    : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-renko-entry-confirmation-shadow.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const LEDGER_FILE = path.join(DATA_DIR, 'st2-renko-entry-confirmation-shadow-ledger.jsonl');

let stateCache = null;
let dirty = false;
let lastPersistAt = 0;

function n(value, fallback = 0) {
    const x = Number(value);
    return Number.isFinite(x) ? x : fallback;
}
function round(value, digits = 8) { return Number(n(value).toFixed(digits)); }
function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
}
function nowIso(at = Date.now()) { return new Date(n(at, Date.now())).toISOString(); }
function hash(parts) {
    return crypto.createHash('sha1').update(parts.map(x => String(x ?? '')).join('|')).digest('hex').slice(0, 20).toUpperCase();
}
function settings() {
    const raw = Array.isArray(ayarlar.renkoGirisTeyitShadowAdayTugla)
        ? ayarlar.renkoGirisTeyitShadowAdayTugla
        : [0.25, 0.50, 0.75];
    const candidates = [...new Set(raw.map(Number).filter(x => Number.isFinite(x) && x > 0))].sort((a, b) => a - b);
    return {
        active: ayarlar.renkoGirisTeyitShadowAktif !== false,
        candidates: candidates.length ? candidates : [0.25, 0.50, 0.75],
        initialStopPct: Math.max(0.05, n(ayarlar.renkoGirisTeyitShadowStopYuzde, ayarlar.sabitStopYuzdesi || 1.5)),
        commissionRate: Math.max(0, n(ayarlar.sanalKomisyonOrani, 0.0005)),
        floorPct: Math.max(0, n(ayarlar.renkoGirisTeyitShadowTabanTetikYuzde, 0.50)),
        takeoverPct: Math.max(0, n(ayarlar.renkoGirisTeyitShadowTakeoverYuzde, 0.60)),
        maxBrickLookback: Math.max(4, Math.floor(n(ayarlar.renkoGirisTeyitShadowBakisTugla, 40))),
        triggerWaitMs: Math.max(5, n(ayarlar.renkoGirisTeyitShadowTetikBeklemeDakika, 60)) * 60_000,
        maxLifecycleMs: Math.max(15, n(ayarlar.renkoGirisTeyitShadowMaksYasamDakika, 360)) * 60_000,
        persistEveryMs: Math.max(1_000, n(ayarlar.renkoGirisTeyitShadowStateKayitAraligiMs, 15_000)),
        completedKeep: Math.max(50, Math.floor(n(ayarlar.renkoGirisTeyitShadowTamamlananSakla, 500)))
    };
}
function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function atomicWriteJson(file, value) {
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
}
function appendLedger(row) {
    ensureDir();
    fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(row)}\n`);
}
function blankMetric() {
    return {
        n: 0, triggered: 0, noEntry: 0, tp: 0, sl: 0, be: 0,
        stopHit: 0, floorReached: 0, takeoverReached: 0,
        net: 0, grossProfit: 0, grossLoss: 0,
        avoidedLoss: 0, missedProfit: 0, mfeSum: 0, maeSum: 0,
        lastAt: null
    };
}
function blankState() {
    return {
        version: VERSION,
        updatedAt: null,
        settings: settings(),
        activeExperiments: {},
        completedExperiments: [],
        processedParentCloseIds: {},
        processedLifecycleIds: {},
        sameWindow: { totals: blankMetric(), profiles: {} },
        lifecycle: { totals: blankMetric(), profiles: {} },
        health: { loadedActive: 0, duplicateParentClose: 0, duplicateLifecycle: 0, saveErrors: 0, loadErrors: 0 }
    };
}
function normalizeMetricSet(raw = {}) {
    const profiles = {};
    for (const [key, value] of Object.entries(raw.profiles || {})) profiles[key] = { ...blankMetric(), ...(value || {}) };
    return { totals: { ...blankMetric(), ...(raw.totals || {}) }, profiles };
}
function hydrate(raw) {
    const base = blankState();
    const out = {
        ...base,
        ...(raw && typeof raw === 'object' ? raw : {}),
        settings: settings(),
        activeExperiments: { ...(raw?.activeExperiments || {}) },
        completedExperiments: Array.isArray(raw?.completedExperiments) ? raw.completedExperiments : [],
        processedParentCloseIds: { ...(raw?.processedParentCloseIds || {}) },
        processedLifecycleIds: { ...(raw?.processedLifecycleIds || {}) },
        sameWindow: normalizeMetricSet(raw?.sameWindow),
        lifecycle: normalizeMetricSet(raw?.lifecycle),
        health: { ...base.health, ...(raw?.health || {}) }
    };
    out.health.loadedActive = Object.keys(out.activeExperiments).length;
    return out;
}
function readState() {
    if (stateCache) return stateCache;
    ensureDir();
    try {
        stateCache = hydrate(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    } catch (_) {
        try { stateCache = hydrate(JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'))); }
        catch (e) {
            stateCache = blankState();
            if (fs.existsSync(STATE_FILE) || fs.existsSync(BACKUP_FILE)) stateCache.health.loadErrors++;
        }
    }
    return stateCache;
}
function markDirty() { dirty = true; }
function saveState(force = false, at = Date.now()) {
    if (!dirty && !force) return false;
    const cfg = settings();
    if (!force && at - lastPersistAt < cfg.persistEveryMs) return false;
    const state = readState();
    state.version = VERSION;
    state.settings = cfg;
    state.updatedAt = nowIso(at);
    try {
        ensureDir();
        if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, BACKUP_FILE);
        atomicWriteJson(STATE_FILE, state);
        dirty = false;
        lastPersistAt = at;
        return true;
    } catch (e) {
        state.health.saveErrors = n(state.health.saveErrors) + 1;
        console.error(`⚠️ [RENKO ENTRY CONFIRMATION SHADOW STATE] ${e.message}`);
        return false;
    }
}
function pruneMap(map, max = 5000) {
    const ids = Object.keys(map || {});
    if (ids.length <= max) return;
    ids.sort((a, b) => String(map[a]).localeCompare(String(map[b])));
    for (const id of ids.slice(0, ids.length - max)) delete map[id];
}
function colorOf(brick) {
    const raw = String(brick?.color || brick?.renk || '').toUpperCase();
    if (raw === 'GREEN' || raw === 'G') return 'GREEN';
    if (raw === 'RED' || raw === 'R') return 'RED';
    const open = n(brick?.open, NaN);
    const close = n(brick?.close, NaN);
    if (Number.isFinite(open) && Number.isFinite(close)) return close >= open ? 'GREEN' : 'RED';
    return 'UNKNOWN';
}
function closedBricks(bricks, at = Date.now()) {
    return (Array.isArray(bricks) ? bricks : []).filter(x => {
        const close = n(x?.close, NaN);
        const closeTime = n(x?.closeTime, 0);
        return Number.isFinite(close) && (closeTime <= 0 || closeTime <= at);
    });
}
function findLatestReversal(bricks, yon, at = Date.now(), lookback = settings().maxBrickLookback) {
    const direction = String(yon || '').toUpperCase();
    const source = closedBricks(bricks, at).slice(-Math.max(4, lookback));
    const expectedA = direction === 'LONG' ? 'RED' : 'GREEN';
    const expectedB = direction === 'LONG' ? 'GREEN' : 'RED';
    for (let i = source.length - 1; i >= 1; i--) {
        const a = source[i - 1];
        const b = source[i];
        if (colorOf(a) !== expectedA || colorOf(b) !== expectedB) continue;
        return {
            found: true,
            direction,
            pair: `${expectedA}->${expectedB}`,
            index: i,
            previous: {
                id: a?.id ?? null, color: colorOf(a), open: n(a?.open), high: n(a?.high),
                low: n(a?.low), close: n(a?.close), closeTime: n(a?.closeTime, 0)
            },
            confirmation: {
                id: b?.id ?? null, color: colorOf(b), open: n(b?.open), high: n(b?.high),
                low: n(b?.low), close: n(b?.close), closeTime: n(b?.closeTime, 0)
            },
            subsequent: source.slice(i).map(x => ({
                id: x?.id ?? null, color: colorOf(x), open: n(x?.open), high: n(x?.high),
                low: n(x?.low), close: n(x?.close), closeTime: n(x?.closeTime, 0)
            }))
        };
    }
    return { found: false, direction, pair: `${expectedA}->${expectedB}`, subsequent: [] };
}
function triggerReached(direction, priceOrPoint, target) {
    const high = n(priceOrPoint?.high ?? priceOrPoint, NaN);
    const low = n(priceOrPoint?.low ?? priceOrPoint, NaN);
    const close = n(priceOrPoint?.close ?? priceOrPoint, NaN);
    return direction === 'LONG'
        ? [high, close].some(x => Number.isFinite(x) && x >= target)
        : [low, close].some(x => Number.isFinite(x) && x <= target);
}
function stopPrice(direction, entryPrice, stopPct = settings().initialStopPct) {
    if (!(entryPrice > 0)) return 0;
    return direction === 'LONG' ? entryPrice * (1 - stopPct / 100) : entryPrice * (1 + stopPct / 100);
}
function movePct(direction, entryPrice, price) {
    if (!(entryPrice > 0) || !(price > 0)) return 0;
    return direction === 'LONG'
        ? ((price - entryPrice) / entryPrice) * 100
        : ((entryPrice - price) / entryPrice) * 100;
}
function experimentIdFor(sym, yon, at, base, box) {
    return `RECS-${hash([sym, yon, at, base, box])}`;
}
function candidateTemplate(direction, distanceT, base, box, subsequent, at) {
    const target = direction === 'LONG' ? base + distanceT * box : base - distanceT * box;
    const hitPoint = (Array.isArray(subsequent) ? subsequent : []).find(x => triggerReached(direction, x, target));
    return {
        id: null,
        distanceT,
        label: `${distanceT.toFixed(2)}T`,
        targetPrice: round(target),
        status: hitPoint ? 'OPEN_PENDING_BIND' : 'WAITING',
        triggered: Boolean(hitPoint),
        triggeredAt: hitPoint ? n(hitPoint.closeTime, at) : null,
        initialPath: hitPoint
            ? subsequent.filter(x => n(x.closeTime, 0) >= n(hitPoint.closeTime, 0)).map(x => ({ price: n(x.close), at: n(x.closeTime, at) }))
            : [],
        sameWindow: null,
        lifecycle: null
    };
}
function entrySnapshot(sym, yon, bricks, boxSize, actualEntryPrice, meta = {}) {
    const cfg = settings();
    const direction = String(yon || '').toUpperCase();
    const at = n(meta.at, Date.now());
    const box = n(boxSize, 0);
    const reversal = findLatestReversal(bricks, direction, at, cfg.maxBrickLookback);
    const base = n(reversal?.confirmation?.close, 0);
    const experimentId = experimentIdFor(sym, direction, at, base, box);
    const snapshot = {
        version: VERSION,
        experimentId,
        shadowOnly: true,
        blocksEntry: false,
        scope: 'SAME_WINDOW_PLUS_FULL_LIFECYCLE',
        lifecyclePolicy: 'FIXED_INITIAL_STOP_PLUS_FROZEN_DYNAMIC_EXIT_AND_RENKO_PROTECTION',
        sym,
        yon: direction,
        actualEntryPrice: round(actualEntryPrice),
        boxSize: round(box),
        createdAtMs: at,
        createdAt: nowIso(at),
        expiresAtMs: at + cfg.triggerWaitMs,
        reversal,
        candidates: [],
        settings: cfg,
        williamsTurnState: meta.williamsTurnState || null,
        patternCode: String(meta.patternCode || meta.patternKodu || 'UNKNOWN').toUpperCase(),
        patternId: meta.patternId || null
    };
    if (!cfg.active) { snapshot.reason = 'DISABLED'; return snapshot; }
    if (!reversal.found) { snapshot.reason = 'REVERSAL_PAIR_NOT_FOUND'; return snapshot; }
    if (!(box > 0)) { snapshot.reason = 'BOX_SIZE_INVALID'; return snapshot; }
    snapshot.basePrice = round(base);
    snapshot.reason = 'READY';
    snapshot.candidates = cfg.candidates.map(distanceT => {
        const candidate = candidateTemplate(direction, distanceT, base, box, reversal.subsequent, at);
        candidate.id = `${experimentId}-${candidate.label}`;
        if (!candidate.triggered && triggerReached(direction, actualEntryPrice, candidate.targetPrice)) {
            candidate.triggered = true;
            candidate.status = 'OPEN_PENDING_BIND';
            candidate.triggeredAt = at;
            candidate.initialPath = [{ price: n(actualEntryPrice), at }];
        }
        return candidate;
    });
    console.log(`🧪 [RENKO ENTRY CONFIRMATION SHADOW] ${sym} ${direction} | ${reversal.pair} | Base ${snapshot.basePrice} | ${snapshot.candidates.map(x => `${x.label}:${x.status}`).join(' ')} | SAME+FULL yaşam | LEGACY 1m SHADOW; laboratuvar emir göndermez; gerçek Entry Mode seçim yetkisi YOK`);
    return snapshot;
}
function positionSnapshot(pos) {
    return pos?.girisAnalizi?.renkoEntryConfirmationShadow || pos?.renkoEntryConfirmationShadow || null;
}
function frozenEntryAnalysis(pos, snap) {
    const ga = clone(pos?.girisAnalizi || {}) || {};
    delete ga.renkoEntryConfirmationShadow;
    ga.renkoBoxSize = n(ga.renkoBoxSize, snap.boxSize);
    ga.entryConfirmationShadowParent = snap.experimentId;
    return ga;
}
function parentTradeId(pos, snap) {
    return String(pos?.tradeId || pos?.sanalOrderId || pos?.borsaOrderId || pos?.id || snap.experimentId);
}
function parentNotional(pos, snap) {
    const direct = n(pos?.pozisyonDegeri ?? pos?.gerceklesenNotionalUsdt ?? pos?.hedefNotionalUsdt, 0);
    if (direct > 0) return direct;
    const qty = n(pos?.miktar, 0);
    const entry = n(pos?.girisFiyati, snap.actualEntryPrice);
    return qty > 0 && entry > 0 ? qty * entry : 100;
}
function createExperiment(pos, snap, at = Date.now()) {
    const cfg = { ...settings(), ...(snap.settings || {}) };
    let assignment = clone(pos?.renkoExitAssignment);
    if (!assignment) {
        try { assignment = clone(renkoExitEvolution.assign(pos)); }
        catch (_) { assignment = null; }
    }
    const exp = {
        id: snap.experimentId,
        version: VERSION,
        sym: snap.sym || pos?.sym,
        yon: snap.yon || pos?.yon,
        createdAtMs: n(snap.createdAtMs, at),
        createdAt: snap.createdAt || nowIso(at),
        expiresAtMs: n(snap.expiresAtMs, n(snap.createdAtMs, at) + cfg.triggerWaitMs),
        parentTradeId: parentTradeId(pos, snap),
        parentClosedAtMs: null,
        parent: null,
        actualEntryPrice: n(pos?.girisFiyati, snap.actualEntryPrice),
        basePrice: n(snap.basePrice),
        boxSize: n(snap.boxSize),
        reversal: clone(snap.reversal),
        williamsTurnState: snap.williamsTurnState || null,
        settings: cfg,
        notional: parentNotional(pos, snap),
        commissionRate: cfg.commissionRate,
        entryAnalysis: frozenEntryAnalysis(pos, snap),
        frozenExitAssignment: assignment,
        frozenDynamicExitAssignment: clone(pos?.executionExitAssignment),
        frozenExitPlanShadow: clone(pos?.exitPlanShadow),
        frozenLifecycleProfile: clone(pos?.labLifecycleProfile),
        frozenBeTriggerPct: pos?.labBeTetikYuzde ?? null,
        frozenBeBufferPct: pos?.labBeTamponYuzde ?? null,
        candidates: clone(snap.candidates || []) || []
    };
    for (const candidate of exp.candidates) {
        candidate.id = candidate.id || `${exp.id}-${candidate.label}`;
        candidate.sameWindow = candidate.sameWindow || null;
        candidate.lifecycle = candidate.lifecycle || null;
    }
    return exp;
}
function ensureExperiment(pos, at = Date.now()) {
    const snap = positionSnapshot(pos);
    if (!snap || snap.shadowOnly !== true || snap.reason !== 'READY') return { state: readState(), exp: null, snap, created: false };
    const state = readState();
    let exp = state.activeExperiments[snap.experimentId];
    let created = false;
    if (!exp) {
        exp = createExperiment(pos, snap, at);
        state.activeExperiments[exp.id] = exp;
        created = true;
        markDirty();
    } else {
        exp.parentTradeId = exp.parentTradeId || parentTradeId(pos, snap);
        exp.notional = exp.notional > 0 ? exp.notional : parentNotional(pos, snap);
        exp.frozenExitAssignment = exp.frozenExitAssignment || clone(pos?.renkoExitAssignment);
    }
    return { state, exp, snap, created };
}
function newSyntheticPosition(exp, candidate, at) {
    const cfg = exp.settings || settings();
    const entry = n(candidate.targetPrice);
    const notional = Math.max(0.000001, n(exp.notional, 100));
    const assignment = clone(exp.frozenExitAssignment) || {};
    assignment.assignmentId = `${assignment.assignmentId || 'RXT-SHADOW'}-${candidate.label}`;
    assignment.renkoBoxAtOpen = n(assignment.renkoBoxAtOpen, n(exp.entryAnalysis?.renkoBoxSize, exp.boxSize));
    return {
        sym: exp.sym,
        yon: exp.yon,
        girisFiyati: entry,
        sl: round(stopPrice(exp.yon, entry, cfg.initialStopPct)),
        ilkSl: round(stopPrice(exp.yon, entry, cfg.initialStopPct)),
        miktar: notional / entry,
        pozisyonDegeri: notional,
        sanal: true,
        acilisZamani: at,
        girisAnalizi: clone(exp.entryAnalysis) || {},
        renkoExitAssignment: assignment,
        executionExitAssignment: clone(exp.frozenDynamicExitAssignment),
        exitPlanShadow: clone(exp.frozenExitPlanShadow),
        labLifecycleProfile: clone(exp.frozenLifecycleProfile),
        labBeTetikYuzde: exp.frozenBeTriggerPct,
        labBeTamponYuzde: exp.frozenBeBufferPct,
        execution: { pricePath: [] },
        renkoExitActivated: false,
        renkoProfitFloorLocked: false,
        breakevenAktif: false,
        renkoEntryConfirmationSynthetic: true,
        renkoEntryConfirmationCandidateId: candidate.id
    };
}
function updateExcursions(candidate, direction, price) {
    if (!candidate.lifecycle || candidate.lifecycle.status !== 'OPEN') return;
    const entry = n(candidate.lifecycle.entryPrice);
    const p = n(price);
    if (!(entry > 0) || !(p > 0)) return;
    candidate.lifecycle.maxPrice = Math.max(n(candidate.lifecycle.maxPrice, entry), p);
    candidate.lifecycle.minPrice = Math.min(n(candidate.lifecycle.minPrice, entry), p);
    const favorable = direction === 'LONG' ? candidate.lifecycle.maxPrice : candidate.lifecycle.minPrice;
    const adverse = direction === 'LONG' ? candidate.lifecycle.minPrice : candidate.lifecycle.maxPrice;
    candidate.lifecycle.mfePct = round(Math.max(0, movePct(direction, entry, favorable)), 6);
    candidate.lifecycle.maePct = round(Math.min(0, movePct(direction, entry, adverse)), 6);
    const synthetic = candidate.lifecycle.syntheticPos || {};
    candidate.lifecycle.floorReached ||= synthetic.renkoProfitFloorLocked === true || candidate.lifecycle.mfePct >= n((candidate.lifecycle.settings || {}).floorPct, 0.50);
    candidate.lifecycle.takeoverReached ||= synthetic.renkoExitActivated === true || candidate.lifecycle.mfePct >= n((candidate.lifecycle.settings || {}).takeoverPct, 0.60);
}
function openCandidate(exp, candidate, at, price) {
    if (candidate.lifecycle?.status === 'OPEN' || candidate.lifecycle?.status === 'CLOSED') return false;
    candidate.triggered = true;
    const frozenTriggerAt = n(candidate.triggeredAt, 0);
    candidate.triggeredAt = frozenTriggerAt > 0 ? frozenTriggerAt : at;
    candidate.status = 'OPEN';
    const syntheticPos = newSyntheticPosition(exp, candidate, candidate.triggeredAt);
    candidate.lifecycle = {
        status: 'OPEN',
        openedAtMs: candidate.triggeredAt,
        openedAt: nowIso(candidate.triggeredAt),
        expiresAtMs: candidate.triggeredAt + n(exp.settings?.maxLifecycleMs, settings().maxLifecycleMs),
        entryPrice: n(candidate.targetPrice),
        initialStopPrice: n(syntheticPos.sl),
        currentStopPrice: n(syntheticPos.sl),
        maxPrice: n(candidate.targetPrice),
        minPrice: n(candidate.targetPrice),
        mfePct: 0,
        maePct: 0,
        floorReached: false,
        takeoverReached: false,
        syntheticPos,
        settings: { floorPct: exp.settings?.floorPct, takeoverPct: exp.settings?.takeoverPct }
    };
    console.log(`🎯 [RENKO ENTRY CONFIRMATION FULL TETİK] ${exp.sym} ${exp.yon} | ${candidate.label} | ${candidate.targetPrice} | Ana işlemden bağımsız laboratuvar yaşamı | LEGACY 1m tanı kanıtı; gerçek mode yetkisi YOK`);
    if (price > 0) updateOpenCandidate(exp, candidate, price, at, []);
    markDirty();
    return true;
}
function classifyNet(net, band = 0.000001) {
    if (net > band) return 'TP';
    if (net < -band) return 'SL';
    return 'BE';
}
function resultForExit(exp, candidate, exitPrice, reason, at) {
    const entry = n(candidate.lifecycle?.entryPrice, candidate.targetPrice);
    const notional = Math.max(0, n(exp.notional, 100));
    const commissionRate = Math.max(0, n(exp.commissionRate, exp.settings?.commissionRate));
    const grossPct = round(movePct(exp.yon, entry, exitPrice), 6);
    const gross = round(notional * grossPct / 100, 8);
    const commission = round(notional * commissionRate * 2, 8);
    const net = round(gross - commission, 8);
    return {
        candidateId: candidate.id,
        experimentId: exp.id,
        sym: exp.sym,
        yon: exp.yon,
        label: candidate.label,
        distanceT: candidate.distanceT,
        entryPrice: round(entry),
        exitPrice: round(exitPrice),
        openedAtMs: n(candidate.lifecycle?.openedAtMs),
        closedAtMs: at,
        closedAt: nowIso(at),
        reason,
        stopHit: /STOP|SL|FLOOR|TRAIL/i.test(String(reason)),
        floorReached: candidate.lifecycle?.floorReached === true,
        takeoverReached: candidate.lifecycle?.takeoverReached === true,
        mfePct: n(candidate.lifecycle?.mfePct),
        maePct: n(candidate.lifecycle?.maePct),
        grossPct,
        gross,
        commission,
        net,
        outcome: classifyNet(net, Math.max(0.000001, commission * 0.25)),
        lifecyclePolicy: 'FIXED_INITIAL_STOP_PLUS_FROZEN_DYNAMIC_EXIT_AND_RENKO_PROTECTION'
    };
}
function addMetric(metric, candidateResult, actualNet = 0) {
    const p = { ...blankMetric(), ...(metric || {}) };
    p.n++;
    if (candidateResult.outcome === 'NO_ENTRY') {
        p.noEntry++;
        if (actualNet < 0) p.avoidedLoss += Math.abs(actualNet);
        if (actualNet > 0) p.missedProfit += actualNet;
    } else {
        p.triggered++;
        if (candidateResult.outcome === 'TP') p.tp++;
        else if (candidateResult.outcome === 'SL') p.sl++;
        else p.be++;
        if (candidateResult.stopHit) p.stopHit++;
        if (candidateResult.floorReached) p.floorReached++;
        if (candidateResult.takeoverReached) p.takeoverReached++;
        p.net += n(candidateResult.net);
        if (candidateResult.net > 0) p.grossProfit += candidateResult.net;
        if (candidateResult.net < 0) p.grossLoss += Math.abs(candidateResult.net);
        p.mfeSum += n(candidateResult.mfePct);
        p.maeSum += n(candidateResult.maePct);
    }
    p.lastAt = nowIso();
    return p;
}
function recordMetric(scopeName, exp, result, actualNet = 0) {
    const state = readState();
    const scope = state[scopeName];
    if (!scope) return;
    const aggregateKey = `${exp.yon}|${result.label}`;
    const patternCode = String(exp.patternCode || 'UNKNOWN').toUpperCase();
    const exactKey = `${exp.yon}|${patternCode}|${result.label}`;
    // Eski yön-toplam profili korunur; yeni politika exact pattern + mode + offset öğrenir.
    scope.profiles[aggregateKey] = addMetric(scope.profiles[aggregateKey], result, actualNet);
    scope.profiles[exactKey] = addMetric(scope.profiles[exactKey], result, actualNet);
    scope.totals = addMetric(scope.totals, result, actualNet);
    markDirty();
}
function closeLifecycleCandidate(exp, candidate, exitPrice, reason, at = Date.now(), emitted = []) {
    if (candidate.lifecycle?.status === 'CLOSED') return null;
    const state = readState();
    const lifecycleId = `${candidate.id}|${n(candidate.lifecycle?.openedAtMs)}|${reason}`;
    if (state.processedLifecycleIds[lifecycleId]) {
        state.health.duplicateLifecycle++;
        return null;
    }
    const result = resultForExit(exp, candidate, exitPrice, reason, at);
    candidate.status = 'CLOSED';
    candidate.lifecycle = { ...candidate.lifecycle, ...result, status: 'CLOSED', syntheticPos: null };
    state.processedLifecycleIds[lifecycleId] = nowIso(at);
    pruneMap(state.processedLifecycleIds);
    recordMetric('lifecycle', exp, result, n(exp.parent?.net));
    const row = {
        type: 'RENKO_ENTRY_CONFIRMATION_FULL_LIFECYCLE_CLOSE',
        version: VERSION,
        at: nowIso(at),
        experimentId: exp.id,
        parentTradeId: exp.parentTradeId,
        parent: exp.parent,
        result
    };
    appendLedger(row);
    emitted.push(row);
    console.log(`📚 [RENKO ENTRY CONFIRMATION FULL CLOSE] ${exp.sym} ${exp.yon} | ${candidate.label} ${result.outcome} | Net ${result.net >= 0 ? '+' : ''}${result.net.toFixed(4)} | ${reason} | LEGACY 1m tanı kanıtı; gerçek mode yetkisi YOK`);
    markDirty();
    return row;
}
function noEntryLifecycle(exp, candidate, reason, at = Date.now(), emitted = []) {
    if (candidate.status === 'NO_ENTRY' || candidate.lifecycle?.status === 'CLOSED') return null;
    const state = readState();
    const lifecycleId = `${candidate.id}|NO_ENTRY|${reason}`;
    if (state.processedLifecycleIds[lifecycleId]) return null;
    const result = {
        candidateId: candidate.id, experimentId: exp.id, sym: exp.sym, yon: exp.yon,
        label: candidate.label, distanceT: candidate.distanceT, targetPrice: candidate.targetPrice,
        outcome: 'NO_ENTRY', reason, triggered: false, net: 0, gross: 0, commission: 0,
        mfePct: 0, maePct: 0, stopHit: false, floorReached: false, takeoverReached: false,
        closedAtMs: at, closedAt: nowIso(at), lifecyclePolicy: 'TRIGGER_WINDOW_EXPIRED'
    };
    candidate.status = 'NO_ENTRY';
    candidate.lifecycle = { ...result, status: 'CLOSED' };
    state.processedLifecycleIds[lifecycleId] = nowIso(at);
    pruneMap(state.processedLifecycleIds);
    recordMetric('lifecycle', exp, result, n(exp.parent?.net));
    const row = {
        type: 'RENKO_ENTRY_CONFIRMATION_FULL_LIFECYCLE_NO_ENTRY', version: VERSION,
        at: nowIso(at), experimentId: exp.id, parentTradeId: exp.parentTradeId,
        parent: exp.parent, result
    };
    appendLedger(row);
    emitted.push(row);
    console.log(`📚 [RENKO ENTRY CONFIRMATION FULL NO_ENTRY] ${exp.sym} ${exp.yon} | ${candidate.label} | ${reason} | LEGACY 1m tanı kanıtı; gerçek mode yetkisi YOK`);
    markDirty();
    return row;
}
function stopCrossed(direction, price, stop) {
    if (!(price > 0) || !(stop > 0)) return false;
    return direction === 'LONG' ? price <= stop : price >= stop;
}
function updateOpenCandidate(exp, candidate, price, at = Date.now(), emitted = []) {
    if (candidate.lifecycle?.status !== 'OPEN') return false;
    const p = n(price, 0);
    if (!(p > 0)) return false;
    updateExcursions(candidate, exp.yon, p);
    const synthetic = candidate.lifecycle.syntheticPos;
    synthetic.execution = synthetic.execution || { pricePath: [] };
    synthetic.execution.pricePath = Array.isArray(synthetic.execution.pricePath) ? synthetic.execution.pricePath : [];
    synthetic.execution.pricePath.push({ price: p, at, pnlPct: movePct(exp.yon, candidate.lifecycle.entryPrice, p) });
    if (synthetic.execution.pricePath.length > 240) synthetic.execution.pricePath = synthetic.execution.pricePath.slice(-240);
    let dynamicKarar = { active: false, close: false };
    let renkoKarar = { active: false, changed: false };
    try { dynamicKarar = sanalDynamicExit.evaluate(synthetic, p); }
    catch (e) { candidate.lifecycle.lastDynamicExitError = e.message; }
    try { renkoKarar = renkoExitEvolution.update(synthetic, p); }
    catch (e) { candidate.lifecycle.lastUpdateError = e.message; }
    if (!renkoKarar.active && dynamicKarar?.close) {
        closeLifecycleCandidate(exp, candidate, n(dynamicKarar.price, p), `FULL_DYNAMIC_EXIT:${dynamicKarar.reason || dynamicKarar.algorithmId || 'UNKNOWN'}`, at, emitted);
        return true;
    }
    candidate.lifecycle.currentStopPrice = n(synthetic?.sl, candidate.lifecycle.currentStopPrice);
    candidate.lifecycle.floorReached ||= synthetic?.renkoProfitFloorLocked === true;
    candidate.lifecycle.takeoverReached ||= synthetic?.renkoExitActivated === true;
    updateExcursions(candidate, exp.yon, p);
    const stop = n(candidate.lifecycle.currentStopPrice);
    if (stopCrossed(exp.yon, p, stop)) {
        const reason = synthetic?.renkoExitLastStopSource === 'RENKO_TUGLA_TAKIP'
            ? 'FULL_RENKO_TRAIL_STOP'
            : (synthetic?.renkoProfitFloorLocked ? 'FULL_PROFIT_FLOOR_STOP' : 'FULL_INITIAL_SL');
        closeLifecycleCandidate(exp, candidate, stop, reason, at, emitted);
        return true;
    }
    if (at >= n(candidate.lifecycle.expiresAtMs, at + 1)) {
        closeLifecycleCandidate(exp, candidate, p, 'FULL_MAX_LIFECYCLE_TIME', at, emitted);
        return true;
    }
    markDirty();
    return true;
}
function replayInitialPath(exp, candidate, emitted = []) {
    if (candidate.lifecycle?.status !== 'OPEN') return;
    const pathRows = Array.isArray(candidate.initialPath) ? candidate.initialPath : [];
    for (const row of pathRows) {
        if (candidate.lifecycle?.status !== 'OPEN') break;
        updateOpenCandidate(exp, candidate, n(row.price), n(row.at, candidate.triggeredAt), emitted);
    }
    candidate.initialPath = [];
}
function update(pos, livePrice, at = Date.now()) {
    const bound = ensureExperiment(pos, at);
    const exp = bound.exp;
    if (!exp) return { accepted: false, reason: 'NO_READY_SNAPSHOT' };
    const price = n(livePrice, 0);
    if (!(price > 0)) return { accepted: false, reason: 'PRICE_INVALID' };
    const emitted = [];
    for (const candidate of exp.candidates) {
        if ((candidate.status === 'OPEN_PENDING_BIND' || (candidate.triggered && !candidate.lifecycle)) && !candidate.lifecycle) {
            openCandidate(exp, candidate, n(candidate.triggeredAt, at), price);
            replayInitialPath(exp, candidate, emitted);
        }
        if (candidate.status === 'WAITING' && triggerReached(exp.yon, price, candidate.targetPrice)) {
            openCandidate(exp, candidate, at, price);
        }
        if (candidate.lifecycle?.status === 'OPEN') updateOpenCandidate(exp, candidate, price, at, emitted);
    }
    pos.renkoEntryConfirmationShadow = positionSnapshot(pos);
    saveState(false, at);
    return { accepted: true, experiment: exp, emitted };
}
function sameWindowCandidate(exp, candidate, closePrice, at) {
    if (!candidate.triggered || !candidate.lifecycle) {
        return {
            label: candidate.label, distanceT: candidate.distanceT, targetPrice: candidate.targetPrice,
            triggered: false, status: 'NO_ENTRY_SAME_WINDOW', outcome: 'NO_ENTRY', net: 0,
            gross: 0, commission: 0, mfePct: 0, maePct: 0,
            stopHit: false, floorReached: false, takeoverReached: false,
            fullLifecycleStatus: candidate.status
        };
    }
    if (candidate.lifecycle.status === 'CLOSED' && n(candidate.lifecycle.closedAtMs) <= at) {
        return {
            ...clone(candidate.lifecycle),
            triggered: true,
            status: 'CLOSED_BEFORE_PARENT',
            fullLifecycleStatus: 'CLOSED'
        };
    }
    const entry = n(candidate.lifecycle.entryPrice);
    const notional = Math.max(0, n(exp.notional, 100));
    const commission = round(notional * n(exp.commissionRate, exp.settings?.commissionRate) * 2, 8);
    const grossPct = round(movePct(exp.yon, entry, closePrice), 6);
    const gross = round(notional * grossPct / 100, 8);
    const net = round(gross - commission, 8);
    return {
        label: candidate.label, distanceT: candidate.distanceT, targetPrice: candidate.targetPrice,
        triggered: true, status: 'MARK_TO_MARKET_PARENT_CLOSE', outcome: classifyNet(net, Math.max(0.000001, commission * 0.25)),
        entryPrice: entry, exitPrice: closePrice, grossPct, gross, commission, net,
        mfePct: n(candidate.lifecycle.mfePct), maePct: n(candidate.lifecycle.maePct),
        stopHit: false, floorReached: candidate.lifecycle.floorReached === true,
        takeoverReached: candidate.lifecycle.takeoverReached === true,
        fullLifecycleStatus: candidate.lifecycle.status
    };
}
function close(pos, result = {}) {
    const stateBefore = readState();
    const snapBefore = positionSnapshot(pos);
    const provisionalCloseId = String(pos?.tradeId || pos?.sanalOrderId || pos?.borsaOrderId || snapBefore?.experimentId || '');
    if (provisionalCloseId && stateBefore.processedParentCloseIds[provisionalCloseId]) {
        stateBefore.health.duplicateParentClose++;
        return { accepted: false, reason: 'DUPLICATE_CLOSE', closeId: provisionalCloseId };
    }
    const bound = ensureExperiment(pos, n(result.closedAt, Date.now()));
    const exp = bound.exp;
    if (!exp) return { accepted: false, reason: 'NO_ENTRY_CONFIRMATION_SNAPSHOT' };
    if (result.restartGap === true) return { accepted: false, reason: 'RESTART_GAP' };
    const state = bound.state;
    const closeId = String(pos?.tradeId || pos?.sanalOrderId || pos?.borsaOrderId || exp.parentTradeId);
    if (state.processedParentCloseIds[closeId]) {
        state.health.duplicateParentClose++;
        return { accepted: false, reason: 'DUPLICATE_CLOSE', closeId };
    }
    const at = n(result.closedAt, Date.now());
    const closePrice = n(result.exitPrice ?? result.kapanisFiyati, 0);
    const actualNet = n(result.net ?? result.netKarZarar);
    update(pos, closePrice, at);
    exp.parentClosedAtMs = at;
    exp.parent = {
        tradeId: closeId,
        entryPrice: n(pos?.girisFiyati, exp.actualEntryPrice),
        exitPrice: closePrice,
        net: round(actualNet),
        outcome: result.outcome || result.sonuc || null,
        reason: result.reason || result.kapanisSebebi || null,
        closedAtMs: at,
        closedAt: nowIso(at)
    };
    exp.notional = Math.max(0, n(result.notional ?? result.pozisyonDegeri, exp.notional));
    exp.commissionRate = Math.max(0, n(result.commissionRate, exp.commissionRate));
    const candidates = exp.candidates.map(candidate => {
        const same = sameWindowCandidate(exp, candidate, closePrice, at);
        candidate.sameWindow = same;
        recordMetric('sameWindow', exp, same, actualNet);
        return same;
    });
    state.processedParentCloseIds[closeId] = nowIso(at);
    pruneMap(state.processedParentCloseIds);
    const row = {
        type: 'RENKO_ENTRY_CONFIRMATION_SAME_WINDOW_CLOSE',
        version: VERSION,
        at: nowIso(at),
        experimentId: exp.id,
        sym: exp.sym,
        yon: exp.yon,
        parent: exp.parent,
        scope: 'SAME_WINDOW_MARK_TO_MARKET',
        candidates,
        fullLifecycle: {
            active: exp.candidates.filter(x => x.lifecycle?.status === 'OPEN').length,
            waiting: exp.candidates.filter(x => x.status === 'WAITING').length,
            closed: exp.candidates.filter(x => x.lifecycle?.status === 'CLOSED').length
        },
        williamsTurnState: exp.williamsTurnState || null
    };
    appendLedger(row);
    markDirty();
    maybeArchive(exp, at);
    saveState(true, at);
    console.log(`📚 [RENKO ENTRY CONFIRMATION SAME WINDOW] ${exp.sym} ${exp.yon} | Gerçek ${actualNet >= 0 ? '+' : ''}${actualNet.toFixed(4)} | ${candidates.map(x => `${x.label}:${x.status}`).join(' ')} | Full yaşam devam ediyor`);
    return { accepted: true, row, candidates, actualNet, experiment: exp };
}
function allTerminal(exp) {
    return (exp.candidates || []).every(x => x.status === 'NO_ENTRY' || x.lifecycle?.status === 'CLOSED');
}
function maybeArchive(exp, at = Date.now()) {
    if (!exp?.parentClosedAtMs || !allTerminal(exp)) return false;
    const state = readState();
    const compact = {
        id: exp.id, sym: exp.sym, yon: exp.yon, parentTradeId: exp.parentTradeId,
        createdAt: exp.createdAt, completedAt: nowIso(at), parent: exp.parent,
        candidates: exp.candidates.map(x => ({
            id: x.id, label: x.label, distanceT: x.distanceT, targetPrice: x.targetPrice,
            sameWindow: x.sameWindow, lifecycle: x.lifecycle ? { ...x.lifecycle, syntheticPos: undefined } : null
        }))
    };
    state.completedExperiments.push(compact);
    const keep = settings().completedKeep;
    if (state.completedExperiments.length > keep) state.completedExperiments = state.completedExperiments.slice(-keep);
    delete state.activeExperiments[exp.id];
    markDirty();
    return true;
}
function tickAll(priceMap = {}, at = Date.now()) {
    const state = readState();
    const emitted = [];
    let changed = false;
    for (const exp of Object.values(state.activeExperiments)) {
        // Ana işlem hâlâ açıksa normal pozisyon döngüsündeki update(pos) tek otoritedir.
        // tickAll yalnız ana işlem kapandıktan sonra bağımsız yaşamı sürdürür.
        if (!exp.parentClosedAtMs) continue;
        const price = n(priceMap?.[exp.sym], 0);
        for (const candidate of exp.candidates || []) {
            if ((candidate.status === 'OPEN_PENDING_BIND' || (candidate.triggered && !candidate.lifecycle)) && !candidate.lifecycle) {
                openCandidate(exp, candidate, n(candidate.triggeredAt, at), price);
                replayInitialPath(exp, candidate, emitted);
                changed = true;
            }
            if (candidate.status === 'WAITING') {
                if (price > 0 && triggerReached(exp.yon, price, candidate.targetPrice)) {
                    openCandidate(exp, candidate, at, price);
                    changed = true;
                } else if (at >= n(exp.expiresAtMs, at + 1)) {
                    noEntryLifecycle(exp, candidate, 'FULL_TRIGGER_WINDOW_EXPIRED', at, emitted);
                    changed = true;
                }
            }
            if (candidate.lifecycle?.status === 'OPEN' && price > 0) {
                updateOpenCandidate(exp, candidate, price, at, emitted);
                changed = true;
            }
        }
        if (maybeArchive(exp, at)) changed = true;
    }
    if (changed) markDirty();
    saveState(emitted.length > 0, at);
    return {
        accepted: true,
        activeExperiments: Object.keys(readState().activeExperiments).length,
        emitted,
        telegramMessages: emitted.map(lifecycleTelegramText).filter(Boolean)
    };
}
function metricView(raw = {}) {
    const x = { ...blankMetric(), ...(raw || {}) };
    return {
        ...x,
        net: round(x.net, 6), avoidedLoss: round(x.avoidedLoss, 6), missedProfit: round(x.missedProfit, 6),
        pf: x.grossLoss > 0 ? round(x.grossProfit / x.grossLoss, 3) : (x.grossProfit > 0 ? 999 : 0),
        expectancy: x.triggered > 0 ? round(x.net / x.triggered, 6) : 0,
        wr: (x.tp + x.sl) > 0 ? round((x.tp / (x.tp + x.sl)) * 100, 2) : 0,
        avgMfe: x.triggered > 0 ? round(x.mfeSum / x.triggered, 4) : 0,
        avgMae: x.triggered > 0 ? round(x.maeSum / x.triggered, 4) : 0
    };
}
function metricSetView(raw = {}) {
    return {
        totals: metricView(raw.totals),
        profiles: Object.entries(raw.profiles || {}).map(([key, value]) => ({ key, ...metricView(value) }))
            .sort((a, b) => b.net - a.net || b.pf - a.pf || a.key.localeCompare(b.key))
    };
}
function summary() {
    const state = readState();
    const active = Object.values(state.activeExperiments || {});
    const candidates = active.flatMap(x => x.candidates || []);
    return {
        version: VERSION,
        activeExperiments: active.length,
        activeWaiting: candidates.filter(x => x.status === 'WAITING').length,
        activeOpen: candidates.filter(x => x.lifecycle?.status === 'OPEN').length,
        completedExperiments: state.completedExperiments.length,
        closedTrades: Object.keys(state.processedParentCloseIds).length,
        sameWindow: metricSetView(state.sameWindow),
        lifecycle: metricSetView(state.lifecycle),
        settings: settings(),
        health: { ...state.health }
    };
}
function signed(value, digits = 4) {
    const x = n(value);
    return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;
}
function telegramText(closeResult) {
    if (!closeResult?.accepted || !Array.isArray(closeResult.candidates)) return '';
    const lines = [
        '',
        '🧪 <b>1m RENKO GİRİŞ TEYİT GÖLGESİ</b>',
        `Mevcut işlem Net ${signed(closeResult.actualNet)} | LEGACY 1m SHADOW; laboratuvar emir göndermez; gerçek mode seçim yetkisi YOK`,
        '<b>Aynı kapanış penceresi:</b>'
    ];
    for (const x of closeResult.candidates) {
        const prefix = closeResult.row.yon === 'LONG' ? 'R→G +' : 'G→R -';
        if (!x.triggered) {
            const same = closeResult.actualNet < 0
                ? `NO ENTRY | O ana kadar önlenebilecek zarar ${signed(Math.abs(closeResult.actualNet))}`
                : `NO ENTRY | O ana kadar kaçabilecek kazanç ${signed(closeResult.actualNet)}`;
            lines.push(`${prefix}${x.label} | ${same}`);
        } else {
            lines.push(`${prefix}${x.label} | ${x.outcome} | MTM Net ${signed(x.net)} | MFE %${n(x.mfePct).toFixed(3)} | MAE %${n(x.maePct).toFixed(3)}`);
        }
    }
    const exp = closeResult.experiment;
    const waiting = exp?.candidates?.filter(x => x.status === 'WAITING').length || 0;
    const open = exp?.candidates?.filter(x => x.lifecycle?.status === 'OPEN').length || 0;
    const closed = exp?.candidates?.filter(x => x.lifecycle?.status === 'CLOSED').length || 0;
    lines.push('<b>Bağımsız tam yaşam:</b>');
    lines.push(`Ana işlem kapandı; deney kapanmadı. Bekleyen ${waiting} | Açık ${open} | Tamamlanan ${closed}.`);
    lines.push('Adaylar kendi %1.50 ilk stopu + pozisyonda dondurulmuş Dynamic Exit/Renko kâr korumasıyla restart sonrası da izlenir.');
    return lines.join('\n');
}
function lifecycleTelegramText(row) {
    const r = row?.result;
    if (!r) return '';
    const prefix = r.yon === 'LONG' ? 'R→G +' : 'G→R -';
    if (r.outcome === 'NO_ENTRY') {
        const parentNet = n(row?.parent?.net);
        const effect = parentNet < 0
            ? `Ana zararın ${signed(Math.abs(parentNet))} kadarı bu varyantta açılmayarak önlenirdi.`
            : `Ana kazanç ${signed(parentNet)} bu varyantta kaçabilirdi.`;
        return `🧪 <b>RENKO TEYİT TAM YAŞAM TAMAMLANDI</b>\n${r.sym} ${r.yon} | ${prefix}${r.label}\nNO ENTRY | ${r.reason}\n${effect}\nLEGACY 1m SHADOW; laboratuvar emir göndermez; gerçek Entry Mode seçim yetkisi YOK.`;
    }
    return `🧪 <b>RENKO TEYİT TAM YAŞAM KAPANDI</b>\n${r.sym} ${r.yon} | ${prefix}${r.label}\n${r.outcome} | Net ${signed(r.net)} | MFE %${n(r.mfePct).toFixed(3)} | MAE %${n(r.maePct).toFixed(3)}\nNeden ${r.reason} | Ana işlemden bağımsız yaşam\nLEGACY 1m SHADOW; laboratuvar emir göndermez; gerçek Entry Mode seçim yetkisi YOK.`;
}
function resetForTest(options = {}) {
    stateCache = null;
    dirty = false;
    lastPersistAt = 0;
    if (options.deleteFiles === true) {
        for (const file of [STATE_FILE, BACKUP_FILE, LEDGER_FILE]) {
            try { fs.rmSync(file, { force: true }); } catch (_) {}
        }
    }
    return readState();
}

module.exports = {
    VERSION,
    settings,
    colorOf,
    findLatestReversal,
    entrySnapshot,
    update,
    close,
    tickAll,
    summary,
    telegramText,
    lifecycleTelegramText,
    _resetForTest: resetForTest,
    _movePct: movePct,
    _stopPrice: stopPrice,
    _readState: readState,
    _saveState: saveState
};
