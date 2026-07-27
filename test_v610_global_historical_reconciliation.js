'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v610-'));process.env.AGROS_DATA_DIR=tmp;
const hist=[];for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT'])for(let i=0;i<6;i++)hist.push({type:'HISTORICAL_SIGNAL',signalId:`${symbol}-${i}`,symbol,yon:'LONG',patternCode:'RRRR',candidates:{'0.25':{triggered:true,pnlPct:-0.1,mfePct:0.2,maePct:-0.3},'1.00':{triggered:true,pnlPct:0.3,mfePct:0.5,maePct:-0.1},'1.50':{triggered:false}}});
fs.writeFileSync(path.join(tmp,'st2-historical-training-ledger.jsonl'),hist.map(JSON.stringify).join('\n')+'\n');
const live=[];for(let i=0;i<4;i++){const side=i%2?'SHORT':'LONG',entry=100,exit=side==='LONG'?101:99;live.push({schema:1,type:'SCIENTIFIC_CLOSE',tradeId:`c${i}`,pos:{sym:'SOLUSDT',yon:side,girisFiyati:entry,girisAnalizi:{entryStrategy:'ST2_RENKO',patternKodu:side==='LONG'?'RRRR':'GGGG',referansSeviye:100,renkoBoxSize:1,renkoEntryBrickDistance:.75},pricePath:[100,101,99]},result:{exitPrice:exit,net:1}})}
fs.writeFileSync(path.join(tmp,'st2-renko-entry-evolution-ledger.jsonl'),live.map(JSON.stringify).join('\n')+'\n');
const evo=require('./73_st2_renko_entry_evolution.js');evo.rebuildFromLedger();
const x=require('./78_st2_global_historical_reconciliation.js');
assert.equal(x.COINS.length,30);assert.equal(new Set(x.SYMBOLS).size,30);
const hp=x.historicalProfiles();assert.equal(hp.rows,18);assert(hp.coins.SOL);assert(hp.global['LONG|RRRR']);
const d=x.sourceDecision('SOLUSDT','LONG','RRRR');assert.equal(d.source,'COIN:SOL');assert.equal(d.best.brick,1);
const s=x.summary();assert.equal(s.actual.all.n,4);assert.equal(s.reconciliation.directionN,4);assert.equal(s.reconciliation.patternN,4);assert.equal(s.reconciliation.duplicate,0);assert.equal(s.optimized.all.triggered+s.optimized.all.notTriggered,4);
assert(x.telegram().includes('BAZ İŞLEM EKONOMİSİ:'));assert(x.telegram().includes('OPTİMİZE REPLAY:'));assert(x.telegram().includes('Mutabakat'));
const before=JSON.stringify(x.summary());delete require.cache[require.resolve('./78_st2_global_historical_reconciliation.js')];const x2=require('./78_st2_global_historical_reconciliation.js');assert.equal(JSON.stringify(x2.summary()),before,'restart deterministik olmalı');
fs.appendFileSync(path.join(tmp,'st2-renko-entry-evolution-ledger.jsonl'),JSON.stringify(live[0])+'\n');assert.equal(x2.readJsonl(x2.LIVE_LEDGER,'SCIENTIFIC_CLOSE').length,4,'duplicate dışlanmalı');
console.log('✅ v6.1.0 global historical reconciliation passed');
