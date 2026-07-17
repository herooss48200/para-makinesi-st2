/**
 * AGROS v3.11.1 - EXIT EVOLUTION ADVANCED REPLAY MODELS
 *
 * Kayıtlı fiyat yolu üzerinde çalışır; Trade Engine'e dokunmaz.
 * ATR modeli yalnızca pricePath satırlarında atrPct varsa çalışır.
 */
const ayarlar = require('./ayarlar.js');

const VERSION = 'v3.11.1-EXIT-EVOLUTION-ADVANCED';

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function minuteOf(input, p) { return Math.max(0, (num(p?.ts) - num(input?.startTs)) / 60000); }

function scenarioResult(input, algo, grossPct, meta = {}) {
  const commission = num(input.commissionUsdt);
  const netUsdt = input.valueUsdt > 0 ? ((grossPct / 100) * input.valueUsdt) - commission : input.actualNetUsdt;
  const netPct = input.valueUsdt > 0 ? (netUsdt / input.valueUsdt) * 100 : input.actualNetPct;
  return {
    algorithmId: algo.id,
    algorithmLabel: algo.label,
    algorithmClass: algo.className,
    isExecutable: algo.isExecutable !== false,
    exitSource: meta.exitSource || 'ADVANCED_REPLAY',
    exitMinute: meta.exitMinute ?? '',
    grossPct: Number(num(grossPct).toFixed(4)),
    netPct: Number(num(netPct).toFixed(4)),
    netUsdt: Number(num(netUsdt).toFixed(6)),
    commissionUsdt: Number(commission.toFixed(6)),
    deltaVsActualUsdt: Number((netUsdt - num(input.actualNetUsdt)).toFixed(6)),
    deltaVsActualPct: Number((netPct - num(input.actualNetPct)).toFixed(4)),
    mfePct: Number(num(input.mfePct).toFixed(4)),
    maePct: Number(num(input.maePct).toFixed(4)),
    reached: meta.reached !== false,
    confidenceNote: meta.confidenceNote || '',
    dataAvailable: meta.dataAvailable !== false,
    modelTriggered: meta.modelTriggered !== false
  };
}

function actualFallback(input, algo, note) {
  return scenarioResult(input, algo, input.actualGrossPct, {
    reached: false,
    modelTriggered: false,
    exitSource: 'ACTUAL_FALLBACK',
    confidenceNote: note
  });
}

function trendExit(input, minMinute = 3) {
  for (const p of input.pathRows || []) {
    const minute = minuteOf(input, p);
    if (minute < minMinute) continue;
    if (p.stAligned === false) return { p, minute };
    const expected = input.side === 'LONG' ? 'UP' : 'DOWN';
    if (p.stTrend && p.stTrend !== expected) return { p, minute };
  }
  return null;
}

function ladderExit(input, profile) {
  let floor = null;
  let activeStep = -1;
  for (const p of input.pathRows || []) {
    const pnl = num(p.pnlPct);
    for (let i = activeStep + 1; i < profile.triggers.length; i++) {
      if (pnl >= profile.triggers[i]) {
        activeStep = i;
        floor = profile.floors[Math.min(i, profile.floors.length - 1)];
      } else break;
    }
    if (floor !== null && pnl <= floor) return { p, floor, activeStep };
  }
  return null;
}

function atrTrailingExit(input, multiplier) {
  let peak = 0;
  let peakAtr = null;
  for (const p of input.pathRows || []) {
    const pnl = num(p.pnlPct);
    const atrPct = num(p.atrPct, NaN);
    if (!Number.isFinite(atrPct) || atrPct <= 0) continue;
    if (pnl >= peak) { peak = pnl; peakAtr = atrPct; }
    if (peak > 0 && peakAtr && pnl <= peak - peakAtr * multiplier) return { p, peak, atrPct: peakAtr };
  }
  return null;
}

function dynamicExit(input) {
  let peak = 0;
  const rows = input.pathRows || [];
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const pnl = num(p.pnlPct);
    peak = Math.max(peak, pnl);
    const minute = minuteOf(input, p);
    const recent = rows.slice(Math.max(0, i - 5), i + 1);
    const moves = [];
    for (let j = 1; j < recent.length; j++) moves.push(Math.abs(num(recent[j].pnlPct) - num(recent[j - 1].pnlPct)));
    const noise = moves.length ? moves.reduce((a,b)=>a+b,0) / moves.length : 0;
    const aligned = p.stAligned !== false;
    const capture = aligned && noise < 0.18 ? 0.55 : aligned ? 0.65 : 0.82;
    const minPeak = minute < 15 ? 0.6 : 0.35;
    if (peak >= minPeak && pnl <= peak * capture) return { p, peak, capture, noise };
  }
  return null;
}

function hybridExit(input) {
  let peak = 0;
  for (const p of input.pathRows || []) {
    const minute = minuteOf(input, p);
    const pnl = num(p.pnlPct);
    peak = Math.max(peak, pnl);
    if (minute <= 15 && p.stAligned === false) return { p, minute, stage: 'TREND_FIRST_15M' };
    if (minute > 15 && minute <= 60 && peak >= 0.5 && pnl <= peak * 0.68) return { p, minute, stage: 'MID_MFE_68' };
    if (minute > 60 && peak >= 0.3 && pnl <= peak * 0.82) return { p, minute, stage: 'LATE_MFE_82' };
  }
  return null;
}

function algorithms() {
  const list = [];

  list.push({
    id: 'TREND_EXIT_ST', label: 'Trend Exit (ST Bozulması)', className: 'TREND_EXIT', isExecutable: true,
    run(input) {
      const hit = trendExit(input, num(ayarlar.exitReplayTrendMinMinute, 3));
      return hit ? scenarioResult(input, this, hit.p.pnlPct, { exitMinute: hit.minute, exitSource: 'ST_ALIGNMENT_BREAK', confidenceNote: 'Kayıtlı SuperTrend uyumu ilk bozulduğu noktada çıkış.' }) : actualFallback(input, this, 'Kayıtlı yolda trend bozulması görülmedi.');
    }
  });

  const ladders = Array.isArray(ayarlar.exitReplayAlternativeLadders) && ayarlar.exitReplayAlternativeLadders.length
    ? ayarlar.exitReplayAlternativeLadders
    : [
      { id: 'FAST', label: 'Alternatif Kademe Hızlı', triggers: [0.3,0.6,1.0,2.0], floors: [0.0,0.2,0.5,1.2] },
      { id: 'WIDE', label: 'Alternatif Kademe Geniş', triggers: [0.5,1.2,2.5,4.0], floors: [0.0,0.4,1.2,2.5] }
    ];
  for (const profile of ladders) list.push({
    id: `ALT_LADDER_${profile.id}`, label: profile.label, className: 'ALTERNATIVE_LADDER', isExecutable: true,
    run(input) {
      const hit = ladderExit(input, profile);
      return hit ? scenarioResult(input, this, hit.p.pnlPct, { exitMinute: minuteOf(input, hit.p), exitSource: 'ALTERNATIVE_LADDER_FLOOR', confidenceNote: `Kademe ${hit.activeStep + 1}; koruma tabanı %${hit.floor}.` }) : actualFallback(input, this, 'Alternatif kademe koruma tabanı tetiklenmedi.');
    }
  });

  for (const multiplier of (ayarlar.exitReplayAtrMultipliers || [1.5,2.0,2.5])) list.push({
    id: `ATR_TRAIL_${String(multiplier).replace('.','_')}X`, label: `ATR Trailing ${multiplier}x`, className: 'ATR_TRAILING', isExecutable: true,
    run(input) {
      const hasAtr = (input.pathRows || []).some(p => Number.isFinite(Number(p.atrPct)) && Number(p.atrPct) > 0);
      if (!hasAtr) return scenarioResult(input, this, input.actualGrossPct, { reached: false, modelTriggered: false, dataAvailable: false, exitSource: 'ATR_DATA_UNAVAILABLE', confidenceNote: 'ATR yüzdesi fiyat yolunda yok; model doğrulama örneğine alınmadı.' });
      const hit = atrTrailingExit(input, multiplier);
      return hit ? scenarioResult(input, this, hit.p.pnlPct, { exitMinute: minuteOf(input, hit.p), exitSource: 'ATR_TRAILING_BREAK', confidenceNote: `Tepe kârdan ${multiplier} ATR geri çekilme.` }) : actualFallback(input, this, 'ATR trailing tetiklenmedi.');
    }
  });

  list.push({
    id: 'DYNAMIC_PATH_EXIT', label: 'Dinamik Fiyat Yolu Exit', className: 'DYNAMIC_EXIT', isExecutable: true,
    run(input) {
      const hit = dynamicExit(input);
      return hit ? scenarioResult(input, this, hit.p.pnlPct, { exitMinute: minuteOf(input, hit.p), exitSource: 'DYNAMIC_CAPTURE', confidenceNote: `Trend/noise durumuna göre tepe kârın %${Math.round(hit.capture*100)}'i korundu.` }) : actualFallback(input, this, 'Dinamik koruma tetiklenmedi.');
    }
  });

  list.push({
    id: 'HYBRID_TREND_MFE', label: 'Hibrit Trend + MFE Exit', className: 'HYBRID_EXIT', isExecutable: true,
    run(input) {
      const hit = hybridExit(input);
      return hit ? scenarioResult(input, this, hit.p.pnlPct, { exitMinute: hit.minute, exitSource: hit.stage, confidenceNote: `Hibrit aşama: ${hit.stage}.` }) : actualFallback(input, this, 'Hibrit model tetiklenmedi.');
    }
  });

  return list;
}

module.exports = { VERSION, algorithms, trendExit, ladderExit, atrTrailingExit, dynamicExit, hybridExit };
