'use strict';

/**
 * AGROS v5.0.5 - Accounting Classification Repair
 *
 * The cumulative Restart Gap counter spans older bot sessions and therefore
 * cannot be treated as a verified close batch belonging to the v5 migration.
 * Historical counters remain untouched; the old difference is classified
 * without fabricating closes. New opens/closes continue in a separate exact
 * one-open/one-close ledger.
 */

const h = require('./1_hafiza.js');

const VERSION = 'v5.0.8-ACTIVE-EVIDENCE-RECONCILIATION';
const CLASSIFICATION_MODEL = 'ACTIVE-BATCH-ONLY-v2';

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
  return Boolean(
    pos.labPremierDecision?.upperLayerIncluded === true ||
    pos.labPremierObservation?.upperLayerIncluded === true
  );
}

function activeBreakdown(activePositions = h.state.aktifPozisyonlar || []) {
  const list = Array.isArray(activePositions) ? activePositions : [];
  const realPositions = list.filter(pos => pos?.sanal === false);
  const virtualPositions = list.filter(pos => pos?.sanal !== false);
  const restartGapPositions = virtualPositions.filter(isRestartGap);
  const cleanVirtual = virtualPositions.filter(pos => !isRestartGap(pos));
  const premierPositions = cleanVirtual.filter(isPremier);
  const shadowPositions = cleanVirtual.filter(pos => !isPremier(pos));

  return {
    total: list.length,
    real: realPositions.length,
    premier: premierPositions.length,
    shadow: shadowPositions.length,
    restartGap: restartGapPositions.length,
    realPositions,
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

function snapshot(activePositions = h.state.aktifPozisyonlar || []) {
  const st = ensure();
  const list = Array.isArray(activePositions) ? activePositions : [];
  const trackedOpenPositions = list
    .filter(pos => pos?.accountingContinuityTracked === true && pos?.accountingContinuityClosed !== true);
  const trackedActive = trackedOpenPositions.length;
  const trackedRestartGapActive = trackedOpenPositions.filter(isRestartGap).length;
  const trackedScientificActive = trackedOpenPositions.filter(pos => !isRestartGap(pos) && pos?.sanal !== false).length;
  const equationActive = Math.max(0, n(st.current.opened) - n(st.current.closed));
  const difference = equationActive - trackedActive;

  const legacyActive = legacyActivePositions(list);
  const migrationBatchClosed = n(st.current.legacyRecoveredClosed);
  const migrationBatchDifference = n(st.legacy.activeAtMigration) - migrationBatchClosed - legacyActive;

  return {
    version: VERSION,
    initializedAt: st.initializedAt,
    repairedAt: st.repairedAt,
    legacy: { ...st.legacy },
    current: { ...st.current },
    trackedActive,
    trackedRestartGapActive,
    trackedScientificActive,
    equationActive,
    difference,
    legacyActive,
    migrationBatchClosed,
    migrationBatchDifference,
    migrationBatchReconciled: migrationBatchDifference === 0,
    active: activeBreakdown(list),
    reconciled: difference === 0 && n(st.current.closed) <= n(st.current.opened)
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
    `🧾 v5.0.5 kesin defter: Açılan ${c.opened} | Kapanan ${c.closed} | Aktif ${s.trackedActive} | Mutabakat ${s.difference >= 0 ? '+' : ''}${s.difference} ${s.reconciled ? '✅' : '⚠️'}`
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
  repairLegacyClassification
};
