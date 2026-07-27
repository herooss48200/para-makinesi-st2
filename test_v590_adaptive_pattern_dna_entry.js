'use strict';
const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v590-'));process.env.AGROS_DATA_DIR=tmp;
const historical={profiles:{'SHORT|GGGG':{bestEntry:0.25,candidates:{'0.25':{triggered:100,net:10,grossProfit:20,grossLoss:10},'0.50':{triggered:100,net:5,grossProfit:12,grossLoss:7}}}}};fs.writeFileSync(path.join(tmp,'st2-historical-training.json'),JSON.stringify(historical));
const dna=require('./76_st2_adaptive_dna_entry.js');
const pos={sym:'ETHUSDT',yon:'SHORT',girisAnalizi:{patternKodu:'GGGG',renkoEntryBrickDistance:0.25,renkoSonTuglaDizisi:'GRGGGG',renkoBb:{zone:'UST',widthRegime:'GENIS'}}};
let d=dna.select(pos,0.75);assert.equal(d.brick,0.25);assert.equal(d.source,'HISTORICAL_PRIOR');
for(let i=1;i<=3;i++)dna.observe(pos,{}, {'0.25':{triggered:true,net:-0.10},'0.50':{triggered:true,net:0.25},'0.75':{triggered:true,net:0.05}},'T'+i);
d=dna.select(pos,0.75);assert.equal(d.brick,0.50);assert.equal(d.source,'LIVE_LAST3');assert.equal(d.live.n,3);
const pos2={...pos,girisAnalizi:{...pos.girisAnalizi,renkoBb:{zone:'ORTA_UST',widthRegime:'NORMAL'}}};d=dna.select(pos2,0.75);assert.equal(d.brick,0.25); // DNA isolation + historical prior
console.log('✅ v5.9.0 Adaptive Pattern DNA Entry passed | historical prior, DNA isolation, son-3 live positive leader');
