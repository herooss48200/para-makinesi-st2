'use strict';
const assert = require('assert');
const fs = require('fs');
const ayarlar = require('./ayarlar.js');
const version = require('./versiyon.js');

assert.strictEqual(ayarlar.sabitStopYuzdesi, 2.5, 'R24.2 execution başlangıç SL -%2.50 olmalı');
assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 10, 'R24.2 gerçek slot 10 olmalı');
assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac, 20, 'R24.2 notional 20 USDT olmalı');
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde, 2.5);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde, 1.5);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde, 1.0);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAdimYuzde, 0.5);
assert.ok(version.botSurumu.includes('R24.2-UNIFIED-PERCENT-ECONOMY'));

const motor = fs.readFileSync('./motor.js','utf8');
assert.ok(motor.includes('const etkinStopYuzdesi = Number(ayarlar.sabitStopYuzdesi || 2.5);'), 'motor execution SL global R24.2 riskinden gelmeli');
assert.ok(motor.includes('hazirKimlik.executionInitialStopPct = etkinStopYuzdesi;'), 'execution stop pct kimliğe dondurulmalı');
assert.ok(!motor.includes('const etkinStopYuzdesi = Number(yasamProfili?.stopPct'), 'LAB stopPct execution SL override edemez');
assert.ok(motor.includes('return canliShadowOgrenmeAc({'), 'ana Shadow akışı korunmalı');

const evo = fs.readFileSync('./73_st2_renko_entry_evolution.js','utf8');
assert.ok(evo.includes('pos?.executionInitialStopPct'), 'Entry Evolution audit frozen execution risk kullanmalı');
assert.ok(!evo.includes('stopPct:Math.max(0.01,n(life.stopPct'), 'LAB stopPct frozen execution risk otoritesi olmamalı');
assert.ok(!evo.includes('const stopPct=Math.max(0.01,n(pos?.labLifecycleProfile?.stopPct'), 'LAB stopPct stop audit otoritesi olmamalı');

// LAB profili öğrenme amacıyla korunur; sadece execution SL otoritesi kaldırılır.
assert.ok(motor.includes('hazirKimlik.labLifecycleProfile = yasamProfili;'));

console.log('✅ R24.2 unified execution stop authority passed | Real Premier + main Shadow/Development SL -2.5 | LAB stop replay-only | 10 slot x 20USDT');
