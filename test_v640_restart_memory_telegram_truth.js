'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');

const marketSrc=fs.readFileSync(path.join(__dirname,'3_piyasa.js'),'utf8');
assert.ok(!/sanalEmirModu\)[\s\S]{0,220}aktifPozisyonlar\s*=\s*\[\]/.test(marketSrc),'sanal mod aktif pozisyonları sıfırlamamalı');
assert.ok(marketSrc.includes('kalıcı sanal pozisyon korunuyor'));

const dnaSrc=fs.readFileSync(path.join(__dirname,'77_st2_pattern_dna_intelligence.js'),'utf8');
assert.ok(!dnaSrc.includes('LIVE_N3_PREMIER_CONFIRMED'));
assert.ok(dnaSrc.includes('LIVE_N3_POZITIF_GIRIS_PROFILI'));
assert.ok(dnaSrc.includes('Tarihsel lig'));

const reconSrc=fs.readFileSync(path.join(__dirname,'78_st2_global_historical_reconciliation.js'),'utf8');
assert.ok(!reconSrc.includes("live.length===n(ev.bridge?.accepted)"));
assert.ok(reconSrc.includes('Kalıcı mutabakat'));
assert.ok(reconSrc.includes('Bu oturum köprüsü'));

const exitSrc=fs.readFileSync(path.join(__dirname,'74_st2_renko_exit_evolution.js'),'utf8');
assert.ok(exitSrc.includes('İzlenen pattern'));
assert.ok(exitSrc.includes('Fallback/öğrenme bekliyor') || exitSrc.includes('KANIT_BEKLIYOR'));
assert.ok(exitSrc.includes('AKTİF ÖĞRENİLMİŞ') || exitSrc.includes('✅ AKTİF'));

const version=require('./versiyon.js');
assert.ok(version.botSurumu.startsWith('6.4.') || version.botSurumu.startsWith('6.5.') || version.botSurumu.startsWith('6.6.'));
console.log('✅ v6.4.0 restart memory + Telegram truth tests passed');
