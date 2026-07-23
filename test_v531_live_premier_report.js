'use strict';
const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const state = {
  aktifPozisyonlar: [],
  canliFiyatlar: {},
  pusuListesi: {},
  basariOzeti: {},
  analizOzeti: {},
  restartGapOzet: {}
};
const hStub = { state, telegramMesajGonder: async()=>{}, telegramCanliRaporGuncelle: async()=>{} };
const ayarlarStub = { sanalEmirModu: true, maxPozisyonSayisi: 100, canliRaporAktif: true, labPremierAktif: true };

function isGap(p) { return p.restartRecovered === true || p.dataQuality === 'RESTART_GAP' || p.learningEligible === false; }
function isPremierRaw(p) { return p.labPremierDecision?.upperLayerIncluded === true || p.labPremierObservation?.upperLayerIncluded === true; }
const accountingStub = {
  activeBreakdown(list=[]) {
    const virtual = list.filter(p => p.sanal !== false);
    const restartGapPositions = virtual.filter(isGap);
    const clean = virtual.filter(p => !isGap(p));
    const premierPositions = clean.filter(isPremierRaw);
    const shadowPositions = clean.filter(p => !isPremierRaw(p));
    return { total:list.length, real:0, premier:premierPositions.length, shadow:shadowPositions.length,
      restartGap:restartGapPositions.length, realPositions:[], premierPositions, shadowPositions, restartGapPositions };
  },
  snapshot() { return { active:{premier:0,shadow:0,restartGap:0}, current:{}, canonical:{premier:{},shadow:{}}, legacy:{}, trackedActive:0, difference:0, reconciled:true, migrationBatchDifference:0, migrationBatchReconciled:true, legacyActive:0 }; }
};

const generic = new Proxy({}, { get(_t, prop) {
  if (prop === 'compactTelegram' || prop === 'report' || prop === 'telegram' || prop === 'dnaTelegram' || prop === 'realCompactTelegram') return () => '';
  if (prop === 'build') return () => ({ league:{}, allCandidates:[], historicalPositiveCount:0, labLeagueCount:0, reversePremierCount:0, nearProfitCount:0, reverseShadowCount:0, forwardVerifiedCount:0 });
  if (prop === 'buildLearningValidationModel') return () => ({ kapanan:0, learningScore:{}, dnaLeague:{leagueSizes:{}}, winRate:0, expectancy:0, netKasa:0 });
  if (prop === 'ramMb') return () => ({rss:0,heapUsed:0,heapTotal:0});
  if (prop === 'run') return () => ({ sourceCounts:{replay:0}, stop:{recommendation:{candidateStopPct:0}}, premier:{recent5Decision:''} });
  return undefined;
}});

Module._load = function(request, parent, isMain) {
  if (request === 'dotenv') return { config(){} };
  if (request.endsWith('/1_hafiza.js') || request === './1_hafiza.js') return hStub;
  if (request.endsWith('/ayarlar.js') || request === './ayarlar.js') return ayarlarStub;
  if (request.endsWith('/65_accounting_continuity.js') || request === './65_accounting_continuity.js') return accountingStub;
  if (request.startsWith('./') && request.endsWith('.js') && request !== './2_rapor.js') return generic;
  return originalLoad(request, parent, isMain);
};

try {
  for (let i=1;i<=12;i++) {
    const sym = `P${String(i).padStart(2,'0')}USDT`;
    state.canliFiyatlar[sym] = 100 + i;
    state.aktifPozisyonlar.push({
      sym, yon:'LONG', girisFiyati:100, sanal:true,
      anlikKarYuzde: 999 - i, // stale value; live price must win
      labPremierDecision:{ upperLayerIncluded:true, premierTrack:'HISTORICAL_PREMIER' },
      labPremierObservation:{ upperLayerIncluded:true, observationPool:'PREMIER', premierTrack:'HISTORICAL_PREMIER' }
    });
  }
  state.aktifPozisyonlar.push({ sym:'REVUSDT', yon:'LONG', girisFiyati:100, sanal:true,
    labPremierDecision:{upperLayerIncluded:true,premierTrack:'REVERSE_PREMIER'},
    labPremierObservation:{upperLayerIncluded:true,observationPool:'REVERSE_SEPARATE_LEDGER',premierTrack:'REVERSE_PREMIER'} });
  state.canliFiyatlar.REVUSDT = 200;
  state.aktifPozisyonlar.push({ sym:'GAPUSDT', yon:'LONG', girisFiyati:100, sanal:true, restartRecovered:true,
    labPremierDecision:{upperLayerIncluded:true,premierTrack:'HISTORICAL_PREMIER'} });
  state.canliFiyatlar.GAPUSDT = 300;
  state.aktifPozisyonlar.push({ sym:'SHADOWUSDT', yon:'LONG', girisFiyati:100, sanal:true });

  const report = require('./2_rapor.js').canliRaporMetniOlustur();
  assert(report.includes('Premier aktif:</b> 12 / 100'), 'Ana Premier aktif sayısı 12 olmalı');
  assert(report.includes('En Karlı Aktif Premier (10/12, maks. 10)'), 'En Karlı başlığı 10/12 olmalı');
  assert(report.includes('En Riskli Aktif Premier (10/12, maks. 10)'), 'En Riskli başlığı 10/12 olmalı');
  assert(!report.includes('REVUSDT'), 'Reverse ana Premier listesine karışmamalı');
  assert(!report.includes('GAPUSDT'), 'GAP ana Premier listesine karışmamalı');
  assert(!report.includes('SHADOWUSDT'), 'Gölge ana Premier listesine karışmamalı');
  assert(report.indexOf('P12USDT LONG +%12.00') < report.indexOf('P11USDT LONG +%11.00'), 'Sıralama canlı fiyat PnL ile yapılmalı');
  assert(!report.includes('P02USDT LONG +%2.00\nP01USDT'), 'En Karlı listesi 10 kayıtla sınırlı olmalı');
  console.log('✅ v5.3.1 canlı Premier raporu testi geçti');
} finally {
  Module._load = originalLoad;
}
