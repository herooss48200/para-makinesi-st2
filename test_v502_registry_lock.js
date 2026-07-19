'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-registry-lock-'));
process.env.AGROS_DATA_DIR = dir;
const registry = require('./59_dna_identity_registry.js');
const lockFile = `${registry.REGISTRY_FILE}.lock`;

try {
  const key1 = 'YON=LONG|BTC=0001|COIN=0010';
  const first = registry.ensure(key1, { source: 'V502_TEST' });
  assert(first && first.id > 0);

  // Canlı süreç kilidi varken mevcut kimlik okuması yazma kilidine girmeden tamamlanmalı.
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, token: 'external-live-lock', at: new Date().toISOString() }));
  const fast = registry.ensure(key1, { source: 'V502_TEST' });
  assert.strictEqual(fast.id, first.id);
  fs.unlinkSync(lockFile);

  // Ölü PID kilidi otomatik temizlenmeli ve yeni kimlik üretilebilmeli.
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999999, token: 'dead-lock', at: new Date().toISOString() }));
  const second = registry.ensure('YON=SHORT|BTC=0010|COIN=0100', { source: 'V502_TEST' });
  assert(second && second.id > first.id);
  assert(!fs.existsSync(lockFile), 'stale lock was not cleaned');

  console.log('✅ v5.0.2 DNA registry lock passed | read fast-path + stale recovery + owner-safe release');
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}
