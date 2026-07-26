'use strict';
const assert=require('assert');
const fs=require('fs');
const renko=require('./74_st2_renko_exit_evolution.js');

const src=fs.readFileSync('./motor.js','utf8');
function extract(name,nextName){
  const start=src.indexOf(`function ${name}`);
  const end=src.indexOf(`function ${nextName}`,start);
  assert(start>=0 && end>start,`cannot extract ${name}`);
  return src.slice(start,end);
}
const precisionBody=extract('ondalikSayisi','miktarKlip');
const clipStart=src.indexOf('function fiyatKlip');
const clipEnd=src.indexOf('\n\nconst m =',clipStart);
const clipBody=src.slice(clipStart,clipEnd);
const h={state:{basamaklar:{HOTUSDT:{pricePrecision:7,tickSize:1e-7}}}};
const factory=new Function('h',`${precisionBody}\n${clipBody}\nreturn {ondalikSayisi,fiyatKlip};`);
const motor=factory(h);
assert.strictEqual(motor.ondalikSayisi(1e-7),7,'scientific notation precision');
assert.strictEqual(motor.fiyatKlip('HOTUSDT',0.0003387),0.0003387,'scientific tick precision must not round to zero');
assert.strictEqual(motor.fiyatKlip('HOTUSDT',0),0,'invalid zero must stay rejected');

const short={sym:'HOTUSDT',yon:'SHORT',sl:0.0003468,breakevenAktif:true,korunanKarYuzdesi:0,girisAnalizi:{patternKodu:'S01',renkoBoxSize:0.000001,renkoEntryBrickDistance:1},renkoExitAssignment:{assignedTrailBricks:1,status:'WAITING_SAFE_START'}};
let r=renko.update(short,0.0003387);
assert(r.active===true);
assert(short.sl>0,'Renko stop can never become zero');
const first=short.sl;
r=renko.update(short,0.0003387);
assert.strictEqual(short.sl,first,'same market state must be no-op');
const invalid={sym:'X',yon:'SHORT',sl:0,breakevenAktif:true,korunanKarYuzdesi:0,girisAnalizi:{patternKodu:'S01',renkoBoxSize:0.000001},renkoExitAssignment:{assignedTrailBricks:1,status:'WAITING_SAFE_START'}};
r=renko.update(invalid,0.0003);
assert.strictEqual(r.changed,false);
assert.strictEqual(invalid.sl,0);
console.log('✅ v5.6.5 scientific tick precision + non-zero monotonic Renko stop safety passed');
