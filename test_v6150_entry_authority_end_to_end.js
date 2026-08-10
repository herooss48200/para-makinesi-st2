'use strict';
const assert = require('assert');
const Module = require('module');

const calls=[];
const state={
  canliFiyatlar:{},
  st2Renko:{pusular:{},seriler:{TESTUSDT:[{color:'RED',close:100,closeTime:200}]},onaySerileri1m:{},sonPatternSignature:{},pusuTelegramBildirimleri:{},sonIptalPatternSignature:{},boxSize:{TESTUSDT:1},onayBoxSize1m:{TESTUSDT:99}}
};
const h={state};
const ayarlar={renkoKaynakPeriyodu:'15m',renkoOnayPeriyodu:'1m',renkoBbTemasToleransTugla:0.25,renkoProofConsoleAktif:false};
const motor={pozisyonAc:async(sym,yon,price,girisAnalizi)=>{calls.push({sym,yon,price,girisAnalizi});return true;}};
const core={};
const entryEvolution={
  DEFAULT_BRICK:()=>0.5,
  targetPrice:(pusu,brick)=>pusu.yon==='LONG'?Number(pusu.referansSeviye)+Number(pusu.renkoBoxSize||1)*Number(brick):Number(pusu.referansSeviye)-Number(pusu.renkoBoxSize||1)*Number(brick),
  activeFor:()=>0.5
};
const adaptive={
  gateDecision:(pusu,brick)=>({brick:Number(brick),executionMode:'PREMIER',reason:'TEST_OK'}),
  select:(pusu,fallback)=>({brick:Number(fallback),source:'TEST',reason:'TEST'}),
  dnaKey:()=> 'TEST', contextFrom:()=>({})
};
const premier={activePolicy:()=>({source:'TEST'}),weightedComponentText:()=>'',metricText:()=>''};
const dedupe={temizle:()=>({removed:0})};
const st1={degerlendir:()=>({uygun:false,hardReject:false,reason:'SHADOW_ONLY'})};
const williams={entrySnapshot:()=>({pattern:'NONE',turnState:null})};
const confShadow={entrySnapshot:()=>({status:'SHADOW'})};
let selectedMode='DIRECT';
const policy={
  select:()=>({selectedMode,selectedOffsetT:selectedMode==='CONFIRMED'?0.25:0.5}),
  confirmationTarget:(pusu,bricks,box)=>({ready:true,targetPrice:Number(pusu.referansSeviye)+Number(box||1)*0.25,reason:'READY'})
};

const original=Module._load;
Module._load=function(req,parent,isMain){
  if(parent?.filename?.endsWith('72_st2_renko_entry.js')){
    if(req==='./1_hafiza.js') return h;
    if(req==='./ayarlar.js') return ayarlar;
    if(req==='./motor.js') return motor;
    if(req==='./72_st2_renko_core.js') return core;
    if(req==='./73_st2_renko_entry_evolution.js') return entryEvolution;
    if(req==='./76_st2_adaptive_dna_entry.js') return adaptive;
    if(req==='./83_st2_premier_quality_score.js') return premier;
    if(req==='./81_st2_pusu_notification_dedupe.js') return dedupe;
    if(req==='./87_st2_st1_entry_gate.js') return st1;
    if(req==='./88_st2_williams_cycle_shadow_lab.js') return williams;
    if(req==='./89_st2_renko_entry_confirmation_shadow_lab.js') return confShadow;
    if(req==='./90_st2_renko_entry_mode_policy.js') return policy;
  }
  return original.apply(this,arguments);
};

function basePusu(mode){
  return {
    sym:'TESTUSDT',yon:'LONG',referansSeviye:100,renkoBoxSize:1,
    patternKodu:'RRRR',patternId:'L01',patternAilesi:'TEST',patternUzunlugu:4,
    patternSignature:`SIG-${mode}`,olusumZamani:Date.now()-1000,
    renkoEntryBrickDistance:0.5,
    adaptiveEntryDecisionAtSignal:{brick:0.5,source:'TEST_FROZEN',reason:'TEST'},
    entryModeDecisionAtSignal:{selectedMode:mode,selectedOffsetT:mode==='CONFIRMED'?0.25:0.5},
    senaryo:{},renkoSon10Tugla:[],renkoSonTuglaDizisi:'RRRR'
  };
}

(async()=>{
  let entry;
  try{delete require.cache[require.resolve('./72_st2_renko_entry.js')];entry=require('./72_st2_renko_entry.js');}
  finally{Module._load=original;}

  state.st2Renko.pusular.TESTUSDT=basePusu('DIRECT');
  state.canliFiyatlar.TESTUSDT=100.6;
  const directAudit={pusuDegerlendirilen:0,fiyatEksik:0,fiyatBekleyen:0,fiyatTetigi:0,stOnayi:0,stReddi:0,st1GateUygun:0,st1GateBekleyen:0,birlikteUygun:0,pozisyonAcildi:0,pozisyonReddedildi:0};
  const directOk=await entry.pusuDegerlendir('TESTUSDT',{trend:'UP',bricks:[]},directAudit);
  assert.strictEqual(directOk,true);
  assert.strictEqual(calls.length,1,'DIRECT valid trigger must reach pozisyonAc exactly once');
  assert.strictEqual(calls[0].girisAnalizi.entryMode,'DIRECT');
  assert.strictEqual(calls[0].girisAnalizi.entryTimingAuthority,'RENKO_EVOLUTION_1M_RENKO_ST');
  assert.strictEqual(directAudit.birlikteUygun,1);
  assert.strictEqual(directAudit.pozisyonAcildi,1);
  assert.strictEqual(directAudit.entryModeDirect,1);
  assert.strictEqual(Number(directAudit.entryModeConfirmed||0),0);

  selectedMode='CONFIRMED';
  state.st2Renko.pusular.TESTUSDT=basePusu('CONFIRMED');
  state.canliFiyatlar.TESTUSDT=100.3;
  const confirmedAudit={pusuDegerlendirilen:0,fiyatEksik:0,fiyatBekleyen:0,fiyatTetigi:0,stOnayi:0,stReddi:0,st1GateUygun:0,st1GateBekleyen:0,birlikteUygun:0,pozisyonAcildi:0,pozisyonReddedildi:0};
  const confirmedOk=await entry.pusuDegerlendir('TESTUSDT',{trend:'UP',bricks:[{close:100,closeTime:Date.now()-500}]},confirmedAudit);
  assert.strictEqual(confirmedOk,true);
  assert.strictEqual(calls.length,2,'CONFIRMED valid trigger must reach the SAME pozisyonAc layer exactly once');
  assert.strictEqual(calls[1].girisAnalizi.entryMode,'CONFIRMED');
  assert.strictEqual(calls[1].girisAnalizi.entryTimingAuthority,'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_1M_ST');
  assert.strictEqual(confirmedAudit.birlikteUygun,1);
  assert.strictEqual(confirmedAudit.pozisyonAcildi,1);
  assert.strictEqual(confirmedAudit.entryModeConfirmed,1);
  assert.strictEqual(confirmedAudit.confirmedReady,1);


  // CONFIRMED seçildi ama kapanmış dönüş henüz yoksa motor sessizce ölmez; neden audit'e açık yazılır.
  policy.confirmationTarget=(pusu,bricks,box)=>({ready:false,targetPrice:0,reason:'CLOSED_REVERSAL_NOT_FOUND'});
  state.st2Renko.pusular.TESTUSDT=basePusu('CONFIRMED');
  state.canliFiyatlar.TESTUSDT=100.3;
  const waitingAudit={pusuDegerlendirilen:0,fiyatEksik:0,fiyatBekleyen:0,fiyatTetigi:0,stOnayi:0,stReddi:0,st1GateUygun:0,st1GateBekleyen:0,birlikteUygun:0,pozisyonAcildi:0,pozisyonReddedildi:0};
  const waitingOk=await entry.pusuDegerlendir('TESTUSDT',{trend:'UP',bricks:[]},waitingAudit);
  assert.strictEqual(waitingOk,false);
  assert.strictEqual(calls.length,2,'CONFIRMED dönüş beklerken pozisyonAc çağrılmamalı');
  assert.strictEqual(waitingAudit.entryModeConfirmed,1);
  assert.strictEqual(waitingAudit.confirmedWaiting,1);
  assert.strictEqual(waitingAudit.confirmedWaitReasons.CLOSED_REVERSAL_NOT_FOUND,1);
  assert.strictEqual(waitingAudit.fiyatBekleyen,1);

  console.log('✅ v6.13.5-R16 entry authority end-to-end passed | DIRECT + CONFIRMED valid triggers reach shared pozisyonAc authority');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
