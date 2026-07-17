const assert=require('assert');
const executor=require('./51_sanal_dynamic_exit_executor.js');
const ayarlar=require('./ayarlar.js');
ayarlar.sanalDynamicExitAktif=true;
const now=Date.now();
const pos={sanal:true,yon:'LONG',girisFiyati:100,acilisZamani:now-21*60000,
  executionExitAssignment:{ready:true,algorithmId:'TIME_20M',label:'20 Dakika Exit',assignmentId:'DNA|TIME_20M|TEST'},
  exitPlanShadow:{ready:true,selectedAlgorithmId:'TIME_20M',selectedAlgorithmLabel:'20 Dakika Exit'}};
const r=executor.evaluate(pos,101);
assert.equal(r.active,true);assert.equal(r.close,true);assert.equal(r.algorithmId,'TIME_20M');assert.equal(r.assignmentId,'DNA|TIME_20M|TEST');
const mismatch={...pos,dynamicExitRuntime:undefined,executionExitAssignment:{...pos.executionExitAssignment,algorithmId:'TIME_15M'}};
const m=executor.evaluate(mismatch,101);
assert.equal(m.fallback,true);assert.ok(String(m.reason).startsWith('EXIT_PLAN_MISMATCH_'));
const fallback={sanal:true,yon:'LONG',girisFiyati:100,acilisZamani:now,executionExitAssignment:{ready:false,algorithmId:'ACTUAL',label:'Mevcut Kademe Sistemi'}};
const f=executor.evaluate(fallback,100);assert.equal(f.active,false);assert.equal(f.reason,'KANITLI_EXIT_YOK');
console.log('✅ Exit decision trace tests passed');
