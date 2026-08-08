'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const lab = require('./88_st2_williams_cycle_shadow_lab.js');

function bricksFor(seed = 0) {
  const base = 100 + seed * 0.001;
  const rows = [];
  for (let i = 0; i < 18; i++) {
    const open = base + i * 0.1;
    const close = open + (i % 3 === 0 ? -0.06 : 0.08);
    rows.push({
      id: i + 1,
      open,
      high: Math.max(open, close) + 0.05,
      low: Math.min(open, close) - 0.05,
      close,
      closeTime: 1_700_000_000_000 + i * 60_000
    });
  }
  return rows;
}

(async () => {
  lab._resetForTest();

  const realWrite = fs.writeFileSync;
  const realRename = fs.renameSync;
  let writes = 0;
  let renames = 0;
  fs.writeFileSync = function(...args) { writes++; return undefined; };
  fs.renameSync = function(...args) { renames++; return undefined; };

  try {
    for (let i = 0; i < 200; i++) {
      const result = lab.update(`TEST${i}USDT`, bricksFor(i), { persist: false });
      assert(result, `symbol ${i} should update in memory`);
    }

    assert.strictEqual(writes, 0, '200-symbol Renko scan must not synchronously write Williams state per symbol');
    assert.strictEqual(renames, 0, '200-symbol Renko scan must not synchronously rename Williams state per symbol');

    assert.strictEqual(lab.flush(), true, 'dirty Williams state should flush once after scan');
    assert.strictEqual(writes, 1, 'batched Williams state must perform one state write');
    assert.strictEqual(renames, 1, 'batched Williams state must perform one atomic rename');
    assert.strictEqual(lab.flush(), false, 'second flush without changes must be a no-op');
    assert.strictEqual(writes, 1, 'no duplicate Williams write after clean flush');

    const entrySource = fs.readFileSync(path.join(__dirname, '72_st2_renko_entry.js'), 'utf8');
    assert(entrySource.includes("williamsCycleShadow.update(sym, bricks, { persist: false })"), 'Renko scan must use in-memory Williams update');
    assert(entrySource.includes('williamsCycleShadow.scheduleFlush()'), 'Renko scan must schedule one post-audit Williams flush');

    const auditPos = entrySource.indexOf('auditLogla(audit);');
    const flushPos = entrySource.indexOf('williamsCycleShadow.scheduleFlush()', auditPos);
    const summaryBgPos = entrySource.indexOf('setImmediate(async () => {', flushPos);
    const summaryTelegramPos = entrySource.indexOf('await h.telegramMesajGonderTekil(mesaj', summaryBgPos);
    const returnPos = entrySource.indexOf('return audit;', summaryBgPos);
    assert(auditPos >= 0 && flushPos > auditPos, 'audit must be emitted before background Williams persistence');
    assert(summaryBgPos > flushPos && summaryTelegramPos > summaryBgPos, 'startup pusu Telegram must run inside background task');
    assert(returnPos > summaryBgPos, 'Renko scan must retain a direct return path after scheduling Telegram');

    console.log('✅ v6.13.5-R16 scan I/O liveness passed | 200 Williams updates = 0 per-symbol writes + 1 batched flush; startup pusu Telegram is background-only');
  } finally {
    fs.writeFileSync = realWrite;
    fs.renameSync = realRename;
    lab._resetForTest();
  }
})().catch(err => {
  console.error(err.stack || err);
  process.exit(1);
});
