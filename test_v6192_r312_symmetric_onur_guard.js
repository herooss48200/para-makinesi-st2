'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain){
  if(request==='dotenv') return { config:()=>({}) };
  if(request==='binance-api-node') return { default:()=>({}) };
  return originalLoad.call(this, request, parent, isMain);
};
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r312-test-'));

const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const guard = require('./98_st2_final_direction_guard.js');
const versiyon = require('./versiyon.js');

assert.deepStrictEqual(ayarlar.renkoCanliKaynakPeriyotlari, ['15m']);
assert(/R31\.(2|3)/.test(versiyon.botSurumu));

function rows(start, step) {
  return Array.from({length:201}, (_,i)=>({ close: String(start + i*step) }));
}
function setMarket(btcStart, btcStep, ethStart, ethStep) {
  h.state.yerelPusuHafizasi = {
    BTCUSDT: rows(btcStart, btcStep),
    ETHUSDT: rows(ethStart, ethStep)
  };
}

delete h.state.st2FinalDirectionGuard;
setMarket(100, 0.5, 50, 0.3);
let d = guard.evaluate({symbol:'TESTUSDT', side:'SHORT'});
assert.strictEqual(d.hardVeto, true, 'strong BTC+ETH UP must hard-veto SHORT');
assert.strictEqual(d.reason, 'ONUR_FINAL_SHORT_HARD_VETO');
d = guard.evaluate({symbol:'TESTUSDT', side:'LONG'});
assert.strictEqual(d.hardVeto, false, 'strong UP must not veto LONG');

setMarket(300, -0.7, 180, -0.45);
d = guard.evaluate({symbol:'TESTUSDT', side:'LONG'});
assert.strictEqual(d.btc.trend, 'DOWN');
assert.strictEqual(d.eth.trend, 'DOWN');
assert(d.btc.gap >= 1 && d.eth.gap >= 1);
assert.strictEqual(d.hardVeto, true, 'strong BTC+ETH DOWN must hard-veto LONG');
assert.strictEqual(d.reason, 'ONUR_FINAL_LONG_HARD_VETO');
d = guard.evaluate({symbol:'TESTUSDT', side:'SHORT'});
assert.strictEqual(d.hardVeto, false, 'strong DOWN must not veto SHORT');

h.state.yerelPusuHafizasi = { BTCUSDT: rows(100, 0.5), ETHUSDT: [] };
d = guard.evaluate({symbol:'TESTUSDT', side:'LONG'});
assert.strictEqual(d.dataOk, false);
assert.strictEqual(d.hardVeto, false, 'missing market data must fail-open');
assert.strictEqual(d.reason, 'ONUR_FINAL_GUARD_DATA_FAIL_OPEN');

const execSource = fs.readFileSync('./85_st2_real_order_execution.js','utf8');
const motorSource = fs.readFileSync('./motor.js','utf8');
const panelSource = fs.readFileSync('./2_rapor.js','utf8');
assert(execSource.includes('guard.reason'));
assert(execSource.indexOf('guard.hardVeto === true') < execSource.indexOf("status: 'SUBMITTED'"), 'guard must run before SUBMITTED/market order path');
assert(motorSource.includes("'ONUR_FINAL_LONG_HARD_VETO'"), 'caller must handle LONG veto without rollback/error flow');
assert(motorSource.includes("'ONUR_FINAL_SHORT_HARD_VETO'"), 'caller must handle SHORT veto without rollback/error flow');
assert(panelSource.includes('LONG veto'));
assert(panelSource.includes('SHORT veto'));

const snap = guard.snapshot();
assert.strictEqual(snap.shortVeto, 1);
assert.strictEqual(snap.longVeto, 1);
assert.strictEqual(snap.dataMissing, 1);

console.log('✅ R31.2 symmetric Onur guard passed | strong UP=>SHORT veto | strong DOWN=>LONG veto | missing data fail-open | veto before MARKET submit');
