'use strict';
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
const labPremier = require('./62_lab_premier_league.js');

function row(id, side, net) {
  const total = 5 + (id % 4);
  return {
    labDnaId: id,
    labDnaLabel: `LAB #${id}`,
    labKey: `YON=${side}|BTC=${(id % 16).toString(2).padStart(4, '0')}|COIN=0011|BB=ORTA`,
    historical: {
      total, tp: 1, sl: total - 1, be: 0,
      winRate: 100 / total,
      net, profitFactor: 0.25, expectancy: net / total
    },
    recent5: {}, exit: null,
    evidence: { entryHistoricalEligible: false },
    forward: { eligible: false, metrics: {} }
  };
}
const rows = [];
for (let i = 1; i <= 12; i++) rows.push(row(i, 'LONG', -i));
for (let i = 1; i <= 12; i++) rows.push(row(100 + i, 'SHORT', -(i + 0.5)));
rows.push({ ...row(999, 'LONG', 2), historical: { total: 8, tp: 6, sl: 2, be: 0, winRate: 75, net: 2, profitFactor: 2, expectancy: 0.25 } });

const model = labPremier.build({ catalogue: { allLabRows: rows }, persist: false });
assert.equal(model.negativeLongCount, 10, 'LONG Negative League tam 10 olmalı');
assert.equal(model.negativeShortCount, 10, 'SHORT Negative League tam 10 olmalı');
assert.equal(model.reversePremierCount, 20, 'Toplam Negative League 20 olmalı');
assert(model.reversePremier.every(x => x.upperLayerIncluded === false), 'Negative League ana/Premier kasasına girmemeli');
assert(model.reversePremier.every(x => x.sizeMultiplier === 0), 'Negative League sermaye katsayısı 0 olmalı');
assert(model.reversePremier.every(x => x.reverseExecution === true), 'Seçilenler ters gölge yürütülmeli');
assert(model.reversePremier.every(x => x.premierTrack === labPremier.TRACK.NEGATIVE));
assert(model.reversePremier.some(x => x.labDnaId === 12), 'En kötü LONG seçilmeli');
assert(!model.reversePremier.some(x => x.labDnaId === 1), 'Daha az kötü LONG ilk 10 dışında kalmalı');
assert(model.reversePremier.some(x => x.labDnaId === 112), 'En kötü SHORT seçilmeli');
assert(!model.reversePremier.some(x => x.labDnaId === 101), 'Daha az kötü SHORT ilk 10 dışında kalmalı');

assert.equal(labPremier.reversePremierCandidate({ closed: 4, net: 2, profitFactor: 2, expectancy: 0.5 }), false);
assert.equal(labPremier.reversePremierCandidate({ closed: 5, net: 2, profitFactor: 2, expectancy: 0.4 }), true);
assert.equal(labPremier.reversePremierCandidate({ closed: 5, net: -1, profitFactor: 0.8, expectancy: -0.2 }), false);

const source = fs.readFileSync(require.resolve('./62_lab_premier_league.js'), 'utf8');
assert(source.includes("labLeague: 'NEGATIVE', upperLayerIncluded: false, virtualShadowOnly: true, sizeMultiplier: 0"));
assert(source.includes("observationPool: decision.premierTrack === TRACK.NEGATIVE ? 'NEGATIVE_REVERSE_SHADOW_LEDGER'"));
assert(source.includes('ana kasaya/Premier kasasına yazılmaz'));

console.log('✅ v5.3.4 Negative League | En kötü 10 LONG + 10 SHORT, ters gölge, kasa dışı, N5 Reverse Premier aday kapısı geçti');
