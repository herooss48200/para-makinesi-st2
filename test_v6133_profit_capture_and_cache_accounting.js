'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6133-'));
process.env.AGROS_DATA_DIR = tmp;

const exit = require('./74_st2_renko_exit_evolution.js');

const pos = {
  sym: 'VANRYUSDT',
  yon: 'LONG',
  girisFiyati: 100,
  sl: 98.5,
  ilkSl: 98.5,
  sanal: true,
  acilisZamani: Date.now(),
  girisAnalizi: {
    entryStrategy: 'ST2_RENKO',
    patternKodu: 'L01',
    renkoBoxSize: 1
  },
  renkoExitAssignment: {
    assignmentId: 'RXT-V6133',
    patternKey: 'LONG|L01',
    assignedTrailBricks: 1.25,
    assignedActivationProfitPct: 0.60,
    assignedEarlyFloorArmProfitPct: 0.25,
    assignedEarlySafeFloorPct: 0.20,
    assignedEarlyMinimumNetProfitPct: 0.10,
    assignedFloorArmProfitPct: 0.50,
    assignedSafeFloorPct: 0.40,
    assignedMinimumNetProfitPct: 0.30,
    assignedTakeoverPct: 1.17,
    assignedCaptureRatio: 0.69,
    assignedAtrMultiplier: 2.86,
    assignedStopUpdateStepBricks: 1.00,
    renkoBoxAtOpen: 1,
    safetyPolicySchema: 'V6112_DIRECT_PROFIT_FLOOR',
    status: 'ASSIGNED'
  }
};

let r = exit.updateBrick(pos, 100.25);
assert.strictEqual(pos.renkoEarlyEconomyFloorLocked, true, 'erken ekonomi floor +%0.25 seviyesinde kilitlenmeli');
assert.strictEqual(pos.renkoProfitFloorLocked, undefined, 'K1 güçlü profit floor +%0.50 öncesi kilitlenmemeli');
assert(pos.sl >= 100.19, `erken ekonomi stopu beklenenden düşük: ${pos.sl}`);

r = exit.updateBrick(pos, 100.50);
assert.strictEqual(pos.renkoProfitFloorLocked, true, 'K1 profit floor +%0.50 seviyesinde kilitlenmeli');
assert(pos.sl >= 100.39, `K1 profit floor stopu beklenenden düşük: ${pos.sl}`);

r = exit.updateBrick(pos, 100.60);
assert.strictEqual(pos.renkoExitActivated, true, 'Renko trail +%0.60 seviyesinde aktive olmalı');
assert(pos.sl >= 100.39, 'aktivasyon K1 profit floor stopunu geriye çekmemeli');

r = exit.updateBrick(pos, 101.60);
const expectedCaptureStop = 100 * (1 + (1.60 * 0.69) / 100);
assert.strictEqual(r.active, true);
assert.strictEqual(r.source, 'MFE_KORUMA', `güçlü MFE sonrası kaynak MFE_KORUMA olmalı: ${r.source}`);
assert(pos.sl >= expectedCaptureStop - 1e-9, `MFE capture stopu uygulanmadı: ${pos.sl} < ${expectedCaptureStop}`);
assert(pos.sl > 100.40, 'stop güçlü MFE sonrasında yalnız K1 profit floor seviyesinde kalmamalı');

const frozen = pos.sl;
r = exit.updateBrick(pos, 101.20);
assert(pos.sl >= frozen - 1e-12, 'monoton stop koruması: geri çekilme stopu aşağı indirmemeli');

const reportSrc = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
const refreshSrc = fs.readFileSync(path.join(__dirname, 'revizyon.js'), 'utf8');
assert(reportSrc.includes('Math.min(secilen, Math.max(0, Number(veri.mumHazir || 0)))'), 'rapor cache payını paydaya clamp etmeli');
assert(reportSrc.includes('renko1mVeriHazir: Math.min(secilen'), '1m veri cache payını paydaya clamp etmeli');
assert(reportSrc.includes('1m Veri') && reportSrc.includes('1m Renko ST'), 'rapor ham 1m veri ile hesaplanabilir Renko ST sayısını ayırmalı');
assert(refreshSrc.includes('function cacheHazirSayisi(cache)') && refreshSrc.includes('filter(sym => aktif.has(String(sym))).length'), 'cache yalnız aktif ticaret evrenindeki sembolleri saymalı');

console.log('✅ v6.13.3 MFE capture ratchet + monotonic profit protection + active-universe cache accounting passed');
