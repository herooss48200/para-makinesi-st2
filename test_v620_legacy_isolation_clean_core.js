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
assert.strictEqual(typeof version === 'string' ? version : version.botSurumu,'6.3.0-LIVE-UNIVERSE-ENTRY-FUNNEL-EXPLAINABILITY');
console.log('✅ v6.2.0 legacy isolation compatibility passed under v6.3.0');
