'use strict';
const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v600-'));process.env.AGROS_DATA_DIR=tmp;
fs.writeFileSync(path.join(tmp,'st2-historical-training.json'),JSON.stringify({profiles:{
 'SHORT|GGGG':{bestEntry:0.25,candidates:{'0.25':{triggered:100,net:10,grossProfit:20,grossLoss:10}}},
 'SHORT|RGGG':{bestEntry:0.50,candidates:{'0.50':{triggered:80,net:8,grossProfit:16,grossLoss:8}}}
}}));
const adaptive=require('./76_st2_adaptive_dna_entry.js');
const intel=require('./77_st2_pattern_dna_intelligence.js');
const a={sym:'ETHUSDT',yon:'SHORT',girisAnalizi:{patternKodu:'GGGG',renkoSonTuglaDizisi:'GRGGGG',renkoBb:{zone:'UST',widthRegime:'GENIS'},atrRegime:'NORMAL',trend20:'DOWN',session:'ASYA'}};
const b={sym:'BTCUSDT',yon:'SHORT',girisAnalizi:{patternKodu:'RGGG',renkoSonTuglaDizisi:'GGRGGG',renkoBb:{zone:'ORTA_UST',widthRegime:'GENIS'},atrRegime:'NORMAL',trend20:'DOWN',session:'ASYA'}};
for(let i=0;i<6;i++){
 adaptive.observe(a,{}, {'0.25':{triggered:true,net:i<3?-0.10:0.05},'0.50':{triggered:true,net:0.25}},'A'+i);
 adaptive.observe(b,{}, {'0.25':{triggered:true,net:0.05},'0.50':{triggered:true,net:0.20}},'B'+i);
}
const reg=intel.registry();assert.equal(reg.policy.shadowOnly,true);assert(reg.profiles.length>=2);
const p=reg.profiles.find(x=>x.context.pattern==='GGGG'&&x.expectation&&x.expectation.liveWeight>0);assert(p);assert.equal(p.decision.brick,0.50);assert(p.confidence.score>=0&&p.confidence.score<=100);assert(p.nearest.length>=1);assert(p.nearest.some(x=>x.similarity>0));assert(p.expectation.liveWeight>0);assert(['GUCLENIYOR','ZAYIFLIYOR','YATAY','YETERSIZ_VERI'].includes(p.evolution.trend));
const tg=intel.telegram();assert(tg.includes('ADAPTIVE DNA INTELLIGENCE'));assert(tg.includes('Trade Engine değişmedi'));
console.log('✅ v6.0.0 Adaptive DNA Intelligence passed | registry, confidence, similarity, expectation, evolution, shadow safety');
