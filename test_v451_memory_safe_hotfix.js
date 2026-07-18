const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const health = require('./54_exit_health_check.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v451-'));
const file = path.join(dir, 'replay.jsonl');
const sample = {
  input: { pathRows: [{ atrPct: 1.2 }] },
  results: [
    { algorithmId: 'ACTUAL', netUsdt: 0 },
    { algorithmId: health.catalog()[0].id, netUsdt: 1, deltaVsActualUsdt: 1, dataAvailable: true, modelTriggered: true }
  ]
};
const fd = fs.openSync(file, 'w');
for (let i = 0; i < 5000; i++) fs.writeSync(fd, JSON.stringify(sample) + '\n');
fs.closeSync(fd);
const before = process.memoryUsage().heapUsed;
const model = health.build(file);
const after = process.memoryUsage().heapUsed;
assert.equal(model.trades, 5000);
assert.equal(model.invalid, 0);
assert.ok(after - before < 80 * 1024 * 1024, `heap growth too high: ${after-before}`);
console.log('✅ AGROS v4.5.1 memory-safe Exit Health hotfix test passed');
