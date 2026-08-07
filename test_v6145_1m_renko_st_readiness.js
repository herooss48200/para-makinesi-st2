'use strict';
const fs = require('fs');
const assert = require('assert');
const rev = fs.readFileSync(require.resolve('./revizyon.js'), 'utf8');
const ent = fs.readFileSync(require.resolve('./72_st2_renko_entry.js'), 'utf8');
const rep = fs.readFileSync(require.resolve('./2_rapor.js'), 'utf8');
const cfg = require('./ayarlar.js');
const core = require('./72_st2_renko_core.js');

assert.strictEqual(cfg.renkoOnayKaynakMumLimiti, 80);
assert(cfg.renkoOnayDerinOnarimMumLimiti > cfg.renkoOnayKaynakMumLimiti);
assert(cfg.renkoOnayMaksOnarimMumLimiti >= cfg.renkoOnayDerinOnarimMumLimiti);
assert(rev.includes("return renko1mHazirSayisi();"), 'Entry Gate ham 1m cache sayısına değil gerçek Renko-ST readiness sayısına bakmalı');
assert(rev.includes('RENKO_1M_TUGLA_YETERSIZ'), 'Renko tuğla yetersizliği ayrı sınıflanmalı');
assert(rev.includes('START_RENKO_ST_REPAIR_1') && rev.includes('START_RENKO_ST_REPAIR_2'), '80 mum yetmezse 240/480 derin onarım olmalı');
assert(ent.includes('h.state.renko1mStCache?.[sym]'), 'Entry scan önceden hesaplanmış 1m Renko-ST cache kullanmalı');
assert(ent.includes("bricks.length < minBricks"), 'SuperTrend için minimum Renko tuğla derinliği açık kontrol edilmeli');
assert(rep.includes('🚪 Giriş hunisi Değerlendirilen'), 'Canlı panel entry funnel göstermeli');
assert(rep.includes('1m Renko ST ${veriSagligi.renko1mStHazir}/${veriSagligi.secilen}'), 'Panel ham veri ile gerçek ST readiness ayırmalı');

// 80 adet ham 1m mumun var olması, Renko-ST oluşacağını garanti etmez: wick yüksek, close dar sentetik seri.
function candles(n){
  const out=[]; let c=100;
  for(let i=0;i<n;i++){
    c += (i%2===0?0.01:-0.009);
    out.push({open:c, high:c+1.0, low:c-1.0, close:c, closeTime:(i+1)*60000});
  }
  return out;
}
const raw80=candles(80);
const box=core.atr(raw80,14);
const bricks=core.renkoUret(raw80,box);
assert(raw80.length===80 && box>0 && bricks.length < 12, 'Test fixture: ham veri hazır ama Renko-ST derinliği yetersiz olmalı');
console.log(`✅ v6.13.5-R14 1m Renko ST readiness passed | raw80=${raw80.length} | bricks=${bricks.length} | gate uses actual ST readiness + 240/480 repair`);
