'use strict';
const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v614-'));process.env.AGROS_DATA_DIR=tmp;
const symbols={};for(const s of ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','LINK','LTC','AVAX','DOT','BCH','TRX','ATOM','ETC','NEAR','APT','SUI','ARB','OP','FIL','INJ','SEI','TON','UNI','AAVE','FET','PEPE','WIF','HBAR'])symbols[s+'USDT']={signals:1};
fs.writeFileSync(path.join(tmp,'st2-historical-training.json'),JSON.stringify({symbols,profiles:{}}));
const ev=[];
for(let i=0;i<6;i++)ev.push({type:'HISTORICAL_SIGNAL',yon:'LONG',patternCode:'RRRR',context:{features:['BB=ALT','BBW=NORMAL','ATR=NORMAL','TREND20=UP','SESSION=ASYA','RENKO6=GRRRRR'],session:'ASYA',renko6:'GRRRRR'},candidates:{'0.50':{triggered:true,resolved:true,pnlPct:0.20},'1.00':{triggered:true,resolved:true,pnlPct:0.10}}});
for(let i=0;i<6;i++)ev.push({type:'HISTORICAL_SIGNAL',yon:'SHORT',patternCode:'GGGG',context:{features:['BB=UST','BBW=NORMAL','ATR=NORMAL','TREND20=DOWN','SESSION=ABD','RENKO6=RGGGGG'],session:'ABD',renko6:'RGGGGG'},candidates:{'0.50':{triggered:true,resolved:true,pnlPct:-0.20},'1.00':{triggered:true,resolved:true,pnlPct:-0.10}}});
fs.writeFileSync(path.join(tmp,'st2-historical-training-ledger.jsonl'),ev.map(JSON.stringify).join('\n')+'\n');
const a=require('./76_st2_adaptive_dna_entry.js');
const good={yon:'LONG',girisAnalizi:{entryStrategy:'ST2_RENKO',patternKodu:'RRRR',renkoSonTuglaDizisi:'GRRRRR',renkoBb:{zone:'ALT',widthRegime:'NORMAL'},atrRegime:'NORMAL',trend20:'UP',session:'ASYA'}};
let g=a.gateDecision(good,0.75);assert.equal(g.action,'ALLOW');assert.equal(g.brick,0.50);assert.equal(g.reason,'HISTORICAL_CONTEXT_WINNER');
const bad={yon:'SHORT',girisAnalizi:{entryStrategy:'ST2_RENKO',patternKodu:'GGGG',renkoSonTuglaDizisi:'RGGGGG',renkoBb:{zone:'UST',widthRegime:'NORMAL'},atrRegime:'NORMAL',trend20:'DOWN',session:'ABD'}};
g=a.gateDecision(bad,0.75);assert.equal(g.action,'BLOCK');assert.equal(g.reason,'HISTORICAL_CONTEXT_LOSER');
// same context last-3 live winner switches active entry
const c=a.contextFrom(good),key=a.dnaKey(c);const st=a.blank();st.dnaProfiles[key]={key,patternKey:a.patternKey(c),context:c,closes:[0,1,2].map(i=>({tradeId:'x'+i,candidates:{'0.50':{net:0.01,triggered:true},'1.00':{net:0.30,triggered:true}}})),changes:[]};a.save(st);
g=a.gateDecision(good,0.75);assert.equal(g.action,'ALLOW');assert.equal(g.brick,1.00);assert.equal(g.reason,'LIVE_LAST3_WINNER');
console.log('✅ v6.1.4 historical context entry gate passed | 30/30 + ALLOW/BLOCK + live N3 leader');
