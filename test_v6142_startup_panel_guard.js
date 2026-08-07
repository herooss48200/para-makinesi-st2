'use strict';
const assert = require('assert');
const fs = require('fs');
const version = require('./versiyon.js');

const bot = fs.readFileSync('./bot.js', 'utf8');
const network = fs.readFileSync('./64_binance_network_resilience.js', 'utf8');

assert.strictEqual(version.botSurumu, '6.13.5-R9-STARTUP-PANEL-GUARD');

assert(bot.includes("const canliRaporStartupIzinli = ayarlar.entryStrategyMode !== 'ST2_RENKO'"),
  'ST2 startup canlı rapor guard tanımlı olmalı');
assert(bot.includes("h.state.startupMarketReady === true && ilkSt2TaramaTamamlandi === true"),
  'periyodik canlı panel hem gate READY hem ilk Renko taraması tamamlanmadan çalışmamalı');
assert(bot.includes("if (ayarlar.canliRaporAktif && canliRaporStartupIzinli && now - sonCanliRapor"),
  'canlı rapor koşulu startup guard ile kapatılmalı');
assert(bot.includes("if (String(ayarlar.entryStrategyMode || '') === 'ST2_RENKO') sonCanliRapor = Date.now();"),
  'startup panel planlanınca aynı turdaki periyodik tekrar bastırılmalı');
assert(bot.includes("startupPanelPlanla('ILK_ST2_TARAMA', 0)"),
  'ilk ST2 taraması sonrası startup paneli korunmalı');

// R9 yalnız panel/startup guard düzeltmesidir; R8 network motoru değiştirilmemeli.
assert(network.includes('function istekYap'), 'known-good network motoru korunmalı');
assert(!network.includes('queueExpiry'), 'R5 queue expiry geri gelmemeli');

console.log('✅ v6.13.5-R9 startup panel guard passed | no heavy live panel before READY+first Renko scan; R8 network preserved');
