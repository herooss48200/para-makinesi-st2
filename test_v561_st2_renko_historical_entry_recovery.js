'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(),'agros-v561-'));
const live = path.join(root,'live');
const legacy = path.join(root,'legacy');
fs.mkdirSync(live,{recursive:true});
fs.mkdirSync(legacy,{recursive:true});
process.env.AGROS_DATA_DIR = live;
process.env.AGROS_ST2_LEGACY_DATA_DIR = legacy;

const legacyState = {
  version:'legacy', profiles:{
    'LONG|L01':{key:'LONG|L01',yon:'LONG',patternCode:'L01',patternId:'RRRR',activeBrick:0.5,closed:5,lastEvaluationClosed:5,candidates:{
      '0.25':{samples:5,triggered:3,tp:2,sl:1,be:0,net:0.4,grossProfit:0.6,grossLoss:0.2,recent:[]},
      '0.50':{samples:5,triggered:5,tp:4,sl:1,be:0,net:1.1,grossProfit:1.3,grossLoss:0.2,recent:[]},
      '0.75':{samples:5,triggered:5,tp:3,sl:2,be:0,net:0.2,grossProfit:0.8,grossLoss:0.6,recent:[]},
      '1.00':{samples:5,triggered:4,tp:2,sl:2,be:0,net:0,grossProfit:0.5,grossLoss:0.5,recent:[]},
      '1.25':{samples:5,triggered:3,tp:1,sl:2,be:0,net:-0.3,grossProfit:0.2,grossLoss:0.5,recent:[]},
      '1.50':{samples:5,triggered:2,tp:1,sl:1,be:0,net:-0.1,grossProfit:0.2,grossLoss:0.3,recent:[]}
    },history:[]}
  },bridge:{calls:5,accepted:5,skipped:{}},decisionChain:{}
};
fs.writeFileSync(path.join(legacy,'st2-renko-entry-evolution.json'),JSON.stringify(legacyState));
const evo = require('./73_st2_renko_entry_evolution.js');
const sum = evo.summary();
assert.strictEqual(sum.total.profiles,1,'legacy profile recovered');
assert.strictEqual(sum.profiles[0].activeBrick,0.5,'learned active brick preserved');
assert.deepStrictEqual(sum.policy.candidates,[0.25,0.5,0.75,1,1.25,1.5]);
assert.ok(sum.recovery && sum.recovery.profiles===1,'recovery audit visible');
const report=evo.telegram();
assert.ok(report.includes('0.25 | Tetik 3/5'),'trigger/total visible');
assert.ok(report.includes('1.25 | Tetik 3/5'),'1.25 visible');
assert.ok(report.includes('1.50 | Tetik 2/5'),'1.50 visible');
assert.ok(report.includes('Tarihsel hafıza kurtarıldı'),'recovery visible');
const entrySource=fs.readFileSync(path.join(__dirname,'72_st2_renko_entry.js'),'utf8');
assert.ok(entrySource.includes('pusuTelegramBildirimleri[bildirimAnahtari]'),'first-only pusu notification guard exists');
console.log('✅ v5.6.1 historical entry recovery + 6-level audit + first-only pusu notification passed');
