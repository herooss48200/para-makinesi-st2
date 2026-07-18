const assert=require('assert');
const audit=require('./57_exit_victory_audit.js');
const c=audit.coreCatalogSummary();
assert.strictEqual(c.coreExpected,27);
assert.ok(c.configured>=27);
const a=audit.activeAssignments([{sym:'TESTUSDT',yon:'LONG',sanal:true,exitPlanActiveForVirtual:true,exitPlanShadow:{ready:true,signature:'L_B0000_C0000_ORTA_ALT',selectedAlgorithmId:'TIME_15M',selectedAlgorithmLabel:'15 Dakika Exit',samples:12,beatRate:64,profitFactor:1.2}}]);
assert.strictEqual(a.length,1);assert.strictEqual(a[0].activeForVirtual,true);
console.log(`✅ v4.5.2 Exit Victory test passed | Core ${c.coreExpected} | Configured ${c.configured}`);
