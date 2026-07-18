const assert=require('assert');
const fs=require('fs');
const path=require('path');
const dynamicExit=require('./47_dynamic_dna_exit_engine.js');
const candidate=(id,score=70)=>({algorithmId:id,algorithmLabel:id,samples:12,netUsdt:2,profitFactor:1.4,beatRate:60,score,weakening:false,windows:{5:{netUsdt:1,profitFactor:1.2,avgNetUsdt:0.1},20:{netUsdt:2}}});
const a=candidate('TIME_15',80),b=candidate('ATR_2',70);
const full={version:dynamicExit.VERSION,generatedAt:new Date().toISOString(),currentRegime:{key:'TREND_ALIGNED|VOL_HIGH',regime:'TREND_ALIGNED',regimeFamily:'TREND',volatility:'HIGH',window:30,distribution:{}},dna:[{key:'YON=LONG|BTC=1111|COIN=1111',regimes:{'TREND_ALIGNED|VOL_HIGH':{key:'TREND_ALIGNED|VOL_HIGH',family:'TREND',regime:'TREND_ALIGNED',volatility:'HIGH',best:a,algorithms:[a,b]}},allBest:a,allAlgorithms:[a,b]}],dnaBase:[]};
const runtime=dynamicExit.createRuntimeModel(full);
assert.strictEqual(runtime.dna.length,1);
assert.strictEqual(runtime.dna[0].regimes['TREND_ALIGNED|VOL_HIGH'].best.algorithmId,'TIME_15');
assert(runtime.dna[0].regimes['TREND_ALIGNED|VOL_HIGH'].algorithms.length<=2);
const old=fs.existsSync(dynamicExit.RUNTIME_MODEL_JSON)?fs.readFileSync(dynamicExit.RUNTIME_MODEL_JSON):null;
try{dynamicExit.writeRuntimeModel(full);const loaded=dynamicExit.readModel();assert.strictEqual(loaded.policy.runtimeIndex,true);const plan=dynamicExit.selectForPosition({sanal:true,yon:'LONG',blackboxAcilis:{strategySignature:{shortKey:'YON=LONG|BTC=1111|COIN=1111'}},marketRegime:full.currentRegime},loaded,{persistDecision:false});assert.strictEqual(plan.selectedAlgorithmId,'TIME_15');assert.strictEqual(plan.ready,true);}finally{if(old)fs.writeFileSync(dynamicExit.RUNTIME_MODEL_JSON,old);else if(fs.existsSync(dynamicExit.RUNTIME_MODEL_JSON))fs.unlinkSync(dynamicExit.RUNTIME_MODEL_JSON);}
console.log('✅ v4.5.8 compact exit runtime index test passed.');
