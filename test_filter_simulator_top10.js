const assert = require('assert');
const simulator = require('./34_dna_filter_simulator');
const ayarlar = require('./ayarlar');

function makeBucket(i) {
  return {
    toplam: 10 + i,
    tp: 2,
    sl: 8 + i,
    be: 0,
    karToplam: 0.4,
    zararToplam: 1.4 + (i * 0.1),
    net: -1 - (i * 0.1),
    etiket: `DNA_${i}`
  };
}

const stats = {};
for (let i = 1; i <= 12; i += 1) stats[`DNA_${i}`] = makeBucket(i);

const model = simulator.simulate(stats, {
  minSample: 10,
  maxCandidates: 10,
  maxCumulative: ayarlar.dnaFilterSimulatorKumulatifAday,
  maxPf: 0.95,
  maxExpectancy: 0
});

assert.strictEqual(ayarlar.dnaFilterSimulatorKumulatifAday, 10, 'Telegram cumulative filter setting must be 10');
assert.strictEqual(model.cumulative.removedDna, 10, 'Cumulative simulation must remove the first 10 candidates');
const text = simulator.telegramText(model);
assert(text.includes('İlk 10 aday çıkarılırsa'), 'Telegram text must report İlk 10 aday');
assert(text.includes('aktif Dinamik En Kötü 10 gölge kuralı ayrı çalışır'), 'Telegram must distinguish simulation from active shadow rule');

console.log('✅ Filter simulator Top-10 alignment test passed');
