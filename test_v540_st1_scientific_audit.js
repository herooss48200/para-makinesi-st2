'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};

const tempData = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-st1-v540-'));
process.env.AGROS_DATA_DIR = tempData;

const ayarlar = require('./ayarlar.js');
const lifecycle = require('./68_lab_lifecycle_evolution.js');
const labPremier = require('./62_lab_premier_league.js');
const exitAudit = require('./57_exit_victory_audit.js');
const h = require('./1_hafiza.js');
const liveReport = require('./2_rapor.js');
const hBackup = {
  active: h.state.aktifPozisyonlar, prices: h.state.canliFiyatlar, summary: h.state.basariOzeti,
  pusu: h.state.pusuListesi, continuity: h.state.accountingContinuity, gap: h.state.restartGapOzet
};

function historical(total, winRate, net, profitFactor, expectancy) {
  return { total, tp: Math.round(total * winRate / 100), sl: total - Math.round(total * winRate / 100), be: 0, winRate, net, profitFactor, expectancy };
}
function row(id, side, suffix, h, { eligible = false, exit = null } = {}) {
  const key = `YON=${side}|BTC=${suffix}|COIN=${suffix}|BB=ORTA`;
  return {
    labDnaId: id, labDnaLabel: `LAB #${id}`, labKey: key,
    familyDnaId: id, familyDnaLabel: `DNA #${id}`, familyKey: `YON=${side}|BTC=${suffix}|COIN=${suffix}`,
    label: key, historical: h, recent5: {}, exit,
    evidence: { entryHistoricalEligible: eligible, entryRecentEligible: false },
    forward: { eligible: false, metrics: { closed: 0, net: 0, profitFactor: 0, expectancy: 0 } }
  };
}
function decision(track, key, label, upper, extra = {}) {
  return {
    version: labPremier.VERSION, at: new Date().toISOString(), symbol: `${label}USDT`, side: key.includes('YON=SHORT') ? 'SHORT' : 'LONG',
    sourceSignalSide: key.includes('YON=SHORT') ? 'SHORT' : 'LONG', executionSide: key.includes('YON=SHORT') ? 'SHORT' : 'LONG',
    reverseExecution: track === labPremier.TRACK.REVERSE,
    sourceLabKey: track === labPremier.TRACK.REVERSE ? 'YON=SHORT|BTC=0000|COIN=0000|BB=ORTA' : null,
    sourceLabDnaLabel: track === labPremier.TRACK.REVERSE ? 'LAB #SOURCE' : null,
    labDnaId: label, labDnaLabel: `LAB #${label}`, labKey: key, familyDnaLabel: `DNA #${label}`,
    labLeague: upper ? 'PREMIER' : 'EXPERIMENT', premierTrack: track, proofLevel: 'TEST',
    upperLayerIncluded: upper, observationEligible: true, virtualShadowOnly: !upper, sizeMultiplier: upper ? 1 : 0,
    entryProven: true, exitValidated: false, safeExitFallback: true, exit: null,
    realTradingAuthorized: false, allowed: true, reasons: [], ...extra
  };
}

try {
  // 1) LAB Yaşam Profili: N5, periyodik yeniden hesaplama ve güncel veri ağırlığı.
  assert.strictEqual(lifecycle.MIN_SAMPLES(), 5);
  assert.strictEqual(lifecycle.RECALC_STEP(), 5);
  assert.strictEqual(lifecycle.DEEP_RECALC_STEP(), 10);
  assert.strictEqual(lifecycle.RECENT_WINDOW(), 20);
  assert.strictEqual(lifecycle.RECENT_WEIGHT(), 0.60);
  assert.deepStrictEqual(lifecycle.STOP_CANDIDATES(), [0.8, 1.0, 1.2, 1.5, 1.8, 2.1, 2.4]);
  assert(lifecycle.BE_TRIGGER_CANDIDATES().includes(0.4));
  assert(lifecycle.BE_CANDIDATES().includes(0.12));
  assert.strictEqual(lifecycle.scopeFor({ labPremierDecision: { premierTrack: labPremier.TRACK.HISTORICAL } }), 'PREMIER');
  assert.strictEqual(lifecycle.scopeFor({ labPremierDecision: { premierTrack: labPremier.TRACK.REVERSE } }), 'REVERSE');
  assert.strictEqual(lifecycle.scopeFor({ labPremierDecision: { premierTrack: labPremier.TRACK.BOTTOM_LONG } }), 'BOTTOM_LONG');
  assert.strictEqual(lifecycle.scopeFor({ labPremierDecision: { premierTrack: labPremier.TRACK.BOTTOM_SHORT } }), 'BOTTOM_SHORT');
  const stale = { samples: 10, net: 5, grossProfit: 5, grossLoss: 0, recent: Array.from({ length: 5 }, () => ({ net: -1 })) };
  const adaptive = { samples: 5, net: 0.5, grossProfit: 0.5, grossLoss: 0, recent: Array.from({ length: 5 }, () => ({ net: 0.1 })) };
  const adaptivePick = lifecycle.champion({ '1.50': stale, '1.10': adaptive }, '1.35');
  assert.strictEqual(adaptivePick.ready, true);
  assert.strictEqual(adaptivePick.best.key, '1.10');

  // 2) Premier / Bottom LONG / Bottom SHORT / Reverse lig kararları birbirinden bağımsız.
  const ownExit = { positive: true, ownLabExit: true, algorithmId: 'MFE_70', algorithmLabel: 'MFE Koruma %70', samples: 18, beatRate: 61, profitFactor: 1.42, netUsdt: 2.1 };
  const premierRow = row(1, 'LONG', '0011', historical(20, 70, 4, 1.8, 0.2), { eligible: true });
  const bottomLongRow = row(2, 'LONG', '0101', historical(12, 45, -2.4, 0.62, -0.2), { exit: ownExit });
  const bottomShortRow = row(3, 'SHORT', '1010', historical(14, 50, -2.8, 0.70, -0.2));
  const league = labPremier.build({ catalogue: { allLabRows: [premierRow, bottomLongRow, bottomShortRow] }, persist: false, force: true });
  assert.strictEqual(league.premierCount, 1);
  assert.strictEqual(league.bottomLongCount, 1);
  assert.strictEqual(league.bottomShortCount, 1);
  assert.strictEqual(league.bottomLong[0].upperLayerIncluded, false);
  assert.strictEqual(league.bottomLong[0].observationEligible, true);
  assert.strictEqual(league.bottomLong[0].exitValidated, true);
  assert.strictEqual(league.bottomShort[0].safeExitFallback, true);
  const bottomFrozenExit = labPremier.frozenExit(league.bottomLong[0]);
  assert.strictEqual(bottomFrozenExit.ready, true);
  assert.strictEqual(bottomFrozenExit.algorithmId, 'MFE_70');
  assert.strictEqual(bottomFrozenExit.scope, 'LAB_BOTTOM_PREMIER_OWN_EXIT');

  const reverseSource = row(4, 'SHORT', '0001', historical(10, 10, -4.3, 0.05, -0.43));
  const reverseTier = labPremier.championTier(reverseSource);
  assert.strictEqual(reverseTier.reverseExecution, true);
  assert.strictEqual(reverseTier.upperLayerIncluded, false);
  assert.strictEqual(reverseTier.observationEligible, undefined);
  assert.strictEqual(reverseTier.premierTrack, labPremier.TRACK.REVERSE);
  assert.strictEqual(reverseTier.executionSide, 'LONG');

  // 3) Açılış/kapanış defterleri: yalnız Historical ana Premier aggregate'ine girer.
  const histPos = { sanal: true, sym: 'HISTUSDT', yon: 'LONG', sanalOrderId: 'HIST-1', labPremierDecision: decision(labPremier.TRACK.HISTORICAL, 'YON=LONG|BTC=0011|COIN=0011|BB=ORTA', 'H', true) };
  const bottomPos = { sanal: true, sym: 'BOTTOMUSDT', yon: 'SHORT', sanalOrderId: 'BOTTOM-1', labPremierDecision: decision(labPremier.TRACK.BOTTOM_SHORT, 'YON=SHORT|BTC=1010|COIN=1010|BB=ORTA', 'B', false) };
  const reversePos = { sanal: true, sym: 'REVERSEUSDT', yon: 'LONG', sanalOrderId: 'REVERSE-1', labPremierDecision: decision(labPremier.TRACK.REVERSE, 'YON=LONG|BTC=1110|COIN=1110|BB=ORTA', 'R', false) };
  labPremier.snapshot(histPos); labPremier.snapshot(bottomPos); labPremier.snapshot(reversePos);
  labPremier.close(histPos, { net: 1.2, commission: 0.1, outcome: 'TP' });
  labPremier.close(bottomPos, { net: -0.4, commission: 0.1, outcome: 'SL' });
  labPremier.close(reversePos, { net: 0.6, commission: 0.1, outcome: 'TP' });
  const state = labPremier.readState();
  assert.strictEqual(state.aggregate.opened, 1);
  assert.strictEqual(state.aggregate.closed, 1);
  assert.strictEqual(state.aggregate.tp, 1);
  assert.strictEqual(Number(state.aggregate.net.toFixed(6)), 1.2);
  const stateRows = Object.values(state.byLab);
  assert.strictEqual(stateRows.filter(x => x.premierTrack === labPremier.TRACK.HISTORICAL).length, 1);
  assert.strictEqual(stateRows.filter(x => x.premierTrack === labPremier.TRACK.BOTTOM_SHORT).length, 1);
  assert.strictEqual(stateRows.filter(x => x.premierTrack === labPremier.TRACK.REVERSE).length, 1);

  // Eski v5.3 Reverse sızıntısı aggregate içinde bulunsa bile okuma sırasında temizlenir.
  labPremier.writeState({ ...state, aggregate: { opened: 99, active: 0, closed: 99, tp: 99, sl: 0, be: 0, net: 99, grossProfit: 99, grossLoss: 0, commission: 0 } });
  const healed = labPremier.readState();
  assert.strictEqual(healed.aggregate.opened, 1);
  assert.strictEqual(healed.aggregate.closed, 1);
  assert.strictEqual(Number(healed.aggregate.net.toFixed(6)), 1.2);

  // 4) Canlı rapor önceliği ve bağımsız kasa görünürlüğü.
  const compact = labPremier.compactTelegramFromModel({
    league: { ...league, historicalPremier: [], reversePremier: [], bottomLong: league.bottomLong, bottomShort: league.bottomShort, premier: [] },
    aggregate: labPremier.metrics({ opened: 1, closed: 1, tp: 1, net: 1.2, grossProfit: 1.2 }),
    accounting: { opened: 1, activeScientific: 0, closedScientific: 1, activeGap: 0, closedGap: 0, equation: '1 = 1 + 0 + 0 + 0', difference: 0, reconciled: true },
    trackMetrics: {
      historical: labPremier.metrics({ opened: 1, closed: 1, tp: 1, net: 1.2, grossProfit: 1.2 }),
      bottomLong: labPremier.metrics(),
      bottomShort: labPremier.metrics({ opened: 1, closed: 1, sl: 1, net: -0.4, grossLoss: 0.4 }),
      reverse: labPremier.metrics({ opened: 1, closed: 1, tp: 1, net: 0.6, grossProfit: 0.6 })
    },
    reversePipeline: { evaluated: 3, bound: 2, opened: 1, identityMismatch: 0 }
  });
  const iCash = compact.indexOf('PREMIER KASA VE PERFORMANS');
  const iBottom = compact.indexOf('BOTTOM PREMIER LONG');
  const iReverse = compact.indexOf('TERS İŞLEM DEFTERİ');
  const iAudit = compact.indexOf('DENETİM / MUTABAKAT');
  assert(iCash >= 0 && iBottom > iCash && iReverse > iBottom && iAudit > iReverse);
  assert(compact.includes('Bottom ve Reverse ana Premier kasasına dahil değildir'));
  assert(compact.includes('Stop ve ⚖ BE profilleri lig/LAB bazında'));

  // 5) Exit atama zinciri frozen/shadow kimliğiyle canlı doğrulanır.
  const assignments = exitAudit.activeAssignments([
    {
      sym: 'OKUSDT', yon: 'LONG', labDnaLabel: 'LAB #1', premierTrackAtOpen: labPremier.TRACK.HISTORICAL,
      executionExitAssignment: { algorithmId: 'MFE_70', label: 'MFE Koruma %70', ready: true, immutable: true, activeForPosition: true, assignmentId: 'A-1', samples: 18, source: 'LAB_PREMIER' },
      exitPlanShadow: { selectedAlgorithmId: 'MFE_70', selectedAlgorithmLabel: 'MFE Koruma %70', ready: true, assignmentId: 'A-1' }
    },
    {
      sym: 'BADUSDT', yon: 'SHORT', labDnaLabel: 'LAB #2', premierTrackAtOpen: labPremier.TRACK.BOTTOM_SHORT,
      executionExitAssignment: { algorithmId: 'ATR_15', label: 'ATR 1.5x', ready: true, immutable: true, activeForPosition: true, assignmentId: 'A-2' },
      exitPlanShadow: { selectedAlgorithmId: 'TIME_30', selectedAlgorithmLabel: '30 dk', ready: true, assignmentId: 'A-2' }
    }
  ]);
  assert.strictEqual(assignments[0].assignmentMatch, true);
  assert.strictEqual(assignments[1].assignmentMatch, false);
  const diagnostics = exitAudit.modelDiagnostics();
  assert.strictEqual(typeof diagnostics.fingerprint, 'string');
  assert.strictEqual(diagnostics.fingerprint.length, 12);

  // 6) Kaynak zinciri sözleşmeleri: canlı PnL/aktif Premier, Stop/BE uygulaması ve deney kasası koruması.
  const reportSource = fs.readFileSync('2_rapor.js', 'utf8');
  const motorSource = fs.readFileSync('motor.js', 'utf8');
  const closeSource = fs.readFileSync('4_pozisyon.js', 'utf8');
  const reverseSourceCode = fs.readFileSync('66_identity_chain_repair.js', 'utf8');
  assert(reportSource.includes('Math.min(10, sirali.length)') || reportSource.includes('Math.min(10, aktifler.length)'));
  assert(reportSource.includes('anaPremierPozisyonuMu') || reportSource.includes('track === labPremier.TRACK.HISTORICAL'));
  assert(reportSource.includes('En Karlı Aktif Premier') && reportSource.includes('En Riskli Aktif Premier'));
  assert(motorSource.includes('const yasamProfili = labLifecycle.apply(hazirKimlik)'));
  assert(motorSource.includes('yasamProfili?.stopPct'));
  assert(closeSource.includes("['REVERSE_PREMIER', 'BOTTOM_PREMIER_LONG', 'BOTTOM_PREMIER_SHORT']"));
  assert(closeSource.includes('pos.labBeTetikYuzde'));
  assert(reverseSourceCode.includes('bindReverseExecution(pos, labDecision)'));
  assert.strictEqual(ayarlar.sanalEmirModu, true, 'ST1 teslimi sanal/fail-closed kalmalı');

  // 7) Canlı raporda En Karlı/En Riskli yalnız aktif Historical Premier ve maksimum aktif sayısı kadar görünür.
  h.state.canliFiyatlar = { HISTPLUSUSDT: 102, HISTMINUSUSDT: 98, REVERSEUSDT: 110, BOTTOMUSDT: 90, GAPUSDT: 105 };
  h.state.pusuListesi = {};
  h.state.basariOzeti = { tp: 0, sl: 0, be: 0, toplamAcilanEmir: 0, toplamKomisyon: 0, netKarZarar: 0 };
  h.state.accountingContinuity = null;
  h.state.restartGapOzet = null;
  const activeHistorical = (sym, entry, side = 'LONG') => ({
    sanal: true, sym, yon: side, girisFiyati: entry, sl: side === 'LONG' ? entry * 0.985 : entry * 1.015,
    labPremierDecision: { upperLayerIncluded: true, premierTrack: labPremier.TRACK.HISTORICAL, reverseExecution: false },
    premierTrackAtOpen: labPremier.TRACK.HISTORICAL
  });
  h.state.aktifPozisyonlar = [
    activeHistorical('HISTPLUSUSDT', 100, 'LONG'),
    activeHistorical('HISTMINUSUSDT', 100, 'LONG'),
    { ...activeHistorical('REVERSEUSDT', 100, 'LONG'), labPremierDecision: { upperLayerIncluded: true, premierTrack: labPremier.TRACK.REVERSE, reverseExecution: true }, premierTrackAtOpen: labPremier.TRACK.REVERSE },
    { sanal: true, sym: 'BOTTOMUSDT', yon: 'SHORT', girisFiyati: 100, labPremierDecision: { upperLayerIncluded: false, premierTrack: labPremier.TRACK.BOTTOM_SHORT }, premierTrackAtOpen: labPremier.TRACK.BOTTOM_SHORT },
    { ...activeHistorical('GAPUSDT', 100, 'LONG'), restartRecovered: true, dataQuality: 'RESTART_GAP', learningEligible: false }
  ];
  const liveText = liveReport.canliRaporMetniOlustur();
  const activeBlock = liveText.split('PREMIER KASA VE PERFORMANS')[0];
  assert(activeBlock.includes('Aktif 2') || activeBlock.includes('Premier aktif:</b> 2') || activeBlock.includes('Premier aktif: 2'));
  assert(activeBlock.includes('En Karlı 2') || activeBlock.includes('En Karlı Aktif Premier (2/2'));
  assert(activeBlock.includes('En Riskli 2') || activeBlock.includes('En Riskli Aktif Premier (2/2'));
  assert(activeBlock.includes('HISTPLUSUSDT'));
  assert(activeBlock.includes('HISTMINUSUSDT'));
  assert(!activeBlock.includes('REVERSEUSDT'));
  assert(!activeBlock.includes('BOTTOMUSDT'));
  assert(!activeBlock.includes('GAPUSDT'));

  console.log('✅ v5.4.0 ST1 SCIENTIFIC AUDIT passed | Premier visibility + Bottom L/S + Reverse + adaptive Exit/Stop/BE + ledger isolation');
} finally {
  h.state.aktifPozisyonlar = hBackup.active;
  h.state.canliFiyatlar = hBackup.prices;
  h.state.basariOzeti = hBackup.summary;
  h.state.pusuListesi = hBackup.pusu;
  h.state.accountingContinuity = hBackup.continuity;
  h.state.restartGapOzet = hBackup.gap;
  fs.rmSync(tempData, { recursive: true, force: true });
}
