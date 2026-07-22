'use strict';
const assert = require('assert');
const { classifyEvidence, buildEvidenceGate, compactTelegram } = require('./67_real_order_preparation_intelligence');
assert.equal(classifyEvidence({samples:10,minSamples:30}).code, 'INSUFFICIENT_DATA');
assert.equal(classifyEvidence({samples:100,netUsdt:5,profitFactor:1.2,deltaUsdt:2,independentForward:false}).code, 'SHADOW_REQUIRED');
assert.equal(classifyEvidence({samples:100,netUsdt:5,profitFactor:1.2,deltaUsdt:2,independentForward:true}).code, 'READY');
assert.equal(classifyEvidence({samples:100,netUsdt:-1,profitFactor:.8,deltaUsdt:-2,independentForward:true}).code, 'REJECTED');
const report={
 stop:{recommendation:{candidateStopPct:1.2},candidates:[{stopPct:1.2,metrics:{samples:200,netUsdt:5,profitFactor:1.2},deltaVsActualUsdt:3}],actual:{netUsdt:0,profitFactor:1}},
 be:{recommendation:{bePlusPct:.12},candidates:[{targetPct:.12,reachable:40,metrics:{netUsdt:1,profitFactor:1.1},deltaVsActualUsdt:1}],beTrades:50,actual:{netUsdt:0}},
 exitEvolution:{samples:120,shadow:{netUsdt:4,profitFactor:1.1},actual:{profitFactor:.9},deltaUsdt:4,beatRatePct:55},
 premier:{groups:{RECENT5:{samples:25,netUsdt:-2,profitFactor:.7},HISTORICAL:{samples:30,netUsdt:4,profitFactor:1.2}},recent5Decision:'KEEP_AS_SEPARATE_SHADOW_POOL'},
 exit:{coreAlgorithms:27,assignedDistinctAlgorithms:19,unusedCoreAlgorithms:[],timeAssignedTrades:10,assignedTrades:20,timeAssignmentSharePct:50},
 sourceCounts:{replay:200,shadow:120,premier:55}
};
report.evidenceGate=buildEvidenceGate(report);
assert.equal(report.evidenceGate.stop.evidence.code,'SHADOW_REQUIRED');
assert.equal(report.evidenceGate.be.evidence.code,'SHADOW_REQUIRED');
assert.equal(report.evidenceGate.exitEvolution.evidence.code,'READY');
assert.equal(report.evidenceGate.recent5.evidence.code,'REJECTED');
const text=compactTelegram(report);
assert(text.includes('KANIT KAPISI'));
assert(text.includes('Son-5'));
assert(text.length < 4000);
console.log('✅ v5.2.2 final evidence gate tests passed');
