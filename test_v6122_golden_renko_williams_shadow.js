'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tmp = path.join(__dirname, `.tmp-v6122-${process.pid}-${Date.now()}`);
process.env.AGROS_DATA_DIR = tmp;
fs.mkdirSync(tmp, { recursive: true });

const ayarlar = require('./ayarlar.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');
const lab = require('./88_st2_williams_cycle_shadow_lab.js');

assert.strictEqual(Number(ayarlar.renkoGirisVarsayilanTugla), 0.75, 'Öğrenilmemiş pattern varsayılanı 0.75T olmalı');
assert.strictEqual(entryEvolution.DEFAULT_BRICK(), 0.75, 'Entry Evolution varsayılanı 0.75T olmalı');
assert.deepStrictEqual(entryEvolution.CANDIDATES(), [0.25, 0.5, 0.75, 1, 1.25, 1.5]);

// Öğrenilmiş profil seviyesi korunmalı; yeni profil güvenli 0.75T ile başlamalı.
const state = entryEvolution.blank();
state.profiles['LONG|RRRR'] = {
  key: 'LONG|RRRR', yon: 'LONG', patternCode: 'RRRR', patternId: 'L01',
  activeBrick: 0.25, previousBrick: 0.75, closed: 20, lastEvaluationClosed: 20,
  candidates: {}, history: []
};
entryEvolution.write(state);
assert.strictEqual(entryEvolution.activeFor('LONG', 'RRRR'), 0.25, 'Öğrenilmiş 0.25T seviyesi kayboldu');
assert.strictEqual(entryEvolution.activeFor('SHORT', 'GGGG'), 0.75, 'Öğrenilmemiş pattern 0.75T başlamadı');

const cfg = lab.settings();
assert.strictEqual(cfg.topEnter, -10, 'Tepe sınırı -10 olmalı');
assert.strictEqual(cfg.bottomEnter, -90, 'Dip sınırı -90 olmalı');
assert.strictEqual(cfg.active, true);

let s = null;
function step(value, id) {
    const x = lab.advanceState(s, value, id, id, cfg);
    s = x.state;
    return x;
}

step(-5, 1);      // T1
step(-50, 2);     // tepe reset
step(-4, 3);      // T2
step(-50, 4);     // tepe reset
step(-95, 5);     // D1, önce T2; henüz dönüş yok
let snap = lab.snapshotFromState('TESTUSDT', 'LONG', s, -95);
assert.strictEqual(snap.supported, false);
step(-80, 6);     // dipten nötre doğru dönüş
snap = lab.snapshotFromState('TESTUSDT', 'LONG', s, -80);
assert.strictEqual(snap.supported, true);
assert.strictEqual(snap.pattern, 'T2-D1');
assert.strictEqual(snap.turnState, 'VALID_TURN');

step(-50, 7);     // dip reset
step(-98, 8);     // D2; henüz dönüş yok
step(-79, 9);     // ikinci dipten dönüş
snap = lab.snapshotFromState('TESTUSDT', 'LONG', s, -79);
assert.strictEqual(snap.pattern, 'T2-D2');
assert.strictEqual(snap.supported, true);

step(-50, 10);    // çıkış
step(-3, 11);     // T1, önce D2; henüz dönüş yok
step(-20, 12);    // tepeden nötre doğru dönüş
snap = lab.snapshotFromState('TESTUSDT', 'SHORT', s, -20);
assert.strictEqual(snap.supported, true);
assert.strictEqual(snap.pattern, 'D2-T1');
assert.strictEqual(snap.turnState, 'VALID_TURN');

const src72 = fs.readFileSync(path.join(__dirname, '72_st2_renko_entry.js'), 'utf8');
assert(src72.includes("entryTimingAuthority: 'RENKO_EVOLUTION_1M_RENKO_ST'"), 'Golden Renko timing authority eksik');
assert(src72.includes("'RENKO_CLOSED_REVERSAL_PLUS_OFFSET'") && src72.includes("'RENKO_PATTERN_ADAPTIVE_BRICK_DISTANCE'"), 'DIRECT/CONFIRMED canlı tetik modları eksik');
assert(src72.includes('if (!fiyatUygun || !stUygun) return false;'), 'Fiyat + 1m Renko ST ortak kapısı eksik');
assert(src72.includes('entryEvolution.DEFAULT_BRICK()'), 'Giriş dosyası güvenli 0.75T varsayılanını kullanmıyor');
assert(!src72.includes('RENKO_REFERENCE_BREAK_WITH_ST1_GATE'), 'Eski ST1-gated tetik kalmış');
assert(!src72.includes('ESKİ KIRILIM ENGELİ'), 'Yeniden kırılım engeli kalmış');

const settingsText = fs.readFileSync(path.join(__dirname, 'ayarlar.js'), 'utf8');
assert(settingsText.includes('renkoGirisVarsayilanTugla: 0.75'), '0.75T varsayılanı eksik');
assert(settingsText.includes('st2St1GirisKapisiAktif: false'), 'ST1 hard gate kapalı değil');
assert(settingsText.includes('williamsCycleTepeEsigi: -10'), 'Williams tepe sınırı eksik');
assert(settingsText.includes('williamsCycleDipEsigi: -90'), 'Williams dip sınırı eksik');
assert(settingsText.includes('williamsCycleShadowAktif: true'), 'Williams shadow aktif değil');

// Williams kapanışı aynı trade için iki kez sayılmamalı.
const pos = { sym: 'TESTUSDT', yon: 'SHORT', tradeId: 'V6122-DUP', girisAnalizi: { williamsCycleShadow: snap } };
const result = { net: 1, outcome: 'TP', reason: 'TEST', exitPrice: 10, durationMs: 1000 };
assert.strictEqual(lab.close(pos, result).accepted, true);
assert.strictEqual(lab.close(pos, result).reason, 'DUPLICATE_CLOSE');
assert.strictEqual(lab.summary().totals.n, 1);

const version = require('./versiyon.js');
assert.strictEqual(version.botSurumu, '6.13.5-R10-TELEGRAM-LIVE-PANEL-DELIVERY-TRUTH');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('✅ v6.12.2 compatibility: Golden Renko + Entry Evolution + Williams shadow foundation passed');
