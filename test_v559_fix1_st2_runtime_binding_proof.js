'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
process.env.AGROS_DATA_DIR=path.join(__dirname,'.tmp-v559-fix1-binding');
fs.rmSync(process.env.AGROS_DATA_DIR,{recursive:true,force:true});
fs.mkdirSync(process.env.AGROS_DATA_DIR,{recursive:true});
const source=fs.readFileSync(path.join(__dirname,'4_pozisyon.js'),'utf8');
assert(source.includes('renkoEntryEvolution.close(pos'), '4_pozisyon.js kapanış köprüsü eksik');
const evo=require('./73_st2_renko_entry_evolution.js');
// ST1 kapanışı ret telemetrisi üretmeli, profile oluşturmamalı.
evo.close({sym:'OLDUSDT',yon:'LONG',girisAnalizi:{entryStrategy:'ST1'}},{exitPrice:101});
let x=evo.summary();
assert.strictEqual(x.bridge.calls,1); assert.strictEqual(x.bridge.accepted,0); assert.strictEqual(x.bridge.skipped.NOT_ST2_RENKO,1); assert.strictEqual(x.total.closed,0);
// Gerçek ST2 kapanışı kabul edilip pattern/replay üretmeli.
const pos={sym:'TESTUSDT',yon:'LONG',girisFiyati:100.5,pozisyonDegeri:100,acilisZamani:1000,
 girisAnalizi:{entryStrategy:'ST2_RENKO',patternId:'L1',patternKodu:'RRGG',referansSeviye:100,renkoBoxSize:2,renkoEntryBrickDistance:0.25},
 execution:{pricePath:[{ts:1000,price:100.5},{ts:2000,price:101},{ts:3000,price:102}]}};
const out=evo.close(pos,{exitPrice:102,commission:0,closeTs:3000,restartGap:false});
assert(out&&out.closed===1);
x=evo.summary();
assert.strictEqual(x.bridge.calls,2); assert.strictEqual(x.bridge.accepted,1); assert.strictEqual(x.total.closed,1); assert.strictEqual(x.total.profiles,1);
const text=evo.telegram();
assert(text.includes('Kapanış köprüsü: Çağrı 2 | Kabul 1 | Ret 1'));
assert(text.includes('NOT_ST2_RENKO 1'));
console.log('✅ v5.5.9-fix.1 ST2 runtime binding proof passed | close bridge + skip telemetry + live replay');
