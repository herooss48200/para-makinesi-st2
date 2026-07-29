/**
 * AGROS ST2 v6.7.2 - EXIT METHOD SCOREBOARD
 * Her pozisyonun kapanışta gerçekten uygulanan exit metodunu kalıcı olarak sayar.
 */
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'exit-method-scoreboard.json');
const VERSION = 'v6.7.2-EXIT-METHOD-SCOREBOARD-TRUTH';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function ensure(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});}
function empty(){return{version:VERSION,createdAt:new Date().toISOString(),updatedAt:null,totalOpened:0,totalClosed:0,methodMigrations:0,methods:{}};}
function read(){try{return{...empty(),...JSON.parse(fs.readFileSync(FILE,'utf8'))};}catch(_){return empty();}}
function write(m){ensure();m.version=VERSION;m.updatedAt=new Date().toISOString();const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(m,null,2));fs.renameSync(tmp,FILE);}
function methodFor(pos){
  const applied=pos?.dynamicExitApplied;
  if(applied?.algorithmId)return{id:String(applied.algorithmId),label:applied.algorithmLabel||applied.algorithmId,source:'DYNAMIC_APPLIED'};
  if(pos?.renkoExitActivated===true){
    return{id:'RENKO_ADAPTIVE_ATR_MFE',label:'Öğrenen ATR + MFE Kâr Takibi',source:'RENKO_ADAPTIVE_APPLIED',detail:pos?.renkoExitLastStopSourceLabel||'Devralma aktif'};
  }
  const plan=pos?.exitPlanShadow;
  if(plan?.ready&&plan?.selectedAlgorithmId&&plan.selectedAlgorithmId!=='ACTUAL')return{id:String(plan.selectedAlgorithmId),label:plan.selectedAlgorithmLabel||plan.selectedAlgorithmId,source:'ASSIGNED_DYNAMIC'};
  return{id:'ACTUAL',label:'Mevcut Kademe Sistemi',source:'KADEME_FALLBACK'};
}
function bucket(m,method){
  const b=m.methods[method.id]||(m.methods[method.id]={id:method.id,label:method.label,opened:0,closed:0,tp:0,sl:0,be:0,net:0,commission:0,grossProfit:0,grossLoss:0,source:method.source});
  b.label=method.label||b.label;b.source=method.source||b.source;return b;
}
function open(pos){
  if(!pos||pos.exitMethodScoreboardOpened)return null;
  const m=read(),method=methodFor(pos),b=bucket(m,method);b.opened++;m.totalOpened++;
  pos.exitMethodScoreboardOpened={id:method.id,label:method.label,at:Date.now()};write(m);return b;
}
function close(pos,result={}){
  if(!pos||pos.exitMethodScoreboardClosed)return null;
  const m=read(),method=methodFor(pos),opened=pos.exitMethodScoreboardOpened;
  const b=bucket(m,method);
  // Pozisyon açılışta kademe fallback olarak kaydedilmiş, sonra öğrenen ATR devralmış olabilir.
  // Açılan sayısını kapanışta gerçekten uygulanan metoda bir kez taşı; toplam açılan değişmez.
  if(opened?.id&&opened.id!==method.id){
    const old=m.methods[opened.id];
    if(old)old.opened=Math.max(0,num(old.opened)-1);
    b.opened++;
    m.methodMigrations=num(m.methodMigrations)+1;
    pos.exitMethodScoreboardMigrated={from:opened.id,to:method.id,at:Date.now()};
  }
  b.closed++;m.totalClosed++;
  const outcome=String(result.outcome||'SL').toUpperCase();
  if(outcome==='TP')b.tp++;else if(outcome==='BE')b.be++;else b.sl++;
  const net=num(result.net);b.net+=net;b.commission+=num(result.commission);
  if(net>0)b.grossProfit+=net;else if(net<0)b.grossLoss+=Math.abs(net);
  pos.exitMethodScoreboardClosed={id:method.id,label:method.label,detail:method.detail||null,at:Date.now()};
  write(m);return summary(b,method);
}
function summary(b,method={}){
  const decisive=num(b.tp)+num(b.sl);const success=decisive?(num(b.tp)/decisive)*100:0;
  const pf=num(b.grossLoss)>0?num(b.grossProfit)/num(b.grossLoss):(num(b.grossProfit)>0?Infinity:0);
  const exp=num(b.closed)?num(b.net)/num(b.closed):0;
  return{...b,id:method.id||b.id,label:method.label||b.label,detail:method.detail||null,success,pf,expectancy:exp};
}
function display(pos){const m=read(),method=methodFor(pos),b=m.methods[method.id];return b?summary(b,method):{id:method.id,label:method.label,detail:method.detail||null,opened:0,closed:0,tp:0,sl:0,be:0,net:0,success:0,pf:0,expectancy:0};}
function telegramLine(s,options={}){
  if(!s)return'';const pf=Number.isFinite(s.pf)?s.pf.toFixed(2):'∞';const restartGap=options.restartGap===true;
  const outcome=String(options.currentOutcome||'').toUpperCase();const baslik=restartGap?'📒 Metot Çetelesi (bu kapanış hariç)':'📒 Metot Çetelesi';
  const detay=s.detail?` | ${s.detail}`:'';
  const gapNotu=restartGap?`\n🧾 Bu kapanışın muhasebe sonucu: <b>${outcome||'BELİRSİZ'}</b> | Çetele ve öğrenme: <b>HARİÇ (RESTART GAP)</b>`:'';
  return `\n🎯 Exit Metodu: <b>${s.label}</b>${detay}\n${baslik}: Açılan ${s.opened} | Kapalı ${s.closed} | TP ${s.tp} SL ${s.sl} BE ${s.be} | Başarı %${s.success.toFixed(1)} | Net ${s.net>=0?'+':''}${s.net.toFixed(4)} | PF ${pf} | Exp ${s.expectancy>=0?'+':''}${s.expectancy.toFixed(4)}${gapNotu}`;
}
module.exports={VERSION,FILE,read,open,close,display,methodFor,telegramLine};
