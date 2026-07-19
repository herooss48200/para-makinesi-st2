/**
 * AGROS v4.6 — PERSISTENT DNA IDENTITY REGISTRY
 *
 * Tek gerçek kimlik kaynağıdır. 256 temel DNA imzasına (YON/BTC/COIN)
 * değişmez, artan ve çakışmasız sayısal ID atar.
 *
 * Güvenlik sözleşmesi:
 * - Var olan ID hiçbir zaman yeniden numaralanmaz.
 * - İlk kurulumda geçmiş DNA'lar alfabetik anahtar sırasıyla deterministik atanır.
 * - Yeni DNA ilk görüldüğü anda sıradaki ID'yi otomatik alır.
 * - Ana dosya atomik yazılır; son sağlam kopya .bak olarak korunur.
 * - Bozuk/çakışmalı kayıt fail-closed doğrulanır; ID tekrar kullanımı yapılmaz.
 */
const fs = require('fs');
const path = require('path');
const io = require('./53_memory_safe_io.js');

const VERSION = 'v4.6.1-PERSISTENT-DNA-IDENTITY';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'dna-identity-registry.json');
const BACKUP_FILE = `${REGISTRY_FILE}.bak`;
const LOCK_FILE = `${REGISTRY_FILE}.lock`;
const JOURNAL_FILE = path.join(DATA_DIR, 'dna-identity-registry.jsonl');
const LEGACY_FILES = [
  path.join(DATA_DIR, 'dna-identity-cards.json'),
  path.join(DATA_DIR, 'dna-league-state.json'),
  path.join(DATA_DIR, 'dynamic-dna-exit-runtime.json'),
  path.join(DATA_DIR, 'dynamic-dna-exit-model.json')
];

let cache = null;
let cacheStamp = '';

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function directionFromKey(key = '') {
  const raw = String(key || '').trim().toUpperCase();
  const short = raw.match(/^([LS])_B([01Y]{4})_C([01Y]{4})/);
  if (short) return short[1] === 'S' ? 'SHORT' : 'LONG';
  return raw.match(/(?:^|\|)YON=(LONG|SHORT)(?:\||$)/)?.[1] || '';
}

/** Kimlik düzeyi daima temel 256 DNA'dır; TF/BB ayrıntıları alias olarak kalır. */
function identityKey(key = '') {
  const raw = String(key || '').trim().toUpperCase();
  if (!raw) return '';
  const short = raw.match(/^([LS])_B([01Y]{4})_C([01Y]{4})/);
  if (short) return `YON=${short[1] === 'S' ? 'SHORT' : 'LONG'}|BTC=${short[2]}|COIN=${short[3]}`;
  const yon = directionFromKey(raw);
  const btc = raw.match(/(?:^|\|)BTC=([01Y]{4})(?:\||$)/)?.[1] || raw.match(/BTC=([01Y]{4})/)?.[1] || '';
  const coin = raw.match(/(?:^|\|)COIN=([01Y]{4})(?:\||$)/)?.[1] || raw.match(/COIN=([01Y]{4})/)?.[1] || '';
  return yon && btc && coin ? `YON=${yon}|BTC=${btc}|COIN=${coin}` : '';
}

function label(id) {
  return id > 0 ? `DNA #${id}` : 'DNA #YOK';
}

function blankRegistry() {
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextId: 1,
    count: 0,
    entries: {},
    audit: { valid: true, duplicateIds: [], duplicateKeys: [], maxId: 0 }
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

function normalizeEntry(raw, fallbackKey = '') {
  const key = identityKey(raw?.key || fallbackKey);
  const id = Math.trunc(num(raw?.id ?? raw?.dnaId));
  if (!key || id < 1) return null;
  const aliases = [...new Set([...(Array.isArray(raw?.aliases) ? raw.aliases : []), raw?.key, fallbackKey]
    .map(x => String(x || '').trim()).filter(Boolean))].slice(-25);
  return {
    id,
    label: label(id),
    key,
    aliases,
    firstSeenAt: raw?.firstSeenAt || raw?.createdAt || new Date().toISOString(),
    lastSeenAt: raw?.lastSeenAt || raw?.updatedAt || new Date().toISOString(),
    firstSource: raw?.firstSource || raw?.source || 'LEGACY_RECOVERY',
    lastSource: raw?.lastSource || raw?.source || 'LEGACY_RECOVERY'
  };
}

function validateRegistry(registry, { throwOnError = false } = {}) {
  const entries = registry?.entries && typeof registry.entries === 'object' ? registry.entries : {};
  const idToKeys = new Map();
  const canonicalSeen = new Set();
  const duplicateKeys = [];
  let maxId = 0;
  for (const [storedKey, raw] of Object.entries(entries)) {
    const entry = normalizeEntry(raw, storedKey);
    if (!entry) continue;
    maxId = Math.max(maxId, entry.id);
    if (canonicalSeen.has(entry.key)) duplicateKeys.push(entry.key);
    canonicalSeen.add(entry.key);
    const list = idToKeys.get(entry.id) || [];
    list.push(entry.key);
    idToKeys.set(entry.id, list);
  }
  const duplicateIds = [...idToKeys.entries()].filter(([, keys]) => new Set(keys).size > 1)
    .map(([id, keys]) => ({ id, keys: [...new Set(keys)] }));
  const nextId = Math.max(1, Math.trunc(num(registry?.nextId, maxId + 1)));
  const valid = duplicateIds.length === 0 && duplicateKeys.length === 0 && nextId > maxId;
  const audit = { valid, duplicateIds, duplicateKeys: [...new Set(duplicateKeys)], maxId, nextId };
  if (!valid && throwOnError) throw new Error(`DNA kimlik defteri geçersiz: ${JSON.stringify(audit)}`);
  return audit;
}

function canonicalizeRegistry(raw) {
  const out = blankRegistry();
  out.createdAt = raw?.createdAt || out.createdAt;
  const byId = new Map();
  const sourceEntries = raw?.entries && typeof raw.entries === 'object' ? raw.entries : {};
  for (const [storedKey, value] of Object.entries(sourceEntries)) {
    const entry = normalizeEntry(value, storedKey);
    if (!entry) continue;
    if (out.entries[entry.key]) {
      const current = out.entries[entry.key];
      current.aliases = [...new Set([...(current.aliases || []), ...(entry.aliases || [])])].slice(-25);
      current.lastSeenAt = entry.lastSeenAt || current.lastSeenAt;
      continue;
    }
    if (byId.has(entry.id) && byId.get(entry.id) !== entry.key) {
      throw new Error(`DNA ID çakışması: ${entry.id} hem ${byId.get(entry.id)} hem ${entry.key}`);
    }
    byId.set(entry.id, entry.key);
    out.entries[entry.key] = entry;
  }
  const maxId = Math.max(0, ...Object.values(out.entries).map(x => num(x.id)));
  out.nextId = Math.max(maxId + 1, Math.trunc(num(raw?.nextId, maxId + 1)));
  out.count = Object.keys(out.entries).length;
  out.updatedAt = raw?.updatedAt || new Date().toISOString();
  out.audit = validateRegistry(out, { throwOnError: true });
  return out;
}

function readCandidate(file) {
  const raw = io.readJsonBounded(file, null, { maxBytes: 16 * 1024 * 1024 });
  if (!raw) return null;
  try { return canonicalizeRegistry(raw); } catch (_) { return null; }
}

function journalRows() {
  return io.readJsonlTailSync(JOURNAL_FILE, 10000, { maxScanBytes: 32 * 1024 * 1024 });
}

function applyJournal(registry) {
  const out = canonicalizeRegistry(registry || blankRegistry());
  const idOwners = new Map(Object.values(out.entries).map(x => [x.id, x.key]));
  for (const raw of journalRows()) {
    const entry = normalizeEntry(raw, raw?.key);
    if (!entry) continue;
    const owner = idOwners.get(entry.id);
    if (owner && owner !== entry.key) throw new Error(`DNA kimlik günlüğü ID çakışması: ${entry.id} ${owner}/${entry.key}`);
    if (out.entries[entry.key] && out.entries[entry.key].id !== entry.id) throw new Error(`DNA kimlik günlüğü anahtar çakışması: ${entry.key}`);
    if (!out.entries[entry.key]) out.entries[entry.key] = entry;
    idOwners.set(entry.id, entry.key);
  }
  const maxId = Math.max(0, ...Object.values(out.entries).map(x => num(x.id)));
  out.nextId = Math.max(out.nextId, maxId + 1);
  out.count = Object.keys(out.entries).length;
  out.audit = validateRegistry(out, { throwOnError: true });
  return out;
}

function appendJournal(entries = []) {
  if (!entries.length) return;
  ensureDir();
  fs.appendFileSync(JOURNAL_FILE, entries.map(x => JSON.stringify({ version: VERSION, ...x, journaledAt: new Date().toISOString() })).join('\n') + '\n');
}

function walkRows(value, visit, depth = 0) {
  if (depth > 6 || value == null) return;
  if (Array.isArray(value)) {
    for (const row of value) walkRows(row, visit, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walkRows(child, visit, depth + 1);
}

function legacySeed() {
  const candidates = [];
  for (const file of LEGACY_FILES) {
    const raw = io.readJsonBounded(file, null, { maxBytes: 64 * 1024 * 1024 });
    if (!raw) continue;
    walkRows(raw, row => {
      const key = identityKey(row?.key || row?.dna || row?.signature || row?.baseSignature);
      const id = Math.trunc(num(row?.dnaId ?? row?.id));
      if (key) candidates.push({ key, id: id > 0 ? id : null, source: path.basename(file) });
    });
  }
  return candidates;
}

function bootstrapRegistry() {
  const registry = blankRegistry();
  const seeds = legacySeed();
  for (const raw of journalRows()) {
    const key = identityKey(raw?.key);
    const id = Math.trunc(num(raw?.id ?? raw?.dnaId));
    if (key && id > 0) seeds.push({ key, id, source: 'IDENTITY_JOURNAL' });
  }
  const usedIds = new Set();
  for (const seed of seeds.filter(x => x.id).sort((a, b) => a.id - b.id || a.key.localeCompare(b.key))) {
    if (registry.entries[seed.key] || usedIds.has(seed.id)) continue;
    registry.entries[seed.key] = normalizeEntry({ id: seed.id, key: seed.key, source: seed.source }, seed.key);
    usedIds.add(seed.id);
  }
  let next = Math.max(0, ...usedIds) + 1;
  for (const key of [...new Set(seeds.map(x => x.key))].sort()) {
    if (registry.entries[key]) continue;
    while (usedIds.has(next)) next++;
    registry.entries[key] = normalizeEntry({ id: next, key, source: 'DETERMINISTIC_LEGACY_BOOTSTRAP' }, key);
    usedIds.add(next++);
  }
  registry.nextId = Math.max(1, next);
  registry.count = Object.keys(registry.entries).length;
  registry.updatedAt = new Date().toISOString();
  registry.audit = validateRegistry(registry, { throwOnError: true });
  return registry;
}

function readRegistry({ refresh = false } = {}) {
  const stamp = `${fileStamp(REGISTRY_FILE)}|${fileStamp(BACKUP_FILE)}`;
  if (!refresh && cache && stamp === cacheStamp) return cache;
  let registry = readCandidate(REGISTRY_FILE);
  if (!registry) registry = readCandidate(BACKUP_FILE);
  if (!registry) registry = bootstrapRegistry();
  registry = applyJournal(registry);
  cache = registry;
  cacheStamp = stamp;
  return registry;
}

function sleepMs(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function lockOwnerAlive() {
  try {
    const raw = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const pid = Math.trunc(num(raw?.pid));
    if (pid < 1) return null;
    try { process.kill(pid, 0); return true; }
    catch (err) { return err?.code === 'EPERM' ? true : false; }
  } catch (_) { return null; }
}

function withLock(fn) {
  ensureDir();
  const deadline = Date.now() + 20000;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }));
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
        const ownerAlive = lockOwnerAlive();
        // Yalnız ölü/bozuk sahipli kilit temizlenir. Canlı sürecin kilidi yaşına bakılarak silinmez.
        if (ownerAlive === false || (ownerAlive === null && age > 5000)) fs.unlinkSync(LOCK_FILE);
      } catch (_) {}
      if (Date.now() >= deadline) throw new Error('DNA kimlik defteri kilidi 20 saniye içinde alınamadı.');
      sleepMs(25 + Math.floor(Math.random() * 25));
    }
  }
  try { return fn(); }
  finally {
    try { fs.closeSync(fd); } catch (_) {}
    try {
      const current = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      if (current?.token === token) fs.unlinkSync(LOCK_FILE);
    } catch (_) {}
  }
}

function persist(registry) {
  registry.version = VERSION;
  registry.updatedAt = new Date().toISOString();
  registry.count = Object.keys(registry.entries || {}).length;
  registry.audit = validateRegistry(registry, { throwOnError: true });
  ensureDir();
  io.writeJsonAtomic(REGISTRY_FILE, registry);
  // Ana dosya başarıyla yazıldıktan sonra en güncel sağlam kopyayı yenile.
  fs.copyFileSync(REGISTRY_FILE, BACKUP_FILE);
  cache = registry;
  cacheStamp = `${fileStamp(REGISTRY_FILE)}|${fileStamp(BACKUP_FILE)}`;
  return registry;
}

function ensureMany(keys = [], options = {}) {
  const source = String(options.source || 'UNKNOWN');
  const aliasesByKey = new Map();
  for (const raw of keys) {
    const canonical = identityKey(raw);
    if (!canonical) continue;
    const aliases = aliasesByKey.get(canonical) || new Set();
    const alias = String(raw || '').trim();
    if (alias) aliases.add(alias);
    aliasesByKey.set(canonical, aliases);
  }
  const canonicalKeys = [...aliasesByKey.keys()];
  if (!canonicalKeys.length) return new Map();

  // Var olan kimlikler değişmeyecekse yazma kilidine hiç girme. Bu, çalışan bot ile
  // test/rapor süreçlerinin gereksiz biçimde birbirini bekletmesini engeller.
  if (options.touch !== true) {
    const snapshot = readRegistry();
    const writeNeeded = canonicalKeys.some(key => {
      const entry = snapshot.entries?.[key];
      if (!entry) return true;
      const existing = new Set(entry.aliases || []);
      return [...(aliasesByKey.get(key) || [])].some(alias => !existing.has(alias));
    });
    if (!writeNeeded) {
      return new Map(canonicalKeys.map(key => [key, { ...snapshot.entries[key] }]));
    }
  }

  return withLock(() => {
    const registry = readRegistry({ refresh: true });
    let changed = false;
    const now = new Date().toISOString();
    const missing = canonicalKeys.filter(key => !registry.entries[key]).sort();
    const newEntries = [];
    for (const key of missing) {
      const id = registry.nextId++;
      registry.entries[key] = {
        id,
        label: label(id),
        key,
        aliases: [...(aliasesByKey.get(key) || [])].slice(-25),
        firstSeenAt: now,
        lastSeenAt: now,
        firstSource: source,
        lastSource: source
      };
      newEntries.push(registry.entries[key]);
      changed = true;
    }
    for (const key of canonicalKeys) {
      const entry = registry.entries[key];
      if (!entry) continue;
      const mergedAliases = [...new Set([...(entry.aliases || []), ...(aliasesByKey.get(key) || [])])].slice(-25);
      if (mergedAliases.length !== (entry.aliases || []).length) changed = true;
      entry.aliases = mergedAliases;
      entry.lastSeenAt = now;
      entry.lastSource = source;
    }
    if (newEntries.length) appendJournal(newEntries);
    if (changed || options.touch === true) persist(registry);
    else {
      cache = registry;
      cacheStamp = `${fileStamp(REGISTRY_FILE)}|${fileStamp(BACKUP_FILE)}`;
    }
    return new Map(canonicalKeys.map(key => [key, { ...registry.entries[key] }]));
  });
}

function ensure(key, options = {}) {
  const canonical = identityKey(key);
  if (!canonical) return null;
  return ensureMany([key], options).get(canonical) || null;
}

function find(key) {
  const canonical = identityKey(key);
  if (!canonical) return null;
  const registry = readRegistry();
  const entry = registry.entries?.[canonical];
  return entry ? { ...entry } : null;
}

function findById(id) {
  const wanted = Math.trunc(num(id));
  if (wanted < 1) return null;
  const registry = readRegistry();
  const entry = Object.values(registry.entries || {}).find(row => Math.trunc(num(row?.id)) === wanted);
  return entry ? { ...entry } : null;
}

function requireIdentity(key, options = {}) {
  const entry = ensure(key, { source: options.source || 'STRICT_IDENTITY' });
  if (!entry || entry.id < 1 || entry.label === 'DNA #YOK') {
    throw new Error(`DNA kimliği üretilemedi: ${String(key || 'ANAHTAR_YOK')}`);
  }
  return entry;
}

function decorate(row = {}, key = row?.key, options = {}) {
  const entry = options.create === false ? find(key) : ensure(key, { source: options.source || 'DECORATE' });
  return entry ? { ...row, dnaId: entry.id, dnaLabel: entry.label, identityKey: entry.key } : { ...row, dnaId: null, dnaLabel: 'DNA #YOK', identityKey: identityKey(key) || '' };
}

function audit() {
  const registry = readRegistry({ refresh: true });
  return { ...validateRegistry(registry), count: registry.count, registryFile: REGISTRY_FILE, backupFile: BACKUP_FILE };
}

module.exports = {
  VERSION,
  REGISTRY_FILE,
  BACKUP_FILE,
  JOURNAL_FILE,
  identityKey,
  label,
  readRegistry,
  ensure,
  ensureMany,
  find,
  findById,
  requireIdentity,
  decorate,
  audit,
  validateRegistry
};
