'use strict';
const fs = require('fs');
const assert = require('assert');
const settings = fs.readFileSync('./ayarlar.js','utf8');
const bot = fs.readFileSync('./bot.js','utf8');
const report = fs.readFileSync('./2_rapor.js','utf8');
const dashboard = fs.readFileSync('./69_operation_intelligence_dashboard.js','utf8');
const version = fs.readFileSync('./versiyon.js','utf8');
assert(settings.includes('canliRaporGuncellemeMs: 30000'), 'Canlı Telegram paneli 30 saniye olmalı');
assert(bot.includes('rapor.raporTalepEt(false)'), '30 saniyelik panel merkezi rapor kuyruğunu kullanmalı');
assert(report.includes('telegramCanliRaporGuncelle(mesaj, oneCikar)'), 'Canlı panel Telegram mesajını düzenlemeli/güncellemeli');
assert(settings.includes('st2DetayRaporMinAralikMs: 600000'), 'Ağır detay raporları 10 dakika seyrek kalmalı');
assert(report.includes('heapPressureHigh()') && report.includes('[DETAY RAPOR BASKI KORUMASI]'), 'Ağır detay heap koruması korunmalı');
assert(dashboard.includes('Bilimsel Premier aktif'), 'Üst rapor aktif bilimsel defteri açık isimlendirmeli');
assert(!dashboard.includes('📦 Canlı Premier ${livePremier}'), 'Yanıltıcı Canlı Premier başlığı kaldırılmalı');
assert(version.includes('6.6.2-30S-LIVE-TELEGRAM-PANEL-REPORT-TRUTH'), 'v6.6.2 runtime kimliği görünmeli');

assert(dashboard.includes('👻 Shadow sonuçları:'), 'Shadow result line must be visible');
assert(dashboard.includes("globalReconciliation.summary().actual"), 'Shadow result must use canonical scientific ledger economy');

console.log('✅ v6.6.2 30s live Telegram panel + report truth passed');
