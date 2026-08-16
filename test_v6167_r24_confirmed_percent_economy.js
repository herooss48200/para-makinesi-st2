'use strict';
const assert = require('assert');
const fs = require('fs');
const ayarlar = require('./ayarlar.js');
const version = require('./versiyon.js');

assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar, 4, 'R25.1 marjin 4 USDT olmali');
assert.strictEqual(ayarlar.mevcutKaldirac, 5, 'R25.1 kaldirac exact 5x olmali');
assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac, 20, 'notional 20 USDT olmali');
assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon, 20, 'gercek slot 20 olmali');
assert.strictEqual(ayarlar.sabitStopYuzdesi, 2.5, 'baslangic SL -%2.5 olmali');
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAktif, true);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde, 1.5);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde, 1.0);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde, 0.5);
assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAdimYuzde, 0.5);
assert.ok(ayarlar.maxTpYuzdesi >= 50, 'failsafe TP erken kapatmamalı');
assert.ok(version.botSurumu.includes('R25.6-STARTUP-QUEUE-BOUND-REPAIR-N5-20SLOT-20USDT'));

const pos = fs.readFileSync('./4_pozisyon.js','utf8');
assert.ok(pos.includes('function yuzdeselEkonomiHesapla'));
assert.ok(pos.includes("const yeniEkonomi = ayarlar.confirmedYuzdeselEkonomiAktif === true;"));
assert.ok(pos.includes("const dynamicKarar = yeniEkonomi ? { active:false, close:false }"));
assert.ok(pos.includes("const realDynamicKarar = yeniEkonomi ? { active:false, close:false }"));
assert.ok(pos.includes("(!yeniEkonomi && ayarlar.renkoCikisEvolutionAktif === true)"));

const report = fs.readFileSync('./2_rapor.js','utf8');
for (const label of ['GERÇEK PREMIER','SHADOW','PREMIER']) assert.ok(report.includes(label), `${label} panelde yok`);
assert.ok(report.includes('liveCohortEconomy.summary()'));
assert.ok(report.includes("require('./96_st2_live_cohort_economy.js')"));
assert.ok(report.includes('AKTİF SHADOW'));
assert.ok(report.includes('%EKONOMİ')); 

// R25 matematik sözleşmesi: +1.50=>+1.00, +2.00=>+1.50, +2.50=>+2.00; 0.50 puan geriden.
function floor(p){
  const a=ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde;
  if(p<a) return null;
  const step=ayarlar.confirmedYuzdeselEkonomiAdimYuzde;
  const stage=Math.floor((p-a+1e-9)/step);
  const stagePeak=a+stage*step;
  return Math.max(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde, stagePeak-ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde);
}
assert.strictEqual(floor(1.49), null);
assert.strictEqual(floor(1.50), 1.0);
assert.strictEqual(floor(1.99), 1.0);
assert.strictEqual(floor(2.00), 1.5);
assert.strictEqual(floor(2.50), 2.0);
assert.strictEqual(floor(5.00), 4.5);

console.log('✅ R25 confirmed percent economy passed | 20 slot x 20USDT | SL -2.5 | +1.5=>+1.0 | 0.5pt trail | Premier/Real/Shadow live panel');

assert(report.includes("liveCohortEconomy.summary()"), 'panel cohort economy RAM cache kullanmali');
assert(!report.slice(report.indexOf('function st2HafifCanliRaporMetniOlustur()'), report.indexOf('function minimalCanliRaporMetniOlustur()')).includes('operationIntelligence.scientificLedgerPartitions('), 'hafif panel ledger taramamali');
