/**
 * AGROS v4.7.0 — HIERARCHICAL DNA IDENTITY REGISTRY
 *
 * Family DNA: existing DNA #n (YON + BTC + COIN), owned by module 59.
 * Lab DNA:    LAB #n (Family + BB).
 * Full DNA:   FULL #n (Lab + PUSU).
 *
 * Guarantees:
 * - Existing Family IDs are never changed.
 * - LAB/FULL IDs are persistent, monotonic and scope-local.
 * - Existing BlackBox summary is migrated without changing any counters.
 * - Main file is atomic, previous good copy is kept, journal is append-only.
 * - Corrupt/colliding identities fail closed.
 */
const fs = require('fs');
const path = require('path');
const io = require('./53_memory_safe_io.js');
const familyRegistry = require('./59_dna_identity_registry.js');

const VERSION = 'v4.7.0-HIERARCHICAL-DNA-IDENTITY';
const DATA_DIR = path.join(__dirname, 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'hierarchical-dna-identity-registry.json');
const BACKUP_FILE = `${REGISTRY_FILE}.bak`;
const JOURNAL_FILE = path.join(DATA_DIR, 'hierarchical-dna-identity-registry.jsonl');

const BB_VALUES = ['ORTA_ALT', 'ORTA_UST', 'ORTA', 'ALT', 'UST', 'YOK'];
let cache = null;
let cacheStamp = '';

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function cleanToken(v, fallback = 'YOK') {
  const value = String(v ?? fallback)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return value || fallback;
}

function keyFields(raw = '') {
  const text = String(raw || '').trim().toUpperCase();
  if (!text) return { yon: '', btc: '', coin: '', bb: 'YOK', pusu: '' };

  const shortHead = text.match(/^([LS])_B([01Y]{4})_C([01Y]{4})(?:_(.*))?$/);
  if (shortHead) {
    const tail = String(shortHead[4] || '');
    let bb = 'YOK';
    let pusu = '';
    for (const candidate of BB_VALUES) {
      if (tail === candidate || tail.startsWith(`${candidate}_P`)) {
        bb = candidate;
        pusu = tail.startsWith(`${candidate}_P`) ? tail.slice(candidate.length + 2) : '';
        break;
      }
    }
    return {
      yon: shortHead[1] === 'S' ? 'SHORT' : 'LONG',
      btc: shortHead[2],
      coin: shortHead[3],
      bb: cleanToken(bb),
      pusu: pusu ? cleanToken(pusu) : ''
    };
  }

  const yon = text.match(/(?:^|\|)YON=(LONG|SHORT)(?:\||$)/)?.[1] || '';
  const btc = text.match(/(?:^|\|)BTC=([01Y]{4})(?:\||$)/)?.[1] || '';
  const coin = text.match(/(?:^|\|)COIN=([01Y]{4})(?:\||$)/)?.[1] || '';
  const bb = text.match(/(?:^|\|)BB=([^|]+)/)?.[1] || 'YOK';
  const pusu = text.match(/(?:^|\|)PUSU=([^|]+)/)?.[1] || '';
  return { yon, btc, coin, bb: cleanToken(bb), pusu: pusu ? cleanToken(pusu) : '' };
}

function familyKey(raw = '') {
  return familyRegistry.identityKey(raw);
}

function labKey(raw = '') {
  const f = keyFields(raw);
  if (!f.yon || !f.btc || !f.coin) return '';
  return `YON=${f.yon}|BTC=${f.btc}|COIN=${f.coin}|BB=${f.bb || 'YOK'}`;
}

function fullKey(raw = '') {
  const lab = labKey(raw);
  if (!lab) return '';
  const f = keyFields(raw);
  return `${lab}|PUSU=${f.pusu || 'YOK'}`;
}

function labShortKey(raw = '') {
  const f = keyFields(raw);
  if (!f.yon || !f.btc || !f.coin) return '';
  return `${f.yon === 'SHORT' ? 'S' : 'L'}_B${f.btc}_C${f.coin}_${f.bb || 'YOK'}`;
}

function fullShortKey(raw = '') {
  const f = keyFields(raw);
  const lab = labShortKey(raw);
  return lab ? `${lab}_P${f.pusu || 'YOK'}` : '';
}

function label(type, id) {
  const prefix = type === 'FULL' ? 'FULL' : 'LAB';
  return id > 0 ? `${prefix} #${id}` : `${prefix} #YOK`;
}

function blankRegistry() {
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextLabId: 1,
    nextFullId: 1,
    lab: {},
    full: {},
    audit: { valid: true, duplicateIds: [], labCount: 0, fullCount: 0 }
  };
}

function fileStamp(file) {
  try {
    const s = fs.statSync(file);
    return `${s.size}:${s.mtimeMs}`;
  } catch (_) {
    return '';
  }
}

function normalizeEntry(raw, fallbackKey, type) {
  const key = type === 'FULL'
    ? fullKey(raw?.key || fallbackKey)
    : labKey(raw?.key || fallbackKey);
  const id = Math.trunc(num(raw?.id));
  if (!key || id < 1) return null;

  const family = familyRegistry.find(key) || familyRegistry.ensure(key, { source: `HIERARCHY_${type}_PARENT` });
  const parentLabKey = type === 'FULL' ? labKey(key) : key;
  return {
    id,
    label: label(type, id),
    key,
    shortKey: type === 'FULL' ? fullShortKey(key) : labShortKey(key),
    labKey: parentLabKey,
    familyId: family?.id || null,
    familyLabel: family?.label || 'DNA #YOK',
    familyKey: family?.key || familyKey(key),
    firstSeenAt: raw?.firstSeenAt || raw?.createdAt || new Date().toISOString(),
    lastSeenAt: raw?.lastSeenAt || raw?.updatedAt || new Date().toISOString(),
    firstSource: raw?.firstSource || raw?.source || 'RECOVERY',
    lastSource: raw?.lastSource || raw?.source || 'RECOVERY'
  };
}

function validateRegistry(registry, { throwOnError = false } = {}) {
  const duplicateIds = [];
  function inspect(table, type) {
    const owners = new Map();
    for (const [storedKey, raw] of Object.entries(table || {})) {
      const entry = normalizeEntry(raw, storedKey, type);
      if (!entry) continue;
      const owner = owners.get(entry.id);
      if (owner && owner !== entry.key) {
        duplicateIds.push({ type, id: entry.id, keys: [owner, entry.key] });
      }
      owners.set(entry.id, entry.key);
    }
    return Math.max(0, ...owners.keys());
  }

  const maxLabId = inspect(registry?.lab, 'LAB');
  const maxFullId = inspect(registry?.full, 'FULL');
  const valid = duplicateIds.length === 0
    && Math.trunc(num(registry?.nextLabId, 1)) > maxLabId
    && Math.trunc(num(registry?.nextFullId, 1)) > maxFullId;
  const audit = {
    valid,
    duplicateIds,
    maxLabId,
    maxFullId,
    labCount: Object.keys(registry?.lab || {}).length,
    fullCount: Object.keys(registry?.full || {}).length
  };
  if (!valid && throwOnError) {
    throw new Error(`Hiyerarşik DNA kimlik defteri geçersiz: ${JSON.stringify(audit)}`);
  }
  return audit;
}

function canonicalizeRegistry(raw) {
  const out = blankRegistry();
  out.createdAt = raw?.createdAt || out.createdAt;

  const labIds = new Map();
  for (const [storedKey, value] of Object.entries(raw?.lab || {})) {
    const entry = normalizeEntry(value, storedKey, 'LAB');
    if (!entry) continue;
    const owner = labIds.get(entry.id);
    if (owner && owner !== entry.key) throw new Error(`LAB ID çakışması: ${entry.id}`);
    labIds.set(entry.id, entry.key);
    out.lab[entry.key] = entry;
  }

  const fullIds = new Map();
  for (const [storedKey, value] of Object.entries(raw?.full || {})) {
    const entry = normalizeEntry(value, storedKey, 'FULL');
    if (!entry) continue;
    const owner = fullIds.get(entry.id);
    if (owner && owner !== entry.key) throw new Error(`FULL ID çakışması: ${entry.id}`);
    fullIds.set(entry.id, entry.key);
    out.full[entry.key] = entry;
  }

  const maxLabId = Math.max(0, ...Object.values(out.lab).map(x => num(x.id)));
  const maxFullId = Math.max(0, ...Object.values(out.full).map(x => num(x.id)));
  out.nextLabId = Math.max(maxLabId + 1, Math.trunc(num(raw?.nextLabId, maxLabId + 1)));
  out.nextFullId = Math.max(maxFullId + 1, Math.trunc(num(raw?.nextFullId, maxFullId + 1)));
  out.updatedAt = raw?.updatedAt || new Date().toISOString();
  out.audit = validateRegistry(out, { throwOnError: true });
  return out;
}

function journalRows() {
  return io.readJsonlTailSync(JOURNAL_FILE, 50000, { maxScanBytes: 64 * 1024 * 1024 });
}

function applyJournal(registry) {
  const out = canonicalizeRegistry(registry || blankRegistry());
  for (const raw of journalRows()) {
    const type = raw?.type === 'FULL' ? 'FULL' : 'LAB';
    const entry = normalizeEntry(raw, raw?.key, type);
    if (!entry) continue;
    const table = type === 'FULL' ? out.full : out.lab;
    const existing = table[entry.key];
    if (existing && existing.id !== entry.id) {
      throw new Error(`${type} günlük anahtar çakışması: ${entry.key}`);
    }
    const conflicting = Object.values(table).find(x => x.id === entry.id && x.key !== entry.key);
    if (conflicting) throw new Error(`${type} günlük ID çakışması: ${entry.id}`);
    table[entry.key] = existing || entry;
  }
  const maxLabId = Math.max(0, ...Object.values(out.lab).map(x => num(x.id)));
  const maxFullId = Math.max(0, ...Object.values(out.full).map(x => num(x.id)));
  out.nextLabId = Math.max(out.nextLabId, maxLabId + 1);
  out.nextFullId = Math.max(out.nextFullId, maxFullId + 1);
  out.audit = validateRegistry(out, { throwOnError: true });
  return out;
}

function readCandidate(file) {
  const raw = io.readJsonBounded(file, null, { maxBytes: 32 * 1024 * 1024 });
  if (!raw) return null;
  try {
    return canonicalizeRegistry(raw);
  } catch (_) {
    return null;
  }
}

function readRegistry({ refresh = false } = {}) {
  const stamp = `${fileStamp(REGISTRY_FILE)}|${fileStamp(BACKUP_FILE)}|${fileStamp(JOURNAL_FILE)}`;
  if (!refresh && cache && stamp === cacheStamp) return cache;
  let registry = readCandidate(REGISTRY_FILE) || readCandidate(BACKUP_FILE) || blankRegistry();
  registry = applyJournal(registry);
  cache = registry;
  cacheStamp = stamp;
  return cache;
}

function writeRegistry(registry) {
  ensureDir();
  const out = canonicalizeRegistry({
    ...registry,
    version: VERSION,
    updatedAt: new Date().toISOString()
  });
  if (fs.existsSync(REGISTRY_FILE)) fs.copyFileSync(REGISTRY_FILE, BACKUP_FILE);
  io.writeJsonAtomic(REGISTRY_FILE, out);
  cache = out;
  cacheStamp = `${fileStamp(REGISTRY_FILE)}|${fileStamp(BACKUP_FILE)}|${fileStamp(JOURNAL_FILE)}`;
  return out;
}

function appendJournal(entries, type) {
  if (!entries.length) return;
  ensureDir();
  const rows = entries.map(entry => JSON.stringify({
    version: VERSION,
    type,
    ...entry,
    journaledAt: new Date().toISOString()
  })).join('\n');
  fs.appendFileSync(JOURNAL_FILE, `${rows}\n`);
}

function ensureMany(keys, type = 'LAB', { source = 'BULK', touch = false } = {}) {
  const canonical = [...new Set((keys || [])
    .map(key => type === 'FULL' ? fullKey(key) : labKey(key))
    .filter(Boolean))]
    .sort();
  if (!canonical.length) return new Map();

  // Every FULL identity must have a persistent LAB parent, even if a legacy
  // full-signature row exists without a matching summary bucket.
  if (type === 'FULL') {
    ensureMany(canonical.map(labKey), 'LAB', { source: `${source}_PARENT_LAB`, touch: false });
  }

  const registry = readRegistry();
  const table = type === 'FULL' ? registry.full : registry.lab;
  const nextField = type === 'FULL' ? 'nextFullId' : 'nextLabId';
  const created = [];
  const now = new Date().toISOString();

  for (const key of canonical) {
    if (!table[key]) {
      const id = registry[nextField]++;
      const entry = normalizeEntry({ id, key, source, firstSource: source, lastSource: source }, key, type);
      table[key] = entry;
      created.push(entry);
    } else if (touch) {
      table[key].lastSeenAt = now;
      table[key].lastSource = source;
    }
  }

  if (created.length) appendJournal(created, type);
  if (created.length || touch) writeRegistry(registry);
  return new Map(canonical.map(key => [key, { ...table[key] }]));
}

function ensureLab(raw, options = {}) {
  const key = labKey(raw);
  return key ? ensureMany([key], 'LAB', options).get(key) || null : null;
}

function ensureFull(raw, options = {}) {
  const key = fullKey(raw);
  return key ? ensureMany([key], 'FULL', options).get(key) || null : null;
}

function findLab(raw) {
  const key = labKey(raw);
  const row = key ? readRegistry().lab[key] : null;
  return row ? { ...row } : null;
}

function findFull(raw) {
  const key = fullKey(raw);
  const row = key ? readRegistry().full[key] : null;
  return row ? { ...row } : null;
}

function pusuFromPosition(pos) {
  const kalite = pos?.girisAnalizi?.pusuKalite || {};
  return cleanToken(
    kalite.senaryo
      || kalite.tip
      || pos?.girisAnalizi?.senaryo
      || pos?.pusuTipi
      || pos?.senaryo
      || 'YOK'
  );
}

function forPosition(pos, { source = 'POSITION_HIERARCHY' } = {}) {
  const signature = pos?.blackboxAcilis?.strategySignature || {};
  const raw = signature.key
    || pos?.dnaLeagueProfile?.key
    || pos?.realOrderReadiness?.key
    || '';
  const lab = ensureLab(raw, { source });
  const fullRaw = lab ? `${lab.key}|PUSU=${pusuFromPosition(pos)}` : raw;
  const full = ensureFull(fullRaw, { source });
  const family = familyRegistry.ensure(raw, { source });
  return { family, lab, full };
}

function decoratePosition(pos, options = {}) {
  if (!pos) return null;
  const identities = forPosition(pos, options);
  pos.dnaId = identities.family?.id || pos.dnaId || null;
  pos.dnaLabel = identities.family?.label || pos.dnaLabel || 'DNA #YOK';
  pos.dnaIdentityKey = identities.family?.key || pos.dnaIdentityKey || '';
  pos.labDnaId = identities.lab?.id || null;
  pos.labDnaLabel = identities.lab?.label || 'LAB #YOK';
  pos.labIdentityKey = identities.lab?.key || '';
  pos.fullDnaId = identities.full?.id || null;
  pos.fullDnaLabel = identities.full?.label || 'FULL #YOK';
  pos.fullIdentityKey = identities.full?.key || '';
  return identities;
}

function coverageAudit(summary) {
  const baseClosed = num(summary?.long?.toplam) + num(summary?.short?.toplam);
  const labClosed = Object.values(summary?.exactComboStats || {})
    .reduce((sum, row) => sum + num(row?.toplam), 0);
  const fullClosed = Object.values(summary?.fullSignatureStats || {})
    .reduce((sum, row) => sum + num(row?.toplam), 0);
  return {
    baseClosed,
    labClosed,
    fullClosed,
    labMissing: Math.max(0, baseClosed - labClosed),
    fullMissing: Math.max(0, baseClosed - fullClosed),
    labCoveragePct: baseClosed ? (labClosed / baseClosed) * 100 : 100,
    fullCoveragePct: baseClosed ? (fullClosed / baseClosed) * 100 : 100,
    complete: baseClosed === labClosed && baseClosed === fullClosed
  };
}

function bootstrapFromBlackbox(summary, { source = 'BLACKBOX_HISTORICAL_MIGRATION' } = {}) {
  const labKeys = Object.keys(summary?.exactComboStats || {});
  const fullKeys = Object.keys(summary?.fullSignatureStats || {});
  const labs = ensureMany(labKeys, 'LAB', { source });
  const fulls = ensureMany(fullKeys, 'FULL', { source });

  let labUpdated = 0;
  for (const [rawKey, bucket] of Object.entries(summary?.exactComboStats || {})) {
    const entry = labs.get(labKey(rawKey));
    if (!entry || !bucket) continue;
    bucket.labDnaId = entry.id;
    bucket.labDnaLabel = entry.label;
    bucket.labIdentityKey = entry.key;
    bucket.familyDnaId = entry.familyId;
    bucket.familyDnaLabel = entry.familyLabel;
    bucket.familyIdentityKey = entry.familyKey;
    labUpdated++;
  }

  let fullUpdated = 0;
  for (const [rawKey, bucket] of Object.entries(summary?.fullSignatureStats || {})) {
    const entry = fulls.get(fullKey(rawKey));
    if (!entry || !bucket) continue;
    bucket.fullDnaId = entry.id;
    bucket.fullDnaLabel = entry.label;
    bucket.fullIdentityKey = entry.key;
    bucket.labIdentityKey = entry.labKey;
    bucket.familyDnaId = entry.familyId;
    bucket.familyDnaLabel = entry.familyLabel;
    bucket.familyIdentityKey = entry.familyKey;
    fullUpdated++;
  }

  return {
    labUpdated,
    fullUpdated,
    coverage: coverageAudit(summary),
    registryAudit: audit()
  };
}

function audit() {
  const registry = readRegistry({ refresh: true });
  return {
    ...validateRegistry(registry),
    registryFile: REGISTRY_FILE,
    backupFile: BACKUP_FILE,
    journalFile: JOURNAL_FILE
  };
}

module.exports = {
  VERSION,
  REGISTRY_FILE,
  BACKUP_FILE,
  JOURNAL_FILE,
  cleanToken,
  keyFields,
  familyKey,
  labKey,
  fullKey,
  labShortKey,
  fullShortKey,
  label,
  readRegistry,
  writeRegistry,
  ensureLab,
  ensureFull,
  ensureMany,
  findLab,
  findFull,
  pusuFromPosition,
  forPosition,
  decoratePosition,
  coverageAudit,
  bootstrapFromBlackbox,
  validateRegistry,
  audit
};
