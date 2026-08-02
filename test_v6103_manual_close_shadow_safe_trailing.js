'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6103-'));
process.env.AGROS_DATA_DIR = tempDir;
process.env.AGROS_REAL_ORDER_ARM = 'LIVE_TRADING_CONFIRMED';
process.env.AGROS_REAL_ORDER_ENV = 'MAINNET';
process.env.AGROS_REAL_ORDER_EXECUTION_ACK = 'V610_REVIEWED';
process.env.BINANCE_FUTURES_HTTP_BASE = 'https://fapi.binance.com';
process.env.BINANCE_API_KEY = 'TEST';
process.env.BINANCE_API_SECRET = 'TEST';

function clone(v) { return JSON.parse(JSON.stringify(v)); }
const ACTIVE = new Set(['NEW', 'ACCEPTED', 'PENDING', 'WORKING', 'TRIGGERING']);
const exchange = {
  positions: new Map(), trades: [], algos: [], orders: [], sequence: [],
  nextOrder: 1000, nextAlgo: 5000, nextTrade: 9000
};
function positionRow(symbol) {
  const p = exchange.positions.get(symbol) || { qty: 0, price: 100 };
  return { symbol, positionAmt: String(p.qty), entryPrice: String(p.price), positionSide: 'BOTH' };
}
function algoMatch(payload) {
  return exchange.algos.find(x =>
    (payload?.algoId != null && String(x.algoId) === String(payload.algoId)) ||
    (payload?.clientAlgoId && x.clientAlgoId === payload.clientAlgoId)
  );
}
function addTrade({ symbol, orderId, side, qty, price, realizedPnl = 0, commission = 0.004 }) {
  exchange.trades.push({ symbol, orderId, id: exchange.nextTrade++, side, qty: String(qty), price: String(price),
    realizedPnl: String(realizedPnl), commission: String(commission), commissionAsset: 'USDT', time: Date.now() });
}
const client = {
  futuresPositionRisk: async ({ symbol } = {}) => symbol ? [positionRow(symbol)] : [...exchange.positions.keys()].map(positionRow),
  futuresOpenOrders: async () => [],
  futuresAllOrders: async () => exchange.orders.map(clone),
  futuresGetOrder: async payload => {
    const row = exchange.orders.find(x => (payload?.orderId != null && String(x.orderId) === String(payload.orderId)) || x.clientOrderId === payload?.origClientOrderId);
    if (!row) throw new Error('-2013 Order does not exist');
    return clone(row);
  },
  futuresCancelOrder: async () => ({}),
  futuresOrder: async payload => {
    const orderId = exchange.nextOrder++;
    const qty = Number(payload.quantity);
    const current = exchange.positions.get(payload.symbol) || { qty: 0, price: 100 };
    const isClose = String(payload.reduceOnly) === 'true';
    const order = { symbol: payload.symbol, orderId, clientOrderId: payload.newClientOrderId, status: 'FILLED', executedQty: String(qty), avgPrice: String(current.price || 100), type: 'MARKET', side: payload.side };
    exchange.orders.push(order);
    if (isClose) {
      exchange.positions.set(payload.symbol, { qty: 0, price: current.price || 100 });
      addTrade({ symbol: payload.symbol, orderId, side: payload.side, qty, price: current.price || 100, realizedPnl: 0.1, commission: 0.004 });
    } else {
      exchange.positions.set(payload.symbol, { qty: payload.side === 'BUY' ? qty : -qty, price: 100 });
      addTrade({ symbol: payload.symbol, orderId, side: payload.side, qty, price: 100, commission: 0.004 });
    }
    return clone(order);
  },
  futuresCreateAlgoOrder: async payload => {
    exchange.sequence.push(`CREATE_ATTEMPT:${payload.type}:${payload.clientAlgoId}`);
    const existingStop = exchange.algos.find(x => x.symbol === payload.symbol && x.orderType === 'STOP_MARKET' && ACTIVE.has(String(x.algoStatus || x.status).toUpperCase()));
    if (payload.type === 'STOP_MARKET' && existingStop && existingStop.clientAlgoId !== payload.clientAlgoId) {
      throw new Error('An open stop or take profit order with GTE and closePosition in the direction is existing.');
    }
    const row = { ...payload, algoId: exchange.nextAlgo++, orderType: payload.type, algoStatus: 'NEW', status: 'NEW', actualOrderId: '', actualPrice: '0' };
    exchange.algos.push(row);
    exchange.sequence.push(`CREATE_OK:${payload.type}:${payload.clientAlgoId}`);
    return clone(row);
  },
  futuresGetAlgoOrder: async payload => {
    const row = algoMatch(payload);
    if (!row) throw new Error('-2013 Algo order does not exist');
    return clone(row);
  },
  futuresGetOpenAlgoOrders: async ({ symbol } = {}) => ({ orders: exchange.algos.filter(x => (!symbol || x.symbol === symbol) && ACTIVE.has(String(x.algoStatus || x.status).toUpperCase())).map(clone) }),
  futuresCancelAlgoOrder: async payload => {
    const row = algoMatch(payload);
    exchange.sequence.push(`CANCEL:${row?.clientAlgoId || payload.clientAlgoId || payload.algoId}`);
    if (!row) throw new Error('-2011 Unknown order');
    row.algoStatus = 'CANCELED'; row.status = 'CANCELED';
    return clone(row);
  },
  futuresUserTrades: async ({ symbol, startTime = 0, endTime = Number.MAX_SAFE_INTEGER }) => exchange.trades.filter(t => t.symbol === symbol && t.time >= startTime && t.time <= endTime).map(clone)
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => client };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const ayarlar = require('./ayarlar.js');
    ayarlar.sanalEmirModu = false;
    const h = require('./1_hafiza.js');
    h.binanceTimeHealth = () => ({ healthy: true, synced: true, offsetMs: 0 });
    h.binanceTimeSync = async () => ({ healthy: true, synced: true, offsetMs: 0 });
    h.state.basamaklar.BTCUSDT = { tickSize: 0.1, pricePrecision: 1, quantityPrecision: 3 };
    h.state.basamaklar.ETHUSDT = { tickSize: 0.1, pricePrecision: 1, quantityPrecision: 3 };
    const execution = require('./85_st2_real_order_execution.js');

    const ctx = { sym: 'BTCUSDT', yon: 'LONG', girisFiyati: 100, miktar: 0.1, sl: 98, tp: 110, acilisZamani: Date.now() - 1000,
      girisAnalizi: { patternId: 'RRRR', sonKapaliTuglaZamani: 1 }, realOrderReadiness: { key: 'V6103' } };
    const reservation = await execution.reserveEntry({ symbol: 'BTCUSDT', side: 'LONG', context: ctx, client });
    assert.strictEqual(reservation.ok, true, reservation.reason);
    const fill = await execution.executeEntry({ reservation, quantity: 0.1, referencePrice: 100, minQty: 0.001, minNotional: 5, maxNotionalDeviationPct: 2, client });
    const protections = await execution.installProtections({ reservation, side: 'LONG', stopPrice: 98, takeProfitPrice: 110, client });
    const pos = { ...ctx, sanal: false, borsaOrderId: fill.order.orderId };
    execution.markOpen(reservation, pos, protections, { entryOrder: fill.order });

    const oldStopClient = protections.stop.clientAlgoId;
    const replaced = await execution.replaceStopAtomic(pos, 99, client);
    assert.strictEqual(replaced.ok, true, replaced.reason);
    assert.strictEqual(replaced.singleConstraintFallback, true, 'Binance tek-stop fallback yolu kullanılmadı');
    const cancelIndex = exchange.sequence.findIndex(x => x === `CANCEL:${oldStopClient}`);
    const successIndex = exchange.sequence.findIndex(x => x.startsWith('CREATE_OK:STOP_MARKET:') && !x.endsWith(oldStopClient));
    assert(cancelIndex >= 0 && successIndex > cancelIndex, 'eski stop iptalinden sonra yeni stop doğrulanmadı');
    const activeStops = exchange.algos.filter(x => x.symbol === 'BTCUSDT' && x.orderType === 'STOP_MARKET' && ACTIVE.has(String(x.algoStatus).toUpperCase()));
    assert.strictEqual(activeStops.length, 1, 'tek aktif stop mutabakatı bozuldu');
    assert.strictEqual(Number(activeStops[0].triggerPrice), 99);

    // Binance ekranından manuel kapanış: iki exit fill ve otomatik EXPIRED Algo kayıtları.
    exchange.positions.set('BTCUSDT', { qty: 0, price: 100 });
    addTrade({ symbol: 'BTCUSDT', orderId: 777, side: 'SELL', qty: 0.07, price: 101, realizedPnl: 0.07, commission: 0.003 });
    addTrade({ symbol: 'BTCUSDT', orderId: 777, side: 'SELL', qty: 0.03, price: 101, realizedPnl: 0.03, commission: 0.001 });
    for (const algo of exchange.algos.filter(x => x.symbol === 'BTCUSDT')) { algo.algoStatus = 'EXPIRED'; algo.status = 'EXPIRED'; }
    const reconciled = await execution.finalizeExchangeClose(pos, 101, client);
    assert.strictEqual(reconciled.manual, true);
    assert.strictEqual(reconciled.accountingExact, true);
    assert.strictEqual(reconciled.entryCommission, 0.004);
    assert.strictEqual(reconciled.exitCommission, 0.004);
    assert.strictEqual(reconciled.commission, 0.008);
    assert.strictEqual(reconciled.netPnl, 0.092);
    const stored = execution.readState().records[reservation.fingerprint];
    assert.strictEqual(stored.status, 'CLOSED');
    assert.strictEqual(stored.protectionStage, 'CLOSED');
    assert.strictEqual(stored.accountingExact, true);
    assert.strictEqual(stored.entryCommission, 0.004);
    assert.strictEqual(stored.exitCommission, 0.004);
    assert.strictEqual(execution.readState().globalBlock, null, 'manuel kapanış hesap-geneli gerçek emir motorunu kilitledi');

    // Manuel kapanıştan sonra restart/disarm gerekmeden başka bir gerçek giriş rezerve edilebilmelidir.
    const nextReservation = await execution.reserveEntry({ symbol: 'ETHUSDT', side: 'LONG', context: { ...ctx, sym: 'ETHUSDT' }, client });
    assert.strictEqual(nextReservation.ok, true, nextReservation.reason);
    execution.releaseReservation(nextReservation, 'TEST_COMPLETE');

    // v6.10.3 state dosyasından kalmış legacy global kilit de otomatik temizlenmelidir.
    let legacy = execution.readState();
    legacy.globalBlock = { reason: 'MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED', symbol: 'BTCUSDT', at: new Date().toISOString() };
    execution.writeState(legacy);
    const legacyRecovery = await execution.reserveEntry({ symbol: 'XRPUSDT', side: 'SHORT', context: { ...ctx, sym: 'XRPUSDT', yon: 'SHORT' }, client });
    assert.strictEqual(legacyRecovery.ok, true, legacyRecovery.reason);
    assert.strictEqual(execution.readState().globalBlock, null, 'legacy manuel rearm kilidi otomatik temizlenmedi');
    execution.releaseReservation(legacyRecovery, 'TEST_COMPLETE');

    // Startup mutabakatı da ARM/ACK kapatma zorunluluğu olmadan legacy kilidi kaldırmalıdır.
    legacy = execution.readState();
    legacy.globalBlock = { reason: 'MANUAL_EXTERNAL_CLOSE_REARM_REQUIRED', symbol: 'BTCUSDT', at: new Date().toISOString() };
    execution.writeState(legacy);
    await execution.startupReconcile(client);
    assert.strictEqual(execution.readState().globalBlock, null, 'startup legacy manuel rearm kilidini temizlemedi');

    const continuity = require('./65_accounting_continuity.js');
    const breakdown = continuity.activeBreakdown([
      { sym: 'REAL', sanal: false, renkoPremierDecision: { premier: true }, premierTrackAtOpen: 'PREMIER_SCORE_RANKED' },
      { sym: 'SHADOW', sanal: true, liveShadowObservation: true, leagueShadowOnly: true, labPremierDecision: { virtualShadowOnly: true } }
    ]);
    assert.strictEqual(breakdown.real, 1);
    assert.strictEqual(breakdown.premier, 1, 'gerçek Score-Premier aktif sayaçta görünmüyor');
    assert.strictEqual(breakdown.shadow, 1, 'canlı Shadow öğrenme aktif sayaçta görünmüyor');

    const kalici = require('./5_kalici_hafiza.js');
    ayarlar.sanalPozisyonHafizasiAktif = true;
    h.state.aktifPozisyonlar = [
      { sym: 'REALUSDT', yon: 'LONG', sanal: false },
      { sym: 'SHADOWUSDT', yon: 'LONG', sanal: true, liveShadowObservation: true, acilisZamani: Date.now() }
    ];
    kalici.kaydet('v6103-shadow-persistence-test');
    const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, 'sanal-state.json'), 'utf8'));
    assert.strictEqual(persisted.aktifPozisyonlar.length, 1, 'gerçek pozisyon sanal Shadow state dosyasına karıştı');
    assert.strictEqual(persisted.aktifPozisyonlar[0].sym, 'SHADOWUSDT');
    h.state.aktifPozisyonlar = [];
    kalici.yukle();
    assert.strictEqual(h.state.aktifPozisyonlar.length, 1, 'canlı Shadow gözlem restartta yüklenmedi');
    assert.strictEqual(h.state.aktifPozisyonlar[0].liveShadowObservation, true);

    const piyasaSource = fs.readFileSync(path.join(__dirname, '3_piyasa.js'), 'utf8');
    assert(piyasaSource.includes('yuklenenShadowlar') && piyasaSource.includes('restoredShadow'), 'gerçek restart mutabakatı Shadow/GAP gözlemleri korumuyor');

    const lab = require('./62_lab_premier_league.js');
    const n0Exit = lab.frozenExit({ upperLayerIncluded: true, entryProven: false, premierTrack: lab.TRACK.LAB, labDnaLabel: 'LAB #1', labKey: 'X', at: new Date().toISOString(), exitValidated: false });
    assert(n0Exit.reason.includes('Entry Replay kanıtı yok'));
    assert(!n0Exit.reason.includes('Giriş kanıtlı'));

    const operation = require('./82_st2_operation_transparency.js');
    const opPos = {
      sym: 'BTCUSDT', yon: 'LONG', sanal: false, miktar: 0.1, girisFiyati: 100, sl: 99, tp: 110,
      renkoPremierDecision: { premier: true, activeBrick: 0.25, premierScore: { score: 80, threshold: 70, rank: 1, cohortSize: 10, components: {} } },
      premierTrackAtOpen: 'PREMIER_SCORE_RANKED', girisAnalizi: { historicalEntryGate: { evidence: { n: 0 }, decision: { reason: 'ENTRY_REPLAY_KANITI_YOK' } } },
      executionExitAssignment: { ready: false, samples: 0, reason: 'Entry Replay kanıtı yok; güvenli fallback' },
      renkoExitAssignment: { profileSamples: 46, profileConfidence: 0.92, status: 'WAITING_TAKEOVER', assignedTakeoverPct: 0.26, assignedAtrMultiplier: 1.04, assignedCaptureRatio: 0.88, takeoverSource: 'ONLINE_LEARNED_PROFILE' },
      gercekEmirYurutme: { entryOrder: { status: 'FILLED', executedQty: '0.1', avgPrice: '100' }, protections: { stop: { algoId: 11, triggerPrice: 99 }, takeProfit: { algoId: 12, triggerPrice: 110 } } }
    };
    const assignedText = operation.openingText(opPos, { real: true, pricePrecision: 2 });
    assert(assignedText.includes('Varsayılan/güvenli giriş'));
    assert(assignedText.includes('TAKEOVER PROFİLİ ATANDI / EŞİK BEKLENİYOR'));
    assert(!assignedText.includes('TAKEOVER AKTİF / ATR KÂR TAKİBİ DEVREDE'));
    assert(assignedText.includes('BİNANCE KORUMA DOĞRULANDI'));
    assert(assignedText.includes('Koruma durumu: SL_TP_ACTIVE'));
    const takeoverMetric = require('./83_st2_premier_quality_score.js').metricText(
      { n: 46, wins: 0, losses: 0, be: 0, pf: 1.89, expectancy: 0.1933, net: 8.8910 },
      { prefix: 'Takeover', hideOutcomeCounts: true }
    );
    assert(!takeoverMetric.includes('✅0') && takeoverMetric.includes('Takeover N46'), 'Takeover sonucu sınıflandırılmamışsa yanıltıcı 0/0/0 sayaçları gizlenmeli');
    opPos.renkoExitActivated = true;
    const activeText = operation.openingText(opPos, { real: true, pricePrecision: 2 });
    assert(activeText.includes('TAKEOVER AKTİF / ATR KÂR TAKİBİ DEVREDE'));

    const motorSource = fs.readFileSync(path.join(__dirname, 'motor.js'), 'utf8');
    assert(motorSource.includes('canliShadowOgrenmeAc'));
    assert(motorSource.includes('GERCEK_POZISYON_SLOTU_DOLU'));
    assert.strictEqual(ayarlar.canliShadowMaksAktifGozlem, 200);

    console.log('✅ v6.10.6 manual close auto-rearm + safe single-stop trailing + exact commissions + real/shadow separation + Telegram reconciliation passed');
  } finally {
    try { require('./85_st2_real_order_execution.js').cleanupProcessLock(); } catch (_) {}
    Module._load = originalLoad;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch(err => { console.error('❌ v6.10.3 test failed:', err.stack || err); process.exitCode = 1; });
