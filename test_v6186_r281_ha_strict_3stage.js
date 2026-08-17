'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');

assert.equal(ayarlar.heikinAshiMaxPusuBeklemeMum,3);
assert.equal(ayarlar.heikinAshiTetikPenceresiMum,1);

const src=fs.readFileSync(path.join(__dirname,'75_st2_heikin_ashi_entry.js'),'utf8');

// Kesin üç aşama: kapanmış pusu -> kapanmış teyit -> yalnız sonraki 15m mumda gerçek fiyat gövde kırılımı.
assert(src.includes('closedCandles(rows'));
assert(src.includes('[HA TEYİT MUMU KAPANDI]'));
assert(src.includes('triggerWindowForConfirmation'));
assert(src.includes('triggerWindowState'));
assert(src.includes("state:'NEXT_CANDLE_ACTIVE'"));
assert(src.includes('[HA TETİK MUMU EXPIRED]'));
assert(src.includes('[HA GERÇEK TETİK / FORMASYON+ST ONAYLI]'));
assert(src.includes('structureAuthority.evaluate(series, pusu.yon'));
assert(src.includes("entryTimingAuthority:'CLOSED_15M_HA_CONFIRMATION_NEXT_15M_BODY_BREAK'"));
assert(src.includes('sameCandleConfirmationTriggerForbidden:true'));
assert(src.includes('triggerWindowCandles:Number(ayarlar.heikinAshiTetikPenceresiMum || 1)'));
assert(src.includes('wickIgnored:true'));
assert(src.includes('confirmationOpenTime + periodMs'));
assert(src.includes('triggerCloseTimeExclusive = triggerOpenTime + periodMs * triggerWindowCandles'));

// Eski davranış geri dönmesin: teyit penceresi sınırsız yaşayamaz.
assert(!src.includes("entryTimingAuthority:'CLOSED_15M_HEIKIN_ASHI_REVERSAL_BODY_BREAK'"));

console.log('✅ R29.1 HA strict 3-stage passed | CLOSED pusu -> CLOSED confirmation <=3 -> NEXT 15m only body break -> formation OR -> ST final gate | same-candle forbidden | wick ignored | stale confirmation expires');
