'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v541-'));
process.env.AGROS_DATA_DIR = temp;

const ayarlar = require('./ayarlar.js');
const labPremier = require('./62_lab_premier_league.js');
const cert = require('./71_st1_final_certification.js');

function row(id, side, btc, net, pf, exp) {
  const coin = id % 2 ? '0011' : '1010';
  return {
    labDnaId: id, labDnaLabel: `LAB #${id}`, labKey: `YON=${side}|BTC=${btc}|COIN=${coin}|BB=${side === 'LONG' ? 'ORTA_ALT' : 'ORTA_UST'}`,
    side, historical: { total: 10, tp: net > 0 ? 8 : 2, sl: net > 0 ? 2 : 8, be: 0, winRate: net > 0 ? 80 : 20, net, profitFactor: pf, expectancy: exp, grossProfit: Math.max(0, net + 2), grossLoss: net < 0 ? Math.abs(net) + 1 : 1 },
    exit: { ready: true, algorithmId: 'MFE_70', algorithmLabel: 'MFE Koruma %70', samples: 10, net: 2, profitFactor: 2, expectancy: 0.2 }
  };
}

const originalBuild = labPremier.build;
try {
  ayarlar.sanalEmirModu = true;
  const catalogue = { allLabRows: [row(1, 'LONG', '0011', 5, 2, .5), row(2, 'LONG', '1010', -3, .4, -.3), row(3, 'SHORT', '0101', -4, .3, -.4)] };
  labPremier.build = (opts = {}) => originalBuild({ ...opts, catalogue, persist: false, force: true });
  const model = cert.build([]);
  assert.strictEqual(model.version, '5.4.1');
  assert(Array.isArray(model.checks) && model.checks.length === 10);
  assert(model.checks.some(x => x.key === 'bottom'));
  assert(model.checks.some(x => x.key === 'reverse'));
  assert(model.checks.some(x => x.key === 'counterfactual' && x.ok));
  assert(model.checks.some(x => x.key === 'mode' && x.ok));
  const text = cert.telegram(model);
  for (const token of ['ST1 FİNAL BİLİMSEL DENETİM', 'BAĞIMSIZ KASALAR', 'Bottom LONG', 'Bottom SHORT', 'REVERSE ZİNCİRİ', 'KARŞI-OLGUSAL', 'EXIT / STOP / BE KANITI', 'KABUL KONTROLLERİ', 'Trade Engine değişmedi']) assert(text.includes(token), token);
  assert(text.length < 3600, `Telegram certification too long: ${text.length}`);
  const reportSource = fs.readFileSync('2_rapor.js', 'utf8');
  assert(reportSource.includes('st1FinalCertificationRaporuGonderGerekirse'));
  assert(reportSource.includes("require('./71_st1_final_certification.js')"));
  console.log('✅ v5.4.1 ST1 FINAL CERTIFICATION passed | visible independent ledgers + reverse chain + counterfactual + Exit/Stop/BE proof');
} finally {
  labPremier.build = originalBuild;
  fs.rmSync(temp, { recursive: true, force: true });
}
