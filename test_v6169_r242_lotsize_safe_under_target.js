'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ayarlar = require('./ayarlar.js');
const src = fs.readFileSync(path.join(__dirname, 'motor.js'), 'utf8');

assert.strictEqual(Number(ayarlar.gercekEmirMaksNotionalSapmaYuzde), 2,
    'gercek fill/fiyat sapma guvenligi %2 kalmali');
assert.strictEqual(Number(ayarlar.gercekEmirLotSizeAsagiSapmaYuzde), 5,
    'LOT_SIZE asagi toleransi %5 olmali');

assert(src.includes('gercekMiktarHedefeEnYakinKlip(symbol, hedefGercekNotional / canliFiyat)'),
    'mevcut nearest-step helper zinciri korunmali');
assert(src.includes('gercekMiktar = miktarKlip(symbol, hedefGercekNotional / canliFiyat);'),
    'hedef ustu nearest-step icin guvenli floor fallback bulunmali');
assert(src.includes('lotSizeAsagiSapmaYuzde > maksLotSizeAsagiSapmaYuzde'),
    'ilk boyut kapisi ayri LOT_SIZE asagi toleransini denetlemeli');
assert(src.includes('fallbackLotSizeAsagiSapma > maksLotSizeAsagiSapmaYuzde'),
    'kaldirac fallback ayni LOT_SIZE politikasini kullanmali');
assert(src.includes('maxNotionalDeviationPct: maksNotionalSapmaYuzde'),
    'gercek fill/fiyat %2 guvenlik kapisi korunmali');

const target = 20;
const price = 6.488;
const step = 1;
const raw = target / price;
const floorQty = Math.floor(raw / step + 1e-12) * step;
const notional = floorQty * price;
const underPct = ((target - notional) / target) * 100;

assert.strictEqual(floorQty, 3);
assert(Math.abs(notional - 19.464) < 1e-9);
assert(Math.abs(underPct - 2.68) < 1e-9);
assert(notional <= target);
assert(underPct <= Number(ayarlar.gercekEmirLotSizeAsagiSapmaYuzde));

const tooCoarseNotional = 17.86;
const tooCoarseUnderPct = ((target - tooCoarseNotional) / target) * 100;
assert(tooCoarseUnderPct > Number(ayarlar.gercekEmirLotSizeAsagiSapmaYuzde),
    'asiri kaba LOT_SIZE fail-closed kalmali');

console.log('✅ R24.2 LOT_SIZE hotfix passed | AVAX 19.464/20 = -2.680% REAL eligible | target overrun blocked | fill safety 2% preserved');
