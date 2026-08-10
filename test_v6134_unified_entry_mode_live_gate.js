'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(req, parent, isMain) {
  if (req === './ayarlar.js' && parent?.filename?.endsWith('90_st2_renko_entry_mode_policy.js')) return {
    renkoGirisModuOtomatikAktif: true,
    renkoGirisModuMinTeyitOrnek: 20,
    renkoGirisModuMinOrnek: 20,
    renkoGirisModuMinBasariYuzde: 70,
    renkoGirisModuMinSkorFarki: 0,
    renkoGirisTeyitVarsayilanTugla: 0.25
  };
  if (req === './73_st2_renko_entry_evolution.js') return {
    DEFAULT_BRICK: () => 0.25,
    profileKey: (y,p) => `${y}|${p}`,
    summary: () => ({ profiles: [{ key:'LONG|RRRR', activeBrick:0.25, candidates:[{brick:0.25,triggered:30,pf:1.1,expectancy:0.01,net:0.3,wr:55}] }] })
  };
  if (req === './89_st2_renko_entry_confirmation_shadow_lab.js') return {
    summary: () => ({ lifecycle:{ profiles:[
      {key:'LONG|RRRR|0.50T',triggered:40,pf:2.4,expectancy:0.12,net:4.8,wr:72},
      {key:'LONG|0.25T',triggered:100,pf:1.2,expectancy:0.02,net:2,wr:58}
    ]}}),
    findLatestReversal: () => ({found:true, confirmation:{close:100,closeTime:200}})
  };
  if (req === './94_st2_15m_confirmed_evidence.js') return {
    evidence: (mode) => mode === 'CONFIRMED'
      ? {mode:'CONFIRMED',offsetT:0.50,evidenceScope:'EXACT_PATTERN',samples:40,wr:82,pf:2.4,expectancy:0.12,net:4.8,bootstrap:{samples:40},live:{samples:0}}
      : {mode:'DIRECT',offsetT:0.25,evidenceScope:'EXACT_PATTERN',samples:40,wr:70,pf:1.4,expectancy:0.04,net:1.6,bootstrap:{samples:40},live:{samples:0}},
    summary:()=>({bootstrap:{status:'READY'}})
  };
  return originalLoad.call(this,req,parent,isMain);
};

try {
  const ayarlar = require('./ayarlar.js');
  assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon,10,'gerçek aktif pozisyon kapasitesi 10 olmalı');
  const policy = require('./90_st2_renko_entry_mode_policy.js');
  const decision = policy.select({yon:'LONG',patternKodu:'RRRR'});
  assert.strictEqual(decision.selectedMode,'CONFIRMED','olgun exact-pattern CONFIRMED kanıtı gerçek zamanlamayı devralmalı');
  assert.strictEqual(decision.selectedOffsetT,0.50,'CONFIRMED offset exact pattern profilinden seçilmeli');
  assert.strictEqual(decision.confirmed.evidenceScope,'EXACT_PATTERN');
  const target = policy.confirmationTarget({yon:'LONG',sonKapaliTuglaZamani:100,entryModeDecisionAtSignal:decision},[{color:'RED',close:98,closeTime:100},{color:'GREEN',close:100,closeTime:200}],2,300);
  assert.strictEqual(target.ready,true);
  assert.strictEqual(target.targetPrice,101);

  const entrySrc=fs.readFileSync(path.join(__dirname,'72_st2_renko_entry.js'),'utf8');
  const motorSrc=fs.readFileSync(path.join(__dirname,'motor.js'),'utf8');
  assert(entrySrc.includes("entryModeDecision.selectedMode === 'CONFIRMED'"),'CONFIRMED zamanlama gate zincirine bağlı değil');
  assert(entrySrc.includes("entryMode: entryModeDecision.selectedMode"),'seçilen mode pozisyona dondurulmuyor');
  assert(entrySrc.includes("entryTimingAuthority: entryModeDecision.selectedMode === 'CONFIRMED'"),'mode zamanlama otoritesi ayrımı yok');
  assert(motorSrc.includes('realExecution.reserveEntry'),'DIRECT ve CONFIRMED aynı gerçek emir rezervasyon zincirini kullanmalı');
  assert(!motorSrc.includes('confirmedRealExecution'),'ikinci gerçek emir motoru oluşturulmamalı');
  console.log('✅ v6.13.4 Entry Evolution mode+offset + exact-pattern CONFIRMED + single real entry gate passed');
} finally {
  Module._load = originalLoad;
}
