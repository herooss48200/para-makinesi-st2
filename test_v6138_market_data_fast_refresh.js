'use strict';
const assert = require('assert');
const fs = require('fs');

const revisionSource = fs.readFileSync('./revizyon.js','utf8');
const settingsSource = fs.readFileSync('./ayarlar.js','utf8');
const reportSource = fs.readFileSync('./2_rapor.js','utf8');
const entrySource = fs.readFileSync('./72_st2_renko_entry.js','utf8');

// R8 retires the R5 fast-refresh scheduler entirely.
for (const marker of ['marketBulkRefreshOwner','mumlariBirlestir','bulkAgOverrides','pusuDeltaMumLimiti','superTrendDeltaMumLimiti','BULK_BUSY','| fail-fast |']) {
  assert(!revisionSource.includes(marker), `R5 fast-refresh marker must be retired: ${marker}`);
}
assert(!settingsSource.includes('binanceBulkRefreshTimeoutMs'), 'R5 bulk transport override must be removed');
assert(!settingsSource.includes('binanceStartupTimeoutMs'), 'R5 startup transport override must be removed');
assert.strictEqual(Number(require('./ayarlar.js').binanceTopluVeriRetryMs), 90000, 'pre-R5 90s bulk retry cadence must be restored');

// Visibility improvements remain; they are not part of the scheduler regression.
assert(reportSource.includes('1m Veri ${veriSagligi.renko1mVeriHazir}'), '1m cache truth must remain visible');
assert(reportSource.includes('1m Renko ST ${veriSagligi.renko1mStHazir}'), 'computed 1m Renko ST truth must remain visible');
assert(entrySource.includes('onay1mRenkoHazir: audit.onay1mRenkoHazir'), 'Renko audit truth must remain published');

console.log('✅ v6.13.5-R8 fast-refresh retirement passed | R5 scheduler removed, visibility retained');
