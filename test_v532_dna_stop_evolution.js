const assert = require('assert');
const fs = require('fs');
const life = require('./68_lab_lifecycle_evolution.js');
const ayarlar = require('./ayarlar.js');

assert.equal(life.STOP_MIN_SAMPLES(), 5, 'Stop otomatik atama eşiği N=5 olmalı');
assert.deepEqual(life.STOP_CANDIDATES(), [0.8, 1.0, 1.2, 1.5, 1.8, 2.1, 2.4], 'Stop havuzu eksiksiz olmalı');
assert.deepEqual(life.STOP_CATALOG.map(x => x.id), ['STOP_08','STOP_10','STOP_12','STOP_15','STOP_18','STOP_21','STOP_24']);

const profitable = { samples: 5, net: 1.25, grossProfit: 1.25, grossLoss: 0 };
const currentWeak = { samples: 5, net: 0.20, grossProfit: 0.50, grossLoss: 0.30 };
const stopPick = life.champion({ '1.20': profitable, '1.50': currentWeak }, '1.50', life.STOP_MIN_SAMPLES());
assert.equal(stopPick.ready, true, 'N=5 pozitif üstün stop otomatik atamaya hazır olmalı');
assert.equal(stopPick.best.key, '1.20');

const onlyFour = { samples: 4, net: 2, grossProfit: 2, grossLoss: 0 };
assert.equal(life.champion({ '0.80': onlyFour }, '1.50', life.STOP_MIN_SAMPLES()).ready, false, 'N=4 stop atanmamalı');

assert.equal(ayarlar.labStopMinKapanis, 5);
assert.deepEqual(ayarlar.labStopAdaylariYuzde, [0.8,1.0,1.2,1.5,1.8,2.1,2.4]);

const motor = fs.readFileSync('motor.js', 'utf8');
assert(motor.includes('const yasamProfili = labLifecycle.apply(hazirKimlik)'), 'LAB stop profili emir öncesi uygulanmalı');
assert(motor.includes('yasamProfili?.stopPct'), 'Öğrenilmiş stop aktif emre bağlanmalı');

const source = fs.readFileSync('68_lab_lifecycle_evolution.js', 'utf8');
assert(source.includes('s.byLab[lab.key]'), 'Stop öğrenmesi her LAB/DNA kimliği için ayrı tutulmalı');
assert(source.includes('row.stop.history.unshift'), 'Stop değişim geçmişi tutulmalı');
assert(source.includes('result.restartGap===true||pos.restartGap===true'), 'Restart GAP öğrenme dışı kalmalı');

console.log('✅ v5.3.2 DNA Stop Evolution | LAB bazlı N=5 otomatik atama + 7 stop kataloğu geçti');
