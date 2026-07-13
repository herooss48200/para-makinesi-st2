/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 1
 * DNA PROFIT RANKING ENGINE
 *
 * Amaç:
 * - BlackBox 256 DNA istatistiklerini para kazanma kalitesine göre sıralamak.
 * - Win rate yerine merkez metrik olarak net expectancy ve Profit Factor kullanmak.
 * - Az örnekli DNA'ların yanıltıcı biçimde zirveye çıkmasını güven katsayısıyla engellemek.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya filtre uygulamaz.
 * - Yalnızca mevcut kapanmış işlem istatistiklerini okur.
 */

const VERSION = 'ER-A1-DNA-PROFIT-RANKING-v1';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, num(value)));
}

function signed(value, digits = 3) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function profitFactor(bucket) {
  const grossProfit = Math.max(0, num(bucket?.karToplam));
  const grossLoss = Math.max(0, num(bucket?.zararToplam));
  if (grossLoss > 0) return grossProfit / grossLoss;
  return grossProfit > 0 ? 99 : 0;
}

function wilsonLowerBound(wins, losses, z = 1.281551565545) {
  const n = Math.max(0, num(wins) + num(losses));
  if (!n) return 0;
  const p = num(wins) / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

function confidenceScore(samples, targetSamples = 50) {
  const n = Math.max(0, num(samples));
  return clamp(Math.sqrt(n / Math.max(1, targetSamples)), 0, 1);
}

function confidenceLabel(score) {
  if (score >= 0.90) return 'ÇOK YÜKSEK';
  if (score >= 0.70) return 'YÜKSEK';
  if (score >= 0.45) return 'ORTA';
  return 'DÜŞÜK';
}

function normalizeBucket(bucket = {}, key = '') {
  const tp = Math.max(0, num(bucket.tp));
  const sl = Math.max(0, num(bucket.sl));
  const be = Math.max(0, num(bucket.be));
  const total = Math.max(tp + sl + be, num(bucket.toplam));
  const decided = tp + sl;
  const net = num(bucket.net);
  const grossProfit = Math.max(0, num(bucket.karToplam));
  const grossLoss = Math.max(0, num(bucket.zararToplam));
  const expectancy = total > 0 ? net / total : 0;
  const avgWin = tp > 0 ? grossProfit / tp : 0;
  const avgLoss = sl > 0 ? grossLoss / sl : 0;
  const winRate = decided > 0 ? (tp / decided) * 100 : 0;
  const pf = profitFactor(bucket);
  const confidence = confidenceScore(total);
  const conservativeWinRate = wilsonLowerBound(tp, sl) * 100;

  return {
    key: String(bucket.key || key || 'DNA_YOK'),
    label: String(bucket.etiket || bucket.label || bucket.key || key || 'DNA_YOK'),
    total,
    tp,
    sl,
    be,
    decided,
    winRate: round(winRate, 2),
    conservativeWinRate: round(conservativeWinRate, 2),
    net: round(net, 6),
    grossProfit: round(grossProfit, 6),
    grossLoss: round(grossLoss, 6),
    avgWin: round(avgWin, 6),
    avgLoss: round(avgLoss, 6),
    profitFactor: round(pf, 3),
    expectancy: round(expectancy, 6),
    confidenceScore: round(confidence * 100, 1),
    confidence: confidenceLabel(confidence)
  };
}

function rankingScore(model, options = {}) {
  const expectancyScale = Math.max(0.01, num(options.expectancyScale, 0.20));
  const cappedPf = clamp(model.profitFactor, 0, 3);
  const expectancyPart = clamp(model.expectancy / expectancyScale, -2, 2) * 45;
  const pfPart = ((cappedPf - 1) / 2) * 25;
  const winPart = ((model.conservativeWinRate - 50) / 50) * 15;
  const netPart = Math.tanh(model.net / Math.max(1, num(options.netScale, 10))) * 15;
  const raw = expectancyPart + pfPart + winPart + netPart;
  return round(raw * (model.confidenceScore / 100), 2);
}

function verdict(model, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  if (model.total < minSample) return 'VERİ_BEKLENİYOR';
  if (model.expectancy > 0 && model.profitFactor >= 1.30 && model.net > 0) return 'GÜÇLÜ_POZİTİF';
  if (model.expectancy > 0 && model.profitFactor > 1 && model.net > 0) return 'POZİTİF';
  if (model.expectancy < 0 && model.profitFactor <= 0.80 && model.net < 0) return 'GÜÇLÜ_NEGATİF';
  if (model.expectancy < 0 && model.profitFactor < 1 && model.net < 0) return 'NEGATİF';
  return 'NÖTR_İZLE';
}

function rank(stats = {}, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 3));
  const rows = Object.entries(stats || {})
    .map(([key, bucket]) => {
      const model = normalizeBucket(bucket, key);
      model.score = rankingScore(model, options);
      model.verdict = verdict(model, options);
      model.ready = model.total >= minSample;
      return model;
    });

  const eligible = rows.filter(row => row.ready);
  const positive = eligible
    .filter(row => row.expectancy > 0 && row.net > 0)
    .sort((a, b) => b.score - a.score || b.expectancy - a.expectancy || b.total - a.total);
  const negative = eligible
    .filter(row => row.expectancy < 0 && row.net < 0)
    .sort((a, b) => a.score - b.score || a.expectancy - b.expectancy || b.total - a.total);
  const all = eligible.slice().sort((a, b) => b.score - a.score || b.expectancy - a.expectancy || b.total - a.total);

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    minSample,
    totalDna: rows.length,
    eligibleDna: eligible.length,
    positiveDna: positive.length,
    negativeDna: negative.length,
    all,
    positive,
    negative
  };
}

function shortKey(row, max = 30) {
  const value = String(row?.key || row?.label || 'DNA');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function rowText(row, index) {
  return `${index + 1}. ${shortKey(row)} | N:${row.total} | Exp ${signed(row.expectancy, 4)} | PF ${row.profitFactor.toFixed(2)} | Net ${signed(row.net, 2)} | Güven ${row.confidence}`;
}

function telegramText(model, options = {}) {
  const limit = Math.max(1, num(options.limit, 3));
  let text = `\n\n🧬 <b>DNA PROFIT RANKING</b>\n`;
  text += `Merkez: Expectancy | Yeterli DNA: ${model.eligibleDna}/${model.totalDna} | Min örnek: ${model.minSample}\n`;

  const top = model.positive.slice(0, limit);
  const risk = model.negative.slice(0, limit);

  text += `🏆 <b>Pozitif DNA</b>\n`;
  text += top.length ? top.map(rowText).join('\n') : 'Pozitif ve yeterli örnekli DNA henüz yok.';
  text += `\n☠️ <b>Negatif DNA</b>\n`;
  text += risk.length ? risk.map(rowText).join('\n') : 'Negatif ve yeterli örnekli DNA henüz yok.';
  return text;
}

module.exports = {
  VERSION,
  normalizeBucket,
  rankingScore,
  verdict,
  rank,
  telegramText,
  profitFactor,
  wilsonLowerBound,
  confidenceScore
};
