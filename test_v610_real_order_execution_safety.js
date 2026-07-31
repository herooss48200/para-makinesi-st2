'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v610-'));
process.env.AGROS_DATA_DIR = tempDir;
process.env.AGROS_REAL_ORDER_ARM = 'LIVE_TRADING_CONFIRMED';
process.env.AGROS_REAL_ORDER_ENV = 'MAINNET';
process.env.AGROS_REAL_ORDER_EXECUTION_ACK = 'V610_REVIEWED';
process.env.BINANCE_BASE_URL = 'https://fapi.binance.com';
process.env.BINANCE_API_KEY = 'TEST';
process.env.BINANCE_API_SECRET = 'TEST';

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function activeStatus(status) { return ['NEW', 'ACCEPTED', 'PENDING', 'WORKING', 'TRIGGERING'].includes(String(status || '').toUpperCase()); }

function createMockClient() {
  const state = {
    positions: new Map(),
    regularOrders: [],
    algoOrders: [],
    trades: [],
    nextOrderId: 1000,
    nextAlgoId: 5000,
    nextTradeId: 9000,
    throwAfterNextEntry: false,
    partialNextEntry: false,
    failNextAlgo: false,
    sequence: [],
    marketOrderCalls: 0,
    conditionalViaRegular: 0,
    lastClosePayload: null,
    failCancelClientIds: new Set()
  };

  function row(symbol) {
    const p = state.positions.get(symbol) || { positionAmt: 0, entryPrice: 0 };
    return {
      symbol,
      positionAmt: String(p.positionAmt),
      entryPrice: String(p.entryPrice),
      positionSide: 'BOTH',
      markPrice: String(p.entryPrice || 0)
    };
  }
  function orderByClient(id) { return state.regularOrders.find(o => o.clientOrderId === id); }
  function algoBy(payload) {
    return state.algoOrders.find(o =>
      (payload.algoId != null && String(o.algoId) === String(payload.algoId)) ||
      (payload.clientAlgoId && o.clientAlgoId === payload.clientAlgoId)
    );
  }
  function pushTrade({ symbol, orderId, side, price, qty, realizedPnl = 0, commission = 0.01, commissionAsset = 'USDT' }) {
    state.trades.push({
      symbol, id: state.nextTradeId++, orderId, side,
      price: String(price), qty: String(qty), realizedPnl: String(realizedPnl),
      commission: String(commission), commissionAsset, time: Date.now(), positionSide: 'BOTH'
    });
  }

  const client = {
    _state: state,
    futuresPositionRisk: async payload => {
      if (payload?.symbol) return [row(payload.symbol)];
      const symbols = new Set(['BTCUSDT', ...state.positions.keys()]);
      return [...symbols].map(row);
    },
    futuresOpenOrders: async ({ symbol } = {}) => state.regularOrders.filter(o =>
      (!symbol || o.symbol === symbol) && !['FILLED', 'CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(o.status)
    ).map(clone),
    futuresGetOrder: async ({ symbol, origClientOrderId, orderId }) => {
      const found = state.regularOrders.find(o => o.symbol === symbol && (
        (origClientOrderId && o.clientOrderId === origClientOrderId) ||
        (orderId != null && String(o.orderId) === String(orderId))
      ));
      if (!found) throw new Error('-2013 Order does not exist');
      return clone(found);
    },
    futuresAllOrders: async ({ symbol }) => state.regularOrders.filter(o => o.symbol === symbol).map(clone),
    futuresCancelOrder: async ({ symbol, orderId, origClientOrderId }) => {
      const found = state.regularOrders.find(o => o.symbol === symbol && (
        (orderId != null && String(o.orderId) === String(orderId)) ||
        (origClientOrderId && o.clientOrderId === origClientOrderId)
      ));
      if (found) found.status = 'CANCELED';
      return clone(found || {});
    },
    futuresOrder: async payload => {
      state.marketOrderCalls++;
      if (payload.type !== 'MARKET') state.conditionalViaRegular++;
      if (payload.type !== 'MARKET') throw new Error('TEST: koşullu emir eski endpointten gönderildi');
      const duplicate = orderByClient(payload.newClientOrderId);
      if (duplicate) throw new Error('-4116 duplicated clientOrderId');
      const orderId = state.nextOrderId++;
      const qty = Number(payload.quantity);
      const current = state.positions.get(payload.symbol) || { positionAmt: 0, entryPrice: payload.symbol === 'ETHUSDT' ? 2500 : 50000 };
      const price = current.entryPrice || (payload.symbol === 'ETHUSDT' ? 2500 : 50000);
      const isClose = String(payload.reduceOnly) === 'true';
      const partialEntry = !isClose && state.partialNextEntry;
      if (partialEntry) state.partialNextEntry = false;
      const executedQty = partialEntry ? qty / 2 : qty;
      const order = {
        symbol: payload.symbol, orderId, clientOrderId: payload.newClientOrderId,
        status: partialEntry ? 'PARTIALLY_FILLED' : 'FILLED', type: 'MARKET', side: payload.side,
        executedQty: String(executedQty), avgPrice: String(price)
      };
      state.regularOrders.push(order);
      state.sequence.push(`${isClose ? 'CLOSE' : 'ENTRY'}:${payload.newClientOrderId}`);
      if (isClose) {
        state.lastClosePayload = clone(payload);
        const oldAmt = Number(current.positionAmt || 0);
        const pnl = oldAmt >= 0 ? 1.25 : 0.75;
        state.positions.set(payload.symbol, { positionAmt: 0, entryPrice: price });
        pushTrade({ symbol: payload.symbol, orderId, side: payload.side, price: price + (oldAmt >= 0 ? 1000 : -100), qty, realizedPnl: pnl, commission: 0.02 });
      } else {
        const signed = payload.side === 'BUY' ? executedQty : -executedQty;
        state.positions.set(payload.symbol, { positionAmt: signed, entryPrice: price });
        pushTrade({ symbol: payload.symbol, orderId, side: payload.side, price, qty: executedQty, realizedPnl: 0, commission: 0.01 });
        if (state.throwAfterNextEntry) {
          state.throwAfterNextEntry = false;
          throw new Error('ETIMEDOUT after exchange accepted order');
        }
      }
      return clone(order);
    },
    futuresCreateAlgoOrder: async payload => {
      state.sequence.push(`ALGO_CREATE:${payload.clientAlgoId}`);
      if (state.failNextAlgo) {
        state.failNextAlgo = false;
        throw new Error('TEST_ALGO_CREATE_FAILED');
      }
      const existing = algoBy({ clientAlgoId: payload.clientAlgoId });
      if (existing) throw new Error('-4116 duplicated clientAlgoId');
      const order = {
        symbol: payload.symbol, algoId: state.nextAlgoId++, clientAlgoId: payload.clientAlgoId,
        side: payload.side, orderType: payload.type, algoType: payload.algoType,
        triggerPrice: String(payload.triggerPrice), closePosition: payload.closePosition,
        workingType: payload.workingType, algoStatus: 'NEW', actualOrderId: '', actualPrice: '0.00000',
        createTime: Date.now(), updateTime: Date.now()
      };
      state.algoOrders.push(order);
      return clone(order);
    },
    futuresGetAlgoOrder: async payload => {
      const found = algoBy(payload);
      if (!found) throw new Error('-2013 Algo order does not exist');
      return clone(found);
    },
    futuresGetOpenAlgoOrders: async ({ symbol } = {}) => state.algoOrders.filter(o =>
      (!symbol || o.symbol === symbol) && activeStatus(o.algoStatus || o.status)
    ).map(clone),
    futuresCancelAlgoOrder: async payload => {
      const found = algoBy(payload);
      state.sequence.push(`ALGO_CANCEL:${found?.clientAlgoId || payload.clientAlgoId || payload.algoId}`);
      if (!found) throw new Error('-2011 Unknown order');
      if (state.failCancelClientIds.has(found.clientAlgoId)) throw new Error('TEST_ALGO_CANCEL_FAILED');
      found.algoStatus = 'CANCELED';
      found.status = 'CANCELED';
      found.updateTime = Date.now();
      return clone(found);
    },
    futuresUserTrades: async ({ symbol, startTime = 0, endTime = Number.MAX_SAFE_INTEGER }) => state.trades.filter(t =>
      t.symbol === symbol && t.time >= startTime && t.time <= endTime
    ).map(clone)
  };
  return client;
}

const mockClient = createMockClient();
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => mockClient };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const ayarlar = require('./ayarlar.js');
    ayarlar.sanalEmirModu = false;
    ayarlar.gercekEmirYetkilendirmeAktif = true;
    ayarlar.gercekEmirOnayKodu = 'LIVE_TRADING_CONFIRMED';
    ayarlar.gercekEmirAnaAgZorunlu = true;
    const h = require('./1_hafiza.js');
    h.state.basamaklar.BTCUSDT = { tickSize: 0.1, pricePrecision: 1, quantityPrecision: 3 };
    h.state.basamaklar.ETHUSDT = { tickSize: 0.01, pricePrecision: 2, quantityPrecision: 3 };
    h.state.basamaklar.BNBUSDT = { tickSize: 0.01, pricePrecision: 2, quantityPrecision: 3 };
    const execution = require('./85_st2_real_order_execution.js');

    // Resmî Algo Service yanıt alanları ve boş/null sayısal değerler güvenli normalize edilmeli.
    const officialAlgo = execution._test.normalizeAlgoOrder({ orderType: 'STOP_MARKET', algoStatus: 'NEW', actualOrderId: '' });
    assert.strictEqual(officialAlgo.type, 'STOP_MARKET');
    assert.strictEqual(officialAlgo.status, 'NEW');
    assert.strictEqual(execution._test.finite(null, 123), 123, 'null sessizce 0 sayıldı');
    assert.strictEqual(execution._test.finite('', 456), 456, 'boş string sessizce 0 sayıldı');
    assert.strictEqual(execution._test.positiveId(null), null, 'null orderId 0 sayıldı');

    const context = {
      sym: 'BTCUSDT', yon: 'LONG', girisFiyati: 50000, miktar: 0.001, sl: 49000, tp: 52000,
      girisAnalizi: { patternId: 'LONG_GGGG', sonKapaliTuglaZamani: 123456789, referansTuglaId: 'R-1' },
      realOrderReadiness: { key: 'DNA-TEST-1' }
    };
    const fp1 = execution.contextFingerprint('BTCUSDT', 'LONG', context);
    const fp2 = execution.contextFingerprint('BTCUSDT', 'LONG', clone(context));
    assert.strictEqual(fp1, fp2, 'Fingerprint deterministik olmalı');
    const ids = execution.clientIds('BTCUSDT', 'LONG', fp1);
    assert.ok(Object.values(ids).every(id => id.length <= 36 && id.startsWith('AGST2')), 'Client id sınırı/önek hatalı');

    const reservation = await execution.reserveEntry({
      symbol: 'BTCUSDT', side: 'LONG', context, maxActivePositions: 5, client: mockClient
    });
    assert.strictEqual(reservation.ok, true, reservation.reason);

    mockClient._state.throwAfterNextEntry = true;
    const fill = await execution.executeEntry({
      reservation, quantity: 0.001, referencePrice: 50000,
      minQty: 0.001, minNotional: 5, maxNotionalDeviationPct: 2, client: mockClient
    });
    assert.strictEqual(fill.ambiguityRecovered, true, 'Timeout sonrası aynı client id ile mutabakat yapılmadı');
    assert.strictEqual(mockClient._state.marketOrderCalls, 1, 'Belirsiz yanıtta ikinci giriş emri gönderildi');
    assert.strictEqual(fill.actualQty, 0.001);
    assert.strictEqual(fill.avgPrice, 50000);

    const protections = await execution.installProtections({
      reservation, side: 'LONG', stopPrice: '49000.0', takeProfitPrice: '52000.0', client: mockClient
    });
    assert.ok(protections.stop.algoId && protections.takeProfit.algoId, 'Algo SL/TP kurulmadı');
    assert.strictEqual(mockClient._state.conditionalViaRegular, 0, 'Koşullu emir eski futuresOrder yolundan gönderildi');

    const pos = { ...context, sanal: false, acilisZamani: Date.now() - 1000, borsaOrderId: fill.order.orderId };
    execution.markOpen(reservation, pos, protections, { entryOrder: fill.order, ambiguityRecovered: true });
    const duplicate = await execution.reserveEntry({
      symbol: 'BTCUSDT', side: 'LONG', context, maxActivePositions: 5, client: mockClient
    });
    assert.strictEqual(duplicate.ok, false, 'Aynı sinyal/pozisyon için ikinci rezervasyon açıldı');

    const oldStopId = pos.gercekEmirYurutme.protections.stop.clientAlgoId;
    const sequenceBeforeFailure = mockClient._state.sequence.length;
    mockClient._state.failNextAlgo = true;
    const failedStop = await execution.replaceStopAtomic(pos, 49500, mockClient);
    assert.strictEqual(failedStop.ok, false);
    assert.strictEqual(failedStop.oldKept, true, 'Yeni stop başarısızken eski stop korunmadı');
    assert.ok(!mockClient._state.sequence.slice(sequenceBeforeFailure).some(x => x === `ALGO_CANCEL:${oldStopId}`), 'Yeni stop yokken eski stop iptal edildi');

    const sequenceStart = mockClient._state.sequence.length;
    const replaced = await execution.replaceStopAtomic(pos, 49600, mockClient);
    assert.strictEqual(replaced.ok, true, replaced.reason);
    const stopSequence = mockClient._state.sequence.slice(sequenceStart);
    assert.ok(stopSequence[0].startsWith('ALGO_CREATE:'), 'Yeni stop önce oluşturulmadı');
    assert.ok(stopSequence.some(x => x === `ALGO_CANCEL:${oldStopId}`), 'Eski stop yeni stop doğrulandıktan sonra iptal edilmedi');

    const closed = await execution.closePositionMarket(pos, 'TEST_ENGINE_CLOSE', mockClient);
    assert.strictEqual(closed.ok, true, closed.reason);
    assert.strictEqual(Number((await mockClient.futuresPositionRisk({ symbol: 'BTCUSDT' }))[0].positionAmt), 0, 'Kapanış sonrası pozisyon sıfır değil');
    assert.strictEqual(mockClient._state.lastClosePayload.reduceOnly, 'true', 'Kapanış reduceOnly değil');
    assert.strictEqual(closed.source, 'BINANCE_USER_TRADES');
    assert.strictEqual(closed.accountingExact, true);
    assert.strictEqual(closed.commission, 0.03, 'Giriş+çıkış gerçek komisyonu toplanmadı');
    assert.strictEqual(closed.netPnl, 1.22, 'Gerçek net PNL yanlış');

    // Kısmi fill: kalan emir iptal edilir, yalnız gerçekleşen miktar sahiplenilir; ikinci emir gönderilmez.
    const partialContext = {
      sym: 'BNBUSDT', yon: 'LONG', girisFiyati: 50000, miktar: 0.002, sl: 49000, tp: 52000,
      girisAnalizi: { patternId: 'LONG_GRGG', sonKapaliTuglaZamani: 223456789, referansTuglaId: 'R-2' },
      realOrderReadiness: { key: 'DNA-TEST-PARTIAL' }
    };
    const partialReservation = await execution.reserveEntry({
      symbol: 'BNBUSDT', side: 'LONG', context: partialContext, maxActivePositions: 5, client: mockClient
    });
    assert.strictEqual(partialReservation.ok, true, partialReservation.reason);
    mockClient._state.partialNextEntry = true;
    const partialFill = await execution.executeEntry({
      reservation: partialReservation, quantity: 0.002, referencePrice: 50000,
      minQty: 0.001, minNotional: 5, maxNotionalDeviationPct: 60, client: mockClient
    });
    assert.strictEqual(partialFill.actualQty, 0.001, 'Kısmi gerçekleşen miktar yerine istenen miktar sahiplenildi');
    assert.strictEqual(partialFill.order.status, 'CANCELED', 'Kısmi emrin kalan miktarı iptal edilmedi');
    const callsBeforeRollback = mockClient._state.marketOrderCalls;
    const partialRollback = await execution.rollbackEntry({
      reservation: partialReservation, side: 'LONG', reason: 'TEST_PARTIAL_CLEANUP', client: mockClient
    });
    assert.strictEqual(partialRollback.ok, true, partialRollback.reason);
    assert.strictEqual(mockClient._state.marketOrderCalls, callsBeforeRollback + 1, 'Kısmi fill temizliğinde tek reduceOnly kapanış dışında emir gönderildi');

    // State dışında kalmış AGST2 orphan emirleri hesap genelinde bulunup temizlenmeli.
    mockClient._state.algoOrders.push({
      symbol: 'XRPUSDT', algoId: mockClient._state.nextAlgoId++, clientAlgoId: 'AGST2S-XRP-O-RPHAN',
      side: 'SELL', orderType: 'STOP_MARKET', triggerPrice: '0.5', closePosition: true, algoStatus: 'NEW'
    });
    mockClient._state.regularOrders.push({
      symbol: 'XRPUSDT', orderId: mockClient._state.nextOrderId++, clientOrderId: 'AGST2E-XRP-O-RPHAN',
      status: 'NEW', type: 'MARKET', side: 'BUY', executedQty: '0', avgPrice: '0'
    });

    // Restart: kayıt dışı gerçek pozisyon kör biçimde unutulmaz; öğrenme hariç sahiplenilir ve korunur.
    mockClient._state.positions.set('ETHUSDT', { positionAmt: -0.02, entryPrice: 2500 });
    const startup = await execution.startupReconcile(mockClient);
    assert.strictEqual(startup.blocked, false);
    assert.strictEqual(startup.adopted, 1);
    const adopted = startup.positions.find(p => p.sym === 'ETHUSDT');
    assert.ok(adopted && adopted.sanal === false && adopted.scientificLearningExcluded === true, 'Harici pozisyon güvenli/adopted işaretlenmedi');
    assert.ok(adopted.gercekEmirYurutme.protections.stop && adopted.gercekEmirYurutme.protections.takeProfit, 'Restart korumaları kurulmadı');
    assert.ok(!activeStatus(mockClient._state.algoOrders.find(o => o.clientAlgoId === 'AGST2S-XRP-O-RPHAN')?.algoStatus), 'Orphan Algo emri temizlenmedi');
    assert.strictEqual(mockClient._state.regularOrders.find(o => o.clientOrderId === 'AGST2E-XRP-O-RPHAN')?.status, 'CANCELED', 'Orphan normal emir temizlenmedi');

    // Algo stop gerçekten tetiklendiyse manuel kapanış sayılmamalı.
    const stopAlgo = mockClient._state.algoOrders.find(o => o.clientAlgoId === adopted.gercekEmirYurutme.protections.stop.clientAlgoId);
    delete stopAlgo.status;
    stopAlgo.algoStatus = 'FINISHED';
    stopAlgo.actualOrderId = '7777';
    mockClient._state.positions.set('ETHUSDT', { positionAmt: 0, entryPrice: 2500 });
    mockClient._state.trades.push({
      symbol: 'ETHUSDT', id: mockClient._state.nextTradeId++, orderId: 7777, side: 'BUY',
      price: '2537.5', qty: '0.02', realizedPnl: '-0.75', commission: '0.01', commissionAsset: 'USDT',
      time: Date.now(), positionSide: 'BOTH'
    });
    const reconciled = await execution.finalizeExchangeClose(adopted, 2537.5, mockClient);
    assert.strictEqual(reconciled.manual, false, 'Algo stop kapanışı manuel sayıldı');
    assert.ok(/SL|STOP/.test(reconciled.reason), `Stop nedeni sınıflandırılamadı: ${reconciled.reason}`);
    assert.strictEqual(reconciled.closeOrderId, 7777, 'Algo actualOrderId muhasebeye bağlanmadı');

    // Fiyat stopa yakın olsa bile Algo Service tetik kanıtı yoksa manuel kapanış yanlış sınıflandırılmamalı.
    const manualNearStop = execution._test.classifyExchangeClose(
      { sym: 'BTCUSDT', yon: 'LONG', girisFiyati: 50000, sl: 49000, tp: 52000 },
      { exitPrice: 49000.1, tradeCount: 1 }, 49000.1, { stop: { algoStatus: 'CANCELED' }, takeProfit: { algoStatus: 'CANCELED' } }
    );
    assert.strictEqual(manualNearStop.manual, true, 'Yalnız fiyat yakınlığıyla manuel kapanış algo sayıldı');

    // Yeni stop aktifken eski stop iptal edilemiyorsa koruma kaybolmaz; sistem yeni girişleri fail-closed bloklar.
    mockClient._state.positions.set('ETHUSDT', { positionAmt: -0.02, entryPrice: 2500 });
    const currentStop = adopted.gercekEmirYurutme.protections.stop;
    const currentStopRow = mockClient._state.algoOrders.find(o => o.clientAlgoId === currentStop.clientAlgoId);
    currentStopRow.algoStatus = 'NEW';
    currentStopRow.actualOrderId = '';
    mockClient._state.failCancelClientIds.add(currentStop.clientAlgoId);
    const rolledBackStop = await execution.replaceStopAtomic(adopted, 2580, mockClient);
    assert.strictEqual(rolledBackStop.ok, false, 'Eski stop iptal edilemezken yeni stop aktif kabul edildi');
    assert.strictEqual(rolledBackStop.newRolledBack, true, 'Eski stop iptal edilemezken yeni stop geri alınmadı');
    assert.strictEqual(execution.readState().globalBlock, null, 'Tek aktif eski stop korunmuşken gereksiz global block oluştu');
    mockClient._state.failCancelClientIds.delete(currentStop.clientAlgoId);

    // Eski ve yeni stopun ikisi de iptal edilemiyorsa çift close-all koruma belirsizliği fail-closed olmalı.
    const doubleStopPrice = 2590;
    const doubleStopClientId = execution._test.stopRevisionClientId(
      'ETHUSDT', 'SHORT', adopted.gercekEmirYurutme.fingerprint, doubleStopPrice
    );
    mockClient._state.failCancelClientIds.add(currentStop.clientAlgoId);
    mockClient._state.failCancelClientIds.add(doubleStopClientId);
    const doubleStop = await execution.replaceStopAtomic(adopted, doubleStopPrice, mockClient);
    assert.strictEqual(doubleStop.ok, false);
    assert.strictEqual(doubleStop.globalBlocked, true, 'Çift aktif stop belirsizliği fail-closed bloklanmadı');
    assert.strictEqual(execution.readState().globalBlock?.reason, 'CIFT_STOP_KORUMA_MUTABAKATSIZLIGI');
    mockClient._state.failCancelClientIds.delete(currentStop.clientAlgoId);
    mockClient._state.failCancelClientIds.delete(doubleStopClientId);

    // Primary bozulursa sağlam backup kurtarılır ve sonraki yazım backup'ı bozuk primary ile ezmez.
    const validStateText = fs.readFileSync(execution.STATE_FILE, 'utf8');
    fs.writeFileSync(`${execution.STATE_FILE}.bak`, validStateText);
    fs.writeFileSync(execution.STATE_FILE, '{broken-primary');
    const recoveredFromBackup = execution.readState();
    assert.ok(recoveredFromBackup.records && Object.keys(recoveredFromBackup.records).length > 0, 'Sağlam backup kurtarılamadı');
    execution.persistPosition(adopted, 'TEST_BACKUP_RECOVERY_WRITE');
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(`${execution.STATE_FILE}.bak`, 'utf8')), 'Bozuk primary sağlam backup üzerine kopyalandı');
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(execution.STATE_FILE, 'utf8')), 'Backup recovery sonrası primary onarılmadı');

    // Kalıcı state ve backup birlikte bozulursa boş state ile işlem açmak yerine fail-closed olmalı.
    fs.writeFileSync(execution.STATE_FILE, '{broken');
    fs.writeFileSync(`${execution.STATE_FILE}.bak`, '{also-broken');
    const corrupted = execution.readState();
    assert.strictEqual(corrupted.globalBlock?.reason, 'STATE_CORRUPTION_NO_RECOVERY');
    await assert.rejects(() => execution.startupReconcile(mockClient), /STATE_CORRUPTION_NO_RECOVERY/, 'Bozuk state ile restart devam etti');

    console.log('✅ v6.10.0 real order execution safety tests passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch(err => {
  console.error('❌ v6.10.0 test failed:', err.stack || err.message || err);
  process.exitCode = 1;
});
