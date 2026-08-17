'use strict';

// AGROS ST2 R29.1 — HA SuperTrend final trigger gate.
// Yeni ağ yolu açmaz. R26 çekirdeğinin kapanmış 1m cache'ini eksiksiz 3m bucket'lara toplar,
// standart SuperTrend'i yalnız SON KAPI olarak değerlendirir.

const ayarlar = require('./ayarlar.js');
const VERSION = 'R29.1-HA-CLOSED-3M-SUPERTREND-FINAL-GATE';

function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function upper(v){ return String(v||'').trim().toUpperCase(); }
function candleCopy(c){ return {openTime:n(c?.openTime),closeTime:n(c?.closeTime),open:n(c?.open),high:n(c?.high),low:n(c?.low),close:n(c?.close),volume:n(c?.volume)}; }
function closedCandles(rows,now=Date.now()){
  return (Array.isArray(rows)?rows:[]).filter(c=>c&&n(c.closeTime)>0&&n(c.closeTime)<=now&&n(c.open)>0&&n(c.high)>0&&n(c.low)>0&&n(c.close)>0);
}
function aggregateClosedCandles(rows,targetTf='3m',now=Date.now()){
  const tf=String(targetTf||'3m').trim().toLowerCase();
  const m=tf.match(/^(\d+)m$/); const minutes=m?Math.max(1,Number(m[1])):3;
  if(minutes===1) return closedCandles(rows,now).map(candleCopy);
  const step=minutes*60*1000;
  const source=closedCandles(rows,now).slice().sort((a,b)=>n(a.openTime)-n(b.openTime));
  const groups=new Map();
  for(const c of source){
    const open=n(c.openTime); if(!(open>0)) continue;
    const bucket=Math.floor(open/step)*step;
    if(!groups.has(bucket)) groups.set(bucket,[]);
    groups.get(bucket).push(c);
  }
  const out=[];
  for(const [bucket,items0] of [...groups.entries()].sort((a,b)=>a[0]-b[0])){
    const items=items0.slice().sort((a,b)=>n(a.openTime)-n(b.openTime));
    const expected=Array.from({length:minutes},(_,i)=>bucket+i*60*1000);
    const byOpen=new Map(items.map(x=>[n(x.openTime),x]));
    if(expected.some(t=>!byOpen.has(t))) continue;
    const picked=expected.map(t=>byOpen.get(t));
    const closeTime=bucket+step-1; if(closeTime>now) continue;
    out.push({openTime:bucket,closeTime,open:n(picked[0]?.open),close:n(picked.at(-1)?.close),high:Math.max(...picked.map(x=>n(x.high))),low:Math.min(...picked.map(x=>n(x.low))),volume:picked.reduce((a,x)=>a+n(x.volume),0)});
  }
  return out;
}
function matchesSide(side,trend){
  const t=upper(trend); return String(side||'').toUpperCase()==='LONG'?t==='UP':t==='DOWN';
}
function evaluateFromOneMinute(rows,side,calculateSuperTrend,now=Date.now(),options={}){
  if(ayarlar.heikinAshiFinalSuperTrendAktif===false) return {enabled:false,ready:true,allowed:true,trend:null,expected:null,source:'OFF'};
  const tf=String(options.tf||ayarlar.heikinAshiFinalSuperTrendPeriyodu||ayarlar.superTrendPeriyodu||'3m').trim().toLowerCase();
  const period=Math.max(2,Number(options.period||ayarlar.heikinAshiFinalSuperTrendPeriod||ayarlar.superTrendPeriod||10));
  const multiplier=Math.max(0.1,Number(options.multiplier||ayarlar.heikinAshiFinalSuperTrendMultiplier||ayarlar.superTrendMultiplier||3));
  const candles=aggregateClosedCandles(rows,tf,now);
  if(!Array.isArray(candles)||candles.length<period+2) return {enabled:true,ready:false,allowed:false,trend:null,value:0,tf,source:'CLOSED_1M_AGGREGATE',candleCount:candles?.length||0,expected:String(side).toUpperCase()==='LONG'?'UP':'DOWN'};
  const calc=typeof calculateSuperTrend==='function'?calculateSuperTrend:()=>({trend:null,value:0});
  const st=calc(candles,period,multiplier)||{};
  const allowed=matchesSide(side,st.trend);
  return {enabled:true,ready:!!st.trend,allowed,trend:st.trend||null,value:n(st.value),tf,source:'CLOSED_1M_AGGREGATE',candleCount:candles.length,expected:String(side).toUpperCase()==='LONG'?'UP':'DOWN'};
}
module.exports={VERSION,aggregateClosedCandles,matchesSide,evaluateFromOneMinute,_internals:{closedCandles,candleCopy}};
