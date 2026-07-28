'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.AGROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v638-'));
const ayarlar = require('./ayarlar.js');
ayarlar.renkoCikisVarsayilanTugla = 1.00;
ayarlar.renkoCikisMfeKorumaTetikYuzde = 0.40;
ayarlar.renkoCikisMinMfeKorumaOrani = 0.60;
const renko = require('./74_st2_renko_exit_evolution.js');

function pos(yon) {
  return {
    sym: 'TESTUSDT', yon, girisFiyati: 100,
    sl: yon === 'LONG' ? 100.12 : 99.88,
    breakevenAktif: true, korunanKarYuzdesi: 0.12,
    girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGG', renkoBoxSize: 1.00 }
  };
}

const long = pos('LONG');
let r = renko.update(long, 100.561);
assert.strictEqual(r.active, true);
assert.ok(long.sl >= 100.3365 && long.sl <= 100.3370, `LONG MFE tabanı yanlış: ${long.sl}`);
assert.ok(r.peakProfitPct > 0.56 && r.peakProfitPct < 0.562);

const short = pos('SHORT');
r = renko.update(short, 99.439);
assert.strictEqual(r.active, true);
assert.ok(short.sl <= 99.6635 && short.sl >= 99.6630, `SHORT MFE tabanı yanlış: ${short.sl}`);

const low = pos('LONG');
r = renko.update(low, 100.30);
assert.strictEqual(r.mfeFloor, null);
assert.strictEqual(low.sl, 100.12, 'Tetik altındaki küçük MFE eski güvenli stopu değiştirmemeli');

const reportSource = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
assert.ok(!reportSource.includes("kademe === 1 ? ' koruma aktif'"), 'K1 yanlış koruma etiketi kalmış');
assert.ok(reportSource.includes("Renko yönetimi"));
assert.ok(reportSource.includes("Koruma bekliyor"));

console.log('✅ AGROS ST2 v6.3.8 profit capture reconciliation test passed');
