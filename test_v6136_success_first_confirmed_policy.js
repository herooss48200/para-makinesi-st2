'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');
const policyPath = path.join(__dirname, '90_st2_renko_entry_mode_policy.js');

function runCase(lifecycleProfiles) {
  delete require.cache[require.resolve(policyPath)];
  const originalLoad = Module._load;
  Module._load = function(req, parent, isMain) {
    if (req === './ayarlar.js' && parent?.filename?.endsWith('90_st2_renko_entry_mode_policy.js')) return {
      renkoGirisModuOtomatikAktif: true,
      renkoGirisModuMinTeyitOrnek: 15,
      renkoGirisModuMinOrnek: 20,
      renkoGirisModuMinBasariYuzde: 75,
      renkoGirisModuMinSkorFarki: 0,
      renkoGirisTeyitVarsayilanTugla: 0.25
    };
    if (req === './73_st2_renko_entry_evolution.js') return {
      DEFAULT_BRICK: () => 0.75,
      profileKey: (y,p) => `${y}|${p}`,
      summary: () => ({ profiles: [{ key:'LONG|RRRR', activeBrick:0.75, candidates:[{brick:0.75,triggered:80,pf:4.0,expectancy:0.25,net:20,wr:70}] }] })
    };
    if (req === './89_st2_renko_entry_confirmation_shadow_lab.js') return {
      summary: () => ({ lifecycle:{ profiles:lifecycleProfiles }}),
      findLatestReversal: () => ({found:true, confirmation:{close:100,closeTime:200}})
    };
    return originalLoad.call(this, req, parent, isMain);
  };
  try { return require(policyPath).select({yon:'LONG',patternKodu:'RRRR'}); }
  finally { Module._load = originalLoad; delete require.cache[require.resolve(policyPath)]; }
}

// DIRECT daha kârlı olsa bile CONFIRMED başarı oranı yüksek ve ekonomisi pozitifse seçilmelidir.
let d = runCase([
  {key:'LONG|RRRR|0.25T',triggered:20,pf:1.30,expectancy:0.01,net:0.20,wr:80},
  {key:'LONG|0.50T',triggered:70,pf:2.00,expectancy:0.05,net:3.50,wr:90}
]);
assert.strictEqual(d.selectedMode,'CONFIRMED');
assert.strictEqual(d.selectedOffsetT,0.25,'olgun exact-pattern başarı kanıtı öncelikli olmalı');
assert.strictEqual(d.confirmed.evidenceScope,'EXACT_PATTERN');
assert(d.direct.net > d.confirmed.net,'test DIRECT daha kârlı olacak şekilde kurulmalı');

// Exact pattern N küçükse olgun yön kanıtı kilitlenmemeli.
d = runCase([
  {key:'LONG|RRRR|0.25T',triggered:3,pf:99,expectancy:1,net:3,wr:100},
  {key:'LONG|0.50T',triggered:20,pf:1.40,expectancy:0.02,net:0.40,wr:85}
]);
assert.strictEqual(d.selectedMode,'CONFIRMED');
assert.strictEqual(d.selectedOffsetT,0.50);
assert.strictEqual(d.confirmed.evidenceScope,'DIRECTION_FALLBACK');

// Yüksek WR tek başına yetmez: ekonomi negatifse DIRECT güvenli fallback kalmalı.
d = runCase([
  {key:'LONG|RRRR|0.25T',triggered:20,pf:0.80,expectancy:-0.01,net:-0.20,wr:90}
]);
assert.strictEqual(d.selectedMode,'DIRECT');

console.log('✅ v6.13.6 success-first CONFIRMED policy + mature direction fallback passed');
