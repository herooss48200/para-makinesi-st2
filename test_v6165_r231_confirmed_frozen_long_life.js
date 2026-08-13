'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'st2-r231-'));
process.env.AGROS_DATA_DIR = temp;

try {
  const ayarlar = require('./ayarlar.js');
  const version = require('./versiyon.js');
  const policy = require('./90_st2_renko_entry_mode_policy.js');
  const exit = require('./74_st2_renko_exit_evolution.js');
  const transparency = require('./82_st2_operation_transparency.js');

  const CURRENT = '6.13.5-R24.2-UNIFIED-PERCENT-ECONOMY-10SLOT-20USDT-LIVE-COHORTS-POSTCLOSE-24H';
  assert.strictEqual(version.botSurumu, CURRENT);
  assert.strictEqual(ayarlar.renkoGirisModuZorlaConfirmed, true, 'yeni gerçek giriş authority CONFIRMED olmalı');
  assert.strictEqual(ayarlar.renkoConfirmedLongLifeAktif, true, 'CONFIRMED long-life aktif olmalı');
  assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac, 20, 'R24 kontrollü notional 20 USDT olmalı');
  assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 10, 'R24 gerçek slot limiti 10 olmalı');
  assert.strictEqual(exit.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT', 'legacy VERSION contract bozulmamalı');
  assert.strictEqual(exit.RUNTIME_VERSION, 'v6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE');

  // Force-confirmed evidence olmasa bile fail-closed CONFIRMED authority üretmeli.
  const selected = policy.select({ yon: 'LONG', patternKodu: 'RRRR' });
  assert.strictEqual(selected.selectedMode, 'CONFIRMED');
  assert(Number(selected.selectedOffsetT) > 0);
  assert.strictEqual(selected.timingAuthority, 'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET');

  // Pusu kararı bir kez CONFIRMED olduğunda aynı pusuda object identity + offset dondurulur.
  const legacyPusu = {
    yon: 'LONG', patternKodu: 'RRRR',
    entryModeDecisionAtSignal: { selectedMode: 'DIRECT', selectedOffsetT: 1.00, frozenAt: 'OLD' }
  };
  const migrated = policy.selectFrozen(legacyPusu);
  assert.strictEqual(migrated.selectedMode, 'CONFIRMED');
  assert.strictEqual(migrated.migratedFromMode, 'DIRECT');
  assert(Number(migrated.selectedOffsetT) > 0);
  legacyPusu.entryModeDecisionAtSignal = migrated;
  const frozen = policy.selectFrozen(legacyPusu);
  assert.strictEqual(frozen, migrated, 'frozen CONFIRMED karar aynı pusuda yeniden hesaplanmamalı');
  assert.strictEqual(frozen.selectedOffsetT, migrated.selectedOffsetT, 'aynı pusu offseti değişmemeli');
  assert.strictEqual(frozen.frozenAt, migrated.frozenAt);

  // 15m reversal + offset gerçek zaman otoritesi.
  const confirmationPusu = {
    yon: 'LONG', patternKodu: 'RRRR', kaynakSonKapaliMumZamani: 1000,
    entryModeDecisionAtSignal: { selectedMode: 'CONFIRMED', selectedOffsetT: 0.50 }
  };
  const confirmation = policy.confirmationTarget(confirmationPusu, [
    { color: 'RED', open: 100, high: 101, low: 99, close: 100, closeTime: 2000 },
    { color: 'GREEN', open: 100, high: 102, low: 100, close: 101, closeTime: 3000 }
  ], 1, 4000);
  assert.strictEqual(confirmation.ready, true);
  assert.strictEqual(confirmation.reversal.pair, 'RED->GREEN');
  assert.strictEqual(confirmation.targetPrice, 101.5);

  // CONFIRMED long-life: +0.25 erken ekonomi stopu YOK; K1/K2 sözleşmesi korunur.
  const confirmedPos = {
    sym: 'TESTUSDT', yon: 'LONG', girisFiyati: 100, sl: 98.5, tp: 110, acilisZamani: Date.now(),
    girisAnalizi: { entryMode: 'CONFIRMED', entryTimingAuthority: 'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_1M_ST', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.50 }
  };
  const a = exit.assign(confirmedPos);
  assert.strictEqual(a.managementMode, 'CONFIRMED_LONG_LIFE_R23');
  assert.strictEqual(a.earlyEconomyBypassed, true);
  assert.strictEqual(a.confirmedLongLifeTarget1Pct, 1.50);

  const early = exit.update(confirmedPos, 100.30);
  assert.strictEqual(early.active, true);
  assert.strictEqual(early.changed, false);
  assert.strictEqual(early.reason, 'CONFIRMED_LONG_LIFE_EARLY_FLOOR_BYPASS');
  assert.strictEqual(confirmedPos.sl, 98.5, '+0.30% seviyesinde başlangıç stopu sıkılaştırılmamalı');
  assert.notStrictEqual(confirmedPos.renkoEarlyEconomyFloorLocked, true);

  const k1 = exit.update(confirmedPos, 100.50);
  assert.strictEqual(k1.active, true);
  assert.strictEqual(confirmedPos.renkoProfitFloorLocked, true);
  assert(confirmedPos.sl >= 100.39 && confirmedPos.sl <= 100.41, 'K1 +0.50 -> yaklaşık +0.40 taban olmalı');

  const k2 = exit.update(confirmedPos, 100.60);
  assert.strictEqual(k2.active, true);
  assert.strictEqual(k2.justActivated, true);
  assert.strictEqual(confirmedPos.renkoExitActivated, true);

  exit.update(confirmedPos, 101.50);
  assert.strictEqual(confirmedPos.renkoConfirmedLongLifeTarget1Hit, true, 'Hedef-1 +1.50 görülmesi işaretlenmeli');
  assert(confirmedPos.renkoProtectionTimeline.some(x => x.type === 'CONFIRMED_LONG_LIFE_TARGET1_HIT'));

  const takeoverText = exit.takeoverText(confirmedPos);
  assert(takeoverText.includes('CONFIRMED Long-Life'));
  assert(takeoverText.includes('BYPASS'));
  assert(takeoverText.includes('Hedef-1'));
  assert(takeoverText.includes('sabit TP değildir'));

  const opening = transparency.openingText(confirmedPos, { real: false, pricePrecision: 4 });
  assert(opening.includes('Giriş modu: <b>CONFIRMED</b>'));
  assert(opening.includes('YÜZDESEL EKONOMİ'));
  assert(opening.includes('+%2.50 görülene kadar erken kâr kilidi YOK'));
  assert(opening.includes('İlk kilit +%1.50'));

  const closing = transparency.closingText(confirmedPos, {
    pricePrecision: 4, exitPrice: 101.2, openedAtText: '12.08.2026 10:00', closedAtText: '12.08.2026 11:00',
    durationText: '1sa', outcome: 'TP', reason: 'TEST', grossPnl: 0.12, commission: 0.01, netPnl: 0.11,
    mfePct: 1.5, maePct: -0.2, fiyatKarYuzdesi: 1.2
  });
  assert(closing.includes('Mod CONFIRMED'));
  assert(closing.includes('YÜZDESEL EKONOMİ'));
  assert(closing.includes('+%2.50 → ilk stop +%1.50'));
  assert(closing.includes('yaklaşık %1.00 geriden takip'));

  // DIRECT davranışı geriye dönük bozulmamalı: +0.25 erken ekonomi tabanı hâlâ aktif.
  const directPos = {
    sym: 'DIRECTUSDT', yon: 'LONG', girisFiyati: 100, sl: 98.5, tp: 110, acilisZamani: Date.now(),
    girisAnalizi: { entryMode: 'DIRECT', patternKodu: 'RRRR', renkoBoxSize: 1, renkoEntryBrickDistance: 0.50 }
  };
  const directA = exit.assign(directPos);
  assert.strictEqual(directA.managementMode, 'LEGACY_DIRECT_SAFE_FLOOR');
  const directEarly = exit.update(directPos, 100.30);
  assert.strictEqual(directPos.renkoEarlyEconomyFloorLocked, true);
  assert.strictEqual(directEarly.changed, true);
  assert(directPos.sl >= 100.19 && directPos.sl <= 100.21);

  console.log('✅ R24 preserves CONFIRMED frozen authority while reporting percent-economy override; legacy exit module compatibility passed');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
