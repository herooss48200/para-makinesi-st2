'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const old = process.env.AGROS_DATA_DIR;
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v580-'));
delete require.cache[require.resolve('./75_st2_historical_renko_training.js')];
const t = require('./75_st2_historical_renko_training.js');

assert(/^v5\.8\.[01]-HISTORICAL-WINNING-INTELLIGENCE/.test(t.VERSION));
assert.deepStrictEqual(t.parseArgs(['--report','--reset']), { report:true, reset:true });
const bb = { mid:100, upper:[110], lower:[90] };
assert.strictEqual(t.bbZone(94, bb), 'ORTA_ALT');
assert.strictEqual(t.bbZone(108, bb), 'ORTA_UST');

const candles = Array.from({length:25}, (_,i) => ({
  openTime: Date.UTC(2026,0,1,0,i*15), closeTime: Date.UTC(2026,0,1,0,i*15+14),
  open:100+i*0.1, high:100.3+i*0.1, low:99.8+i*0.1, close:100.1+i*0.1, volume:100+i
}));
const bricks = [
  {color:'RED'}, {color:'GREEN'}, {color:'GREEN'}, {color:'GREEN'}, {color:'GREEN'}, {color:'GREEN'}
];
const ctx = t.signalContext(candles, 24, {referenceLevel:102.5}, bricks, {mid:102,upper:[104],lower:[100]}, 0.4);
assert(ctx.features.some(x => x.startsWith('BB=')));
assert(ctx.features.some(x => x === 'RENKO6=RGGGGG'));
assert(ctx.features.some(x => x.startsWith('ATR=')));

const raw = {
  featureStats: {
    'BB=ORTA_UST': {n:40,wins:34,losses:6,be:0,net:8,grossProfit:12,grossLoss:4,mfeSum:30,maeSum:-12,durationBarsSum:160},
    'ATR=COK_YUKSEK': {n:35,wins:10,losses:25,be:0,net:-9,grossProfit:4,grossLoss:13,mfeSum:12,maeSum:-30,durationBarsSum:210}
  },
  pairStats: {
    'BB=ORTA_UST & TREND20=DOWN': {n:32,wins:29,losses:3,be:0,net:9,grossProfit:11,grossLoss:2,mfeSum:25,maeSum:-7,durationBarsSum:96}
  }
};
const intel = t.intelligenceForCandidate(raw, 20);
assert.strictEqual(intel.winning[0].feature, 'BB=ORTA_UST & TREND20=DOWN');
assert.strictEqual(intel.losing[0].feature, 'ATR=COK_YUKSEK');
assert(intel.winning[0].pf > 1);
assert(intel.losing[0].expectancy < 0);

const source = fs.readFileSync(path.join(__dirname, '75_st2_historical_renko_training.js'), 'utf8');
assert(source.includes("if (args.report)"));
assert(source.includes("args.reset ? blank() : load()"));
assert(source.includes('Kazandıran ortak koşullar'));
assert(!source.includes("require('./4_pozisyon.js')"));
console.log('✅ v5.8.0 winning intelligence tests passed | FIX.1 flags + context mining + explainable winners/losers');
if (old === undefined) delete process.env.AGROS_DATA_DIR; else process.env.AGROS_DATA_DIR = old;
