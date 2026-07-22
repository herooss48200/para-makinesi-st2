const assert=require('assert');
const fs=require('fs');
const life=require('./68_lab_lifecycle_evolution.js');
assert.equal(life.MIN_SAMPLES(),50,'LAB Stop/BE minimum 50 olmalı');
assert(life.STOP_CANDIDATES().length>=4,'Stop adayları paralel olmalı');
assert(life.BE_CANDIDATES().length>=4,'BE adayları paralel olmalı');
assert.equal(life.simulateStop([{k:0},{k:-1.1},{k:.5}],1),-1,'Stop ilk ihlalde kapanmalı');
assert.equal(life.simulateBe([{k:0},{k:.5},{k:.1}],.4,.12,1),.12,'BE tetik ve tamponu öğrenilebilir olmalı');
const c={};for(let i=0;i<50;i++){c.samples=(c.samples||0)+1;c.net=(c.net||0)+.1;c.grossProfit=(c.grossProfit||0)+.1;c.grossLoss=0}
const pick=life.champion({'1.00':c},'1.50');assert(pick.ready,'50 pozitif kapanışta aday hazır olmalı');
const src=fs.readFileSync('62_lab_premier_league.js','utf8');
assert(src.includes('const recentReady = false'),'Son-5 lig yolu kapalı olmalı');
assert(src.includes("league: 'EXPERIMENT', premierTrack: TRACK.REVERSE, upperLayerIncluded: false"),'Ters işlem Premier kasasına dahil olmamalı');
assert(src.includes('recent5PositiveAdmissionEnabled: false'),'Son-5 politikası kapalı olmalı');
console.log('✅ v5.3.0 FINAL PLUS | Son-5 removed + reverse separate ledger + LAB Stop/BE evolution passed');
