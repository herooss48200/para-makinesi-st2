const assert = require('assert');
const fs = require('fs');
const life = require('./68_lab_lifecycle_evolution.js');
const ayarlar = require('./ayarlar.js');

assert.equal(life.BE_MIN_SAMPLES(), 5, 'BE+ otomatik atama eşiği N=5 olmalı');
assert.deepEqual(life.BE_CANDIDATES(), [0.08,0.12,0.16,0.20,0.25,0.30], 'BE+ kâr havuzu eksiksiz olmalı');

const current = { samples:5, net:0.20, grossProfit:0.50, grossLoss:0.30 };
const profitable = { samples:5, net:0.90, grossProfit:1.00, grossLoss:0.10 };
const pick = life.champion({ '0.12':current, '0.20':profitable }, '0.12', life.BE_MIN_SAMPLES());
assert.equal(pick.ready, true, 'N=5 net/PF/Exp üstün BE+ otomatik atamaya hazır olmalı');
assert.equal(pick.best.key, '0.20');
assert(pick.best.pf > 1 && pick.best.expectancy > 0 && pick.best.net > 0, 'BE+ pozitif ekonomi üretmeli');

const four = { samples:4, net:1, grossProfit:1, grossLoss:0 };
assert.equal(life.champion({ '0.20':four }, '0.12', life.BE_MIN_SAMPLES()).ready, false, 'N=4 BE+ atanmamalı');

// Komisyon sonrası sonuç pozitif değilse champion olamaz.
const commissionLoss = { samples:5, net:-0.01, grossProfit:0.20, grossLoss:0.21 };
assert.equal(life.champion({ '0.08':commissionLoss }, '0.12', life.BE_MIN_SAMPLES()).ready, false, 'Komisyon sonrası zarar eden BE+ seçilmemeli');

assert.equal(ayarlar.labBeMinKapanis, 5);
assert.deepEqual(ayarlar.labBeAdaylariYuzde, [0.08,0.12,0.16,0.20,0.25,0.30]);

const source = fs.readFileSync('68_lab_lifecycle_evolution.js','utf8');
assert(source.includes('row.be.history.unshift'), 'BE+ değişim geçmişi tutulmalı');
assert(source.includes('pnlUsdt(pos,simulateBe'), 'BE+ karşılaştırması komisyon sonrası USDT netiyle yapılmalı');
assert(source.includes("x.net>0&&x.pf>1&&x.expectancy>0"), 'BE+ pozitif Net/PF/Expectancy kapısından geçmeli');

console.log('✅ v5.3.3 Profitable BE Evolution | LAB bazlı N=5 + 6 seviyeli BE+ havuzu + komisyon sonrası pozitif ekonomi geçti');
