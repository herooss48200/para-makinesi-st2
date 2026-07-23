'use strict';
const assert = require('assert');
const dashboard = require('./69_operation_intelligence_dashboard.js');
const version = require('./versiyon.js');
const deploy = require('./70_deployment_fingerprint.js');

const fake = {
  model: {
    aggregate: { net: 1.25, profitFactor: 1.4, expectancy: 0.1, closed: 12 },
    trackMetrics: { reverse: { opened: 3, active: 1, closed: 2, tp: 1, sl: 1, be: 0, net: 0.2, profitFactor: 1.1, expectancy: 0.1 } },
    league: { historicalPositiveCount: 40, reversePremierCount: 20, labLeagueCount: 745, nearProfitCount: 13 },
    accounting: { activeScientific: 0, activeGap: 64, reconciled: true }
  },
  premier: [], candidates: [],
  changes: { strengthening: 0, weakening: 0, exitChanges: 0, stopReady: 0, beReady: 0, reverseCandidates: 0 }
};
const text = dashboard.telegram([], fake);
assert(text.includes(`AGROS OPERASYON MERKEZİ — ${version.botSurumu}`));
assert(text.includes('PREMIER KARAR VE FORM ÖZETİ'));
assert(text.includes('NEGATIVE LEAGUE SONUÇ DEFTERİ'));
assert(text.includes('BUGÜN DEĞİŞENLER / ÖĞRENME'));
assert(text.includes('AGROS YORUMU'));
assert(text.includes('Trade Engine'));
const check = deploy.inspect(__dirname);
assert.strictEqual(check.ok, true, check.errors.join('; '));
console.log('✅ v5.4.2 Telegram Operations Center + deployment guard tests passed');
