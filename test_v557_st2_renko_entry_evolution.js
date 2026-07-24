'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tmp = path.join(__dirname, 'data', 'test-st2-entry-evolution.json');
process.env.AGROS_DATA_DIR = path.join(__dirname, 'data');
const ayarlar = require('./ayarlar.js');
ayarlar.renkoGirisIlkAtamaKapanis = 3;
ayarlar.renkoGirisYenidenHesaplamaAdimi = 5;
ayarlar.renkoGirisOtomatikAktiflestirme = true;
const evo = require('./73_st2_renko_entry_evolution.js');
try { fs.unlinkSync(evo.STATE_FILE); } catch {}
assert.deepStrictEqual(evo.CANDIDATES(), [0.25,0.5,0.75,1,1.25,1.5]);
assert.strictEqual(evo.activeFor('LONG','RGRR'), 0.25);
assert.strictEqual(evo.targetPrice({yon:'LONG',referansSeviye:100,renkoBoxSize:2},0.75),101.5);
assert.strictEqual(evo.targetPrice({yon:'SHORT',referansSeviye:100,renkoBoxSize:2},1.25),97.5);
function pos(exit){ return {
  sanal:true, sym:'TESTUSDT', yon:'LONG', girisFiyati:100.5, pozisyonDegeri:100,
  girisAnalizi:{entryStrategy:'ST2_RENKO',patternKodu:'RGRR',patternId:'L03',referansSeviye:100,renkoBoxSize:2,renkoEntryBrickDistance:0.25},
  execution:{pricePath:[{t:1,price:100.5},{t:2,price:101},{t:3,price:102},{t:4,price:103}]}
}; }
for (let i=0;i<3;i++) evo.close(pos(),{exitPrice:103,commission:0,restartGap:false});
const sum=evo.summary(); const p=sum.profiles.find(x=>x.key==='LONG|RGRR');
assert(p && p.closed===3);
assert.strictEqual(p.activeBrick,0.25,'En yüksek net, daha erken 0.25 girişte kalmalı');
assert(sum.policy.firstAssign===3 && sum.policy.recalcStep===5);
assert(evo.telegram().includes('İlk atama N3'));
try { fs.unlinkSync(evo.STATE_FILE); } catch {}
console.log('✅ v5.5.7 ST2 Renko Entry Evolution passed | 6 seviye, N3 ilk atama, her N5 yeniden hesaplama, güncel ağırlıklı hafıza');
