'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
process.env.AGROS_DATA_DIR=path.join(__dirname,'.tmp-v560-final');
fs.rmSync(process.env.AGROS_DATA_DIR,{recursive:true,force:true}); fs.mkdirSync(process.env.AGROS_DATA_DIR,{recursive:true});
const ayarlar=require('./ayarlar.js');
ayarlar.renkoGirisVarsayilanTugla=0.75; ayarlar.renkoGirisIlkAtamaKapanis=3;
const evo=require('./73_st2_renko_entry_evolution.js');
assert.strictEqual(evo.DEFAULT_BRICK(),0.75);
assert.strictEqual(evo.activeFor('LONG','RRRR'),0.75);
const pos={sanal:true,sym:'FINALUSDT',yon:'LONG',girisFiyati:101.5,sl:99.9775,breakevenAktif:true,
  girisAnalizi:{entryStrategy:'ST2_RENKO',patternKodu:'RRRR',patternId:'L01',referansSeviye:100,renkoBoxSize:2,renkoEntryBrickDistance:0.75},
  labLifecycleProfile:{stopPct:1.5,beTriggerPct:0.4,beBufferPct:0.12},
  executionExitAssignment:{ready:false,algorithmId:'ACTUAL',label:'Mevcut kapanış'},
  execution:{pricePath:[{ts:1,price:101.5},{ts:2,price:102},{ts:3,price:103}]}};
evo.close(pos,{exitPrice:103,commission:0,restartGap:false,reason:'Sanal TP',closeTs:3});
const sum=evo.summary();
for(const k of ['entry','stop','be','exit']) assert(sum.decisionChain[k].assigned>=1,`${k} atanmadı`);
assert(sum.decisionChain.entry.applied>=1 && sum.decisionChain.stop.applied>=1 && sum.decisionChain.exit.applied>=1);
const text=evo.telegram();
assert(text.includes('Varsayılan 0.75'));
assert(text.includes('KARAR ZİNCİRİ'));
assert(text.includes('Aktif giriş dağılımı'));
const reportSource=fs.readFileSync(path.join(__dirname,'2_rapor.js'),'utf8');
assert(reportSource.includes('historicalOpened = learningOpened'));
assert(reportSource.includes('historicalClosed = learningClosed'));
const opsSource=fs.readFileSync(path.join(__dirname,'69_operation_intelligence_dashboard.js'),'utf8');
assert(opsSource.includes('✅${n(a.tp)}'));
console.log('✅ v5.6.0 ST2 final sprint passed | 0.75 default + historical bridge + league success + decision chain');
