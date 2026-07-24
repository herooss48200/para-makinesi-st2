'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
process.env.AGROS_DATA_DIR=path.join(__dirname,'.tmp-v559-fix2');
fs.rmSync(process.env.AGROS_DATA_DIR,{recursive:true,force:true});
const ayarlar=require('./ayarlar.js');
ayarlar.renkoGirisOgrenmeAktif=true;
const evo=require('./73_st2_renko_entry_evolution.js');
const pos={
  sym:'TESTUSDT',yon:'LONG',entryStrategy:'ST2_RENKO',girisFiyati:100,pozisyonDegeri:50,
  patternId:'L1',patternKodu:'RRGG',referansSeviye:100,renkoBoxSize:2,renkoEntryBrickDistance:0.25,
  execution:{pricePath:[{ts:1,price:100},{ts:2,price:101},{ts:3,price:102}]}
};
const out=evo.close(pos,{exitPrice:102,commission:0,closeTs:3});
assert(out,'üst seviye ST2 kimliği kapanışta kabul edilmeliydi');
const x=evo.summary();
assert.strictEqual(x.bridge.calls,1);
assert.strictEqual(x.bridge.accepted,1);
assert.strictEqual(x.total.closed,1);
assert.strictEqual(pos.girisAnalizi.entryStrategy,'ST2_RENKO');
assert.strictEqual(pos.girisAnalizi.patternKodu,'RRGG');
fs.rmSync(process.env.AGROS_DATA_DIR,{recursive:true,force:true});
console.log('✅ ST2 Renko identity close binding test passed');
