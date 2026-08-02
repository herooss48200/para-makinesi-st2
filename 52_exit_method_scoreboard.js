/**
 * AGROS ST2 v6.8.2 — EXIT METHOD + ASSIGNMENT SCOREBOARD
 * Separates the method that was assigned at opening from the method that actually
 * closed the position. This removes survivor bias from ATR/MFE takeover reports.
 */
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'exit-method-scoreboard.json');
const VERSION = 'v6.8.2-EXIT-ASSIGNMENT-RECONCILIATION';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function ensure(){if(!fs.existsSync(DATA_DIR))fs.mkdirSync(DATA_DIR,{recursive:true});}
function empty(){return{version:VERSION,createdAt:new Date().toISOString(),updatedAt:null,totalOpened:0,totalClosed:0,methodMigrations:0,methods:{},assignments:{}};}
function normalize(raw){const m={...empty(),...(raw||{})};m.methods=m.methods&&typeof m.methods==='object'?m.methods:{};m.assignments=m.assignments&&typeof m.assignments==='object'?m.assignments:{};return m;}
function read(){try{return normalize(JSON.parse(fs.readFileSync(FILE,'utf8')));}catch(_){return empty();}}
function write(m){ensure();m=normalize(m);m.version=VERSION;m.updatedAt=new Date().toISOString();const tmp=FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(m,null,2));fs.renameSync(tmp,FILE);return m;}
function methodFor(pos){
  const applied=pos?.dynamicExitApplied;
  if(applied?.algorithmId)return{id:String(applied.algorithmId),label:applied.algorithmLabel||applied.algorithmId,source:'DYNAMIC_APPLIED'};
  if(pos?.renkoExitActivated===true){
    const brick=String(pos?.renkoExitAssignment?.liveExitMode||'').toUpperCase()==='SAFE_COMMISSION_BRICK_TRAIL';
    return brick
      ? {id:'RENKO_COMMISSION_SAFE_BRICK_TRAIL',label:'Komisyon Güvenli Renko Tuğla Takibi',source:'RENKO_BRICK_APPLIED',detail:pos?.renkoExitLastStopSourceLabel||`${num(pos?.renkoExitAssignment?.assignedTrailBricks,1).toFixed(2)}T takip`}
      : {id:'RENKO_ADAPTIVE_ATR_MFE',label:'Öğrenen ATR + MFE Kâr Takibi',source:'RENKO_ADAPTIVE_APPLIED',detail:pos?.renkoExitLastStopSourceLabel||'Takeover aktif'};
  }
  const plan=pos?.exitPlanShadow;
  if(plan?.ready&&plan?.selectedAlgorithmId&&plan.selectedAlgorithmId!=='ACTUAL')return{id:String(plan.selectedAlgorithmId),label:plan.selectedAlgorithmLabel||plan.selectedAlgorithmId,source:'ASSIGNED_DYNAMIC'};
  return{id:'ACTUAL',label:'Başlangıç Stop / Mevcut Kademe',source:'PRE_TAKEOVER_OR_FALLBACK'};
}
function assignmentFor(pos){
  const a=pos?.renkoExitAssignment;
  if(a){
    const brick=String(a.liveExitMode||'').toUpperCase()==='SAFE_COMMISSION_BRICK_TRAIL';
    return brick
      ? {id:'RENKO_COMMISSION_SAFE_BRICK_TRAIL',label:'Komisyon Güvenli Renko Tuğla Takibi',source:'ASSIGNED_AT_OPEN',detail:`Brüt taban %${num(a.assignedSafeFloorPct).toFixed(2)} | Min net %${num(a.assignedMinimumNetProfitPct,Math.max(0,num(a.assignedSafeFloorPct)-0.10)).toFixed(2)} | Trail ${num(a.assignedTrailBricks,1).toFixed(2)}T`}
      : {id:'RENKO_ADAPTIVE_ATR_MFE',label:'Öğrenen ATR + MFE Kâr Takibi',source:'ASSIGNED_AT_OPEN',detail:`Takeover %${num(a.assignedTakeoverPct).toFixed(2)} | ATR ${num(a.assignedAtrMultiplier).toFixed(2)}× | MFE %${(num(a.assignedCaptureRatio)*100).toFixed(0)}`};
  }
  const plan=pos?.exitPlanShadow;
  if(plan?.ready&&plan?.selectedAlgorithmId&&plan.selectedAlgorithmId!=='ACTUAL')return{id:String(plan.selectedAlgorithmId),label:plan.selectedAlgorithmLabel||plan.selectedAlgorithmId,source:'ASSIGNED_AT_OPEN'};
  return{id:'ACTUAL',label:'Mevcut Kademe Sistemi',source:'ASSIGNED_FALLBACK'};
}
function methodBucket(m,method){
  const b=m.methods[method.id]||(m.methods[method.id]={id:method.id,label:method.label,opened:0,closed:0,tp:0,sl:0,be:0,net:0,commission:0,grossProfit:0,grossLoss:0,source:method.source});
  b.label=method.label||b.label;b.source=method.source||b.source;return b;
}
function assignmentBucket(m,assignment){
  const b=m.assignments[assignment.id]||(m.assignments[assignment.id]={id:assignment.id,label:assignment.label,assigned:0,closed:0,takeoverReached:0,preTakeoverSl:0,preTakeoverProfit:0,postTakeoverProfit:0,postTakeoverLoss:0,be:0,net:0,commission:0,grossProfit:0,grossLoss:0,source:assignment.source});
  b.label=assignment.label||b.label;b.source=assignment.source||b.source;return b;
}
function outcomeAdd(b,outcome,net){
  if(outcome==='TP')b.tp=num(b.tp)+1;else if(outcome==='BE')b.be=num(b.be)+1;else b.sl=num(b.sl)+1;
  b.net=num(b.net)+net;if(net>0)b.grossProfit=num(b.grossProfit)+net;else if(net<0)b.grossLoss=num(b.grossLoss)+Math.abs(net);
}
function open(pos){
  if(!pos||pos.exitMethodScoreboardOpened)return null;
  const m=read(),method=methodFor(pos),assignment=assignmentFor(pos);
  methodBucket(m,method).opened++;m.totalOpened++;
  assignmentBucket(m,assignment).assigned++;
  pos.exitMethodScoreboardOpened={id:method.id,label:method.label,assignmentId:assignment.id,assignmentLabel:assignment.label,at:Date.now()};
  write(m);return{method:methodBucket(m,method),assignment:assignmentBucket(m,assignment)};
}
function takeoverReached(pos){return pos?.renkoExitActivated===true||(Array.isArray(pos?.renkoProtectionTimeline)&&pos.renkoProtectionTimeline.some(x=>x?.type==='TAKEOVER_ACTIVE'));}
function assignmentClose(b,pos,outcome,net,commission){
  b.closed=num(b.closed)+1;b.net=num(b.net)+net;b.commission=num(b.commission)+commission;
  if(net>0)b.grossProfit=num(b.grossProfit)+net;else if(net<0)b.grossLoss=num(b.grossLoss)+Math.abs(net);
  const takeover=takeoverReached(pos);if(takeover)b.takeoverReached=num(b.takeoverReached)+1;
  if(outcome==='BE')b.be=num(b.be)+1;
  else if(takeover&&outcome==='TP')b.postTakeoverProfit=num(b.postTakeoverProfit)+1;
  else if(takeover&&outcome==='SL')b.postTakeoverLoss=num(b.postTakeoverLoss)+1;
  else if(!takeover&&outcome==='SL')b.preTakeoverSl=num(b.preTakeoverSl)+1;
  else if(!takeover&&outcome==='TP')b.preTakeoverProfit=num(b.preTakeoverProfit)+1;
}
function close(pos,result={}){
  if(!pos||pos.exitMethodScoreboardClosed)return null;
  const m=read(),method=methodFor(pos),assignment=assignmentFor(pos),opened=pos.exitMethodScoreboardOpened;
  const b=methodBucket(m,method);
  if(opened?.id&&opened.id!==method.id){const old=m.methods[opened.id];if(old)old.opened=Math.max(0,num(old.opened)-1);b.opened++;m.methodMigrations=num(m.methodMigrations)+1;pos.exitMethodScoreboardMigrated={from:opened.id,to:method.id,at:Date.now()};}
  b.closed++;m.totalClosed++;
  const outcome=String(result.outcome||'SL').toUpperCase();const net=num(result.net);const commission=num(result.commission);
  outcomeAdd(b,outcome,net);b.commission=num(b.commission)+commission;
  const assigned=assignmentBucket(m,assignment);assignmentClose(assigned,pos,outcome,net,commission);
  pos.exitMethodScoreboardClosed={id:method.id,label:method.label,assignmentId:assignment.id,assignmentLabel:assignment.label,detail:method.detail||null,takeoverReached:takeoverReached(pos),at:Date.now()};
  write(m);return summary(b,method,assigned,assignment);
}
function metrics(b={}){const decisive=num(b.tp)+num(b.sl);const success=decisive?num(b.tp)/decisive*100:0;const pf=num(b.grossLoss)>0?num(b.grossProfit)/num(b.grossLoss):(num(b.grossProfit)>0?Infinity:0);const exp=num(b.closed)?num(b.net)/num(b.closed):0;return{...b,success,pf,expectancy:exp};}
function assignmentMetrics(b={}){const classified=num(b.preTakeoverSl)+num(b.preTakeoverProfit)+num(b.postTakeoverProfit)+num(b.postTakeoverLoss)+num(b.be);const pf=num(b.grossLoss)>0?num(b.grossProfit)/num(b.grossLoss):(num(b.grossProfit)>0?Infinity:0);return{...b,classified,reconciled:num(b.closed)===classified,pf,expectancy:num(b.closed)?num(b.net)/num(b.closed):0,takeoverRate:num(b.closed)?num(b.takeoverReached)/num(b.closed)*100:0};}
function summary(b,method={},assigned=null,assignment={}){return{method:metrics({...b,id:method.id||b.id,label:method.label||b.label,detail:method.detail||null}),assignment:assignmentMetrics({...assigned,id:assignment.id||assigned?.id,label:assignment.label||assigned?.label,detail:assignment.detail||null})};}
function display(pos){const m=read(),method=methodFor(pos),assignment=assignmentFor(pos),b=m.methods[method.id],a=m.assignments[assignment.id];return summary(b||{id:method.id,label:method.label,opened:0,closed:0,tp:0,sl:0,be:0,net:0,grossProfit:0,grossLoss:0},method,a||{id:assignment.id,label:assignment.label,assigned:0,closed:0,takeoverReached:0,preTakeoverSl:0,preTakeoverProfit:0,postTakeoverProfit:0,postTakeoverLoss:0,be:0,net:0,grossProfit:0,grossLoss:0},assignment);}
function telegramLine(s,options={}){
  if(!s)return'';const method=s.method||s;const a=s.assignment||null;const restartGap=options.restartGap===true;const outcome=String(options.currentOutcome||'').toUpperCase();
  const methodPf=Number.isFinite(method.pf)?method.pf.toFixed(2):'∞';
  let text=`\n🎯 Gerçek uygulanan Exit: <b>${method.label}</b>${method.detail?` | ${method.detail}`:''}`;
  if(a){const pf=Number.isFinite(a.pf)?a.pf.toFixed(2):'∞';text+=`\n📒 <b>ATAMA PERFORMANSI — ${a.label}</b>${restartGap?' (bu kapanış hariç)':''}`;
    const brick=String(a.id||'').includes('BRICK_TRAIL');
    text+=`\nAtanan ${num(a.assigned)} | Kapalı ${num(a.closed)} | ${brick?'Renko takip devrede':'Takeover'} ${num(a.takeoverReached)} (%${num(a.takeoverRate).toFixed(1)})`;
    text+=`\n${brick?'Renko takip öncesi':'Takeover öncesi'}: SL ${num(a.preTakeoverSl)} | Kârlı ${num(a.preTakeoverProfit)} | BE ${num(a.be)}`;
    text+=`\n${brick?'Renko takip sonrası':'Takeover sonrası'}: Kârlı ${num(a.postTakeoverProfit)} | Zararlı ${num(a.postTakeoverLoss)}`;
    text+=`\nMutabakat: ${num(a.closed)} = ${num(a.classified)} ${a.reconciled?'✅':'⚠️'} | Net ${num(a.net)>=0?'+':''}${num(a.net).toFixed(4)} | PF ${pf} | Exp ${num(a.expectancy)>=0?'+':''}${num(a.expectancy).toFixed(4)}`;
  } else text+=`\nMetot çetelesi: Açılan ${num(method.opened)} | Kapalı ${num(method.closed)} | TP ${num(method.tp)} SL ${num(method.sl)} BE ${num(method.be)} | PF ${methodPf}`;
  if(restartGap)text+=`\n🧾 Bu kapanışın muhasebe sonucu: <b>${outcome||'BELİRSİZ'}</b> | Çetele/öğrenme: <b>HARİÇ (RESTART GAP)</b>`;
  return text;
}
module.exports={VERSION,FILE,read,write,open,close,display,methodFor,assignmentFor,takeoverReached,telegramLine,assignmentMetrics};
