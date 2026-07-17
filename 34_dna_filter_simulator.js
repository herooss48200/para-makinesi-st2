/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 2
 * DNA FILTER SIMULATOR
 *
 * Amaç:
 * - Geçmiş kapanmış işlemler üzerinde "bu DNA açılmasaydı ne olurdu?" sorusunu cevaplamak.
 * - Tekli ve kümülatif filtre senaryolarında Net, Expectancy ve Profit Factor değişimini ölçmek.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz ve gerçek filtre uygulamaz.
 * - Emir açmaz, kapatmaz veya yön değiştirmez.
 * - Yalnızca BlackBox signatureMatrixStats verilerini okur.
 */

const VERSION = 'ER-A2-DNA-FILTER-SIMULATOR-v1.1-TOP10-ALIGNMENT';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 4) {
  return Number(num(value).toFixed(digits));
}

function signed(value, digits = 3) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function safePf(grossProfit, grossLoss) {
  const gp = Math.max(0, num(grossProfit));
  const gl = Math.max(0, num(grossLoss));
  if (gl > 0) return gp / gl;
  return gp > 0 ? 99 : 0;
}

function normalizeBucket(bucket = {}, key = '') {
  const tp = Math.max(0, num(bucket.tp));
  const sl = Math.max(0, num(bucket.sl));
  const be = Math.max(0, num(bucket.be));
  const total = Math.max(tp + sl + be, num(bucket.toplam));
  const grossProfit = Math.max(0, num(bucket.karToplam));
  const grossLoss = Math.max(0, num(bucket.zararToplam));
  const net = num(bucket.net);
  return {
    key: String(bucket.key || key || 'DNA_YOK'),
    label: String(bucket.etiket || bucket.label || bucket.key || key || 'DNA_YOK'),
    total,
    tp,
    sl,
    be,
    grossProfit,
    grossLoss,
    net,
    expectancy: total > 0 ? net / total : 0,
    profitFactor: safePf(grossProfit, grossLoss)
  };
}

function aggregate(rows = []) {
  const result = rows.reduce((acc, row) => {
    acc.total += num(row.total);
    acc.tp += num(row.tp);
    acc.sl += num(row.sl);
    acc.be += num(row.be);
    acc.grossProfit += num(row.grossProfit);
    acc.grossLoss += num(row.grossLoss);
    acc.net += num(row.net);
    return acc;
  }, { total: 0, tp: 0, sl: 0, be: 0, grossProfit: 0, grossLoss: 0, net: 0 });

  result.expectancy = result.total > 0 ? result.net / result.total : 0;
  result.profitFactor = safePf(result.grossProfit, result.grossLoss);
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, typeof v === 'number' ? round(v, 6) : v]));
}

function scenarioFromRemoved(baseline, removedRows = []) {
  const removed = aggregate(removedRows);
  const kept = {
    total: Math.max(0, num(baseline.total) - num(removed.total)),
    tp: Math.max(0, num(baseline.tp) - num(removed.tp)),
    sl: Math.max(0, num(baseline.sl) - num(removed.sl)),
    be: Math.max(0, num(baseline.be) - num(removed.be)),
    grossProfit: Math.max(0, num(baseline.grossProfit) - num(removed.grossProfit)),
    grossLoss: Math.max(0, num(baseline.grossLoss) - num(removed.grossLoss)),
    net: num(baseline.net) - num(removed.net)
  };
  kept.expectancy = kept.total > 0 ? kept.net / kept.total : 0;
  kept.profitFactor = safePf(kept.grossProfit, kept.grossLoss);

  return {
    removedTrades: removed.total,
    removedDna: removedRows.length,
    avoidedNet: round(-removed.net, 6),
    missedGrossProfit: round(removed.grossProfit, 6),
    avoidedGrossLoss: round(removed.grossLoss, 6),
    kept: Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, round(v, 6)])),
    netDelta: round(kept.net - baseline.net, 6),
    expectancyDelta: round(kept.expectancy - baseline.expectancy, 6),
    profitFactorDelta: round(kept.profitFactor - baseline.profitFactor, 6),
    tradeReductionPct: baseline.total > 0 ? round((removed.total / baseline.total) * 100, 2) : 0
  };
}

function candidateScore(row) {
  const lossStrength = Math.max(0, -num(row.net));
  const expectancyStrength = Math.max(0, -num(row.expectancy)) * Math.sqrt(Math.max(1, row.total));
  const pfPenalty = Math.max(0, 1 - Math.min(1, num(row.profitFactor))) * 2;
  return lossStrength + expectancyStrength + pfPenalty;
}

function simulate(stats = {}, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const maxCandidates = Math.max(1, num(options.maxCandidates, 10));
  const maxCumulative = Math.max(1, num(options.maxCumulative, 10));
  const maxPf = Math.max(0, num(options.maxPf, 0.95));
  const maxExpectancy = num(options.maxExpectancy, 0);

  const rows = Object.entries(stats || {})
    .map(([key, bucket]) => normalizeBucket(bucket, key))
    .filter(row => row.total > 0);
  const baseline = aggregate(rows);

  const candidates = rows
    .filter(row => row.total >= minSample)
    .filter(row => row.net < 0 && row.expectancy < maxExpectancy && row.profitFactor <= maxPf)
    .map(row => ({ ...row, candidateScore: round(candidateScore(row), 4) }))
    .sort((a, b) => b.candidateScore - a.candidateScore || a.net - b.net || a.expectancy - b.expectancy)
    .slice(0, maxCandidates);

  const single = candidates.map(row => ({
    key: row.key,
    label: row.label,
    total: row.total,
    net: round(row.net, 6),
    expectancy: round(row.expectancy, 6),
    profitFactor: round(row.profitFactor, 3),
    ...scenarioFromRemoved(baseline, [row])
  })).sort((a, b) => b.netDelta - a.netDelta || b.expectancyDelta - a.expectancyDelta);

  const cumulativeRows = candidates.slice(0, maxCumulative);
  const cumulative = scenarioFromRemoved(baseline, cumulativeRows);
  cumulative.keys = cumulativeRows.map(row => row.key);

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    minSample,
    totalDna: rows.length,
    candidateDna: candidates.length,
    baseline,
    candidates,
    single,
    cumulative,
    disclaimer: 'Bu bölüm geçmiş veri simülasyonudur; aktif Dinamik En Kötü 10 gölge kuralı ayrı çalışır.'
  };
}

function shortKey(value, max = 28) {
  const text = String(value || 'DNA');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function telegramText(model, options = {}) {
  const limit = Math.max(1, num(options.limit, 3));
  let text = `\n\n🧪 <b>DNA FILTER SIMULATOR</b>\n`;
  text += `Baz: ${model.baseline.total} işlem | Net ${signed(model.baseline.net, 2)} | Exp ${signed(model.baseline.expectancy, 4)} | PF ${model.baseline.profitFactor.toFixed(2)}\n`;

  const best = model.single.slice(0, limit);
  if (!best.length) {
    text += `✅ Güvenilir negatif filtre adayı henüz yok. Min örnek: ${model.minSample}`;
    return text;
  }

  text += `🚫 <b>Tekli filtre adayları</b>\n`;
  text += best.map((row, i) =>
    `${i + 1}. ${shortKey(row.key)} | N:${row.total} | DNA Net ${signed(row.net, 2)} | Filtre Net Δ ${signed(row.netDelta, 2)} | Exp Δ ${signed(row.expectancyDelta, 4)}`
  ).join('\n');

  const c = model.cumulative;
  text += `\n🧮 İlk ${c.removedDna} aday çıkarılırsa: Net ${signed(c.kept.net, 2)} (${signed(c.netDelta, 2)}) | Exp ${signed(c.kept.expectancy, 4)} (${signed(c.expectancyDelta, 4)}) | PF ${c.kept.profitFactor.toFixed(2)} | İşlem -%${c.tradeReductionPct.toFixed(1)}`;
  text += `\n⚠️ Bu bölüm geçmiş veri simülasyonudur; aktif Dinamik En Kötü 10 gölge kuralı ayrı çalışır.`;
  return text;
}

module.exports = {
  VERSION,
  normalizeBucket,
  aggregate,
  scenarioFromRemoved,
  simulate,
  telegramText,
  safePf
};
