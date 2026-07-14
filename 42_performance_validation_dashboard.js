/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 9
 * PERFORMANCE VALIDATION DASHBOARD
 *
 * Her analiz motorunun ileriye dönük kararlarının doğruluğunu ve net katkısını
 * aynı kapanış sonuçları üzerinde karşılaştırır. Trade Engine'e dokunmaz.
 */

const VERSION = 'ER-A9-PERFORMANCE-VALIDATION-v1';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Number(num(value).toFixed(digits));
}

function signed(value, digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function expectationFor(moduleName, row = {}) {
  if (moduleName === 'CONSENSUS') {
    if (row.predictionClass === 'GUCLU') return 'WIN';
    if (row.predictionClass === 'RISK') return 'LOSS';
  }
  if (moduleName === 'DIRECTION') {
    if (row.directionAgreement === 'UYUMLU') return 'WIN';
    if (row.directionAgreement === 'TERS') return 'LOSS';
  }
  if (moduleName === 'EVOLUTION') {
    if (['HIZLA_GUCLENIYOR', 'GUCLENIYOR'].includes(row.evolutionStatus)) return 'WIN';
    if (['ZAYIFLIYOR', 'COKUYOR'].includes(row.evolutionStatus)) return 'LOSS';
  }
  if (moduleName === 'CONFIDENCE') {
    if (row.confidenceBand === 'YUKSEK' || num(row.confidence) >= 65) return 'WIN';
    if (row.confidenceBand === 'DUSUK' || num(row.confidence) <= 35) return 'LOSS';
  }
  if (moduleName === 'HEAT_MAP') {
    if (row.heatCategory === 'POSITIVE') return 'WIN';
    if (row.heatCategory === 'NEGATIVE') return 'LOSS';
  }
  return null;
}

function moduleMetrics(moduleName, rows = []) {
  const calls = [];
  for (const row of rows) {
    const expected = expectationFor(moduleName, row);
    if (!expected) continue;
    const won = num(row.net) > 0;
    const correct = expected === 'WIN' ? won : !won;
    calls.push({ ...row, expected, correct });
  }
  const correct = calls.filter(row => row.correct).length;
  const net = calls.reduce((sum, row) => sum + num(row.net), 0);
  const positiveCalls = calls.filter(row => row.expected === 'WIN');
  const avoidedLossCalls = calls.filter(row => row.expected === 'LOSS');
  return {
    module: moduleName,
    calls: calls.length,
    correct,
    accuracy: round(calls.length ? (correct / calls.length) * 100 : 0, 2),
    net: round(net, 6),
    expectancy: round(calls.length ? net / calls.length : 0, 6),
    positiveCalls: positiveCalls.length,
    warningCalls: avoidedLossCalls.length,
    warningAccuracy: round(avoidedLossCalls.length ? (avoidedLossCalls.filter(r => r.correct).length / avoidedLossCalls.length) * 100 : 0, 2)
  };
}

function build(validationModel = {}, options = {}) {
  const rows = Array.isArray(validationModel.validationRows) ? validationModel.validationRows : [];
  const minCalls = Math.max(1, num(options.minCalls, 10));
  const modules = ['CONSENSUS', 'DIRECTION', 'EVOLUTION', 'CONFIDENCE', 'HEAT_MAP']
    .map(name => moduleMetrics(name, rows));
  const ranked = modules.filter(m => m.calls >= minCalls)
    .sort((a, b) => b.accuracy - a.accuracy || b.expectancy - a.expectancy || b.calls - a.calls);
  return {
    version: VERSION,
    mode: 'FORWARD_ONLY_ANALYSIS',
    minCalls,
    totalClosures: rows.length,
    modules,
    ranked,
    leader: ranked[0] || null,
    note: 'Sadece A8 kararından sonra kapanan işlemler kullanılır; nötr/veri-yetersiz motor görüşleri puanlanmaz.'
  };
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  let text = `\n\n🎯 <b>AGROS PERFORMANCE VALIDATION — A9</b>\n`;
  text += `İleri kapanış: ${model.totalClosures} | Sıralama eşiği: ${model.minCalls} karar\n`;
  for (const m of model.modules) {
    const status = m.calls >= model.minCalls ? '✅' : '⏳';
    text += `${status} ${m.module}: ${m.calls} karar | Doğruluk %${m.accuracy.toFixed(1)} | Net ${signed(m.net)} | Exp ${signed(m.expectancy, 4)}\n`;
  }
  if (model.leader) {
    text += `🏆 Kanıt lideri: <b>${model.leader.module}</b> | %${model.leader.accuracy.toFixed(1)} | ${model.leader.calls} karar\n`;
  } else {
    text += `⏳ Motor sıralaması için her motorda en az ${model.minCalls} ileri karar bekleniyor.\n`;
  }
  text += `ℹ️ Bu rapor motorları ölçer; otomatik filtre veya emir etkisi yok.`;
  return text;
}

module.exports = { VERSION, expectationFor, moduleMetrics, build, telegramText };
