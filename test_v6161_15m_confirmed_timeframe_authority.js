'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const policyPath = path.join(__dirname, '90_st2_renko_entry_mode_policy.js');
const originalLoad = Module._load;
Module._load = function(req, parent, isMain) {
  if (parent?.filename?.endsWith('90_st2_renko_entry_mode_policy.js')) {
    if (req === './ayarlar.js') return {
      renkoGirisModuOtomatikAktif:true,
      renkoGirisModuMinTeyitOrnek:15,
      renkoGirisModuMinOrnek:20,
      renkoGirisModuMinBasariYuzde:75,
      renkoGirisModuMinSkorFarki:0,
      renkoGirisTeyitVarsayilanTugla:0.25
    };
    if (req === './73_st2_renko_entry_evolution.js') return {
      DEFAULT_BRICK:()=>0.5,
      profileKey:(y,p)=>`${y}|${p}`,
      summary:()=>({profiles:[{key:'LONG|RRRR',activeBrick:0.5,candidates:[{brick:0.5,triggered:40,pf:1.5,expectancy:0.05,net:2,wr:65}]}]})
    };
    if (req === './89_st2_renko_entry_confirmation_shadow_lab.js') return {
      summary:()=>({lifecycle:{profiles:[{key:'LONG|RRRR|0.25T',triggered:30,pf:2,expectancy:0.1,net:3,wr:80}]}})
    };
  }
  return originalLoad.call(this, req, parent, isMain);
};

let policy;
try {
  delete require.cache[require.resolve(policyPath)];
  policy = require(policyPath);
} finally {
  Module._load = originalLoad;
}

const decision = {selectedMode:'CONFIRMED', selectedOffsetT:0.25};

// LONG: pusu kaynağı kapanmış RED; yalnız sonraki kapanmış 15m GREEN dönüşü geçerlidir.
let gate = policy.confirmationTarget(
  {yon:'LONG', sonKapaliTuglaZamani:1000, entryModeDecisionAtSignal:decision},
  [
    {id:1,color:'RED',open:100,close:98,closeTime:1000},
    {id:2,color:'GREEN',open:100,close:102,closeTime:2000}
  ],
  2,
  3000
);
assert.strictEqual(gate.ready,true);
assert.strictEqual(gate.timeframe,'15m');
assert.strictEqual(gate.reversal.pair,'RED->GREEN');
assert.strictEqual(gate.basePrice,102);
assert.strictEqual(gate.targetPrice,102.5);
assert(['READY_15M_CLOSED_FIRST_REVERSAL','READY_15M_CLOSED_REVERSAL_FROZEN'].includes(gate.reason));

// SHORT: kapanmış GREEN -> kapanmış RED; offset 15m box üzerinden aşağı ölçülür.
gate = policy.confirmationTarget(
  {yon:'SHORT', sonKapaliTuglaZamani:1000, entryModeDecisionAtSignal:decision},
  [
    {id:1,color:'GREEN',open:98,close:100,closeTime:1000},
    {id:2,color:'RED',open:98,close:96,closeTime:2000}
  ],
  2,
  3000
);
assert.strictEqual(gate.ready,true);
assert.strictEqual(gate.reversal.pair,'GREEN->RED');
assert.strictEqual(gate.basePrice,96);
assert.strictEqual(gate.targetPrice,95.5);

// Pusudan önceki 15m dönüş kesinlikle gerçek CONFIRMED yetkisi veremez.
gate = policy.confirmationTarget(
  {yon:'LONG', sonKapaliTuglaZamani:2500, entryModeDecisionAtSignal:decision},
  [
    {color:'RED',close:98,closeTime:1000},
    {color:'GREEN',close:100,closeTime:2000}
  ],
  2,
  3000
);
assert.strictEqual(gate.ready,false);
assert.strictEqual(gate.reason,'CLOSED_15M_REVERSAL_NOT_FOUND');

const entrySrc = fs.readFileSync(path.join(__dirname,'72_st2_renko_entry.js'),'utf8');
const policySrc = fs.readFileSync(policyPath,'utf8');
assert(entrySrc.includes("renkoEntryModePolicy.confirmationTarget(pusu, renkoBricks15mForMode, Number(store.boxSize?.[sym] || pusu.renkoBoxSize || 0))"), 'CONFIRMED gerçek target frozen 15m Renko+15m box kullanmalı');
assert(!entrySrc.includes('confirmationTarget(pusu, onayBricksForMode'), '1m Renko bricks gerçek CONFIRMED target otoritesi olmamalı');
assert(entrySrc.includes("15m kapanmış dönüş sonrası hesaplanacak"), 'Telegram pusu metni 15m dönüş gerçeğini göstermeli');
assert(entrySrc.includes("confirmed15mContextFrozen = true"), 'CONFIRMED pusu beklenen 15m dönüş patterni değiştirince iptal edilmemeli');
assert(entrySrc.includes("'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_1M_ST'"), 'entry timing authority 15m reversal + 1m ST olarak dondurulmalı');
assert(entrySrc.includes('const onayBricks1m = renkoSt?.bricks'), '1m confirmation lab shadow serisi korunmalı');
assert(entrySrc.includes("const stUygun = pusu.yon === 'LONG' ? renkoSt?.trend === 'UP' : renkoSt?.trend === 'DOWN';"), '1m Renko ST son sniper teyidi olarak kalmalı');
assert(policySrc.includes("findLatest15mReversalAfterSignal"), 'policy 15m kapalı dönüş bulucu içermeli');
assert(policySrc.includes("evidenceTimeframe: 'LEGACY_1M_SHADOW'"), 'eski 1m mode kanıtı 15m performansı gibi etiketlenmemeli');

console.log('✅ v6.13.5-R21 15m CONFIRMED timeframe authority passed | closed 15m reversal + 15m offset + 1m ST final sniper; 1m lab remains shadow');
