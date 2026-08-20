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
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r311-test-'));

const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const guard = require('./98_st2_final_direction_guard.js');
const versiyon = require('./versiyon.js');

assert.deepStrictEqual(ayarlar.renkoCanliKaynakPeriyotlari, ['15m'], 'real entry source must be 15m only');
assert(Number(ayarlar.renkoKaynakMumLimiti) >= 201 && Number(ayarlar.renkoKaynakMumLimiti) <= 320, '15m cache should cover EMA200 without R31 higher-TF bloat');
assert(Number(ayarlar.st2ExchangeReconcileFreshMs) >= 120000, 'reconciliation freshness must tolerate observed full-reconcile duration');
assert(versiyon.botSurumu.includes('15M-ONLY'));

function rows(start, step) {
  return Array.from({length:201}, (_,i)=>({ close: String(start + i*step) }));
}
h.state.yerelPusuHafizasi = {
  BTCUSDT: rows(100, 0.5),
  ETHUSDT: rows(50, 0.3)
};
delete h.state.st2FinalDirectionGuard;
let d = guard.evaluate({symbol:'TESTUSDT', side:'SHORT'});
assert.strictEqual(d.dataOk, true);
assert.strictEqual(d.btc.trend, 'UP');
assert.strictEqual(d.eth.trend, 'UP');
assert(d.btc.gap >= 1 && d.eth.gap >= 1);
assert.strictEqual(d.hardVeto, true, 'strong BTC+ETH UP must hard-veto SHORT');

d = guard.evaluate({symbol:'TESTUSDT', side:'LONG'});
assert.strictEqual(d.hardVeto, false, 'LONG is shadow-only');
assert.strictEqual(d.longShadowWouldVeto, false, 'BTC UP LONG should be shadow keep');

h.state.yerelPusuHafizasi.BTCUSDT = rows(200, -0.4);
d = guard.evaluate({symbol:'TESTUSDT', side:'LONG'});
assert.strictEqual(d.hardVeto, false);
assert.strictEqual(d.longShadowWouldVeto, true, 'BTC not UP LONG should only be shadow-veto evidence');

const execSource = fs.readFileSync('./85_st2_real_order_execution.js','utf8');
const motorSource = fs.readFileSync('./motor.js','utf8');
const closeSource = fs.readFileSync('./4_pozisyon.js','utf8');
const panelSource = fs.readFileSync('./2_rapor.js','utf8');
assert(execSource.includes("require('./98_st2_final_direction_guard.js')"));
assert(execSource.includes('ONUR_FINAL_SHORT_HARD_VETO'));
assert(execSource.indexOf('ONUR_FINAL_SHORT_HARD_VETO') < execSource.indexOf("status: 'SUBMITTED'"), 'guard must run before SUBMITTED/market order path');
assert(motorSource.includes("fill.vetoed === true && fill.reason === 'ONUR_FINAL_SHORT_HARD_VETO'"), 'caller must handle veto without rollback/error flow');
assert(motorSource.includes('telegramMesajGonderKritikTeslim'), 'real open must use critical Telegram delivery');
assert(closeSource.includes('telegramMesajGonderKritikTeslim'), 'real close must use critical Telegram delivery');
assert(closeSource.includes('GERCEK_KAPANIS_TELEGRAM_TESLIM_DOGRULANAMADI'), 'close report failure must be visible');
assert(panelSource.includes('Onur Guard: SHORT veto'));
assert(panelSource.includes('Kritik teslim'));

console.log('✅ R31.1 15m stable passed | 15m REAL + 1m confirm | Onur SHORT hard-veto before submit | LONG shadow | critical open/close Telegram | reconcile freshness hardened');
