'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v693-'));
process.env.AGROS_DATA_DIR = temp;
process.env.AGROS_REAL_ORDER_ARM = 'LIVE_TRADING_CONFIRMED';
process.env.AGROS_REAL_ORDER_ENV = 'MAINNET';
process.env.AGROS_REAL_ORDER_EXECUTION_ACK = 'V610_REVIEWED';
process.env.BINANCE_BASE_URL = 'https://fapi.binance.com';

const ayarlar = require('./ayarlar.js');
const bridge = require('./50_real_order_readiness_bridge.js');
const lab = require('./62_lab_premier_league.js');

assert.strictEqual(ayarlar.sanalEmirModu, false);
assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar, 5);
assert.strictEqual(ayarlar.mevcutKaldirac, 2);
assert.strictEqual(ayarlar.gercekEmirMarjinTipi, 'ISOLATED');
assert(Number.isInteger(Number(ayarlar.gercekEmirMaxAktifPozisyon)) && Number(ayarlar.gercekEmirMaxAktifPozisyon) >= 1, 'aktif gerçek pozisyon limiti ayarlardan yönetilmeli');
assert.strictEqual(bridge.realAuthorization().valid, true, 'mainnet + genel canlı onayı birlikte gerçek yetki vermeli');
assert.deepStrictEqual(bridge.liveRiskProfile(), {
  marginUsdt: 5, notionalUsdt: 10, leverage: 2, marginType: 'ISOLATED', maxActivePositions: Number(ayarlar.gercekEmirMaxAktifPozisyon), protectionRequired: true
});
assert.strictEqual(lab.TRACK.SCORE, 'PREMIER_SCORE_RANKED');

const pos = {
  sym: 'BTCUSDT', yon: 'LONG', sanal: false, tradeId: 'V693-REAL-1', acilisZamani: Date.now(),
  labPremierDecision: {
    labDnaId: 1, labDnaLabel: 'LAB #1', labKey: 'LAB-1', familyDnaLabel: 'DNA #1',
    proofLevel: 'ST2_PREMIER_SCORE_SELECTED', premierTrack: lab.TRACK.SCORE, labLeague: 'PREMIER',
    upperLayerIncluded: true, observationEligible: true, realTradingAuthorized: true,
    exitValidated: false, exit: null
  },
  executionExitAssignment: { assignmentId: 'V693-ASSIGN', algorithmId: 'ACTUAL', label: 'Mevcut Kademe Sistemi' }
};
const observation = lab.snapshot(pos);
assert(observation && observation.upperLayerIncluded === true, 'gerçek kalibre Premier snapshot ana kasaya bağlanmalı');
assert.strictEqual(observation.realTradingAuthorized, true);
const trade = lab.close(pos, { net: 0.50, commission: 0.03, outcome: 'TP' });
assert(trade, 'kalibre Premier kapanışı kaybolmamalı');
const state = lab.readState();
assert.strictEqual(state.aggregate.closed, 1);
assert.strictEqual(state.aggregate.tp, 1);
assert.strictEqual(Number(state.aggregate.net.toFixed(2)), 0.50);

const motorSource = fs.readFileSync(require.resolve('./motor.js'), 'utf8');
const executionSource = fs.readFileSync(require.resolve('./85_st2_real_order_execution.js'), 'utf8');
assert(motorSource.includes('realExecution.rollbackEntry'), 'korumasız/şüpheli gerçek açılış kalıcı rollback katmanına gitmeli');
assert(motorSource.includes('realExecution.installProtections'), 'SL/TP zorunlu Algo Service katmanından kurulmalı');
assert(executionSource.includes("newClientOrderId: record.ids.entry"), 'gerçek giriş deterministik clientOrderId taşımalı');
assert(executionSource.includes("newOrderRespType: 'RESULT'"), 'gerçek dolum cevabı istenmeli');
assert(executionSource.includes('futuresCreateAlgoOrder'), 'USDⓈ-M koşullu emirler Algo Service üzerinden gönderilmeli');
assert(motorSource.includes('risk.maxActivePositions'), 'ayar tabanlı aktif gerçek pozisyon limiti uygulanmalı');

console.log('✅ AGROS ST2 v6.9.3 compatibility + current 10 USDT risk + calibrated Premier ledger passed');
