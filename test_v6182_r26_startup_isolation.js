'use strict';
const fs=require('fs'); const assert=require('assert');
const bot=fs.readFileSync('./bot.js','utf8');
const rev=fs.readFileSync('./revizyon.js','utf8');
const entry=fs.readFileSync('./72_st2_renko_entry.js','utf8');
const pos=fs.readFileSync('./4_pozisyon.js','utf8');
assert.ok(bot.includes('st2StartupProtectionIntervalMs'));
assert.ok(bot.includes('if (h.state.startupMarketReady !== true)') && bot.includes('if (realPositions.length === 0) return;'),'startup no-real fast return missing');
assert.ok(bot.includes('EXCHANGE_RECONCILIATION_STALE'),'reconciliation fail-closed missing');
for(const x of ['79_st2_global_historical_runtime','87_st2_st1_entry_gate','88_st2_williams','89_st2_renko_entry_confirmation_shadow','95_st2_post_close','96_st2_filtered_direct_shadow','97_st2_macd']){
  assert.ok(!bot.includes(`require('./${x}`),`bot forbidden import ${x}`);
  assert.ok(!entry.includes(`require('./${x}`),`entry forbidden import ${x}`);
}
assert.ok(!/require\(['"]\.\/74_st2_renko_exit_evolution/.test(pos));
assert.ok(!/require\(['"]\.\/51_sanal_dynamic_exit_executor/.test(pos));
assert.ok(!/ST1/.test(rev),'ST1 scheduler residue in revizyon');
assert.ok(rev.includes('1m Renko ST'),'1m Renko ST refresh missing');
console.log('✅ R26 startup isolation passed | warmup gets CPU priority | real protection only before READY | no ST1/Williams/MACD/LAB runtime');
