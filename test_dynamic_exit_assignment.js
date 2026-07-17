const assert = require('assert');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');

assert.strictEqual(dynamicExit.normalizeDnaKey('L_B0001_C0000_ORTA_ALT'), 'YON=LONG|BTC=0001|COIN=0000|DETAIL=ORTA_ALT');
assert.strictEqual(dynamicExit.baseDnaKey('L_B0001_C0000_ORTA_ALT'), 'YON=LONG|BTC=0001|COIN=0000');
assert.strictEqual(dynamicExit.baseDnaKey('YON=LONG|BTC=0001|COIN=0000|BB=ORTA_ALT'), 'YON=LONG|BTC=0001|COIN=0000');

const records=[];
for(let i=0;i<25;i++){
  records.push({
    input:{tradeId:`T${i}`,signatureShort:i%2?'L_B0001_C0000_ORTA_ALT':'L_B0001_C0000_ORTA',pathRows:[{ts:1,pnlPct:0},{ts:2,pnlPct:0.4}],mfePct:0.5,maePct:-0.1},
    results:[
      {algorithmId:'ACTUAL',algorithmLabel:'Mevcut Kademe Sistemi',netUsdt:-0.10,deltaVsActualUsdt:0},
      {algorithmId:'TIME_20M',algorithmLabel:'20 Dakika Exit',netUsdt:0.20,deltaVsActualUsdt:0.30}
    ]
  });
}
const model=dynamicExit.build(records,{persist:false,minSamples:10});
assert.strictEqual(model.policy.singlePermanentExit,false);
assert.strictEqual(model.policy.reevaluateAtLeagueTransfer,true);
assert.strictEqual(model.policy.freezeOnlyOpenedPosition,true);
const base=model.dnaBase.find(x=>x.key==='YON=LONG|BTC=0001|COIN=0000');
assert(base, 'Temel DNA profili oluşturulmalı');
assert.strictEqual(base.allBest.algorithmId,'TIME_20M');
assert.strictEqual(base.allBest.samples,25);
const plan=dynamicExit.selectForPosition({sym:'TEST',yon:'LONG',blackboxAcilis:{strategySignature:{shortKey:'L_B0001_C0000_FARKLI_BB'}}},model);
assert.strictEqual(plan.ready,true);
assert.strictEqual(plan.selectedAlgorithmId,'TIME_20M');
assert(plan.selectionScope.includes('BASE_DNA'), 'Detay eşleşmezse temel DNA fallback kullanılmalı');
console.log('✅ Dynamic exit assignment tests passed.');
