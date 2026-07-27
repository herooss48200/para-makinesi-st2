'use strict';
/**
 * AGROS ST2 v5.6.9 — Winning Intelligence
 * Sadece bilimsel kapanış ledger'ını okur; Trade Engine kararını değiştirmez.
 */
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'st2-renko-entry-evolution-ledger.jsonl');
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d;}
function bucket(){return {closed:0,win:0,loss:0,be:0,net:0,grossProfit:0,grossLoss:0,winSum:0,lossSum:0,patterns:{},relations:{}};}
function metric(b){const decisive=b.win+b.loss;return {...b,wr:decisive?b.win/decisive*100:0,pf:b.grossLoss>0?b.grossProfit/b.grossLoss:(b.grossProfit>0?999:0),expectancy:b.closed?b.net/b.closed:0,avgWin:b.win?b.winSum/b.win:0,avgLoss:b.loss?b.lossSum/b.loss:0,payoff:b.loss?Math.abs((b.win?b.winSum/b.win:0)/(b.lossSum/b.loss)):0};}
function bits(x){
  if(!x||typeof x!=='object') return '----';
  const order=['5m','15m','1h','4h'];
  return order.map(k=>{const v=String(x[k]??x[k.toUpperCase()]??'').toUpperCase();return v.includes('UP')||v==='1'?'1':v.includes('DOWN')||v==='0'?'0':'-';}).join('');
}
function relation(pos={}){
  const key=String(pos?.blackboxAcilis?.strategySignature?.key||pos?.acilis?.strategySignature?.key||pos?.strategySignature?.key||'');
  const m=key.match(/BTC=([^|]+).*COIN=([^|]+)/i); if(m)return `BTC=${m[1]}|COIN=${m[2]}`;
  const btc=pos?.blackboxAcilis?.btc||pos?.acilis?.btc||pos?.btcSnapshot||pos?.btc;
  const coin=pos?.blackboxAcilis?.coin||pos?.acilis?.coin||pos?.coinSnapshot||pos?.coin;
  const b=bits(btc),c=bits(coin); return (b==='----'&&c==='----')?'VERI_YOK':`BTC=${b}|COIN=${c}`;
}
function actualNet(row){
  const r=row?.result||{},p=row?.pos||{};
  if(Number.isFinite(Number(r.net))) return Number(r.net);
  if(Number.isFinite(Number(r.netKarZarar))) return Number(r.netKarZarar);
  const entry=n(p.girisFiyati||p.entryPrice), exit=n(r.exitPrice||r.kapanisFiyati), side=String(p.yon||'').toUpperCase();
  if(!entry||!exit)return 0; const pct=side==='SHORT'?(entry-exit)/entry*100:(exit-entry)/entry*100;
  return pct-n(r.commission||r.komisyon);
}
function add(b,row){
  const p=row.pos||{}, net=actualNet(row), eps=1e-9; b.closed++;b.net+=net;
  if(net>eps){b.win++;b.grossProfit+=net;b.winSum+=net;}else if(net<-eps){b.loss++;b.grossLoss+=Math.abs(net);b.lossSum+=net;}else b.be++;
  const pat=String(p?.girisAnalizi?.patternKodu||p?.girisAnalizi?.patternId||'UNKNOWN');
  b.patterns[pat]=b.patterns[pat]||bucket(); const pb=b.patterns[pat]; pb.closed++;pb.net+=net;if(net>eps){pb.win++;pb.grossProfit+=net;pb.winSum+=net}else if(net<-eps){pb.loss++;pb.grossLoss+=Math.abs(net);pb.lossSum+=net}else pb.be++;
  const rel=relation(p); b.relations[rel]=b.relations[rel]||bucket(); const rb=b.relations[rel];rb.closed++;rb.net+=net;if(net>eps){rb.win++;rb.grossProfit+=net;rb.winSum+=net}else if(net<-eps){rb.loss++;rb.grossLoss+=Math.abs(net);rb.lossSum+=net}else rb.be++;
}
function readRows(){if(!fs.existsSync(LEDGER_FILE))return[];const seen=new Set(),out=[];for(const line of fs.readFileSync(LEDGER_FILE,'utf8').split(/\r?\n/)){if(!line.trim())continue;try{const x=JSON.parse(line);if(x.type!=='SCIENTIFIC_CLOSE'||!x.tradeId||seen.has(x.tradeId))continue;seen.add(x.tradeId);out.push(x);}catch(_){}}return out;}
function top(map,minN=2){return Object.entries(map||{}).map(([key,b])=>({key,...metric(b)})).filter(x=>x.closed>=minN).sort((a,b)=>b.net-a.net||b.closed-a.closed).slice(0,3);}
function summary(){const long=bucket(),short=bucket();for(const row of readRows()){const side=String(row?.pos?.yon||'').toUpperCase();if(side==='LONG')add(long,row);else if(side==='SHORT')add(short,row);}const L=metric(long),S=metric(short);return {version:'v5.6.9',long:L,short:S,longPatterns:top(long.patterns,2),shortPatterns:top(short.patterns,2),longRelations:top(long.relations,2),shortRelations:top(short.relations,2)};}
function fmt(x){return `${x>=0?'+':''}${n(x).toFixed(4)}`;}
function telegram(){const x=summary(),L=x.long,S=x.short;let t='🧠 <b>KAZANMA / KAYBETME ZEKÂSI</b>\n';t+=`🟢 LONG N${L.closed} | ✅${L.win} ❌${L.loss} ⚖️${L.be} | WR %${L.wr.toFixed(1)} | Net ${fmt(L.net)} | PF ${L.pf>=999?'∞':L.pf.toFixed(2)} | Ort.Kazanç ${fmt(L.avgWin)} | Ort.Kayıp ${fmt(L.avgLoss)}\n`;
t+=`🔴 SHORT N${S.closed} | ✅${S.win} ❌${S.loss} ⚖️${S.be} | WR %${S.wr.toFixed(1)} | Net ${fmt(S.net)} | PF ${S.pf>=999?'∞':S.pf.toFixed(2)} | Ort.Kazanç ${fmt(S.avgWin)} | Ort.Kayıp ${fmt(S.avgLoss)}\n`;
if(S.win>S.loss&&S.net<0)t+=`⚠️ SHORT yüksek isabete rağmen ekside: ortalama kayıp, ortalama kazancı aşıyor.\n`;
const lr=x.longRelations.filter(r=>r.key!=='VERI_YOK'); if(lr.length)t+=`🤝 LONG'u destekleyen BTC/Coin: ${lr.map(r=>`${r.key} N${r.closed} Net${fmt(r.net)}`).join(' | ')}\n`; else t+='🤝 LONG BTC/Coin ilişkisi: açılış snapshot verisi bekleniyor.\n';
const sr=x.shortRelations.filter(r=>r.key!=='VERI_YOK'); if(sr.length)t+=`🤝 SHORT BTC/Coin: ${sr.map(r=>`${r.key} N${r.closed} Net${fmt(r.net)}`).join(' | ')}\n`; else t+='🤝 SHORT BTC/Coin ilişkisi: açılış snapshot verisi bekleniyor.\n';
return t.trim();}
module.exports={LEDGER_FILE,summary,telegram,actualNet,relation};
