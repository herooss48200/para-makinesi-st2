'use strict';
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const settings = fs.readFileSync('ayarlar.js','utf8');
const opSource = fs.readFileSync('82_st2_operation_transparency.js','utf8');
const closeSource = fs.readFileSync('4_pozisyon.js','utf8');
const botSource = fs.readFileSync('bot.js','utf8');
assert(settings.includes('telegramIslemAcilisMesaji: true'), 'işlem açılış mesajı kapalı bırakılamaz');
assert(opSource.includes('Giriş kanıtı:'), 'açılış giriş kanıtı eksik');
assert(opSource.includes('Exit replay kanıtı:'), 'açılış exit replay kanıtı eksik');
assert(opSource.includes('REPLAY KANITI'), 'kapanış replay kanıtı eksik');
assert(closeSource.includes('replayValidation: exitReplayRecord?.shadowExitValidation || null'), 'kapanış replay doğrulaması operasyon mesajına bağlanmamış');
assert(botSource.includes('[ST2 EARLY STARTUP TELEGRAM]'), 'erken startup Telegram hotfixi korunmamış');
const originalLoad = Module._load;
Module._load = function(request,parent,isMain){
  if(request==='dotenv') return {config:()=>({parsed:{}})};
  if(request==='binance-api-node') return {default:()=>({})};
  return originalLoad.call(this,request,parent,isMain);
};
try {
  const op = require('./82_st2_operation_transparency.js');
  const pos = {
    sym:'TESTUSDT', yon:'LONG', girisFiyati:1.01, sl:0.99, tp:1.05, sanal:true,
    dnaLabel:'DNA #1', labDnaLabel:'LAB #2', fullDnaLabel:'FULL #3',
    acilisZamani:Date.now()-60000, labLeagueAtOpen:'PREMIER', labProofLevelAtOpen:'EXACT',
    girisAnalizi:{renkoEntryBrickDistance:0.50, referansSeviye:1, tetikFiyati:1.005, renkoBbState:'ALT'},
    renkoPremierDecision:{source:'HISTORICAL_EXACT',closed:12,pf:1.8,expectancy:0.12,net:1.44,reason:'EXACT_POZITIF'},
    executionExitAssignment:{ready:true,label:'MFE 0.75',samples:20,beatRate:65,profitFactor:1.5,netUsdt:3.2,reason:'REPLAY_LIDER'},
    renkoExitAssignment:{assignedTakeoverPct:0.5,assignedSafeFloorPct:0.2,assignedAtrMultiplier:1.5,assignedCaptureRatio:0.75,profileSamples:8,takeoverSource:'ONLINE_LEARNED_PROFILE'},
    journey:{mfeYuzde:1.2,maeYuzde:-0.3}, renkoProtectionStage:'K2', renkoExitActivated:true, breakevenAktif:true
  };
  const open = op.openingText(pos,{pricePrecision:4});
  assert(open.includes('Giriş kanıtı: N12 | PF 1.80'), 'açılış giriş metriği yanlış');
  assert(open.includes('Exit replay kanıtı: AKTİF ATAMA | N20 | Beat %65.0 | PF 1.50'), 'açılış exit kanıtı yanlış');
  const close = op.closingText(pos,{emoji:'✅',title:'KAPANDI',openedAtText:'00:00',closedAtText:'00:01',durationText:'1 dk',exitPrice:1.02,pricePrecision:4,reason:'MFE KORUMA',outcome:'TP',fiyatKarYuzdesi:1,grossPnl:0.5,commission:0.05,netPnl:0.45,replayValidation:{selectedAlgorithmLabel:'MFE 0.75',actualNetUsdt:0.30,selectedNetUsdt:0.45,deltaVsActualUsdt:0.15,selectedWouldWin:true}});
  assert(close.includes('REPLAY KANITI'), 'kapanış replay başlığı yok');
  assert(close.includes('Fark: +0.1500 USDT | REPLAY ÜSTÜN'), 'kapanış replay farkı yanlış');
  assert(open.length < 3400 && close.length < 3400, `operasyon mesajları Telegram limitini aşmamalı: ${open.length}/${close.length}`);
} finally { Module._load=originalLoad; }
console.log('✅ AGROS ST2 v6.8.4 operation proof Telegram + entry/exit/replay visibility passed');
