'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const marketSrc=fs.readFileSync('./3_piyasa.js','utf8');
assert.ok(marketSrc.includes('futuresDailyStats'));
assert.ok(marketSrc.includes('FUTURES_24H_QUOTE_VOLUME_DESC'));
assert.ok(marketSrc.includes('.sort((a, b) => b.quoteVolume - a.quoteVolume'));
assert.ok(marketSrc.includes('[CANLI EVREN KANITI]'));
assert.ok(marketSrc.includes('[CANLI EVREN SINIRI]'));

const entrySrc=fs.readFileSync('./72_st2_renko_entry.js','utf8');
for(const key of ['pusuDegerlendirilen','fiyatTetigi','fiyatBekleyen','stReddi','birlikteUygun','pozisyonAcildi','pozisyonReddedildi','[ST2 GİRİŞ HUNİSİ]']) assert.ok(entrySrc.includes(key),key);
assert.ok(entrySrc.includes('const ok = await m.pozisyonAc'));
assert.ok(entrySrc.includes('if (!fiyatUygun || !stUygun) return false'));

const dnaSrc=fs.readFileSync('./77_st2_pattern_dna_intelligence.js','utf8');
for(const key of ['shortId','EXACT_TARIHSEL_YOK','CANLI_N3_BEKLENIYOR','MINIMUM_N_EKSIK','GUVEN_ESIGI_ALTI','YALNIZ REFERANS/SHADOW']) assert.ok(dnaSrc.includes(key),key);

const evoSrc=fs.readFileSync('./73_st2_renko_entry_evolution.js','utf8');
assert.ok(evoSrc.includes('Seçim gerekçesi'));
assert.ok(evoSrc.includes('Premier kanıtı'));
assert.ok(evoSrc.includes('Politika: önce Net'));

const motorSrc=fs.readFileSync('./motor.js','utf8');
const gateIndex=motorSrc.indexOf('const gate = adaptiveDnaEntry.gateDecision');
const pushIndex=motorSrc.indexOf('h.state.aktifPozisyonlar.push(yeniPozisyon)');
assert.ok(gateIndex>=0 && pushIndex>gateIndex);
const between=motorSrc.slice(gateIndex,pushIndex);
assert.ok(!/if\s*\(\s*!?gate\.allow\s*\)\s*\{?\s*return false/.test(between),'Exact-context gate must not block virtual position opening');

console.log('✅ v6.3.0 source-contract tests passed');
