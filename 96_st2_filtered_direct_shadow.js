'use strict';
/**
 * AGROS ST2 v6.13.5-R22.2 — FILTERED DIRECT SHADOW
 *
 * 0.50T/1.00T dışındaki DIRECT gerçek-emir adaylarını Binance'e göndermeden
 * ayrı ve sembolü bloke etmeyen bilimsel lifecycle olarak izler.
 * Gerçek Entry Mode policy'ye otomatik oy vermez; kasa-kurtarma filtresinin
 * yeniden değerlendirilmesi için ayrı kanıt üretir.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.13.5-R22.2-FILTERED-DIRECT-SHADOW';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname,'data');
const STATE_FILE = path.join(DATA_DIR,'st2-filtered-direct-shadow.json');
const LEDGER_FILE = path.join(DATA_DIR,'st2-filtered-direct-shadow.jsonl');
let cache=null, dirty=false, timer=null, lastPersist=0;

function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function ensureDir(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});}
function blankMetric(){return {n:0,wins:0,losses:0,be:0,netPct:0,grossProfit:0,grossLoss:0,wr:0,pf:0,expectancy:0};}
function blank(){return {version:VERSION,updatedAt:null,experiments:{},profiles:{},completed:[]};}
function hydrate(raw){const s=blank();if(raw&&typeof raw==='object'){s.experiments=raw.experiments&&typeof raw.experiments==='object'?raw.experiments:{};s.profiles=raw.profiles&&typeof raw.profiles==='object'?raw.profiles:{};s.completed=Array.isArray(raw.completed)?raw.completed:[];s.updatedAt=raw.updatedAt||null;}return s;}
function load(){if(cache)return cache;try{cache=hydrate(JSON.parse(fs.readFileSync(STATE_FILE,'utf8')));}catch(_){cache=blank();}return cache;}
function clone(v){return JSON.parse(JSON.stringify(v));}
function pct(direction,entry,price){if(!(entry>0&&price>0))return 0;return direction==='SHORT'?((entry-price)/entry)*100:((price-entry)/entry)*100;}
function key(direction,pattern,t){return `${String(direction).toUpperCase()}|${String(pattern||'UNKNOWN').toUpperCase()}|${Number(t).toFixed(2)}T`;}
function schedule(force=false){dirty=true;const ms=15000;if(force||Date.now()-lastPersist>=ms)return persist();if(timer)return;timer=setTimeout(()=>{timer=null;persist();},Math.max(10,ms-(Date.now()-lastPersist)));timer.unref?.();}
function persist(){if(!dirty&&fs.existsSync(STATE_FILE))return;ensureDir();const s=load();s.updatedAt=new Date().toISOString();const tmp=`${STATE_FILE}.tmp-${process.pid}`;fs.writeFileSync(tmp,JSON.stringify(s,null,2));fs.renameSync(tmp,STATE_FILE);dirty=false;lastPersist=Date.now();}
function append(row){try{ensureDir();fs.appendFileSync(LEDGER_FILE,JSON.stringify(row)+'\n');}catch(_){}}
function updateMetric(m,net,outcome){m.n=n(m.n)+1;m.netPct=n(m.netPct)+net;if(outcome==='TP'){m.wins=n(m.wins)+1;m.grossProfit=n(m.grossProfit)+Math.max(0,net);}else if(outcome==='SL'){m.losses=n(m.losses)+1;m.grossLoss=n(m.grossLoss)+Math.abs(Math.min(0,net));}else m.be=n(m.be)+1;m.wr=m.n?m.wins/m.n*100:0;m.pf=m.grossLoss>0?m.grossProfit/m.grossLoss:(m.grossProfit>0?999:0);m.expectancy=m.n?m.netPct/m.n:0;return m;}
function cfg(){return {stopPct:Math.max(.05,n(ayarlar.sabitStopYuzdesi,1.5)),tpPct:Math.max(.05,n(ayarlar.sabitTpYuzdesi,.4)),beTriggerPct:Math.max(0,n(ayarlar.breakevenTetikYuzde,.4)),beBufferPct:Math.max(0,n(ayarlar.breakevenTamponYuzde,.12)),feePct:Math.max(0,n(ayarlar.renkoGiris15mShadowRoundTripFeePct,.08)),maxBars:Math.max(1,Math.floor(n(ayarlar.renkoGiris15mShadowMaxHoldBars,32)))};}
function idFor(pusu,t,at){return `${String(pusu?.sym||'').toUpperCase()}|${String(pusu?.yon||'').toUpperCase()}|${String(pusu?.patternKodu||'UNKNOWN').toUpperCase()}|${n(pusu?.olusanMumZamani||pusu?.kaynakSonKapaliMumZamani||at)}|${Number(t).toFixed(2)}T`;}
function open(pusu={},entryPrice,offsetT,meta={}){
  const sym=String(pusu?.sym||'').toUpperCase(),direction=String(pusu?.yon||'').toUpperCase(),pattern=String(pusu?.patternKodu||'UNKNOWN').toUpperCase();
  const price=n(entryPrice),t=n(offsetT),at=n(meta.at,Date.now());
  if(!sym||!['LONG','SHORT'].includes(direction)||!(price>0)||!(t>0))return {accepted:false,reason:'IDENTITY_INVALID'};
  const s=load(),id=idFor(pusu,t,at);if(s.experiments[id]||s.completed.some(x=>x.id===id))return {accepted:false,reason:'DUPLICATE',id};
  s.experiments[id]={id,sym,direction,pattern,offsetT:t,entryPrice:price,openedAt:at,lastCandleCloseTime:0,holdBars:0,stopLevelPct:-cfg().stopPct,be:false,peakPct:0,troughPct:0,stTrend:String(meta.stTrend||''),status:'OPEN'};
  schedule(true);return {accepted:true,id,active:Object.keys(s.experiments).length};
}
function candlePath(c,d){return d==='LONG'?[c.open,c.low,c.high,c.close]:[c.open,c.high,c.low,c.close];}
function observe(exp,price,c){const p=pct(exp.direction,exp.entryPrice,n(price));exp.peakPct=Math.max(n(exp.peakPct),p);exp.troughPct=Math.min(n(exp.troughPct),p);if(!exp.be&&p>=c.beTriggerPct){exp.be=true;exp.stopLevelPct=Math.max(n(exp.stopLevelPct,-c.stopPct),c.beBufferPct);}if(p<=n(exp.stopLevelPct,-c.stopPct)){const net=n(exp.stopLevelPct,-c.stopPct)-c.feePct;return {done:true,netPct:net,outcome:net>0?'TP':net<0?'SL':'BE',reason:'STANDARDIZED_STOP'};}if(p>=c.tpPct){return {done:true,netPct:c.tpPct-c.feePct,outcome:'TP',reason:'STANDARDIZED_TP'};}return {done:false};}
function finish(s,exp,result,at){const k=key(exp.direction,exp.pattern,exp.offsetT);s.profiles[k]||=blankMetric();updateMetric(s.profiles[k],n(result.netPct),result.outcome);const row={...clone(exp),closedAt:at,netPct:n(result.netPct),outcome:result.outcome,reason:result.reason,profileKey:k,profile:clone(s.profiles[k])};s.completed.push(row);if(s.completed.length>1000)s.completed.splice(0,s.completed.length-1000);delete s.experiments[exp.id];append(row);return row;}
function advance(options={}){
  const s=load(),c=cfg(),now=n(options.now,Date.now()),prices=options.prices||{},candles=options.candles15mBySymbol||{};let changed=false,closed=0;const events=[];
  for(const exp of Object.values(s.experiments||{})){
    let resolved=null;
    const rows=(Array.isArray(candles[exp.sym])?candles[exp.sym]:[]).filter(x=>n(x?.closeTime)>n(exp.lastCandleCloseTime)&&n(x?.openTime)>=n(exp.openedAt)&&n(x?.closeTime)<=now).sort((a,b)=>n(a.closeTime)-n(b.closeTime));
    for(const row of rows){for(const px of candlePath(row,exp.direction)){resolved=observe(exp,px,c);if(resolved.done)break;}exp.lastCandleCloseTime=n(row.closeTime);exp.holdBars=n(exp.holdBars)+1;changed=true;if(resolved?.done)break;if(exp.holdBars>=c.maxBars){const net=pct(exp.direction,exp.entryPrice,n(row.close))-c.feePct;resolved={done:true,netPct:net,outcome:net>0?'TP':net<0?'SL':'BE',reason:'STANDARDIZED_MAX_HOLD'};break;}}
    const live=n(prices[exp.sym]);if(!resolved?.done&&live>0)resolved=observe(exp,live,c);
    if(resolved?.done){const row=finish(s,exp,resolved,now);events.push({type:'CLOSE',row});closed++;changed=true;}
  }
  if(changed)schedule(closed>0);return {active:Object.keys(s.experiments).length,closed,events};
}
function summary(){const s=load();return {version:VERSION,stateFile:STATE_FILE,ledgerFile:LEDGER_FILE,active:Object.keys(s.experiments).length,profiles:Object.keys(s.profiles).length,completed:s.completed.length};}
function snapshot(){return clone(load());}
function resetForTest(){cache=blank();dirty=false;lastPersist=0;if(timer){clearTimeout(timer);timer=null;}return cache;}
module.exports={VERSION,STATE_FILE,LEDGER_FILE,open,advance,summary,snapshot,_resetForTest:resetForTest,_persist:persist};
