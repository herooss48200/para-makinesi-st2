'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tmp = path.join(__dirname, '.tmp-v639-observability');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
process.env.AGROS_DATA_DIR = tmp;
const evo = require('./74_st2_renko_exit_evolution.js');

const pos = {
  sym: 'TESTUSDT', yon: 'LONG', girisFiyati: 100, sl: 99,
  breakevenAktif: true, korunanKarYuzdesi: 0.12,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.25 }
};
evo.assign(pos);
const first = evo.update(pos, 102);
assert.strictEqual(first.active, true);
assert.strictEqual(pos.renkoExitActivated, true);
assert.ok(['RENKO_TAKIP','MFE_KORUMA','ILK_KAR_KORUMA','MEVCUT_STOP'].includes(first.source));
assert.ok(pos.renkoExitLastStopSourceLabel);
const report = evo.telegram([pos]);
assert.ok(report.includes('RENKO KÂR TAKİP STOPU EVRİMİ'));
assert.ok(report.includes('Takip profili atanmış'));
assert.ok(report.includes('Stop kaynağı'));
assert.ok(!report.includes('Exit atanan'));
console.log('✅ AGROS ST2 v6.3.9 Renko profit trail observability test passed');
