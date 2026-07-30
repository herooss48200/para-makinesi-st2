'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'data', 'logs', 'logs-st2',
  '.tmp-debug', '.tmp-v650-mfe-capture', '.tmp-v660'
]);

function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.tmp-')) continue;
      out.push(...collect(path.join(dir, entry.name)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(path.join(dir, entry.name));
  }
  return out;
}

const files = collect(ROOT).sort();
if (!files.length) throw new Error('JavaScript dosyası bulunamadı');

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file: path.relative(ROOT, file), error: result.stderr || result.stdout });
}

if (failures.length) {
  for (const failure of failures) console.error(`❌ ${failure.file}\n${failure.error}`);
  process.exit(1);
}

console.log(`✅ v6.7.3 full source syntax passed | ${files.length} JavaScript dosyası`);
