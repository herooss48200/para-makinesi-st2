const assert = require('assert');
const fs = require('fs');

const motor = fs.readFileSync(require.resolve('./motor.js'), 'utf8');
const bot = fs.readFileSync(require.resolve('./bot.js'), 'utf8');
const labLeague = fs.readFileSync(require.resolve('./62_lab_premier_league.js'), 'utf8');

assert.ok(motor.includes('[LAB LİG KAPISI]'), 'LAB Premier sanal öğrenme/üst katman kapısı görünür olmalı');
assert.ok(motor.includes('if (ayarlar.sanalEmirModu)'), 'Sanal/gerçek ayrımı bulunmalı');
assert.ok(motor.indexOf('if (ayarlar.sanalEmirModu)') < motor.indexOf('if (!ortakKarar.allowed'), 'Sanal dal gerçek emir engelinden önce çalışmalı');
assert.ok(!motor.includes('[PROFIT-FIRST ORTAK KAPI]'), 'Eski ortak Profit-First kapısı motor.js içinde kalmamalı');
assert.ok(bot.includes('[DUAL-LAYER RUNTIME ACTIVE]'), 'Başlangıç mimari imzası bulunmalı');

const position = fs.readFileSync(require.resolve('./4_pozisyon.js'), 'utf8');
const virtualOpenBlock = motor.slice(motor.indexOf('sanalPozisyonKaydet:'), motor.indexOf('pozisyonAc:'));
assert.strictEqual((virtualOpenBlock.match(/h\.state\.aktifPozisyonlar\.push\(yeniPozisyon\)/g) || []).length, 1, 'Aynı sanal sinyal yalnız bir aktif pozisyon oluşturmalı');
assert.ok(virtualOpenBlock.includes('labPremier.applyToPosition(yeniPozisyon)'), 'Tek pozisyon LAB lig kararına bağlanmalı');
assert.ok(virtualOpenBlock.includes('labPremier.snapshot(yeniPozisyon)'), 'Tek pozisyon LAB Premier performans kasasına snapshot vermeli');
assert.ok(virtualOpenBlock.includes('analizMerkezi.acilisKaydet(yeniPozisyon)'), 'Tek pozisyon genel öğrenme açılışına yazılmalı');
assert.ok(virtualOpenBlock.includes('dualLayerAudit'), 'Çift katman tek-pozisyon kanıtı pozisyona bağlanmalı');
assert.ok(position.includes('labPremier.close(pos'), 'Kapanış LAB Premier performans kasasına yazılmalı');
assert.ok(position.includes('analizMerkezi.kapanisKaydet(pos'), 'Kapanış genel öğrenme katmanına yazılmalı');
assert.ok(position.indexOf('labPremier.close(pos') < position.indexOf('analizMerkezi.kapanisKaydet(pos') || position.indexOf('labPremier.close(pos') > position.indexOf('analizMerkezi.kapanisKaydet(pos'), 'LAB ve genel öğrenme aynı kapanış akışında bulunmalı');
assert.ok(labLeague.includes('secondOrderCreated: false'), 'LAB Premier ikinci emir üretmediğini kanıtlamalı');
assert.ok(labLeague.includes("familyOrderAuthority: false"), 'Family emir yetkisi kapalı olmalı');
assert.ok(labLeague.includes("labPremierOrderAuthority: true"), 'LAB Premier üst katman yetkisi açık olmalı');

console.log('✅ Dual-layer runtime contract tests passed | LAB Premier authority, one signal, one position, separate learning/accounting');
