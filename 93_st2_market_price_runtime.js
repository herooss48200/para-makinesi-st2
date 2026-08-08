'use strict';

/**
 * AGROS ST2 R16 — resilient market price runtime.
 *
 * Global Futures ticker is preferred, but entry scanning must not die when the
 * all-symbol endpoint is temporarily unavailable. The Golden Renko startup and
 * 1m refresh already fetch closed 1m candles; their latest closed price is a
 * bounded, auditable fallback for ENTRY scanning only.
 *
 * Real/open position protection remains fail-closed on network price failure.
 */

let tickerFailCount = 0;
let nextTickerAttemptAt = 0;
let lastFallbackLogAt = 0;

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function ensure(state) {
  state.canliFiyatlar ||= {};
  state.canliFiyatMeta ||= {};
  return state;
}

function seedClosed1m(state, sym, candles, source = 'CLOSED_1M') {
  ensure(state);
  const rows = Array.isArray(candles) ? candles : [];
  const last = rows.length ? rows.at(-1) : null;
  const price = n(last?.close);
  const marketTime = n(last?.closeTime);
  if (!(price > 0 && marketTime > 0)) return false;
  state.canliFiyatlar[sym] = price;
  state.canliFiyatMeta[sym] = { source, marketTime, observedAt: Date.now() };
  return true;
}

function applyTicker(state, prices, observedAt = Date.now()) {
  ensure(state);
  let count = 0;
  for (const [sym, raw] of Object.entries(prices || {})) {
    const price = n(raw);
    if (!(price > 0)) continue;
    state.canliFiyatlar[sym] = price;
    state.canliFiyatMeta[sym] = { source: 'FUTURES_TICKER_ALL', marketTime: observedAt, observedAt };
    count++;
  }
  return count;
}

function isFresh(meta, now, fallbackMaxAgeMs, tickerMaxAgeMs) {
  if (!meta) return false;
  const source = String(meta.source || '');
  if (source === 'FUTURES_TICKER_ALL') return now - n(meta.observedAt) <= tickerMaxAgeMs;
  return now - n(meta.marketTime) <= fallbackMaxAgeMs;
}

function coverage(state, symbols, options = {}) {
  ensure(state);
  const now = n(options.now, Date.now());
  const fallbackMaxAgeMs = Math.max(60_000, n(options.fallbackMaxAgeMs, 120_000));
  const tickerMaxAgeMs = Math.max(2_000, n(options.tickerMaxAgeMs, 30_000));
  const list = Array.from(symbols || []);
  let fresh = 0, stale = 0, missing = 0, ticker = 0, fallback = 0;
  for (const sym of list) {
    const price = n(state.canliFiyatlar?.[sym]);
    const meta = state.canliFiyatMeta?.[sym];
    if (!(price > 0) || !meta) { missing++; continue; }
    if (!isFresh(meta, now, fallbackMaxAgeMs, tickerMaxAgeMs)) { stale++; continue; }
    fresh++;
    if (String(meta.source) === 'FUTURES_TICKER_ALL') ticker++; else fallback++;
  }
  return { total: list.length, fresh, stale, missing, ticker, fallback, ratio: list.length ? fresh / list.length : 0 };
}

function invalidateStaleFallbacks(state, symbols, options = {}) {
  ensure(state);
  const now = n(options.now, Date.now());
  const fallbackMaxAgeMs = Math.max(60_000, n(options.fallbackMaxAgeMs, 120_000));
  let invalidated = 0;
  for (const sym of Array.from(symbols || [])) {
    const meta = state.canliFiyatMeta?.[sym];
    if (!meta || String(meta.source) === 'FUTURES_TICKER_ALL') continue;
    if (now - n(meta.marketTime) > fallbackMaxAgeMs) {
      delete state.canliFiyatlar[sym];
      delete state.canliFiyatMeta[sym];
      invalidated++;
    }
  }
  return invalidated;
}

function resetTickerBackoff() {
  tickerFailCount = 0;
  nextTickerAttemptAt = 0;
}

function backoffAfterFailure(settings, now = Date.now()) {
  tickerFailCount++;
  const base = Math.max(2_000, n(settings?.futuresTickerBackoffBaseMs, 10_000));
  const max = Math.max(base, n(settings?.futuresTickerBackoffMaxMs, 60_000));
  const delay = Math.min(max, base * Math.pow(2, Math.max(0, tickerFailCount - 1)));
  nextTickerAttemptAt = now + delay;
  return delay;
}

async function refreshForMainLoop({ state, symbols, activePositions = [], settings = {}, fetchAll, forceFallbackOnly = false, log = console }) {
  ensure(state);
  const now = Date.now();
  const fallbackMaxAgeMs = Math.max(60_000, n(settings.st2FallbackPriceMaxAgeMs, 120_000));
  const threshold = Math.max(0.80, Math.min(1, n(settings.startupMarketReadyOrani, 0.95)));
  invalidateStaleFallbacks(state, symbols, { now, fallbackMaxAgeMs });

  const active = Array.from(activePositions || []);
  const realProtectionNeedsFreshNetwork = active.some(pos => pos?.sanal === false);
  const before = coverage(state, symbols, { now, fallbackMaxAgeMs });

  const canAttemptTicker = !forceFallbackOnly && typeof fetchAll === 'function' && now >= nextTickerAttemptAt;
  if (canAttemptTicker) {
    try {
      const prices = await fetchAll();
      const applied = applyTicker(state, prices, Date.now());
      if (!(applied > 0)) throw new Error('FUTURES_TICKER_EMPTY');
      resetTickerBackoff();
      const cov = coverage(state, symbols, { fallbackMaxAgeMs });
      return { usable: true, networkOk: true, source: 'FUTURES_TICKER_ALL', applied, coverage: cov, error: null };
    } catch (error) {
      const delay = backoffAfterFailure(settings, now);
      const cov = coverage(state, symbols, { fallbackMaxAgeMs });
      if (realProtectionNeedsFreshNetwork) {
        return { usable: false, networkOk: false, source: 'NETWORK_REQUIRED_FOR_REAL_POSITION', coverage: cov, error, retryAfterMs: delay };
      }
      if (cov.ratio >= threshold) {
        if (Date.now() - lastFallbackLogAt >= Math.max(10_000, n(settings.st2FallbackPriceLogIntervalMs, 30_000))) {
          lastFallbackLogAt = Date.now();
          log.warn?.(`⚠️ [ST2 PRICE FALLBACK] FUTURES_PRICES kullanılamadı; taze kapanmış 1m snapshot ile giriş taraması devam ediyor | ${cov.fresh}/${cov.total} | Sonraki ticker denemesi ${Math.round(delay/1000)} sn | ${error.message}`);
        }
        return { usable: true, networkOk: false, source: 'CLOSED_1M_FALLBACK', coverage: cov, error, retryAfterMs: delay };
      }
      return { usable: false, networkOk: false, source: 'PRICE_COVERAGE_INSUFFICIENT', coverage: cov, error, retryAfterMs: delay };
    }
  }

  const cov = before.total ? coverage(state, symbols, { fallbackMaxAgeMs }) : before;
  if (realProtectionNeedsFreshNetwork) {
    return { usable: false, networkOk: false, source: 'NETWORK_BACKOFF_REAL_POSITION', coverage: cov, error: null, retryAfterMs: Math.max(0, nextTickerAttemptAt - now) };
  }
  return { usable: cov.ratio >= threshold, networkOk: false, source: forceFallbackOnly ? 'FIRST_AUDIT_CLOSED_1M' : 'CLOSED_1M_BACKOFF', coverage: cov, error: null, retryAfterMs: Math.max(0, nextTickerAttemptAt - now) };
}

function _resetForTest() { tickerFailCount = 0; nextTickerAttemptAt = 0; lastFallbackLogAt = 0; }

module.exports = { seedClosed1m, applyTicker, coverage, invalidateStaleFallbacks, refreshForMainLoop, _resetForTest };
