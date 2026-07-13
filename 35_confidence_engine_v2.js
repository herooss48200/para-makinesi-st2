/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 3
 * CONFIDENCE ENGINE v2
 *
 * Amaç:
 * - DNA Profit Ranking ve DNA Filter Simulator sonuçlarını açıklanabilir tek bir
 *   Meta Score + Confidence puanında birleştirmek.
 * - Güven puanını yalnızca win rate'e bağlamamak.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya filtre uygulamaz.
 * - Yalnızca kapanmış DNA istatistiklerini analiz eder.
 */

const VERSION = 'ER-A3-CONFIDENCE-ENGINE-v2';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, num(value)));
}

function round(value, digits = 2) {
  return Number(num(value).toFixed(digits));
}

function signed(value, digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function sampleReliability(total, target = 50) {
  const n = Math.max(0, num(total));
  return clamp(Math.sqrt(n / Math.max(1, num(target, 50))) * 100, 0, 100);
}

function expectancyComponent(expectancy, scale = 0.20) {
  return clamp(num(expectancy) / Math.max(0.01, num(scale, 0.20)), -1, 1) * 30;
}

function profitFactorComponent(pf) {
  const value = clamp(pf, 0, 3);
  if (value >= 1) return clamp((value - 1) / 1.5, 0, 1) * 20;
  return -clamp((1 - value), 0, 1) * 20;
}

function conservativeWinComponent(rate) {
  return clamp((num(rate) - 50) / 25, -1, 1) * 10;
}

function netComponent(net, scale = 10) {
  return Math.tanh(num(net) / Math.max(1, num(scale, 10))) * 10;
}

function stabilityComponent(row) {
  const total = Math.max(1, num(row?.total));
  const beRate = num(row?.be) / total;
  const avgWin = Math.max(0, num(row?.avgWin));
  const avgLoss = Math.max(0, num(row?.avgLoss));
  const payoff = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 2 : 0);
  const payoffScore = clamp((payoff - 1) / 1.5, -1, 1) * 7;
  const bePenalty = clamp(beRate / 0.20, 0, 1) * 3;
  return payoffScore - bePenalty;
}

function filterAgreementComponent(row, filterCandidateKeys) {
  const isCandidate = filterCandidateKeys.has(String(row?.key));
  if (num(row?.expectancy) < 0 && isCandidate) return -5;
  if (num(row?.expectancy) > 0 && !isCandidate) return 5;
  return 0;
}

function confidenceLevel(confidence, total, minSample = 10) {
  if (num(total) < num(minSample, 10)) return 'VERİ_BEKLENİYOR';
  if (confidence >= 85) return 'ÇOK_YÜKSEK';
  if (confidence >= 70) return 'YÜKSEK';
  if (confidence >= 50) return 'ORTA';
  return 'DÜŞÜK';
}

function recommendation(metaScore, confidence, total, minSample = 10) {
  if (num(total) < num(minSample, 10)) return 'DATA_WAIT';
  if (confidence < 45) return 'WATCH';
  if (metaScore >= 70) return 'ELITE';
  if (metaScore >= 58) return 'HIGH_PRIORITY';
  if (metaScore >= 52) return 'GOOD';
  if (metaScore <= 30) return 'AVOID_CANDIDATE';
  if (metaScore <= 42) return 'RISK';
  return 'WATCH';
}

function buildRow(row, context = {}) {
  const reliability = sampleReliability(row.total, context.targetSample);
  const parts = {
    expectancy: expectancyComponent(row.expectancy, context.expectancyScale),
    profitFactor: profitFactorComponent(row.profitFactor),
    conservativeWin: conservativeWinComponent(row.conservativeWinRate),
    net: netComponent(row.net, context.netScale),
    stability: stabilityComponent(row),
    filterAgreement: filterAgreementComponent(row, context.filterCandidateKeys)
  };

  const directionalRaw = Object.values(parts).reduce((sum, value) => sum + num(value), 0);
  const evidenceFactor = 0.35 + (reliability / 100) * 0.65;
  const metaScore = clamp(50 + directionalRaw * evidenceFactor, 0, 100);

  // Confidence = yönün ne kadar güçlü olduğundan çok, bu sonuca ne kadar güvenilebildiği.
  const edgeClarity = clamp(Math.abs(directionalRaw) / 45 * 100, 0, 100);
  const metricAgreement = (() => {
    const signs = [row.expectancy, num(row.profitFactor) - 1, row.net, num(row.conservativeWinRate) - 50]
      .map(v => Math.sign(num(v)))
      .filter(v => v !== 0);
    if (!signs.length) return 25;
    const positive = signs.filter(v => v > 0).length;
    const negative = signs.length - positive;
    return Math.max(positive, negative) / signs.length * 100;
  })();
  const confidence = clamp(reliability * 0.60 + metricAgreement * 0.25 + edgeClarity * 0.15, 0, 100);

  return {
    ...row,
    metaScore: round(metaScore, 1),
    confidenceV2: round(confidence, 1),
    confidenceLevelV2: confidenceLevel(confidence, row.total, context.minSample),
    recommendation: recommendation(metaScore, confidence, row.total, context.minSample),
    reliability: round(reliability, 1),
    metricAgreement: round(metricAgreement, 1),
    edgeClarity: round(edgeClarity, 1),
    breakdown: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, round(value, 2)])),
    unavailableMetrics: ['recentForm', 'drawdown', 'regimeStability']
  };
}

function build(rankingModel = {}, filterModel = {}, options = {}) {
  const minSample = Math.max(1, num(options.minSample, rankingModel.minSample || 10));
  const targetSample = Math.max(minSample, num(options.targetSample, 50));
  const filterCandidates = filterModel?.singleCandidates || filterModel?.candidates || [];
  const filterCandidateKeys = new Set(filterCandidates.map(item => String(item?.key || item?.dnaKey || '')));
  const rows = (rankingModel?.all || []).map(row => buildRow(row, {
    minSample,
    targetSample,
    expectancyScale: num(options.expectancyScale, 0.20),
    netScale: num(options.netScale, 10),
    filterCandidateKeys
  }));

  const ready = rows.filter(row => num(row.total) >= minSample);
  const strongest = ready.slice().sort((a, b) => b.metaScore - a.metaScore || b.confidenceV2 - a.confidenceV2).slice(0, num(options.limit, 10));
  const riskiest = ready.slice().sort((a, b) => a.metaScore - b.metaScore || b.confidenceV2 - a.confidenceV2).slice(0, num(options.limit, 10));

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ANALYSIS_ONLY',
    minSample,
    targetSample,
    totalDna: rows.length,
    readyDna: ready.length,
    strongest,
    riskiest,
    all: rows,
    note: 'Recent Form, Drawdown ve Market Regime verileri mevcut DNA özetinde bulunmadığı için puana sahte veri eklenmemiştir.'
  };
}

function shortKey(row, max = 28) {
  const key = String(row?.key || row?.label || 'DNA');
  return key.length > max ? `${key.slice(0, max)}…` : key;
}

function rowText(row, index) {
  return `${index + 1}. ${shortKey(row)} | Meta ${row.metaScore.toFixed(1)} | Güven ${row.confidenceV2.toFixed(1)} (${row.confidenceLevelV2})\n` +
    `   Exp ${signed(row.expectancy, 4)} | PF ${num(row.profitFactor).toFixed(2)} | Net ${signed(row.net, 2)} | ${row.recommendation}`;
}

function telegramText(model, options = {}) {
  const limit = Math.max(1, num(options.limit, 2));
  let text = `\n\n🧠 <b>CONFIDENCE ENGINE v2</b>\n`;
  text += `Meta Score: Expectancy + PF + güvenli Win + Net + istikrar + filtre uyumu\n`;
  text += `Hazır DNA: ${model.readyDna}/${model.totalDna} | Min örnek: ${model.minSample}\n`;

  const top = (model.strongest || []).slice(0, limit);
  const risk = (model.riskiest || []).slice(0, limit);
  text += `✅ <b>En Güçlü Güven</b>\n${top.length ? top.map(rowText).join('\n') : 'Yeterli veri yok.'}`;
  text += `\n🚫 <b>En Riskli Güven</b>\n${risk.length ? risk.map(rowText).join('\n') : 'Yeterli veri yok.'}`;
  text += `\nℹ️ Recent/Drawdown/Rejim verisi hazır olunca puana modüler olarak eklenecek. Otomatik filtre yok.`;
  return text;
}

module.exports = {
  VERSION,
  build,
  buildRow,
  telegramText,
  sampleReliability,
  recommendation
};
