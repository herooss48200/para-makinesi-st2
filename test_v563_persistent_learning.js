'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v563-')); process.env.AGROS_DATA_DIR=dir;
for(const k of Object.keys(require.cache)) if(k.includes('73_st2_renko_entry_evolution')) delete require.cache[k];
const evo=require('./73_st2_renko_entry_evolution.js');
function pos(id,gap=false){return {id,sym:'BTCUSDT',yon:'LONG',girisFiyati:101,pozisyonDegeri:100,restartGap:gap,girisAnalizi:{entryStrategy:'ST2_RENKO',patternId:'P1',patternKodu:'RRGG',referansSeviye:100,renkoBoxSize:1,renkoEntryBrickDistance:.75,renkoSonTuglaDizisi:'RRGG'},execution:{pricePath:[{ts:1,price:100.8},{ts:2,price:101},{ts:3,price:101}]}}}
function result(){return {exitPrice:101,net:1,commission:0,outcome:'TP',closeTs:3}}
evo.write(evo.blank(),{allowEmpty:true}); fs.writeFileSync(evo.LEDGER_FILE,'');
let a=evo.close(pos('T1'),result()); assert(a&&a.closed===1,'ilk bilimsel kapanış kabul'); let s=evo.read(); assert.equal(Object.keys(s.profiles).length,1,'ilk Pattern'); assert.equal(s.health.ledgerRecords,1,'ledger first');
assert.equal(evo.close(pos('T1'),result()),null,'duplicate ret'); assert.equal(evo.read().health.duplicateRejects,1);
assert.equal(evo.close(pos('G1',true),result()),null,'GAP ret'); assert.equal(evo.read().health.restartGapRejects,1);
assert(fs.existsSync(evo.BACKUP_FILE),'bak oluşmalı'); const before=evo.read(); fs.writeFileSync(evo.STATE_FILE,'{broken'); for(const k of Object.keys(require.cache)) if(k.includes('73_st2_renko_entry_evolution')) delete require.cache[k]; const e2=require('./73_st2_renko_entry_evolution.js'); assert(Object.keys(e2.read().processedIds).length>=1,'bak recovery');
fs.writeFileSync(e2.STATE_FILE,'{broken'); fs.writeFileSync(e2.BACKUP_FILE,'{broken'); const rebuilt=e2.rebuildFromLedger(); assert.equal(Object.keys(rebuilt.processedIds).length,1,'ledger rebuild duplicate-safe');
assert.throws(()=>e2.write(e2.blank()),/EMPTY_STATE_OVERWRITE_BLOCKED/,'boş state doluyu ezemez');
const m=e2.summary().profiles[0].candidates; assert.equal(m.length,6); assert(m.some(x=>x.samples===1)); assert(m.some(x=>x.triggered===0),'tetiklenmeyen replay sahte sonuç üretmez');
const tel=e2.telegram(); assert(tel.includes('State')&&tel.includes('Ledger'));
const empty=e2.blank(); e2.write(empty,{allowEmpty:true}); fs.writeFileSync(e2.LEDGER_FILE,''); const t0=e2.telegram(); assert(t0.includes('Henüz doğrulanmış örnek yok'),'N0 decision chain');
console.log('✅ AGROS ST2 v5.6.3 persistent learning contract tests passed');
