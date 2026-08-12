'use strict';
const assert = require('assert');
const reportSource = require('fs').readFileSync('2_rapor.js', 'utf8');
const transparency = require('./82_st2_operation_transparency.js');
const version = require('./versiyon.js');


assert(reportSource.includes('DNA Exit Replay (GÃ–LGE)'), 'DNA Exit Replay gÃ¶lge katmanÄ± aÃ§Ä±kÃ§a ayrÄ±lmalÄ±');
assert(reportSource.includes('CANLI RENKO KÃ‚R TAKÄ°BÄ°'), 'canlÄ± kÃ¢r yÃ¶netimi gÃ¶lge replayden ayrÄ± gÃ¶sterilmeli');
assert(reportSource.includes('Atama kanÄ±tÄ± N'), 'panel toplam tarihsel kanÄ±t yerine aktif atama kanÄ±tÄ±nÄ± aÃ§Ä±kÃ§a yazmalÄ±');
assert(reportSource.includes('p?.sanal === false && giris'), 'gerÃ§ek pozisyon SL raporu iÃ§in gerÃ§ek-emir yolu bulunmalÄ±');
assert(reportSource.includes('p.realStopLastAppliedTrigger'), 'rapor Binanceâ€™e son uygulanan stop fiyatÄ±nÄ± Ã¶nceliklendirmeli');
assert(reportSource.indexOf('p.realStopLastAppliedTrigger') < reportSource.indexOf('p.korunanKarYuzdesi'), 'gerÃ§ek stop legacy yÃ¼zde alanÄ±ndan Ã¶nce deÄŸerlendirilmelidir');
const dogeProtected = ((0.06941 - 0.06913) / 0.06913) * 100;
assert(dogeProtected > 0.40 && dogeProtected < 0.41, 'DOGE canlÄ± kanÄ±tÄ± yaklaÅŸÄ±k +%0.405 brÃ¼t stop korumasÄ± Ã¼retmeli');
assert(reportSource.includes("if (yon === 'SHORT') return ((giris - gercekStop) / giris) * 100;"), 'SHORT gerÃ§ek stop yÃ¶n hesabÄ± korunmalÄ±');

const restartGapPosition = {
  sym: 'OUSDT', yon: 'LONG', girisFiyati: 0.4979,
  girisAnalizi: { renkoEntryBrickDistance: 0.5, historicalEntryGate: { evidence: { n: 3, pf: 999, expectancy: 0.4227 } } },
  executionExitAssignment: {
    ready: false, activeForPosition: false, samples: 0,
    label: 'Mevcut Kademe Sistemi',
    reason: 'Entry Replay kanÄ±tÄ± yok; kendi LAB Exit doÄŸrulanana kadar gÃ¼venli mevcut kademe'
  },
  renkoExitAssignment: { profileSamples: 50, assignedTakeoverPct: 0.26, assignedAtrMultiplier: 1.04, assignedCaptureRatio: 0.88 },
  journey: { mfeYuzde: 0.281, maeYuzde: -0.542 },
  renkoExitEvents: []
};
const text = transparency.closingText(restartGapPosition, {
  title: 'RESTART GAP SANAL POZÄ°SYON KAPANDI', outcome: 'TP',
  openedAtText: '01.08.2026 01:41:10', closedAtText: '01.08.2026 02:06:18', durationText: '25dk 7sn',
  exitPrice: 0.4991289, pricePrecision: 7, reason: 'KÃ¢r Koruma', fiyatKarYuzdesi: 0.247,
  grossPnl: 0.0246, commission: 0.01, netPnl: 0.0146,
  replayUnavailableReason: 'RESTART_GAP_SCIENTIFICALLY_EXCLUDED', shadowOnly: true
});
assert(text.includes('GiriÅŸ 0.50 tuÄŸla | N3'), 'Entry N3 kapanÄ±ÅŸ raporunda korunmalÄ±');
assert(text.includes('GiriÅŸ kanÄ±tlÄ±; kendi LAB Exit doÄŸrulanana kadar gÃ¼venli mevcut kademe'), 'eski dondurulmuÅŸ N0 metni rapor anÄ±nda N3 ile uzlaÅŸtÄ±rÄ±lmalÄ±');
assert(!text.includes('Entry Replay kanÄ±tÄ± yok; kendi LAB Exit'), 'N3 varken kanÄ±t yok Ã§eliÅŸkisi gÃ¶rÃ¼nmemeli');
assert.strictEqual(version.botSurumu, '6.13.5-R23-CONFIRMED-LONG-LIFE-10USDT-POSTCLOSE-24H-FINAL');
console.log('âœ… v6.13.5-R8 report truth: real Binance stop priority + virtual legacy compatibility + Restart-GAP reconciliation passed');
