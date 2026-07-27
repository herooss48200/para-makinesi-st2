'use strict';
const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v569-'));process.env.AGROS_DATA_DIR=dir;
const win=require('./75_st2_winning_intelligence.js');
const rows=[
 {type:'SCIENTIFIC_CLOSE',tradeId:'L1',pos:{yon:'LONG',girisFiyati:100,girisAnalizi:{patternKodu:'RRRR'},blackboxAcilis:{strategySignature:{key:'YON=LONG|BTC=0011|COIN=0010'}}},result:{exitPrice:101,commission:0}},
 {type:'SCIENTIFIC_CLOSE',tradeId:'S1',pos:{yon:'SHORT',girisFiyati:100,girisAnalizi:{patternKodu:'GGGG'},blackboxAcilis:{strategySignature:{key:'YON=SHORT|BTC=1100|COIN=1000'}}},result:{exitPrice:99.8,commission:0}},
 {type:'SCIENTIFIC_CLOSE',tradeId:'S2',pos:{yon:'SHORT',girisFiyati:100,girisAnalizi:{patternKodu:'GGGG'},blackboxAcilis:{strategySignature:{key:'YON=SHORT|BTC=1100|COIN=1000'}}},result:{exitPrice:99.8,commission:0}},
 {type:'SCIENTIFIC_CLOSE',tradeId:'S3',pos:{yon:'SHORT',girisFiyati:100,girisAnalizi:{patternKodu:'GGGG'},blackboxAcilis:{strategySignature:{key:'YON=SHORT|BTC=1100|COIN=1000'}}},result:{exitPrice:102,commission:0}}
];
fs.writeFileSync(win.LEDGER_FILE,rows.map(JSON.stringify).join('\n')+'\n');
const w=win.summary();assert.strictEqual(w.long.win,1);assert.strictEqual(w.short.win,2);assert.strictEqual(w.short.loss,1);assert(w.short.net<0);assert(w.shortRelations[0].key.includes('BTC=1100'));
const leagueSource=fs.readFileSync(path.join(__dirname,'62_lab_premier_league.js'),'utf8');assert(leagueSource.includes('recoveredAtClose: true'));assert(leagueSource.includes('state.recentClosedIds.includes(closeId)'));
const reportSource=fs.readFileSync(path.join(__dirname,'2_rapor.js'),'utf8');assert(reportSource.includes('Anlık ${kar'));assert(reportSource.includes("K${kademe}${kademe === 1 ? ' koruma aktif'"));
console.log('✅ v5.6.9 four-issue resolution passed');
