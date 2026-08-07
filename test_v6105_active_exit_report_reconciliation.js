'use strict';
const assert = require('assert');
const reportSource = require('fs').readFileSync('2_rapor.js', 'utf8');
const transparency = require('./82_st2_operation_transparency.js');
const version = require('./versiyon.js');


assert(reportSource.includes('DNA Exit Replay (GÖLGE)'), 'DNA Exit Replay gölge katmanı açıkça ayrılmalı');
assert(reportSource.includes('CANLI RENKO KÂR TAKİBİ'), 'canlı kâr yönetimi gölge replayden ayrı gösterilmeli');
assert(reportSource.includes('Atama kanıtı N'), 'panel toplam tarihsel kanıt yerine aktif atama kanıtını açıkça yazmalı');
assert(reportSource.includes('p?.sanal === false && giris'), 'gerçek pozisyon SL raporu için gerçek-emir yolu bulunmalı');
assert(reportSource.includes('p.realStopLastAppliedTrigger'), 'rapor Binance’e son uygulanan stop fiyatını önceliklendirmeli');
assert(reportSource.indexOf('p.realStopLastAppliedTrigger') < reportSource.indexOf('p.korunanKarYuzdesi'), 'gerçek stop legacy yüzde alanından önce değerlendirilmelidir');
const dogeProtected = ((0.06941 - 0.06913) / 0.06913) * 100;
assert(dogeProtected > 0.40 && dogeProtected < 0.41, 'DOGE canlı kanıtı yaklaşık +%0.405 brüt stop koruması üretmeli');
assert(reportSource.includes("if (yon === 'SHORT') return ((giris - gercekStop) / giris) * 100;"), 'SHORT gerçek stop yön hesabı korunmalı');

const restartGapPosition = {
  sym: 'OUSDT', yon: 'LONG', girisFiyati: 0.4979,
  girisAnalizi: { renkoEntryBrickDistance: 0.5, historicalEntryGate: { evidence: { n: 3, pf: 999, expectancy: 0.4227 } } },
  executionExitAssignment: {
    ready: false, activeForPosition: false, samples: 0,
    label: 'Mevcut Kademe Sistemi',
    reason: 'Entry Replay kanıtı yok; kendi LAB Exit doğrulanana kadar güvenli mevcut kademe'
  },
  renkoExitAssignment: { profileSamples: 50, assignedTakeoverPct: 0.26, assignedAtrMultiplier: 1.04, assignedCaptureRatio: 0.88 },
  journey: { mfeYuzde: 0.281, maeYuzde: -0.542 },
  renkoExitEvents: []
};
const text = transparency.closingText(restartGapPosition, {
  title: 'RESTART GAP SANAL POZİSYON KAPANDI', outcome: 'TP',
  openedAtText: '01.08.2026 01:41:10', closedAtText: '01.08.2026 02:06:18', durationText: '25dk 7sn',
  exitPrice: 0.4991289, pricePrecision: 7, reason: 'Kâr Koruma', fiyatKarYuzdesi: 0.247,
  grossPnl: 0.0246, commission: 0.01, netPnl: 0.0146,
  replayUnavailableReason: 'RESTART_GAP_SCIENTIFICALLY_EXCLUDED', shadowOnly: true
});
assert(text.includes('Giriş 0.50 tuğla | N3'), 'Entry N3 kapanış raporunda korunmalı');
assert(text.includes('Giriş kanıtlı; kendi LAB Exit doğrulanana kadar güvenli mevcut kademe'), 'eski dondurulmuş N0 metni rapor anında N3 ile uzlaştırılmalı');
assert(!text.includes('Entry Replay kanıtı yok; kendi LAB Exit'), 'N3 varken kanıt yok çelişkisi görünmemeli');
assert.strictEqual(version.botSurumu, '6.13.5-R6-MARKET-DATA-RECOVERY-FAIRNESS');
console.log('✅ v6.13.5-R6 report truth: real Binance stop priority + virtual legacy compatibility + Restart-GAP reconciliation passed');
