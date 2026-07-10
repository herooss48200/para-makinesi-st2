/**
 * AGROS v3.7.0 - DNA VOLATILITY BEHAVIOR ENGINE
 *
 * Kaydedilmiş fiyat/PnL yolu üzerinden her DNA'nın gerçekleşen oynaklık,
 * genişleme, sıkışma, yön değişimi ve kâr geri-verme davranışını öğrenir.
 * ATR veya OHLC serisi yoksa sahte gösterge üretmez.
 * Trade Engine kararını değiştirmez.
 */
const VERSION = 'v3.7.0-VOLATILITY-BEHAVIOR';

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, d = 4) { return Number(num(v).toFixed(d)); }
function avg(values) { const xs = values.map(Number).filter(Number.isFinite); return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
function rate(v, n) { return n ? round((num(v) / n) * 100, 1) : 0; }
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
    pointSum: 0, avgAbsStepSum: 0, rmsStepSum: 0, maxAbsStepSum: 0,
    earlyVolSum: 0, middleVolSum: 0, lateVolSum: 0,
    expansionRatioSum: 0, compressionRatioSum: 0,
    directionChangeRateSum: 0, pathEfficiencySum: 0,
    peakVolMinuteSum: 0, peakVolMinuteSamples: 0,
    givebackPctSum: 0, mfePctSum: 0,
    profitableTrades: 0, expansionTrades: 0, compressionThenExpansionTrades: 0,
    noisyTrades: 0, fragileTrades: 0
  };
}
function normalizedPath(input = {}) {
  return (Array.isArray(input.pathRows) ? input.pathRows : [])
    .map(x => ({ ts: num(x?.ts), pnlPct: num(x?.pnlPct) }))
    .filter(x => x.ts > 0 && Number.isFinite(x.pnlPct))
    .sort((a,b)=>a.ts-b.ts);
}
function segmentAverage(values, start, end) {
  const part = values.slice(start, end);
  return part.length ? avg(part) : 0;
}
function analyzeTrade(input = {}) {
  const path = normalizedPath(input);
  const startTs = num(input.startTs, path[0]?.ts);
  if (path.length < 3 || !startTs) return { qualified: false, points: path.length };

  const steps = [];
  for (let i = 1; i < path.length; i++) {
    const delta = path[i].pnlPct - path[i - 1].pnlPct;
    steps.push({ ts: path[i].ts, delta, abs: Math.abs(delta) });
  }
  if (steps.length < 2) return { qualified: false, points: path.length };

  const absSteps = steps.map(x => x.abs);
  const third = Math.max(1, Math.floor(absSteps.length / 3));
  const earlyVol = segmentAverage(absSteps, 0, third);
  const middleVol = segmentAverage(absSteps, third, Math.min(absSteps.length, third * 2));
  const lateVol = segmentAverage(absSteps, Math.min(absSteps.length, third * 2), absSteps.length);
  const avgAbsStep = avg(absSteps);
  const rmsStep = Math.sqrt(avg(steps.map(x => x.delta * x.delta)));
  const peakStep = steps.slice().sort((a,b)=>b.abs-a.abs)[0];
  const maxAbsStep = peakStep?.abs || 0;
  const peakVolMinute = peakStep ? Math.max(0, (peakStep.ts - startTs) / 60000) : null;

  const nonZeroSigns = steps.map(x => Math.sign(x.delta)).filter(Boolean);
  let changes = 0;
  for (let i = 1; i < nonZeroSigns.length; i++) if (nonZeroSigns[i] !== nonZeroSigns[i - 1]) changes++;
  const directionChangeRate = nonZeroSigns.length > 1 ? changes / (nonZeroSigns.length - 1) : 0;
  const totalTravel = absSteps.reduce((a,b)=>a+b,0);
  const finalGross = num(input.actualGrossPct, path[path.length - 1]?.pnlPct);
  const pathEfficiency = totalTravel > 0 ? Math.min(1, Math.abs(finalGross) / totalTravel) : 0;
  const mfePct = Math.max(0, num(input.mfePct, Math.max(...path.map(x=>x.pnlPct))));
  const givebackPct = Math.max(0, mfePct - finalGross);
  const expansionRatio = earlyVol > 0 ? lateVol / earlyVol : (lateVol > 0 ? 9.99 : 1);
  const compressionRatio = earlyVol > 0 ? middleVol / earlyVol : 1;
  const expansion = expansionRatio >= 1.35;
  const compressionThenExpansion = compressionRatio <= 0.75 && lateVol >= Math.max(0.0001, middleVol * 1.50);
  const noisy = directionChangeRate >= 0.55 || pathEfficiency <= 0.18;
  const fragile = mfePct > 0 && givebackPct / mfePct >= 0.50 && expansionRatio >= 1.10;

  return {
    qualified: true, points: path.length, avgAbsStep, rmsStep, maxAbsStep,
    earlyVol, middleVol, lateVol, expansionRatio, compressionRatio,
    directionChangeRate, pathEfficiency, peakVolMinute, givebackPct, mfePct,
    profitable: num(input.actualNetUsdt) > 0, expansion, compressionThenExpansion, noisy, fragile
  };
}
function addTrade(store, input) {
  const out = ensureStore(store);
  const key = signatureOf(input);
  const dna = out.bySignature[key] || emptyDna(key, input.signatureLabel || key);
  const a = analyzeTrade(input);
  dna.samples += 1;
  out.totalTrades += 1;
  if (a.qualified) {
    dna.pathQualifiedSamples += 1; dna.pointSum += a.points;
    dna.avgAbsStepSum += a.avgAbsStep; dna.rmsStepSum += a.rmsStep; dna.maxAbsStepSum += a.maxAbsStep;
    dna.earlyVolSum += a.earlyVol; dna.middleVolSum += a.middleVol; dna.lateVolSum += a.lateVol;
    dna.expansionRatioSum += a.expansionRatio; dna.compressionRatioSum += a.compressionRatio;
    dna.directionChangeRateSum += a.directionChangeRate; dna.pathEfficiencySum += a.pathEfficiency;
    if (Number.isFinite(a.peakVolMinute)) { dna.peakVolMinuteSum += a.peakVolMinute; dna.peakVolMinuteSamples += 1; }
    dna.givebackPctSum += a.givebackPct; dna.mfePctSum += a.mfePct;
    if (a.profitable) dna.profitableTrades += 1;
    if (a.expansion) dna.expansionTrades += 1;
    if (a.compressionThenExpansion) dna.compressionThenExpansionTrades += 1;
    if (a.noisy) dna.noisyTrades += 1;
    if (a.fragile) dna.fragileTrades += 1;
  }
  out.bySignature[key] = dna;
  return a;
}
function confidence(samples, minSample) {
  if (samples < minSample) return 'DUSUK';
  if (samples < 30) return 'ORTA';
  if (samples < 100) return 'YUKSEK';
  return 'COK_YUKSEK';
}
function character(x) {
  if (!x.ready) return 'VERI_BIRIKIYOR';
  if (x.noisyRate >= 55 || x.averagePathEfficiencyPct <= 18) return 'CHAOTIC_NOISY';
  if (x.fragileRate >= 45 || (x.averageGivebackPct >= Math.max(0.35, x.averageMfePct * 0.50) && x.averageExpansionRatio >= 1.10)) return 'HIGH_VOL_FRAGILE';
  if (x.compressionThenExpansionRate >= 45 && x.profitableRate >= 55) return 'VOL_COMPRESSION_BREAKOUT';
  if (x.expansionRate >= 55 && x.profitableRate >= 55) return 'VOL_EXPANSION_RUNNER';
  if (x.averageAbsStepPct >= 0.10 && x.profitableRate >= 60) return 'HIGH_VOL_WINNER';
  if (x.averageAbsStepPct <= 0.08 && x.averageDirectionChangeRatePct <= 35 && x.averagePathEfficiencyPct >= 35) return 'LOW_VOL_STEADY';
  return 'STABLE_MIXED';
}
function profileDna(dna, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const samples = num(dna.samples), qualified = num(dna.pathQualifiedSamples);
  const x = {
    key: dna.key, label: dna.label, samples, pathQualifiedSamples: qualified,
    minimumSample: minSample, ready: qualified >= minSample,
    confidence: confidence(qualified, minSample), coverageRate: rate(qualified, samples),
    averagePathPoints: qualified ? round(num(dna.pointSum) / qualified, 1) : 0,
    averageAbsStepPct: qualified ? round(num(dna.avgAbsStepSum) / qualified, 5) : 0,
    realizedVolatilityPct: qualified ? round(num(dna.rmsStepSum) / qualified, 5) : 0,
    averageMaxStepPct: qualified ? round(num(dna.maxAbsStepSum) / qualified, 5) : 0,
    averageEarlyVolPct: qualified ? round(num(dna.earlyVolSum) / qualified, 5) : 0,
    averageMiddleVolPct: qualified ? round(num(dna.middleVolSum) / qualified, 5) : 0,
    averageLateVolPct: qualified ? round(num(dna.lateVolSum) / qualified, 5) : 0,
    averageExpansionRatio: qualified ? round(num(dna.expansionRatioSum) / qualified, 2) : 0,
    averageCompressionRatio: qualified ? round(num(dna.compressionRatioSum) / qualified, 2) : 0,
    averageDirectionChangeRatePct: qualified ? rate(num(dna.directionChangeRateSum), qualified) : 0,
    averagePathEfficiencyPct: qualified ? rate(num(dna.pathEfficiencySum), qualified) : 0,
    averagePeakVolMinute: num(dna.peakVolMinuteSamples) ? round(num(dna.peakVolMinuteSum) / num(dna.peakVolMinuteSamples), 1) : null,
    averageGivebackPct: qualified ? round(num(dna.givebackPctSum) / qualified, 4) : 0,
    averageMfePct: qualified ? round(num(dna.mfePctSum) / qualified, 4) : 0,
    profitableRate: rate(dna.profitableTrades, qualified), expansionRate: rate(dna.expansionTrades, qualified),
    compressionThenExpansionRate: rate(dna.compressionThenExpansionTrades, qualified),
    noisyRate: rate(dna.noisyTrades, qualified), fragileRate: rate(dna.fragileTrades, qualified)
  };
  x.character = character(x);
  x.summary = !x.ready
    ? `Volatilite davranışı için fiyat yolu verisi birikiyor (${qualified}/${minSample}).`
    : `${x.character}; genişleme %${x.expansionRate}, gürültü %${x.noisyRate}, yol verimliliği %${x.averagePathEfficiencyPct}.`;
  return x;
}
function buildModel(store, options = {}) {
  const out = ensureStore(store);
  const dna = Object.values(out.bySignature).map(x => profileDna(x, options)).sort((a,b)=>b.pathQualifiedSamples-a.pathQualifiedSamples || b.samples-a.samples);
  return {
    version: VERSION, createdAt: new Date().toISOString(),
    dataPolicy: 'Kaydedilmiş PnL/fiyat yolu adımlarından gerçekleşen oynaklık ölçülür; ATR/OHLC yoksa gösterge tahmin edilmez ve canlı emir kararı verilmez.',
    totalTrades: out.totalTrades, totalDna: dna.length, readyDna: dna.filter(x=>x.ready).length, dna,
    expansionRunners: dna.filter(x=>x.ready&&x.character==='VOL_EXPANSION_RUNNER').slice(0,20),
    fragile: dna.filter(x=>x.ready&&x.character==='HIGH_VOL_FRAGILE').slice(0,20),
    noisy: dna.filter(x=>x.ready&&x.character==='CHAOTIC_NOISY').slice(0,20)
  };
}
function rebuildFromRecords(records) {
  const store = emptyStore();
  for (const record of records || []) if (record?.input) addTrade(store, record.input);
  return store;
}
module.exports = { VERSION, emptyStore, ensureStore, analyzeTrade, addTrade, buildModel, rebuildFromRecords, character };
