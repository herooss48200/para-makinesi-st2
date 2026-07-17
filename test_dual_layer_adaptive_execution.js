const assert = require('assert');
const ayarlar = require('./ayarlar.js');
const bridge = require('./50_real_order_readiness_bridge.js');
const executor = require('./51_sanal_dynamic_exit_executor.js');

const old = {
  realAuth: ayarlar.gercekEmirYetkilendirmeAktif,
  realDynamic: ayarlar.gercekDynamicExitAktif,
  virtualDynamic: ayarlar.sanalDynamicExitAktif
};

try {
  ayarlar.gercekEmirYetkilendirmeAktif = false;
  ayarlar.gercekDynamicExitAktif = false;
  ayarlar.sanalDynamicExitAktif = true;

  const base = {
    sym: 'TESTUSDT', yon: 'LONG', sanal: true, girisFiyati: 100, acilisZamani: Date.now(),
    blackboxAcilis: { strategySignature: { key: 'YON=LONG|BTC=0000|COIN=0000|BTC_TF=-|COIN_TF=-|BB=ORTA_ALT' } }
  };

  const virtualDecision = bridge.evaluate(base, { realMode: false });
  assert.strictEqual(virtualDecision.allowed, true, 'UNRANKED dahil sanal öğrenme açık olmalı');
  assert.strictEqual(virtualDecision.virtualPool, 'ALL_VALID_DNA_LEARNING');
  assert.ok(base.exitPlanShadow, 'Sanal açılışta güncel exit planı atanmalı');

  const realPos = { ...base, sanal: false, realOrderReadiness: undefined };
  const realDecision = bridge.evaluate(realPos, { realMode: true });
  assert.strictEqual(realDecision.allowed, false, 'Premier/yetki koşulları olmadan gerçek emir kapanmalı');

  const lockedRealExit = executor.evaluate({ ...realPos, realOrderReadiness: { allowed: true } }, 101);
  assert.strictEqual(lockedRealExit.active, false, 'Gerçek dinamik exit ayrıca açılmadan çalışmamalı');

  console.log('✅ Dual-layer adaptive execution tests passed');
} finally {
  ayarlar.gercekEmirYetkilendirmeAktif = old.realAuth;
  ayarlar.gercekDynamicExitAktif = old.realDynamic;
  ayarlar.sanalDynamicExitAktif = old.virtualDynamic;
}
