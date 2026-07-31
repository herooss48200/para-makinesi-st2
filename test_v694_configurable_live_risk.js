'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v694-'));
process.env.AGROS_DATA_DIR = temp;
process.env.AGROS_REAL_ORDER_ARM = 'LIVE_TRADING_CONFIRMED';
process.env.AGROS_REAL_ORDER_ENV = 'MAINNET';
process.env.AGROS_REAL_ORDER_EXECUTION_ACK = 'V610_REVIEWED';
process.env.BINANCE_BASE_URL = 'https://fapi.binance.com';

const ayarlar = require('./ayarlar.js');
const bridge = require('./50_real_order_readiness_bridge.js');

assert.strictEqual(bridge.realAuthorization().valid, true, 'genel canlı onayı mainnet üzerinde geçerli olmalı');
assert.strictEqual(ayarlar.gercekEmirOnayKodu, 'LIVE_TRADING_CONFIRMED', 'onay kodu risk değerlerini kodlamamalı');

// Eski .env içinde ARM açık kalsa bile v6.10.0 dağıtım onayı verilmeden yeni giriş açılamaz.
delete process.env.AGROS_REAL_ORDER_EXECUTION_ACK;
assert.strictEqual(bridge.realAuthorization().valid, false, 'v6.10.0 dağıtım onayı olmadan gerçek yetki açıldı');
assert.strictEqual(bridge.realAuthorization().executionAckValid, false);
process.env.AGROS_REAL_ORDER_EXECUTION_ACK = 'V610_REVIEWED';
assert.strictEqual(bridge.realAuthorization().valid, true, 'v6.10.0 dağıtım onayı geri verildiğinde yetki açılmadı');

// Kullanıcı ayarlar.js değerlerini değiştirdiğinde köprü aynı değerleri kullanmalı.
ayarlar.calisilmakIstenenUsdtMiktar = 5;
ayarlar.mevcutKaldirac = 7;
ayarlar.gercekEmirMarjinTipi = 'CROSSED';
ayarlar.gercekEmirMaxAktifPozisyon = 3;

assert.deepStrictEqual(bridge.liveRiskProfile(), {
  marginUsdt: 5,
  notionalUsdt: 35,
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
assert.strictEqual(decision.allowed, true, `ayar tabanlı 5 USDT marjin / 7x risk profili engellenmemeli: ${decision.reasons.join(',')}`);
assert(!decision.reasons.includes('GERCEK_EMIR_NOTIONAL_25_USDT_DEGIL'));
assert(!decision.reasons.includes('GERCEK_EMIR_KALDIRAC_5X_DEGIL'));

// 0 aktif pozisyon limiti bilinçli yeni-giriş durdurma seçeneği olmalı.
ayarlar.gercekEmirMaxAktifPozisyon = 0;
assert.strictEqual(bridge.liveRiskProfile().maxActivePositions, 0);

// Geçersiz temel değerler yine fail-closed kalmalı.
ayarlar.calisilmakIstenenUsdtMiktar = 0;
const invalid = bridge.evaluate(pos, { realMode: true, scoreDecision });
assert.strictEqual(invalid.allowed, false);
assert(invalid.reasons.includes('GERCEK_EMIR_MARJIN_GECERSIZ'));
assert(invalid.reasons.includes('GERCEK_EMIR_NOTIONAL_GECERSIZ'));


// Eksik veya sayı dışı canlı risk ayarları sessiz varsayılana dönmemeli.
ayarlar.calisilmakIstenenUsdtMiktar = undefined;
ayarlar.mevcutKaldirac = 'bozuk';
ayarlar.gercekEmirMarjinTipi = undefined;
ayarlar.gercekEmirMaxAktifPozisyon = undefined;
const missingConfig = bridge.evaluate(pos, { realMode: true, scoreDecision });
assert.strictEqual(missingConfig.allowed, false);
assert(missingConfig.reasons.includes('GERCEK_EMIR_MARJIN_GECERSIZ'));
assert(missingConfig.reasons.includes('GERCEK_EMIR_NOTIONAL_GECERSIZ'));
assert(missingConfig.reasons.includes('GERCEK_EMIR_KALDIRAC_GECERSIZ'));
assert(missingConfig.reasons.includes('GERCEK_EMIR_MARJIN_TIPI_GECERSIZ'));
assert(missingConfig.reasons.includes('GERCEK_EMIR_AKTIF_POZISYON_LIMITI_GECERSIZ'));

// Binance Futures üst sınırını aşan kaldıraç da API çağrısına bırakılmadan reddedilmeli.
ayarlar.calisilmakIstenenUsdtMiktar = 2;
ayarlar.mevcutKaldirac = 126;
ayarlar.gercekEmirMarjinTipi = 'ISOLATED';
ayarlar.gercekEmirMaxAktifPozisyon = 1;
const excessiveLeverage = bridge.evaluate(pos, { realMode: true, scoreDecision });
assert.strictEqual(excessiveLeverage.allowed, false);
assert(excessiveLeverage.reasons.includes('GERCEK_EMIR_KALDIRAC_GECERSIZ'));

console.log('✅ AGROS ST2 v6.9.5 strict configurable live risk controls passed');
