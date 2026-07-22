/**
 * AGROS v5.3.0 FINAL PLUS — LAB LIFECYCLE EVOLUTION
 * Her LAB DNA için Exit'ten bağımsız fakat aynı kimliğe bağlı Stop + BE gölge öğrenmesi.
 * Adaylar aynı fiyat yolu üzerinde paralel yürütülür. Minimum 50 karşılaştırılabilir kapanış
 * oluşmadan aktif ayar değişmez. Restart-GAP ve eksik fiyat yolu öğrenme dışıdır.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');

const VERSION = 'v5.3.0-FINAL-PLUS';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-lifecycle-evolution.json');
const MIN_SAMPLES = () => Math.max(50, Number(ayarlar.labLifecycleMinKapanis || 50));
const STOP_CANDIDATES = () => (Array.isArray(ayarlar.labStopAdaylariYuzde) ? ayarlar.labStopAdaylariYuzde : [0.8,1.0,1.2,1.5,1.8]).map(Number).filter(x=>x>0);
const BE_CANDIDATES = () => (Array.isArray(ayarlar.labBeAdaylariYuzde) ? ayarlar.labBeAdaylariYuzde : [0.08,0.12,0.18,0.25,0.40]).map(Number).filter(x=>x>=0);
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function r(v,d=6){return Number(n(v).toFixed(d))}
function ensure(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true})}
function blankMetric(){return {samples:0,tp:0,sl:0,be:0,net:0,grossProfit:0,grossLoss:0}}
function metric(x={}){const m={...blankMetric(),...x};m.pf=m.grossLoss>0?m.grossProfit/m.grossLoss:(m.grossProfit>0?999:0);m.expectancy=m.samples?m.net/m.samples:0;return m}
function blank(){return {version:VERSION,updatedAt:null,byLab:{}}}
function read(){ensure();const x=io.readJsonBounded(STATE_FILE,null,{maxBytes:32*1024*1024});return {...blank(),...(x||{}),byLab:x?.byLab&&typeof x.byLab==='object'?x.byLab:{}}}
function write(s){ensure();s.version=VERSION;s.updatedAt=new Date().toISOString();io.writeJsonAtomic(STATE_FILE,s);return s}
function labIdentity(pos){const id=hierarchy.decoratePosition(pos,{source:'LAB_LIFECYCLE'});return id?.lab||null}
function pathFrom(pos,result={}){
 const raw=pos?.execution?.pricePath||pos?.journey?.pricePath||[];
 const points=raw.map(x=>({t:n(x.t||x.at||x.time),p:n(x.price||x.fiyat),k:n(x.karYuzde??x.profitPct,NaN)})).filter(x=>x.p>0||Number.isFinite(x.k));
 const entry=n(pos?.girisFiyati); const side=String(pos?.yon||'').toUpperCase();
 const normalized=points.map(x=>({t:x.t,k:Number.isFinite(x.k)?x.k:(side==='SHORT'?((entry-x.p)/entry)*100:((x.p-entry)/entry)*100)}));
 if(Number.isFinite(n(result.fiyatKarYuzdesi,NaN))) normalized.push({t:Date.now(),k:n(result.fiyatKarYuzdesi)});
 return normalized.sort((a,b)=>a.t-b.t);
}
function simulateStop(path, stopPct, actualClosePct){
 for(const p of path){if(p.k<=-stopPct)return -stopPct}
 return actualClosePct;
}
function simulateBe(path, triggerPct, bufferPct, actualClosePct){
 let armed=false;
 for(const p of path){if(!armed&&p.k>=triggerPct)armed=true;if(armed&&p.k<=bufferPct)return bufferPct}
 return actualClosePct;
}
function pnlUsdt(pos,pct,commission){const value=n(pos?.pozisyonDegeri,n(pos?.miktar)*n(pos?.girisFiyati));return r(value*(pct/100)-n(commission),6)}
function add(m,net){m.samples++;m.net+=net;if(net>0){m.tp++;m.grossProfit+=net}else if(Math.abs(net)<=0.000001)m.be++;else{m.sl++;m.grossLoss+=Math.abs(net)}}
function champion(map,currentKey){
 const min=MIN_SAMPLES(); const rows=Object.entries(map||{}).map(([key,val])=>({key,...metric(val)}));
 const eligible=rows.filter(x=>x.samples>=min&&x.net>0&&x.pf>1&&x.expectancy>0).sort((a,b)=>b.net-a.net||b.pf-a.pf);
 const best=eligible[0]||null; const current=rows.find(x=>String(x.key)===String(currentKey))||null;
 if(!best)return {ready:false,best:null,current,reason:`MIN_${min}_VE_POZITIF_EKONOMI_BEKLENIYOR`};
 if(current&&best.net<=current.net)return {ready:false,best,current,reason:'MEVCUT_AYARDAN_DAHA_IYI_DEGIL'};
 return {ready:true,best,current,reason:'KANIT_TAMAM'};
}
function close(pos,result={}){
 if(ayarlar.labLifecycleEvolutionAktif===false||!pos||pos.sanal===false||result.restartGap===true||pos.restartGap===true)return null;
 const lab=labIdentity(pos); if(!lab?.key)return null;
 const path=pathFrom(pos,result); if(path.length<2)return null;
 const entry=n(pos.girisFiyati); const exit=n(result.exitPrice); const side=String(pos.yon||'').toUpperCase();
 const actualPct=Number.isFinite(n(result.fiyatKarYuzdesi,NaN))?n(result.fiyatKarYuzdesi):(exit&&entry?(side==='SHORT'?((entry-exit)/entry)*100:((exit-entry)/entry)*100):0);
 const commission=n(result.commission||result.komisyon);
 const s=read(); const row=s.byLab[lab.key]||(s.byLab[lab.key]={labDnaId:lab.id,labDnaLabel:lab.label,labKey:lab.key,stop:{activePct:n(ayarlar.sabitStopYuzdesi,1.5),candidates:{}},be:{activeTriggerPct:n(ayarlar.breakevenTetikYuzde,.4),activeBufferPct:n(ayarlar.breakevenTamponYuzde,.12),candidates:{}},closed:0,lastUpdatedAt:null});
 row.closed++;
 for(const c of STOP_CANDIDATES()){const key=c.toFixed(2);const m=row.stop.candidates[key]||(row.stop.candidates[key]=blankMetric());add(m,pnlUsdt(pos,simulateStop(path,c,actualPct),commission))}
 for(const b of BE_CANDIDATES()){const key=b.toFixed(2);const m=row.be.candidates[key]||(row.be.candidates[key]=blankMetric());add(m,pnlUsdt(pos,simulateBe(path,n(ayarlar.labBeTetikYuzde,n(ayarlar.breakevenTetikYuzde,.4)),b,actualPct),commission))}
 const stopPick=champion(row.stop.candidates,Number(row.stop.activePct).toFixed(2));
 const bePick=champion(row.be.candidates,Number(row.be.activeBufferPct).toFixed(2));
 if(stopPick.ready&&ayarlar.labLifecycleOtomatikAktiflestirme!==false){row.stop.previousPct=row.stop.activePct;row.stop.activePct=Number(stopPick.best.key);row.stop.changedAt=new Date().toISOString();row.stop.reason=stopPick.reason}
 if(bePick.ready&&ayarlar.labLifecycleOtomatikAktiflestirme!==false){row.be.previousBufferPct=row.be.activeBufferPct;row.be.activeBufferPct=Number(bePick.best.key);row.be.changedAt=new Date().toISOString();row.be.reason=bePick.reason}
 row.stop.recommendation=stopPick;row.be.recommendation=bePick;row.lastUpdatedAt=new Date().toISOString();write(s);return row;
}
function profile(pos){const lab=labIdentity(pos);if(!lab?.key)return null;const row=read().byLab[lab.key];if(!row)return null;return {version:VERSION,labDnaId:lab.id,labDnaLabel:lab.label,labKey:lab.key,stopPct:n(row.stop?.activePct,n(ayarlar.sabitStopYuzdesi,1.5)),beTriggerPct:n(row.be?.activeTriggerPct,n(ayarlar.breakevenTetikYuzde,.4)),beBufferPct:n(row.be?.activeBufferPct,n(ayarlar.breakevenTamponYuzde,.12)),minSamples:MIN_SAMPLES(),closed:n(row.closed)} }
function apply(pos){const p=profile(pos);if(!p)return null;pos.labLifecycleProfile=p;pos.labStopYuzdesi=p.stopPct;pos.labBeTetikYuzde=p.beTriggerPct;pos.labBeTamponYuzde=p.beBufferPct;return p}
function report(limit=8){const rows=Object.values(read().byLab).sort((a,b)=>n(b.closed)-n(a.closed)).slice(0,limit);let t='🧬 <b>LAB YAŞAM PROFİLİ — EXIT + STOP + BE</b>\n';t+=`Kanıt eşiği: her LAB için minimum ${MIN_SAMPLES()} karşılaştırılabilir kapanış\n`;if(!rows.length)return t+'⏳ Henüz karşılaştırılabilir LAB fiyat yolu yok.';t+=rows.map(x=>{const s=x.stop?.recommendation,b=x.be?.recommendation;return `${x.labDnaLabel} | N${n(x.closed)} | 🛡 Aktif %${n(x.stop?.activePct,1.5).toFixed(2)}${s?.best?` → Aday %${n(s.best.key).toFixed(2)} N${s.best.samples} PF${n(s.best.pf).toFixed(2)}`:''} | ⚖ BE +%${n(x.be?.activeBufferPct,.12).toFixed(2)}${b?.best?` → Aday +%${n(b.best.key).toFixed(2)} N${b.best.samples}`:''}`}).join('\n');return t}
module.exports={VERSION,STATE_FILE,MIN_SAMPLES,STOP_CANDIDATES,BE_CANDIDATES,read,write,simulateStop,simulateBe,champion,close,profile,apply,report};
