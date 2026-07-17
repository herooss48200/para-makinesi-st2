const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ayarlar=require('./ayarlar.js');
const executor=require('./51_sanal_dynamic_exit_executor.js');
const scoreboard=require('./52_exit_method_scoreboard.js');
ayarlar.sanalDynamicExitAktif=true;
const now=Date.now();
const pos={sanal:true,yon:'LONG',girisFiyati:100,acilisZamani:now-60000,execution:{pricePath:[{ts:now,price:101,pnlPct:1,atrPct:0.2}]},exitPlanShadow:{ready:true,selectedAlgorithmId:'ATR_TRAIL_1_5X',selectedAlgorithmLabel:'ATR Trailing 1.5x'}};
let r=executor.evaluate(pos,101);assert.equal(r.active,true);assert.equal(r.close,false);
pos.execution.pricePath.push({ts:now+1000,price:100.6,pnlPct:0.6,atrPct:0.2});
r=executor.evaluate(pos,100.6);assert.equal(r.close,true);assert.equal(r.algorithmId,'ATR_TRAIL_1_5X');
const testFile=scoreboard.FILE;let backup=null;if(fs.existsSync(testFile))backup=fs.readFileSync(testFile);
try{if(fs.existsSync(testFile))fs.unlinkSync(testFile);scoreboard.open(pos);const s=scoreboard.close(pos,{outcome:'TP',net:0.25,commission:0.05});assert.equal(s.opened,1);assert.equal(s.closed,1);assert.equal(s.tp,1);assert.equal(s.success,100);assert.ok(scoreboard.telegramLine(s).includes('ATR Trailing 1.5x'));}finally{if(backup)fs.writeFileSync(testFile,backup);else if(fs.existsSync(testFile))fs.unlinkSync(testFile);}
console.log('✅ ATR live exit + method scoreboard tests passed');
