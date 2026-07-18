const assert = require('assert');
const fs = require('fs');

const motor = fs.readFileSync(require.resolve('./motor.js'), 'utf8');
const bot = fs.readFileSync(require.resolve('./bot.js'), 'utf8');

assert.ok(motor.includes('[ALT ÖĞRENME KAPISI AÇIK]'), 'Sanal öğrenme kapısı görünür olmalı');
assert.ok(motor.includes('if (ayarlar.sanalEmirModu)'), 'Sanal/gerçek ayrımı bulunmalı');
assert.ok(motor.indexOf('if (ayarlar.sanalEmirModu)') < motor.indexOf('if (!ortakKarar.allowed)'), 'Sanal dal gerçek lig engelinden önce çalışmalı');
assert.ok(!motor.includes('[PROFIT-FIRST ORTAK KAPI]'), 'Eski ortak Profit-First kapısı motor.js içinde kalmamalı');
assert.ok(bot.includes('[DUAL-LAYER RUNTIME ACTIVE]'), 'Başlangıç mimari imzası bulunmalı');

const position = fs.readFileSync(require.resolve('./4_pozisyon.js'), 'utf8');
const observation = fs.readFileSync(require.resolve('./48_premier_observation_engine.js'), 'utf8');

const virtualOpenBlock = motor.slice(motor.indexOf('sanalPozisyonKaydet:'), motor.indexOf('pozisyonAc:'));
assert.strictEqual((virtualOpenBlock.match(/h\.state\.aktifPozisyonlar\.push\(yeniPozisyon\)/g) || []).length, 1, 'Aynı sanal sinyal yalnız bir aktif pozisyon oluşturmalı');
assert.ok(virtualOpenBlock.includes('premierObservation.snapshot(yeniPozisyon)'), 'Tek pozisyon lig performans katmanına snapshot vermeli');
assert.ok(virtualOpenBlock.includes('analizMerkezi.acilisKaydet(yeniPozisyon)'), 'Tek pozisyon genel öğrenme açılışına yazılmalı');
assert.ok(virtualOpenBlock.includes('dualLayerAudit'), 'Çift katman tek-pozisyon kanıtı pozisyona bağlanmalı');
assert.ok(position.includes('premierObservation.close(pos'), 'Kapanış lig performans kasasına yazılmalı');
assert.ok(position.includes('analizMerkezi.kapanisKaydet(pos'), 'Kapanış genel öğrenme katmanına yazılmalı');
assert.ok(position.indexOf('premierObservation.close(pos') < position.indexOf('analizMerkezi.kapanisKaydet(pos'), 'İki kayıt aynı kapanış akışında bulunmalı');
assert.ok(observation.includes('dualLayerAudit'), 'Lig trade kaydı çift katman kanıtını saklamalı');

console.log('✅ Dual-layer runtime contract tests passed');
