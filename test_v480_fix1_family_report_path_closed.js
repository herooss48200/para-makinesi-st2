'use strict';
const fs = require('fs');
const assert = require('assert');
const report = fs.readFileSync(require.resolve('./2_rapor.js'), 'utf8');
const learningFn = report.slice(
  report.indexOf('async function learningValidationRaporuGonderGerekirse'),
  report.indexOf('async function dnaLeagueRaporuGonderGerekirse')
);
assert(!learningFn.includes('await dnaLeagueRaporuGonderGerekirse('), 'Family League raporu ana zincirden çağrılmamalı');
assert(report.includes('familyLeagueEmirYetkisiAktif === false'), 'Legacy Family fonksiyonları fail-closed kalmalı');
console.log('v4.8.0-fix.1 Family report path closed test passed');
