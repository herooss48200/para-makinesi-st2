'use strict';

// R31 MTF LIVE reporting-only scoreboard. It never changes execution records.
const fs = require('fs');
const path = require('path');
const realExecution = require('./85_st2_real_order_execution.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const BASELINE_FILE = path.join(DATA_DIR, 'st2-r31-mtf-live-baseline.json');

function tfs() {
  const raw = Array.isArray(ayarlar.renkoCanliKaynakPeriyotlari) ? ayarlar.renkoCanliKaynakPeriyotlari : ['15m','30m','1h','2h','4h'];
  return [...new Set(raw.map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))];
}
function nowIso(){ return new Date().toISOString(); }
function finite(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function parseMs(v){
  const n=Number(v); if(Number.isFinite(n)&&n>0) return n>1e12?n:n*1000;
  const t=Date.parse(String(v||'')); return Number.isFinite(t)?t:NaN;
}
function ensureBaseline(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  try {
    const b=JSON.parse(fs.readFileSync(BASELINE_FILE,'utf8'));
    if(Number(b?.startedAtMs)>0) return b;
  } catch(_) {}
  const b={version:'R31-MTF-LIVE',startedAt:nowIso(),startedAtMs:Date.now(),timeframes:tfs()};
  const tmp=`${BASELINE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(b,null,2)); fs.renameSync(tmp,BASELINE_FILE);
  return b;
}
function tfOf(r={}){
  const p=r?.positionSnapshot||r?.preparedSnapshot||{};
  const a=p?.girisAnalizi||{};
  const tf=String(p?.sourceTimeframe||a?.sourceTimeframe||'').trim().toLowerCase();
  return tfs().includes(tf)?tf:null;
}
function openedMs(r={}){ return parseMs(r?.openedAt||r?.positionSnapshot?.gercekEmirYurutme?.openedAt||r?.positionSnapshot?.acilisZamani); }
function closedMs(r={}){ return parseMs(r?.closedAt||r?.protectionClosedAt); }
function blank(tf){ return {tf,opened:0,closed:0,wins:0,losses:0,be:0,netPnl:0,commission:0,grossProfit:0,grossLoss:0,wr:0,pf:0}; }
function current(){
  const baseline=ensureBaseline();
  const rows=Object.fromEntries(tfs().map(tf=>[tf,blank(tf)]));
  const state=realExecution.readState();
  for(const r of Object.values(state?.records||{})){
    const tf=tfOf(r); if(!tf) continue;
    const o=openedMs(r); if(Number.isFinite(o)&&o>=baseline.startedAtMs) rows[tf].opened++;
    const c=closedMs(r); if(String(r?.status||'').toUpperCase()!=='CLOSED'||!(c>=baseline.startedAtMs)) continue;
    const x=finite(r?.netPnl,finite(r?.accounting?.netPnl,0));
    const fee=finite(r?.totalCommission,finite(r?.accounting?.commission,0));
    const q=rows[tf]; q.closed++; q.netPnl+=x; q.commission+=fee;
    if(x>1e-9){ q.wins++; q.grossProfit+=x; }
    else if(x<-1e-9){ q.losses++; q.grossLoss+=-x; }
    else q.be++;
  }
  for(const q of Object.values(rows)){
    q.wr=q.wins+q.losses>0?q.wins/(q.wins+q.losses)*100:0;
    q.pf=q.grossLoss>0?q.grossProfit/q.grossLoss:(q.grossProfit>0?999:0);
    for(const k of ['netPnl','commission','grossProfit','grossLoss','wr','pf']) q[k]=Number(q[k].toFixed(8));
  }
  return {baseline,rows,total:Object.values(rows).reduce((a,q)=>{a.opened+=q.opened;a.closed+=q.closed;a.netPnl+=q.netPnl;return a;},{opened:0,closed:0,netPnl:0})};
}
module.exports={BASELINE_FILE,current,ensureBaseline,_test:{tfOf,openedMs,closedMs,blank}};
