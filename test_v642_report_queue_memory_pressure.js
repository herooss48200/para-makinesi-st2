'use strict';
const fs=require('fs');
function must(c,m){if(!c)throw new Error(m);}
const bot=fs.readFileSync('./bot.js','utf8');
const report=fs.readFileSync('./2_rapor.js','utf8');
const cfg=fs.readFileSync('./ayarlar.js','utf8');
const ver=require('./versiyon.js');
must(ver.botSurumu==='6.4.2-REPORT-QUEUE-MEMORY-PRESSURE','version');
must(bot.includes('rapor.raporTalepEt(false)'), 'bot report queue not wired');
must(!bot.includes('canliRaporCalisiyor'), 'legacy local report guard remains');
must(report.includes('function raporTalepEt'), 'request API missing');
must(report.includes('detayRaporlariniCalistir'), 'detail queue missing');
must(report.includes('DETAY RAPOR BASKI KORUMASI'), 'heap pressure guard missing');
must(report.includes('globalHistoricalTelegramCached'), 'global historical cache missing');
must(report.includes('ARKA_PLAN_KUYRUK'), 'panel/detail separation missing');
must(cfg.includes('st2DetayRaporHeapLimitMb: 190'), 'heap limit missing');
console.log('✅ v6.4.2 report queue + memory pressure tests passed');
