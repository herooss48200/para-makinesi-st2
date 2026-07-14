/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 5
 * DIRECTION INTELLIGENCE LAB
 *
 * Amaç:
 * - Aynı BTC/Coin DNA koşulunun LONG ve SHORT sonuçlarını birebir karşılaştırmak.
 * - Yön üstünlüğünü win rate yerine expectancy, PF, net ve örnek güveniyle ölçmek.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya otomatik filtre uygulamaz.
 * - Yalnızca kapanmış BlackBox DNA istatistiklerini analiz eder.
 */

const dnaRanking = require('./33_dna_profit_ranking_engine.js');
const heatMap = require('./36_dna_heat_map.js');

const VERSION = 'ER-A5-DIRECTION-INTELLIGENCE-LAB-v1';

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

function dnaIdentity(row = {}) {
  const candidates = [row.label, row.etiket, row.signature, row.key, row.rawObjectKey];
  for (const candidate of candidates) {
    const parsed = heatMap.parseDnaKey(candidate);
    if (parsed) {
      return {
        direction: parsed.direction,
        btcBits: parsed.btcBits,
        coinBits: parsed.coinBits,
        pairKey: `BTC=${parsed.btcBits}|COIN=${parsed.coinBits}`,
        sourceText: String(candidate)
      };
    }
  }
  return null;
}

function normalizeRows(stats = {}) {
  const rows = [];
  const unmapped = [];
  for (const [key, bucket] of Object.entries(stats || {})) {
    const row = dnaRanking.normalizeBucket(bucket, key);
    row.etiket = String(bucket?.etiket || '');
    row.signature = String(bucket?.signature || '');
    row.rawObjectKey = String(key || '');
    const identity = dnaIdentity(row);
    if (!identity) {
      if (row.total > 0) unmapped.push(String(row.label || row.key || key));
      continue;
    }
    rows.push({ ...row, ...identity });
  }
  return { rows, unmapped: [...new Set(unmapped)] };
}

function aggregate(rows = []) {
  const total = rows.reduce((sum, row) => sum + num(row.total), 0);
  const tp = rows.reduce((sum, row) => sum + num(row.tp), 0);
  const sl = rows.reduce((sum, row) => sum + num(row.sl), 0);
  const be = rows.reduce((sum, row) => sum + num(row.be), 0);
  const net = rows.reduce((sum, row) => sum + num(row.net), 0);
  const grossProfit = rows.reduce((sum, row) => sum + num(row.grossProfit), 0);
  const grossLoss = rows.reduce((sum, row) => sum + num(row.grossLoss), 0);
  const decided = tp + sl;
  return {
    total,
    tp,
    sl,
    be,
    net: round(net, 6),
    expectancy: round(total > 0 ? net / total : 0, 6),
    winRate: round(decided > 0 ? (tp / decided) * 100 : 0, 2),
    profitFactor: round(grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0), 3)
  };
}

function edgeScore(longRow, shortRow, targetSample = 50) {
  const expDiff = num(longRow.expectancy) - num(shortRow.expectancy);
  const pfDiff = clamp(num(longRow.profitFactor), 0, 3) - clamp(num(shortRow.profitFactor), 0, 3);
  const winDiff = num(longRow.conservativeWinRate) - num(shortRow.conservativeWinRate);
  const netPerSampleDiff = (num(longRow.net) / Math.max(1, num(longRow.total))) - (num(shortRow.net) / Math.max(1, num(shortRow.total)));
  const minSamples = Math.min(num(longRow.total), num(shortRow.total));
  const reliability = clamp(Math.sqrt(minSamples / Math.max(1, targetSample)), 0, 1);
  const raw = clamp(expDiff / 0.20, -2, 2) * 45 + clamp(pfDiff / 1.5, -1, 1) * 25 + clamp(winDiff / 25, -1, 1) * 15 + clamp(netPerSampleDiff / 0.20, -1, 1) * 15;
  return {
    score: round(raw * reliability, 2),
    reliability: round(reliability * 100, 1),
    expectancyDiff: round(expDiff, 6),
    profitFactorDiff: round(pfDiff, 3),
    conservativeWinDiff: round(winDiff, 2),
    netPerSampleDiff: round(netPerSampleDiff, 6)
  };
}

function verdict(pair, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const strongEdge = Math.max(1, num(options.strongEdge, 20));
  if (!pair.long || !pair.short) return 'TEK_YON_VERI';
  if (pair.long.total < minSample || pair.short.total < minSample) return 'VERI_BEKLENIYOR';
  if (pair.edge.score >= strongEdge && pair.long.expectancy > 0) return 'LONG_GUCLU';
  if (pair.edge.score <= -strongEdge && pair.short.expectancy > 0) return 'SHORT_GUCLU';
  if (pair.edge.score > 5) return 'LONG_AVANTAJ';
  if (pair.edge.score < -5) return 'SHORT_AVANTAJ';
  return 'YON_NOTR';
}

function build(stats = {}, options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const targetSample = Math.max(minSample, num(options.targetSample, 50));
  const normalized = normalizeRows(stats);
  const groups = new Map();

  for (const row of normalized.rows) {
    if (!groups.has(row.pairKey)) groups.set(row.pairKey, { pairKey: row.pairKey, btcBits: row.btcBits, coinBits: row.coinBits, long: null, short: null });
    const pair = groups.get(row.pairKey);
    if (row.direction === 'LONG') pair.long = row;
    if (row.direction === 'SHORT') pair.short = row;
  }

  const pairs = [...groups.values()].map(pair => {
    const complete = Boolean(pair.long && pair.short);
    const edge = complete ? edgeScore(pair.long, pair.short, targetSample) : null;
    const model = { ...pair, complete, edge };
    model.verdict = verdict(model, { minSample, strongEdge: options.strongEdge });
    model.ready = complete && pair.long.total >= minSample && pair.short.total >= minSample;
    model.preferredDirection = !complete ? (pair.long ? 'LONG' : 'SHORT') : edge.score > 5 ? 'LONG' : edge.score < -5 ? 'SHORT' : 'NEUTRAL';
    return model;
  });

  const ready = pairs.filter(pair => pair.ready);
  const longAdvantage = ready.filter(pair => pair.preferredDirection === 'LONG').sort((a, b) => b.edge.score - a.edge.score);
  const shortAdvantage = ready.filter(pair => pair.preferredDirection === 'SHORT').sort((a, b) => a.edge.score - b.edge.score);
  const neutral = ready.filter(pair => pair.preferredDirection === 'NEUTRAL');
  const longAggregate = aggregate(normalized.rows.filter(row => row.direction === 'LONG'));
  const shortAggregate = aggregate(normalized.rows.filter(row => row.direction === 'SHORT'));
  const globalExpDiff = longAggregate.expectancy - shortAggregate.expectancy;
  const globalPreferredDirection = globalExpDiff > 0.01 ? 'LONG' : globalExpDiff < -0.01 ? 'SHORT' : 'NEUTRAL';

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ANALYSIS_ONLY',
    minSample,
    targetSample,
    totalRows: normalized.rows.length,
    totalPairs: pairs.length,
    completePairs: pairs.filter(pair => pair.complete).length,
    readyPairs: ready.length,
    longAdvantageCount: longAdvantage.length,
    shortAdvantageCount: shortAdvantage.length,
    neutralCount: neutral.length,
    pairs,
    ready,
    longAdvantage,
    shortAdvantage,
    neutral,
    aggregate: {
      LONG: longAggregate,
      SHORT: shortAggregate,
      expectancyDiff: round(globalExpDiff, 6),
      preferredDirection: globalPreferredDirection
    },
    unmapped: normalized.unmapped,
    note: 'Yalnızca analizdir. Yön önerileri emir veya filtre motoruna uygulanmaz.'
  };
}

function pairText(pair, index) {
  const preferred = pair.preferredDirection === 'LONG' ? '🟢 LONG' : pair.preferredDirection === 'SHORT' ? '🔴 SHORT' : '⚪ NÖTR';
  return `${index + 1}. ${pair.pairKey} → ${preferred} | Edge ${signed(pair.edge.score, 1)} | Güven %${pair.edge.reliability.toFixed(1)}\n` +
    `   L: N${pair.long.total} Exp ${signed(pair.long.expectancy, 4)} PF ${pair.long.profitFactor.toFixed(2)} | S: N${pair.short.total} Exp ${signed(pair.short.expectancy, 4)} PF ${pair.short.profitFactor.toFixed(2)}`;
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  const limit = Math.max(1, num(options.limit, 3));
  let text = `\n\n🧭 <b>DIRECTION INTELLIGENCE LAB — A5</b>\n`;
  text += `Genel yön: <b>${model.aggregate.preferredDirection}</b> | Exp farkı ${signed(model.aggregate.expectancyDiff, 4)} USDT\n`;
  text += `🟢 LONG: N${model.aggregate.LONG.total} | Exp ${signed(model.aggregate.LONG.expectancy, 4)} | PF ${model.aggregate.LONG.profitFactor.toFixed(2)} | Net ${signed(model.aggregate.LONG.net, 2)}\n`;
  text += `🔴 SHORT: N${model.aggregate.SHORT.total} | Exp ${signed(model.aggregate.SHORT.expectancy, 4)} | PF ${model.aggregate.SHORT.profitFactor.toFixed(2)} | Net ${signed(model.aggregate.SHORT.net, 2)}\n`;
  text += `Hazır eşleşme: ${model.readyPairs}/${model.totalPairs} | LONG avantaj ${model.longAdvantageCount} | SHORT avantaj ${model.shortAdvantageCount} | Nötr ${model.neutralCount}\n`;
  text += `🏆 <b>LONG üstün DNA</b>\n${model.longAdvantage.slice(0, limit).length ? model.longAdvantage.slice(0, limit).map(pairText).join('\n') : 'Yeterli eşleşmiş veri yok.'}`;
  text += `\n🏆 <b>SHORT üstün DNA</b>\n${model.shortAdvantage.slice(0, limit).length ? model.shortAdvantage.slice(0, limit).map(pairText).join('\n') : 'Yeterli eşleşmiş veri yok.'}`;
  text += `\nℹ️ Sadece analiz; otomatik yön seçimi veya filtre yok.`;
  return text;
}

module.exports = {
  VERSION,
  dnaIdentity,
  normalizeRows,
  aggregate,
  edgeScore,
  verdict,
  build,
  telegramText
};
