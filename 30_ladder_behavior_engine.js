/**
 * AGROS v3.8.0 - DNA KADEME BEHAVIOR ENGINE
 *
 * Amaç:
 * - Her DNA'nın gerçek kademe yolunu öğrenir.
 * - Ulaşılan maksimum kademe, kademeler arası süre, kademe sonrası sonuç,
 *   geri dönüş ve güvenli kâr kademesi istatistiklerini üretir.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz; TP/SL/stop veya emir kararı üretmez.
 * - Yalnızca execution.kademeHistory içindeki gerçekleşmiş veriyi kullanır.
 * - Kademe geçmişi olmayan işlemler için tahmin üretmez.
 */

const VERSION = 'v3.8.0-LADDER-BEHAVIOR';

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, d = 4) { return Number(num(v).toFixed(d)); }
function rate(v, n) { return n ? round((num(v) / n) * 100, 1) : 0; }
function avg(v, n, d = 4) { return n ? round(num(v) / n, d) : 0; }
function signatureOf(input = {}) { return String(input.signatureShort || input.signatureKey || 'SIGNATURE_YOK'); }
function emptyStore() { return { version: VERSION, totalTrades: 0, qualifiedTrades: 0, bySignature: {} }; }
function ensureStore(store) {
  const out = store && typeof store === 'object' ? store : emptyStore();
  out.version = VERSION;
  if (!Number.isFinite(Number(out.totalTrades))) out.totalTrades = 0;
  if (!Number.isFinite(Number(out.qualifiedTrades))) out.qualifiedTrades = 0;
  if (!out.bySignature || typeof out.bySignature !== 'object') out.bySignature = {};
  return out;
}
function emptyDna(key, label) {
  return {
    key, label: label || key, samples: 0, qualifiedSamples: 0,
    maxStageSum: 0, maxStageSquaredSum: 0, stageChangeSum: 0,
    tp: 0, sl: 0, be: 0, positive: 0, negative: 0,
    levels: {}, transitions: {}
  };
}
function ensureLevel(dna, stage) {
  const key = String(stage);
  if (!dna.levels[key]) dna.levels[key] = {
    stage, reached: 0, tp: 0, sl: 0, be: 0, positive: 0, negative: 0,
    reachMinuteSum: 0, reachMinuteSamples: 0,
    finalGrossPctSum: 0, mfePctSum: 0, givebackPctSum: 0,
    returnedBelow: 0, advancedFurther: 0, closedAtStage: 0
  };
  return dna.levels[key];
}
function ensureTransition(dna, from, to) {
  const key = `${from}>${to}`;
  if (!dna.transitions[key]) dna.transitions[key] = { from, to, samples: 0, durationMinuteSum: 0 };
  return dna.transitions[key];
}
function parseTs(v) {
  if (Number.isFinite(Number(v))) return Number(v);
  const ts = Date.parse(v);
  return Number.isFinite(ts) ? ts : 0;
}
function normalizedHistory(input = {}) {
  const startTs = num(input.startTs);
  const raw = Array.isArray(input.kademeHistory) ? input.kademeHistory : [];
  const rows = raw.map(x => ({
    ts: parseTs(x?.ts || x?.zaman),
    stage: Math.max(0, Math.floor(num(x?.kademe))),
    pnlPct: num(x?.pnlPct, num(x?.karYuzde)),
    price: num(x?.price, num(x?.fiyat))
  })).filter(x => x.ts > 0 && Number.isFinite(x.stage)).sort((a,b)=>a.ts-b.ts);
  const dedup = [];
  for (const row of rows) {
    const last = dedup[dedup.length - 1];
    if (!last || last.stage !== row.stage) dedup.push(row);
  }
  if (startTs > 0 && (!dedup.length || dedup[0].ts > startTs) && (dedup[0]?.stage || 0) > 0) {
    dedup.unshift({ ts: startTs, stage: 0, pnlPct: 0, price: 0 });
  }
  return dedup;
}
function normalizedResult(input = {}) {
  const r = String(input.result || '').toUpperCase();
  if (r === 'TP' || r === 'SL' || r === 'BE') return r;
  const net = num(input.actualNetUsdt);
  if (net > 0.000001) return 'TP';
  if (net < -0.000001) return 'SL';
  return 'BE';
}
function analyzeTrade(input = {}) {
  const history = normalizedHistory(input);
  if (!history.length) return { qualified: false, reason: 'KADEME_HISTORY_YOK', history: [] };
  const startTs = num(input.startTs, history[0].ts);
  const result = normalizedResult(input);
  const maxStage = Math.max(0, ...history.map(x => x.stage), Math.floor(num(input.maxKademe)));
  const firstReached = new Map();
  for (const row of history) if (!firstReached.has(row.stage)) firstReached.set(row.stage, row);
  const transitions = [];
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1], b = history[i];
    if (b.stage <= a.stage) continue;
    transitions.push({ from: a.stage, to: b.stage, durationMinute: Math.max(0, (b.ts - a.ts) / 60000) });
  }
  const levels = [];
  const pathRows = (Array.isArray(input.pathRows) ? input.pathRows : []).map(x => ({ ts: num(x?.ts), pnlPct: num(x?.pnlPct) })).filter(x => x.ts > 0).sort((a,b)=>a.ts-b.ts);
  const ladderStepPct = Math.max(0.0001, num(input.ladderStepPct, 0.4));
  const finalGrossPct = num(input.actualGrossPct);
  const mfePct = Math.max(0, num(input.mfePct));
  for (let stage = 1; stage <= maxStage; stage++) {
    const hit = firstReached.get(stage) || history.find(x => x.stage >= stage);
    if (!hit) continue;
    const after = history.filter(x => x.ts > hit.ts);
    const pathAfter = pathRows.filter(x => x.ts > hit.ts);
    const stageThresholdPct = stage * ladderStepPct;
    const returnedBelow = after.some(x => x.stage < stage) || pathAfter.some(x => x.pnlPct < stageThresholdPct - 0.0001);
    const advancedFurther = after.some(x => x.stage > stage) || maxStage > stage;
    levels.push({
      stage, reachMinute: Math.max(0, (hit.ts - startTs) / 60000), result,
      finalGrossPct, mfePct, givebackPct: Math.max(0, mfePct - finalGrossPct),
      returnedBelow, advancedFurther, closedAtStage: maxStage === stage
    });
  }
  return { qualified: true, history, result, maxStage, stageChanges: transitions.length, transitions, levels };
}
function addTrade(store, input) {
  const out = ensureStore(store);
  const key = signatureOf(input);
  const dna = out.bySignature[key] || emptyDna(key, input.signatureLabel || key);
  const a = analyzeTrade(input);
  dna.samples += 1;
  out.totalTrades += 1;
  if (!a.qualified) { out.bySignature[key] = dna; return a; }
  dna.qualifiedSamples += 1;
  out.qualifiedTrades += 1;
  dna.maxStageSum += a.maxStage;
  dna.maxStageSquaredSum += a.maxStage * a.maxStage;
  dna.stageChangeSum += a.stageChanges;
  if (a.result === 'TP') dna.tp += 1; else if (a.result === 'SL') dna.sl += 1; else dna.be += 1;
  if (num(input.actualNetUsdt) > 0) dna.positive += 1;
  if (num(input.actualNetUsdt) < 0) dna.negative += 1;
  for (const row of a.levels) {
    const b = ensureLevel(dna, row.stage);
    b.reached += 1;
    b[row.result.toLowerCase()] += 1;
    if (num(input.actualNetUsdt) > 0) b.positive += 1;
    if (num(input.actualNetUsdt) < 0) b.negative += 1;
    b.reachMinuteSum += row.reachMinute; b.reachMinuteSamples += 1;
    b.finalGrossPctSum += row.finalGrossPct; b.mfePctSum += row.mfePct; b.givebackPctSum += row.givebackPct;
    if (row.returnedBelow) b.returnedBelow += 1;
    if (row.advancedFurther) b.advancedFurther += 1;
    if (row.closedAtStage) b.closedAtStage += 1;
  }
  for (const row of a.transitions) {
    const b = ensureTransition(dna, row.from, row.to);
    b.samples += 1; b.durationMinuteSum += row.durationMinute;
  }
  out.bySignature[key] = dna;
  return a;
}
function levelModel(b, qualifiedSamples) {
  const n = num(b.reached);
  return {
    stage: num(b.stage), reached: n, reachRate: rate(n, qualifiedSamples),
    tpRate: rate(b.tp, n), slRate: rate(b.sl, n), beRate: rate(b.be, n), positiveRate: rate(b.positive, n),
    averageReachMinute: avg(b.reachMinuteSum, b.reachMinuteSamples, 2),
    averageFinalGrossPct: avg(b.finalGrossPctSum, n), averageMfePct: avg(b.mfePctSum, n),
    averageGivebackPct: avg(b.givebackPctSum, n), returnBelowRate: rate(b.returnedBelow, n),
    advanceRate: rate(b.advancedFurther, n), closeAtStageRate: rate(b.closedAtStage, n)
  };
}
function transitionModel(b) {
  return { from: num(b.from), to: num(b.to), samples: num(b.samples), averageMinute: avg(b.durationMinuteSum, b.samples, 2) };
}
function classify(p) {
  if (!p.ready) return 'VERI_BIRIKIYOR';
  const safe = p.safestProfitStage;
  const avgMax = p.averageMaxStage;
  if (p.highestReliableStage <= 2 && avgMax <= 2.5) return 'ERKEN_SONEN';
  if (safe && safe.returnBelowRate >= 55) return 'KADEME_SONRASI_GERI_VEREN';
  if (p.averageStageChanges >= 5 && p.maxStageStdDev <= 2.5) return 'ISTIKRARLI_TIRMANAN';
  if (avgMax >= 8 && p.tpRate >= 55) return 'UZUN_KADEME_KOSUCUSU';
  if (p.maxStageStdDev >= 4) return 'DEGISKEN_KADEME_KARAKTERI';
  return 'DENGELI_KADEME_DNA';
}
function profileDna(dna, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const q = num(dna.qualifiedSamples);
  const levels = Object.values(dna.levels || {}).map(x => levelModel(x, q)).sort((a,b)=>a.stage-b.stage);
  const transitions = Object.values(dna.transitions || {}).map(transitionModel).sort((a,b)=>a.from-b.from||a.to-b.to);
  const reliable = levels.filter(x => x.reached >= minSample);
  const safeCandidates = reliable.filter(x => x.positiveRate >= 60 && x.returnBelowRate <= 45)
    .sort((a,b)=>b.stage-a.stage || b.positiveRate-a.positiveRate || a.returnBelowRate-b.returnBelowRate);
  const safestProfitStage = safeCandidates[0] || null;
  const avgMax = avg(dna.maxStageSum, q, 2);
  const variance = q ? Math.max(0, num(dna.maxStageSquaredSum)/q - avgMax*avgMax) : 0;
  const p = {
    key: dna.key, label: dna.label, samples: num(dna.samples), qualifiedSamples: q,
    minimumSample: minSample, ready: q >= minSample,
    confidence: q < minSample ? 'DUSUK' : q < 30 ? 'ORTA' : q < 100 ? 'YUKSEK' : 'COK_YUKSEK',
    coverageRate: rate(q, dna.samples), averageMaxStage: avgMax, maxStageStdDev: round(Math.sqrt(variance), 2),
    averageStageChanges: avg(dna.stageChangeSum, q, 2), tpRate: rate(dna.tp, q), slRate: rate(dna.sl, q), beRate: rate(dna.be, q),
    profitableRate: rate(dna.positive, q), highestReachedStage: levels.length ? levels[levels.length-1].stage : 0,
    highestReliableStage: reliable.length ? reliable[reliable.length-1].stage : 0,
    safestProfitStage, levels, transitions
  };
  p.character = classify(p);
  p.summary = !p.ready
    ? `Kademe davranışı için gerçek kademe yolu verisi birikiyor (${q}/${minSample}).`
    : `${p.character}; ortalama maksimum kademe ${p.averageMaxStage}, güvenli kâr kademesi ${safestProfitStage ? safestProfitStage.stage : 'belirsiz'}.`;
  return p;
}
function buildModel(store, options = {}) {
  const out = ensureStore(store);
  const dna = Object.values(out.bySignature).map(x => profileDna(x, options)).sort((a,b)=>b.qualifiedSamples-a.qualifiedSamples || b.samples-a.samples);
  return {
    version: VERSION, createdAt: new Date().toISOString(),
    dataPolicy: 'Yalnızca gerçekleşmiş kademeHistory kayıtları kullanılır; kademe tahmini ve canlı exit kararı üretilmez.',
    totalTrades: out.totalTrades, qualifiedTrades: out.qualifiedTrades, totalDna: dna.length,
    readyDna: dna.filter(x=>x.ready).length, dna,
    steadyClimbers: dna.filter(x=>x.ready&&x.character==='ISTIKRARLI_TIRMANAN').slice(0,20),
    givebackProne: dna.filter(x=>x.ready&&x.character==='KADEME_SONRASI_GERI_VEREN').slice(0,20),
    longRunners: dna.filter(x=>x.ready&&x.character==='UZUN_KADEME_KOSUCUSU').slice(0,20)
  };
}
function rebuildFromRecords(records) {
  const store = emptyStore();
  for (const record of records || []) if (record?.input) addTrade(store, record.input);
  return store;
}

module.exports = { VERSION, emptyStore, ensureStore, normalizedHistory, analyzeTrade, addTrade, buildModel, rebuildFromRecords, classify };
