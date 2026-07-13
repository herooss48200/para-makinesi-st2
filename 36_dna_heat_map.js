/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 4
 * DNA HEAT MAP
 *
 * Amaç:
 * - BTC 4-bit x Coin 4-bit kombinasyonlarını LONG ve SHORT için ayrı 16x16 haritada göstermek.
 * - DNA Profit Ranking + Confidence Engine v2 sonuçlarını tek bakışta okunabilir hale getirmek.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya filtre uygulamaz.
 * - Yalnızca analiz modellerini görselleştirir.
 */

const VERSION = 'ER-A4.1-DNA-HEAT-MAP-COVERAGE-v1';
const HEX = '0123456789ABCDEF';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Number(num(value).toFixed(digits));
}

function parseDnaKey(key = '') {
  const text = String(key || '').toUpperCase();
  const direction = text.match(/(?:^|\|)YON=(LONG|SHORT)(?:\||$)/)?.[1] || null;
  const btcBits = text.match(/(?:^|\|)BTC=([01]{4})(?:\||$)/)?.[1] || null;
  const coinBits = text.match(/(?:^|\|)COIN=([01]{4})(?:\||$)/)?.[1] || null;
  if (!direction || !btcBits || !coinBits) return null;
  return {
    direction,
    btcBits,
    coinBits,
    btcIndex: parseInt(btcBits, 2),
    coinIndex: parseInt(coinBits, 2)
  };
}

function category(row, minSample = 10) {
  if (!row || num(row.total) <= 0) return 'EMPTY';
  if (num(row.total) < minSample) return 'LOW_SAMPLE';
  if (num(row.metaScore) >= 58 && num(row.expectancy) > 0 && num(row.profitFactor) > 1) return 'POSITIVE';
  if (num(row.metaScore) <= 42 && num(row.expectancy) < 0 && num(row.profitFactor) < 1) return 'NEGATIVE';
  return 'NEUTRAL';
}

function symbolFor(categoryName) {
  return ({
    POSITIVE: '+',
    NEGATIVE: '-',
    NEUTRAL: '~',
    LOW_SAMPLE: '?',
    EMPTY: '.'
  })[categoryName] || '.';
}

function emptyMatrix() {
  return Array.from({ length: 16 }, (_, btcIndex) =>
    Array.from({ length: 16 }, (_, coinIndex) => ({
      btcIndex,
      coinIndex,
      btcBits: btcIndex.toString(2).padStart(4, '0'),
      coinBits: coinIndex.toString(2).padStart(4, '0'),
      row: null,
      category: 'EMPTY',
      symbol: '.'
    }))
  );
}

function matrixSummary(matrix) {
  const summary = { positive: 0, negative: 0, neutral: 0, lowSample: 0, empty: 0, observed: 0, ready: 0 };
  for (const line of matrix) {
    for (const cell of line) {
      if (cell.category === 'POSITIVE') summary.positive += 1;
      else if (cell.category === 'NEGATIVE') summary.negative += 1;
      else if (cell.category === 'NEUTRAL') summary.neutral += 1;
      else if (cell.category === 'LOW_SAMPLE') summary.lowSample += 1;
      else summary.empty += 1;
    }
  }
  summary.observed = 256 - summary.empty;
  summary.ready = summary.positive + summary.negative + summary.neutral;
  summary.coveragePct = round((summary.observed / 256) * 100, 1);
  summary.readyPct = round((summary.ready / 256) * 100, 1);
  return summary;
}

function rawRow(bucket = {}, key = '') {
  const tp = Math.max(0, num(bucket?.tp));
  const sl = Math.max(0, num(bucket?.sl));
  const be = Math.max(0, num(bucket?.be));
  const total = Math.max(tp + sl + be, num(bucket?.toplam));
  return {
    key: String(bucket?.key || key || 'DNA_YOK'),
    label: String(bucket?.etiket || bucket?.label || bucket?.key || key || 'DNA_YOK'),
    total,
    tp,
    sl,
    be,
    net: num(bucket?.net),
    source: 'RAW_SIGNATURE_STATS'
  };
}

function placeRow(matrices, row, minSample, unmapped) {
  const parsed = parseDnaKey(row?.key || row?.label);
  if (!parsed) {
    unmapped.push(String(row?.key || row?.label || 'DNA_YOK'));
    return;
  }
  const cell = matrices[parsed.direction][parsed.btcIndex][parsed.coinIndex];
  cell.row = row;
  cell.category = category(row, minSample);
  cell.symbol = symbolFor(cell.category);
}

function build(confidenceModel = {}, options = {}) {
  const minSample = Math.max(1, num(options.minSample, confidenceModel.minSample || 10));
  const matrices = { LONG: emptyMatrix(), SHORT: emptyMatrix() };
  const unmapped = [];
  const rawStats = options.rawStats || {};

  // Önce ham signatureMatrixStats yerleştirilir. Böylece minimum örneğin altındaki
  // gözlemler haritada '?' olarak görünür; yalnızca güvenilir sıralama listesine
  // bağlı kalınmaz.
  for (const [key, bucket] of Object.entries(rawStats)) {
    const row = rawRow(bucket, key);
    if (row.total > 0) placeRow(matrices, row, minSample, unmapped);
  }

  // Confidence v2 satırları aynı hücreleri zengin metriklerle günceller.
  for (const row of confidenceModel.all || []) {
    placeRow(matrices, row, minSample, unmapped);
  }

  const summaries = {
    LONG: matrixSummary(matrices.LONG),
    SHORT: matrixSummary(matrices.SHORT)
  };

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ANALYSIS_ONLY',
    minSample,
    axes: { rows: 'BTC bits (0-F)', columns: 'Coin bits (0-F)' },
    matrices,
    summaries,
    unmapped,
    totalCells: 512,
    observedDna: summaries.LONG.observed + summaries.SHORT.observed,
    readyDna: summaries.LONG.ready + summaries.SHORT.ready,
    lowSampleDna: summaries.LONG.lowSample + summaries.SHORT.lowSample,
    integrity: {
      longTotal: Object.values(summaries.LONG).length ? summaries.LONG.positive + summaries.LONG.negative + summaries.LONG.neutral + summaries.LONG.lowSample + summaries.LONG.empty : 0,
      shortTotal: Object.values(summaries.SHORT).length ? summaries.SHORT.positive + summaries.SHORT.negative + summaries.SHORT.neutral + summaries.SHORT.lowSample + summaries.SHORT.empty : 0
    },
    note: 'Ham signatureMatrixStats düşük örnekleri ? olarak gösterir; Confidence v2 yeterli örnekli hücreleri zenginleştirir. Otomatik filtre yok.'
  };
}

function matrixLines(matrix) {
  const lines = [`   ${HEX}`];
  for (let i = 0; i < 16; i++) {
    lines.push(`${HEX[i]}  ${matrix[i].map(cell => cell.symbol).join('')}`);
  }
  return lines.join('\n');
}

function directionBlock(model, direction) {
  const summary = model.summaries[direction];
  return `${direction === 'LONG' ? '🟢' : '🔴'} <b>${direction} 16x16</b> | Hazır ${summary.ready}/256 | Kapsam %${summary.coveragePct.toFixed(1)}\n` +
    `<pre>${matrixLines(model.matrices[direction])}</pre>\n` +
    `+ ${summary.positive} | - ${summary.negative} | ~ ${summary.neutral} | ? ${summary.lowSample} | . ${summary.empty}`;
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  let text = `\n\n🗺️ <b>DNA HEAT MAP</b>\n`;
  text += `Satır BTC(0-F) | Sütun Coin(0-F) | Min örnek ${model.minSample}\n`;
  text += `Lejant: + pozitif | - negatif | ~ nötr | ? az örnek | . veri yok\n`;
  text += `Gözlenen DNA: ${model.observedDna}/512 | Hazır: ${model.readyDna} | Az örnek: ${model.lowSampleDna}\n`;
  text += directionBlock(model, 'LONG');
  text += `\n${directionBlock(model, 'SHORT')}`;
  text += `\nℹ️ Sadece analiz görünümüdür; otomatik filtre yok.`;
  return text;
}

module.exports = {
  VERSION,
  parseDnaKey,
  category,
  build,
  rawRow,
  matrixLines,
  telegramText
};
