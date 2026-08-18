'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const cp = require('child_process');
const ROOT = __dirname;

for (const f of ['2_rapor.js','95_st2_renko_scoreboard.js','versiyon.js']) {
  cp.execFileSync(process.execPath, ['--check', path.join(ROOT,f)], {stdio:'pipe'});
}
const reportSrc = fs.readFileSync(path.join(ROOT,'2_rapor.js'),'utf8');
assert.ok(reportSrc.includes('RENKO Sayaç (YARIŞTAN BERİ)'));
assert.ok(reportSrc.includes("require('./95_st2_renko_scoreboard.js')"));
const helperSrc = fs.readFileSync(path.join(ROOT,'95_st2_renko_scoreboard.js'),'utf8');
for (const forbidden of ['futuresOrder(','futuresCreateAlgoOrder(','futuresCancelOrder(','futuresCancelAlgoOrder(','writeState(']) {
  assert.ok(!helperSrc.includes(forbidden), `scoreboard helper must stay read-only: ${forbidden}`);
}

const execPath = require.resolve('./85_st2_real_order_execution.js');
const records = {
  HYPE: {strategyLane:'RENKO', openedAt:'2026-08-18T05:00:00.000Z', closedAt:'2026-08-18T16:40:00.000Z', status:'CLOSED', netPnl:0.183698, totalCommission:0.0097},
  EUL:  {strategyLane:'RENKO', openedAt:'2026-08-18T16:35:00.000Z', status:'OPEN'},
  SKY:  {strategyLane:'RENKO', openedAt:'2026-08-18T11:00:00.000Z', status:'OPEN'},
  HA:   {strategyLane:'HEIKIN_ASHI', openedAt:'2026-08-18T05:00:00.000Z', closedAt:'2026-08-18T16:41:00.000Z', status:'CLOSED', netPnl:5, totalCommission:1},
  FAIL: {strategyLane:'RENKO', createdAt:'2026-08-18T16:42:00.000Z', status:'FAILED'}
};
require.cache[execPath] = {id:execPath, filename:execPath, loaded:true, exports:{
  readState:()=>({records}),
  isRenkoRecord:r=>String(r?.strategyLane||'').toUpperCase() !== 'HEIKIN_ASHI'
}};
const helperPath = require.resolve('./95_st2_renko_scoreboard.js');
delete require.cache[helperPath];
const helper = require('./95_st2_renko_scoreboard.js');
const s = helper.currentScoreboard();
assert.equal(s.opened,14);
assert.equal(s.closed,10);
assert.equal(s.wins,9);
assert.equal(s.losses,1);
assert.equal(s.be,0);
assert.equal(s.wr,90);
assert.equal(s.netPnl,1.510898);
assert.equal(s.commission,0.0987);
assert.equal(s.postBaselineOpened,2);
assert.equal(s.postBaselineClosed,1);

const v = require('./versiyon');
assert.equal(v.botSurumu,'6.18.1-R30.1-RENKO-RACE-COUNTER-20SLOT-20USDT');
const a = require('./ayarlar');
assert.equal(a.entryStrategyMode,'ST2_RENKO');
assert.equal(a.gercekEmirMaxAktifPozisyon,20);
assert.equal(a.renkoGercekMaxAktifPozisyon,20);

console.log('✅ R30.1 RENKO race counter passed | authoritative 12/9 8-1 + post-baseline verified events | reporting-only');
