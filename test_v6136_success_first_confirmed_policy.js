'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');
const policyPath = path.join(__dirname, '90_st2_renko_entry_mode_policy.js');

function runCase({ forceConfirmed = true, evidence = {}, legacyProfiles = [] } = {}) {
  delete require.cache[require.resolve(policyPath)];
  const originalLoad = Module._load;
  Module._load = function(req, parent, isMain) {
    if (req === './ayarlar.js' && parent?.filename?.endsWith('90_st2_renko_entry_mode_policy.js')) return {
      renkoGirisModuOtomatikAktif: true,
      renkoGirisModuZorlaConfirmed: forceConfirmed,
      renkoGirisModuMinTeyitOrnek: 15,
      renkoGirisModuMinOrnek: 20,
      renkoGirisModuMinBasariYuzde: 75,
      renkoGirisModuMinWrAvantaj: 2,
      renkoGirisModuMinExpAvantaj: 0,
      renkoGiris15mBootstrapMaksAgirlik: 30,
      renkoGiris15mShadowMaksAgirlik: 60,
      renkoGirisTeyitVarsayilanTugla: 0.25
    };
    if (req === './73_st2_renko_entry_evolution.js') return {
      DEFAULT_BRICK: () => 0.75,
      profileKey: (y,p) => `${y}|${p}`,
      summary: () => ({ profiles: [{ key:'LONG|RRRR', activeBrick:0.75, candidates:[{brick:0.75,triggered:80,pf:4.0,expectancy:0.25,net:20,wr:70}] }] })
    };
    if (req === './89_st2_renko_entry_confirmation_shadow_lab.js') return {
      summary: () => ({ lifecycle:{ profiles:legacyProfiles }})
    };
    if (req === './94_st2_15m_confirmed_evidence.js') return {
      evidence: (mode) => {
        if (mode === 'CONFIRMED') return {
          mode, offsetT: evidence.confirmedOffsetT ?? 0.50,
          samples: evidence.confirmedSamples ?? 0,
          wr: evidence.confirmedWr ?? 0,
          pf: evidence.confirmedPf ?? 0,
          expectancy: evidence.confirmedExpectancy ?? 0,
          net: evidence.confirmedNet ?? 0,
          live: {samples:0}, shadow:{samples:0}, bootstrap:{samples:evidence.confirmedSamples ?? 0}
        };
        return {
          mode, offsetT: 0.75,
          samples: evidence.directSamples ?? 30,
          wr: evidence.directWr ?? 70,
          pf: evidence.directPf ?? 2,
          expectancy: evidence.directExpectancy ?? 0.10,
          net: evidence.directNet ?? 3,
          live:{samples:0}, shadow:{samples:0}, bootstrap:{samples:evidence.directSamples ?? 30}
        };
      },
      summary: () => ({})
    };
    return originalLoad.call(this, req, parent, isMain);
  };
  try { return require(policyPath).select({yon:'LONG',patternKodu:'RRRR'}); }
  finally { Module._load = originalLoad; delete require.cache[require.resolve(policyPath)]; }
}

// R23.1: gerçek giriş force-confirmed ise 15m kanıt henüz olgun olmasa bile CONFIRMED fail-closed authority seçilir.
let d = runCase({ forceConfirmed:true, evidence:{confirmedOffsetT:0.50} });
assert.strictEqual(d.selectedMode,'CONFIRMED');
assert.strictEqual(d.selectedOffsetT,0.50);
assert.strictEqual(d.decisionSource,'FORCED_CONFIRMED_ALL_PATTERNS');
assert.strictEqual(d.timingAuthority,'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET');

// Legacy 1m shadow çok iyi görünse dahi gerçek offset authority olamaz; 15m kanıtın offset'i korunur.
d = runCase({
  forceConfirmed:true,
  evidence:{confirmedOffsetT:0.25},
  legacyProfiles:[{key:'LONG|RRRR|0.75T',triggered:100,pf:99,expectancy:2,net:200,wr:100}]
});
assert.strictEqual(d.selectedMode,'CONFIRMED');
assert.strictEqual(d.selectedOffsetT,0.25);
assert.strictEqual(d.confirmed.evidenceTimeframe,'15M_CLOSED_RENKO_REVERSAL');
assert.strictEqual(d.legacy1mShadowHint.evidenceTimeframe,'LEGACY_1M_SHADOW');

// Force kapatılırsa ekonomik 15m comparative guard hâlâ fail-closed DIRECT fallback yapabilmeli.
d = runCase({
  forceConfirmed:false,
  evidence:{confirmedOffsetT:0.50,confirmedSamples:20,confirmedWr:90,confirmedPf:0.8,confirmedExpectancy:-0.02,confirmedNet:-1}
});
assert.strictEqual(d.selectedMode,'DIRECT');

console.log('✅ v6.13.6 compatibility: R23.1 forced CONFIRMED + 15m authority + legacy 1m shadow isolation passed');
