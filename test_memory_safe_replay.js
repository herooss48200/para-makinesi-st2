const fs = require('fs');
const path = require('path');
const engine = require('./47_dynamic_dna_exit_engine.js');

const replay = path.join(__dirname, 'data', 'exit-replay-results.jsonl');
const model = engine.MODEL_JSON;
const replayBackup = fs.existsSync(replay) ? fs.readFileSync(replay) : null;
const modelBackup = fs.existsSync(model) ? fs.readFileSync(model) : null;
fs.mkdirSync(path.dirname(replay), { recursive: true });

try {
  const fd = fs.openSync(replay, 'w');
  const pathRows = Array.from({ length: 2500 }, (_, i) => ({ ts: i, pnlPct: Math.sin(i / 20), stAligned: i % 2 === 0 }));
  for (let i = 0; i < 120; i++) {
    const row = {
      tradeId: `MEM-${i}`,
      input: {
        tradeId: `MEM-${i}`,
        signatureShort: `YON=${i % 2 ? 'SHORT' : 'LONG'}|BTC=0000|COIN=0000`,
        pathRows,
        mfePct: 1.2,
        maePct: -0.4
      },
      results: [
        { algorithmId: 'ACTUAL', algorithmLabel: 'Actual', netUsdt: -0.1, deltaVsActualUsdt: 0 },
        { algorithmId: 'TIME_20', algorithmLabel: '20 Dakika Exit', netUsdt: 0.2, deltaVsActualUsdt: 0.3 }
      ]
    };
    fs.writeSync(fd, JSON.stringify(row) + '\n');
  }
  fs.closeSync(fd);
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  const built = engine.buildFromReplayFile({ persist: false, minSamples: 5 });
  if (global.gc) global.gc();
  const deltaMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
  if (built.totalTrades !== 120) throw new Error(`Expected 120 trades, got ${built.totalTrades}`);
  if (!built.policy?.memorySafeReplay) throw new Error('Memory-safe policy marker missing');
  if (deltaMb > 120) throw new Error(`Unexpected retained heap growth: ${deltaMb.toFixed(1)} MB`);
  console.log(`✅ Memory-safe replay streaming test passed | Trades ${built.totalTrades} | Retained heap delta ${deltaMb.toFixed(1)} MB`);
} finally {
  if (replayBackup) fs.writeFileSync(replay, replayBackup); else fs.rmSync(replay, { force: true });
  if (modelBackup) fs.writeFileSync(model, modelBackup); else fs.rmSync(model, { force: true });
}
