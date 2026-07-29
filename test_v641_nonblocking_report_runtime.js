const fs = require('fs');
const assert = require('assert');

const bot = fs.readFileSync('./bot.js','utf8');
const report = fs.readFileSync('./2_rapor.js','utf8');
const settings = fs.readFileSync('./ayarlar.js','utf8');
const version = fs.readFileSync('./versiyon.js','utf8');

assert(bot.includes('setImmediate(() => {') && bot.includes('PUSU RAPOR ARKA PLAN HATASI'), 'Pusu Telegram işi ana döngüden ayrılmalı');
assert((bot.includes('canliRaporCalisiyor') && bot.includes('CANLI RAPOR ARKA PLAN HATASI')) || bot.includes('rapor.raporTalepEt(false)'), 'Canlı rapor arka plan koruması veya merkezi kuyruk korunmalı');
assert(!bot.includes('await p.pusuRaporuGonder();'), 'Ana döngü Telegram pusu raporunu await etmemeli');
assert(report.includes('[RAPOR COALESCE]'), 'Çakışan raporlar tek güncel istekte birleşmeli');
assert(report.includes('raporTekrarIstegi') && report.includes('raporTekrarOneCikar'), 'Rapor tekrar durumu bulunmalı');
assert(report.includes('st2DetayRaporMinAralikMs') && report.includes('SEYREKLESTIRILDI'), 'Ağır detay raporları seyrekleştirilmeli');
assert(settings.includes('canliRaporGuncellemeMs: 30000') || settings.includes('canliRaporGuncellemeMs: 60000'), 'Canlı panel periyodu 30 veya 60 saniye olmalı');
assert(settings.includes('st2DetayRaporMinAralikMs: 300000') || settings.includes('st2DetayRaporMinAralikMs: 600000'), 'Detay rapor aralığı en az 5 dakika olmalı');
assert(version.includes('6.4.1-NONBLOCKING-REPORT-RUNTIME') || version.includes('6.4.2-REPORT-QUEUE-MEMORY-PRESSURE') || version.includes('6.4.3-PREMIER-REPORT-TRUTH') || version.includes('6.5.0-MFE-CAPTURE-TAKEOVER-EVOLUTION') || version.includes('6.6.0-LEARNED-TAKEOVER-EXPLAINABLE-PROTECTION') || version.includes('6.6.1-PREMIER-TRUTH-PROTECTION-SHADOW-LOCK') || version.includes('6.6.2-30S-LIVE-TELEGRAM-PANEL-REPORT-TRUTH'), 'Runtime sürümü v6.4.1+ olmalı');
console.log('✅ v6.4.1 non-blocking report runtime tests passed');
