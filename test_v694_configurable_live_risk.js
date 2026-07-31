'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v694-'));
process.env.AGROS_DATA_DIR = temp;
process.env.AGROS_REAL_ORDER_ARM = 'LIVE_TRADING_CONFIRMED';
process.env.AGROS_REAL_ORDER_ENV = 'MAINNET';
process.env.BINANCE_BASE_URL = 'https://fapi.binance.com';

const ayarlar = require('./ayarlar.js');
const bridge = require('./50_real_order_readiness_bridge.js');

assert.strictEqual(bridge.realAuthorization().valid, true, 'genel canlı onayı mainnet üzerinde geçerli olmalı');
assert.strictEqual(ayarlar.gercekEmirOnayKodu, 'LIVE_TRADING_CONFIRMED', 'onay kodu risk değerlerini kodlamamalı');

// Kullanıcı ayarlar.js değerlerini değiştirdiğinde köprü aynı değerleri kullanmalı.
ayarlar.gercekEmirSabitNotionalUsdt = 37.5;
ayarlar.gercekEmirSabitKaldirac = 7;
ayarlar.gercekEmirMarjinTipi = 'CROSSED';
ayarlar.gercekEmirMaxAktifPozisyon = 3;

assert.deepStrictEqual(bridge.liveRiskProfile(), {
  notionalUsdt: 37.5,
  leverage: 7,
  marginType: 'CROSSED',
  maxActivePositions: 3,
  protectionRequired: true
});

const pos = {
  sym: 'BTCUSDT',
  yon: 'LONG',
  sanal: false,
  tradeId: 'V694-CONFIG-1',
  blackboxAcilis: {
    strategySignature: {
      key: 'YON=LONG|BTC=GGGG|COIN=GGGG'
    }
  }
};
const scoreDecision = {
  selected: true,
  policySource: 'CALIBRATED',
  hardReasons: [],
  score: 99
};
const decision = bridge.evaluate(pos, { realMode: true, scoreDecision });
assert.strictEqual(decision.allowed, true, `ayar tabanlı 37.5 USDT / 7x risk profili engellenmemeli: ${decision.reasons.join(',')}`);
assert(!decision.reasons.includes('GERCEK_EMIR_NOTIONAL_25_USDT_DEGIL'));
assert(!decision.reasons.includes('GERCEK_EMIR_KALDIRAC_5X_DEGIL'));

// 0 aktif pozisyon limiti bilinçli yeni-giriş durdurma seçeneği olmalı.
ayarlar.gercekEmirMaxAktifPozisyon = 0;
assert.strictEqual(bridge.liveRiskProfile().maxActivePositions, 0);

// Geçersiz temel değerler yine fail-closed kalmalı.
ayarlar.gercekEmirSabitNotionalUsdt = 0;
const invalid = bridge.evaluate(pos, { realMode: true, scoreDecision });
assert.strictEqual(invalid.allowed, false);
assert(invalid.reasons.includes('GERCEK_EMIR_NOTIONAL_GECERSIZ'));

console.log('✅ AGROS ST2 v6.9.4 configurable live risk controls passed');
