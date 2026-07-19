'use strict';

/**
 * AGROS v5.0.4 - Accounting Continuity Ledger
 *
 * Historical counters are preserved exactly as recorded.  A migration
 * snapshot classifies the pre-v5.0.4 difference without rewriting data.
 * Every position opened after the migration is then tracked in a compact,
 * one-open/one-close ledger so the new period always reconciles.
 */

const h = require('./1_hafiza.js');

const VERSION = 'v5.0.4-ACCOUNTING-CONTINUITY';

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
    legacy: {
      openedCounter: 0,
      scientificClosed: 0,
      restartGapClosed: 0,
      activeAtMigration: 0,
      classifiedDifference: 0,
      note: 'Pre-v5.0.4 counters preserved; difference classified, never fabricated as a close.'
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

function ensure({ initialize = true } = {}) {
  if (!h.state.accountingContinuity || typeof h.state.accountingContinuity !== 'object') {
    h.state.accountingContinuity = baseState();
  }
  const st = h.state.accountingContinuity;
  st.version = VERSION;
  st.legacy = { ...baseState().legacy, ...(st.legacy || {}) };
  st.current = { ...baseState().current, ...(st.current || {}) };
  st.recentClosedIds = Array.isArray(st.recentClosedIds) ? st.recentClosedIds.slice(-2000) : [];
  if (initialize && !st.initializedAt) initializeMigration();
  return st;
}

function initializeMigration() {
  const st = ensure({ initialize: false });
  if (st.initializedAt) return st;
  const summary = h.state.basariOzeti || {};
  const opened = n(summary.toplamAcilanEmir);
  const scientificClosed = n(summary.tp) + n(summary.sl) + n(summary.be);
  const restartGapClosed = n(h.state.restartGapOzet?.closedQuarantined);
  const activeAtMigration = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar.length : 0;
  st.initializedAt = new Date().toISOString();
  st.legacy = {
    ...st.legacy,
    openedCounter: opened,
    scientificClosed,
    restartGapClosed,
    activeAtMigration,
    classifiedDifference: Math.max(0, opened - scientificClosed - restartGapClosed - activeAtMigration)
  };
  return st;
}

function trackAtOpen(pos = {}) {
  const st = ensure();
  if (pos.accountingContinuityTracked === true) return false;
  const id = positionId(pos);
  const isReal = pos.sanal === false;
  const isPremier = !isReal && Boolean(pos.labPremierDecision?.upperLayerIncluded || pos.labPremierObservation?.upperLayerIncluded);
  const isShadow = !isReal && !isPremier;

  pos.accountingContinuityId = id;
  pos.accountingContinuityTracked = true;
  pos.accountingContinuityTrack = isReal ? 'REAL' : (isPremier ? 'LAB_PREMIER' : 'LAB_SHADOW');
  pos.accountingContinuityOpenedAt = new Date().toISOString();

  st.current.opened += 1;
  if (isReal) st.current.openedReal += 1;
  else if (isPremier) st.current.openedPremier += 1;
  else if (isShadow) st.current.openedShadow += 1;
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
    if (track === 'REAL') st.current.closedReal += 1;
    else if (track === 'LAB_PREMIER') st.current.closedPremier += 1;
    else if (track === 'LAB_SHADOW') st.current.closedShadow += 1;
  } else {
    // Old positions are not inserted into the new-period equation. Their
    // closing is retained only as a transparent legacy recovery count.
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
  const trackedActive = (Array.isArray(activePositions) ? activePositions : [])
    .filter(pos => pos?.accountingContinuityTracked === true && pos?.accountingContinuityClosed !== true).length;
  const equationActive = Math.max(0, n(st.current.opened) - n(st.current.closed));
  const difference = equationActive - trackedActive;
  return {
    version: VERSION,
    initializedAt: st.initializedAt,
    legacy: { ...st.legacy },
    current: { ...st.current },
    trackedActive,
    equationActive,
    difference,
    reconciled: difference === 0 && n(st.current.closed) <= n(st.current.opened)
  };
}

function telegramLines(activePositions = h.state.aktifPozisyonlar || []) {
  const s = snapshot(activePositions);
  const l = s.legacy;
  const c = s.current;
  return [
    `📚 Geçmiş sayaç: Açılış ${l.openedCounter} | Bilimsel kapanış ${l.scientificClosed} | Restart Gap ${l.restartGapClosed}`,
    `🧩 Tarihsel sayaç farkı: ${l.classifiedDifference} | Eski sürümlerden devralındı; kapanış gibi yazılmadı`,
    `🧾 v5.0.4 kesin defter: Açılan ${c.opened} | Kapanan ${c.closed} | Aktif ${s.trackedActive} | Mutabakat ${s.difference >= 0 ? '+' : ''}${s.difference} ${s.reconciled ? '✅' : '⚠️'}`
  ].join('\n');
}

module.exports = {
  VERSION,
  ensure,
  initializeMigration,
  trackAtOpen,
  trackAtClose,
  snapshot,
  telegramLines,
  positionId
};
