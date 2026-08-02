'use strict';

/**
 * AGROS ST2 v6.11.0 — BINANCE SIGNED TIME AUTHORITY
 *
 * Signed Futures calls use Binance server-time offset instead of raw Date.now().
 * - midpoint/RTT compensated offset
 * - periodic refresh
 * - one forced re-sync + one retry on -1021/recvWindow errors
 * - fail-closed health signal for real-order readiness
 */

const https = require('https');
const { URL } = require('url');

const VERSION = 'v6.11.0-BINANCE-SIGNED-TIME-AUTHORITY';
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_SAMPLES = 3;

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function timestampError(error) {
  const text = String(error?.message || error?.body || error?.response?.data?.msg || error || '');
  const code = Number(error?.code ?? error?.response?.data?.code ?? error?.body?.code);
  return code === -1021 || /outside of the recvWindow|timestamp.*recvWindow|code.?-1021/i.test(text);
}

function create(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || 'https://fapi.binance.com');
  const syncIntervalMs = Math.max(60_000, finite(options.syncIntervalMs, DEFAULT_SYNC_INTERVAL_MS));
  const maxAgeMs = Math.max(syncIntervalMs, finite(options.maxAgeMs, DEFAULT_MAX_AGE_MS));
  const timeoutMs = Math.max(1500, finite(options.timeoutMs, DEFAULT_TIMEOUT_MS));
  const samples = Math.max(1, Math.min(5, Math.floor(finite(options.samples, DEFAULT_SAMPLES))));
  const requestImpl = typeof options.requestImpl === 'function' ? options.requestImpl : requestServerTime;

  const state = {
    version: VERSION,
    baseUrl,
    offsetMs: 0,
    synced: false,
    lastSyncAt: 0,
    lastSuccessAt: 0,
    lastAttemptAt: 0,
    lastRttMs: null,
    lastServerTime: null,
    syncCount: 0,
    syncFailures: 0,
    timestampErrors: 0,
    guardedRetries: 0,
    guardedRetrySuccess: 0,
    lastError: null,
    timer: null,
    inFlight: null
  };

  function now() {
    return Math.floor(Date.now() + finite(state.offsetMs, 0));
  }

  function ageMs(at = Date.now()) {
    return state.lastSuccessAt > 0 ? Math.max(0, at - state.lastSuccessAt) : Number.POSITIVE_INFINITY;
  }

  function healthy(at = Date.now()) {
    return state.synced === true && ageMs(at) <= maxAgeMs;
  }

  async function sync(syncOptions = {}) {
    const force = syncOptions.force === true;
    const at = Date.now();
    if (!force && healthy(at) && at - state.lastAttemptAt < Math.min(syncIntervalMs, 60_000)) {
      return health();
    }
    if (state.inFlight) return state.inFlight;

    state.lastAttemptAt = at;
    state.inFlight = (async () => {
      const rows = [];
      let lastError = null;
      for (let i = 0; i < samples; i++) {
        try {
          const startedAt = Date.now();
          const serverTime = await requestImpl(baseUrl, timeoutMs);
          const finishedAt = Date.now();
          const rttMs = Math.max(0, finishedAt - startedAt);
          const midpoint = startedAt + rttMs / 2;
          rows.push({ serverTime: finite(serverTime), rttMs, offsetMs: finite(serverTime) - midpoint });
        } catch (error) {
          lastError = error;
        }
      }
      if (!rows.length) {
        state.syncFailures++;
        state.lastError = String(lastError?.message || lastError || 'BINANCE_TIME_SYNC_FAILED').slice(0, 300);
        if (!state.synced) state.offsetMs = 0;
        throw new Error(`BINANCE_TIME_SYNC_FAILED:${state.lastError}`);
      }
      rows.sort((a, b) => a.rttMs - b.rttMs);
      const best = rows[0];
      state.offsetMs = Math.round(best.offsetMs);
      state.synced = true;
      state.lastSyncAt = Date.now();
      state.lastSuccessAt = state.lastSyncAt;
      state.lastRttMs = best.rttMs;
      state.lastServerTime = best.serverTime;
      state.syncCount++;
      state.lastError = null;
      return health();
    })().finally(() => { state.inFlight = null; });

    return state.inFlight;
  }

  async function guardedCall(fn, label = 'SIGNED_CALL') {
    try {
      return await fn();
    } catch (error) {
      if (!timestampError(error)) throw error;
      state.timestampErrors++;
      await sync({ force: true });
      state.guardedRetries++;
      try {
        const result = await fn();
        state.guardedRetrySuccess++;
        return result;
      } catch (retryError) {
        retryError.message = `${retryError.message || retryError} | TIME_SYNC_RETRY_FAILED:${label}`;
        throw retryError;
      }
    }
  }

  function signedArgs(args = [], recvWindow = 15000) {
    const windowMs = Math.max(5000, Math.min(60000, Math.floor(finite(recvWindow, 15000))));
    const out = Array.from(args);
    if (!out.length || out[0] == null) return [{ recvWindow: windowMs }, ...out.slice(1)];
    if (typeof out[0] === 'object' && !Array.isArray(out[0])) {
      const existing = finite(out[0].recvWindow, NaN);
      out[0] = {
        ...out[0],
        recvWindow: Number.isFinite(existing)
          ? Math.max(5000, Math.min(60000, Math.floor(existing)))
          : windowMs
      };
    }
    return out;
  }

  function wrapClient(client, methodNames = [], wrapOptions = {}) {
    if (!client || typeof client !== 'object') return client;
    const names = [...new Set(methodNames.map(String))];
    const recvWindow = Math.max(5000, Math.min(60000, Math.floor(finite(wrapOptions.recvWindow, 15000))));
    for (const name of names) {
      const original = client[name];
      if (typeof original !== 'function' || original.__agrosTimeGuarded === true) continue;
      const wrapped = async function agrosTimeGuardedMethod(...args) {
        const callArgs = signedArgs(args, recvWindow);
        return guardedCall(() => original.apply(client, callArgs), name);
      };
      Object.defineProperty(wrapped, '__agrosTimeGuarded', { value: true });
      Object.defineProperty(wrapped, '__agrosOriginal', { value: original });
      Object.defineProperty(wrapped, '__agrosRecvWindow', { value: recvWindow });
      client[name] = wrapped;
    }
    return client;
  }

  function start() {
    if (state.timer) return state.timer;
    state.timer = setInterval(() => {
      sync({ force: true }).catch(error => {
        state.lastError = String(error?.message || error).slice(0, 300);
      });
    }, syncIntervalMs);
    state.timer.unref?.();
    return state.timer;
  }

  function stop() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function health() {
    return {
      version: VERSION,
      baseUrl,
      synced: state.synced,
      healthy: healthy(),
      offsetMs: Math.round(finite(state.offsetMs)),
      ageMs: Number.isFinite(ageMs()) ? Math.round(ageMs()) : null,
      maxAgeMs,
      lastSyncAt: state.lastSyncAt || null,
      lastSuccessAt: state.lastSuccessAt || null,
      lastRttMs: state.lastRttMs,
      lastServerTime: state.lastServerTime,
      syncCount: state.syncCount,
      syncFailures: state.syncFailures,
      timestampErrors: state.timestampErrors,
      guardedRetries: state.guardedRetries,
      guardedRetrySuccess: state.guardedRetrySuccess,
      lastError: state.lastError
    };
  }

  function _setForTest(patch = {}) {
    Object.assign(state, patch);
  }

  return { VERSION, now, sync, start, stop, health, healthy, ageMs, guardedCall, wrapClient, signedArgs, timestampError, _setForTest };
}

function requestServerTime(baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${normalizeBaseUrl(baseUrl)}/fapi/v1/time`);
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      family: 4,
      timeout: timeoutMs,
      headers: { Accept: 'application/json', Connection: 'close', 'User-Agent': 'AGROS-ST2/6.11.1' }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`BINANCE_TIME_HTTP_${response.statusCode}:${body.slice(0, 200)}`));
          return;
        }
        try {
          const parsed = JSON.parse(body);
          const serverTime = finite(parsed?.serverTime, NaN);
          if (!Number.isFinite(serverTime) || serverTime <= 0) throw new Error('SERVER_TIME_INVALID');
          resolve(serverTime);
        } catch (error) {
          reject(new Error(`BINANCE_TIME_PARSE_FAILED:${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`BINANCE_TIME_TIMEOUT:${timeoutMs}ms`)));
    request.on('error', reject);
    request.end();
  });
}

module.exports = { VERSION, create, requestServerTime, timestampError, normalizeBaseUrl };
