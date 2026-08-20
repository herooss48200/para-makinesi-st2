'use strict';

// R31.1 FINAL DIRECTION GUARD
// Live execution-only guard. No network calls: it reads the already prepared
// closed 15m cache from h.state.yerelPusuHafizasi.
// Symmetric market-direction protection:
// - strong BTC+ETH UP => SHORT hard-veto
// - strong BTC+ETH DOWN => LONG hard-veto
// No network calls are introduced in the execution hot path.

const h = require('./1_hafiza.js');

const EMA_FAST = 50;
const EMA_SLOW = 200;
const MIN_ROWS = EMA_SLOW + 1;
const SIDEWAYS_PCT = 0.10;
const SHORT_STRONG_UP_GAP_PCT = 1.00;
const LONG_STRONG_DOWN_GAP_PCT = 1.00;

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
  h.state.st2FinalDirectionGuard ||= {};
  const s = h.state.st2FinalDirectionGuard;
  s.version = 'R31.2-SYMMETRIC-FINAL-DIRECTION-GUARD';
  for (const key of ['evaluated','dataMissing','shortKeep','shortVeto','longKeep','longVeto']) {
    if (!Number.isFinite(Number(s[key]))) s[key] = 0;
  }
  if (!Object.prototype.hasOwnProperty.call(s, 'lastDecision')) s.lastDecision = null;
  if (!Object.prototype.hasOwnProperty.call(s, 'lastVeto')) s.lastVeto = null;
  return s;
}

function evaluate({ symbol, side } = {}) {
  const dir = String(side || '').toUpperCase();
  const btc = marketTrend('BTCUSDT');
  const eth = marketTrend('ETHUSDT');
  const dataOk = Boolean(btc && eth);

  const shortVeto = dir === 'SHORT' && dataOk &&
    btc.trend === 'UP' && eth.trend === 'UP' &&
    btc.gap >= SHORT_STRONG_UP_GAP_PCT && eth.gap >= SHORT_STRONG_UP_GAP_PCT;

  const longVeto = dir === 'LONG' && dataOk &&
    btc.trend === 'DOWN' && eth.trend === 'DOWN' &&
    btc.gap >= LONG_STRONG_DOWN_GAP_PCT && eth.gap >= LONG_STRONG_DOWN_GAP_PCT;

  const hardVeto = shortVeto || longVeto;
  const reason = shortVeto
    ? 'ONUR_FINAL_SHORT_HARD_VETO'
    : longVeto
      ? 'ONUR_FINAL_LONG_HARD_VETO'
      : !dataOk
        ? 'ONUR_FINAL_GUARD_DATA_FAIL_OPEN'
        : 'ONUR_FINAL_GUARD_KEEP';

  const decision = {
    symbol: String(symbol || '').toUpperCase(),
    side: dir,
    dataOk,
    hardVeto,
    shortVeto,
    longVeto,
    reason,
    btc,
    eth,
    evaluatedAt: new Date().toISOString()
  };

  const s = stats();
  s.evaluated++;
  if (!dataOk) s.dataMissing++;
  if (dir === 'SHORT') shortVeto ? s.shortVeto++ : s.shortKeep++;
  if (dir === 'LONG') longVeto ? s.longVeto++ : s.longKeep++;
  s.lastDecision = decision;
  if (hardVeto) s.lastVeto = decision;
  return decision;
}

function snapshot() {
  return { ...stats() };
}

module.exports = {
  VERSION: 'R31.2-SYMMETRIC-FINAL-DIRECTION-GUARD',
  EMA_FAST,
  EMA_SLOW,
  MIN_ROWS,
  SIDEWAYS_PCT,
  SHORT_STRONG_UP_GAP_PCT,
  LONG_STRONG_DOWN_GAP_PCT,
  trendFromRows,
  marketTrend,
  evaluate,
  snapshot
};
