const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-evolution-stream-'));
const file = path.join(dir, 'large-blackbox.jsonl');
const worker = path.join(dir, 'worker.js');
const modulePath = require.resolve('./38_dna_evolution_engine.js');

try {
  const fd = fs.openSync(file, 'w');
  try {
    const payload = 'x'.repeat(900 * 1024);
    for (let i = 0; i < 80; i++) {
      const direction = i % 2 ? 'LONG' : 'SHORT';
      const rec = {
        kayitTipi: 'KAPANIS',
        zaman: new Date(1700000000000 + i * 60000).toISOString(),
        symbol: `T${i}USDT`,
        sonuc: i % 3 === 0 ? 'SL' : 'TP',
        netKarZarar: i % 3 === 0 ? -0.8 : 0.4,
        acilis: { strategySignature: { key: `YON=${direction}|BTC=0001|COIN=0010`, yon: direction } },
        buyukAyrinti: payload
      };
      fs.writeSync(fd, JSON.stringify(rec) + '\n');
    }
  } finally {
    fs.closeSync(fd);
  }

  assert(fs.statSync(file).size > 64 * 1024 * 1024, 'Test file must exceed the child heap limit');
  fs.writeFileSync(worker, `
    const assert = require('assert');
    const evolution = require(${JSON.stringify(modulePath)});
    const loaded = evolution.loadTrades(process.argv[2]);
    assert.strictEqual(loaded.readMode, 'STREAMING_JSONL');
    assert.strictEqual(loaded.trades.length, 80);
    assert.strictEqual(loaded.invalidLines, 0);
    console.log('WORKER_OK', loaded.trades.length, loaded.readMode);
  `);

  const run = spawnSync(process.execPath, ['--max-old-space-size=64', worker, file], {
    encoding: 'utf8', timeout: 120000
  });
  assert.strictEqual(run.status, 0, `Low-heap worker failed:\n${run.stdout}\n${run.stderr}`);
  assert(run.stdout.includes('WORKER_OK 80 STREAMING_JSONL'));
  console.log(`✅ Memory-safe DNA Evolution streaming test passed | File ${(fs.statSync(file).size / 1048576).toFixed(1)} MB | Heap limit 64 MB`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
