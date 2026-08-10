'use strict';
const assert = require('assert');
const fs = require('fs');
const version = require('./versiyon.js');

const bot = fs.readFileSync('./bot.js', 'utf8');
const network = fs.readFileSync('./64_binance_network_resilience.js', 'utf8');

assert.strictEqual(version.botSurumu, '6.13.5-R22-15M-CONFIRMED-BOOTSTRAP-LIVE-EVIDENCE-FINAL');
assert(bot.includes("createSt2LivePanelScheduler"), 'ST2 live panel bağımsız scheduler kullanmalı');
assert(bot.includes("ready: () => h.state.startupMarketReady === true"), 'panel Entry Gate READY olmadan başlamamalı');
assert(!bot.includes("h.state.startupMarketReady === true && ilkSt2TaramaTamamlandi === true"), 'panel ilk tam Renko taramasına bağlanmamalı');
assert(!bot.includes("startupPanelPlanla('ILK_ST2_TARAMA', 0)"), 'ilk tarama panel tetikleyicisi kaldırılmalı');

// R12, R11 runtime/panel scheduling düzeltmesini korur; R8 known-good network motoru korunur.
assert(network.includes('function istekYap'), 'known-good network motoru korunmalı');
assert(!network.includes('queueExpiry'), 'R5 queue expiry geri gelmemeli');

console.log('✅ v6.13.5-R17 startup panel guard passed | Gate READY korunur; ilk Renko taraması artık 30s panel cadence\'ini bloke etmez');
