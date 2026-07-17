const assert = require('assert');
const fs = require('fs');

const motor = fs.readFileSync(require.resolve('./motor.js'), 'utf8');
const bot = fs.readFileSync(require.resolve('./bot.js'), 'utf8');

assert.ok(motor.includes('[ALT ÖĞRENME KAPISI AÇIK]'), 'Sanal öğrenme kapısı görünür olmalı');
assert.ok(motor.includes('if (ayarlar.sanalEmirModu)'), 'Sanal/gerçek ayrımı bulunmalı');
assert.ok(motor.indexOf('if (ayarlar.sanalEmirModu)') < motor.indexOf('if (!ortakKarar.allowed)'), 'Sanal dal gerçek lig engelinden önce çalışmalı');
assert.ok(!motor.includes('[PROFIT-FIRST ORTAK KAPI]'), 'Eski ortak Profit-First kapısı motor.js içinde kalmamalı');
assert.ok(bot.includes('[DUAL-LAYER RUNTIME ACTIVE]'), 'Başlangıç mimari imzası bulunmalı');

console.log('✅ Dual-layer runtime contract tests passed');
