'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');

  const start = src.indexOf('function renkoEntryConfirmationShadowTelegramArkaPlan');
  const end = src.indexOf('\nasync function izSurmeyiGuncelle()', start);
  assert(start >= 0 && end > start, 'nonblocking shadow Telegram helper must exist');
  const helperSrc = src.slice(start, end);

  let calls = 0;
  const h = {
    telegramMesajGonder: () => {
      calls++;
      return new Promise(() => {}); // never resolves: must not block caller
    }
  };
  const console = { log() {} };
  const setImmediateRef = setImmediate;
  const factory = new Function('h', 'console', 'setImmediate', 'Promise', `${helperSrc}; return renkoEntryConfirmationShadowTelegramArkaPlan;`);
  const helper = factory(h, console, setImmediateRef, Promise);

  const messages = Array.from({ length: 200 }, (_, i) => `shadow-${i}`);
  const t0 = Date.now();
  helper(messages);
  const elapsed = Date.now() - t0;
  assert(elapsed < 50, `shadow Telegram enqueue must return immediately, got ${elapsed}ms`);

  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(calls, 200, 'all shadow messages should still be handed to Telegram asynchronously');

  const protectionStart = src.indexOf('async function izSurmeyiGuncelle()');
  const zeroPositionReturn = src.indexOf('if (h.state.aktifPozisyonlar.length === 0) return;', protectionStart);
  assert(protectionStart >= 0 && zeroPositionReturn > protectionStart, 'zero-position fast return must exist');
  const preReturn = src.slice(protectionStart, zeroPositionReturn);
  assert(!preReturn.includes('await h.telegramMesajGonder'), 'shadow Telegram must not be awaited before zero-position return');
  assert(preReturn.includes('renkoEntryConfirmationShadowTelegramArkaPlan'), 'tickAll messages must use nonblocking helper');

  const emittedStart = src.indexOf('const entryConfirmationTick = renkoEntryConfirmationShadow.update');
  const emittedEnd = src.indexOf('renkoExitEvolution.assign(pos);', emittedStart);
  assert(emittedStart >= 0 && emittedEnd > emittedStart, 'active-position shadow emission block must exist');
  const emittedBlock = src.slice(emittedStart, emittedEnd);
  assert(!emittedBlock.includes('await h.telegramMesajGonder'), 'active-position shadow lifecycle Telegram must not block protection');
  assert(emittedBlock.includes('renkoEntryConfirmationShadowTelegramArkaPlan'), 'active-position shadow messages must use background helper');

  console.log = global.console.log;
  global.console.log('✅ v6.13.5-R16 shadow Telegram nonblocking protection passed | 200 never-resolving shadow sends do not block zero-position scan path or active protection');
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
