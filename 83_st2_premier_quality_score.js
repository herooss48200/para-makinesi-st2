'use strict';

/**
 * AGROS ST2 v6.9.1 — CALIBRATED PREMIER QUALITY SCORE
 * Reporting/admission intelligence only. Trade Engine, entry price, stop, BE and
 * exit mathematics are not changed here.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.9.1-CALIBRATED-PREMIER-QUALITY-SCORE';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const ENTRY_STATE = path.join(DATA_DIR, 'st2-renko-entry-evolution.json');
const TAKEOVER_STATE = path.join(DATA_DIR, 'st2-renko-exit-evolution.json');
const CALIBRATION_FILE = path.join(DATA_DIR, 'st2-premier-score-calibration.json');

const WEIGHT_KEYS = Object.freeze([
  'historicalPf', 'historicalExpectancy', 'liveForm',
  'entryEvolution', 'takeoverReplay', 'sampleConfidence'
]);
const DEFAULT_WEIGHTS = Object.freeze({
  historicalPf: 18,
  historicalExpectancy: 17,
  liveForm: 20,
  entryEvolution: 15,
  takeoverReplay: 15,
  sampleConfidence: 15
});
// Geriye uyumluluk: WEIGHTS varsayılan modeli ifade eder. Canlı model activePolicy() ile okunur.
const WEIGHTS = DEFAULT_WEIGHTS;

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, n(v, min))); }
function round(v, digits = 2) { return Number(n(v).toFixed(digits)); }
function norm(v) { return String(v ?? 'UNKNOWN').trim().toUpperCase().replace(/\s+/g, '_') || 'UNKNOWN'; }
function patternKey(context = {}) { return `${norm(context.yon)}|${norm(context.pattern)}`; }
function completeContext(context = {}) {
  return ['yon', 'pattern', 'rbb', 'rbbw', 'renko6', 'atr', 'trend20']
    .every(k => context[k] && norm(context[k]) !== 'UNKNOWN');
}

const jsonCache = new Map();
function readJsonCached(file) {
  try {
    const st = fs.statSync(file);
    const sig = `${st.mtimeMs}:${st.size}`;
    const hit = jsonCache.get(file);
    if (hit?.sig === sig) return hit.value;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    jsonCache.set(file, { sig, value });
    return value;
  } catch (_) { return null; }
}

function validWeights(raw = {}) {
  const out = {};
  for (const key of WEIGHT_KEYS) {
    const value = Number(raw?.[key]);
    if (!Number.isFinite(value) || value < 0 || value > 60) return null;
    out[key] = value;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 0.01) return null;
  return out;
}

function readCalibration() {
  const raw = readJsonCached(CALIBRATION_FILE);
  if (!raw || raw.schema !== 1 || raw.status !== 'ACTIVE') return null;
  const weights = validWeights(raw.weights);
  if (!weights) return null;
  const policy = raw.policy || {};
  const minScore = clamp(policy.minScore, 0, 100);
  const maxDynamic = clamp(policy.maxDynamic, minScore, 100);
  const relativeQuantile = clamp(policy.relativeQuantile, 0, 1);
  const minSample = Math.max(1, Math.floor(n(policy.minSample, 3)));
  const liveWindow = [3, 5].includes(Number(policy.liveWindow)) ? Number(policy.liveWindow) : 3;
  if (!Number.isFinite(minScore) || !Number.isFinite(maxDynamic) || !Number.isFinite(relativeQuantile)) return null;
  return {
    schema: 1,
    status: 'ACTIVE',
    generatedAt: raw.generatedAt || null,
    source: raw.source || 'WALK_FORWARD_CALIBRATION',
    fingerprint: raw.fingerprint || null,
    audit: raw.audit || null,
    weights,
    policy: { minScore, maxDynamic, relativeQuantile, minSample, liveWindow }
  };
}

function activePolicy() {
  const calibration = readCalibration();
  if (calibration) {
    return {
      source: 'CALIBRATED',
      calibration,
      weights: { ...calibration.weights },
      minScore: calibration.policy.minScore,
      maxDynamic: calibration.policy.maxDynamic,
      relativeQuantile: calibration.policy.relativeQuantile,
      minSample: calibration.policy.minSample,
      liveWindow: calibration.policy.liveWindow
    };
  }
  return {
    source: 'DEFAULT',
    calibration: null,
    weights: { ...DEFAULT_WEIGHTS },
    minScore: clamp(ayarlar.renkoPremierScoreMin ?? 55, 0, 100),
    maxDynamic: clamp(ayarlar.renkoPremierScoreMaxDinamikEsik ?? 70, clamp(ayarlar.renkoPremierScoreMin ?? 55, 0, 100), 100),
    relativeQuantile: clamp(ayarlar.renkoPremierScoreGoreceliYuzdelik ?? 0.40, 0, 1),
    minSample: Math.max(1, Math.floor(n(ayarlar.renkoPremierScoreMinOrnek, 3))),
    liveWindow: 3
  };
}

function pfScore(pf) {
  const value = Math.min(4, Math.max(0, n(pf)));
  if (value <= 0.5) return value * 20;
  if (value <= 1) return 10 + (value - 0.5) * 60;
  if (value <= 2) return 40 + (value - 1) * 45;
  return 85 + (value - 2) * 7.5;
}
function signedEconomyScore(value, scale = 0.12) {
  const x = n(value);
  return clamp(50 + 50 * Math.tanh(x / Math.max(0.0001, scale)));
}
function metricScore(metric = {}, options = {}) {
  const neutralWhenMissing = options.neutralWhenMissing !== false;
  const samples = n(metric.n, n(metric.samples));
  if (samples <= 0) return neutralWhenMissing ? 50 : 0;
  const pf = pfScore(metric.pf ?? metric.profitFactor);
  const exp = signedEconomyScore(metric.expectancy, options.expectancyScale || 0.12);
  const netPerSample = n(metric.net, n(metric.netUsdt)) / Math.max(1, samples);
  const net = signedEconomyScore(netPerSample, options.netScale || 0.12);
  const wr = Number.isFinite(Number(metric.wr ?? metric.winRate))
    ? clamp(n(metric.wr, n(metric.winRate)))
    : 50;
  return clamp(pf * 0.30 + exp * 0.35 + net * 0.25 + wr * 0.10);
}
function sampleScore(samples, target = 20) {
  const x = Math.max(0, n(samples));
  return clamp((1 - Math.exp(-x / Math.max(1, target))) * 100);
}

function metricFromRaw(raw = {}) {
  const samples = n(raw.samples, n(raw.triggered, n(raw.n)));
  const loss = n(raw.grossLoss);
  const gp = n(raw.grossProfit);
  const wins = n(raw.tp, n(raw.wins));
  const losses = n(raw.sl, n(raw.losses));
  const be = n(raw.be);
  return {
    samples,
    n: samples,
    wins,
    losses,
    be,
    net: n(raw.net),
    pf: Number.isFinite(Number(raw.pf)) ? n(raw.pf) : (loss > 0 ? gp / loss : (gp > 0 ? 999 : 0)),
    expectancy: Number.isFinite(Number(raw.expectancy)) ? n(raw.expectancy) : (samples ? n(raw.net) / samples : 0),
    wr: Number.isFinite(Number(raw.winRate ?? raw.wr)) ? n(raw.winRate, n(raw.wr)) : ((wins + losses) ? wins / (wins + losses) * 100 : 0)
  };
}

function entryEvolutionEvidence(context = {}) {
  const state = readJsonCached(ENTRY_STATE);
  const p = state?.profiles?.[patternKey(context)];
  if (!p) return { available: false, samples: 0, reason: 'ENTRY_EVOLUTION_PROFILE_YOK' };
  const active = n(p.activeBrick, n(ayarlar.renkoGirisVarsayilanTugla, 0.75));
  const raw = p.candidates?.[active.toFixed(2)] ?? p.candidates?.[String(active)] ?? null;
  const metric = metricFromRaw(raw || {});
  return {
    available: metric.samples > 0,
    samples: metric.samples,
    activeBrick: active,
    ...metric,
    reason: metric.samples > 0 ? (p.lastDecision || 'ENTRY_EVOLUTION_ACTIVE') : 'ENTRY_EVOLUTION_N0'
  };
}

function takeoverReplayEvidence(context = {}) {
  const state = readJsonCached(TAKEOVER_STATE);
  const p = state?.profiles?.[patternKey(context)];
  if (!p) return { available: false, samples: 0, confidence: 0, reason: 'TAKEOVER_REPLAY_PROFILE_YOK' };
  const online = p.online || {};
  const samples = n(online.samples, n(p.closed));
  const metric = {
    samples,
    n: samples,
    wins: n(online.tp, n(online.wins)),
    losses: n(online.sl, n(online.losses)),
    be: n(online.be),
    net: n(online.net),
    pf: n(online.pf),
    expectancy: n(online.expectancy),
    wr: n(online.wr),
    mfeCapture: n(online.mfeCapture),
    avgGiveback: n(online.avgGiveback),
    confidence: n(online.confidence, samples / (samples + Math.max(1, n(ayarlar.renkoCikisOnlineGuvenOnculN, 4))))
  };
  return {
    available: samples > 0,
    ...metric,
    source: samples > 0 ? 'ONLINE_TAKEOVER_REPLAY' : 'SAFE_DEFAULT',
    reason: samples > 0 ? (online.status || 'TAKEOVER_REPLAY_ACTIVE') : 'TAKEOVER_REPLAY_N0_SAFE_DEFAULT'
  };
}

function scoreEvidence(input = {}) {
  const historical = input.historical || {};
  const live = input.live || input.liveReview || {};
  const entry = input.entry || entryEvolutionEvidence(input.context);
  const takeover = input.takeover || takeoverReplayEvidence(input.context);
  const historicalN = n(historical.n, n(historical.samples));
  const liveN = n(live.n, n(live.samples));
  const entryN = n(entry.n, n(entry.samples));
  const takeoverN = n(takeover.n, n(takeover.samples));

  const components = {
    historicalPf: clamp(pfScore(historical.pf ?? historical.profitFactor)),
    historicalExpectancy: signedEconomyScore(historical.expectancy, 0.12),
    liveForm: metricScore(live, { neutralWhenMissing: true, expectancyScale: 0.10, netScale: 0.10 }),
    entryEvolution: metricScore(entry, { neutralWhenMissing: true, expectancyScale: 0.10, netScale: 0.10 }),
    takeoverReplay: metricScore(takeover, { neutralWhenMissing: true, expectancyScale: 0.10, netScale: 0.10 }),
    sampleConfidence: clamp(
      sampleScore(historicalN, 18) * 0.50 +
      sampleScore(Math.max(liveN, entryN), 12) * 0.25 +
      sampleScore(takeoverN, 12) * 0.25
    )
  };

  if (takeoverN > 0) {
    const capture = clamp(n(takeover.mfeCapture, 50));
    const givebackPenalty = clamp(n(takeover.avgGiveback) * 100, 0, 35);
    components.takeoverReplay = clamp(components.takeoverReplay * 0.75 + capture * 0.25 - givebackPenalty * 0.25);
  }

  const policy = input.policy || activePolicy();
  const weights = validWeights(input.weights || policy.weights) || { ...DEFAULT_WEIGHTS };
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + components[key] * weight / 100, 0);
  const evidenceMetric = raw => {
    const m = metricFromRaw(raw || {});
    return { n: m.n, wins: m.wins, losses: m.losses, be: m.be, pf: n(m.pf), expectancy: n(m.expectancy), net: n(m.net), wr: n(m.wr) };
  };
  return {
    version: VERSION,
    score: round(score),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, round(v)])),
    weights: { ...weights },
    policySource: policy.source || 'CUSTOM',
    calibrationGeneratedAt: policy.calibration?.generatedAt || null,
    evidence: {
      historical: evidenceMetric({ ...historical, n: historicalN }),
      live: evidenceMetric({ ...live, n: liveN }),
      entry: { ...evidenceMetric({ ...entry, n: entryN }), reason: entry.reason || null, activeBrick: n(entry.activeBrick) || null },
      takeover: { ...evidenceMetric({ ...takeover, n: takeoverN }), confidence: n(takeover.confidence), mfeCapture: n(takeover.mfeCapture), avgGiveback: n(takeover.avgGiveback), reason: takeover.reason || null }
    }
  };
}

function quantile(values = [], q = 0.40) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];
  const pos = clamp(q, 0, 1) * (rows.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos), w = pos - lo;
  return rows[lo] + (rows[hi] - rows[lo]) * w;
}
function rank(score, cohortScores = []) {
  const rows = [...cohortScores.map(Number).filter(Number.isFinite), n(score)].sort((a, b) => b - a);
  const position = rows.findIndex(x => x <= n(score) + 1e-9) + 1;
  const size = rows.length;
  const percentile = size <= 1 ? 100 : ((size - position) / (size - 1)) * 100;
  return { rank: Math.max(1, position), cohortSize: size, percentile: round(percentile, 1) };
}

function evaluate(input = {}) {
  const policy = input.policy || activePolicy();
  const base = scoreEvidence({ ...input, policy, weights: input.weights || policy.weights });
  const cohort = (input.cohortScores || []).map(Number).filter(Number.isFinite);
  const minScore = clamp(input.minScore ?? policy.minScore, 0, 100);
  const maxDynamic = clamp(input.maxDynamic ?? policy.maxDynamic, minScore, 100);
  const q = clamp(input.relativeQuantile ?? policy.relativeQuantile, 0, 1);
  const dynamic = cohort.length >= 5 ? quantile(cohort, q) : minScore;
  const threshold = round(Math.min(maxDynamic, Math.max(minScore, n(dynamic, minScore))));
  const minN = Math.max(1, n(input.minSample, policy.minSample));
  const historicalN = n(base.evidence.historical.n);
  const relative = rank(base.score, cohort);
  const hardReasons = [];
  if (!completeContext(input.context)) hardReasons.push('EXACT_CONTEXT_INCOMPLETE');
  if (input.historicalPoolComplete === false) hardReasons.push('HISTORICAL_CANONICAL_POOL_INCOMPLETE');
  if (historicalN < minN) hardReasons.push(`PREMIER_SCORE_MIN_SAMPLE_N${historicalN}/${minN}`);
  const selected = hardReasons.length === 0 && base.score >= threshold;
  const reason = hardReasons[0] || (selected ? 'PREMIER_SCORE_SELECTED' : 'PREMIER_SCORE_BELOW_RELATIVE_THRESHOLD');
  const explanation = selected
    ? `Kalite ${base.score.toFixed(1)}/${threshold.toFixed(1)} | Sıra #${relative.rank}/${relative.cohortSize} | Göreceli %${relative.percentile.toFixed(1)}`
    : `${reason} | Kalite ${base.score.toFixed(1)}/${threshold.toFixed(1)} | Sıra #${relative.rank}/${relative.cohortSize} | Göreceli %${relative.percentile.toFixed(1)}`;
  return {
    ...base, ...relative, threshold, minScore, maxDynamic, relativeQuantile: q, minSample: minN,
    liveWindow: policy.liveWindow, selected, executionMode: selected ? 'PREMIER' : 'SHADOW',
    reason, explanation, hardReasons, policySource: policy.source || base.policySource
  };
}

function applyLabReview(result = {}, review = null) {
  if (!review?.complete || !review?.metrics) return result;
  const m = review.metrics;
  const liveMetric = {
    n: n(m.closed), samples: n(m.closed), net: n(m.net),
    pf: n(m.profitFactor), expectancy: n(m.expectancy), wr: n(m.winRate),
    wins: n(m.tp, n(m.wins)), losses: n(m.sl, n(m.losses)), be: n(m.be)
  };
  const liveScore = metricScore(liveMetric, { neutralWhenMissing: true, expectancyScale: 0.10, netScale: 0.10 });
  const delta = clamp((liveScore - 50) * 0.16, -8, 8);
  const score = round(clamp(n(result.score) + delta));
  const selected = (result.hardReasons || []).length === 0 && score >= n(result.threshold, 55);
  const reason = selected ? 'PREMIER_SCORE_SELECTED' : ((result.hardReasons || [])[0] || 'PREMIER_SCORE_BELOW_RELATIVE_THRESHOLD');
  return {
    ...result,
    score,
    selected,
    executionMode: selected ? 'PREMIER' : 'SHADOW',
    reason,
    labLiveAdjustment: round(delta),
    labLiveEvidence: liveMetric,
    explanation: `${selected ? 'Kalite seçildi' : reason} | Skor ${score.toFixed(1)}/${n(result.threshold, 55).toFixed(1)} | LAB canlı düzeltme ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} | Sıra #${result.rank}/${result.cohortSize}`
  };
}

function componentText(result = {}) {
  const c = result.components || {};
  return `Puanlar: PF ${n(c.historicalPf).toFixed(1)}/100 | Exp ${n(c.historicalExpectancy).toFixed(1)}/100 | Canlı ${n(c.liveForm).toFixed(1)}/100 | Entry ${n(c.entryEvolution).toFixed(1)}/100 | Takeover ${n(c.takeoverReplay).toFixed(1)}/100 | Örnek ${n(c.sampleConfidence).toFixed(1)}/100`;
}

function weightedComponentText(result = {}) {
  const c = result.components || {};
  const w = result.weights || activePolicy().weights;
  const names = { historicalPf: 'PF', historicalExpectancy: 'Exp', liveForm: 'Canlı', entryEvolution: 'Entry', takeoverReplay: 'Takeover', sampleConfidence: 'Örnek' };
  return `Skor bileşenleri: ${WEIGHT_KEYS.map(key => `${names[key]} puanı ${n(c[key]).toFixed(1)}/100 × ağırlık %${n(w[key]).toFixed(0)}`).join(' | ')}`;
}

function metricText(metric = {}, options = {}) {
  const m = metricFromRaw(metric || {});
  const prefix = options.prefix ? `${options.prefix} ` : '';
  if (m.n <= 0) return `${prefix}N0`;
  const outcomesKnown = options.hideOutcomeCounts !== true && (m.wins + m.losses + m.be > 0 || m.n <= 0);
  const outcomeText = outcomesKnown ? ` | ✅${m.wins} ❌${m.losses} ⚖️${m.be}` : '';
  return `${prefix}N${m.n}${outcomeText} | PF ${m.pf >= 999 ? '999.00' : m.pf.toFixed(2)} | Exp ${m.expectancy >= 0 ? '+' : ''}${m.expectancy.toFixed(4)} | Net ${m.net >= 0 ? '+' : ''}${m.net.toFixed(4)}`;
}

module.exports = {
  VERSION, WEIGHTS, DEFAULT_WEIGHTS, WEIGHT_KEYS, ENTRY_STATE, TAKEOVER_STATE, CALIBRATION_FILE,
  n, clamp, norm, patternKey, completeContext, validWeights, readCalibration, activePolicy,
  pfScore, signedEconomyScore, metricScore, sampleScore, metricFromRaw,
  entryEvolutionEvidence, takeoverReplayEvidence, scoreEvidence, quantile, rank, evaluate, applyLabReview,
  componentText, weightedComponentText, metricText
};
