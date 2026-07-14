/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 8.2
 * AGROS INTELLIGENCE DASHBOARD
 *
 * Amaç:
 * - Direction, Evolution, Consensus ve Live Validation sonuçlarını
 *   tek, kısa ve okunabilir Telegram karar raporunda birleştirmek.
 *
 * Güvenlik:
 * - Yeni sinyal üretmez.
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya otomatik filtre uygulamaz.
 */

const VERSION = 'ER-A8.2-INTELLIGENCE-DASHBOARD-v1';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function signed(value, digits = 2) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function pct(value, digits = 1) {
  return `%${num(value).toFixed(digits)}`;
}

function emojiDecision(decision) {
  if (decision === 'COK_GUCLU_ADAY') return '🌟';
  if (decision === 'GUCLU_ADAY') return '⭐';
  if (decision === 'CATISMALI_IZLE') return '⚖️';
  if (decision === 'RISKLI') return '⚠️';
  if (decision === 'KACIN_ADAYI') return '🚫';
  return '⏳';
}

function evolutionEmoji(status) {
  if (['HIZLA_GUCLENIYOR', 'GUCLENIYOR'].includes(status)) return '📈';
  if (['COKUYOR', 'ZAYIFLIYOR'].includes(status)) return '📉';
  if (status === 'STABIL') return '➡️';
  return '🌱';
}

function heatEmoji(category) {
  if (category === 'POSITIVE') return '🟢';
  if (category === 'NEGATIVE') return '🔴';
  if (category === 'LOW_SAMPLE') return '🟡';
  return '⚪';
}

function directionEmoji(agreement) {
  if (agreement === 'UYUMLU') return '✅';
  if (agreement === 'TERS') return '❌';
  if (agreement === 'NOTR') return '➖';
  return '⏳';
}

function identity(row = {}) {
  return `${row.direction || '?'} | BTC ${row.btcBits || '----'} | Coin ${row.coinBits || '----'}`;
}

function compactCard(row, index) {
  const decision = row.decision || 'VERI_BEKLENIYOR';
  return `${index + 1}. ${emojiDecision(decision)} <b>${identity(row)}</b> | Skor ${num(row.consensusScore).toFixed(1)} | ${decision}\n` +
    `   Exp ${signed(row.expectancy, 4)} | PF ${num(row.profitFactor).toFixed(2)} | Güven ${num(row.confidence).toFixed(0)}\n` +
    `   ${directionEmoji(row.directionAgreement)} Yön ${row.directionAgreement || 'VERI_YOK'} | ${evolutionEmoji(row.evolutionStatus)} ${row.evolutionStatus || 'VERI_YOK'} | ${heatEmoji(row.heatCategory)} Heat ${row.heatCategory || 'EMPTY'}`;
}

function build(models = {}, options = {}) {
  const consensus = models.consensus || {};
  const validation = models.validation || {};
  const direction = models.direction || {};
  const evolution = models.evolution || {};
  const limit = Math.max(1, num(options.limit, 3));

  return {
    version: VERSION,
    mode: 'ANALYSIS_ONLY',
    generatedAt: new Date().toISOString(),
    summary: {
      totalDna: num(consensus.totalDna),
      readyDna: num(consensus.readyDna),
      strong: num(consensus.strongCount),
      risk: num(consensus.riskCount),
      conflict: num(consensus.conflictCount),
      directionLong: num(direction?.summary?.longPreferred || direction?.longPreferredCount),
      directionShort: num(direction?.summary?.shortPreferred || direction?.shortPreferredCount),
      strengthening: num(evolution?.summary?.strengthening || evolution?.strengtheningCount),
      weakening: num(evolution?.summary?.weakening || evolution?.weakeningCount)
    },
    strongest: (consensus.strongest || []).slice(0, limit),
    riskiest: (consensus.riskiest || []).slice(0, limit),
    conflicted: (consensus.conflicted || []).slice(0, limit),
    validation: {
      predictions: num(validation.predictions),
      resolutions: num(validation.resolutions),
      pending: num(validation.pendingPredictions),
      strong: validation.strong || { total: 0, accuracy: 0, net: 0, expectancy: 0 },
      risk: validation.risk || { total: 0, accuracy: 0, net: 0, expectancy: 0 },
      conflict: validation.conflict || { total: 0, net: 0 }
    },
    note: 'A5 + A6 + A8 + A8.1 tek görünümde birleşir; işlem motoruna uygulanmaz.'
  };
}

function section(title, rows) {
  return `${title}\n${rows.length ? rows.map(compactCard).join('\n') : 'Henüz yeterli ve ortak onaylı DNA yok.'}`;
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  let text = `\n\n🧠 <b>AGROS INTELLIGENCE DASHBOARD — A8.2</b>\n`;
  text += `DNA: ${model.summary.readyDna}/${model.summary.totalDna} hazır | ⭐ Güçlü ${model.summary.strong} | 🚫 Riskli ${model.summary.risk} | ⚖️ Çatışmalı ${model.summary.conflict}\n`;
  text += section('🏆 <b>En güçlü ortak adaylar</b>', model.strongest);
  text += `\n${section('🚫 <b>Kaçınılması gerekenler</b>', model.riskiest)}`;
  text += `\n${section('⚖️ <b>Modül çatışmaları</b>', model.conflicted)}`;
  text += `\n🧪 <b>Canlı doğrulama</b>\n`;
  text += `Tahmin ${model.validation.predictions} | Sonuçlanan ${model.validation.resolutions} | Bekleyen ${model.validation.pending}\n`;
  text += `⭐ Güçlü aday: ${model.validation.strong.total || 0} işlem | İsabet ${pct(model.validation.strong.accuracy)} | Net ${signed(model.validation.strong.net)} | Exp ${signed(model.validation.strong.expectancy, 4)}\n`;
  text += `🚫 Kaçın uyarısı: ${model.validation.risk.total || 0} işlem | Doğruluk ${pct(model.validation.risk.accuracy)} | Gerçek Net ${signed(model.validation.risk.net)}\n`;
  text += `⚖️ Çatışmalı: ${model.validation.conflict.total || 0} işlem | Net ${signed(model.validation.conflict.net)}\n`;
  if (!model.validation.resolutions) text += `⏳ İlk A8 kararlarından sonra kapanacak işlemler bekleniyor.\n`;
  text += `ℹ️ Tek rapor; otomatik filtre veya emir etkisi yok.`;
  return text;
}

module.exports = {
  VERSION,
  build,
  telegramText,
  compactCard
};
