'use strict';

/**
 * AGROS ST2 v6.9.2 — FAST PREMIER SCORE WALK-FORWARD CALIBRATION
 *
 * Reads the real scientific close ledgers in AGROS_DATA_DIR/data, builds every
 * score with evidence available BEFORE that close, compares the old strict gate,
 * the v6.9.0 default score and deterministic candidate models, then optionally
 * writes a fail-closed calibration file consumed by 83_st2_premier_quality_score.js.
 *
 * Dry run:  node 84_st2_premier_score_calibration.js
 * Apply:    node 84_st2_premier_score_calibration.js --apply
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const quality = require('./83_st2_premier_quality_score.js');
const adaptive = require('./76_st2_adaptive_dna_entry.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');
const exitEvolution = require('./74_st2_renko_exit_evolution.js');

const VERSION = 'v6.9.2-FAST-PREMIER-WALK-FORWARD-CALIBRATION';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const REPORT_JSON = path.join(DATA_DIR, 'st2-premier-score-calibration-report.json');
const REPORT_MD = path.join(DATA_DIR, 'st2-premier-score-calibration-report.md');
const CALIBRATION_FILE = quality.CALIBRATION_FILE;
const WEIGHT_KEYS = quality.WEIGHT_KEYS;
const DEFAULT_WEIGHTS = quality.DEFAULT_WEIGHTS;

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function r(v, digits = 4) { return Number(n(v).toFixed(digits)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, n(v, min))); }
function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function atomicJson(file, value) {
  ensureDir();
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
function atomicText(file, value) {
  ensureDir();
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, value);
  fs.renameSync(tmp, file);
}
function readJsonl(file, type = null) {
  if (!fs.existsSync(file)) return [];
  const seen = new Set();
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (type && row.type !== type) continue;
      const id = row.tradeId || row.id || `${row.at || row.acceptedAt || ''}:${out.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    } catch (_) {}
  }
  return out;
}
function rowTime(row = {}) {
  const values = [row.acceptedAt, row.at, row.result?.closeTs, row.result?.kapanisZamani, row.pos?.kapanisZamani, row.pos?.acilisZamani];
  for (const v of values) {
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}
function actualNet(row = {}) {
  const result = row.result || {};
  for (const v of [result.net, result.netPnl, result.netKarZarar, result.pnl, result.netUsdt]) {
    if (Number.isFinite(Number(v))) return Number(v);
  }
  return NaN;
}
function rawPath(pos = {}, result = {}) {
  const raw = pos?.execution?.pricePath || pos?.journey?.pricePath || [];
  const points = raw.map(x => ({
    t: n(x?.ts || x?.t || x?.at || x?.time),
    p: n(x?.price || x?.fiyat),
    atrPct: Number.isFinite(Number(x?.atrPct)) ? Number(x.atrPct) : null,
    stTrend: x?.stTrend || null,
    stAligned: typeof x?.stAligned === 'boolean' ? x.stAligned : null
  })).filter(x => x.p > 0).sort((a, b) => a.t - b.t);
  const exit = n(result.exitPrice || result.kapanisFiyati);
  const closeTs = n(result.closeTs || result.kapanisZamani, Date.now());
  if (exit > 0 && (!points.length || points[points.length - 1].p !== exit)) points.push({ t: closeTs, p: exit, atrPct: null, stTrend: null, stAligned: null });
  return points;
}
function metricFromNets(values = []) {
  let net = 0, gp = 0, gl = 0, wins = 0, losses = 0, be = 0;
  for (const value of values) {
    const x = n(value);
    net += x;
    if (x > 1e-9) { gp += x; wins++; }
    else if (x < -1e-9) { gl += Math.abs(x); losses++; }
    else be++;
  }
  const count = values.length;
  return {
    n: count, samples: count, wins, losses, be, net: r(net, 6),
    pf: gl > 0 ? r(gp / gl, 6) : (gp > 0 ? 999 : 0),
    expectancy: count ? r(net / count, 6) : 0,
    wr: (wins + losses) ? r(wins / (wins + losses) * 100, 2) : 0,
    grossProfit: r(gp, 6), grossLoss: r(gl, 6)
  };
}
function takeoverMetric(rows = []) {
  const base = metricFromNets(rows.map(x => x.net));
  const count = rows.length;
  return {
    ...base,
    mfeCapture: count ? rows.reduce((a, x) => a + n(x.capture), 0) / count : 0,
    avgGiveback: count ? rows.reduce((a, x) => a + n(x.giveback), 0) / count : 0,
    confidence: count / (count + 4)
  };
}
function mapArray(map, key) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
}
function nestedArray(map, key1, key2) {
  if (!map.has(key1)) map.set(key1, new Map());
  const inner = map.get(key1);
  if (!inner.has(key2)) inner.set(key2, []);
  return inner.get(key2);
}
function candidateBrick(pos = {}, historical = null) {
  const value = Number(pos?.girisAnalizi?.renkoEntryBrickDistance ?? pos?.renkoEntryBrickDistance ?? historical?.brick ?? 0.75);
  return Number.isFinite(value) && value > 0 ? value : 0.75;
}
function metricAt(map, key1, key2, window = null) {
  const arr = map.get(key1)?.get(key2) || [];
  return metricFromNets(window ? arr.slice(-window) : arr);
}
function processExitRowsBefore(exitRows, pointer, until, takeoverByPattern) {
  let i = pointer;
  while (i < exitRows.length && rowTime(exitRows[i]) < until) {
    const row = exitRows[i++];
    const key = String(row.patternKey || '').toUpperCase();
    if (!key) continue;
    const result = row.result || {};
    const audit = row.audit || {};
    const net = Number.isFinite(Number(result.net)) ? Number(result.net)
      : Number.isFinite(Number(result.netPnl)) ? Number(result.netPnl)
      : Number.isFinite(Number(result.fiyatKarYuzdesi)) ? Number(result.fiyatKarYuzdesi)
      : Number.isFinite(Number(audit.exitPct)) ? Number(audit.exitPct) : NaN;
    if (!Number.isFinite(net)) continue;
    mapArray(takeoverByPattern, key).push({ net, capture: n(audit.capture), giveback: n(audit.giveback) });
  }
  return i;
}

function buildDataset(options = {}) {
  const entryRows = (options.entryRows || readJsonl(entryEvolution.LEDGER_FILE, 'SCIENTIFIC_CLOSE'))
    .slice().sort((a, b) => rowTime(a) - rowTime(b));
  const exitRows = (options.exitRows || readJsonl(exitEvolution.LEDGER_FILE))
    .filter(x => /^RENKO_EXIT_CLOSE/.test(String(x.type || '')))
    .slice().sort((a, b) => rowTime(a) - rowTime(b));
  const historicalIndex = options.historicalIndex || adaptive.buildHistoricalIndex();

  const liveByDna = new Map();
  const entryByPattern = new Map();
  const takeoverByPattern = new Map();
  const cases = [];
  let exitPointer = 0;
  const exclusions = {};
  const exclude = reason => { exclusions[reason] = n(exclusions[reason]) + 1; };

  for (const row of entryRows) {
    const time = rowTime(row);
    exitPointer = processExitRowsBefore(exitRows, exitPointer, time, takeoverByPattern);
    const pos = row.pos || {};
    const result = row.result || {};
    const net = actualNet(row);
    if (!Number.isFinite(net)) { exclude('ACTUAL_NET_MISSING'); continue; }
    if (result.restartGap === true || pos.restartGap === true || pos.restartRecovered === true || pos.learningEligible === false) { exclude('RESTART_GAP'); continue; }
    if (/MANUAL_EXTERNAL_CLOSE|MANUAL_OVERRIDE/i.test(String(result.reason || '')) || pos.manualExternalClose === true) { exclude('MANUAL_EXTERNAL_CLOSE'); continue; }
    const context = adaptive.contextFrom(pos);
    if (!adaptive.contextComplete(context)) { exclude('EXACT_CONTEXT_INCOMPLETE'); continue; }
    const dnaKey = adaptive.dnaKey(context);
    const patternKey = adaptive.patternKey(context);
    const historical = historicalIndex?.dnas?.[dnaKey]?.best || null;
    if (!historical) { exclude('HISTORICAL_EXACT_MISSING'); continue; }
    const brick = candidateBrick(pos, historical);
    const brickKey = brick.toFixed(2);
    const live3 = metricAt(liveByDna, dnaKey, brickKey, 3);
    const live5 = metricAt(liveByDna, dnaKey, brickKey, 5);
    const entry = metricAt(entryByPattern, patternKey, brickKey, null);
    const takeover = takeoverMetric(takeoverByPattern.get(patternKey) || []);
    const score3 = quality.scoreEvidence({ context, historical, live: live3, entry, takeover, policy: { source: 'AUDIT', weights: DEFAULT_WEIGHTS } });
    const score5 = quality.scoreEvidence({ context, historical, live: live5, entry, takeover, policy: { source: 'AUDIT', weights: DEFAULT_WEIGHTS } });
    cases.push({
      at: new Date(time || Date.now()).toISOString(), time, tradeId: row.tradeId || null,
      symbol: pos.sym || pos.symbol || null, context, dnaKey, patternKey, brick,
      historical, live3, live5, entry, takeover, actualNet: net,
      components3: score3.components, components5: score5.components
    });

    const points = rawPath(pos, result);
    const snap = pos?.girisAnalizi?.pusuTuglasi || pos?.pusuTuglasi || {};
    const ga = pos?.girisAnalizi || {};
    const pusu = {
      yon: String(pos?.yon || ga.yon || context.yon).toUpperCase(),
      referansSeviye: n(ga.referansSeviye || pos?.referansSeviye || snap.referansSeviye),
      renkoBoxSize: n(ga.renkoBoxSize || pos?.renkoBoxSize || snap.renkoBoxSize)
    };
    for (const candidate of entryEvolution.CANDIDATES()) {
      let replay = null;
      try { replay = entryEvolution.replayCandidate(pos, result, pusu, candidate, points); } catch (_) {}
      if (!replay?.triggered || !Number.isFinite(Number(replay.net))) continue;
      const key = Number(candidate).toFixed(2);
      nestedArray(entryByPattern, patternKey, key).push(Number(replay.net));
      nestedArray(liveByDna, dnaKey, key).push(Number(replay.net));
    }
  }

  const cohort = Object.values(historicalIndex?.dnas || {})
    .filter(x => x?.best && adaptive.contextComplete(x.context))
    .map(x => {
      const base = quality.scoreEvidence({ context: x.context, historical: x.best, policy: { source: 'AUDIT', weights: DEFAULT_WEIGHTS } });
      return { context: x.context, historical: x.best, components: base.components };
    });
  return { cases, cohort, exclusions, sourceRows: entryRows.length, exitRows: exitRows.length };
}

function dot(components, weights) {
  return WEIGHT_KEYS.reduce((sum, key) => sum + n(components?.[key]) * n(weights?.[key]) / 100, 0);
}
function quantile(values, q) { return quality.quantile(values, q); }
function evaluateRows(cases, cohort, model, range = null) {
  const rows = range ? cases.slice(range.start, range.end) : cases;
  const componentsKey = model.liveWindow === 5 ? 'components5' : 'components3';
  const cohortScores = cohort.map(x => dot(x.components, model.weights));
  const dynamic = cohortScores.length >= 5 ? quantile(cohortScores, model.relativeQuantile) : model.minScore;
  const threshold = Math.min(model.maxDynamic, Math.max(model.minScore, n(dynamic, model.minScore)));
  const selected = [];
  const shadow = [];
  for (const row of rows) {
    const score = dot(row[componentsKey], model.weights);
    const target = n(row.historical?.n) >= model.minSample && score >= threshold ? selected : shadow;
    target.push({ ...row, score, threshold });
  }
  const result = metricFromNets(selected.map(x => x.actualNet));
  const shadowMetric = metricFromNets(shadow.map(x => x.actualNet));
  return {
    ...result,
    selectedRatio: rows.length ? selected.length / rows.length : 0,
    threshold: r(threshold, 2),
    shadow: shadowMetric,
    rows: selected,
    allN: rows.length
  };
}
function evaluateStrict(cases, range = null) {
  const rows = range ? cases.slice(range.start, range.end) : cases;
  const selected = rows.filter(x => n(x.historical?.n) >= 5 && n(x.historical?.net) > 0 && n(x.historical?.pf) > 1 && n(x.historical?.expectancy) > 0);
  const metric = metricFromNets(selected.map(x => x.actualNet));
  return { ...metric, selectedRatio: rows.length ? selected.length / rows.length : 0, allN: rows.length };
}
function modelDistance(weights) { return WEIGHT_KEYS.reduce((a, key) => a + Math.abs(n(weights[key]) - n(DEFAULT_WEIGHTS[key])), 0); }
function metricObjective(metric, total) {
  if (!metric || metric.n <= 0 || metric.net <= 0 || metric.expectancy <= 0 || metric.pf <= 1) return -1e9;
  const ratio = total ? metric.n / total : 0;
  const pfTerm = Math.log1p(Math.min(metric.pf, 5));
  const expTerm = Math.tanh(metric.expectancy / 0.15);
  const netPerTerm = Math.tanh((metric.net / metric.n) / 0.15);
  const sampleTerm = Math.min(1, metric.n / Math.max(1, total * 0.35));
  const ratioTerm = 1 - Math.min(1, Math.abs(ratio - 0.35) / 0.35);
  return pfTerm * 30 + expTerm * 30 + netPerTerm * 20 + sampleTerm * 12 + ratioTerm * 8;
}
function candidateObjective(train, validation, weights) {
  return metricObjective(train, train.allN) * 0.45 + metricObjective(validation, validation.allN) * 0.55 - modelDistance(weights) * 0.035;
}
function seededRandom(seed = 6901) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function normalizeWeights(raw) {
  const min = 5, max = 35;
  const vals = WEIGHT_KEYS.map(k => clamp(n(raw[k], DEFAULT_WEIGHTS[k]), min, max));
  const sum = vals.reduce((a, b) => a + b, 0);
  let ints = vals.map(x => Math.max(min, Math.min(max, Math.round(x / sum * 100))));
  let diff = 100 - ints.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard++ < 1000) {
    const direction = diff > 0 ? 1 : -1;
    const indices = ints.map((v, i) => ({ i, room: direction > 0 ? max - v : v - min }))
      .filter(x => x.room > 0).sort((a, b) => b.room - a.room || a.i - b.i);
    if (!indices.length) break;
    ints[indices[guard % indices.length].i] += direction;
    diff -= direction;
  }
  const out = {};
  WEIGHT_KEYS.forEach((k, i) => { out[k] = ints[i]; });
  return quality.validWeights(out) ? out : { ...DEFAULT_WEIGHTS };
}
function weightCandidates(limit = process.env.AGROS_PREMIER_CALIBRATION_FAST_TEST === '1' ? 80 : 1400) {
  const out = new Map();
  const add = w => { const x = normalizeWeights(w); out.set(WEIGHT_KEYS.map(k => x[k]).join(','), x); };
  add(DEFAULT_WEIGHTS);
  for (const delta of [5, 10]) {
    for (let i = 0; i < WEIGHT_KEYS.length; i++) for (let j = 0; j < WEIGHT_KEYS.length; j++) if (i !== j) {
      const w = { ...DEFAULT_WEIGHTS };
      w[WEIGHT_KEYS[i]] += delta; w[WEIGHT_KEYS[j]] -= delta;
      add(w);
    }
  }
  const rnd = seededRandom();
  while (out.size < limit) {
    const w = {};
    for (const key of WEIGHT_KEYS) w[key] = 5 + rnd() * 30;
    add(w);
  }
  return [...out.values()];
}
function policyCandidates() {
  const fast = process.env.AGROS_PREMIER_CALIBRATION_FAST_TEST === '1';
  const out = [];
  const windows = [3, 5];
  const mins = fast ? [55, 65] : [55, 60, 65, 70];
  const quantiles = fast ? [0.50, 0.65] : [0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75];
  const caps = fast ? [80, 100] : [75, 80, 85, 90, 100];
  for (const liveWindow of windows)
    for (const minScore of mins)
      for (const relativeQuantile of quantiles)
        for (const maxDynamic of caps)
          out.push({ liveWindow, minScore, relativeQuantile, maxDynamic, minSample: 3 });
  return out;
}
function baselineModel() {
  return { weights: { ...DEFAULT_WEIGHTS }, liveWindow: 3, minScore: 55, relativeQuantile: 0.40, maxDynamic: 70, minSample: 3 };
}

/**
 * Build a compact numeric matrix once. The v6.9.1 implementation recalculated
 * every dot product and cohort quantile for every policy candidate. This matrix
 * lets each weight vector be scored once, then reuses those scores for all
 * threshold policies without changing the scientific selection rules.
 */
function buildSearchMatrix(dataset) {
  const caseCount = dataset.cases.length;
  const cohortCount = dataset.cohort.length;
  const matrix = {
    caseCount,
    cohortCount,
    nets: new Float64Array(caseCount),
    historicalN: new Float64Array(caseCount),
    cases3: {},
    cases5: {},
    cohort: {}
  };
  for (const key of WEIGHT_KEYS) {
    matrix.cases3[key] = new Float64Array(caseCount);
    matrix.cases5[key] = new Float64Array(caseCount);
    matrix.cohort[key] = new Float64Array(cohortCount);
  }
  for (let i = 0; i < caseCount; i++) {
    const row = dataset.cases[i];
    matrix.nets[i] = n(row.actualNet);
    matrix.historicalN[i] = n(row.historical?.n);
    for (const key of WEIGHT_KEYS) {
      matrix.cases3[key][i] = n(row.components3?.[key]);
      matrix.cases5[key][i] = n(row.components5?.[key]);
    }
  }
  for (let i = 0; i < cohortCount; i++) {
    const row = dataset.cohort[i];
    for (const key of WEIGHT_KEYS) matrix.cohort[key][i] = n(row.components?.[key]);
  }
  return matrix;
}
function weightedScores(columns, weights, length) {
  const out = new Float64Array(length);
  for (const key of WEIGHT_KEYS) {
    const column = columns[key];
    const factor = n(weights[key]) / 100;
    for (let i = 0; i < length; i++) out[i] += column[i] * factor;
  }
  return out;
}
function quantileSorted(sorted, q) {
  const length = sorted.length;
  if (!length) return null;
  if (length === 1) return sorted[0];
  const pos = clamp(q, 0, 1) * (length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos), w = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * w;
}
function emptyAccumulator() {
  return { n: 0, wins: 0, losses: 0, be: 0, net: 0, gp: 0, gl: 0 };
}
function addNet(acc, value) {
  acc.n++;
  acc.net += value;
  if (value > 1e-9) { acc.wins++; acc.gp += value; }
  else if (value < -1e-9) { acc.losses++; acc.gl += Math.abs(value); }
  else acc.be++;
}
function finalizeAccumulator(acc, allN, threshold) {
  return {
    n: acc.n,
    samples: acc.n,
    wins: acc.wins,
    losses: acc.losses,
    be: acc.be,
    net: r(acc.net, 6),
    pf: acc.gl > 0 ? r(acc.gp / acc.gl, 6) : (acc.gp > 0 ? 999 : 0),
    expectancy: acc.n ? r(acc.net / acc.n, 6) : 0,
    wr: (acc.wins + acc.losses) ? r(acc.wins / (acc.wins + acc.losses) * 100, 2) : 0,
    grossProfit: r(acc.gp, 6),
    grossLoss: r(acc.gl, 6),
    selectedRatio: allN ? acc.n / allN : 0,
    threshold: r(threshold, 2),
    allN
  };
}
function evaluateScoreRanges(scores, matrix, threshold, minSample, split) {
  const train = emptyAccumulator();
  const validation = emptyAccumulator();
  const all = emptyAccumulator();
  for (let i = 0; i < matrix.caseCount; i++) {
    if (matrix.historicalN[i] < minSample || scores[i] < threshold) continue;
    const value = matrix.nets[i];
    addNet(all, value);
    if (i < split) addNet(train, value); else addNet(validation, value);
  }
  return {
    train: finalizeAccumulator(train, split, threshold),
    validation: finalizeAccumulator(validation, matrix.caseCount - split, threshold),
    all: finalizeAccumulator(all, matrix.caseCount, threshold)
  };
}
function resolvedThreshold(sortedCohort, policy) {
  const dynamic = sortedCohort.length >= 5
    ? quantileSorted(sortedCohort, policy.relativeQuantile)
    : policy.minScore;
  return r(Math.min(policy.maxDynamic, Math.max(policy.minScore, n(dynamic, policy.minScore))), 8);
}

function keepTopCandidate(top, candidate, limit = 10) {
  let index = 0;
  while (index < top.length && top[index].objective >= candidate.objective) index++;
  if (index >= limit) return;
  top.splice(index, 0, candidate);
  if (top.length > limit) top.length = limit;
}

function search(dataset, options = {}) {
  const startedAt = Date.now();
  const cases = dataset.cases;
  const split = Math.max(1, Math.floor(cases.length * 0.70));
  const trainRange = { start: 0, end: split };
  const validationRange = { start: split, end: cases.length };
  const baseline = baselineModel();
  const baselineTrain = evaluateRows(cases, dataset.cohort, baseline, trainRange);
  const baselineValidation = evaluateRows(cases, dataset.cohort, baseline, validationRange);
  const baselineAll = evaluateRows(cases, dataset.cohort, baseline);
  const strict = {
    train: evaluateStrict(cases, trainRange), validation: evaluateStrict(cases, validationRange), all: evaluateStrict(cases)
  };
  const matrix = buildSearchMatrix(dataset);
  let best = null;
  const top = [];
  const weights = options.weights || weightCandidates();
  const policies = options.policies || policyCandidates();
  const policyCount = policies.length;
  let uniqueEvaluations = 0;
  const progressEvery = Math.max(1, Math.floor(weights.length / 10));

  for (let wi = 0; wi < weights.length; wi++) {
    const w = weights[wi];
    const cohortScores = Array.from(weightedScores(matrix.cohort, w, matrix.cohortCount)).sort((a, b) => a - b);
    const scoreByWindow = {
      3: weightedScores(matrix.cases3, w, matrix.caseCount),
      5: weightedScores(matrix.cases5, w, matrix.caseCount)
    };
    const metricCache = new Map();

    for (const policy of policies) {
      const threshold = resolvedThreshold(cohortScores, policy);
      const cacheKey = `${policy.liveWindow}|${policy.minSample}|${threshold}`;
      let metrics = metricCache.get(cacheKey);
      if (!metrics) {
        metrics = evaluateScoreRanges(scoreByWindow[policy.liveWindow], matrix, threshold, policy.minSample, split);
        metricCache.set(cacheKey, metrics);
        uniqueEvaluations++;
      }
      const { train, validation } = metrics;
      const minTrain = Math.max(12, Math.floor(train.allN * 0.15));
      const minValidation = Math.max(6, Math.floor(validation.allN * 0.12));
      if (train.n < minTrain || validation.n < minValidation) continue;
      if (train.selectedRatio < 0.15 || train.selectedRatio > 0.58 || validation.selectedRatio < 0.12 || validation.selectedRatio > 0.58) continue;
      if (train.pf <= 1 || train.expectancy <= 0 || train.net <= 0 || validation.pf <= 1 || validation.expectancy <= 0 || validation.net <= 0) continue;
      const objective = candidateObjective(train, validation, w);
      if (!Number.isFinite(objective)) continue;
      const model = { ...policy, weights: w };
      const candidate = { model, objective: r(objective, 6), train, validation };
      if (!best || candidate.objective > best.objective) best = candidate;
      keepTopCandidate(top, candidate);
    }

    if (typeof options.onProgress === 'function' && ((wi + 1) % progressEvery === 0 || wi === weights.length - 1)) {
      options.onProgress({
        completedWeights: wi + 1,
        totalWeights: weights.length,
        modelCandidates: (wi + 1) * policyCount,
        totalModelCandidates: weights.length * policyCount,
        uniqueEvaluations,
        elapsedMs: Date.now() - startedAt
      });
    }
  }

  const optimized = best ? {
    ...best,
    train: evaluateRows(cases, dataset.cohort, best.model, trainRange),
    validation: evaluateRows(cases, dataset.cohort, best.model, validationRange),
    all: evaluateRows(cases, dataset.cohort, best.model)
  } : null;
  const safeToApply = Boolean(optimized
    && optimized.all.n >= Math.max(20, Math.floor(cases.length * 0.15))
    && optimized.all.selectedRatio >= 0.15 && optimized.all.selectedRatio <= 0.55
    && optimized.all.pf > 1 && optimized.all.expectancy > 0 && optimized.all.net > 0
    && optimized.validation.pf >= Math.max(1.05, baselineValidation.pf * 0.98)
    && optimized.validation.expectancy >= Math.max(0.001, baselineValidation.expectancy)
    && (baselineAll.net <= 0 || optimized.all.net >= baselineAll.net * 0.65)
    && optimized.objective > candidateObjective(baselineTrain, baselineValidation, baseline.weights) + 0.5);
  return {
    split: { trainN: split, validationN: cases.length - split },
    strict,
    baseline: { model: baseline, train: baselineTrain, validation: baselineValidation, all: baselineAll },
    optimized,
    safeToApply,
    diagnostics: {
      engine: 'PRECOMPUTED_SCORE_MATRIX',
      weights: weights.length,
      policies: policyCount,
      modelCandidates: weights.length * policyCount,
      uniqueEvaluations,
      elapsedMs: Date.now() - startedAt
    },
    top: top.slice(0, 10).map(x => ({ model: x.model, objective: x.objective, train: compactMetric(x.train), validation: compactMetric(x.validation) }))
  };
}

function compactMetric(m = {}) {
  return {
    n: n(m.n), allN: n(m.allN), selectionPct: r(n(m.selectedRatio) * 100, 1),
    wins: n(m.wins), losses: n(m.losses), be: n(m.be),
    net: r(m.net, 4), pf: r(m.pf, 3), expectancy: r(m.expectancy, 4), wr: r(m.wr, 1), threshold: r(m.threshold, 2)
  };
}
function buckets(cases, cohort, model) {
  const all = evaluateRows(cases, cohort, { ...model, minScore: 0, maxDynamic: 100, relativeQuantile: 0 });
  const componentsKey = model.liveWindow === 5 ? 'components5' : 'components3';
  const defs = [[0, 55, '<55'], [55, 65, '55-64.9'], [65, 70, '65-69.9'], [70, 75, '70-74.9'], [75, 80, '75-79.9'], [80, 101, '80+']];
  return defs.map(([lo, hi, label]) => {
    const rows = cases.filter(x => { const score = dot(x[componentsKey], model.weights); return score >= lo && score < hi; });
    return { label, ...compactMetric({ ...metricFromNets(rows.map(x => x.actualNet)), allN: rows.length, selectedRatio: 1 }) };
  });
}
function fileFingerprint(files) {
  const hash = crypto.createHash('sha256');
  const detail = [];
  for (const file of files) {
    if (!fs.existsSync(file)) { detail.push({ file, exists: false }); continue; }
    const st = fs.statSync(file);
    const data = fs.readFileSync(file);
    hash.update(path.basename(file)); hash.update(data);
    detail.push({ file, exists: true, size: st.size, mtimeMs: st.mtimeMs });
  }
  return { sha256: hash.digest('hex'), files: detail };
}
function percent(x) { return `${(n(x) * 100).toFixed(1)}%`; }
function metricLine(label, m = {}) {
  return `| ${label} | ${n(m.n)} | ${percent(m.selectedRatio)} | ${n(m.pf).toFixed(2)} | ${n(m.net) >= 0 ? '+' : ''}${n(m.net).toFixed(4)} | ${n(m.expectancy) >= 0 ? '+' : ''}${n(m.expectancy).toFixed(4)} | ${n(m.wr).toFixed(1)}% |`;
}
function markdown(report) {
  const lines = [];
  lines.push(`# AGROS ST2 Premier Score Kalibrasyon Raporu`, '', `- Sürüm: ${VERSION}`, `- Üretim: ${report.generatedAt}`, `- Bilimsel kapanış: ${report.dataset.cases}`, `- Hariç tutulan: ${JSON.stringify(report.dataset.exclusions)}`, `- Sonuç: ${report.search.safeToApply ? 'KALİBRASYON UYGULANABİLİR' : 'MEVCUT MODEL KORUNMALI'}`, '');
  lines.push('## Karşılaştırma', '', '| Model | Premier N | Seçim | PF | Net | Expectancy | WR |', '|---|---:|---:|---:|---:|---:|---:|');
  lines.push(metricLine('Eski katı sistem', report.search.strict.all));
  lines.push(metricLine('v6.9.0 varsayılan', report.search.baseline.all));
  if (report.search.optimized) lines.push(metricLine('Optimize model', report.search.optimized.all));
  lines.push('');
  if (report.search.optimized) {
    lines.push('## Önerilen model', '', '```json', JSON.stringify(report.search.optimized.model, null, 2), '```', '');
    lines.push('## Kronolojik doğrulama', '', '| Bölüm | Premier N | Seçim | PF | Net | Expectancy | WR |', '|---|---:|---:|---:|---:|---:|---:|');
    lines.push(metricLine('Train', report.search.optimized.train));
    lines.push(metricLine('Validation', report.search.optimized.validation));
    lines.push('');
    lines.push('## Skor aralıkları', '', '| Skor | N | PF | Net | Expectancy | WR |', '|---|---:|---:|---:|---:|---:|');
    for (const b of report.buckets) lines.push(`| ${b.label} | ${b.n} | ${b.pf.toFixed(2)} | ${b.net >= 0 ? '+' : ''}${b.net.toFixed(4)} | ${b.expectancy >= 0 ? '+' : ''}${b.expectancy.toFixed(4)} | ${b.wr.toFixed(1)}% |`);
  }
  lines.push('', '## Güvenlik', '', '- Restart-GAP ve manuel kapanışlar hariç tutulur.', '- Her kapanış yalnız kendisinden önceki canlı/Entry/Takeover kanıtıyla puanlanır.', '- Validation pozitif değilse calibration dosyası yazılmaz.', '- Trade Engine, stop, BE ve exit matematiği değişmez.', '');
  return `${lines.join('\n')}\n`;
}

function run(options = {}) {
  const dataset = buildDataset(options);
  if (dataset.cases.length < 30) throw new Error(`CALIBRATION_DATA_INSUFFICIENT: kullanılabilir ${dataset.cases.length}, gereken en az 30`);
  if (typeof options.onDataset === 'function') options.onDataset(dataset);
  const searchResult = search(dataset, { onProgress: options.onProgress });
  const chosen = searchResult.optimized?.model || baselineModel();
  const fingerprint = fileFingerprint([entryEvolution.LEDGER_FILE, adaptive.HISTORICAL_LEDGER_FILE, exitEvolution.LEDGER_FILE]);
  const report = {
    schema: 1, version: VERSION, generatedAt: new Date().toISOString(),
    fingerprint,
    dataset: { sourceRows: dataset.sourceRows, cases: dataset.cases.length, cohort: dataset.cohort.length, exitRows: dataset.exitRows, exclusions: dataset.exclusions },
    coverage: {
      live3: dataset.cases.filter(x => x.live3.n > 0).length,
      live5: dataset.cases.filter(x => x.live5.n > 0).length,
      entry: dataset.cases.filter(x => x.entry.n > 0).length,
      takeover: dataset.cases.filter(x => x.takeover.n > 0).length
    },
    search: {
      ...searchResult,
      strict: { train: compactMetric(searchResult.strict.train), validation: compactMetric(searchResult.strict.validation), all: compactMetric(searchResult.strict.all) },
      baseline: { model: searchResult.baseline.model, train: compactMetric(searchResult.baseline.train), validation: compactMetric(searchResult.baseline.validation), all: compactMetric(searchResult.baseline.all) },
      optimized: searchResult.optimized ? { model: searchResult.optimized.model, objective: searchResult.optimized.objective, train: compactMetric(searchResult.optimized.train), validation: compactMetric(searchResult.optimized.validation), all: compactMetric(searchResult.optimized.all) } : null
    },
    buckets: buckets(dataset.cases, dataset.cohort, chosen)
  };
  atomicJson(REPORT_JSON, report);
  atomicText(REPORT_MD, markdown(report));

  let applied = false;
  if (options.apply === true && report.search.safeToApply && report.search.optimized) {
    const calibration = {
      schema: 1,
      status: 'ACTIVE',
      version: VERSION,
      generatedAt: report.generatedAt,
      source: 'CHRONOLOGICAL_70_30_WALK_FORWARD',
      fingerprint: fingerprint.sha256,
      weights: report.search.optimized.model.weights,
      policy: {
        minScore: report.search.optimized.model.minScore,
        maxDynamic: report.search.optimized.model.maxDynamic,
        relativeQuantile: report.search.optimized.model.relativeQuantile,
        minSample: report.search.optimized.model.minSample,
        liveWindow: report.search.optimized.model.liveWindow
      },
      audit: {
        cases: report.dataset.cases,
        cohort: report.dataset.cohort,
        train: report.search.optimized.train,
        validation: report.search.optimized.validation,
        all: report.search.optimized.all,
        baseline: report.search.baseline.all
      }
    };
    atomicJson(CALIBRATION_FILE, calibration);
    applied = true;
  }
  return { report, applied, paths: { reportJson: REPORT_JSON, reportMarkdown: REPORT_MD, calibration: CALIBRATION_FILE } };
}

if (require.main === module) {
  try {
    const apply = process.argv.includes('--apply');
    const wallStarted = Date.now();
    const result = run({
      apply,
      onDataset: dataset => {
        console.log(`🧪 PREMIER FAST AUDIT başlıyor | Kapanış ${dataset.cases.length} | Kohort ${dataset.cohort.length}`);
        console.log('⚙️ 1.400 ağırlık × 280 politika, önbelleklenmiş skor matrisiyle değerlendirilecek.');
      },
      onProgress: p => {
        const pct = Math.round(p.completedWeights / Math.max(1, p.totalWeights) * 100);
        console.log(`⏳ Kalibrasyon %${pct} | Model ${p.modelCandidates}/${p.totalModelCandidates} | Tekil değerlendirme ${p.uniqueEvaluations} | ${(p.elapsedMs / 1000).toFixed(1)} sn`);
      }
    });
    const x = result.report;
    console.log(`\n🧪 PREMIER WALK-FORWARD AUDIT | Kapanış ${x.dataset.cases} | Kohort ${x.dataset.cohort}`);
    console.log(`Eski katı   : N${x.search.strict.all.n} | PF ${x.search.strict.all.pf.toFixed(2)} | Net ${x.search.strict.all.net >= 0 ? '+' : ''}${x.search.strict.all.net.toFixed(4)} | Exp ${x.search.strict.all.expectancy >= 0 ? '+' : ''}${x.search.strict.all.expectancy.toFixed(4)}`);
    console.log(`v6.9.0      : N${x.search.baseline.all.n} | PF ${x.search.baseline.all.pf.toFixed(2)} | Net ${x.search.baseline.all.net >= 0 ? '+' : ''}${x.search.baseline.all.net.toFixed(4)} | Exp ${x.search.baseline.all.expectancy >= 0 ? '+' : ''}${x.search.baseline.all.expectancy.toFixed(4)}`);
    if (x.search.optimized) {
      const o = x.search.optimized;
      console.log(`Optimize    : N${o.all.n} | PF ${o.all.pf.toFixed(2)} | Net ${o.all.net >= 0 ? '+' : ''}${o.all.net.toFixed(4)} | Exp ${o.all.expectancy >= 0 ? '+' : ''}${o.all.expectancy.toFixed(4)}`);
      console.log(`Ağırlıklar  : ${JSON.stringify(o.model.weights)}`);
      console.log(`Politika    : min ${o.model.minScore} | q ${o.model.relativeQuantile} | max ${o.model.maxDynamic} | canlı pencere ${o.model.liveWindow}`);
      console.log(`Validation  : N${o.validation.n} | PF ${o.validation.pf.toFixed(2)} | Net ${o.validation.net >= 0 ? '+' : ''}${o.validation.net.toFixed(4)} | Exp ${o.validation.expectancy >= 0 ? '+' : ''}${o.validation.expectancy.toFixed(4)}`);
    }
    console.log(`Motor       : ${x.search.diagnostics?.engine || 'UNKNOWN'} | ${x.search.diagnostics?.modelCandidates || 0} model | ${((x.search.diagnostics?.elapsedMs || 0) / 1000).toFixed(2)} sn`);
    console.log(`Toplam süre : ${((Date.now() - wallStarted) / 1000).toFixed(2)} sn`);
    console.log(`Karar       : ${x.search.safeToApply ? (result.applied ? 'KALİBRASYON AKTİFLEŞTİRİLDİ' : 'UYGULANABİLİR — --apply ile etkinleştir') : 'FAIL-CLOSED — MEVCUT MODEL KORUNDU'}`);
    console.log(`Rapor       : ${result.paths.reportMarkdown}`);
    if (result.applied) console.log(`Calibration : ${result.paths.calibration}`);
  } catch (e) {
    console.error(`❌ PREMIER CALIBRATION FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  VERSION, DATA_DIR, REPORT_JSON, REPORT_MD, CALIBRATION_FILE,
  readJsonl, rowTime, actualNet, rawPath, metricFromNets, takeoverMetric,
  buildDataset, dot, evaluateRows, evaluateStrict, baselineModel, search,
  buildSearchMatrix, weightedScores, quantileSorted, evaluateScoreRanges, resolvedThreshold, keepTopCandidate,
  compactMetric, buckets, run, normalizeWeights, weightCandidates, policyCandidates
};
