'use strict';
/**
 * AGROS ST2 R24 — live cohort economy cache.
 * Startup: scientific close ledger is read once to rebuild durable cohort counters.
 * Runtime: each scientific close increments counters and persists a tiny state file.
 * 30s live panel: RAM-only summary(), no ledger scan.
 */
const fs = require('fs');
const path = require('path');
const globalReconciliation = require('./78_st2_global_historical_reconciliation.js');
const winningIntelligence = require('./75_st2_winning_intelligence.js');

const VERSION = 'v6.13.5-R24-LIVE-COHORT-ECONOMY-RAM-CACHE';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-live-cohort-economy.json');

function num(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function emptyBucket() { return { n: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0 }; }
function freshState() { return { version: VERSION, rebuiltAt: null, updatedAt: null, premier: emptyBucket(), realPremier: emptyBucket(), shadow: emptyBucket(), seen: {} }; }
let state = freshState();

function premierRow(row) {
  const pos = row?.pos || row || {};
  const frozen = pos?.labPremierDecision || {};
  const observation = pos?.labPremierObservation || pos?.premierObservation || {};
  const track = String(frozen?.premierTrack || observation?.premierTrack || pos?.premierTrackAtOpen || '').toUpperCase();
  const shadowOnly = pos?.leagueShadowOnly === true || frozen?.virtualShadowOnly === true
    || ['REVERSE_PREMIER', 'REVERSE_SHADOW', 'BOTTOM_PREMIER_LONG', 'BOTTOM_PREMIER_SHORT'].includes(track);
  const upper = frozen?.upperLayerIncluded === true || observation?.upperLayerIncluded === true
    || pos?.renkoPremierDecision?.premier === true;
  return upper && !shadowOnly;
}
function realRow(row) {
  return row?.pos?.sanal === false || row?.result?.sanal === false || row?.execution?.real === true || row?.sanal === false;
}
function outcomeFrom(net, explicit) {
  const e = String(explicit || '').toUpperCase();
  if (['TP', 'SL', 'BE'].includes(e)) return e;
  return net > 1e-9 ? 'TP' : (net < -1e-9 ? 'SL' : 'BE');
}
function add(bucket, net, outcome) {
  bucket.n += 1; bucket.net += num(net);
  if (net > 1e-9) bucket.grossProfit += net;
  else if (net < -1e-9) bucket.grossLoss += Math.abs(net);
  if (outcome === 'TP') bucket.tp += 1;
  else if (outcome === 'BE') bucket.be += 1;
  else bucket.sl += 1;
}
function closeIdOf(row, fallback = '') {
  return String(row?.closeId || row?.tradeId || row?.result?.closeId || fallback || '');
}
function ingest(row, fallbackId = '') {
  const id = closeIdOf(row, fallbackId);
  if (id && state.seen[id]) return false;
  const net = Array.isArray(row?.pos) ? 0 : (row?.pos ? winningIntelligence.actualNet(row) : num(row?.result?.net ?? row?.net));
  const explicit = row?.result?.outcome || row?.result?.sonuc || row?.outcome || row?.sonuc;
  const outcome = outcomeFrom(net, explicit);
  if (premierRow(row)) {
    add(state.premier, net, outcome);
    if (realRow(row)) add(state.realPremier, net, outcome);
  } else add(state.shadow, net, outcome);
  if (id) state.seen[id] = 1;
  state.updatedAt = new Date().toISOString();
  return true;
}
function rebuild() {
  state = freshState();
  let rows = [];
  try { rows = globalReconciliation.readJsonl(globalReconciliation.LIVE_LEDGER, 'SCIENTIFIC_CLOSE'); } catch (_) { rows = []; }
  rows.forEach((row, i) => ingest(row, `BOOTSTRAP-${i}`));
  state.rebuiltAt = new Date().toISOString();
  persist();
  return summary();
}
function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (_) {}
}
function record(pos, result = {}, meta = {}) {
  const row = { pos, result: { ...result, sanal: pos?.sanal }, execution: { real: pos?.sanal === false } };
  const id = `${pos?.sym || 'UNK'}|${pos?.yon || 'UNK'}|${num(pos?.acilisZamani || pos?.zaman)}|${num(meta.closedAt || result.closedAt || Date.now())}`;
  const changed = ingest(row, id);
  if (changed) persist();
  return summary();
}
function finish(b) {
  const x = { ...b };
  x.wr = (x.tp + x.sl) ? x.tp / (x.tp + x.sl) * 100 : 0;
  x.pf = x.grossLoss > 0 ? x.grossProfit / x.grossLoss : (x.grossProfit > 0 ? 999 : 0);
  x.expectancy = x.n ? x.net / x.n : 0;
  return x;
}
function summary() {
  return {
    version: VERSION,
    rebuiltAt: state.rebuiltAt,
    updatedAt: state.updatedAt,
    premier: finish(state.premier),
    realPremier: finish(state.realPremier),
    shadow: finish(state.shadow)
  };
}

rebuild();
module.exports = { VERSION, STATE_FILE, rebuild, record, summary, premierRow, realRow };
