'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6137-'));
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const exit = require('./74_st2_renko_exit_evolution.js');
assert(exit.SAFE_FLOOR_MIN() >= 0.40, 'eski K1 komisyon-güvenli taban sözleşmesi bozulmamalı');
assert.strictEqual(exit.EARLY_FLOOR_ARM_PROFIT_PCT(), 0.25);
assert.strictEqual(exit.EARLY_SAFE_FLOOR_MIN(), 0.20);
const pos = {
  sanalOrderId: 'V6137', sym: 'EARLYUSDT', yon: 'LONG', girisFiyati: 100, sl: 98.5,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.75 }
};
let r = exit.updateBrick(pos, 100.24);
assert.strictEqual(pos.sl, 98.5);
assert.strictEqual(r.active, false);
r = exit.updateBrick(pos, 100.25);
assert.strictEqual(pos.renkoEarlyEconomyFloorLocked, true);
assert(Math.abs(pos.sl - 100.20) < 1e-9);
assert.strictEqual(pos.renkoProfitFloorLocked, undefined);
r = exit.updateBrick(pos, 100.50);
assert.strictEqual(pos.renkoProfitFloorLocked, true);
assert(Math.abs(pos.sl - 100.40) < 1e-9);
r = exit.updateBrick(pos, 100.60);
assert.strictEqual(pos.renkoExitActivated, true);
assert(pos.sl >= 100.40);
console.log('✅ v6.13.5-R3 K0.5 early economy + K1 safe floor + K2 Renko coexistence passed');
