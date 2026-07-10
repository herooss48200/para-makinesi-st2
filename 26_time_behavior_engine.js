/**
 * AGROS v3.6.7 - DNA TIME BEHAVIOR ENGINE
 *
 * Amaç:
 * - Kör bir "N. dakikada çık" kuralı üretmez.
 * - Her DNA'nın zaman içinde nasıl olgunlaştığını, hızlandığını, yorulduğunu
 *   ve kâr geri verdiğini kapanmış işlemlerin kaydedilmiş fiyat yolundan öğrenir.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz; emir/TP/SL/stop değiştirmez.
 * - Çıktıları araştırma ve replay verisidir; canlı karar değildir.
 */

const VERSION = 'v3.6.7-TIME-BEHAVIOR';

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function avg(sum, n, digits = 4) { return n ? round(num(sum) / n, digits) : 0; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, num(v))); }
function normalizeMinutes(minutes) {
  const source = Array.isArray(minutes) && minutes.length ? minutes : [5,10,15,20,30,45,60,90,120];
  return [...new Set(source.map(Number).filter(x => Number.isFinite(x) && x > 0).map(x => Math.round(x)))].sort((a,b)=>a-b);
}
function signatureOf(input = {}) { return String(input.signatureShort || input.signatureKey || 'SIGNATURE_YOK'); }
function emptyStore() { return { version: VERSION, totalTrades: 0, bySignature: {} }; }
function ensureStore(store) {
  const out = store && typeof store === 'object' ? store : emptyStore();
  out.version = VERSION;
  if (!Number.isFinite(Number(out.totalTrades))) out.totalTrades = 0;
  if (!out.bySignature || typeof out.bySignature !== 'object') out.bySignature = {};
  return out;
}
function emptyDna(key, label) {
  return {
    key, label: label || key, samples: 0, pathQualifiedSamples: 0,
    durationMinuteSum: 0, peakMinuteSum: 0, firstPositiveMinuteSum: 0,
    firstPositiveSamples: 0, peakMinuteSamples: 0, checkpoints: {}
  };
}
function ensureCheckpoint(dna, minute) {
  const key = String(minute);
  if (!dna.checkpoints[key]) dna.checkpoints[key] = {
    minute, eligible: 0, pnlPctSum: 0, mfePctSum: 0, maePctSum: 0, givebackPctSum: 0,
    positive: 0, atOrNearPeak: 0, newHighAfter: 0, gaveBackAfter: 0,
    finalBetter: 0, finalWorse: 0, peakCapturedRatioSum: 0
  };
  return dna.checkpoints[key];
}
function normalizedPath(input = {}) {
  return (Array.isArray(input.pathRows) ? input.pathRows : [])
    .map(x => ({ ts: num(x?.ts), pnlPct: num(x?.pnlPct) }))
    .filter(x => x.ts > 0 && Number.isFinite(x.pnlPct))
    .sort((a,b)=>a.ts-b.ts);
}
function pointAt(path, targetTs) {
  return path.find(x => x.ts >= targetTs) || null;
}
function analyzeTrade(input = {}, minutes) {
  const path = normalizedPath(input);
  const startTs = num(input.startTs, path[0]?.ts);
  const closeTs = num(input.closeTs, path[path.length - 1]?.ts);
  const durationMinute = Math.max(0, num(input.durationMs, closeTs - startTs) / 60000);
  if (!path.length || !startTs || !closeTs) return { qualified: false, durationMinute, checkpoints: [] };

  let finalPeak = -Infinity, peakPoint = null, firstPositivePoint = null;
  for (const p of path) {
    if (p.pnlPct > finalPeak) { finalPeak = p.pnlPct; peakPoint = p; }
    if (!firstPositivePoint && p.pnlPct > 0) firstPositivePoint = p;
  }
  finalPeak = Math.max(0, finalPeak);
  const peakMinute = peakPoint ? Math.max(0, (peakPoint.ts - startTs) / 60000) : 0;
  const firstPositiveMinute = firstPositivePoint ? Math.max(0, (firstPositivePoint.ts - startTs) / 60000) : null;
  const finalPct = num(input.actualGrossPct, path[path.length - 1]?.pnlPct);
  const checkpoints = [];

  for (const minute of normalizeMinutes(minutes)) {
    const targetTs = startTs + minute * 60000;
    if (targetTs > closeTs) continue;
    const p = pointAt(path, targetTs);
    if (!p) continue;
    const upto = path.filter(x => x.ts <= p.ts);
    const after = path.filter(x => x.ts > p.ts);
    const mfeAt = Math.max(0, ...upto.map(x => x.pnlPct));
    const maeAt = Math.min(0, ...upto.map(x => x.pnlPct));
    const futurePeak = after.length ? Math.max(...after.map(x => x.pnlPct)) : p.pnlPct;
    const futureLow = after.length ? Math.min(...after.map(x => x.pnlPct)) : p.pnlPct;
    const giveback = Math.max(0, mfeAt - p.pnlPct);
    const peakCapturedRatio = finalPeak > 0 ? clamp(mfeAt / finalPeak, 0, 1.5) : 0;
    checkpoints.push({
      minute, pnlPct: p.pnlPct, mfePct: mfeAt, maePct: maeAt, givebackPct: giveback,
      positive: p.pnlPct > 0, atOrNearPeak: finalPeak > 0 && p.pnlPct >= finalPeak * 0.90,
      newHighAfter: futurePeak > mfeAt + 0.0001,
      gaveBackAfter: futureLow < p.pnlPct - Math.max(0.10, Math.abs(p.pnlPct) * 0.25),
      finalBetter: finalPct > p.pnlPct + 0.0001,
      finalWorse: finalPct < p.pnlPct - 0.0001,
      peakCapturedRatio
    });
  }
  return { qualified: true, durationMinute, peakMinute, firstPositiveMinute, finalPeak, checkpoints };
}
function addTrade(store, input, minutes) {
  const out = ensureStore(store);
  const key = signatureOf(input);
  const dna = out.bySignature[key] || emptyDna(key, input.signatureLabel || key);
  const a = analyzeTrade(input, minutes);
  dna.samples += 1;
  dna.durationMinuteSum += a.durationMinute;
  if (a.qualified) dna.pathQualifiedSamples += 1;
  if (Number.isFinite(a.peakMinute)) { dna.peakMinuteSum += a.peakMinute; dna.peakMinuteSamples += 1; }
  if (Number.isFinite(a.firstPositiveMinute)) { dna.firstPositiveMinuteSum += a.firstPositiveMinute; dna.firstPositiveSamples += 1; }
  for (const row of a.checkpoints || []) {
    const b = ensureCheckpoint(dna, row.minute);
    b.eligible += 1; b.pnlPctSum += row.pnlPct; b.mfePctSum += row.mfePct; b.maePctSum += row.maePct;
    b.givebackPctSum += row.givebackPct; b.peakCapturedRatioSum += row.peakCapturedRatio;
    for (const k of ['positive','atOrNearPeak','newHighAfter','gaveBackAfter','finalBetter','finalWorse']) if (row[k]) b[k] += 1;
  }
  out.totalTrades += 1;
  out.bySignature[key] = dna;
  return out;
}
function rate(v, n) { return n ? round((num(v) / n) * 100, 1) : 0; }
function checkpointModel(b) {
  const n = num(b.eligible);
  return {
    minute: num(b.minute), samples: n,
    avgPnlPct: avg(b.pnlPctSum, n), avgMfePct: avg(b.mfePctSum, n), avgMaePct: avg(b.maePctSum, n),
    avgGivebackPct: avg(b.givebackPctSum, n), avgPeakCapturedPct: avg(b.peakCapturedRatioSum, n, 4) * 100,
    positiveRate: rate(b.positive, n), nearPeakRate: rate(b.atOrNearPeak, n), newHighAfterRate: rate(b.newHighAfter, n),
    givebackAfterRate: rate(b.gaveBackAfter, n), finalBetterRate: rate(b.finalBetter, n), finalWorseRate: rate(b.finalWorse, n)
  };
}
function classify(profile) {
  const peak = profile.averagePeakMinute;
  if (!profile.ready) return 'VERI_BIRIKIYOR';
  if (peak <= 15) return 'HIZLI_DNA';
  if (peak <= 45) return 'ORTA_HIZLI_DNA';
  if (peak <= 90) return 'YAVAS_DNA';
  return 'UZUN_SOLUKLU_DNA';
}
function profileDna(dna, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const checkpoints = Object.values(dna.checkpoints || {}).map(checkpointModel).sort((a,b)=>a.minute-b.minute);
  const ready = num(dna.samples) >= minSample;
  const mature = checkpoints.filter(x => x.samples >= minSample);
  const opportunity = mature.slice().sort((a,b)=>b.avgPnlPct-a.avgPnlPct || b.positiveRate-a.positiveRate)[0] || null;
  const fatigue = mature.filter(x => x.givebackAfterRate >= 55 && x.newHighAfterRate <= 35).sort((a,b)=>a.minute-b.minute)[0] || null;
  const noNewHigh = mature.filter(x => x.newHighAfterRate <= 20).sort((a,b)=>a.minute-b.minute)[0] || null;
  const profile = {
    key: dna.key, label: dna.label, samples: num(dna.samples), pathQualifiedSamples: num(dna.pathQualifiedSamples), ready,
    confidence: !ready ? 'DUSUK' : dna.samples < 30 ? 'ORTA' : dna.samples < 100 ? 'YUKSEK' : 'COK_YUKSEK',
    averageDurationMinute: avg(dna.durationMinuteSum, dna.samples, 2),
    averagePeakMinute: avg(dna.peakMinuteSum, dna.peakMinuteSamples, 2),
    averageFirstPositiveMinute: avg(dna.firstPositiveMinuteSum, dna.firstPositiveSamples, 2),
    opportunityWindow: opportunity ? { minute: opportunity.minute, avgPnlPct: opportunity.avgPnlPct, positiveRate: opportunity.positiveRate } : null,
    fatigueStart: fatigue ? { minute: fatigue.minute, givebackAfterRate: fatigue.givebackAfterRate, newHighAfterRate: fatigue.newHighAfterRate } : null,
    diminishingReturnMinute: noNewHigh ? noNewHigh.minute : null,
    checkpoints
  };
  profile.character = classify(profile);
  return profile;
}
function buildModel(store, options = {}) {
  const out = ensureStore(store);
  const dna = Object.values(out.bySignature).map(x => profileDna(x, options)).sort((a,b)=>b.samples-a.samples);
  return {
    version: VERSION, createdAt: new Date().toISOString(), totalTrades: out.totalTrades,
    dataPolicy: 'Kapanmış işlemlerin kaydedilmiş fiyat yolundan DNA zaman davranışı çıkarılır; kör zaman çıkışı veya canlı emir kararı üretilmez.',
    readyDna: dna.filter(x=>x.ready).length, dna,
    fastestDna: dna.filter(x=>x.ready).sort((a,b)=>a.averagePeakMinute-b.averagePeakMinute).slice(0,10),
    longestDna: dna.filter(x=>x.ready).sort((a,b)=>b.averagePeakMinute-a.averagePeakMinute).slice(0,10)
  };
}
function rebuildFromRecords(records, minutes) {
  const store = emptyStore();
  for (const record of records || []) if (record?.input) addTrade(store, record.input, minutes);
  return store;
}

module.exports = { VERSION, normalizeMinutes, emptyStore, ensureStore, analyzeTrade, addTrade, buildModel, rebuildFromRecords };
