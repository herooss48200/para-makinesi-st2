'use strict';
const assert=require('assert');
const fs=require('fs');const os=require('os');const path=require('path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v634-'));
process.env.AGROS_DATA_DIR=tmp;
const a=require('./76_st2_adaptive_dna_entry.js');
const intel=require('./77_st2_pattern_dna_intelligence.js');
const base={yon:'SHORT',pattern:'S01',rbb:'UST',rbbw:'COK_GENIS',renko6:'GGGGGG',atr:'NORMAL',trend20:'UP'};
const abd={...base,session:'ABD'},avrupa={...base,session:'AVRUPA'};
assert.strictEqual(a.dnaKey(abd),a.dnaKey(avrupa),'session exact DNA keyini bolmemeli');
assert.notStrictEqual(a.legacyDnaKey(abd),a.legacyDnaKey(avrupa),'legacy key sessioni korumali');
const old={schema:2,dnaProfiles:{
 [a.legacyDnaKey(abd)]:{key:a.legacyDnaKey(abd),patternKey:'SHORT|S01',context:abd,closes:[{at:'2026-01-01',candidates:{'1.00':{net:0.2}}}],changes:[],activeBrick:1},
 [a.legacyDnaKey(avrupa)]:{key:a.legacyDnaKey(avrupa),patternKey:'SHORT|S01',context:avrupa,closes:[{at:'2026-01-02',candidates:{'1.00':{net:0.3}}}],changes:[],activeBrick:1}
},health:{observed:2}};
const migrated=a.migrateSessionNeutralState(old);const profiles=Object.values(migrated.dnaProfiles);
assert.strictEqual(profiles.length,1,'iki session profili tek DNA profilinde birlesmeli');
assert.strictEqual(profiles[0].closes.length,2,'canli kapanislar kaybolmamali');
assert.strictEqual(profiles[0].context.session,'ALL');
assert.ok(profiles[0].sessionObservations.ABD>0&&profiles[0].sessionObservations.AVRUPA>0,'session referans profili korunmali');
assert.strictEqual(intel.contextSimilarity(abd,avrupa),100,'session benzerligi etkilememeli');
const source=fs.readFileSync('./76_st2_adaptive_dna_entry.js','utf8');
assert.ok(!/function dnaKey\(c\).*SESSION=/.test(source),'aktif dnaKey session icermemeli');
assert.ok(source.includes('sessionNeutralMigrations'),'state migration telemetrisi olmali');
console.log('✅ v6.3.4 session-neutral exact DNA + lossless migration passed');
