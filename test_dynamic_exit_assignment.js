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

const negativeRecords=[];
for(let i=0;i<5;i++){
  negativeRecords.push({
    input:{tradeId:`N${i}`,signatureShort:'L_B1111_C0000_NEGATIVE',pathRows:[{ts:1,pnlPct:0},{ts:2,pnlPct:-0.2}],mfePct:0.1,maePct:-0.5},
    results:[
      {algorithmId:'ACTUAL',algorithmLabel:'Mevcut Kademe Sistemi',netUsdt:-0.30,deltaVsActualUsdt:0},
      {algorithmId:'TIME_10M',algorithmLabel:'10 Dakika Exit',netUsdt:-0.10,deltaVsActualUsdt:0.20},
      {algorithmId:'TIME_20M',algorithmLabel:'20 Dakika Exit',netUsdt:-0.20,deltaVsActualUsdt:0.10}
    ]
  });
}
const negativeModel=dynamicExit.build(negativeRecords,{persist:false,minSamples:5});
const negativePlan=dynamicExit.selectForPosition({sym:'NEGTEST',yon:'LONG',blackboxAcilis:{strategySignature:{shortKey:'L_B1111_C0000_NEGATIVE'}}},negativeModel);
assert.strictEqual(negativePlan.ready,true, 'Pozitif exit olmasa da 5 örnekli göreceli en iyi exit atanmalı');
assert.strictEqual(negativePlan.selectedAlgorithmId,'TIME_10M');
assert.strictEqual(negativePlan.selectionQuality,'RELATIVE_BEST');
assert(negativePlan.selectionScope.includes('RELATIVE_BEST'));
console.log('✅ Relative-best negative exit fallback test passed.');
