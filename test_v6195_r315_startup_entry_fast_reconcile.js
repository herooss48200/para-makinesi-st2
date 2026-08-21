'use strict';
const assert = require('assert');
const fs = require('fs');
const versiyon = require('./versiyon.js');

assert(String(versiyon.botSurumu).includes('R31.5'), 'R31.5 version expected');
const bot = fs.readFileSync('./bot.js', 'utf8');
const market = fs.readFileSync('./3_piyasa.js', 'utf8');
const exec = fs.readFileSync('./85_st2_real_order_execution.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

assert(bot.includes("piyasa.acikPozisyonlariGirisIcinDevral()"), 'post-warmup startup must use fast entry reconcile');
assert(!bot.includes(".then(() => piyasa.acikPozisyonlariBorsadanDevral())"), 'heavy historical startup reconcile must not gate post-warmup REAL entry');
assert(market.includes('async function acikPozisyonlariGirisIcinDevral()'), 'market fast startup wrapper missing');
assert(market.includes('startupEntryReconcile(h.client)'), 'market wrapper must call startupEntryReconcile');
assert(exec.includes('async function startupEntryReconcile(client = h.client)'), 'fast startup reconciliation missing');
assert(exec.includes('const firstRows = await allPositions(client);'), 'first positionRisk authority missing');
assert(exec.includes('const verifyRows = await allPositions(client);'), 'second pre-unblock positionRisk verification missing');
assert(exec.includes('STARTUP_UNTRACKED_POSITION_AFTER_SNAPSHOT'), 'unknown mid-startup position must hard fail-closed');
assert(exec.includes('STARTUP_POSITION_SIDE_CHANGED_AFTER_SNAPSHOT'), 'mid-startup side change must hard fail-closed');
assert(exec.includes("status: 'CLOSE_ACCOUNTING_PENDING'"), 'closed historical records must move to accounting queue');
assert(exec.includes('async function finalizePendingStartupClosures'), 'background pending close accounting worker missing');
assert(exec.includes('nonBlockingAccounting'), 'pending close fill accounting must not globally block by itself');
assert(bot.includes('finalizePendingStartupClosures(h.client, { limit: 2 })'), 'background reconcile must drain pending close accounting in bounded batches');
assert(pkg.scripts.check.startsWith('node test_v6195_r315_startup_entry_fast_reconcile.js'), 'R31.5 regression must lead npm test');

console.log('✅ R31.5 startup entry fast reconcile passed | 2x positionRisk safety | orphan cleanup before READY | historical close accounting async | unknown/side-change hard fail-closed');
