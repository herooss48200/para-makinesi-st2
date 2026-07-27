'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const old = process.env.AGROS_DATA_DIR;
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v570-'));
delete require.cache[require.resolve('./75_st2_historical_renko_training.js')];
const t = require('./75_st2_historical_renko_training.js');

assert(/^v5\.8\.[01]-HISTORICAL-WINNING-INTELLIGENCE/.test(t.VERSION));
assert.deepStrictEqual(t.parseArgs(['--report']), { report: true });
assert.deepStrictEqual(t.parseArgs(['--reset','--symbols=BTCUSDT,ETHUSDT']), { reset: true, symbols: 'BTCUSDT,ETHUSDT' });
assert.deepStrictEqual(t.CANDIDATES, [0.25,0.5,0.75,1,1.25,1.5]);
const s = t.blank();
assert.strictEqual(s.mode, 'SHADOW');
assert.strictEqual(s.contract.writesLiveState, false);
assert.strictEqual(s.contract.changesTradeEngine, false);
assert.strictEqual(s.contract.autoPromotesPremier, false);

const long = { yon:'LONG', referenceLevel:100 };
const candles = [
 {openTime:1,closeTime:2,open:100,high:100.1,low:99.9,close:100},
 {openTime:3,closeTime:4,open:100,high:100.9,low:99.9,close:100.7}
];
const win = t.replayCandidate(candles, 0, long, 1, 0.25, {stopPct:1.5,tpPct:0.4,beTriggerPct:2,beBufferPct:0.12,roundTripFeePct:0.08,maxHoldBars:2});
assert.strictEqual(win.triggered, true);
assert.strictEqual(win.result, 'TP');
assert(Math.abs(win.pnlPct - 0.32) < 1e-9);

const metrics = {
 '0.25': {samples:40,triggered:40,tp:25,sl:10,be:5,unresolved:0,grossProfit:10,grossLoss:5,net:5,pnl:Array(40).fill(0.1)},
 '0.50': {samples:40,triggered:40,tp:30,sl:5,be:5,unresolved:0,grossProfit:12,grossLoss:2,net:10,pnl:Array(40).fill(0.25)}
};
assert.strictEqual(t.chooseBest(metrics, 30).distance, 0.5);
assert(t.report(s).includes('SHADOW'));
assert(t.report(s).includes('Canlı Trade Engine'));

const source = fs.readFileSync(path.join(__dirname, '75_st2_historical_renko_training.js'), 'utf8');
assert(source.includes("require('./72_st2_renko_core.js')"));
assert(!source.includes("require('./4_pozisyon.js')"));
assert(!source.includes('entryEvolution.close('));
console.log('✅ v5.8.0 historical Renko replay/offline training regression passed | SHADOW isolation + candidate replay + deterministic selection');
if (old === undefined) delete process.env.AGROS_DATA_DIR; else process.env.AGROS_DATA_DIR = old;
