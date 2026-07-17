const fs = require('fs');
const path = require('path');
const io = require('./53_memory_safe_io.js');
const selector = require('./43_dna_exit_selector.js');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const validation = path.join(dataDir, 'dna-exit-shadow-validation.jsonl');
const backup = fs.existsSync(validation) ? fs.readFileSync(validation) : null;
try {
  const fd = fs.openSync(validation, 'w');
  for (let i = 0; i < 20000; i++) {
    const row = { selectedAlgorithmId: i % 2 ? 'TIME_15M' : 'TIME_20M', selectedAlgorithmLabel: i % 2 ? '15 Dakika Exit' : '20 Dakika Exit', deltaVsActualUsdt: i % 3 ? 0.01 : -0.02, selectedNetUsdt: 0.02, actualNetUsdt: 0.01 };
    fs.writeSync(fd, JSON.stringify(row) + '\n');
  }
  fs.closeSync(fd);
  const before = process.memoryUsage().heapUsed;
  const model = selector.buildValidationModel();
  if (model.totalValidated !== 20000) throw new Error(`Expected 20000 rows, got ${model.totalValidated}`);
  if (model.algorithms.length !== 2) throw new Error('Expected two algorithm buckets');
  const tail = io.readJsonlTailSync(validation, 25);
  if (tail.length !== 25) throw new Error(`Expected tail 25, got ${tail.length}`);
  const delta = (process.memoryUsage().heapUsed - before) / 1048576;
  if (delta > 80) throw new Error(`Unexpected retained heap delta ${delta.toFixed(1)} MB`);
  console.log(`✅ Memory-safe reporting test passed | Rows ${model.totalValidated} | Tail ${tail.length} | Heap delta ${delta.toFixed(1)} MB`);
} finally {
  if (backup) fs.writeFileSync(validation, backup); else if (fs.existsSync(validation)) fs.unlinkSync(validation);
}
