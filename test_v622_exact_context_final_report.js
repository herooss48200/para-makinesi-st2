const fs=require('fs');
function ok(c,m){if(!c)throw new Error(m)}
const bot=fs.readFileSync('bot.js','utf8');
const report=fs.readFileSync('2_rapor.js','utf8');
const motor=fs.readFileSync('motor.js','utf8');
const close=fs.readFileSync('4_pozisyon.js','utf8');
const version=fs.readFileSync('versiyon.js','utf8');
ok(bot.includes('ST2 EXACT-CONTEXT RUNTIME ACTIVE'),'exact-context runtime log missing');
ok(bot.includes('Tarihsel pozitif exact-context: Premier'),'startup exact-context Premier missing');
ok(bot.includes('Negatif veya bilinmeyen exact-context: Shadow'),'startup Shadow missing');
ok(!bot.includes('Sanal öğrenme: TÜM GEÇERLİ LAB/FULL DNA'),'legacy startup learning text remains');
ok(report.includes('Tetiklenmeyen ${Math.max(0'),'explicit non-triggered reconciliation missing');
ok(report.includes('Canlı Portföy yalnız exact-context Premier sanal işlemlerini gösterir') && report.includes('Shadow defterinde öğrenir'),'portfolio exact-context footer missing');
ok(motor.includes('[EXACT-CONTEXT PREMIER SANAL POZİSYON]'),'open Premier title missing');
ok(motor.includes('[EXACT-CONTEXT SHADOW ÖĞRENME]'),'open Shadow title missing');
ok(close.includes('[EXACT-CONTEXT PREMIER SANAL POZİSYON KAPANDI]'),'close Premier title missing');
ok(close.includes('[EXACT-CONTEXT SHADOW ÖĞRENME KAPANDI]'),'close Shadow title missing');
ok(version.includes('6.3.0-LIVE-UNIVERSE-ENTRY-FUNNEL-EXPLAINABILITY'),'current version missing');
console.log('✅ v6.2.2 exact-context compatibility passed under v6.3.0');
