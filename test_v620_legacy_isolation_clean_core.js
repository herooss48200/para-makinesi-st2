'use strict';
const assert = require('assert');
const fs = require('fs');
const report = fs.readFileSync(require.resolve('./2_rapor.js'),'utf8');
const version = require('./versiyon.js');
const body = report.slice(report.indexOf('async function raporGonder'), report.indexOf('module.exports'));
[
  'learningValidationRaporuGonderGerekirse()',
  'exitEvolutionDashboardGonderGerekirse()',
  'exitVictoryVeDnaKartlariGonderGerekirse()',
  'realOrderPreparationRaporuGonderGerekirse()',
  'labChampionRaporuGonderGerekirse()',
  'labPremierRaporuGonderGerekirse()',
  'st1FinalCertificationRaporuGonderGerekirse()'
].forEach(call => assert(!body.includes('await '+call), `legacy Telegram call active: ${call}`));
assert(body.includes('st2EntryEvolutionDetayiGonderGerekirse'));
assert(body.includes('st2ExitEvolutionDetayiGonderGerekirse'));
assert.strictEqual(version.botSurumu,'6.3.2-EXACT-DNA-PREMIER-SHADOW-RECONCILIATION');
assert.strictEqual(typeof version.kisaOzet,'function');
assert.strictEqual(typeof version.telegramOzet,'function');
console.log('✅ v6.2.0 legacy isolation compatibility passed under v6.3.2');
