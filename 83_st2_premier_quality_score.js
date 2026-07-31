'use strict';

/**
 * AGROS ST2 v6.9.0 — PREMIER QUALITY SCORE
 * Reporting/admission intelligence only. Trade Engine, entry price, stop, BE and
 * exit mathematics are not changed here.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.9.0-PREMIER-QUALITY-SCORE';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const ENTRY_STATE = path.join(DATA_DIR, 'st2-renko-entry-evolution.json');
const TAKEOVER_STATE = path.join(DATA_DIR, 'st2-renko-exit-evolution.json');

const WEIGHTS = Object.freeze({
  historicalPf: 18,
  historicalExpectancy: 17,
  liveForm: 20,
  entryEvolution: 15,
  takeoverReplay: 15,
  sampleConfidence: 15
});

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
  return {
    samples,
    n: samples,
    net: n(raw.net),
    pf: Number.isFinite(Number(raw.pf)) ? n(raw.pf) : (loss > 0 ? gp / loss : (gp > 0 ? 999 : 0)),
    expectancy: Number.isFinite(Number(raw.expectancy)) ? n(raw.expectancy) : (samples ? n(raw.net) / samples : 0),
    wr: Number.isFinite(Number(raw.winRate)) ? n(raw.winRate) : (samples ? n(raw.tp) / samples * 100 : 0)
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

  // Takeover replay kalitesinde MFE yakalama/giveback varsa ekonomik skoru hafifçe düzelt.
  if (takeoverN > 0) {
    const capture = clamp(n(takeover.mfeCapture, 50));
    const givebackPenalty = clamp(n(takeover.avgGiveback) * 100, 0, 35);
    components.takeoverReplay = clamp(components.takeoverReplay * 0.75 + capture * 0.25 - givebackPenalty * 0.25);
  }

  const score = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + components[key] * weight / 100, 0);
  return {
    version: VERSION,
    score: round(score),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, round(v)])),
    weights: { ...WEIGHTS },
    evidence: {
      historical: { n: historicalN, pf: n(historical.pf), expectancy: n(historical.expectancy), net: n(historical.net) },
      live: { n: liveN, pf: n(live.pf), expectancy: n(live.expectancy), net: n(live.net) },
      entry: { n: entryN, pf: n(entry.pf), expectancy: n(entry.expectancy), net: n(entry.net), reason: entry.reason || null },
      takeover: { n: takeoverN, pf: n(takeover.pf), expectancy: n(takeover.expectancy), net: n(takeover.net), confidence: n(takeover.confidence), reason: takeover.reason || null }
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
  const base = scoreEvidence(input);
  const cohort = (input.cohortScores || []).map(Number).filter(Number.isFinite);
  const minScore = clamp(ayarlar.renkoPremierScoreMin ?? 55, 0, 100);
  const maxDynamic = clamp(ayarlar.renkoPremierScoreMaxDinamikEsik ?? 70, minScore, 100);
  const q = clamp(ayarlar.renkoPremierScoreGoreceliYuzdelik ?? 0.40, 0, 1);
  const dynamic = cohort.length >= 5 ? quantile(cohort, q) : minScore;
  const threshold = round(Math.min(maxDynamic, Math.max(minScore, n(dynamic, minScore))));
  const minN = Math.max(1, n(ayarlar.renkoPremierScoreMinOrnek, 3));
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
  return { ...base, ...relative, threshold, minScore, selected, executionMode: selected ? 'PREMIER' : 'SHADOW', reason, explanation, hardReasons };
}

function applyLabReview(result = {}, review = null) {
  if (!review?.complete || !review?.metrics) return result;
  const m = review.metrics;
  const liveMetric = {
    n: n(m.closed), samples: n(m.closed), net: n(m.net),
    pf: n(m.profitFactor), expectancy: n(m.expectancy), wr: n(m.winRate)
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
  return `PF ${n(c.historicalPf).toFixed(1)} | Exp ${n(c.historicalExpectancy).toFixed(1)} | Canlı ${n(c.liveForm).toFixed(1)} | Entry ${n(c.entryEvolution).toFixed(1)} | Takeover ${n(c.takeoverReplay).toFixed(1)} | Örnek ${n(c.sampleConfidence).toFixed(1)}`;
}

module.exports = {
  VERSION, WEIGHTS, ENTRY_STATE, TAKEOVER_STATE,
  n, clamp, norm, patternKey, completeContext, pfScore, signedEconomyScore, metricScore, sampleScore,
  entryEvolutionEvidence, takeoverReplayEvidence, scoreEvidence, quantile, rank, evaluate, applyLabReview, componentText
};
