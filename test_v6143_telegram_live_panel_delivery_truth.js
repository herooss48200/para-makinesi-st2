'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

const src = fs.readFileSync('1_hafiza.js', 'utf8');
const bot = fs.readFileSync('bot.js', 'utf8');
const settings = fs.readFileSync('ayarlar.js', 'utf8');
const version = fs.readFileSync('versiyon.js', 'utf8');

assert(settings.includes('canliRaporGuncellemeMs: 30000'), '30 sn canlı panel sözleşmesi korunmalı');
assert(bot.includes("h.state.startupMarketReady === true && ilkSt2TaramaTamamlandi === true"), 'R9 startup panel guard korunmalı');
assert(src.includes('canliRaporSonMetinleri: {}'), 'chat-bazlı başarılı panel metni hafızası eksik');
assert(src.includes('idempotent: true'), 'editMessageText idempotent retry işareti eksik');
assert(src.includes("if (sonEditSonucu?.ok)"), 'panel edit başarısı doğrulanmalı');
assert(src.includes('Coalesced iş teslim kanıtı değildir'), 'coalesced teslim başarı sayılmamalı');
assert(src.includes('CANLI_RAPOR_TESLIM_EDILEMEDI'), 'sessiz panel teslim kaybı görünür olmalı');
assert(!/state\.sonCanliRaporMetni = guvenliMesaj;\s*\n}\s*\n\s*async function binanceTimeSync/.test(src), 'başarısız teslim sonunda son panel metni ilerletilmemeli');
assert(version.includes('6.13.5-R10-TELEGRAM-LIVE-PANEL-DELIVERY-TRUTH'), 'R10 sürüm etiketi eksik');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  delete require.cache[require.resolve('./1_hafiza.js')];
  const h = require('./1_hafiza.js');
  const t = h._test;
  assert.strictEqual(t.telegramIdempotentIstekMi('editMessageText', {}), true, 'edit idempotent olmalı');
  assert.strictEqual(t.telegramIdempotentIstekMi('sendMessage', {}), false, 'sendMessage idempotent sayılmamalı');
  const editNoChange = t.telegramIdempotentSonucNormalize({ ok: false, description: 'Bad Request: message is not modified' }, 'editMessageText', { idempotent: true });
  assert.strictEqual(editNoChange.ok, true, 'message is not modified güvenli edit teslim kanıtı sayılmalı');
  const sendNoChange = t.telegramIdempotentSonucNormalize({ ok: false, description: 'Bad Request: message is not modified' }, 'sendMessage', {});
  assert.strictEqual(sendNoChange.ok, false, 'sendMessage hata sonucu başarıya çevrilmemeli');
} finally {
  Module._load = originalLoad;
}

console.log('✅ v6.13.5-R10 Telegram live panel delivery truth passed | 30s scheduler+R9 guard preserved; idempotent edit retry + delivered-only state');
