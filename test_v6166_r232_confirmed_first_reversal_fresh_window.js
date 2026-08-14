'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'st2-r232-'));
process.env.AGROS_DATA_DIR = temp;

try {
  const ayarlar = require('./ayarlar.js');
  const version = require('./versiyon.js');
  const policy = require('./90_st2_renko_entry_mode_policy.js');

  assert.strictEqual(version.botSurumu, '6.13.5-R25.1-EARLY-PROFIT-LOCK-MACD-REPLAY-SHADOW-5X-20USDT-10SLOT-POSTCLOSE-24H');
  assert.strictEqual(ayarlar.renkoGirisModuZorlaConfirmed, true);

  const decision = { selectedMode:'CONFIRMED', selectedOffsetT:0.25 };
  const B = (id,color,close,closeTime,open=close) => ({id,color,open,high:Math.max(open,close),low:Math.min(open,close),close,closeTime});

  // SHORT: kaynak G; ilk R base olmalı. Daha sonraki G->R çifti base'i kaydıramaz.
  const signal = B(10,'GREEN',100,1000,99);
  const firstRed = B(11,'RED',98,2000,99);
  const laterGreen = B(12,'GREEN',99,3000,98);
  const laterRed = B(13,'RED',97,4000,98);
  const pusu = {
    yon:'SHORT', patternKodu:'GGGG', sonKapaliTuglaZamani:1000,
    kaynakSonKapaliMumZamani:999999,
    entryModeDecisionAtSignal:decision
  };

  const reversal = policy.findLatest15mReversalAfterSignal([signal,firstRed,laterGreen,laterRed],'SHORT',pusu,9999999);
  assert.strictEqual(reversal.found,true);
  assert.strictEqual(reversal.confirmation.id,11,'ilk GREEN->RED reversal seçilmeli');
  assert.strictEqual(reversal.confirmation.closeTime,2000);

  // Yalnız ilk reversal kapanmışken 0.25T fresh pencere açık.
  const fresh = policy.confirmationTarget({...pusu},[signal,firstRed],4,9999999);
  assert.strictEqual(fresh.ready,true);
  assert.strictEqual(fresh.basePrice,98);
  assert.strictEqual(fresh.offsetT,0.25);
  assert.strictEqual(fresh.targetPrice,97);
  assert.strictEqual(fresh.reason,'READY_15M_CLOSED_FIRST_REVERSAL');

  // İlk reversal sonrası ikinci tam 15m Renko kapanınca geç giriş kesinlikle yok.
  const stale = policy.confirmationTarget({...pusu},[signal,firstRed,B(12,'RED',94,3000,98)],4,9999999);
  assert.strictEqual(stale.ready,false);
  assert.strictEqual(stale.reason,'CONFIRMED_WINDOW_EXPIRED_AFTER_NEXT_15M_RENKO');

  // Frozen base/box/target, sonraki ATR değişiminden etkilenmemeli.
  const frozenPusu = {
    ...pusu,
    confirmation15m:{
      pair:'GREEN->RED', basePrice:98, boxSize:4, offsetT:0.25, targetPrice:97,
      confirmationBrickId:11, confirmationCloseTime:2000,
      authority:'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET_FIRST_REVERSAL_FROZEN'
    }
  };
  const frozen = policy.confirmationTarget(frozenPusu,[signal,firstRed],999,9999999);
  assert.strictEqual(frozen.ready,true);
  assert.strictEqual(frozen.basePrice,98);
  assert.strictEqual(frozen.boxSize,4);
  assert.strictEqual(frozen.targetPrice,97);
  assert.strictEqual(frozen.reason,'READY_15M_CLOSED_REVERSAL_FROZEN');

  const entry = fs.readFileSync('./72_st2_renko_entry.js','utf8');
  assert(entry.includes('R23.2 CONFIRMED_LEGACY_EXPIRY_BYPASS'));
  assert(entry.includes('R23.2 CONFIRMED_RENKO_BOX_FROZEN'));
  assert(entry.includes('sonIptalPusuEventZamani'));
  assert(entry.includes('CONFIRMED PUSU GEÇ GİRİŞ İPTAL'));
  assert(entry.includes('confirmationBrickId'));

  // Risk ve long-life kontratı değişmedi.
  assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac,20);
  assert.strictEqual(ayarlar.gercekEmirMaxAktifPozisyon,10);
  assert.strictEqual(ayarlar.renkoConfirmedLongLifeAktif,true);

  console.log('✅ R24 preserves R23.2 first reversal + fresh fractional window + frozen box + stale rearm guard | 10 slot x 20USDT');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
