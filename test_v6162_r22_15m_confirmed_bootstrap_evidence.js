'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const policyPath = path.join(__dirname, '90_st2_renko_entry_mode_policy.js');

function runPolicyCase({confirmed, directComparable, legacy}) {
  delete require.cache[require.resolve(policyPath)];
  const originalLoad = Module._load;
  Module._load = function(req, parent, isMain) {
    if (parent?.filename?.endsWith('90_st2_renko_entry_mode_policy.js')) {
      if (req === './ayarlar.js') return {
        renkoGirisModuOtomatikAktif:true,
        renkoGirisModuMinTeyitOrnek:15,
        renkoGirisModuMinOrnek:20,
        renkoGirisModuMinBasariYuzde:75,
        renkoGirisModuMinWrAvantaj:2,
        renkoGirisModuMinExpAvantaj:0,
        renkoGiris15mBootstrapMaksAgirlik:30,
        renkoGirisTeyitVarsayilanTugla:0.25
      };
      if (req === './73_st2_renko_entry_evolution.js') return {
        DEFAULT_BRICK:()=>0.5,
        profileKey:(y,p)=>`${y}|${p}`,
        summary:()=>({profiles:[{key:'LONG|L01',activeBrick:0.5,candidates:[{brick:0.5,triggered:50,pf:1.6,expectancy:0.04,net:2,wr:68}]}]})
      };
      if (req === './89_st2_renko_entry_confirmation_shadow_lab.js') return {
        summary:()=>({lifecycle:{profiles:legacy || [{key:'LONG|L01|0.25T',triggered:95,pf:5,expectancy:0.06,net:5.8,wr:92.6}]}})
      };
      if (req === './94_st2_15m_confirmed_evidence.js') return {
        evidence:(mode)=> mode === 'CONFIRMED' ? ({mode:'CONFIRMED',offsetT:0.25,evidenceScope:'EXACT_PATTERN',evidenceTimeframe:'15M_CLOSED_RENKO_REVERSAL',bootstrap:{samples:confirmed?.samples||0},live:{samples:0},samples:0,wr:0,pf:0,expectancy:0,net:0,...(confirmed||{})})
          : ({mode:'DIRECT',offsetT:0.5,evidenceScope:'EXACT_PATTERN',evidenceTimeframe:'15M_STANDARDIZED_BOOTSTRAP_AND_LIVE',bootstrap:{samples:directComparable?.samples||0},live:{samples:0},samples:0,wr:0,pf:0,expectancy:0,net:0,...(directComparable||{})}),
        summary:()=>({bootstrap:{status:'READY'},bootstrapProfiles:2,liveProfiles:0,liveCloses:0})
      };
    }
    return originalLoad.call(this, req, parent, isMain);
  };
  try { return require(policyPath).select({yon:'LONG',patternKodu:'L01'}); }
  finally { Module._load = originalLoad; delete require.cache[require.resolve(policyPath)]; }
}

let d = runPolicyCase({
  confirmed:{samples:24,wr:82,pf:2.2,expectancy:0.08,net:1.92},
  directComparable:{samples:28,wr:74,pf:1.4,expectancy:0.03,net:0.84}
});
assert.strictEqual(d.selectedMode,'CONFIRMED','güçlü 15m bootstrap kanıtı CONFIRMED seçmeli');
assert.strictEqual(d.confirmed.evidenceTimeframe,'15M_CLOSED_RENKO_REVERSAL');
assert.strictEqual(d.decisionSource,'15M_CONFIRMED_BOOTSTRAP_LIVE_EVIDENCE');
assert(d.wrAdvantage >= 2 && d.expAdvantage >= 0);

// Legacy 1m N95 ne kadar güçlü olursa olsun 15m kanıt yoksa gerçek CONFIRMED seçemez.
d = runPolicyCase({
  confirmed:{samples:0,wr:0,pf:0,expectancy:0,net:0},
  directComparable:{samples:25,wr:70,pf:1.2,expectancy:0.02,net:0.5}
});
assert.strictEqual(d.selectedMode,'DIRECT','LEGACY_1M_SHADOW gerçek mode otoritesi olmamalı');
assert.strictEqual(d.legacy1mShadowHint.samples,95);
assert.strictEqual(d.legacy1mShadowHint.evidenceTimeframe,'LEGACY_1M_SHADOW');

// CONFIRMED mutlak olarak iyi olsa bile aynı standardize modelde DIRECT avantajı yoksa DIRECT kalır.
d = runPolicyCase({
  confirmed:{samples:25,wr:80,pf:2,expectancy:0.05,net:1.25},
  directComparable:{samples:25,wr:79,pf:2,expectancy:0.05,net:1.25}
});
assert.strictEqual(d.selectedMode,'DIRECT');
assert(String(d.reason).includes('AVANTAJ_YOK'));

// Trade process ağır global historical runtime'ı varsayılan olarak çalıştırmamalı.
const runtimeSrc = fs.readFileSync(path.join(__dirname,'79_st2_global_historical_runtime.js'),'utf8');
assert(runtimeSrc.includes("process.env.AGROS_ST2_GLOBAL_HISTORICAL_RUNTIME||'false'"),'global historical runtime default OFF olmalı');
assert(runtimeSrc.includes('Ağır reconciliation özeti ana bot process içinde çalıştırılmadı'),'train sonrası ağır reconciliation ana process içinde atlanmalı');

// Canlı evidence yalnız R21+ 15m timing CONFIRMED'ı gerçek 15m örneği sayar.
const tmp = path.join(__dirname, `.tmp-r22-evidence-${process.pid}-${Date.now()}`);
process.env.AGROS_DATA_DIR = tmp;
delete require.cache[require.resolve('./94_st2_15m_confirmed_evidence.js')];
const ev = require('./94_st2_15m_confirmed_evidence.js');
ev._resetForTest();
let r = ev.recordLiveClose({
  tradeId:'R22-LIVE-1', sym:'TESTUSDT', yon:'LONG',
  girisAnalizi:{entryStrategy:'ST2_RENKO',entryMode:'CONFIRMED',entryTimingAuthority:'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_1M_ST',patternKodu:'L01',entryModeOffsetT:0.25}
},{netPct:0.22,at:new Date().toISOString()});
assert.strictEqual(r.accepted,true);
r = ev.recordLiveClose({
  tradeId:'OLD-1M', sym:'OLDUSDT', yon:'LONG',
  girisAnalizi:{entryStrategy:'ST2_RENKO',entryMode:'CONFIRMED',entryTimingAuthority:'CLOSED_RENKO_REVERSAL_CONFIRMATION',patternKodu:'L01',entryModeOffsetT:0.25}
},{netPct:1});
assert.strictEqual(r.accepted,false);
assert.strictEqual(r.reason,'CONFIRMED_NOT_15M_AUTHORITY');
try { fs.rmSync(tmp,{recursive:true,force:true}); } catch (_) {}
delete process.env.AGROS_DATA_DIR;

console.log('✅ v6.13.5-R22 15m bootstrap+live evidence authority passed | legacy 1m diagnostic only | global historical runtime default OFF');
