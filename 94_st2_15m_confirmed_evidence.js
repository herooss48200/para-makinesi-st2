'use strict';

/**
 * AGROS ST2 v6.13.5-R22 — 15m CONFIRMED Evidence Store
 *
 * Amaç:
 * - DIRECT ve gerçek 15m-CONFIRMED giriş ailelerini aynı standardize PnL yüzdesiyle saklamak.
 * - Ağır replay/bootstrap işini trade process dışında çalıştırmak.
 * - Trade process yalnız küçük hazır state'i okur ve canlı kapanışları non-blocking kaydeder.
 *
 * Bootstrap kaynağı ayrı CLI worker tarafından üretilir.
 * LIVE kaydı yalnız bilimsel olarak kabul edilen kapanışlardan gelir.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.13.5-R22-15M-CONFIRMED-EVIDENCE';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-15m-confirmed-evidence.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;

let cache = null;
let persistScheduled = false;
let persistPromise = Promise.resolve();

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function round(v, d = 8) { return Number(n(v).toFixed(d)); }
function blankMetric() {
  return { attempts: 0, n: 0, wins: 0, losses: 0, be: 0, noEntry: 0, net: 0, grossProfit: 0, grossLoss: 0, lastAt: null };
}
function blankState() {
  return {
    schema: 1,
    version: VERSION,
    updatedAt: null,
    bootstrap: { meta: { status: 'EMPTY', source: '15M_HISTORICAL_REPLAY', exact1mStModeled: false }, profiles: {} },
    live: { profiles: {}, processedCloseIds: {} },
    health: { loadErrors: 0, saveErrors: 0, duplicateClose: 0 }
  };
}
function hydrate(raw = {}) {
  const base = blankState();
  const normalizeProfiles = obj => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) out[k] = { ...blankMetric(), ...(v || {}) };
    return out;
  };
  return {
    ...base,
    ...(raw || {}),
    version: VERSION,
    bootstrap: {
      ...base.bootstrap,
      ...(raw.bootstrap || {}),
      meta: { ...base.bootstrap.meta, ...(raw.bootstrap?.meta || {}) },
      profiles: normalizeProfiles(raw.bootstrap?.profiles)
    },
    live: {
      ...base.live,
      ...(raw.live || {}),
      profiles: normalizeProfiles(raw.live?.profiles),
      processedCloseIds: { ...(raw.live?.processedCloseIds || {}) }
    },
    health: { ...base.health, ...(raw.health || {}) }
  };
}
function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function load(force = false) {
  if (cache && !force) return cache;
  ensureDir();
  for (const f of [STATE_FILE, BACKUP_FILE]) {
    try {
      if (fs.existsSync(f)) {
        cache = hydrate(JSON.parse(fs.readFileSync(f, 'utf8')));
        return cache;
      }
    } catch (_) {}
  }
  cache = blankState();
  if (fs.existsSync(STATE_FILE) || fs.existsSync(BACKUP_FILE)) cache.health.loadErrors++;
  return cache;
}
function snapshot() { return JSON.parse(JSON.stringify(load())); }
function profileKey(mode, direction, pattern, offsetT) {
  return `${String(mode || '').toUpperCase()}|${String(direction || '').toUpperCase()}|${String(pattern || 'UNKNOWN').toUpperCase()}|${Number(offsetT).toFixed(2)}T`;
}
function parseKey(key) {
  const [mode, direction, pattern, offsetRaw] = String(key || '').split('|');
  return { mode, direction, pattern, offsetT: n(String(offsetRaw || '').replace('T', '')) };
}
function metric(raw = {}) {
  const x = { ...blankMetric(), ...(raw || {}) };
  const samples = n(x.n);
  const gp = n(x.grossProfit), gl = n(x.grossLoss);
  return {
    ...x,
    samples,
    wr: samples > 0 ? n(x.wins) / samples * 100 : 0,
    pf: gl > 0 ? gp / gl : (gp > 0 ? 999 : 0),
    expectancy: samples > 0 ? n(x.net) / samples : 0
  };
}
function observe(raw, result = {}) {
  const m = raw || blankMetric();
  m.attempts = n(m.attempts) + 1;
  if (result.noEntry === true || result.triggered === false) {
    m.noEntry = n(m.noEntry) + 1;
    m.lastAt = result.at || new Date().toISOString();
    return m;
  }
  const pnl = n(result.netPct ?? result.pnlPct ?? result.net);
  m.n = n(m.n) + 1;
  if (pnl > 1e-12) m.wins = n(m.wins) + 1;
  else if (pnl < -1e-12) m.losses = n(m.losses) + 1;
  else m.be = n(m.be) + 1;
  m.net = n(m.net) + pnl;
  if (pnl >= 0) m.grossProfit = n(m.grossProfit) + pnl;
  else m.grossLoss = n(m.grossLoss) + Math.abs(pnl);
  m.lastAt = result.at || new Date().toISOString();
  return m;
}
function scaleMetric(raw, maxWeight = Infinity) {
  const m = metric(raw);
  if (!(m.samples > 0) || !Number.isFinite(maxWeight) || m.samples <= maxWeight) return { ...m, effectiveWeight: m.samples };
  const factor = maxWeight / m.samples;
  const scaled = {
    ...m,
    n: m.n * factor,
    wins: m.wins * factor,
    losses: m.losses * factor,
    be: m.be * factor,
    net: m.net * factor,
    grossProfit: m.grossProfit * factor,
    grossLoss: m.grossLoss * factor,
    attempts: m.attempts * factor,
    noEntry: m.noEntry * factor
  };
  return { ...metric(scaled), rawSamples: m.samples, effectiveWeight: maxWeight };
}
function combineMetrics(rows = []) {
  const out = blankMetric();
  for (const row of rows.filter(Boolean)) {
    out.attempts += n(row.attempts);
    out.n += n(row.n, n(row.samples));
    out.wins += n(row.wins);
    out.losses += n(row.losses);
    out.be += n(row.be);
    out.noEntry += n(row.noEntry);
    out.net += n(row.net);
    out.grossProfit += n(row.grossProfit);
    out.grossLoss += n(row.grossLoss);
    if (row.lastAt && (!out.lastAt || String(row.lastAt) > String(out.lastAt))) out.lastAt = row.lastAt;
  }
  return metric(out);
}
function rowsFor(sectionName, mode, direction, pattern = null) {
  const state = load();
  const profiles = state?.[sectionName]?.profiles || {};
  const out = [];
  for (const [key, raw] of Object.entries(profiles)) {
    const parts = parseKey(key);
    if (parts.mode !== String(mode).toUpperCase()) continue;
    if (parts.direction !== String(direction).toUpperCase()) continue;
    if (pattern && parts.pattern !== String(pattern).toUpperCase()) continue;
    out.push({ key, ...parts, raw, metric: metric(raw) });
  }
  return out;
}
function aggregateByOffset(sectionName, mode, direction, pattern = null, maxWeight = Infinity) {
  const grouped = new Map();
  for (const row of rowsFor(sectionName, mode, direction, pattern)) {
    const k = row.offsetT.toFixed(2);
    const list = grouped.get(k) || [];
    list.push(sectionName === 'bootstrap' ? scaleMetric(row.raw, maxWeight) : metric(row.raw));
    grouped.set(k, list);
  }
  return [...grouped.entries()].map(([k, list]) => ({ offsetT: Number(k), ...combineMetrics(list) }));
}
function evidence(mode, direction, pattern = 'UNKNOWN', options = {}) {
  const minSamples = Math.max(1, n(options.minSamples, 15));
  const bootstrapCap = Math.max(0, n(options.bootstrapCap, n(ayarlar.renkoGiris15mBootstrapMaksAgirlik, 30)));
  const exactPattern = String(pattern || 'UNKNOWN').toUpperCase();

  const build = scope => {
    const p = scope === 'EXACT_PATTERN' ? exactPattern : null;
    const boot = aggregateByOffset('bootstrap', mode, direction, p, bootstrapCap);
    const live = aggregateByOffset('live', mode, direction, p, Infinity);
    const offsets = [...new Set([...boot, ...live].map(x => x.offsetT))].sort((a, b) => a - b);
    return offsets.map(offsetT => {
      const b = boot.find(x => x.offsetT === offsetT);
      const l = live.find(x => x.offsetT === offsetT);
      const combined = combineMetrics([b, l]);
      return {
        mode: String(mode).toUpperCase(), direction: String(direction).toUpperCase(), pattern: p || '*', offsetT,
        evidenceScope: scope,
        evidenceTimeframe: '15M_CLOSED_RENKO_REVERSAL',
        bootstrapExact1mStModeled: load().bootstrap?.meta?.exact1mStModeled === true,
        bootstrap: b || metric({}), live: l || metric({}),
        ...combined
      };
    });
  };

  const exactRows = build('EXACT_PATTERN');
  const directionRows = build('DIRECTION_FALLBACK');
  const matureExact = exactRows.filter(x => x.samples >= minSamples);
  const matureDirection = directionRows.filter(x => x.samples >= minSamples);
  const sourceRows = matureExact.length ? matureExact : matureDirection.length ? matureDirection : exactRows.length ? exactRows : directionRows;
  const rows = [...sourceRows].sort((a, b) =>
    b.expectancy - a.expectancy || b.wr - a.wr || b.pf - a.pf || b.samples - a.samples || a.offsetT - b.offsetT
  );
  const best = rows[0] || null;
  return best || {
    mode: String(mode).toUpperCase(), direction: String(direction).toUpperCase(), pattern: exactPattern,
    offsetT: n(ayarlar.renkoGirisTeyitVarsayilanTugla, 0.25), evidenceScope: 'NO_DATA',
    evidenceTimeframe: '15M_CLOSED_RENKO_REVERSAL', bootstrap: metric({}), live: metric({}), ...metric({})
  };
}
async function atomicPersist(state) {
  ensureDir();
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({ ...state, version: VERSION, updatedAt: new Date().toISOString() }, null, 2);
  try {
    if (fs.existsSync(STATE_FILE)) await fs.promises.copyFile(STATE_FILE, BACKUP_FILE).catch(() => {});
    await fs.promises.writeFile(tmp, payload);
    await fs.promises.rename(tmp, STATE_FILE);
  } catch (e) {
    state.health.saveErrors = n(state.health.saveErrors) + 1;
    try { await fs.promises.unlink(tmp); } catch (_) {}
    console.error(`⚠️ [15M CONFIRMED EVIDENCE SAVE] ${e.message}`);
  }
}
function schedulePersist() {
  if (persistScheduled) return;
  persistScheduled = true;
  setImmediate(() => {
    persistScheduled = false;
    const state = snapshot();
    persistPromise = persistPromise.then(() => atomicPersist(state));
  });
}
function closeId(pos, result = {}) {
  return String(pos?.tradeId || pos?.sanalOrderId || pos?.borsaOrderId || result.tradeId || crypto.createHash('sha1').update(`${pos?.sym}|${pos?.yon}|${pos?.acilisZamani}|${result.closedAt || Date.now()}`).digest('hex').slice(0, 20));
}
function recordLiveClose(pos, result = {}) {
  const ga = pos?.girisAnalizi || {};
  if (String(ga.entryStrategy || pos?.entryStrategy || '').toUpperCase() !== 'ST2_RENKO') return { accepted: false, reason: 'NOT_ST2_RENKO' };
  const mode = String(ga.entryMode || ga.entryModeDecision?.selectedMode || '').toUpperCase();
  if (!['DIRECT', 'CONFIRMED'].includes(mode)) return { accepted: false, reason: 'MODE_UNKNOWN' };
  if (mode === 'CONFIRMED' && !String(ga.entryTimingAuthority || '').includes('15M')) return { accepted: false, reason: 'CONFIRMED_NOT_15M_AUTHORITY' };
  const direction = String(pos?.yon || ga.yon || '').toUpperCase();
  const pattern = String(ga.patternKodu || ga.patternCode || pos?.patternKodu || 'UNKNOWN').toUpperCase();
  const offsetT = n(ga.entryModeOffsetT, n(ga.renkoEntryBrickDistance, 0));
  if (!(offsetT > 0) || !['LONG', 'SHORT'].includes(direction)) return { accepted: false, reason: 'PROFILE_INVALID' };
  const state = load();
  const id = closeId(pos, result);
  if (state.live.processedCloseIds[id]) {
    state.health.duplicateClose = n(state.health.duplicateClose) + 1;
    return { accepted: false, reason: 'DUPLICATE_CLOSE', id };
  }
  const key = profileKey(mode, direction, pattern, offsetT);
  state.live.profiles[key] ||= blankMetric();
  observe(state.live.profiles[key], { triggered: true, netPct: n(result.netPct), at: result.at || new Date().toISOString() });
  state.live.processedCloseIds[id] = result.at || new Date().toISOString();
  const ids = Object.keys(state.live.processedCloseIds);
  if (ids.length > 5000) {
    ids.sort((a, b) => String(state.live.processedCloseIds[a]).localeCompare(String(state.live.processedCloseIds[b])));
    for (const old of ids.slice(0, ids.length - 5000)) delete state.live.processedCloseIds[old];
  }
  schedulePersist();
  return { accepted: true, id, key, metric: metric(state.live.profiles[key]) };
}
function replaceBootstrap(profiles = {}, meta = {}) {
  const state = load();
  state.bootstrap = {
    meta: { ...state.bootstrap.meta, ...meta, status: meta.status || 'READY', updatedAt: new Date().toISOString() },
    profiles: Object.fromEntries(Object.entries(profiles || {}).map(([k, v]) => [k, { ...blankMetric(), ...(v || {}) }]))
  };
  cache = state;
  return state;
}
async function saveNow() { await atomicPersist(load()); return snapshot(); }
function summary() {
  const state = load();
  return {
    version: VERSION,
    stateFile: STATE_FILE,
    bootstrap: state.bootstrap.meta,
    bootstrapProfiles: Object.keys(state.bootstrap.profiles || {}).length,
    liveProfiles: Object.keys(state.live.profiles || {}).length,
    liveCloses: Object.values(state.live.profiles || {}).reduce((a, x) => a + n(x.n), 0),
    health: state.health
  };
}
function resetForTest(raw = null) { cache = raw ? hydrate(raw) : blankState(); persistScheduled = false; persistPromise = Promise.resolve(); return cache; }

module.exports = {
  VERSION, STATE_FILE, BACKUP_FILE, load, snapshot, summary, profileKey, parseKey, metric, observe,
  evidence, recordLiveClose, replaceBootstrap, saveNow,
  _blankState: blankState, _blankMetric: blankMetric, _combineMetrics: combineMetrics, _resetForTest: resetForTest
};
