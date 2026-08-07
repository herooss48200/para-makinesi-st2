
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const ayarlar = require('./ayarlar.js');
const h = require('./1_hafiza.js');
const motor = require('./motor.js');

assert.strictEqual(ayarlar.renkoCikisErkenEkonomiTetikYuzde, 0.25, 'erken ekonomi floor +%0.25 arm olmalı');
assert.strictEqual(ayarlar.renkoCikisErkenEkonomiTabanYuzde, 0.20, 'erken ekonomi floor brüt +%0.20 olmalı');
assert.strictEqual(ayarlar.renkoCikisErkenEkonomiMinimumNetKarYuzde, 0.10, 'erken ekonomi minimum net +%0.10 olmalı');
assert.strictEqual(ayarlar.renkoCikisKarTabaniAktivasyonYuzde, 0.50, 'K1 güçlü taban arm +%0.50 korunmalı');
assert.strictEqual(ayarlar.renkoCikisGuvenliKarTabaniYuzde, 0.40, 'K1 brüt güvenli taban +%0.40 korunmalı');
assert.strictEqual(ayarlar.renkoCikisMinimumNetKarYuzde, 0.30, 'K1 minimum net +%0.30 korunmalı');
assert.strictEqual(ayarlar.renkoGirisModuMinTeyitOrnek, 15, 'CONFIRMED N15 sonrası yarışabilmeli');
assert.strictEqual(ayarlar.renkoGirisModuMinBasariYuzde, 75, 'CONFIRMED başarı-öncelikli policy en az %75 WR istemeli');
assert.strictEqual(ayarlar.renkoGirisModuMinSkorFarki, 0, 'CONFIRMED seçiminde kâr/skor üstünlüğü kapısı kaldırılmış olmalı');

h.state.basamaklar = h.state.basamaklar || {};
h.state.basamaklar.SOLUSDT = { stepSize: 0.01, quantityPrecision: 2 };
const targetQty = 10 / 72.74;
const q = motor.gercekMiktarHedefeEnYakinKlip('SOLUSDT', targetQty);
assert.strictEqual(q, 0.14, 'SOL gerçek boyut aşağı floor yerine hedefe en yakın step 0.14 olmalı');
const dev = Math.abs((q * 72.74 - 10) / 10) * 100;
assert(dev < 2, `SOL notional sapması %2 altında olmalı, gerçek ${dev}`);

const motorSrc = fs.readFileSync(path.join(__dirname, 'motor.js'), 'utf8');
assert(motorSrc.includes('gercekMiktarHedefeEnYakinKlip(symbol, hedefGercekNotional / canliFiyat)'), 'gerçek emir zinciri nearest-step helper kullanmalı');
assert(motorSrc.includes('GERCEK_POZISYON_SLOTU_DOLU'), 'slot fail-closed korunmalı');
assert(motorSrc.includes('GERCEK_BOYUT_FAIL_CLOSED'), 'boyut fail-closed korunmalı');

console.log('✅ v6.13.5-R3 separate early economy floor + success-first CONFIRMED + nearest-step real sizing passed');
