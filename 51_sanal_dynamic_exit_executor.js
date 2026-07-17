/**
 * AGROS v4.2.1 - SANAL DYNAMIC EXIT EXECUTOR
 * Dynamic DNA exit planını yalnızca sanal pozisyonlarda uygular.
 * Gerçek emir ve borsa SL/TP emirlerine müdahale etmez.
 */
const ayarlar = require('./ayarlar.js');

const VERSION = 'v4.3.1-ATR-LIVE-EXIT';
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d;}
function pnlPct(pos, price){return pos.yon==='LONG'?((price-pos.girisFiyati)/pos.girisFiyati)*100:((pos.girisFiyati-price)/pos.girisFiyati)*100;}
function targetPrice(pos,pct){return pos.yon==='LONG'?pos.girisFiyati*(1+pct/100):pos.girisFiyati*(1-pct/100);}
function state(pos){
  pos.dynamicExitRuntime=pos.dynamicExitRuntime||{version:VERSION,peakPct:0,path:[],startedAt:Date.now(),fallbackReason:''};
  return pos.dynamicExitRuntime;
}
function isSupported(id=''){
  return /^TIME_\d+M$/.test(id)||/^FIXED_TP_/.test(id)||/^MFE_PROTECT_\d+$/.test(id)||/^ALT_LADDER_(FAST|WIDE)$/.test(id)||/^ATR_TRAIL_\d+_\d+X$/.test(id)||id==='DYNAMIC_PATH_EXIT'||id==='HYBRID_TREND_MFE';
}
function evaluate(pos, price){
  const virtualEnabled=pos?.sanal&&ayarlar.sanalDynamicExitAktif===true;
  const realEnabled=!pos?.sanal&&ayarlar.gercekDynamicExitAktif===true&&pos?.realOrderReadiness?.allowed===true;
  if(!virtualEnabled&&!realEnabled)return {active:false,reason:pos?.sanal?'SANAL_DYNAMIC_EXIT_KAPALI':'GERCEK_DYNAMIC_EXIT_KILITLI'};
  const plan=pos.exitPlanShadow;
  if(!plan?.ready||!plan.selectedAlgorithmId||plan.selectedAlgorithmId==='ACTUAL')return {active:false,reason:'KANITLI_EXIT_YOK'};
  const id=String(plan.selectedAlgorithmId);
  if(!isSupported(id))return {active:false,fallback:true,reason:`DESTEKLENMEYEN_MODEL_${id}`};
  const rt=state(pos), now=Date.now(), p=pnlPct(pos,price), minute=Math.max(0,(now-num(pos.acilisZamani,now))/60000);
  const latestPath=Array.isArray(pos?.execution?.pricePath)?pos.execution.pricePath[pos.execution.pricePath.length-1]:null;
  const atrPct=Number.isFinite(Number(latestPath?.atrPct))&&Number(latestPath.atrPct)>0?Number(latestPath.atrPct):null;
  if(p>=num(rt.peakPct)){rt.peakPct=p;if(atrPct)rt.peakAtrPct=atrPct;}
  rt.path.push({ts:now,pnlPct:p,atrPct});
  const maxPoints=Math.max(20,num(ayarlar.sanalDynamicExitMaksPathNoktasi,240));
  if(rt.path.length>maxPoints)rt.path=rt.path.slice(-maxPoints);
  const close=(reason,exitPrice=price)=>({active:true,close:true,price:exitPrice,reason:`Dynamic Exit: ${plan.selectedAlgorithmLabel} | ${reason}`,algorithmId:id,algorithmLabel:plan.selectedAlgorithmLabel,pnlPct:p,minute,peakPct:rt.peakPct});

  const tm=id.match(/^TIME_(\d+)M$/); if(tm&&minute>=num(tm[1]))return close(`${tm[1]} dakika tamamlandı`);
  if(id.startsWith('FIXED_TP_')){const level=num(id.replace('FIXED_TP_','').replace('_','.'));if(level>0&&p>=level)return close(`Sabit hedef %${level}`,targetPrice(pos,level));}
  const mfe=id.match(/^MFE_PROTECT_(\d+)$/);if(mfe){const ratio=num(mfe[1])/100;if(rt.peakPct>0&&p<=rt.peakPct*ratio)return close(`Tepe kârın %${mfe[1]} koruması`);}
  const atr=id.match(/^ATR_TRAIL_(\d+)_(\d+)X$/);if(atr){const multiplier=num(`${atr[1]}.${atr[2]}`);const peakAtr=num(rt.peakAtrPct,atrPct);if(peakAtr>0&&rt.peakPct>0&&p<=rt.peakPct-(peakAtr*multiplier))return close(`Tepe kârdan ${multiplier} ATR geri çekilme | ATR %${peakAtr.toFixed(4)}`);}
  if(id.startsWith('ALT_LADDER_')){
    const fast=id.endsWith('FAST'); const triggers=fast?[0.3,0.6,1.0,2.0]:[0.5,1.2,2.5,4.0]; const floors=fast?[0.0,0.2,0.5,1.2]:[0.0,0.4,1.2,2.5];
    let idx=-1;for(let i=0;i<triggers.length;i++)if(rt.peakPct>=triggers[i])idx=i;
    if(idx>=0&&p<=floors[idx])return close(`Alternatif kademe ${idx+1}, taban %${floors[idx]}`,targetPrice(pos,floors[idx]));
  }
  if(id==='DYNAMIC_PATH_EXIT'){
    const recent=rt.path.slice(-6);let noise=0;if(recent.length>1){for(let i=1;i<recent.length;i++)noise+=Math.abs(recent[i].pnlPct-recent[i-1].pnlPct);noise/=recent.length-1;}
    const capture=noise<0.18?0.55:0.65;const minPeak=minute<15?0.6:0.35;
    if(rt.peakPct>=minPeak&&p<=rt.peakPct*capture)return close(`Dinamik tepe koruması %${Math.round(capture*100)}`);
  }
  if(id==='HYBRID_TREND_MFE'){
    if(minute>15&&minute<=60&&rt.peakPct>=0.5&&p<=rt.peakPct*0.68)return close('Orta dönem MFE %68');
    if(minute>60&&rt.peakPct>=0.3&&p<=rt.peakPct*0.82)return close('Geç dönem MFE %82');
  }
  return {active:true,close:false,algorithmId:id,algorithmLabel:plan.selectedAlgorithmLabel,pnlPct:p,minute,peakPct:rt.peakPct};
}
module.exports={VERSION,isSupported,evaluate};
