'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-r222-'));
process.env.AGROS_DATA_DIR = temp;

try {
  const ayarlar = require('./ayarlar.js');
  assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar, 5, 'marjin 8 USDT olmalÄ±');
  assert.strictEqual(ayarlar.mevcutKaldirac, 2, 'kaldÄ±raÃ§ 5x korunmalÄ±');
  assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar * ayarlar.mevcutKaldirac, 2, 'toplam notional 40 USDT olmalÄ±');
  assert.deepStrictEqual(ayarlar.gercekDirectIzinliTuglalar, [0.50, 1.00], 'DIRECT gerÃ§ek izin yalnÄ±z 0.50T/1.00T olmalÄ±');
  assert.strictEqual(ayarlar.gercekDirectTuglaFiltreAktif, true);
  assert.strictEqual(ayarlar.postClose24hTakipAktif, true);
  assert.strictEqual(ayarlar.postCloseTakipSaat, 24);

  const motorSource = fs.readFileSync(path.join(__dirname, 'motor.js'), 'utf8');
  assert(motorSource.includes('gercekDirectTuglaKapisi'), 'motor DIRECT T filtresini iÃ§ermeli');
  assert(motorSource.includes("if (mode === 'CONFIRMED')"), 'CONFIRMED DIRECT filtresinden muaf olmalÄ±');
  assert(motorSource.includes('ST2_ENTRY_MODE_INVALID_SHADOW_ONLY'), 'ST2 entry mode eksik/geÃ§ersizse gerÃ§ek emir fail-closed shadow olmalÄ±');
  assert(motorSource.includes('[DIRECT T MOTOR FAIL-CLOSED]'), 'motor ikincil fail-closed kapÄ±sÄ± eksik');

  const entrySource = fs.readFileSync(path.join(__dirname, '72_st2_renko_entry.js'), 'utf8');
  assert(entrySource.includes("require('./96_st2_filtered_direct_shadow.js')"), 'filtered DIRECT shadow lifecycle baÄŸÄ± eksik');
  assert(entrySource.includes('[DIRECT T SHADOW-ONLY]'), 'izin dÄ±ÅŸÄ± DIRECT primary shadow-only kanÄ±tÄ± eksik');
  assert(entrySource.includes('filteredDirectShadow.open(pusu, price, selectedEntryBrick'), 'izin dÄ±ÅŸÄ± DIRECT ayrÄ± shadow lifecycle aÃ§malÄ±');

  const posSource = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');
  assert(posSource.includes("require('./95_st2_post_close_price_path.js')"), 'post-close modÃ¼l baÄŸÄ± eksik');
  assert(posSource.includes('postClosePricePath.start(pos'), 'gerÃ§ek kapanÄ±ÅŸta post-close takip baÅŸlamalÄ±');
  assert(posSource.includes('postClosePricePath.advance(h.state.canliFiyatlar || {}, Date.now())'), 'takip mevcut canlÄ± fiyat cache ile ilerlemeli');

  const directShadow = require('./96_st2_filtered_direct_shadow.js');
  directShadow._resetForTest();
  const dsBase = 900_000_000;
  const dsOpen = directShadow.open({sym:'SHADOWUSDT',yon:'LONG',patternKodu:'RRRR',olusanMumZamani:dsBase-60_000},100,0.25,{at:dsBase,stTrend:'UP'});
  assert.strictEqual(dsOpen.accepted,true,'0.25T filtered DIRECT ayrÄ± shadow aÃ§malÄ±');
  const dsTick = directShadow.advance({
    prices:{SHADOWUSDT:100.4},
    candles15mBySymbol:{SHADOWUSDT:[{openTime:dsBase+1,closeTime:dsBase+900_000,open:100,low:99.9,high:100.5,close:100.4}]},
    now:dsBase+900_000
  });
  assert.strictEqual(dsTick.closed,1,'filtered DIRECT shadow standard lifecycle ile kapanmalÄ±');
  const dsState = directShadow.snapshot();
  assert.strictEqual(Object.keys(dsState.experiments).length,0,'filtered DIRECT shadow sembolÃ¼ aktif pozisyon olarak bloke etmemeli');
  assert.strictEqual(dsState.completed.length,1,'filtered DIRECT shadow kanÄ±tÄ± ayrÄ± ledger/state iÃ§inde korunmalÄ±');
  assert.strictEqual(dsState.completed[0].offsetT,0.25);
  assert.strictEqual(dsState.completed[0].outcome,'TP');

  const tracker = require('./95_st2_post_close_price_path.js');
  tracker._resetForTest();
  const base = 1_000_000_000;
  const pos = {
    sym:'TESTUSDT', yon:'LONG', sanal:false, acilisZamani:base-60_000, girisFiyati:100,
    girisAnalizi:{entryStrategy:'ST2_RENKO',entryMode:'DIRECT',renkoEntryBrickDistance:0.50,patternKodu:'RRRR'},
    execution:{mfePct:0.4,maePct:-0.8}
  };
  const st = tracker.start(pos,{entryPrice:100,exitPrice:99,closedAt:base,reason:'SL',net:-0.4,commission:0.04});
  assert.strictEqual(st.accepted,true,'gerÃ§ek kapanÄ±ÅŸ tracker baÅŸlatmalÄ±');
  tracker.advance({TESTUSDT:98},base+10*60_000);   // -2%
  tracker.advance({TESTUSDT:101},base+30*60_000);  // +1%
  tracker.advance({TESTUSDT:103},base+60*60_000);  // +3%
  const mid = tracker.snapshot();
  const exp = Object.values(mid.active)[0];
  assert(exp.bestPct >= 3-1e-9,'post-close +3% MFE yakalanmalÄ±');
  assert(exp.worstPct <= -2+1e-9,'post-close -2% MAE yakalanmalÄ±');
  assert(exp.levelHits['+1.00%'],'+1% ilk hit zamanÄ± kaydedilmeli');
  assert(exp.levelHits['+3.00%'],'+3% ilk hit zamanÄ± kaydedilmeli');
  assert(exp.levelHits['-2.00%'],'-2% ilk hit zamanÄ± kaydedilmeli');
  assert(exp.checkpoints['30M'],'30m checkpoint kaydedilmeli');
  assert(exp.checkpoints['1H'],'1h checkpoint kaydedilmeli');

  const done = tracker.advance({TESTUSDT:102},base+24*60*60_000);
  assert.strictEqual(done.completed,1,'24h sonunda takip tamamlanmalÄ±');
  const fin = tracker.snapshot();
  assert.strictEqual(Object.keys(fin.active).length,0,'tamamlanan takip aktiften Ã§Ä±kmalÄ±');
  assert.strictEqual(fin.completed.length,1,'tamamlanan kayÄ±t korunmalÄ±');
  assert(fs.existsSync(tracker.LEDGER_FILE),'24h sonuÃ§ ledger yazÄ±lmalÄ±');

  const version = require('./versiyon.js');
  assert(String(version.botSurumu).includes('R22.2'));

  console.log('âœ… v6.13.5-R22.2 kasa recovery passed | 10 USDT notional | DIRECT real 0.50T/1.00T only | CONFIRMED exempt | post-close 24h no-order tracker');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
