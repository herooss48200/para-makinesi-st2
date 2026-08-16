'use strict';

/**
 * AGROS ST2 v6.11.1 — PROFIT FLOOR TWO-SLOT ORDER & PROTECTION CHAIN
 *
 * Gerçek emir katmanı için tek yürütme otoritesi:
 * - deterministik client order id / tekrar emir koruması
 * - kalıcı PENDING/SUBMITTED/OPEN/CLOSING/CLOSED state
 * - belirsiz API yanıtında yeniden emir göndermeden Binance mutabakatı
 * - gerçek fill ve pozisyon miktarı doğrulaması
 * - 2025-12 sonrası USDⓈ-M Algo Service üzerinden SL/TP
 * - yeni stop doğrulanmadan eski stopu iptal etmeyen atomik yenileme
 * - restart recovery, koruma mutabakatı ve gerçek komisyon/PNL toplama
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const realOrderBridge = require('./50_real_order_readiness_bridge.js');
const binanceEndpointAuthority = require('./86_st2_binance_endpoint_authority.js');

const VERSION = 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-real-order-execution-state.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const AUDIT_FILE = path.join(DATA_DIR, 'st2-real-order-execution-audit.jsonl');
const BINANCE_ENDPOINT = binanceEndpointAuthority.resolve();
const ACCOUNT_LOCK_KEY = hash(`${BINANCE_ENDPOINT.httpFutures}|${process.env.BINANCE_API_KEY || 'NO_KEY'}`, 16);
const PROCESS_LOCK_FILE = process.env.AGROS_REAL_ORDER_LOCK_FILE
  ? path.resolve(process.env.AGROS_REAL_ORDER_LOCK_FILE)
  : path.join(os.tmpdir(), `agros-st2-real-${ACCOUNT_LOCK_KEY}.pidlock`);
const OWNED_PREFIX = 'AGST2';
let processLockOwned = false;
let processLockCleanupRegistered = false;
const ACTIVE_STATUSES = new Set(['PENDING', 'SUBMITTED', 'OPEN', 'CLOSING', 'QUARANTINED']);
const TERMINAL_ORDER_STATUSES = new Set(['FILLED', 'CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'EXPIRED_IN_MATCH']);
const ACTIVE_ALGO_STATUSES = new Set(['NEW', 'ACCEPTED', 'PENDING', 'WORKING', 'TRIGGERING']);
const MANUAL_REARM_BLOCK = 'MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED';

function nowIso() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function finite(v, fallback = NaN) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function positiveId(v) {
  const n = finite(v, NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function upper(v) { return String(v || '').trim().toUpperCase(); }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function hash(v, len = 24) { return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, len).toUpperCase(); }
function sanitize(v, len = 8) { return upper(v).replace(/[^A-Z0-9]/g, '').slice(0, len) || 'NA'; }
function ownedId(v) { return upper(v).startsWith(OWNED_PREFIX); }
function algoOrderStatus(row) { return upper(row?.algoStatus ?? row?.status); }
function algoOrderType(row) { return upper(row?.orderType ?? row?.type); }
function algoPayloadRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['orders', 'rows', 'list', 'data']) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const key of ['data', 'order', 'result']) {
    const nested = value[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) return [nested];
  }
  return [value];
}
function normalizeAlgoOrder(row) {
  const candidate = algoPayloadRows(row)[0];
  if (!candidate || typeof candidate !== 'object') return null;
  const status = algoOrderStatus(candidate);
  const type = algoOrderType(candidate);
  return {
    ...clone(candidate),
    status: status || null,
    algoStatus: status || null,
    type: type || null,
    orderType: type || null
  };
}
function positionSideSupported(row) { const side = upper(row?.positionSide || 'BOTH'); return !side || side === 'BOTH'; }
function positionDirection(row) {
  const amount = finite(row?.positionAmt, 0);
  if (amount > 0) return 'LONG';
  if (amount < 0) return 'SHORT';
  return null;
}
function positionAmount(row) { return Math.abs(finite(row?.positionAmt, 0)); }
function activeRecord(record) { return Boolean(record && ACTIVE_STATUSES.has(upper(record.status))); }

function normalizeTriggerPrice(symbol, side, rawPrice) {
  const price = finite(rawPrice, NaN);
  if (!(price > 0)) throw new Error('TETIK_FIYATI_GECERSIZ');
  const rules = h.state?.basamaklar?.[upper(symbol)] || {};
  const tickSize = finite(rules.tickSize, NaN);
  const precision = Number.isInteger(Number(rules.pricePrecision)) ? Number(rules.pricePrecision) : null;
  let normalized = price;
  if (tickSize > 0) {
    const units = price / tickSize;
    normalized = upper(side) === 'SHORT'
      ? Math.ceil(units - 1e-10) * tickSize
      : Math.floor(units + 1e-10) * tickSize;
  }
  if (precision !== null) normalized = Number(normalized.toFixed(precision));
  if (!(normalized > 0)) throw new Error('TETIK_FIYATI_KURAL_SONRASI_GECERSIZ');
  return normalized;
}

function blankState() {
  return { version: VERSION, updatedAt: nowIso(), globalBlock: null, records: {}, closed: [] };
}

function parseState(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    ...blankState(),
    ...raw,
    records: raw?.records && typeof raw.records === 'object' ? raw.records : {},
    closed: Array.isArray(raw?.closed) ? raw.closed : []
  };
}

function readState() {
  ensureDir();
  try { return parseState(STATE_FILE); }
  catch (primaryError) {
    try {
      const recovered = parseState(BACKUP_FILE);
      audit('STATE_BACKUP_RECOVERY', { error: primaryError.message });
      return recovered;
    } catch (backupError) {
      if (fs.existsSync(STATE_FILE) || fs.existsSync(BACKUP_FILE)) {
        audit('STATE_CORRUPTION_FAIL_CLOSED', { primaryError: primaryError.message, backupError: backupError.message });
        return {
          ...blankState(),
          globalBlock: {
            reason: 'STATE_CORRUPTION_NO_RECOVERY',
            at: nowIso(),
            primaryError: primaryError.message,
            backupError: backupError.message
          }
        };
      }
      return blankState();
    }
  }
}

function writeState(state) {
  ensureDir();
  const next = { ...state, version: VERSION, updatedAt: nowIso() };
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  if (fs.existsSync(STATE_FILE)) {
    try {
      parseState(STATE_FILE); // Bozuk primary, sağlam backup'ın üzerine kopyalanamaz.
      fs.copyFileSync(STATE_FILE, BACKUP_FILE);
    } catch (err) {
      audit('CORRUPT_PRIMARY_NOT_BACKED_UP', { error: err.message });
    }
  }
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return next;
}

function mutate(fn) {
  const state = readState();
  const result = fn(state);
  writeState(state);
  return result;
}

function audit(event, details = {}) {
  try {
    ensureDir();
    fs.appendFileSync(AUDIT_FILE, JSON.stringify({ at: nowIso(), version: VERSION, event, ...details }) + '\n');
  } catch (_) {}
}

function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try { process.kill(n, 0); return true; }
  catch (err) { return err?.code === 'EPERM'; }
}

function cleanupProcessLock() {
  if (!processLockOwned) return;
  try {
    const row = JSON.parse(fs.readFileSync(PROCESS_LOCK_FILE, 'utf8'));
    if (Number(row?.pid) === process.pid) fs.unlinkSync(PROCESS_LOCK_FILE);
  } catch (_) {}
  processLockOwned = false;
}

function acquireProcessLock() {
  ensureDir();
  if (processLockOwned) return { ok: true, ownerPid: process.pid, reused: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(PROCESS_LOCK_FILE, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: nowIso(), version: VERSION }));
      fs.closeSync(fd);
      processLockOwned = true;
      if (!processLockCleanupRegistered) {
        processLockCleanupRegistered = true;
        process.once('exit', cleanupProcessLock);
      }
      audit('PROCESS_LOCK_ACQUIRED', { pid: process.pid });
      return { ok: true, ownerPid: process.pid, reused: false };
    } catch (err) {
      if (err?.code !== 'EEXIST') return { ok: false, reason: `PROCESS_LOCK_IO:${err.message}` };
      let existing = null;
      try { existing = JSON.parse(fs.readFileSync(PROCESS_LOCK_FILE, 'utf8')); } catch (_) {}
      if (existing && Number(existing.pid) === process.pid) {
        processLockOwned = true;
        return { ok: true, ownerPid: process.pid, reused: true };
      }
      if (existing && pidAlive(existing.pid)) {
        return { ok: false, reason: `IKINCI_GERCEK_BOT_SURECI:${existing.pid}`, owner: existing };
      }
      try { fs.unlinkSync(PROCESS_LOCK_FILE); }
      catch (unlinkError) { return { ok: false, reason: `STALE_PROCESS_LOCK_SILINEMEDI:${unlinkError.message}`, owner: existing }; }
      audit('STALE_PROCESS_LOCK_REMOVED', { owner: existing });
    }
  }
  return { ok: false, reason: 'PROCESS_LOCK_ALINAMADI' };
}

function contextFingerprint(symbol, side, context = {}) {
  const pusu = context?.girisAnalizi?.pusuTuglasi || context?.pusuTuglasi || {};
  const analysis = context?.girisAnalizi || context || {};
  const readiness = context?.realOrderReadiness || {};
  const source = [
    sanitize(symbol, 16), upper(side),
    pusu.patternSignature || analysis.patternSignature || analysis.patternId || analysis.patternKodu || 'PATTERN_YOK',
    pusu.sonKapaliTuglaZamani || analysis.sonKapaliTuglaZamani || 0,
    pusu.referansTuglaId || analysis.referansTuglaId || 0,
    pusu.olusumZamani || analysis.olusumZamani || 0,
    pusu.referansSeviye || analysis.referansSeviye || 0,
    analysis.entryMode || pusu.entryMode || 'DIRECT',
    analysis.entryModeOffsetT || pusu.entryModeOffsetT || analysis.renkoEntryBrickDistance || 0,
    analysis.confirmationGate?.reversal?.confirmation?.id || analysis.confirmationGate?.reversal?.confirmation?.closeTime || 0,
    readiness.key || context?.dnaIdentityKey || 'DNA_YOK'
  ].join('|');
  return hash(source, 32);
}

function clientIds(symbol, side, fingerprint) {
  const sym = sanitize(symbol, 8);
  const dir = upper(side) === 'LONG' ? 'L' : 'S';
  const hsh = hash(fingerprint, 17);
  return {
    entry: `${OWNED_PREFIX}E-${sym}-${dir}-${hsh}`.slice(0, 36),
    stop: `${OWNED_PREFIX}S-${sym}-${dir}-${hsh}`.slice(0, 36),
    takeProfit: `${OWNED_PREFIX}T-${sym}-${dir}-${hsh}`.slice(0, 36),
    rollback: `${OWNED_PREFIX}R-${sym}-${dir}-${hsh}`.slice(0, 36),
    close: `${OWNED_PREFIX}C-${sym}-${dir}-${hsh}`.slice(0, 36)
  };
}

function stopRevisionClientId(symbol, side, fingerprint, stopPrice) {
  const sym = sanitize(symbol, 7);
  const dir = upper(side) === 'LONG' ? 'L' : 'S';
  return `${OWNED_PREFIX}S-${sym}-${dir}-${hash(`${fingerprint}|${Number(stopPrice).toPrecision(14)}`, 16)}`.slice(0, 36);
}

function stopRecoveryClientId(symbol, side, fingerprint, stopPrice) {
  const sym = sanitize(symbol, 7);
  const dir = upper(side) === 'LONG' ? 'L' : 'S';
  return `${OWNED_PREFIX}R-${sym}-${dir}-${hash(`${fingerprint}|${Number(stopPrice).toPrecision(14)}|${Date.now()}`, 16)}`.slice(0, 36);
}

function restartProtectionClientId(symbol, side, fingerprint, type, triggerPrice) {
  const sym = sanitize(symbol, 6);
  const dir = upper(side) === 'LONG' ? 'L' : 'S';
  const kind = /TAKE_PROFIT/i.test(String(type || '')) ? 'T' : 'S';
  const nonce = `${Date.now()}|${process.pid}|${crypto.randomBytes(3).toString('hex')}`;
  return `${OWNED_PREFIX}X-${kind}-${sym}-${dir}-${hash(`${fingerprint}|${kind}|${Number(triggerPrice).toPrecision(14)}|${nonce}`, 12)}`.slice(0, 36);
}

function accountingRecordFields(accounting = {}) {
  return {
    accountingExact: accounting?.accountingExact === true,
    entryOrderId: positiveId(accounting?.entryOrderId),
    closeOrderId: positiveId(accounting?.closeOrderId),
    entryCommission: finite(accounting?.entryCommission, 0),
    exitCommission: finite(accounting?.exitCommission, 0),
    totalCommission: finite(accounting?.commission, 0),
    realizedPnl: finite(accounting?.realizedPnl, 0),
    netPnl: finite(accounting?.netPnl, 0)
  };
}

function applyStopProtection(pos, fingerprint, protection, reason) {
  pos.gercekEmirYurutme ||= { fingerprint, ids: clientIds(pos.sym, pos.yon, fingerprint) };
  pos.gercekEmirYurutme.protections ||= {};
  pos.gercekEmirYurutme.protections.stop = protection;
  pos.realStopLastReplaceAt = Date.now();
  pos.realStopLastAppliedTrigger = finite(protection?.triggerPrice, finite(pos?.sl, NaN));
  delete pos.gercekEmirYurutme.redundantStops;
  pos.korumaEmirleri = {
    ...(pos.korumaEmirleri || {}),
    slAlgoId: protection?.algoId || null,
    slClientAlgoId: protection?.clientAlgoId || null
  };
  delete pos.pendingRealStopPrice;
  delete pos.realStopReplaceRetry;
  persistPosition(pos, reason);
}

function signedReadDeadline(factory, label = 'SIGNED_READ_TIMEOUT', timeoutMs = null) {
  const ms = Math.max(2000, Number(timeoutMs || ayarlar.gercekPozisyonMutabakatTimeoutMs || 8000));
  let timer = null;
  return Promise.race([
    Promise.resolve().then(factory),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`${label}:${ms}ms`);
        err.code = 'ETIMEDOUT';
        reject(err);
      }, ms);
    })
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function allPositions(client = h.client) {
  const rows = await signedReadDeadline(() => client.futuresPositionRisk(), 'FUTURES_POSITION_RISK_TIMEOUT');
  return Array.isArray(rows) ? rows : [];
}

async function symbolPosition(symbol, client = h.client) {
  let rows;
  try { rows = await client.futuresPositionRisk({ symbol }); }
  catch (_) { rows = await allPositions(client); }
  const matches = (Array.isArray(rows) ? rows : []).filter(row => upper(row?.symbol) === upper(symbol));
  // Hedge mode iki/üç satır döndürebilir. Sıfır BOTH satırını seçip gerçek LONG/SHORT
  // pozisyonu "yok" saymamak için önce miktarı sıfır olmayan satırı döndür.
  return matches.find(row => positionAmount(row) > 0) || matches[0] || null;
}

async function openRegularOrders(symbol, client = h.client) {
  const rows = await client.futuresOpenOrders(symbol ? { symbol } : {});
  return Array.isArray(rows) ? rows : [];
}

async function openAlgoOrders(symbol, client = h.client) {
  const mergeRows = (target, raw) => {
    for (const row of algoPayloadRows(raw).map(normalizeAlgoOrder)) {
      if (!row || (symbol && row.symbol && upper(row.symbol) !== upper(symbol))) continue;
      const key = `${positiveId(row.algoId) || 'NA'}|${row.clientAlgoId || 'NA'}|${upper(row.symbol)}`;
      if (!target.some(existing => existing._dedupeKey === key)) target.push({ ...row, _dedupeKey: key });
    }
  };
  const clean = rows => rows.map(({ _dedupeKey, ...row }) => row);
  let lastError = null;

  // Önce Binance Algo Service'in doğrudan endpointini kullan. Sembol filtresi ile boş
  // dönerse hesap-geneli sorguyu da dene; böylece kısa süreli indeksleme gecikmesi veya
  // wrapper farkı yüzünden yeni koruma emri yanlışlıkla "yok" sayılmaz.
  if (typeof client.futuresGetOpenAlgoOrders === 'function') {
    const merged = [];
    let dedicatedSuccess = false;
    const payloads = symbol ? [{ symbol }, {}] : [{}];
    for (const payload of payloads) {
      try {
        mergeRows(merged, await client.futuresGetOpenAlgoOrders(payload));
        dedicatedSuccess = true;
      } catch (err) { lastError = err; }
    }
    if (dedicatedSuccess) return clean(merged);
  }

  // Eski wrapper uyumluluğu: yalnız doğrudan Algo endpointi kullanılamıyorsa conditional
  // open-orders yönlendirmesine düş. Normal açık emirleri Algo listesine karıştırma.
  if (typeof client.futuresOpenOrders === 'function') {
    try {
      const merged = [];
      mergeRows(merged, await client.futuresOpenOrders(symbol ? { symbol, conditional: true } : { conditional: true }));
      return clean(merged).filter(row => positiveId(row.algoId) || row.clientAlgoId || row.algoStatus);
    } catch (err) { lastError = err; }
  }
  throw new Error(`BINANCE_ALGO_API_DESTEKLENMIYOR:${lastError?.message || 'METOT_YOK'}`);
}

async function getOrderByClientId(symbol, clientOrderId, client = h.client) {
  if (!clientOrderId) return null;
  try { return await client.futuresGetOrder({ symbol, origClientOrderId: clientOrderId }); }
  catch (_) {}
  try {
    const rows = await client.futuresAllOrders({ symbol, startTime: Date.now() - 24 * 60 * 60 * 1000, limit: 1000 });
    return (rows || []).find(row => row?.clientOrderId === clientOrderId) || null;
  } catch (_) { return null; }
}

async function getAlgoById(symbol, protection, client = h.client) {
  if (!protection) return null;
  const identities = [];
  if (protection.algoId) identities.push({ symbol, algoId: protection.algoId });
  if (protection.clientAlgoId) identities.push({ symbol, clientAlgoId: protection.clientAlgoId });
  if (!identities.length) return null;

  for (const payload of identities) {
    if (typeof client.futuresGetAlgoOrder !== 'function') break;
    try {
      const row = normalizeAlgoOrder(await client.futuresGetAlgoOrder(payload));
      if (row && (!symbol || !row.symbol || upper(row.symbol) === upper(symbol))) return row;
    } catch (_) {}
  }
  try {
    const open = await openAlgoOrders(symbol, client);
    return open.find(row => sameAlgo(row, protection)) || null;
  } catch (_) { return null; }
}

async function verifyAlgoActiveReliable(symbol, protection, client = h.client) {
  const delays = [0, 100, 200, 350, 550, 800, 1200, 1600];
  const errors = [];
  let row = null;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    try {
      row = await getAlgoById(symbol, protection, client);
      const status = algoOrderStatus(row) || algoOrderStatus(protection);
      if (row && ACTIVE_ALGO_STATUSES.has(status)) {
        return { ok: true, row: normalizeAlgoOrder({ ...protection, ...clone(row), status, algoStatus: status }), attempts: attempt + 1, errors };
      }
      errors.push(`ATTEMPT_${attempt + 1}:${row ? `STATUS_${status || 'YOK'}` : 'NOT_FOUND'}`);
    } catch (err) { errors.push(`ATTEMPT_${attempt + 1}:${err.message}`); }
  }
  return { ok: false, row: row ? normalizeAlgoOrder(row) : null, attempts: delays.length, errors };
}

async function getAlgoByIdDetailed(symbol, protection, client = h.client) {
  if (!protection || typeof client.futuresGetAlgoOrder !== 'function') {
    return { resolved: !protection, row: null, reason: protection ? 'METHOD_MISSING' : 'NO_PROTECTION' };
  }
  const payload = { symbol };
  if (protection.algoId) payload.algoId = protection.algoId;
  else if (protection.clientAlgoId) payload.clientAlgoId = protection.clientAlgoId;
  else return { resolved: false, row: null, reason: 'IDENTITY_MISSING' };
  try {
    return { resolved: true, row: normalizeAlgoOrder(await client.futuresGetAlgoOrder(payload)), reason: 'FOUND' };
  } catch (err) {
    const text = String(err?.message || err || '');
    if (/-2011|-2013|unknown order|not exist/i.test(text)) return { resolved: true, row: null, reason: 'NOT_FOUND' };
    return { resolved: false, row: null, reason: 'QUERY_FAILED', error: err.message };
  }
}

function sameAlgo(left, right) {
  if (!left || !right) return false;
  if (left.algoId != null && right.algoId != null && String(left.algoId) === String(right.algoId)) return true;
  const leftClient = left.clientAlgoId || left.clientOrderId;
  const rightClient = right.clientAlgoId || right.clientOrderId;
  return Boolean(leftClient && rightClient && leftClient === rightClient);
}

async function verifyAlgoInactive(symbol, protection, client = h.client) {
  if (!protection) return { verified: true, inactive: true, source: 'NO_PROTECTION' };
  const payload = { symbol };
  if (protection.algoId) payload.algoId = protection.algoId;
  else if (protection.clientAlgoId) payload.clientAlgoId = protection.clientAlgoId;
  else return { verified: false, inactive: false, source: 'IDENTITY_MISSING' };

  if (typeof client.futuresGetAlgoOrder === 'function') {
    try {
      const row = normalizeAlgoOrder(await client.futuresGetAlgoOrder(payload));
      return {
        verified: true,
        inactive: !row || !ACTIVE_ALGO_STATUSES.has(algoOrderStatus(row)),
        source: 'GET_ALGO_ORDER', row
      };
    } catch (err) {
      const text = String(err?.message || err || '');
      if (/-2011|-2013|unknown order|not exist/i.test(text)) {
        return { verified: true, inactive: true, source: 'GET_ALGO_NOT_FOUND' };
      }
    }
  }

  try {
    const open = await openAlgoOrders(symbol, client);
    const row = open.find(candidate => sameAlgo(candidate, protection));
    return { verified: true, inactive: !row, source: 'OPEN_ALGO_ORDERS', row: row || null };
  } catch (err) {
    return { verified: false, inactive: false, source: 'ALGO_VERIFY_FAILED', error: err.message };
  }
}

async function cancelAlgoVerified(symbol, protection, client = h.client) {
  const cancelAccepted = await cancelAlgo(symbol, protection, client);
  let verification = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    verification = await verifyAlgoInactive(symbol, protection, client);
    if (verification.verified && verification.inactive) break;
    if (attempt < 2) await sleep(150 * (attempt + 1));
  }
  return {
    ok: Boolean(verification?.verified && verification?.inactive),
    cancelAccepted,
    verification
  };
}

function recordBySymbol(state, symbol) {
  return Object.values(state.records || {}).find(row => upper(row?.symbol) === upper(symbol) && activeRecord(row)) || null;
}

function setGlobalBlock(reason, details = {}) {
  mutate(state => { state.globalBlock = { at: nowIso(), ...details, reason }; });
  audit('GLOBAL_BLOCK_SET', { ...details, reason });
}

function clearGlobalBlock(reason = 'SAFE_RECONCILIATION') {
  mutate(state => { state.globalBlock = null; });
  audit('GLOBAL_BLOCK_CLEARED', { reason });
}

function saveRecord(fingerprint, patch) {
  return mutate(state => {
    const current = state.records[fingerprint] || { fingerprint, createdAt: nowIso() };
    const next = { ...current, ...clone(patch), fingerprint, updatedAt: nowIso() };
    state.records[fingerprint] = next;
    return clone(next);
  });
}

function snapshotPosition(pos) {
  if (!pos) return null;
  const copy = clone(pos);
  // API yanıtlarının gereksiz büyümesini önle; gerekli emir/fill özeti korunur.
  if (copy?.blackboxAcilis?.raw) delete copy.blackboxAcilis.raw;
  return copy;
}

async function reserveEntry({ symbol, side, context, client = h.client }) {
  const sym = upper(symbol);
  const dir = upper(side);
  // Tek operasyonel kaynak: AYARLAR SAYFASI. Çağıran katman limit aktaramaz/ezemez.
  const max = Number(realOrderBridge.liveRiskProfile().maxActivePositions);
  if (!sym || !['LONG', 'SHORT'].includes(dir)) return { ok: false, reason: 'SYMBOL_VEYA_YON_GECERSIZ' };
  if (!Number.isInteger(max) || max < 0) return { ok: false, reason: 'AKTIF_POZISYON_LIMITI_GECERSIZ' };
  if (max === 0) return { ok: false, reason: 'GERCEK_EMIR_YENI_GIRIS_DURDURULDU' };
  const processLock = acquireProcessLock();
  if (!processLock.ok) return { ok: false, reason: processLock.reason };

  // Üretim istemcisi için imzalı çağrı saat otoritesi zorunludur. Enjekte edilmiş test istemcileri
  // kendi saat/yanıt modelini taşır ve ağ senkronuna bağımlı değildir.
  if (client === h.client) {
    let timeHealth = typeof h.binanceTimeHealth === 'function' ? h.binanceTimeHealth() : { healthy: false };
    if (timeHealth?.healthy !== true && typeof h.binanceTimeSync === 'function') {
      try { timeHealth = await h.binanceTimeSync({ force: true }); } catch (_) {}
    }
    if (timeHealth?.healthy !== true) return { ok: false, reason: 'BINANCE_TIME_AUTHORITY_NOT_READY' };
  }

  const auth = realOrderBridge.realAuthorization();
  if (!auth.valid) return { ok: false, reason: 'GERCEK_EMIR_YETKISI_YOK_VEYA_MAINNET_DOGRULANMADI' };

  const [positions, regular, algo] = await Promise.all([
    allPositions(client),
    openRegularOrders(sym, client),
    openAlgoOrders(sym, client)
  ]);
  if (positions.some(row => !positionSideSupported(row))) return { ok: false, reason: 'HEDGE_MODE_DESTEKLENMIYOR_ONE_WAY_ZORUNLU' };
  const exchangeActive = positions.filter(row => positionAmount(row) > 0);
  if (exchangeActive.some(row => upper(row.symbol) === sym)) return { ok: false, reason: 'BINANCE_SEMBOL_POZISYONU_ZATEN_ACIK' };
  if (exchangeActive.length >= max) return { ok: false, reason: `BINANCE_AKTIF_POZISYON_LIMITI:${exchangeActive.length}/${max}` };
  if ((regular || []).length) return { ok: false, reason: `BINANCE_SEMBOL_ACIK_NORMAL_EMIR:${regular.length}` };
  if ((algo || []).length) return { ok: false, reason: `BINANCE_SEMBOL_ACIK_ALGO_EMIR:${algo.length}` };

  const fingerprint = contextFingerprint(sym, dir, context);
  const ids = clientIds(sym, dir, fingerprint);
  let result;
  mutate(state => {
    // v6.10.3'ten kalmış manuel rearm kilidi, borsada açık gerçek pozisyon yoksa
    // yeni sürümde otomatik temizlenir. Diğer güvenlik blokları aynen fail-closed kalır.
    if (upper(state?.globalBlock?.reason) === MANUAL_REARM_BLOCK) {
      const blockedSymbol = upper(state.globalBlock.symbol || state.globalBlock.details?.symbol);
      const blockedSymbolStillOpen = blockedSymbol
        ? exchangeActive.some(row => upper(row.symbol) === blockedSymbol)
        : exchangeActive.length > 0;
      if (!blockedSymbolStillOpen) {
        state.globalBlock = null;
        audit('LEGACY_MANUAL_REARM_BLOCK_AUTO_CLEARED', { symbol: sym, side: dir, blockedSymbol });
      }
    }
    if (state.globalBlock) {
      result = { ok: false, reason: `GLOBAL_BLOCK:${state.globalBlock.reason}` };
      return;
    }
    const sameSymbol = recordBySymbol(state, sym);
    if (sameSymbol) {
      result = { ok: false, reason: `KALICI_SEMBOL_KILIDI:${sameSymbol.status}`, record: clone(sameSymbol) };
      return;
    }
    const localActive = Object.values(state.records).filter(activeRecord).length;
    if (Math.max(exchangeActive.length, localActive) >= max) {
      result = { ok: false, reason: `KALICI_AKTIF_POZISYON_LIMITI:${localActive}/${max}` };
      return;
    }
    const existing = state.records[fingerprint];
    if (existing) {
      result = {
        ok: false,
        reason: `AYNI_SINYAL_DAHA_ONCE_ISLENDI:${existing.status || 'BILINMEYEN'}`,
        record: clone(existing)
      };
      return;
    }
    const record = {
      fingerprint, symbol: sym, side: dir, status: 'PENDING', ids,
      preparedSnapshot: snapshotPosition(context), createdAt: nowIso(), updatedAt: nowIso()
    };
    state.records[fingerprint] = record;
    result = { ok: true, fingerprint, ids, record: clone(record) };
  });
  if (result?.ok) audit('ENTRY_RESERVED', { symbol: sym, side: dir, fingerprint, clientOrderId: ids.entry });
  return result;
}

function releaseReservation(reservation, reason) {
  if (!reservation?.fingerprint) return;
  saveRecord(reservation.fingerprint, { status: 'FAILED', failureReason: reason, failedAt: nowIso() });
  audit('ENTRY_RESERVATION_RELEASED', { fingerprint: reservation.fingerprint, reason });
}

async function cancelRegularOrderIfOpen(symbol, order, client = h.client) {
  if (!order || TERMINAL_ORDER_STATUSES.has(upper(order.status))) return;
  try { await client.futuresCancelOrder({ symbol, orderId: order.orderId, origClientOrderId: order.clientOrderId }); }
  catch (_) {}
}

async function executeEntry({ reservation, quantity, referencePrice, minQty, minNotional, maxNotionalDeviationPct, client = h.client }) {
  if (!reservation?.ok || !reservation.fingerprint) throw new Error('GERCEK_EMIR_REZERVASYONU_YOK');
  const record = reservation.record;
  const symbol = record.symbol;
  const side = record.side;
  const exchangeSide = side === 'LONG' ? 'BUY' : 'SELL';
  const qty = finite(quantity);
  if (!(qty > 0)) throw new Error('GERCEK_GIRIS_MIKTARI_GECERSIZ');
  // Üretim istemcisi için imzalı çağrı saat otoritesi zorunludur. Enjekte edilmiş test istemcileri
  // kendi saat/yanıt modelini taşır ve ağ senkronuna bağımlı değildir.
  if (client === h.client) {
    let timeHealth = typeof h.binanceTimeHealth === 'function' ? h.binanceTimeHealth() : { healthy: false };
    if (timeHealth?.healthy !== true && typeof h.binanceTimeSync === 'function') {
      try { timeHealth = await h.binanceTimeSync({ force: true }); } catch (_) {}
    }
    if (timeHealth?.healthy !== true) return { ok: false, reason: 'BINANCE_TIME_AUTHORITY_NOT_READY' };
  }

  const auth = realOrderBridge.realAuthorization();
  if (!auth.valid) throw new Error('GERCEK_EMIR_SON_AN_YETKI_KONTROLU_BASARISIZ');

  saveRecord(reservation.fingerprint, { status: 'SUBMITTED', submittedAt: nowIso(), requestedQty: qty, referencePrice });
  let order = null;
  let submitError = null;
  try {
    order = await client.futuresOrder({
      symbol, side: exchangeSide, type: 'MARKET', quantity: String(qty),
      positionSide: 'BOTH', newClientOrderId: record.ids.entry, newOrderRespType: 'RESULT'
    });
  } catch (err) {
    submitError = err;
    audit('ENTRY_SUBMIT_AMBIGUOUS', { symbol, side, clientOrderId: record.ids.entry, error: err.message });
  }

  if (!order?.orderId) order = await getOrderByClientId(symbol, record.ids.entry, client);
  let position = await symbolPosition(symbol, client);
  if ((!position || positionAmount(position) <= 0) && order && !TERMINAL_ORDER_STATUSES.has(upper(order.status))) {
    await sleep(250);
    order = (await getOrderByClientId(symbol, record.ids.entry, client)) || order;
    position = await symbolPosition(symbol, client);
  }

  // MARKET emir kısmi/aktif kaldıysa kalan miktarı iptal et; yalnız gerçekleşen miktarı sahiplen.
  if (order && !TERMINAL_ORDER_STATUSES.has(upper(order.status))) {
    await cancelRegularOrderIfOpen(symbol, order, client);
    order = (await getOrderByClientId(symbol, record.ids.entry, client)) || order;
    position = await symbolPosition(symbol, client);
  }

  if (!position || positionAmount(position) <= 0) {
    const reason = submitError ? `EMIR_BULUNAMADI_VE_POZISYON_ACILMADI:${submitError.message}` : `EMIR_DOLUMSUZ:${upper(order?.status || 'YOK')}`;
    releaseReservation(reservation, reason);
    throw new Error(reason);
  }
  if (!positionSideSupported(position)) {
    setGlobalBlock('HEDGE_MODE_POZISYONU_ALGILANDI', { symbol });
    throw new Error('HEDGE_MODE_DESTEKLENMIYOR');
  }
  const actualSide = positionDirection(position);
  if (actualSide !== side) {
    setGlobalBlock('TERS_YON_POZISYON_MUTABAKATSIZLIGI', { symbol, expected: side, actual: actualSide });
    throw new Error(`TERS_YON_POZISYON:${actualSide}/${side}`);
  }

  const postFillPositions = await allPositions(client);
  if (postFillPositions.some(row => !positionSideSupported(row))) {
    setGlobalBlock('HEDGE_MODE_POZISYONU_ALGILANDI', { symbol });
    throw new Error('HEDGE_MODE_DESTEKLENMIYOR');
  }
  const postFillActive = postFillPositions.filter(row => positionAmount(row) > 0);
  // Dolum sonrası limit de yeniden AYARLAR SAYFASI kaynağından doğrulanır.
  const maxActivePositions = Number(realOrderBridge.liveRiskProfile().maxActivePositions);
  if (Number.isInteger(maxActivePositions) && maxActivePositions >= 0 && postFillActive.length > maxActivePositions) {
    setGlobalBlock('DOLUM_SONRASI_AKTIF_POZISYON_LIMITI_ASILDI', {
      symbol, active: postFillActive.length, maxActivePositions
    });
    throw new Error(`DOLUM_SONRASI_AKTIF_POZISYON_LIMITI:${postFillActive.length}/${maxActivePositions}`);
  }

  const actualQty = positionAmount(position);
  const avgPrice = finite(position.entryPrice, finite(order?.avgPrice, 0));
  const notional = actualQty * avgPrice;
  const requestedNotional = qty * finite(referencePrice, avgPrice);
  const deviationPct = requestedNotional > 0 ? Math.abs((notional - requestedNotional) / requestedNotional) * 100 : 0;
  if (!(actualQty >= finite(minQty, 0)) || !(notional >= finite(minNotional, 0)) || !(avgPrice > 0)) {
    throw new Error(`GERCEK_DOLUM_GECERSIZ:QTY=${actualQty}|PRICE=${avgPrice}|NOTIONAL=${notional}`);
  }
  if (Number.isFinite(Number(maxNotionalDeviationPct)) && deviationPct > Number(maxNotionalDeviationPct)) {
    throw new Error(`GERCEK_DOLUM_NOTIONAL_SAPMASI:%${deviationPct.toFixed(4)}`);
  }

  const resolvedOrder = order || { orderId: null, clientOrderId: record.ids.entry, status: 'AMBIGUOUS_RECOVERED' };
  saveRecord(reservation.fingerprint, {
    status: 'SUBMITTED', entryOrder: clone(resolvedOrder), actualQty, avgPrice, notional,
    position: clone(position), ambiguityRecovered: Boolean(submitError), fillVerifiedAt: nowIso()
  });
  audit('ENTRY_FILL_VERIFIED', {
    symbol, side, fingerprint: reservation.fingerprint, orderId: resolvedOrder.orderId || null,
    clientOrderId: record.ids.entry, status: resolvedOrder.status || null, actualQty, avgPrice, notional,
    ambiguityRecovered: Boolean(submitError)
  });
  return { order: resolvedOrder, position, actualQty, avgPrice, notional, deviationPct, ambiguityRecovered: Boolean(submitError) };
}

async function createProtection({ symbol, side, type, triggerPrice, clientAlgoId, client = h.client }) {
  if (typeof client.futuresCreateAlgoOrder !== 'function' || typeof client.futuresGetAlgoOrder !== 'function') {
    throw new Error('BINANCE_ALGO_SERVICE_METOTLARI_YOK:binance-api-node>=0.13.10 zorunlu');
  }
  const opposite = upper(side) === 'LONG' ? 'SELL' : 'BUY';
  const normalizedTrigger = normalizeTriggerPrice(symbol, side, triggerPrice);
  let response;
  try {
    response = await client.futuresCreateAlgoOrder({
      symbol, side: opposite, type, algoType: 'CONDITIONAL',
      triggerPrice: String(normalizedTrigger), closePosition: true,
      positionSide: 'BOTH', workingType: 'MARK_PRICE', clientAlgoId, newOrderRespType: 'RESULT'
    });
  } catch (err) {
    const recovered = await getAlgoById(symbol, { clientAlgoId }, client);
    if (!recovered) throw err;
    response = recovered;
  }
  response = normalizeAlgoOrder(response) || {};
  const protection = {
    type: algoOrderType(response) || type,
    orderType: algoOrderType(response) || type,
    algoId: response?.algoId || null,
    clientAlgoId: response?.clientAlgoId || clientAlgoId,
    status: algoOrderStatus(response) || null,
    algoStatus: algoOrderStatus(response) || null,
    triggerPrice: finite(response?.triggerPrice, normalizedTrigger),
    createdAt: nowIso()
  };
  audit('ALGO_CREATE_ACCEPTED', {
    symbol, type, clientAlgoId, algoId: protection.algoId,
    responseStatus: protection.algoStatus, triggerPrice: protection.triggerPrice
  });
  const verification = await verifyAlgoActiveReliable(symbol, protection, client);
  if (!verification.ok) {
    audit('ALGO_ACTIVE_VERIFY_FAILED', { symbol, type, clientAlgoId, algoId: protection.algoId, attempts: verification.attempts, errors: verification.errors });
    throw new Error(`${type}_ALGO_DOGRULANAMADI`);
  }
  audit('ALGO_ACTIVE_VERIFIED', { symbol, type, clientAlgoId, algoId: verification.row?.algoId || protection.algoId, attempts: verification.attempts });
  return verification.row;
}

async function installProtections({ reservation, side, stopPrice, takeProfitPrice, client = h.client }) {
  const symbol = reservation?.record?.symbol;
  if (!symbol) throw new Error('KORUMA_ICIN_REZERVASYON_YOK');
  const stop = await createProtection({
    symbol, side, type: 'STOP_MARKET', triggerPrice: stopPrice,
    clientAlgoId: reservation.record.ids.stop, client
  });
  saveRecord(reservation.fingerprint, { protections: { stop }, protectionStage: 'STOP_ACTIVE' });
  let takeProfit;
  try {
    takeProfit = await createProtection({
      symbol, side, type: 'TAKE_PROFIT_MARKET', triggerPrice: takeProfitPrice,
      clientAlgoId: reservation.record.ids.takeProfit, client
    });
  } catch (err) {
    saveRecord(reservation.fingerprint, { protections: { stop }, protectionStage: 'TP_FAILED', protectionError: err.message });
    throw err;
  }
  saveRecord(reservation.fingerprint, { protections: { stop, takeProfit }, protectionStage: 'SL_TP_ACTIVE', protectionsVerifiedAt: nowIso() });
  audit('PROTECTIONS_VERIFIED', { symbol, fingerprint: reservation.fingerprint, stopAlgoId: stop.algoId, tpAlgoId: takeProfit.algoId });
  return { stop, takeProfit };
}

async function cancelAlgo(symbol, protection, client = h.client) {
  if (!protection || typeof client.futuresCancelAlgoOrder !== 'function') return false;
  const payload = { symbol };
  if (protection.algoId) payload.algoId = protection.algoId;
  else if (protection.clientAlgoId) payload.clientAlgoId = protection.clientAlgoId;
  else return false;
  try { await client.futuresCancelAlgoOrder(payload); return true; }
  catch (err) {
    const text = String(err?.message || err || '');
    if (/-2011|-2013|unknown order|not exist/i.test(text)) return true;
    return false;
  }
}

function protectionsFromPosition(pos) {
  const raw = pos?.gercekEmirYurutme?.protections || pos?.korumaEmirleri || {};
  return {
    stop: raw.stop || (raw.slAlgoId || raw.slClientAlgoId ? { algoId: raw.slAlgoId, clientAlgoId: raw.slClientAlgoId, type: 'STOP_MARKET' } : null),
    takeProfit: raw.takeProfit || (raw.tpAlgoId || raw.tpClientAlgoId ? { algoId: raw.tpAlgoId, clientAlgoId: raw.tpClientAlgoId, type: 'TAKE_PROFIT_MARKET' } : null)
  };
}

async function cancelOwnedProtections(pos, client = h.client) {
  const symbol = pos?.sym || pos?.symbol;
  if (!symbol) return { canceled: 0, failed: 0 };
  const known = protectionsFromPosition(pos);
  const candidates = [known.stop, known.takeProfit].filter(Boolean);
  try {
    const open = await openAlgoOrders(symbol, client);
    for (const row of open) {
      const id = row.clientAlgoId || row.clientOrderId;
      if (ownedId(id) && !candidates.some(x => x?.algoId === row.algoId || x?.clientAlgoId === id)) candidates.push(row);
    }
  } catch (_) {}
  let canceled = 0;
  let failed = 0;
  const seen = new Set();
  for (const protection of candidates) {
    const key = String(protection.algoId || protection.clientAlgoId || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const result = await cancelAlgoVerified(symbol, protection, client);
    if (result.ok) canceled++;
    else failed++;
  }
  audit('PROTECTIONS_CANCELLED', { symbol, canceled, failed });
  return { canceled, failed };
}

async function closePositionMarket(pos, reason = 'ENGINE_CLOSE', client = h.client, options = {}) {
  const symbol = upper(pos?.sym || pos?.symbol);
  const side = upper(pos?.yon || pos?.side);
  if (!symbol || !['LONG', 'SHORT'].includes(side)) return { ok: false, reason: 'POZISYON_KIMLIGI_GECERSIZ' };
  const fingerprint = pos?.gercekEmirYurutme?.fingerprint || pos?.realExecutionFingerprint || contextFingerprint(symbol, side, pos);
  const ids = clientIds(symbol, side, fingerprint);
  const closeClientOrderId = options.rollback ? ids.rollback : ids.close;
  const exchangeSide = side === 'LONG' ? 'SELL' : 'BUY';
  let position = await symbolPosition(symbol, client);
  if (position && !positionSideSupported(position)) {
    setGlobalBlock('HEDGE_MODE_POZISYONU_ALGILANDI', { symbol, positionSide: position.positionSide });
    return { ok: false, reason: 'HEDGE_MODE_DESTEKLENMIYOR' };
  }
  if (!position || positionAmount(position) <= 0) {
    const accounting = await collectAccountingReliable(pos, { client, closeTime: Date.now() });
    if (accounting.entryTradeCount > 0 && accounting.exitTradeCount <= 0) {
      saveRecord(fingerprint, { status: 'QUARANTINED', closeReason: reason, closeAccountingError: 'BINANCE_EXIT_FILL_YOK', accounting });
      setGlobalBlock('KAPANIS_MUHASEBESI_DOGRULANAMADI', { symbol });
      return { ok: false, positionClosed: true, reason: 'KAPANIS_MUHASEBESI_DOGRULANAMADI', ...accounting };
    }
    const cleanup = await cancelOwnedProtections(pos, client);
    if (cleanup.failed > 0) {
      saveRecord(fingerprint, { status: 'QUARANTINED', closeReason: reason, closedAt: nowIso(), accounting, protectionCleanup: cleanup });
      setGlobalBlock('KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI', { symbol, failed: cleanup.failed });
      return { ok: false, positionClosed: true, reason: 'KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI', ...accounting };
    }
    saveRecord(fingerprint, { status: 'CLOSED', closeReason: reason, closedAt: nowIso(), accounting, protectionStage: 'CLOSED', ...accountingRecordFields(accounting) });
    return { ok: true, alreadyClosed: true, ...accounting };
  }
  if (positionDirection(position) !== side) {
    setGlobalBlock('KAPATMA_YON_MUTABAKATSIZLIGI', { symbol, expected: side, actual: positionDirection(position) });
    return { ok: false, reason: 'KAPATMA_YON_MUTABAKATSIZLIGI' };
  }
  const qty = positionAmount(position);
  saveRecord(fingerprint, { status: 'CLOSING', closeReason: reason, closeRequestedAt: nowIso(), closeClientOrderId });
  let order = null;
  let error = null;
  try {
    order = await client.futuresOrder({
      symbol, side: exchangeSide, type: 'MARKET', quantity: String(qty),
      positionSide: 'BOTH', reduceOnly: 'true', newClientOrderId: closeClientOrderId, newOrderRespType: 'RESULT'
    });
  } catch (err) { error = err; }
  if (!order?.orderId) order = await getOrderByClientId(symbol, closeClientOrderId, client);
  for (let attempt = 0; attempt < 4; attempt++) {
    position = await symbolPosition(symbol, client);
    if (!position || positionAmount(position) <= 0) break;
    await sleep(250 * (attempt + 1));
  }
  if (position && positionAmount(position) > 0 && order && !TERMINAL_ORDER_STATUSES.has(upper(order.status))) {
    await cancelRegularOrderIfOpen(symbol, order, client);
    order = (await getOrderByClientId(symbol, closeClientOrderId, client)) || order;
    position = await symbolPosition(symbol, client);
  }
  if (position && positionAmount(position) > 0) {
    saveRecord(fingerprint, { status: 'QUARANTINED', closeError: error?.message || 'POZISYON_SIFIRLANMADI', remainingQty: positionAmount(position) });
    setGlobalBlock('GERCEK_POZISYON_KAPATILAMADI', { symbol, remainingQty: positionAmount(position) });
    return { ok: false, reason: error?.message || 'POZISYON_SIFIRLANMADI', order };
  }
  const cleanup = await cancelOwnedProtections(pos, client);
  const accounting = await collectAccountingReliable(pos, { client, closeOrderId: order?.orderId, closeTime: Date.now() });
  if (accounting.exitTradeCount <= 0) {
    saveRecord(fingerprint, {
      status: 'QUARANTINED', closeOrder: clone(order), closeReason: reason,
      closedAt: nowIso(), closeAccountingError: 'BINANCE_EXIT_FILL_YOK', accounting
    });
    setGlobalBlock('KAPANIS_MUHASEBESI_DOGRULANAMADI', { symbol });
    return { ok: false, positionClosed: true, reason: 'KAPANIS_MUHASEBESI_DOGRULANAMADI', order, ...accounting };
  }
  if (cleanup.failed > 0) {
    saveRecord(fingerprint, {
      status: 'QUARANTINED', closeOrder: clone(order), closeReason: reason,
      closedAt: nowIso(), accounting, protectionCleanup: cleanup
    });
    setGlobalBlock('KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI', { symbol, failed: cleanup.failed });
    return { ok: false, positionClosed: true, reason: 'KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI', order, ...accounting };
  }
  saveRecord(fingerprint, { status: 'CLOSED', closeOrder: clone(order), closeReason: reason, closedAt: nowIso(), accounting, protectionStage: 'CLOSED', ...accountingRecordFields(accounting) });
  audit('POSITION_CLOSED_VERIFIED', { symbol, side, fingerprint, orderId: order?.orderId || null, reason, accounting });
  return { ok: true, order, ...accounting };
}

async function rollbackEntry({ reservation, side, reason, client = h.client }) {
  const latest = readState().records?.[reservation?.fingerprint] || reservation?.record || {};
  const entryOrder = latest.entryOrder || reservation?.record?.entryOrder || null;
  const protectionFailure = /ALGO|KORUMA|STOP_MARKET|TAKE_PROFIT_MARKET/i.test(String(reason || ''));
  const fillVerified = finite(latest.actualQty, 0) > 0 || positiveId(entryOrder?.orderId);
  if (protectionFailure && fillVerified) {
    setGlobalBlock('GERCEK_KORUMA_ZINCIRI_BASARISIZ', {
      symbol: latest.symbol || reservation?.record?.symbol, side, failureReason: reason, rollbackStatus: 'PENDING'
    });
  }
  const pos = {
    ...(latest.preparedSnapshot || reservation?.record?.preparedSnapshot || {}),
    sym: latest.symbol || reservation?.record?.symbol,
    yon: side,
    sanal: false,
    miktar: finite(latest.actualQty, finite(latest.preparedSnapshot?.miktar, 0)),
    girisFiyati: finite(latest.avgPrice, finite(latest.preparedSnapshot?.girisFiyati, 0)),
    borsaOrderId: positiveId(entryOrder?.orderId),
    acilisZamani: Date.parse(latest.fillVerifiedAt || latest.submittedAt || latest.createdAt || '') || Date.now() - 60_000,
    gercekEmirYurutme: {
      fingerprint: reservation?.fingerprint,
      entryOrder: clone(entryOrder),
      protections: latest.protections || null
    }
  };
  const result = await closePositionMarket(pos, `ROLLBACK:${reason}`, client, { rollback: true });
  if (!result.ok) {
    saveRecord(reservation.fingerprint, { status: 'QUARANTINED', rollbackReason: reason, rollbackFailedAt: nowIso() });
    setGlobalBlock('GERCEK_ACILIS_ROLLBACK_BASARISIZ', { symbol: pos.sym, failureReason: reason });
  } else {
    saveRecord(reservation.fingerprint, {
      status: 'ROLLED_BACK', rollbackReason: reason, rolledBackAt: nowIso(),
      protectionFailureGlobalBlock: Boolean(protectionFailure && fillVerified)
    });
    if (protectionFailure && fillVerified) {
      setGlobalBlock('GERCEK_KORUMA_ZINCIRI_BASARISIZ', {
        symbol: pos.sym, side, failureReason: reason, rollbackStatus: 'VERIFIED', accountingExact: result.accountingExact === true
      });
    }
  }
  audit('ENTRY_ROLLBACK', { symbol: pos.sym, side, reason, ok: result.ok, globalBlocked: Boolean(protectionFailure && fillVerified) });
  return result;
}

function markOpen(reservation, position, protections, extra = {}) {
  const execution = {
    version: VERSION,
    fingerprint: reservation.fingerprint,
    ids: clone(reservation.record.ids),
    entryOrder: clone(extra.entryOrder || null),
    protections: clone(protections),
    openedAt: nowIso(),
    ambiguityRecovered: Boolean(extra.ambiguityRecovered)
  };
  position.gercekEmirYurutme = execution;
  position.realExecutionFingerprint = reservation.fingerprint;
  saveRecord(reservation.fingerprint, {
    status: 'OPEN', openedAt: nowIso(), protections: clone(protections),
    entryOrder: clone(extra.entryOrder || null), positionSnapshot: snapshotPosition(position),
    actualQty: position.miktar, avgPrice: position.girisFiyati
  });
  audit('POSITION_OPEN_PERSISTED', { symbol: position.sym, side: position.yon, fingerprint: reservation.fingerprint });
  return execution;
}

function persistPosition(pos, reason = 'POSITION_UPDATE') {
  const fingerprint = pos?.gercekEmirYurutme?.fingerprint || pos?.realExecutionFingerprint;
  if (!fingerprint) return false;
  const now = Date.now();
  const heartbeat = reason === 'REAL_POSITION_HEARTBEAT';
  if (heartbeat && now - finite(pos?.realExecutionLastPersistAt, 0) < 15_000) return false;
  pos.realExecutionLastPersistAt = now;
  // QUARANTINED/CLOSING gibi güvenlik durumlarını sıradan bir state güncellemesiyle OPEN'a döndürme.
  saveRecord(fingerprint, { positionSnapshot: snapshotPosition(pos), lastPersistReason: reason });
  return true;
}

function protectionTrigger(row) {
  return finite(row?.triggerPrice ?? row?.stopPrice ?? row?.activatePrice, NaN);
}
function stopType(row) {
  return /STOP_MARKET|STOP/i.test(algoOrderType(row) || row?.type || row?.orderType || '');
}
function triggerEqual(symbol, left, right) {
  const a = finite(left, NaN), b = finite(right, NaN);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const tick = finite(h.state?.basamaklar?.[upper(symbol)]?.tickSize, NaN);
  const tolerance = tick > 0 ? tick * 0.51 : Math.max(1e-12, Math.abs(b) * 1e-10);
  return Math.abs(a - b) <= tolerance;
}
async function adoptDesiredStop(symbol, triggerPrice, pos, fingerprint, client = h.client) {
  try {
    const open = await openAlgoOrders(symbol, client);
    const desired = open.find(row => stopType(row) && ACTIVE_ALGO_STATUSES.has(algoOrderStatus(row)) && triggerEqual(symbol, protectionTrigger(row), triggerPrice));
    if (!desired) return null;
    const normalized = normalizeAlgoOrder({ ...desired, triggerPrice: protectionTrigger(desired) });
    applyStopProtection(pos, fingerprint, normalized, 'STOP_DESIRED_ACTIVE_ADOPTED');
    audit('STOP_DESIRED_ACTIVE_ADOPTED', { symbol, fingerprint, algoId: normalized?.algoId || null, triggerPrice });
    return normalized;
  } catch (error) {
    audit('STOP_DESIRED_ADOPTION_QUERY_FAILED', { symbol, fingerprint, triggerPrice, error: error.message });
    return null;
  }
}

async function replaceStopAtomic(pos, newStopPrice, client = h.client) {
  const symbol = upper(pos?.sym);
  const side = upper(pos?.yon);
  const fingerprint = pos?.gercekEmirYurutme?.fingerprint || pos?.realExecutionFingerprint || contextFingerprint(symbol, side, pos);
  let triggerPrice;
  try { triggerPrice = normalizeTriggerPrice(symbol, side, newStopPrice); }
  catch (err) { return { ok: false, reason: `YENI_STOP_GECERSIZ:${err.message}` }; }

  // Cooldown ve minimum aralık kontrolleri ağ çağrısından önce yapılır. Böylece 1 saniyelik
  // iz-sürme döngüsü aynı bekleyen stop için Binance'e tekrar tekrar yük bindirmez.
  const now = Date.now();
  const retry = pos?.realStopReplaceRetry || null;
  if (retry && triggerEqual(symbol, retry.triggerPrice, triggerPrice) && finite(retry.nextAttemptAt, 0) > now) {
    return { ok: false, reason: 'STOP_REPLACE_COOLDOWN', oldKept: true, retryAfterMs: retry.nextAttemptAt - now, localFastFail: true };
  }

  const old = protectionsFromPosition(pos).stop;
  const oldTrigger = finite(old?.triggerPrice, finite(pos?.realStopLastAppliedTrigger, finite(pos?.sl, NaN)));
  if (old && triggerEqual(symbol, oldTrigger, triggerPrice)) {
    return { ok: true, protection: old, noOp: true, oldCanceled: false };
  }

  const minInterval = Math.max(1000, Number(ayarlar.gercekStopMinGuncellemeAralikMs || 3000));
  const elapsed = now - finite(pos?.realStopLastReplaceAt, 0);
  if (pos?.realStopLastReplaceAt && elapsed < minInterval) {
    return { ok: false, reason: 'STOP_REPLACE_MIN_INTERVAL', oldKept: true, retryAfterMs: minInterval - elapsed, localFastFail: true };
  }

  const position = await symbolPosition(symbol, client);
  if (!position || positionAmount(position) <= 0) return { ok: false, reason: 'BORSA_POZISYONU_YOK' };
  if (!positionSideSupported(position)) return { ok: false, reason: 'HEDGE_MODE_DESTEKLENMIYOR' };
  if (positionDirection(position) !== side) return { ok: false, reason: 'BORSA_YON_MUTABAKATSIZ' };

  // Önce borsada istenen stop zaten aktif mi bak; önceki belirsiz yanıt sonrası çift emir üretme.
  const adopted = await adoptDesiredStop(symbol, triggerPrice, pos, fingerprint, client);
  if (adopted) return { ok: true, protection: adopted, adopted: true, noOp: true, oldCanceled: sameAlgo(old, adopted) };

  const clientAlgoId = stopRevisionClientId(symbol, side, fingerprint, triggerPrice);
  let fresh;
  try {
    // Tercih edilen yol: yeni stop doğrulandıktan sonra eskiyi iptal et. Binance hesabı
    // aynı yönde iki closePosition stopuna izin veriyorsa koruma boşluğu oluşmaz.
    fresh = await createProtection({ symbol, side, type: 'STOP_MARKET', triggerPrice, clientAlgoId, client });
  } catch (err) {
    const text = String(err?.message || err || '');
    const singleClosePositionConstraint = /open stop or take profit order.*closeposition|closeposition.*existing/i.test(text);
    if (!singleClosePositionConstraint || !old) {
      pos.realStopReplaceRetry = { triggerPrice, attempts: finite(retry?.attempts, 0) + 1, lastAttemptAt: Date.now(), nextAttemptAt: Date.now() + 60_000, reason: text };
      audit('STOP_REPLACE_NEW_FAILED_OLD_KEPT', { symbol, fingerprint, error: text, oldAlgoId: old?.algoId || null, cooldownMs: 60_000 });
      return { ok: false, reason: text, oldKept: true, retryAfterMs: 60_000 };
    }

    // Binance tek closePosition stopuna izin vermediğinde kontrollü fallback:
    // eski stopu doğrulayarak iptal et, yeniyi kur; yenisi kurulamazsa eski seviyeyi
    // yeni kimlikle geri yükle. Geri yükleme de başarısızsa pozisyonu acil kapat.
    const cancelOld = await cancelAlgoVerified(symbol, old, client);
    if (!cancelOld.ok) {
      pos.realStopReplaceRetry = { triggerPrice, attempts: finite(retry?.attempts, 0) + 1, lastAttemptAt: Date.now(), nextAttemptAt: Date.now() + 60_000, reason: 'ESKI_STOP_IPTAL_EDILEMEDI' };
      audit('STOP_REPLACE_CONSTRAINT_OLD_CANCEL_FAILED', { symbol, fingerprint, oldAlgoId: old?.algoId || null, triggerPrice });
      return { ok: false, reason: 'ESKI_STOP_IPTAL_EDILEMEDI', oldKept: true, retryAfterMs: 60_000 };
    }

    try {
      fresh = await createProtection({ symbol, side, type: 'STOP_MARKET', triggerPrice, clientAlgoId, client });
      applyStopProtection(pos, fingerprint, fresh, 'STOP_REPLACED_SINGLE_CONSTRAINT');
      audit('STOP_REPLACED_SINGLE_CONSTRAINT', { symbol, fingerprint, oldAlgoId: old?.algoId || null, newAlgoId: fresh?.algoId || null, triggerPrice });
      return { ok: true, protection: fresh, oldCanceled: true, degraded: false, singleConstraintFallback: true };
    } catch (newErr) {
      let restored = null;
      try {
        if (Number.isFinite(oldTrigger) && oldTrigger > 0) {
          restored = await createProtection({
            symbol, side, type: 'STOP_MARKET', triggerPrice: oldTrigger,
            clientAlgoId: stopRecoveryClientId(symbol, side, fingerprint, oldTrigger), client
          });
        }
      } catch (restoreErr) {
        audit('STOP_REPLACE_RESTORE_FAILED', { symbol, fingerprint, newError: newErr.message, restoreError: restoreErr.message, oldTrigger });
      }
      if (restored) {
        applyStopProtection(pos, fingerprint, restored, 'STOP_REPLACE_OLD_RESTORED');
        pos.realStopReplaceRetry = { triggerPrice, attempts: finite(retry?.attempts, 0) + 1, lastAttemptAt: Date.now(), nextAttemptAt: Date.now() + 60_000, reason: newErr.message };
        audit('STOP_REPLACE_NEW_FAILED_OLD_RESTORED', { symbol, fingerprint, oldAlgoId: old?.algoId || null, restoredAlgoId: restored?.algoId || null, oldTrigger, requestedTrigger: triggerPrice, error: newErr.message });
        return { ok: false, reason: 'YENI_STOP_KURULAMADI_ESKI_GERI_KURULDU', oldRestored: true, oldKept: true, retryAfterMs: 60_000 };
      }

      const emergency = await closePositionMarket(pos, 'STOP_REPLACE_RECOVERY_FAILED', client).catch(closeErr => ({ ok: false, reason: closeErr.message }));
      setGlobalBlock('STOP_REPLACE_RECOVERY_FAILED', { symbol, fingerprint, requestedTrigger: triggerPrice, oldTrigger, emergencyClosed: emergency.ok === true });
      saveRecord(fingerprint, { status: emergency.ok ? 'CLOSED' : 'QUARANTINED', protectionStage: emergency.ok ? 'EMERGENCY_CLOSED' : 'PROTECTION_LOST', stopReplaceEmergency: clone(emergency) });
      audit('STOP_REPLACE_EMERGENCY_CLOSE', { symbol, fingerprint, requestedTrigger: triggerPrice, oldTrigger, emergency });
      return { ok: false, reason: 'STOP_REPLACE_RECOVERY_FAILED', globalBlocked: true, emergencyClosed: emergency.ok === true };
    }
  }

  let oldCanceled = true;
  let oldStillActive = false;
  if (old && String(old.algoId || old.clientAlgoId) !== String(fresh.algoId || fresh.clientAlgoId)) {
    const oldCancelResult = await cancelAlgoVerified(symbol, old, client);
    oldCanceled = oldCancelResult.ok;
    oldStillActive = !oldCancelResult.ok;
  }
  if (oldStillActive) {
    const freshCancelResult = await cancelAlgoVerified(symbol, fresh, client);
    if (freshCancelResult.ok) {
      audit('STOP_REPLACE_OLD_CANCEL_FAILED_NEW_ROLLED_BACK', {
        symbol, fingerprint, oldAlgoId: old?.algoId || null, newAlgoId: fresh.algoId || null, triggerPrice
      });
      return { ok: false, reason: 'ESKI_STOP_IPTAL_EDILEMEDI_YENI_GERI_ALINDI', oldKept: true, newRolledBack: true };
    }
    setGlobalBlock('CIFT_STOP_KORUMA_MUTABAKATSIZLIGI', {
      symbol, fingerprint, oldAlgoId: old?.algoId || null, newAlgoId: fresh.algoId || null
    });
    saveRecord(fingerprint, {
      status: 'QUARANTINED', protectionError: 'CIFT_STOP_KORUMA_MUTABAKATSIZLIGI',
      redundantStops: [clone(old), clone(fresh)]
    });
    audit('STOP_REPLACE_DOUBLE_ACTIVE_QUARANTINE', {
      symbol, fingerprint, oldAlgoId: old?.algoId || null, newAlgoId: fresh.algoId || null, triggerPrice
    });
    return { ok: false, reason: 'CIFT_STOP_KORUMA_MUTABAKATSIZLIGI', oldKept: true, globalBlocked: true };
  }

  applyStopProtection(pos, fingerprint, fresh, 'ATOMIC_STOP_REPLACED');
  audit('STOP_REPLACED_ATOMIC', { symbol, fingerprint, oldAlgoId: old?.algoId || null, newAlgoId: fresh.algoId || null, oldCanceled, oldStillActive, triggerPrice });
  return { ok: true, protection: fresh, oldCanceled: true, degraded: false };
}

async function collectAccounting(pos, { client = h.client, closeOrderId = null, closeTime = Date.now() } = {}) {
  const symbol = upper(pos?.sym || pos?.symbol);
  const openedAt = finite(pos?.acilisZamani || pos?.zaman, closeTime - 24 * 60 * 60 * 1000);
  const entryOrderId = positiveId(pos?.borsaOrderId ?? pos?.girisEmriCevabi?.orderId ?? pos?.gercekEmirYurutme?.entryOrder?.orderId);
  let trades = [];
  if (typeof client.futuresUserTrades === 'function') {
    try {
      trades = await client.futuresUserTrades({
        symbol, startTime: Math.max(0, openedAt - 60_000), endTime: closeTime + 60_000, limit: 1000
      });
    } catch (err) { audit('ACCOUNTING_TRADES_FETCH_FAILED', { symbol, error: err.message }); }
  }
  trades = (Array.isArray(trades) ? trades : []).filter(t => finite(t?.time, 0) >= openedAt - 5_000 && finite(t?.time, 0) <= closeTime + 60_000);
  const normalizedCloseOrderId = positiveId(closeOrderId);
  const entryTrades = entryOrderId ? trades.filter(t => positiveId(t?.orderId) === entryOrderId) : [];
  let exitTrades;
  if (normalizedCloseOrderId) {
    const exact = trades.filter(t => positiveId(t?.orderId) === normalizedCloseOrderId);
    exitTrades = exact.length ? exact : [];
  } else {
    // Manuel/harici kapanışta tüm zaman penceresini toplamak başka işlemlerin fill'lerini
    // karıştırabilir. Pozisyonun ters yönündeki en yeni gerçekleşmiş PNL fill'lerini,
    // hedef miktara ulaşana kadar seç.
    const expectedExitSide = upper(pos?.yon) === 'LONG' ? 'SELL' : 'BUY';
    const targetQty = Math.abs(finite(pos?.miktar, 0));
    const candidates = trades
      .filter(t => (!entryOrderId || positiveId(t?.orderId) !== entryOrderId))
      .filter(t => upper(t?.side) === expectedExitSide)
      .filter(t => Math.abs(finite(t?.realizedPnl, 0)) > 0)
      .sort((a, b) => finite(b?.time, 0) - finite(a?.time, 0));
    const selected = [];
    let selectedQty = 0;
    for (const trade of candidates) {
      selected.push(trade);
      selectedQty += Math.abs(finite(trade?.qty, 0));
      if (!(targetQty > 0) || selectedQty + 1e-12 >= targetQty) break;
    }
    exitTrades = selected.sort((a, b) => finite(a?.time, 0) - finite(b?.time, 0));
  }
  const allRelevant = [...entryTrades, ...exitTrades];
  const commissionByAsset = {};
  for (const trade of allRelevant) {
    const asset = upper(trade?.commissionAsset || 'UNKNOWN');
    commissionByAsset[asset] = Number(((commissionByAsset[asset] || 0) + Math.abs(finite(trade?.commission, 0))).toFixed(12));
  }
  // USDⓈ-M botun hesap para birimi USDT'dir. Farklı asset komisyonunu sayısal olarak
  // USDT'ye eşitlemek yanlış muhasebedir; ayrı göster ve net sonucu "tam" diye etiketleme.
  const commissionUsdt = finite(commissionByAsset.USDT, 0);
  const entryCommission = entryTrades
    .filter(t => upper(t?.commissionAsset || 'UNKNOWN') === 'USDT')
    .reduce((sum, t) => sum + Math.abs(finite(t?.commission, 0)), 0);
  const exitCommission = exitTrades
    .filter(t => upper(t?.commissionAsset || 'UNKNOWN') === 'USDT')
    .reduce((sum, t) => sum + Math.abs(finite(t?.commission, 0)), 0);
  const foreignCommissionAssets = Object.keys(commissionByAsset).filter(asset => asset !== 'USDT' && commissionByAsset[asset] > 0);
  const realizedPnl = exitTrades.reduce((sum, t) => sum + finite(t?.realizedPnl, 0), 0);
  const exitQty = exitTrades.reduce((sum, t) => sum + Math.abs(finite(t?.qty, 0)), 0);
  const exitQuote = exitTrades.reduce((sum, t) => sum + Math.abs(finite(t?.qty, 0)) * finite(t?.price, 0), 0);
  const entryQty = entryTrades.reduce((sum, t) => sum + Math.abs(finite(t?.qty, 0)), 0);
  const entryQuote = entryTrades.reduce((sum, t) => sum + Math.abs(finite(t?.qty, 0)) * finite(t?.price, 0), 0);
  const exitPrice = exitQty > 0 ? exitQuote / exitQty : NaN;
  const entryPrice = entryQty > 0 ? entryQuote / entryQty : finite(pos?.girisFiyati, NaN);
  const hasTradeData = allRelevant.length > 0;
  return {
    source: hasTradeData ? 'BINANCE_USER_TRADES' : 'FALLBACK_ESTIMATE_REQUIRED',
    accountingExact: entryTrades.length > 0 && exitTrades.length > 0 && foreignCommissionAssets.length === 0,
    foreignCommissionUnconverted: foreignCommissionAssets.length > 0,
    foreignCommissionAssets,
    commissionByAsset,
    tradeCount: allRelevant.length,
    entryTradeCount: entryTrades.length,
    exitTradeCount: exitTrades.length,
    entryOrderId: entryOrderId || null,
    closeOrderId: normalizedCloseOrderId || null,
    entryPrice: Number.isFinite(entryPrice) ? entryPrice : null,
    exitPrice: Number.isFinite(exitPrice) ? exitPrice : null,
    realizedPnl: Number(realizedPnl.toFixed(8)),
    entryCommission: Number(entryCommission.toFixed(8)),
    exitCommission: Number(exitCommission.toFixed(8)),
    commission: Number(commissionUsdt.toFixed(8)),
    netPnl: Number((realizedPnl - commissionUsdt).toFixed(8)),
    trades: allRelevant.map(t => ({ orderId: t.orderId, id: t.id, side: t.side, price: t.price, qty: t.qty, realizedPnl: t.realizedPnl, commission: t.commission, commissionAsset: t.commissionAsset, time: t.time }))
  };
}

async function collectAccountingReliable(pos, options = {}) {
  let accounting = null;
  const expectedEntryOrderId = positiveId(
    pos?.borsaOrderId ?? pos?.girisEmriCevabi?.orderId ?? pos?.gercekEmirYurutme?.entryOrder?.orderId
  );
  const delays = [0, 150, 250, 400, 650, 900, 1200, 1600];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    accounting = await collectAccounting(pos, options);
    const exitReady = accounting.exitTradeCount > 0;
    const entryReady = !expectedEntryOrderId || accounting.entryTradeCount > 0;
    if (exitReady && entryReady) break;
  }
  return accounting;
}

function triggeredProtectionType(protectionStatus = {}) {
  const stopStatus = algoOrderStatus(protectionStatus?.stop);
  const tpStatus = algoOrderStatus(protectionStatus?.takeProfit);
  const triggered = new Set(['FILLED', 'FINISHED', 'TRIGGERED', 'EXECUTED']);
  if (triggered.has(stopStatus)) return 'STOP';
  if (triggered.has(tpStatus)) return 'TAKE_PROFIT';
  return null;
}

function classifyExchangeClose(pos, accounting, fallbackPrice, protectionStatus = {}) {
  const exitPrice = finite(accounting?.exitPrice, finite(fallbackPrice, 0));
  const entry = finite(pos?.girisFiyati, 0);
  const trigger = triggeredProtectionType(protectionStatus);
  if (trigger === 'TAKE_PROFIT') return { reason: 'GERÇEK TP / BINANCE ALGO', manual: false, protectionTrigger: trigger };
  if (trigger === 'STOP') {
    const profitable = upper(pos?.yon) === 'LONG' ? exitPrice > entry : exitPrice < entry;
    return { reason: profitable ? 'GERÇEK İZ SÜREN STOP / KÂR KORUMA' : 'GERÇEK SL / BINANCE ALGO', manual: false, protectionTrigger: trigger };
  }
  // Fiyatın SL/TP'ye yakın olması tek başına kanıt değildir. Manuel kapanışın yanlışlıkla
  // algo kapanışı sayılmaması için yalnız Algo Service'in tetik durumuna güvenilir.
  // AGROS'un kendi market kapanışları closePositionMarket içinde gerekçesiyle işlenir.
  // Buraya düşen, pozisyonun borsa tarafında AGROS dışında kaybolduğu kapanıştır.
  return {
    reason: accounting?.tradeCount > 0 ? 'MANUAL_EXTERNAL_CLOSE / BINANCE FILL' : 'MANUAL_EXTERNAL_CLOSE',
    manual: true,
    protectionTrigger: null
  };
}

async function protectionStatusSnapshot(pos, client = h.client) {
  const known = protectionsFromPosition(pos);
  let snapshot = { stop: null, takeProfit: null };
  let unresolved = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const [stopResult, takeProfitResult] = await Promise.all([
      getAlgoByIdDetailed(pos?.sym || pos?.symbol, known.stop, client),
      getAlgoByIdDetailed(pos?.sym || pos?.symbol, known.takeProfit, client)
    ]);
    snapshot = { stop: stopResult.row, takeProfit: takeProfitResult.row };
    unresolved = [
      ...(known.stop && !stopResult.resolved ? [`STOP:${stopResult.reason}`] : []),
      ...(known.takeProfit && !takeProfitResult.resolved ? [`TP:${takeProfitResult.reason}`] : [])
    ];
    if (triggeredProtectionType(snapshot)) break;
    if (!unresolved.length) break;
    if (attempt < 2) await sleep(200 * (attempt + 1));
  }
  if (unresolved.length) throw new Error(`ALGO_KAPANIS_DURUMU_DOGRULANAMADI:${unresolved.join('|')}`);
  return snapshot;
}

async function finalizeExchangeClose(pos, fallbackPrice, client = h.client) {
  const protectionStatus = await protectionStatusSnapshot(pos, client);
  const triggered = triggeredProtectionType(protectionStatus);
  const triggeredRow = triggered === 'STOP' ? protectionStatus.stop : triggered === 'TAKE_PROFIT' ? protectionStatus.takeProfit : null;
  const closeOrderId = positiveId(triggeredRow?.actualOrderId);
  const accounting = await collectAccountingReliable(pos, { client, closeOrderId, closeTime: Date.now() });
  if (accounting.exitTradeCount <= 0) {
    const fingerprint = pos?.gercekEmirYurutme?.fingerprint || pos?.realExecutionFingerprint || contextFingerprint(pos.sym, pos.yon, pos);
    saveRecord(fingerprint, { status: 'QUARANTINED', closeAccountingError: 'BINANCE_EXIT_FILL_YOK', protectionStatus });
    setGlobalBlock('KAPANIS_MUHASEBESI_DOGRULANAMADI', { symbol: pos.sym });
    throw new Error('KAPANIS_MUHASEBESI_DOGRULANAMADI:BINANCE_EXIT_FILL_YOK');
  }
  const classification = classifyExchangeClose(pos, accounting, fallbackPrice, protectionStatus);
  const fingerprint = pos?.gercekEmirYurutme?.fingerprint || pos?.realExecutionFingerprint || contextFingerprint(pos.sym, pos.yon, pos);
  const cleanup = await cancelOwnedProtections(pos, client);
  if (cleanup.failed > 0) {
    saveRecord(fingerprint, {
      status: 'QUARANTINED', closedAt: nowIso(), closeReason: classification.reason,
      accounting, protectionStatus, protectionCleanup: cleanup
    });
    setGlobalBlock('KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI', { symbol: pos.sym, failed: cleanup.failed });
    throw new Error(`KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI:${cleanup.failed}`);
  }
  const closedAt = nowIso();
  saveRecord(fingerprint, {
    status: 'CLOSED', closedAt, closeReason: classification.reason, accounting, protectionStatus,
    protectionStage: 'CLOSED', protectionClosedAt: closedAt, currentProtections: clone(protectionStatus),
    ...accountingRecordFields(accounting)
  });
  if (classification.manual === true) {
    // Manuel/harici kapanış yalnız ilgili pozisyonu sonlandırır. Gerçek slot, kayıt CLOSED
    // olduktan ve koruma emirleri temizlendikten sonra otomatik olarak yeniden kullanılabilir.
    // Aynı sembol/yön tekrar girişi 4_pozisyon.js içindeki yerel cooldown ile korunur;
    // hesap-geneli gerçek emir motoru bloke edilmez.
    mutate(state => {
      if (upper(state?.globalBlock?.reason) === MANUAL_REARM_BLOCK) state.globalBlock = null;
    });
    audit('MANUAL_EXTERNAL_CLOSE_AUTO_REARM', {
      symbol: pos.sym, side: pos.yon, fingerprint, closedAt,
      accountingExact: accounting.accountingExact === true, netPnl: finite(accounting.netPnl, 0)
    });
  }
  audit('EXCHANGE_CLOSE_RECONCILED', { symbol: pos.sym, side: pos.yon, classification, accounting, protectionStatus });
  return { ...accounting, ...classification, protectionStatus, exitPrice: finite(accounting.exitPrice, fallbackPrice) };
}

async function ensureProtectionForPosition(pos, client = h.client) {
  const symbol = pos.sym;
  const side = pos.yon;
  const fingerprint = pos?.gercekEmirYurutme?.fingerprint || pos?.realExecutionFingerprint || contextFingerprint(symbol, side, pos);
  const existing = protectionsFromPosition(pos);
  const [open, regular] = await Promise.all([openAlgoOrders(symbol, client), openRegularOrders(symbol, client)]);
  const foreignAlgo = open.filter(row => !ownedId(row?.clientAlgoId || row?.clientOrderId));
  const foreignRegular = regular.filter(row => !ownedId(row?.clientOrderId));
  if (foreignAlgo.length || foreignRegular.length) {
    throw new Error(`HARICI_ACIK_EMIR_MUTABAKATI_GEREKLI:ALGO=${foreignAlgo.length}|NORMAL=${foreignRegular.length}`);
  }
  // Pozisyon artık borsada açık olduğuna göre geçmiş PENDING/close girişiminden kalmış
  // AGROS normal emirlerini açık bırakma. Kısmi bir emir ileride yeni miktar ekleyebilir.
  let ownedRegularStillActive = 0;
  for (const order of regular.filter(row => ownedId(row?.clientOrderId))) {
    await cancelRegularOrderIfOpen(symbol, order, client);
    const after = await getOrderByClientId(symbol, order.clientOrderId, client);
    if (after && !TERMINAL_ORDER_STATUSES.has(upper(after.status))) ownedRegularStillActive++;
  }
  if (ownedRegularStillActive > 0) {
    setGlobalBlock('AGROS_NORMAL_EMIR_IPTAL_EDILEMEDI', { symbol, ownedRegularStillActive });
    throw new Error(`AGROS_NORMAL_EMIR_IPTAL_EDILEMEDI:${ownedRegularStillActive}`);
  }
  const findExisting = candidate => candidate && open.find(row =>
    (candidate.algoId && String(row.algoId) === String(candidate.algoId)) ||
    (candidate.clientAlgoId && row.clientAlgoId === candidate.clientAlgoId)
  );
  const findDesiredActive = (type, triggerPrice) => open.find(row =>
    ownedId(row?.clientAlgoId || row?.clientOrderId) &&
    ACTIVE_ALGO_STATUSES.has(algoOrderStatus(row)) &&
    algoOrderType(row) === type &&
    triggerEqual(symbol, protectionTrigger(row), triggerPrice)
  );

  // Restart sırasında state'teki eski clientAlgoId terminal (CANCELED/EXPIRED/FINISHED) olabilir.
  // Aynı clientAlgoId Binance'te yeniden kullanılamaz. Önce borsada aynı amaç/fiyatta aktif bir
  // AGST2 koruması varsa onu sahiplen; yoksa yalnız restart için taze clientAlgoId üret.
  // Böylece eski terminal emri idempotent recovery diye tekrar tekrar doğrulamaya çalışıp
  // botu fail-closed restart döngüsüne sokmaz. Yeni koruma doğrulanmadan hiçbir aktif koruma silinmez.
  let stop = findExisting(existing.stop) || findDesiredActive('STOP_MARKET', pos.sl);
  let takeProfit = findExisting(existing.takeProfit) || findDesiredActive('TAKE_PROFIT_MARKET', pos.tp);
  const ids = clientIds(symbol, side, fingerprint);
  if (!stop) {
    const clientAlgoId = restartProtectionClientId(symbol, side, fingerprint, 'STOP_MARKET', pos.sl);
    stop = await createProtection({ symbol, side, type: 'STOP_MARKET', triggerPrice: pos.sl, clientAlgoId, client });
    audit('RESTART_PROTECTION_REARMED', { symbol, type: 'STOP_MARKET', oldClientAlgoId: existing.stop?.clientAlgoId || null, clientAlgoId: stop?.clientAlgoId || clientAlgoId, algoId: stop?.algoId || null, triggerPrice: stop?.triggerPrice || pos.sl });
  }
  if (!takeProfit) {
    const clientAlgoId = restartProtectionClientId(symbol, side, fingerprint, 'TAKE_PROFIT_MARKET', pos.tp);
    takeProfit = await createProtection({ symbol, side, type: 'TAKE_PROFIT_MARKET', triggerPrice: pos.tp, clientAlgoId, client });
    audit('RESTART_PROTECTION_REARMED', { symbol, type: 'TAKE_PROFIT_MARKET', oldClientAlgoId: existing.takeProfit?.clientAlgoId || null, clientAlgoId: takeProfit?.clientAlgoId || clientAlgoId, algoId: takeProfit?.algoId || null, triggerPrice: takeProfit?.triggerPrice || pos.tp });
  }

  // Aynı sembolde geçmiş atomik yenilemeden kalmış AGROS stoplarını temizle. En az bir doğrulanmış
  // stop ve TP elde edilmeden hiçbir eski koruma iptal edilmez.
  const keepKeys = new Set([String(stop?.algoId || stop?.clientAlgoId || ''), String(takeProfit?.algoId || takeProfit?.clientAlgoId || '')]);
  let redundantActive = 0;
  for (const row of open) {
    const key = String(row?.algoId || row?.clientAlgoId || '');
    if (!ownedId(row?.clientAlgoId) || keepKeys.has(key)) continue;
    const canceled = await cancelAlgoVerified(symbol, row, client);
    if (!canceled.ok) redundantActive++;
  }
  if (redundantActive > 0) {
    setGlobalBlock('ESKI_STOP_IPTAL_EDILEMEDI', { symbol, redundantActive });
    throw new Error(`ESKI_STOP_IPTAL_EDILEMEDI:${redundantActive}`);
  }
  pos.gercekEmirYurutme ||= { version: VERSION, fingerprint, ids };
  pos.gercekEmirYurutme.protections = { stop, takeProfit };
  pos.korumaEmirleri = {
    slAlgoId: stop.algoId || null, slClientAlgoId: stop.clientAlgoId || null,
    tpAlgoId: takeProfit.algoId || null, tpClientAlgoId: takeProfit.clientAlgoId || null
  };
  persistPosition(pos, 'STARTUP_PROTECTION_RECONCILED');
  return { stop, takeProfit };
}

function emergencySnapshot(row, saved = null) {
  const qty = positionAmount(row);
  const side = positionDirection(row);
  const entry = finite(row?.entryPrice, 0);
  const stopPct = Math.max(0.05, finite(ayarlar.sabitStopYuzdesi, 1.5));
  const tpPct = Math.max(0.05, ayarlar.stopTakipModu === 'KADEME' ? finite(ayarlar.maxTpYuzdesi, 10) : finite(ayarlar.sabitTpYuzdesi, 0.4));
  return {
    ...(saved || {}), sym: row.symbol, yon: side, sanal: false,
    girisFiyati: entry, miktar: qty,
    sl: finite(saved?.sl, side === 'LONG' ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100)),
    tp: finite(saved?.tp, side === 'LONG' ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100)),
    acilisZamani: finite(saved?.acilisZamani, Date.now()),
    breakevenAktif: Boolean(saved?.breakevenAktif),
    gercekRestartRecovery: true,
    scientificLearningExcluded: saved ? Boolean(saved.scientificLearningExcluded) : true,
    manualExternalPosition: !saved
  };
}

async function startupReconcile(client = h.client) {
  if (ayarlar.sanalEmirModu) return { positions: h.state.aktifPozisyonlar || [], restored: 0, adopted: 0, blocked: false };
  const processLock = acquireProcessLock();
  if (!processLock.ok) throw new Error(processLock.reason);
  const state = readState();
  if (upper(state?.globalBlock?.reason) === 'STATE_CORRUPTION_NO_RECOVERY') {
    throw new Error('STATE_CORRUPTION_NO_RECOVERY');
  }
  const positions = await allPositions(client);
  if (positions.some(row => !positionSideSupported(row))) {
    setGlobalBlock('HEDGE_MODE_DESTEKLENMIYOR_ONE_WAY_ZORUNLU');
    throw new Error('HEDGE_MODE_DESTEKLENMIYOR_ONE_WAY_ZORUNLU');
  }
  const openPositions = positions.filter(row => positionAmount(row) > 0);
  const openSymbolSet = new Set(openPositions.map(row => upper(row.symbol)));

  // State kaybolmuş olsa dahi hesabın tamamındaki AGST2 emirlerini gör. Pozisyonu olmayan
  // sembolde kalan close-all Algo veya yarım normal emir, sonraki pozisyonu yanlışlıkla
  // kapatabileceği/açabileceği için restart tamamlanmadan kesin olarak temizlenir.
  const [accountRegularOrders, accountAlgoOrders] = await Promise.all([
    openRegularOrders(undefined, client),
    openAlgoOrders(undefined, client)
  ]);
  const orphanFailures = [];
  for (const order of accountRegularOrders) {
    const symbol = upper(order?.symbol);
    if (!ownedId(order?.clientOrderId) || openSymbolSet.has(symbol)) continue;
    await cancelRegularOrderIfOpen(symbol, order, client);
    const after = await getOrderByClientId(symbol, order.clientOrderId, client);
    if (after && !TERMINAL_ORDER_STATUSES.has(upper(after.status))) orphanFailures.push(`NORMAL:${symbol}:${order.clientOrderId}`);
  }
  for (const algo of accountAlgoOrders) {
    const symbol = upper(algo?.symbol);
    if (!ownedId(algo?.clientAlgoId || algo?.clientOrderId) || openSymbolSet.has(symbol)) continue;
    const canceled = await cancelAlgoVerified(symbol, algo, client);
    if (!canceled.ok) {
      orphanFailures.push(`ALGO:${symbol}:${algo.clientAlgoId || algo.algoId}`);
    }
  }
  if (orphanFailures.length) {
    setGlobalBlock('ORPHAN_AGROS_EMIRLERI_TEMIZLENEMEDI', { orphanFailures });
    throw new Error(`ORPHAN_AGROS_EMIRLERI_TEMIZLENEMEDI:${orphanFailures.join(',')}`);
  }
  const restored = [];
  let adopted = 0;
  let protectionFailures = 0;
  const recoveredClosures = [];

  for (const row of openPositions) {
    const record = Object.values(state.records).find(r => upper(r?.symbol) === upper(row.symbol) && activeRecord(r));
    const saved = record?.positionSnapshot || record?.preparedSnapshot || null;
    const pos = emergencySnapshot(row, saved);
    const fingerprint = record?.fingerprint || contextFingerprint(pos.sym, pos.yon, pos);
    pos.realExecutionFingerprint = fingerprint;
    pos.gercekEmirYurutme = {
      ...(pos.gercekEmirYurutme || {}), version: VERSION, fingerprint,
      ids: record?.ids || clientIds(pos.sym, pos.yon, fingerprint),
      entryOrder: record?.entryOrder || pos?.gercekEmirYurutme?.entryOrder || null,
      protections: record?.protections || pos?.gercekEmirYurutme?.protections || null,
      restartRecoveredAt: nowIso()
    };
    if (!record) adopted++;
    try {
      await ensureProtectionForPosition(pos, client);
      saveRecord(fingerprint, {
        status: 'OPEN', symbol: pos.sym, side: pos.yon,
        ids: pos.gercekEmirYurutme.ids, protections: pos.gercekEmirYurutme.protections,
        positionSnapshot: snapshotPosition(pos), adoptedExternal: !record, restartRecoveredAt: nowIso()
      });
    } catch (err) {
      protectionFailures++;
      saveRecord(fingerprint, { status: 'QUARANTINED', symbol: pos.sym, side: pos.yon, protectionError: err.message, positionSnapshot: snapshotPosition(pos) });
      setGlobalBlock('RESTART_KORUMA_MUTABAKATI_BASARISIZ', { symbol: pos.sym, error: err.message });
      pos.realExecutionQuarantined = true;
    }
    restored.push(pos);
  }

  // Hesap-geneli AGROS Algo/normal emir temizliği yukarıda tek sorgu ile tamamlandı.
  // Geçmişteki her kapanmış kayıt sembolü için tekrar open-algo sorgusu yapmak başlangıç
  // süresini işlem geçmişiyle birlikte büyütüyordu; ikinci N-sembol taraması kaldırıldı.

  // Restart anında yarım kalmış normal giriş emrini kör tekrar göndermeden clientOrderId ile çöz.
  for (const record of Object.values(state.records)) {
    if (!activeRecord(record)) continue;
    if (openPositions.some(row => upper(row.symbol) === upper(record.symbol))) continue;
    const entry = await getOrderByClientId(record.symbol, record?.ids?.entry, client);
    if (entry && !TERMINAL_ORDER_STATUSES.has(upper(entry.status))) {
      await cancelRegularOrderIfOpen(record.symbol, entry, client);
      const afterCancelPosition = await symbolPosition(record.symbol, client);
      if (afterCancelPosition && positionAmount(afterCancelPosition) > 0) {
        setGlobalBlock('RESTART_YARIM_EMIR_POZISYONA_DONUSTU', { symbol: record.symbol, fingerprint: record.fingerprint });
        throw new Error(`RESTART_YARIM_EMIR_POZISYONA_DONUSTU:${record.symbol}`);
      }
    }
  }

  // Restart sırasında borsada kaybolmuş OPEN/CLOSING kayıtları sessizce unutma. Bilinen
  // koruma emirleri ve userTrades üzerinden kapanış nedenini/muhasebeyi yeniden kur.
  for (const record of Object.values(readState().records)) {
    if (!activeRecord(record)) continue;
    if (openPositions.some(row => upper(row.symbol) === upper(record.symbol))) continue;
    const snapshot = record.positionSnapshot || record.preparedSnapshot;
    if (snapshot && ['OPEN', 'CLOSING', 'QUARANTINED'].includes(upper(record.status))) {
      try {
        const recovered = await finalizeExchangeClose({
          ...snapshot,
          sym: record.symbol || snapshot.sym,
          yon: record.side || snapshot.yon,
          sanal: false,
          gercekEmirYurutme: {
            ...(snapshot.gercekEmirYurutme || {}), fingerprint: record.fingerprint,
            entryOrder: record.entryOrder || snapshot?.gercekEmirYurutme?.entryOrder,
            protections: record.protections || snapshot?.gercekEmirYurutme?.protections
          }
        }, snapshot.girisFiyati, client);
        recoveredClosures.push({ symbol: record.symbol, fingerprint: record.fingerprint, ...recovered });
        continue;
      } catch (err) {
        setGlobalBlock('RESTART_KAPANIS_MUTABAKATI_BASARISIZ', { symbol: record.symbol, error: err.message });
        saveRecord(record.fingerprint, { status: 'QUARANTINED', restartCloseReconcileError: err.message });
        protectionFailures++;
        continue;
      }
    }
    saveRecord(record.fingerprint, { status: 'CLOSED_EXTERNALLY_OR_NOT_FILLED', closedAt: nowIso() });
  }

  let manualRearmCleared = false;
  mutate(next => {
    if (protectionFailures === 0 && next.globalBlock) {
      const autoClear = new Set([
        'RESTART_KORUMA_MUTABAKATI_BASARISIZ',
        'HEDGE_MODE_DESTEKLENMIYOR_ONE_WAY_ZORUNLU',
        'RESTART_YARIM_EMIR_POZISYONA_DONUSTU',
        'GERCEK_POZISYON_KAPATILAMADI',
        'GERCEK_ACILIS_ROLLBACK_BASARISIZ',
        'KAPATMA_YON_MUTABAKATSIZLIGI',
        'TERS_YON_POZISYON_MUTABAKATSIZLIGI',
        'DOLUM_SONRASI_AKTIF_POZISYON_LIMITI_ASILDI',
        'ESKI_STOP_IPTAL_EDILEMEDI',
        'CIFT_STOP_KORUMA_MUTABAKATSIZLIGI',
        'AGROS_NORMAL_EMIR_IPTAL_EDILEMEDI',
        'ORPHAN_AGROS_EMIRLERI_TEMIZLENEMEDI',
        'KAPANIS_SONRASI_KORUMA_IPTAL_EDILEMEDI',
        'KAPANIS_MUHASEBESI_DOGRULANAMADI',
        'RESTART_KAPANIS_MUTABAKATI_BASARISIZ'
      ]);
      const blockedReason = upper(next.globalBlock.reason);
      const blockedSymbol = upper(next.globalBlock.symbol || next.globalBlock.details?.symbol);
      const blockedSymbolStillOpen = blockedSymbol && openPositions.some(row => upper(row.symbol) === blockedSymbol);
      const canClearWhileOpen = blockedReason === 'ESKI_STOP_IPTAL_EDILEMEDI';
      if (blockedReason === MANUAL_REARM_BLOCK && !blockedSymbolStillOpen) {
        // Eski sürümden kalan manuel kapanış global kilidi artık restart/ARM kapatma istemez.
        // Kapanan sembol borsada açık değilse, diğer açık pozisyonları etkilemeden temizlenir.
        next.globalBlock = null;
        manualRearmCleared = true;
      } else if (autoClear.has(blockedReason) && (!blockedSymbolStillOpen || canClearWhileOpen)) next.globalBlock = null;
    }
  });
  if (manualRearmCleared) audit('MANUAL_CLOSE_REARM_AUTO_CLEARED', { exchangeOpen: openPositions.length });
  audit('STARTUP_RECONCILIATION', { exchangeOpen: openPositions.length, restored: restored.length - adopted, adopted, protectionFailures, recoveredClosures: recoveredClosures.length, manualRearmCleared });
  return { positions: restored, restored: restored.length - adopted, adopted, protectionFailures, recoveredClosures, blocked: protectionFailures > 0 };
}

function statusSummary() {
  const state = readState();
  const records = Object.values(state.records || {});
  return {
    version: VERSION,
    globalBlock: state.globalBlock,
    active: records.filter(activeRecord).length,
    pending: records.filter(r => upper(r.status) === 'PENDING').length,
    submitted: records.filter(r => upper(r.status) === 'SUBMITTED').length,
    open: records.filter(r => upper(r.status) === 'OPEN').length,
    closing: records.filter(r => upper(r.status) === 'CLOSING').length,
    quarantined: records.filter(r => upper(r.status) === 'QUARANTINED').length,
    stateFile: STATE_FILE,
    auditFile: AUDIT_FILE,
    processLockFile: PROCESS_LOCK_FILE,
    processLockOwned
  };
}

module.exports = {
  VERSION, STATE_FILE, AUDIT_FILE, PROCESS_LOCK_FILE, OWNED_PREFIX,
  readState, writeState, audit, acquireProcessLock, cleanupProcessLock, contextFingerprint, clientIds, ownedId,
  reserveEntry, releaseReservation, executeEntry, installProtections, rollbackEntry,
  markOpen, persistPosition, replaceStopAtomic, closePositionMarket,
  cancelOwnedProtections, collectAccounting, finalizeExchangeClose,
  ensureProtectionForPosition, startupReconcile, statusSummary,
  _test: { blankState, finite, positiveId, positionDirection, positionAmount, classifyExchangeClose, triggeredProtectionType, stopRevisionClientId, stopRecoveryClientId, restartProtectionClientId, accountingRecordFields, algoOrderStatus, algoOrderType, algoPayloadRows, normalizeAlgoOrder, normalizeTriggerPrice, verifyAlgoActiveReliable, protectionTrigger, triggerEqual, adoptDesiredStop, signedReadDeadline }
};
