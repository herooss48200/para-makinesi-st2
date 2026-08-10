'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6109-'));
process.env.AGROS_DATA_DIR = tmp;

const ayarlar = require('./ayarlar.js');
ayarlar.renkoCikisCanliModu = 'SAFE_COMMISSION_BRICK_TRAIL';
ayarlar.renkoCikisAdayTugla = [0.50,0.75,1.00,1.25,1.50,1.75,2.00];
ayarlar.renkoCikisVarsayilanTugla = 1.00;
ayarlar.renkoCikisIlkAtamaKapanis = 5;
ayarlar.renkoCikisGuvenliKarTabaniYuzde = 0.15;
ayarlar.renkoCikisMinimumNetKarYuzde = 0.05;
ayarlar.sanalKomisyonOrani = 0.0005;
ayarlar.renkoCikisKarTabaniAktivasyonYuzde = 0.20;
ayarlar.renkoCikisCanliAktivasyonYuzde = 0.60;
ayarlar.stopTakipModu = 'KADEME';
ayarlar.tpAdimYuzdesi = 0.40;
ayarlar.breakevenTetikKademe = 2;
ayarlar.breakevenTetikYuzde = 0.60;

const exit = require('./74_st2_renko_exit_evolution.js');
const adaptive = require('./76_st2_adaptive_dna_entry.js');

function writeExitState(activeTrail, economyEligible=true, samples=12) {
  fs.mkdirSync(tmp,{recursive:true});
  fs.writeFileSync(exit.STATE_FILE, JSON.stringify({
    version: exit.VERSION,
    profiles: {
      'LONG|GGGG': {
        patternKey:'LONG|GGGG',
        closed:samples,
        activeTrail,
        brickEconomy:{economyEligible,samples,status:economyEligible?'NET_ECONOMY_BRICK_TRAIL_ACTIVE':'NET_ECONOMY_N5_BEKLENIYOR'}
      }
    },
    processedIds:{},
    health:{}
  }, null, 2));
}

function makePos(id, overrides={}) {
  return {
    sanalOrderId:id,
    sym:'TESTUSDT',
    yon:'LONG',
    girisFiyati:100,
    sl:98.5,
    breakevenAktif:false,
    korunanKarYuzdesi:0,
    acilisZamani:`2026-08-01T00:00:0${id.slice(-1)}Z`,
    girisAnalizi:{
      entryStrategy:'ST2_RENKO',
      patternKodu:'GGGG',
      renkoBoxSize:1,
      renkoEntryBrickDistance:0.75,
      entryDecisionBinding:{verified:true,selectedBrick:0.75,gateBrick:0.75,targetPrice:100.75}
    },
    ...overrides
  };
}

// 1) Frozen Entry decision gate: second select cannot change trigger brick.
const frozen = {
  sym:'TESTUSDT', yon:'LONG', patternKodu:'GGGG',
  adaptiveDnaEntryDecision:{brick:1.25,source:'TEST_FROZEN',reason:'TEST'}
};
const gate = adaptive.gateDecision(frozen,0.75);
assert.strictEqual(gate.brick,1.25,'Frozen Entry brick must be reused');
assert.strictEqual(gate.decision.decisionFrozen,true,'Gate must mark frozen decision');

// 2) Source contract: one trigger decision; motor cannot rewrite after trigger.
const entrySrc=fs.readFileSync(path.join(ROOT,'72_st2_renko_entry.js'),'utf8');
const motorSrc=fs.readFileSync(path.join(ROOT,'motor.js'),'utf8');
assert(entrySrc.includes('const adaptiveEntryDecision = pusu.adaptiveEntryDecisionAtSignal || aktifTuglaKarari(pusu);'));
assert(entrySrc.includes("entryModeDecision.selectedMode === 'CONFIRMED'"), 'CONFIRMED giriş modu ayrımı bulunmalı');
assert(entrySrc.includes('Number(confirmationGate?.targetPrice || 0)'), 'CONFIRMED hedefi kapanmış dönüş + offset kapısından gelmeli');
assert(entrySrc.includes('entryEvolution.targetPrice(pusu, selectedEntryBrick)'), 'DIRECT hedefi Entry Evolution üzerinden korunmalı');
assert(entrySrc.includes('entryDecisionBinding'));
assert(motorSrc.includes('[ENTRY_BINDING_ERROR]'));
assert(!motorSrc.includes('girisAnalizi.renkoEntryBrickDistance = gate.brick'));

// 3) Existing learned/persisted profile applies immediately: no five new trades wait.
writeExitState(1.25,true,12);
const p1=makePos('P1');
const a1=exit.assign(p1);
assert.strictEqual(a1.assignedTrailBricks,1.25);
assert.strictEqual(a1.positionSpecific,true);
assert(['V6109_POSITION_FROZEN','V6110_POSITION_FROZEN','V6111_POSITION_FROZEN'].includes(a1.assignmentSchema));
assert(a1.assignmentId.startsWith('RXT-'));
assert.strictEqual(a1.assignedActivationProfitPct,0.6,'canlÄ± aktivasyon doÄŸrudan %0.60 ayarÄ±ndan gelmeli; kademe/2 katÄ± uygulanmamalÄ±');

// 4) Every trade gets a unique, frozen assignment.
const p2=makePos('P2');
const a2=exit.assign(p2);
assert.strictEqual(a2.assignedTrailBricks,1.25);
assert.notStrictEqual(a1.assignmentId,a2.assignmentId);

// 5) Profile can evolve for future positions, but old/restarted position remains frozen.
const restarted=JSON.parse(JSON.stringify(p1));
writeExitState(0.50,true,20);
const oldAfterRestart=exit.assign(restarted);
assert.strictEqual(oldAfterRestart.assignedTrailBricks,1.25,'Open trade must retain frozen trail');
const p3=makePos('P3');
const a3=exit.assign(p3);
assert.strictEqual(a3.assignedTrailBricks,0.50,'New trade must receive current profile');

// 6) Exact live model replay: activation threshold + safe floor + round-trip commission.
const rows=[
  {price:100.20},{price:100.81},{price:100.90},{price:100.10}
];
const rr=exit.brickReplay(rows,'LONG',100,1,1.25,0.6,0.15,100.10);
assert.strictEqual(rr.activated,true);
assert.strictEqual(rr.exitReason,'COMMISSION_SAFE_FLOOR');
assert(Math.abs(rr.grossPct-0.15)<1e-9);
assert(Math.abs(rr.netPct-(0.15-exit.ROUND_TRIP_COMMISSION_PCT()))<1e-9);

// 7) Live activation requires current price to be commission-safe and stop never loosens.
const live=makePos('LIVE',{
  breakevenAktif:true,
  korunanKarYuzdesi:0.15,
  sl:100.05
});
exit.assign(live);
let low=exit.updateBrick(live,100.10);
assert.strictEqual(low.active,false);
assert.strictEqual(low.reason,'CURRENT_PRICE_BELOW_DIRECT_FLOOR_ARM_THRESHOLD');
let up=exit.updateBrick(live,100.90);
assert.strictEqual(up.active,true);
const stop1=live.sl;
exit.updateBrick(live,102.50);
const stop2=live.sl;
assert(stop2>=stop1,'LONG stop must only tighten');
exit.updateBrick(live,101.60);
assert.strictEqual(live.sl,stop2,'Retracement must not loosen stop');

// 8) Reporting and audit contracts separate live Renko from DNA shadow fallback.
const reportSrc=fs.readFileSync(path.join(ROOT,'2_rapor.js'),'utf8');
const evoSrc=fs.readFileSync(path.join(ROOT,'73_st2_renko_entry_evolution.js'),'utf8');
assert(reportSrc.includes('DNA Exit Replay (GÖLGE)'));
assert(reportSrc.includes('CANLI RENKO'));
assert(reportSrc.includes('| Hata ${replayKatman.takeoverAssignmentErrors}'));
assert(!reportSrc.includes('Aktif Pozisyonlarda Exit Replay: ${replayKatman.exitReady} | FALLBACK'));
assert(evoSrc.includes("assignedExit='RENKO_COMMISSION_SAFE_BRICK_TRAIL'"));
assert(evoSrc.includes("reason=applied?'RENKO_LIVE_APPLIED':'RENKO_NOT_ACTIVATED'"));

// 9) Assignment happens after identity is frozen for both virtual and real paths.
for (const marker of ['const renkoExitAtamasi = renkoExitEvolution.assign(yeniPozisyon);','const gercekRenkoExitAtamasi = renkoExitEvolution.assign(yeniPozisyon);']) {
  const idx=motorSrc.indexOf(marker);
  assert(idx>0,`${marker} missing`);
  const prior=motorSrc.lastIndexOf('identityChain.assertPrepared(yeniPozisyon);',idx);
  assert(prior>0&&prior<idx,'Exit assignment must follow identity binding');
}

// 10) Version and operation contract.
const version=require('./versiyon.js');
const op=require('./82_st2_operation_transparency.js');
assert(version.botSurumu.startsWith('6.13.5-R17-UNIFIED-LIVE-RECOVERY-FINAL'));
assert.strictEqual(op.VERSION,'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');
assert.strictEqual(exit.VERSION,'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');

fs.rmSync(tmp,{recursive:true,force:true});
console.log('âœ… v6.10.9 final Entry binding + position-frozen Exit trail + exact net-profit replay chain passed');
