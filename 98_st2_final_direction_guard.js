'use strict';

// R31.1 FINAL DIRECTION GUARD
// Live execution-only guard. No network calls: it reads the already prepared
// closed 15m cache from h.state.yerelPusuHafizasi.
// SHORT hard-veto was validated on the real-trade replay cohort; LONG remains shadow-only.

const h = require('./1_hafiza.js');

const EMA_FAST = 50;
const EMA_SLOW = 200;
const MIN_ROWS = EMA_SLOW + 1;
const SIDEWAYS_PCT = 0.10;
const SHORT_STRONG_UP_GAP_PCT = 1.00;

function finite(v, fallback = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ema(rows, period) {
  const closes = rows.map(x => finite(x?.close)).filter(Number.isFinite);
  if (closes.length < MIN_ROWS) return NaN;
  const k = 2 / (period + 1);
  let value = closes[0];
  for (let i = 1; i < closes.length; i++) value = ((closes[i] - value) * k) + value;
  return value;
}

function trendFromRows(rows) {
  const clean = (Array.isArray(rows) ? rows : [])
    .filter(x => Number.isFinite(Number(x?.close)))
    .slice(-MIN_ROWS);
  if (clean.length < MIN_ROWS) return null;
  const ema50 = ema(clean, EMA_FAST);
  const ema200 = ema(clean, EMA_SLOW);
  if (!(Number.isFinite(ema50) && Number.isFinite(ema200) && ema200 !== 0)) return null;
  const gap = Math.abs((ema50 - ema200) / ema200) * 100;
  return {
    trend: gap <= SIDEWAYS_PCT ? 'SIDEWAYS' : (ema50 > ema200 ? 'UP' : 'DOWN'),
    gap,
    ema50,
    ema200,
    rows: clean.length,
    source: 'CLOSED_15M_CACHE'
  };
}

function marketTrend(sym) {
  return trendFromRows(h.state?.yerelPusuHafizasi?.[String(sym || '').toUpperCase()] || []);
}

function stats() {
  h.state.st2FinalDirectionGuard ||= {
    version: 'R31.1-FINAL-DIRECTION-GUARD',
    evaluated: 0,
    dataMissing: 0,
    shortKeep: 0,
    shortVeto: 0,
    longShadowKeep: 0,
    longShadowWouldVeto: 0,
    lastDecision: null,
    lastVeto: null
  };
  return h.state.st2FinalDirectionGuard;
}

function evaluate({ symbol, side } = {}) {
  const dir = String(side || '').toUpperCase();
  const btc = marketTrend('BTCUSDT');
  const eth = marketTrend('ETHUSDT');
  const dataOk = Boolean(btc && eth);
  const shortVeto = dir === 'SHORT' && dataOk &&
    btc.trend === 'UP' && eth.trend === 'UP' &&
    btc.gap >= SHORT_STRONG_UP_GAP_PCT && eth.gap >= SHORT_STRONG_UP_GAP_PCT;
  const longWouldVeto = dir === 'LONG' && Boolean(btc) && btc.trend !== 'UP';
  const decision = {
    symbol: String(symbol || '').toUpperCase(),
    side: dir,
    dataOk,
    hardVeto: shortVeto,
    longShadowWouldVeto: longWouldVeto,
    reason: shortVeto ? 'ONUR_FINAL_SHORT_HARD_VETO' : (!dataOk ? 'ONUR_FINAL_GUARD_DATA_FAIL_OPEN' : 'ONUR_FINAL_GUARD_KEEP'),
    btc,
    eth,
    evaluatedAt: new Date().toISOString()
  };

  const s = stats();
  s.evaluated++;
  if (!dataOk) s.dataMissing++;
  if (dir === 'SHORT') shortVeto ? s.shortVeto++ : s.shortKeep++;
  if (dir === 'LONG') longWouldVeto ? s.longShadowWouldVeto++ : s.longShadowKeep++;
  s.lastDecision = decision;
  if (shortVeto) s.lastVeto = decision;
  return decision;
}

function snapshot() {
  return { ...stats() };
}

module.exports = {
  VERSION: 'R31.1-FINAL-DIRECTION-GUARD',
  EMA_FAST,
  EMA_SLOW,
  MIN_ROWS,
  SIDEWAYS_PCT,
  SHORT_STRONG_UP_GAP_PCT,
  trendFromRows,
  marketTrend,
  evaluate,
  snapshot
};
