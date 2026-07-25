'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

// 1) Daha dolu tarihsel hafıza, kısmen dolu yeni state tarafından maskelenmemeli.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'agros-v562-'));
const live=path.join(root,'live'); const legacy=path.join(root,'legacy');
fs.mkdirSync(live,{recursive:true}); fs.mkdirSync(legacy,{recursive:true});
process.env.AGROS_DATA_DIR=live; process.env.AGROS_ST2_LEGACY_DATA_DIR=legacy;
const metric=(samples,net)=>({samples,triggered:samples,tp:net>0?samples:0,sl:net<0?samples:0,be:net===0?samples:0,net,grossProfit:Math.max(0,net),grossLoss:Math.max(0,-net),recent:[]});
const profile=(closed,brick=0.75)=>({key:'LONG|RRRR',yon:'LONG',patternCode:'RRRR',patternId:'L01',activeBrick:brick,closed,lastEvaluationClosed:closed,candidates:{'0.25':metric(closed,0.2),'0.50':metric(closed,0.4),'0.75':metric(closed,0.3),'1.00':metric(closed,0.1),'1.25':metric(closed,0),'1.50':metric(closed,-0.1)},history:[]});
fs.writeFileSync(path.join(live,'st2-renko-entry-evolution.json'),JSON.stringify({profiles:{'LONG|RRRR':profile(1)},bridge:{calls:1,accepted:1,skipped:{}}}));
fs.writeFileSync(path.join(legacy,'st2-renko-entry-evolution.json'),JSON.stringify({profiles:{'LONG|RRRR':profile(22,0.5)},bridge:{calls:22,accepted:22,skipped:{}}}));
const evo=require('./73_st2_renko_entry_evolution.js');
const sum=evo.summary();
assert.strictEqual(sum.total.closed,22,'22 tarihsel kapanış kurtarılmadı');
assert.strictEqual(sum.profiles[0].activeBrick,0.5,'öğrenilmiş giriş seviyesi korunmadı');
assert.ok(sum.recovery && sum.recovery.replacedWeight===1,'kısmi state replacement audit yok');
for(const d of [0.25,0.5,0.75,1,1.25,1.5]) assert(sum.profiles[0].candidates.some(x=>x.brick===d),'replay seviyesi eksik '+d);

// 2) Telegram ana raporu eski kesme uyarısını üretmemeli; Evolution ayrı ikinci bölüm olmalı.
const reportSource=fs.readFileSync(path.join(__dirname,'2_rapor.js'),'utf8');
assert(!reportSource.includes('Rapor güvenlik nedeniyle kısaltıldı'),'eski kısaltma uyarısı kaldı');
assert(reportSource.includes('st2EntryEvolutionDetayiGonderGerekirse'),'ikinci bölüm gönderimi yok');
assert(reportSource.includes('0.25–1.50 replay ve Pattern ayrıntıları ikinci bölümde'),'ana rapor sadeleştirme kanıtı yok');

// 3) Aynı pusu imzası runtime boyunca yalnız ilk kez bildirilir.
const entrySource=fs.readFileSync(path.join(__dirname,'72_st2_renko_entry.js'),'utf8');
assert(entrySource.includes('dahaOnceBildirildi'));
assert(entrySource.includes('pusuTelegramBildirimleri[bildirimAnahtari] = Date.now()'));
console.log('✅ v5.6.2 ST2 recovery sprint passed | partial-state historical recovery + split Telegram + pusu dedupe');
