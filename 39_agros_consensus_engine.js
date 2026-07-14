/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 8
 * AGROS CONSENSUS ENGINE
 *
 * Amaç:
 * - Confidence v2, DNA Heat Map, Direction Intelligence ve DNA Evolution
 *   sonuçlarını açıklanabilir tek bir karar destek puanında birleştirmek.
 *
 * Güvenlik:
 * - Yeni sinyal üretmez.
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya otomatik filtre uygulamaz.
 */

const heatMap = require('./36_dna_heat_map.js');

const VERSION = 'ER-A8-AGROS-CONSENSUS-v1';

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

function signed(value, digits = 1) {
  const n = num(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function identityFromRow(row = {}) {
  const candidates = [row.key, row.label, row.etiket, row.signature, row.rawObjectKey];
  for (const candidate of candidates) {
    const parsed = heatMap.parseDnaKey(candidate);
    if (parsed) {
      return {
        direction: parsed.direction,
        btcBits: parsed.btcBits,
        coinBits: parsed.coinBits,
        canonicalKey: `YON=${parsed.direction}|BTC=${parsed.btcBits}|COIN=${parsed.coinBits}`,
        pairKey: `BTC=${parsed.btcBits}|COIN=${parsed.coinBits}`,
        sourceKey: String(candidate)
      };
    }
  }
  return null;
}

function heatCategoryFor(model = {}, identity = {}) {
  const btcIndex = parseInt(identity.btcBits, 2);
  const coinIndex = parseInt(identity.coinBits, 2);
  return model?.matrices?.[identity.direction]?.[btcIndex]?.[coinIndex]?.category || 'EMPTY';
}

function evolutionIndex(model = {}) {
  const exact = new Map();
  const canonical = new Map();
  for (const row of model.allDnas || []) {
    exact.set(String(row.key || ''), row);
    const id = identityFromRow(row);
    if (!id) continue;
    const current = canonical.get(id.canonicalKey);
    if (!current || num(row.total) > num(current.total)) canonical.set(id.canonicalKey, row);
  }
  return { exact, canonical };
}

function directionIndex(model = {}) {
  return new Map((model.pairs || []).map(pair => [String(pair.pairKey || ''), pair]));
}

function heatComponent(category) {
  if (category === 'POSITIVE') return 12;
  if (category === 'NEGATIVE') return -16;
  if (category === 'LOW_SAMPLE') return -4;
  if (category === 'EMPTY') return -8;
  return 0;
}

function directionComponent(pair, direction) {
  if (!pair || !pair.complete || !pair.edge) return { score: 0, agreement: 'VERI_YOK', reliability: 0 };
  const reliability = clamp(num(pair.edge.reliability) / 100, 0, 1);
  const preferred = String(pair.preferredDirection || 'NEUTRAL');
  if (preferred === 'NEUTRAL') return { score: 0, agreement: 'NOTR', reliability: round(reliability * 100, 1) };
  const agrees = preferred === direction;
  const magnitude = clamp(Math.abs(num(pair.edge.score)) / 40, 0.25, 1) * 18 * reliability;
  return {
    score: round(agrees ? magnitude : -magnitude, 2),
    agreement: agrees ? 'UYUMLU' : 'TERS',
    reliability: round(reliability * 100, 1)
  };
}

function evolutionComponent(row) {
  if (!row) return { score: 0, status: 'VERI_YOK', death: 'YOK', stability: 0 };
  let score = clamp(num(row.momentum?.score) / 100, -1, 1) * 18;
  if (row.death === 'OLUYOR') score -= 18;
  else if (row.death === 'OLUM_RISKI') score -= 10;
  if (row.stability?.status === 'COK_OYNAK') score -= 5;
  else if (row.stability?.status === 'COK_STABIL' && score > 0) score += 3;
  return {
    score: round(clamp(score, -30, 22), 2),
    status: row.momentum?.status || 'VERI_YOK',
    death: row.death || 'YOK',
    stability: num(row.stability?.score)
  };
}

function confidenceComponent(row) {
  const meta = num(row.metaScore, 50);
  const confidence = clamp(num(row.confidenceV2) / 100, 0, 1);
  const directional = clamp((meta - 50) / 50, -1, 1);
  return round(directional * 45 * (0.45 + confidence * 0.55), 2);
}

function classify(score, row, conflicts, minSample) {
  if (num(row.total) < minSample) return 'VERI_BEKLENIYOR';
  if (score < 35) return 'KACIN_ADAYI';
  if (conflicts >= 2) return 'CATISMALI_IZLE';
  if (score >= 72 && num(row.confidenceV2) >= 65) return 'COK_GUCLU_ADAY';
  if (score >= 60) return 'GUCLU_ADAY';
  if (score >= 48) return 'IZLE';
  if (score >= 35) return 'RISKLI';
  return 'KACIN_ADAYI';
}

function buildRow(row, context = {}) {
  const identity = identityFromRow(row);
  if (!identity) return null;
  const heatCategory = heatCategoryFor(context.heatMap, identity);
  const pair = context.directionByPair.get(identity.pairKey);
  const exactEvolution = context.evolution.exact.get(String(row.key || ''));
  const evolutionRow = exactEvolution || context.evolution.canonical.get(identity.canonicalKey) || null;

  const parts = {
    confidence: confidenceComponent(row),
    heatMap: heatComponent(heatCategory),
    direction: directionComponent(pair, identity.direction),
    evolution: evolutionComponent(evolutionRow)
  };

  const raw = 50 + parts.confidence + parts.heatMap + parts.direction.score + parts.evolution.score;
  const score = round(clamp(raw, 0, 100), 1);
  const conflicts = [
    heatCategory === 'NEGATIVE',
    parts.direction.agreement === 'TERS',
    ['ZAYIFLIYOR', 'COKUYOR'].includes(parts.evolution.status) || parts.evolution.death !== 'YOK',
    num(row.expectancy) < 0,
    num(row.profitFactor) < 1
  ].filter(Boolean).length;

  return {
    key: row.key,
    label: row.label,
    ...identity,
    total: num(row.total),
    expectancy: num(row.expectancy),
    profitFactor: num(row.profitFactor),
    net: num(row.net),
    metaScore: num(row.metaScore),
    confidence: num(row.confidenceV2),
    heatCategory,
    directionAgreement: parts.direction.agreement,
    directionReliability: parts.direction.reliability,
    evolutionStatus: parts.evolution.status,
    evolutionDeath: parts.evolution.death,
    evolutionStability: parts.evolution.stability,
    consensusScore: score,
    conflicts,
    decision: classify(score, row, conflicts, context.minSample),
    breakdown: {
      confidence: parts.confidence,
      heatMap: parts.heatMap,
      direction: parts.direction.score,
      evolution: parts.evolution.score
    },
    missing: [
      heatCategory === 'EMPTY' ? 'heatMap' : null,
      parts.direction.agreement === 'VERI_YOK' ? 'direction' : null,
      parts.evolution.status === 'VERI_YOK' ? 'evolution' : null
    ].filter(Boolean)
  };
}

function build(models = {}, options = {}) {
  const minSample = Math.max(1, num(options.minSample, models.confidence?.minSample || 10));
  const evolution = evolutionIndex(models.evolution || {});
  const directionByPair = directionIndex(models.direction || {});
  const rows = (models.confidence?.all || [])
    .map(row => buildRow(row, { minSample, heatMap: models.heatMap || {}, evolution, directionByPair }))
    .filter(Boolean);
  const ready = rows.filter(row => row.total >= minSample);
  const strongest = ready
    .filter(row => ['COK_GUCLU_ADAY', 'GUCLU_ADAY'].includes(row.decision))
    .sort((a, b) => b.consensusScore - a.consensusScore || b.confidence - a.confidence);
  const riskiest = ready
    .filter(row => ['RISKLI', 'KACIN_ADAYI'].includes(row.decision))
    .sort((a, b) => a.consensusScore - b.consensusScore || b.conflicts - a.conflicts);
  const conflicted = ready
    .filter(row => row.decision === 'CATISMALI_IZLE')
    .sort((a, b) => b.conflicts - a.conflicts || b.confidence - a.confidence);

  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ANALYSIS_ONLY',
    minSample,
    totalDna: rows.length,
    readyDna: ready.length,
    strongCount: strongest.length,
    riskCount: riskiest.length,
    conflictCount: conflicted.length,
    strongest,
    riskiest,
    conflicted,
    all: rows,
    note: 'Konsensüs yalnızca karar desteğidir; işlem motoruna uygulanmaz.'
  };
}

function shortKey(row = {}, max = 42) {
  const text = `${row.direction} | BTC ${row.btcBits} | Coin ${row.coinBits}`;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function rowText(row, index) {
  return `${index + 1}. ${shortKey(row)} | Skor ${row.consensusScore.toFixed(1)} | ${row.decision}\n` +
    `   Exp ${signed(row.expectancy, 4)} PF ${row.profitFactor.toFixed(2)} | Yön ${row.directionAgreement} | Evrim ${row.evolutionStatus} | Çelişki ${row.conflicts}`;
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  const limit = Math.max(1, num(options.limit, 3));
  let text = `\n\n🧠 <b>AGROS CONSENSUS ENGINE — A8</b>\n`;
  text += `Hazır DNA: ${model.readyDna}/${model.totalDna} | Güçlü ${model.strongCount} | Riskli ${model.riskCount} | Çatışmalı ${model.conflictCount}\n`;
  const top = model.strongest.slice(0, limit);
  const risk = model.riskiest.slice(0, limit);
  const conflict = model.conflicted.slice(0, limit);
  text += `⭐ <b>Ortak onay alan DNA</b>\n${top.length ? top.map(rowText).join('\n') : 'Henüz ortak onay alan yeterli DNA yok.'}`;
  text += `\n🚫 <b>Ortak risk uyarısı</b>\n${risk.length ? risk.map(rowText).join('\n') : 'Henüz ortak risk adayı yok.'}`;
  text += `\n⚖️ <b>Modüller arası çatışma</b>\n${conflict.length ? conflict.map(rowText).join('\n') : 'Belirgin modül çatışması yok.'}`;
  text += `\nℹ️ Confidence + Heat Map + Direction + Evolution birleşir; otomatik filtre yok.`;
  return text;
}

module.exports = {
  VERSION,
  identityFromRow,
  heatCategoryFor,
  directionComponent,
  evolutionComponent,
  confidenceComponent,
  buildRow,
  build,
  telegramText
};
