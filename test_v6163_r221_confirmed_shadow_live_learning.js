'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tmp = path.join(__dirname, `.tmp-r221-shadow-${process.pid}-${Date.now()}`);
process.env.AGROS_DATA_DIR = tmp;

delete require.cache[require.resolve('./94_st2_15m_confirmed_evidence.js')];
const ev = require('./94_st2_15m_confirmed_evidence.js');
ev._resetForTest();

(async()=>{

function pusu({sym='TESTUSDT',yon='LONG',pattern='RRRR',signal=1000,mode='DIRECT'}={}) {
  return {
    sym, yon, patternKodu:pattern, kaynakSonKapaliMumZamani:signal,
    entryMode:mode,
    entryModeDecisionAtSignal:{selectedMode:mode,selectedOffsetT:0.25}
  };
}

// DIRECT gerçek moddayken üç 15m CONFIRMED karşı-olgusal aday açılmalı.
let r = ev.ensureConfirmedShadowForPusu(pusu());
assert.strictEqual(r.created, 3);
assert.strictEqual(ev.summary().shadowActive, 3);

// Signal tuğlası RED, sonraki kapanmış tuğla GREEN: LONG için gerçek 15m dönüş.
const bricks = {
  TESTUSDT: [
    {color:'RED',open:100,close:100,closeTime:1000},
    {color:'GREEN',open:100,close:101,closeTime:2000}
  ]
};
r = ev.advanceConfirmedShadow({
  bricksBySymbol:bricks,
  boxBySymbol:{TESTUSDT:1},
  prices:{TESTUSDT:102},
  stCache:{TESTUSDT:{trend:'UP'}},
  candles15mBySymbol:{TESTUSDT:[]},
  now:3000
});
assert.strictEqual(r.opened, 3, '0.25/0.50/0.75T üçü de canlı gölge açılmalı');
assert.strictEqual(r.open, 3);
assert(r.events.every(x => x.type === 'OPEN'));

// Aynı standardize exit sözleşmesi: +%0.40 TP - %0.08 roundtrip fee = +%0.32.
r = ev.advanceConfirmedShadow({
  bricksBySymbol:bricks,
  boxBySymbol:{TESTUSDT:1},
  prices:{TESTUSDT:102.2},
  stCache:{TESTUSDT:{trend:'UP'}},
  candles15mBySymbol:{TESTUSDT:[
    {openTime:4000,closeTime:5000,open:102,low:101.95,high:102.55,close:102.4}
  ]},
  now:6000
});
assert.strictEqual(r.closed, 3);
assert.strictEqual(ev.summary().shadowResolved, 3);
assert.strictEqual(ev.summary().shadowActive, 0);
const e = ev.evidence('CONFIRMED','LONG','RRRR',{minSamples:1,bootstrapCap:30,shadowCap:60});
assert.strictEqual(e.evidenceScope,'EXACT_PATTERN');
assert(e.shadow.samples >= 1, 'shadow sample policy evidence içine girmeli');
assert(e.expectancy > 0, 'canlı 15m shadow pozitif expectancy üretmeli');

// Gerçek mode zaten CONFIRMED ise aynı mode için karşı-olgusal duplicate shadow açılmaz.
r = ev.ensureConfirmedShadowForPusu(pusu({sym:'CONFUSDT',signal:7000,mode:'CONFIRMED'}));
assert.strictEqual(r.created, 0);
assert.strictEqual(r.reason,'REAL_MODE_NOT_DIRECT');

// Pusu penceresi üç yeni 15m tuğlada biterse, tetiklenmemiş shadow NO_ENTRY olur.
r = ev.ensureConfirmedShadowForPusu(pusu({sym:'SHORTTEST',yon:'SHORT',pattern:'GGGG',signal:10000}));
assert.strictEqual(r.created,3);
r = ev.advanceConfirmedShadow({
  bricksBySymbol:{SHORTTEST:[
    {color:'GREEN',open:100,close:100,closeTime:10000},
    {color:'GREEN',open:100,close:101,closeTime:11000},
    {color:'GREEN',open:101,close:102,closeTime:12000},
    {color:'GREEN',open:102,close:103,closeTime:13000}
  ]},
  boxBySymbol:{SHORTTEST:1}, prices:{SHORTTEST:103}, stCache:{SHORTTEST:{trend:'UP'}}, candles15mBySymbol:{SHORTTEST:[]}, now:14000
});
assert.strictEqual(r.noEntry,3);
assert.strictEqual(ev.summary().shadowNoEntry,3);

// R22 schema=1 state gölge alanı yokken R22.1 hydrate geriye uyumlu olmalı.
ev._resetForTest({schema:1,bootstrap:{meta:{status:'READY'},profiles:{}},live:{profiles:{},processedCloseIds:{}}});
const snap=ev.snapshot();
assert.strictEqual(snap.schema,2);
assert(snap.liveShadow && snap.liveShadow.profiles && snap.liveShadow.experiments);

// Entegrasyon sözleşmeleri: trade matematiği değil, RAM telemetri + shadow learner wiring.
const renkoSrc=fs.readFileSync(path.join(__dirname,'72_st2_renko_entry.js'),'utf8');
assert(renkoSrc.includes('ensureConfirmedShadowForPusu'));
assert(renkoSrc.includes('advanceConfirmedShadow'));
assert(renkoSrc.includes('pusuDegerlendirilen: audit.pusuDegerlendirilen'));
assert(renkoSrc.includes('confirmedShadowActive: audit.confirmedShadowActive'));
const reportSrc=fs.readFileSync(path.join(__dirname,'2_rapor.js'),'utf8');
assert(reportSrc.includes('Mode D/C ${veriSagligi.entryModeDirect}/${veriSagligi.entryModeConfirmed}'));
assert(reportSrc.includes('15m CONFIRMED canlı gölge Aktif'));
const legacySrc=fs.readFileSync(path.join(__dirname,'89_st2_renko_entry_confirmation_shadow_lab.js'),'utf8');
assert(!legacySrc.includes('sonuç Entry Mode Policy kanıtıdır'));
assert(legacySrc.includes('gerçek Entry Mode seçim yetkisi YOK'));

await ev._flushForTest();
try { fs.rmSync(tmp,{recursive:true,force:true}); } catch (_) {}
delete process.env.AGROS_DATA_DIR;
console.log('✅ v6.13.5-R22.1 confirmed shadow live learning passed | DIRECT seçiliyken 15m CONFIRMED counterfactual öğrenir | panel funnel truth | legacy 1m real authority YOK');
})().catch(e=>{ console.error(e.stack||e); process.exitCode=1; });
