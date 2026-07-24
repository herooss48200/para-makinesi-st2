'use strict';
const assert = require('assert');
const fs = require('fs');
process.env.AGROS_DATA_DIR = require('path').join(__dirname, 'data');
const ayarlar = require('./ayarlar.js');
ayarlar.renkoGirisIlkAtamaKapanis = 3;
ayarlar.renkoGirisYenidenHesaplamaAdimi = 5;
ayarlar.renkoGirisOtomatikAktiflestirme = true;
ayarlar.sabitStopYuzdesi = 1.5;
ayarlar.breakevenTetikYuzde = 0.4;
ayarlar.breakevenTamponYuzde = 0.12;
const evo = require('./73_st2_renko_entry_evolution.js');
try { fs.unlinkSync(evo.STATE_FILE); } catch {}
function pos(){ return {
  sanal:true, sym:'TESTUSDT', yon:'LONG', girisFiyati:100.5, pozisyonDegeri:100,
  girisAnalizi:{entryStrategy:'ST2_RENKO',patternKodu:'RGRR',patternId:'L03',referansSeviye:100,renkoBoxSize:2,renkoEntryBrickDistance:0.25},
  labLifecycleProfile:{stopPct:1.5,beTriggerPct:0.4,beBufferPct:0.12},
  executionExitAssignment:{ready:false,algorithmId:'ACTUAL',label:'Mevcut kapanış'},
  execution:{pricePath:[
    {ts:1000,price:100.5,pnlPct:0},
    {ts:2000,price:98.9,pnlPct:-1.592},
    {ts:3000,price:100.8,pnlPct:0.2985},
    {ts:4000,price:101.0,pnlPct:0.4975},
    {ts:5000,price:102.0,pnlPct:1.4925},
    {ts:6000,price:103.0,pnlPct:2.4876}
  ]}
}; }
const replay025=evo.replayCandidate(pos(),{exitPrice:103,commission:0,closeTs:6000},{yon:'LONG',referansSeviye:100,renkoBoxSize:2},0.25,pos().execution.pricePath.map(x=>({t:x.ts,p:x.price,atrPct:null,stTrend:null,stAligned:null})));
const replay050=evo.replayCandidate(pos(),{exitPrice:103,commission:0,closeTs:6000},{yon:'LONG',referansSeviye:100,renkoBoxSize:2},0.50,pos().execution.pricePath.map(x=>({t:x.ts,p:x.price,atrPct:null,stTrend:null,stAligned:null})));
assert.strictEqual(replay025.exitReason,'STOP');
assert(replay025.net < 0);
assert.strictEqual(replay050.triggered,true);
assert(replay050.net > 0);
for(let i=0;i<3;i++) evo.close(pos(),{exitPrice:103,commission:0,restartGap:false,closeTs:6000});
const p=evo.summary().profiles.find(x=>x.key==='LONG|RGRR');
assert(p && p.closed===3);
assert.strictEqual(p.activeBrick,0.5,'0.25 stop olurken 0.50 daha sonra tetiklenip kârlı olduğu için seçilmelidir');
assert.strictEqual(p.lastReplay.candidates['0.25'].exitReason,'STOP');
assert(p.lastReplay.candidates['0.50'].net>0);
try { fs.unlinkSync(evo.STATE_FILE); } catch {}
console.log('✅ v5.5.8 price-path replay passed | 0.25 STOP, 0.50 later trigger + positive result');
