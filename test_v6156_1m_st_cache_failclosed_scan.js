'use strict';
const fs = require('fs');
const assert = require('assert');
const ent = fs.readFileSync(require.resolve('./72_st2_renko_entry.js'), 'utf8');
const rev = fs.readFileSync(require.resolve('./revizyon.js'), 'utf8');

assert(ent.includes("reason: pre ? 'RENKO_1M_CACHE_STALE' : 'RENKO_1M_CACHE_YOK'"), 'scan cache miss/stale reason görünür olmalı');
assert(ent.includes('scanFailClosed: true'), 'cache yoksa yalnız sembol fail-closed kalmalı');
assert(!/const bricks = core\.renkoUret\(mumlar, box\)/.test(ent), '200-sembol scan içinde 1m Renko yeniden hesaplanmamalı');
assert(rev.includes('START_RENKO_ST_REPAIR_1') && rev.includes('START_RENKO_ST_REPAIR_2'), '1m Renko-ST ağır hesaplama warmup/refresh otoritesinde 80->240->480 kalmalı');
assert(ent.includes('[ST2 RENKO SLOW SYMBOL]'), 'kalan yavaş sembol/stage görünür olmalı');
console.log('✅ v6.13.5-R17 1m ST scan cache fail-closed passed | scan recompute YOK + slow-stage observability');
