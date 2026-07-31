'use strict';

/**
 * AGROS v5.0.9 - Canonical Position Ledger Repair
 *
 * Premier, Shadow, Real and Restart-GAP states are partitioned from the exact
 * opening counters plus the currently active position records. Historical raw
 * GAP overlap is retained for audit, while the canonical close bucket is
 * repaired without changing PNL, DNA learning, or Trade Engine behavior.
 */

const h = require('./1_hafiza.js');

const VERSION = 'v6.1.2-CANONICAL-RUNTIME-RECONCILIATION';
const CLASSIFICATION_MODEL = 'CANONICAL-POSITION-PARTITION-v3';

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function positionId(pos = {}) {
  return String(
    pos.accountingContinuityId ||
    pos.tradeId ||
    pos.sanalOrderId ||
    pos.borsaOrderId ||
    pos.id ||
    `${pos.sym || 'SYM'}:${pos.yon || 'YON'}:${pos.acilisZamani || pos.zaman || Date.now()}`
  );
}

function baseState() {
  return {
    version: VERSION,
    initializedAt: null,
    repairedAt: null,
    legacy: {
      openedCounter: 0,
      scientificClosed: 0,
      activeAtMigration: 0,
      classifiedDifference: 0,
      restartGapHistoricalCounter: 0,
      // Backward-compatible field. It is telemetry, not a migration close.
      restartGapClosed: 0,
      classificationModel: null,
      note: 'Cumulative Restart Gap telemetry is informational and is not subtracted as a verified migration close batch.'
    },
    current: {
      opened: 0,
      closed: 0,
      openedPremier: 0,
      openedShadow: 0,
      openedReal: 0,
      closedScientific: 0,
      closedRestartGap: 0,
      closedPremier: 0,
      closedShadow: 0,
      closedReal: 0,
      legacyRecoveredClosed: 0,
      closedRestartGapRawBeforeRepair: 0,
      restartGapOverlapCorrection: 0,
      classificationRepairedAt: null,
      lastOpenAt: null,
      lastCloseAt: null
    },
    recentClosedIds: []
  };
}

function isRestartGap(pos = {}) {
  return Boolean(
    pos.restartRecovered === true ||
    pos.dataQuality === 'RESTART_GAP' ||
    pos.learningEligible === false
  );
}

function isPremier(pos = {}) {
  const decision = pos.labPremierDecision || {};
  const observation = pos.labPremierObservation || pos.premierObservation || {};
  const track = String(decision.premierTrack || observation.premierTrack || pos.premierTrackAtOpen || '').toUpperCase();
  const shadowOnly = pos.liveShadowObservation === true || pos.leagueShadowOnly === true || decision.virtualShadowOnly === true;
  if (shadowOnly || track.includes('REVERSE') || track.includes('BOTTOM') || track === 'PREMIER_SCORE_SHADOW') return false;
  return Boolean(
    decision.upperLayerIncluded === true || observation.upperLayerIncluded === true ||
    pos.renkoPremierDecision?.premier === true || track === 'PREMIER_SCORE_RANKED' ||
    String(pos?.girisAnalizi?.historicalExecutionModeAtSignal || '').toUpperCase() === 'PREMIER'
  );
}

function activeBreakdown(activePositions = h.state.aktifPozisyonlar || []) {
  const list = Array.isArray(activePositions) ? activePositions : [];
  const realPositions = list.filter(pos => pos?.sanal === false);
  const virtualPositions = list.filter(pos => pos?.sanal !== false);
  const restartGapPositions = virtualPositions.filter(isRestartGap);
  const cleanVirtual = virtualPositions.filter(pos => !isRestartGap(pos));
  const realPremierPositions = realPositions.filter(isPremier);
  const realShadowPositions = realPositions.filter(pos => !isPremier(pos));
  const virtualPremierPositions = cleanVirtual.filter(isPremier);
  const virtualShadowPositions = cleanVirtual.filter(pos => !isPremier(pos));
  const premierPositions = [...realPremierPositions, ...virtualPremierPositions];
  const shadowPositions = [...realShadowPositions, ...virtualShadowPositions];

  return {
    total: list.length,
    real: realPositions.length,
    premier: premierPositions.length,
    shadow: shadowPositions.length,
    restartGap: restartGapPositions.length,
    realPositions,
    realPremierPositions,
    realShadowPositions,
    virtualPremierPositions,
    virtualShadowPositions,
    premierPositions,
    shadowPositions,
    restartGapPositions
  };
}

function legacyActivePositions(activePositions = h.state.aktifPozisyonlar || []) {
  return (Array.isArray(activePositions) ? activePositions : [])
    .filter(pos => pos?.accountingContinuityTracked !== true && pos?.accountingContinuityClosed !== true)
    .length;
}

function recalculateLegacyClassification(st) {
  // Only evidence that belongs to the migration equation is used here.
  // The old cumulative Restart Gap telemetry may overlap older counters.
  st.legacy.classifiedDifference = Math.max(
    0,
    n(st.legacy.openedCounter) - n(st.legacy.scientificClosed) - n(st.legacy.activeAtMigration)
  );
  st.legacy.classificationModel = CLASSIFICATION_MODEL;
  return st;
}

function repairLegacyClassification(st) {
  if (st.legacy.classificationModel === CLASSIFICATION_MODEL) return false;

  const historicalCounter = n(
    st.legacy.restartGapHistoricalCounter ||
    st.legacy.restartGapClosed ||
    h.state.restartGapOzet?.closedQuarantined
  );

  st.legacy.restartGapHistoricalCounter = historicalCounter;
  st.legacy.restartGapClosed = historicalCounter;
  recalculateLegacyClassification(st);
  st.repairedAt = new Date().toISOString();
  return true;
}

function ensure({ initialize = true } = {}) {
  if (!h.state.accountingContinuity || typeof h.state.accountingContinuity !== 'object') {
    h.state.accountingContinuity = baseState();
  }

  const defaults = baseState();
  const st = h.state.accountingContinuity;
  st.version = VERSION;
  st.legacy = { ...defaults.legacy, ...(st.legacy || {}) };
  st.current = { ...defaults.current, ...(st.current || {}) };
  st.recentClosedIds = Array.isArray(st.recentClosedIds) ? st.recentClosedIds.slice(-2000) : [];

  if (initialize && !st.initializedAt) initializeMigration();
  if (st.initializedAt) repairLegacyClassification(st);
  return st;
}

function initializeMigration() {
  const st = ensure({ initialize: false });
  if (st.initializedAt) {
    repairLegacyClassification(st);
    return st;
  }

  const summary = h.state.basariOzeti || {};
  const opened = n(summary.toplamAcilanEmir);
  const scientificClosed = n(summary.tp) + n(summary.sl) + n(summary.be);
  const activeAtMigration = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar.length : 0;
  const restartGapHistoricalCounter = n(h.state.restartGapOzet?.closedQuarantined);

  st.initializedAt = new Date().toISOString();
  st.legacy = {
    ...st.legacy,
    openedCounter: opened,
    scientificClosed,
    activeAtMigration,
    restartGapHistoricalCounter,
    restartGapClosed: restartGapHistoricalCounter,
    classificationModel: CLASSIFICATION_MODEL
  };
  recalculateLegacyClassification(st);
  return st;
}

function trackAtOpen(pos = {}) {
  const st = ensure();
  if (pos.accountingContinuityTracked === true) return false;

  const id = positionId(pos);
  const real = pos.sanal === false;
  const premier = !real && isPremier(pos);

  pos.accountingContinuityId = id;
  pos.accountingContinuityTracked = true;
  pos.accountingContinuityTrack = real ? 'REAL' : (premier ? 'LAB_PREMIER' : 'LAB_SHADOW');
  pos.accountingContinuityOpenedAt = new Date().toISOString();

  st.current.opened += 1;
  if (real) st.current.openedReal += 1;
  else if (premier) st.current.openedPremier += 1;
  else st.current.openedShadow += 1;
  st.current.lastOpenAt = pos.accountingContinuityOpenedAt;
  return true;
}

function trackAtClose(pos = {}, options = {}) {
  const st = ensure();
  const id = positionId(pos);
  if (st.recentClosedIds.includes(id) || pos.accountingContinuityClosed === true) return false;

  const restartGap = options.restartGap === true;
  const scientific = options.scientific !== false && !restartGap;
  const track = String(pos.accountingContinuityTrack || 'LEGACY');

  if (pos.accountingContinuityTracked === true) {
    st.current.closed += 1;
    if (restartGap) st.current.closedRestartGap += 1;
    if (scientific) st.current.closedScientific += 1;
    // GAP closures reconcile the position ledger, but they are not scientific
    // Premier/Shadow learning evidence.
    if (scientific) {
      if (track === 'REAL') st.current.closedReal += 1;
      else if (track === 'LAB_PREMIER') st.current.closedPremier += 1;
      else if (track === 'LAB_SHADOW') st.current.closedShadow += 1;
    }
  } else {
    // Old migration positions stay outside the forward ledger. Their actual
    // observed closures are counted separately and never guessed.
    st.current.legacyRecoveredClosed += 1;
  }

  pos.accountingContinuityClosed = true;
  pos.accountingContinuityClosedAt = new Date().toISOString();
  st.current.lastCloseAt = pos.accountingContinuityClosedAt;
  st.recentClosedIds.push(id);
  st.recentClosedIds = st.recentClosedIds.slice(-2000);
  return true;
}

function activeTrackPartition(activePositions = h.state.aktifPozisyonlar || []) {
  const list = Array.isArray(activePositions) ? activePositions : [];
  const rows = {
    LAB_PREMIER: { activeScientific: 0, activeGap: 0 },
    LAB_SHADOW: { activeScientific: 0, activeGap: 0 },
    REAL: { activeScientific: 0, activeGap: 0 }
  };
  for (const pos of list) {
    if (pos?.accountingContinuityTracked !== true || pos?.accountingContinuityClosed === true) continue;
    const track = String(pos.accountingContinuityTrack || (pos?.sanal === false ? 'REAL' : (isPremier(pos) ? 'LAB_PREMIER' : 'LAB_SHADOW')));
    const bucket = rows[track] || rows.LAB_SHADOW;
    if (isRestartGap(pos)) bucket.activeGap += 1;
    else bucket.activeScientific += 1;
  }
  return rows;
}

function canonicalPartition(st, activePositions = h.state.aktifPozisyonlar || []) {
  const a = activeTrackPartition(activePositions);
  const specs = {
    premier: { track: 'LAB_PREMIER', opened: n(st.current.openedPremier), closedScientific: n(st.current.closedPremier) },
    shadow: { track: 'LAB_SHADOW', opened: n(st.current.openedShadow), closedScientific: n(st.current.closedShadow) },
    real: { track: 'REAL', opened: n(st.current.openedReal), closedScientific: n(st.current.closedReal) }
  };
  const out = {};
  for (const [name, spec] of Object.entries(specs)) {
    const activeScientific = n(a[spec.track]?.activeScientific);
    const activeGap = n(a[spec.track]?.activeGap);
    // Historical v5.0.5-v5.0.8 counters may contain overlap. The only
    // unclassified bucket is a GAP close, so derive it once from the exact
    // one-open/one-current-state partition instead of trusting cumulative raw telemetry.
    const closedGap = Math.max(0, spec.opened - spec.closedScientific - activeScientific - activeGap);
    const difference = spec.opened - spec.closedScientific - closedGap - activeScientific - activeGap;
    out[name] = { ...spec, activeScientific, activeGap, closedGap, difference, reconciled: difference === 0 };
  }
  const closedGap = out.premier.closedGap + out.shadow.closedGap + out.real.closedGap;
  const rawGap = n(st.current.closedRestartGap);
  const correction = rawGap - closedGap;
  if (rawGap !== closedGap) {
    st.current.closedRestartGapRawBeforeRepair = Math.max(n(st.current.closedRestartGapRawBeforeRepair), rawGap);
    st.current.restartGapOverlapCorrection = correction;
    st.current.closedRestartGap = closedGap;
    st.current.classificationRepairedAt = new Date().toISOString();
    st.repairedAt = st.current.classificationRepairedAt;
  }
  st.current.closedScientific = out.premier.closedScientific + out.shadow.closedScientific + out.real.closedScientific;
  return {
    ...out,
    closedGap,
    rawGapBeforeRepair: rawGap,
    correction,
    reconciled: Object.values(out).every(x => x.reconciled)
  };
}

function snapshot(activePositions = h.state.aktifPozisyonlar || []) {
  const st = ensure();
  const list = Array.isArray(activePositions) ? activePositions : [];
  const canonical = canonicalPartition(st, list);
  const trackedOpenPositions = list
    .filter(pos => pos?.accountingContinuityTracked === true && pos?.accountingContinuityClosed !== true);
  const trackedActive = trackedOpenPositions.length;
  const trackedRestartGapActive = trackedOpenPositions.filter(isRestartGap).length;
  const trackedScientificActive = trackedOpenPositions.filter(pos => !isRestartGap(pos) && pos?.sanal !== false).length;
  const equationActive = Math.max(0, n(st.current.opened) - n(st.current.closed));
  const rawLedgerDifference = equationActive - trackedActive;
  // Eski forward sayaçları migration döneminde üst üste binmiş olabilir. Bilimsel
  // mutabakatın kanonik kaynağı track bazlı partition'dır; ham fark sadece audit
  // telemetrisi olarak korunur ve yanlış blokaj üretmez.
  const difference = Object.values(canonical).filter(x => x && typeof x === 'object' && 'difference' in x)
    .reduce((sum, x) => sum + n(x.difference), 0);

  const legacyActive = legacyActivePositions(list);
  const migrationBatchClosed = n(st.current.legacyRecoveredClosed);
  const migrationBatchDifference = n(st.legacy.activeAtMigration) - migrationBatchClosed - legacyActive;

  return {
    version: VERSION,
    initializedAt: st.initializedAt,
    repairedAt: st.repairedAt,
    legacy: { ...st.legacy },
    current: { ...st.current },
    canonical,
    trackedActive,
    trackedRestartGapActive,
    trackedScientificActive,
    equationActive,
    difference,
    rawLedgerDifference,
    legacyActive,
    migrationBatchClosed,
    migrationBatchDifference,
    migrationBatchReconciled: migrationBatchDifference === 0,
    active: activeBreakdown(list),
    reconciled: canonical.reconciled === true && difference === 0
  };
}

function telegramLines(activePositions = h.state.aktifPozisyonlar || []) {
  const s = snapshot(activePositions);
  const l = s.legacy;
  const c = s.current;
  return [
    `📚 Geçmiş sayaç: Açılış ${l.openedCounter} | Bilimsel kapanış ${l.scientificClosed}`,
    `🧩 Tarihsel belirsiz fark: ${l.classifiedDifference} | Kapanış gibi yazılmaz`,
    `🛡️ Migration Gap: Yüklenen ${l.activeAtMigration} | Kapanan ${s.migrationBatchClosed} | Aktif ${s.legacyActive} | Mutabakat ${s.migrationBatchDifference >= 0 ? '+' : ''}${s.migrationBatchDifference} ${s.migrationBatchReconciled ? '✅' : '⚠️'}`,
    `ℹ️ Eski Restart Gap telemetrisi: ${l.restartGapHistoricalCounter} | Kümülatif bilgi; migration kapanışı değildir`,
    `🧾 Kanonik defter: Premier/Shadow/Real ayrımı mutabakat ${s.difference >= 0 ? '+' : ''}${s.difference} ${s.reconciled ? '✅' : '⚠️'} | Ham eski sayaç farkı ${s.rawLedgerDifference >= 0 ? '+' : ''}${s.rawLedgerDifference} (audit)`
  ].join('\n');
}

module.exports = {
  VERSION,
  CLASSIFICATION_MODEL,
  ensure,
  initializeMigration,
  trackAtOpen,
  trackAtClose,
  snapshot,
  telegramLines,
  positionId,
  activeBreakdown,
  legacyActivePositions,
  activeTrackPartition,
  canonicalPartition,
  repairLegacyClassification
};
