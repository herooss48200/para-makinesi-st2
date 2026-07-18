/**
 * AGROS v4.3.1 - EXIT METHOD SCOREBOARD
 * Her pozisyonun atanmış/uygulanmış exit metodunu kalıcı olarak sayar.
 */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data', 'exit-method-scoreboard.json');
const VERSION = 'v4.3.1-EXIT-METHOD-SCOREBOARD';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function ensure(){const d=path.dirname(FILE);if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});}
function empty(){return{version:VERSION,createdAt:new Date().toISOString(),updatedAt:null,totalOpened:0,totalClosed:0,methods:{}};}
function read(){try{return JSON.parse(fs.readFileSync(FILE,'utf8'));}catch(_){return empty();}}
function write(m){ensure();m.updatedAt=new Date().toISOString();const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(m,null,2));fs.renameSync(tmp,FILE);}
function methodFor(pos){
  const applied=pos?.dynamicExitApplied;
  if(applied?.algorithmId)return{id:String(applied.algorithmId),label:applied.algorithmLabel||applied.algorithmId,source:'DYNAMIC_APPLIED'};
  const plan=pos?.exitPlanShadow;
  if(plan?.ready&&plan?.selectedAlgorithmId&&plan.selectedAlgorithmId!=='ACTUAL')return{id:String(plan.selectedAlgorithmId),label:plan.selectedAlgorithmLabel||plan.selectedAlgorithmId,source:'ASSIGNED_DYNAMIC'};
  return{id:'ACTUAL',label:'Mevcut Kademe Sistemi',source:'KADEME_FALLBACK'};
}
function bucket(m,method){return m.methods[method.id]||(m.methods[method.id]={id:method.id,label:method.label,opened:0,closed:0,tp:0,sl:0,be:0,net:0,commission:0,grossProfit:0,grossLoss:0,source:method.source});}
function open(pos){if(!pos||pos.exitMethodScoreboardOpened)return null;const m=read(),method=methodFor(pos),b=bucket(m,method);b.opened++;m.totalOpened++;pos.exitMethodScoreboardOpened={id:method.id,label:method.label,at:Date.now()};write(m);return b;}
function close(pos,result={}){if(!pos||pos.exitMethodScoreboardClosed)return null;const m=read(),method=methodFor(pos),b=bucket(m,method);b.closed++;m.totalClosed++;const outcome=String(result.outcome||'SL');if(outcome==='TP')b.tp++;else if(outcome==='BE')b.be++;else b.sl++;const net=num(result.net);b.net+=net;b.commission+=num(result.commission);if(net>0)b.grossProfit+=net;else if(net<0)b.grossLoss+=Math.abs(net);pos.exitMethodScoreboardClosed={id:method.id,label:method.label,at:Date.now()};write(m);return summary(b,method);}
function summary(b,method={}){const decisive=num(b.tp)+num(b.sl);const success=decisive?(num(b.tp)/decisive)*100:0;const pf=num(b.grossLoss)>0?num(b.grossProfit)/num(b.grossLoss):(num(b.grossProfit)>0?Infinity:0);const exp=num(b.closed)?num(b.net)/num(b.closed):0;return{...b,id:method.id||b.id,label:method.label||b.label,success,pf,expectancy:exp};}
function display(pos){const m=read(),method=methodFor(pos),b=m.methods[method.id];return b?summary(b,method):{id:method.id,label:method.label,opened:0,closed:0,tp:0,sl:0,be:0,net:0,success:0,pf:0,expectancy:0};}
function telegramLine(s,options={}){if(!s)return'';const pf=Number.isFinite(s.pf)?s.pf.toFixed(2):'∞';const restartGap=options.restartGap===true;const outcome=String(options.currentOutcome||'').toUpperCase();const baslik=restartGap?'📒 Metot Çetelesi (bu kapanış hariç)':'📒 Metot Çetelesi';const gapNotu=restartGap?`\n🧾 Bu kapanışın muhasebe sonucu: <b>${outcome||'BELİRSİZ'}</b> | Çetele ve öğrenme: <b>HARİÇ (RESTART GAP)</b>`:'';return `\n🎯 Exit Metodu: <b>${s.label}</b>\n${baslik}: Açılan ${s.opened} | Kapalı ${s.closed} | TP ${s.tp} SL ${s.sl} BE ${s.be} | Başarı %${s.success.toFixed(1)} | Net ${s.net>=0?'+':''}${s.net.toFixed(4)} | PF ${pf} | Exp ${s.expectancy>=0?'+':''}${s.expectancy.toFixed(4)}${gapNotu}`;}
module.exports={VERSION,FILE,read,open,close,display,methodFor,telegramLine};
