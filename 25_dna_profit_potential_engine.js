/**
 * AGROS v3.6.6 - DNA PROFIT POTENTIAL ENGINE
 *
 * Amaç:
 * - Her DNA'nın geçmiş işlemlerinde ulaşılan MFE/MAE dağılımını öğrenir.
 * - Farklı sabit kâr hedeflerinin tarihsel gerçekleşme oranını ve net EV'sini ölçer.
 * - Güvenli çıkış bölgesi, optimum hedef ve kâr geri-verme davranışı üretir.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz/kapatmaz, TP/SL/stop değiştirmez.
 * - Yalnızca kapanmış işlem ve kaydedilmiş fiyat yolu verisini kullanır.
 */

const VERSION = 'v3.6.6-DNA-PROFIT-POTENTIAL';

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function clamp(v, min, max) { return Math.min(max, Math.max(min, num(v))); }
function percentile(values, p) {
  const xs = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = clamp(p, 0, 1) * (xs.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + ((xs[hi] - xs[lo]) * (pos - lo));
}
function defaultLevels() {
  return [0.20,0.30,0.40,0.50,0.60,0.80,1.00,1.20,1.50,1.80,2.00,2.50,3.00,4.00,5.00];
}
function normalizeLevels(levels) {
  const source = Array.isArray(levels) && levels.length ? levels : defaultLevels();
  return [...new Set(source.map(Number).filter(x => Number.isFinite(x) && x > 0).map(x => round(x, 4)))].sort((a, b) => a - b);
}
function signatureOf(input = {}) {
  return String(input.signatureShort || input.signatureKey || 'SIGNATURE_YOK');
}
function emptyStore() {
  return { version: VERSION, totalTrades: 0, bySignature: {} };
}
function ensureStore(store) {
  const out = store && typeof store === 'object' ? store : emptyStore();
  out.version = VERSION;
  if (!Number.isFinite(Number(out.totalTrades))) out.totalTrades = 0;
  if (!out.bySignature || typeof out.bySignature !== 'object') out.bySignature = {};
  return out;
}
function emptyDna(key, label) {
  return {
    key,
    label: label || key,
    samples: 0,
    mfeValues: [],
    maeValues: [],
    actualNetPctValues: [],
    actualNetUsdtValues: [],
    givebackValues: [],
    durationMinuteValues: [],
    targetStats: {}
  };
}
function ensureTarget(dna, level) {
  const key = String(level);
  if (!dna.targetStats[key]) dna.targetStats[key] = {
    level,
    samples: 0,
    reached: 0,
    missed: 0,
    netUsdt: 0,
    netPct: 0,
    actualNetUsdt: 0,
    deltaUsdt: 0,
    profitable: 0,
    losing: 0,
    grossProfitUsdt: 0,
    grossLossUsdt: 0
  };
  return dna.targetStats[key];
}
function estimateTargetResult(input, level) {
  const reached = num(input.mfePct) >= level;
  const grossPct = reached ? level : num(input.actualGrossPct);
  const valueUsdt = num(input.valueUsdt);
  const commissionUsdt = Math.max(0, num(input.commissionUsdt));
  const netUsdt = valueUsdt > 0 ? ((grossPct / 100) * valueUsdt) - commissionUsdt : num(input.actualNetUsdt);
  const netPct = valueUsdt > 0 ? (netUsdt / valueUsdt) * 100 : num(input.actualNetPct);
  return { reached, grossPct, netUsdt, netPct, deltaUsdt: netUsdt - num(input.actualNetUsdt) };
}
function addTrade(store, input, levels) {
  const out = ensureStore(store);
  const key = signatureOf(input);
  const dna = out.bySignature[key] || emptyDna(key, input.signatureLabel || key);
  for (const arrayKey of ['mfeValues','maeValues','actualNetPctValues','actualNetUsdtValues','givebackValues','durationMinuteValues']) {
    if (!Array.isArray(dna[arrayKey])) dna[arrayKey] = [];
  }
  if (!dna.targetStats || typeof dna.targetStats !== 'object') dna.targetStats = {};

  const mfe = Math.max(0, num(input.mfePct));
  const mae = Math.min(0, num(input.maePct));
  const actualNetPct = num(input.actualNetPct);
  const actualNetUsdt = num(input.actualNetUsdt);
  const giveback = Math.max(0, mfe - num(input.actualGrossPct));
  const durationMinute = Math.max(0, num(input.durationMs) / 60000);

  dna.samples += 1;
  dna.mfeValues.push(round(mfe, 6));
  dna.maeValues.push(round(mae, 6));
  dna.actualNetPctValues.push(round(actualNetPct, 6));
  dna.actualNetUsdtValues.push(round(actualNetUsdt, 6));
  dna.givebackValues.push(round(giveback, 6));
  dna.durationMinuteValues.push(round(durationMinute, 4));

  for (const level of normalizeLevels(levels)) {
    const result = estimateTargetResult(input, level);
    const t = ensureTarget(dna, level);
    t.samples += 1;
    if (result.reached) t.reached += 1; else t.missed += 1;
    t.netUsdt += result.netUsdt;
    t.netPct += result.netPct;
    t.actualNetUsdt += actualNetUsdt;
    t.deltaUsdt += result.deltaUsdt;
    if (result.netUsdt > 0.000001) { t.profitable += 1; t.grossProfitUsdt += result.netUsdt; }
    else if (result.netUsdt < -0.000001) { t.losing += 1; t.grossLossUsdt += Math.abs(result.netUsdt); }
  }

  out.totalTrades += 1;
  out.bySignature[key] = dna;
  return out;
}
function confidence(samples, minSample = 10) {
  if (samples < minSample) return 'DUSUK';
  if (samples < 30) return 'ORTA';
  if (samples < 100) return 'YUKSEK';
  return 'COK_YUKSEK';
}
function targetModel(t) {
  const samples = Math.max(0, num(t.samples));
  const decided = num(t.profitable) + num(t.losing);
  const loss = num(t.grossLossUsdt);
  return {
    level: num(t.level),
    samples,
    reached: num(t.reached),
    reachRate: samples ? round((num(t.reached) / samples) * 100, 1) : 0,
    avgNetUsdt: samples ? round(num(t.netUsdt) / samples, 6) : 0,
    avgNetPct: samples ? round(num(t.netPct) / samples, 4) : 0,
    totalNetUsdt: round(t.netUsdt, 4),
    totalDeltaUsdt: round(t.deltaUsdt, 4),
    avgDeltaUsdt: samples ? round(num(t.deltaUsdt) / samples, 6) : 0,
    winRate: decided ? round((num(t.profitable) / decided) * 100, 1) : 0,
    profitFactor: loss > 0 ? round(num(t.grossProfitUsdt) / loss, 2) : (num(t.grossProfitUsdt) > 0 ? 999 : 0)
  };
}
function profileDna(dna, options = {}) {
  const samples = num(dna.samples);
  const minSample = Math.max(1, num(options.minSample, 10));
  const safeReachRate = clamp(options.safeReachRate ?? 70, 1, 100);
  const strongReachRate = clamp(options.strongReachRate ?? 80, safeReachRate, 100);
  const curve = Object.values(dna.targetStats || {}).map(targetModel).sort((a, b) => a.level - b.level);
  const eligible = curve.filter(x => x.samples >= minSample);
  const optimal = eligible.slice().sort((a, b) => b.avgNetUsdt - a.avgNetUsdt || b.totalDeltaUsdt - a.totalDeltaUsdt || b.reachRate - a.reachRate)[0] || null;
  const safe = eligible.filter(x => x.reachRate >= safeReachRate);
  const strong = eligible.filter(x => x.reachRate >= strongReachRate);
  const safeLow = strong.length ? strong[strong.length - 1].level : (safe.length ? safe[safe.length - 1].level : null);
  const safeHigh = safe.length ? safe[safe.length - 1].level : null;
  const mfe = dna.mfeValues || [], mae = dna.maeValues || [], giveback = dna.givebackValues || [], duration = dna.durationMinuteValues || [];
  return {
    key: dna.key,
    label: dna.label,
    samples,
    confidence: confidence(samples, minSample),
    ready: samples >= minSample,
    mfe: {
      average: samples ? round(mfe.reduce((a, b) => a + num(b), 0) / samples, 4) : 0,
      median: round(percentile(mfe, 0.50), 4),
      p25: round(percentile(mfe, 0.25), 4),
      p75: round(percentile(mfe, 0.75), 4),
      p90: round(percentile(mfe, 0.90), 4)
    },
    mae: {
      average: samples ? round(mae.reduce((a, b) => a + num(b), 0) / samples, 4) : 0,
      median: round(percentile(mae, 0.50), 4),
      p10: round(percentile(mae, 0.10), 4)
    },
    averageGivebackPct: samples ? round(giveback.reduce((a, b) => a + num(b), 0) / samples, 4) : 0,
    averageDurationMinute: samples ? round(duration.reduce((a, b) => a + num(b), 0) / samples, 2) : 0,
    safeExitZone: safeLow !== null && safeHigh !== null ? { low: safeLow, high: safeHigh, minimumReachRate: safeReachRate } : null,
    optimalTarget: optimal,
    profitCurve: curve
  };
}
function buildModel(store, options = {}) {
  const out = ensureStore(store);
  const dna = Object.values(out.bySignature).map(x => profileDna(x, options)).sort((a, b) => b.samples - a.samples);
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    dataPolicy: 'Kapanmış işlemlerin kaydedilmiş MFE/MAE ve muhasebe verileriyle DNA bazlı sabit hedef EV analizi; Trade Engine kararını değiştirmez.',
    totalTrades: out.totalTrades,
    dna,
    readyDna: dna.filter(x => x.ready).length,
    topOptimalTargets: dna.filter(x => x.ready && x.optimalTarget).sort((a, b) => b.optimalTarget.avgNetUsdt - a.optimalTarget.avgNetUsdt).slice(0, 20)
  };
}
function rebuildFromRecords(records, levels) {
  const store = emptyStore();
  for (const record of records || []) if (record?.input) addTrade(store, record.input, levels);
  return store;
}

module.exports = {
  VERSION,
  defaultLevels,
  normalizeLevels,
  emptyStore,
  ensureStore,
  addTrade,
  buildModel,
  rebuildFromRecords,
  estimateTargetResult
};
