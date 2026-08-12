'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

const src = fs.readFileSync('1_hafiza.js', 'utf8');
const report = fs.readFileSync('2_rapor.js', 'utf8');
const bot = fs.readFileSync('bot.js', 'utf8');
const settings = fs.readFileSync('ayarlar.js', 'utf8');
const version = fs.readFileSync('versiyon.js', 'utf8');

assert(settings.includes('canliRaporGuncellemeMs: 30000'), '30 sn canlı panel sözleşmesi korunmalı');
assert(settings.includes('telegramCanliPanelTimeoutMs: 6000'), 'panel teslim süresi bounded olmalı');
assert(bot.includes('createSt2LivePanelScheduler'), 'ST2 panel ağır ana döngüden bağımsız olmalı');
assert(src.includes('canliRaporSonMetinleri: {}'), 'chat-bazlı başarılı panel metni hafızası eksik');
assert(src.includes('idempotent: true'), 'editMessageText idempotent işareti eksik');
assert(src.includes("retryCount: 0, timeoutMs: panelTimeoutMs"), 'live panel edit kendi uzun retry döngüsünü açmamalı');
assert(src.includes('CANLI_PANEL_EDIT_RETRY_NEXT_TICK'), 'transient edit hatası yeni sendMessage yerine sonraki tickte denenmeli');
assert(src.includes('telegramCanliPanelBekleyen'), 'latest-only canlı panel worker eksik');
assert(src.includes("priority: 'detail', retryCount: 0, timeoutMs: panelTimeoutMs"), 'eski panel silme işi canlı panel workerını bekletmemeli');
assert(src.includes("ambiguousDelivery: res.statusCode >= 200 && res.statusCode < 300"), '2xx invalid JSON belirsiz teslim sayılmalı');
assert(!report.includes('await h.telegramCanliRaporGuncelle'), 'rapor mutex Telegram ağ teslimini beklememeli');
assert(version.includes('6.13.5-R23.1-CONFIRMED-FROZEN-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL'), 'R11 sürüm etiketi eksik');

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
  assert.strictEqual(t.telegramEditYeniMesajGerektirir({ description: 'Bad Request: message to edit not found' }), true, 'silinmiş panelde yeni mesaj açılmalı');
  assert.strictEqual(t.telegramEditYeniMesajGerektirir({ description: 'TELEGRAM_TIMEOUT:3500ms', transient: true }), false, 'timeout yeni panel balonu üretmemeli');
} finally {
  Module._load = originalLoad;
}

console.log('✅ v6.13.5-R17 Telegram delivery truth passed | bounded edit + latest-only worker + no transient send storm');
