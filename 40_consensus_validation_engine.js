/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 8.1
 * CONSENSUS LIVE VALIDATION ENGINE
 *
 * Amaç:
 * - A8 kararlarını verildikleri anda zaman damgasıyla kaydetmek.
 * - Yalnızca karar sonrasında kapanan aynı yönlü DNA işlemleriyle ileriye dönük doğrulamak.
 * - Güçlü adayların gerçekten kazandığını, kaçın adaylarının gerçekten zarar ürettiğini ölçmek.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya filtre uygulamaz.
 * - Yalnızca analiz durumunu data/agros-consensus-validation.json içinde tutar.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dnaEvolution = require('./38_dna_evolution_engine.js');
const heatMap = require('./36_dna_heat_map.js');

const VERSION = 'ER-A8.1-CONSENSUS-LIVE-VALIDATION-v1';
const DEFAULT_STATE_FILE = path.join(__dirname, 'data', 'agros-consensus-validation.json');

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

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function defaultState() {
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    predictions: [],
    resolutions: []
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : defaultState();
  return {
    version: VERSION,
    createdAt: state.createdAt || new Date().toISOString(),
    updatedAt: state.updatedAt || new Date().toISOString(),
    predictions: Array.isArray(state.predictions) ? state.predictions : [],
    resolutions: Array.isArray(state.resolutions) ? state.resolutions : []
  };
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function canonicalKey(value) {
  const parsed = heatMap.parseDnaKey(value);
  if (!parsed) return String(value || '');
  return `YON=${parsed.direction}|BTC=${parsed.btcBits}|COIN=${parsed.coinBits}`;
}

function predictionClass(decision) {
  if (['COK_GUCLU_ADAY', 'GUCLU_ADAY'].includes(decision)) return 'GUCLU';
  if (['RISKLI', 'KACIN_ADAYI'].includes(decision)) return 'RISK';
  if (decision === 'CATISMALI_IZLE') return 'CATISMALI';
  return 'IZLE';
}

function tradeId(trade = {}) {
  return crypto.createHash('sha1').update([
    trade.timestamp,
    trade.symbol,
    trade.key,
    trade.result,
    trade.net
  ].join('|')).digest('hex').slice(0, 20);
}

function predictionId(row = {}, observedAt = 0) {
  return crypto.createHash('sha1').update([
    row.canonicalKey || row.key,
    row.decision,
    Math.round(num(row.consensusScore) / 5) * 5,
    observedAt
  ].join('|')).digest('hex').slice(0, 20);
}

function recordPredictions(state, consensusModel, nowMs, options = {}) {
  const minIntervalMs = Math.max(60 * 60 * 1000, num(options.minSnapshotHours, 6) * 60 * 60 * 1000);
  const maxPredictions = Math.max(100, num(options.maxPredictions, 5000));
  const eligible = (consensusModel?.all || []).filter(row =>
    row.total >= num(consensusModel.minSample, 10) &&
    ['COK_GUCLU_ADAY', 'GUCLU_ADAY', 'RISKLI', 'KACIN_ADAYI', 'CATISMALI_IZLE'].includes(row.decision)
  );

  for (const row of eligible) {
    const key = canonicalKey(row.canonicalKey || row.key);
    const previous = [...state.predictions].reverse().find(p => p.key === key);
    const scoreBand = Math.round(num(row.consensusScore) / 5) * 5;
    const changed = !previous || previous.decision !== row.decision || previous.scoreBand !== scoreBand;
    const expired = !previous || nowMs - num(previous.observedAt) >= minIntervalMs;
    if (!changed && !expired) continue;

    state.predictions.push({
      id: predictionId(row, nowMs),
      key,
      direction: row.direction,
      observedAt: nowMs,
      observedTime: new Date(nowMs).toISOString(),
      decision: row.decision,
      class: predictionClass(row.decision),
      score: round(row.consensusScore, 1),
      scoreBand,
      confidence: round(row.confidence, 1),
      expectancyAtPrediction: round(row.expectancy, 6),
      evolutionStatus: row.evolutionStatus || 'VERI_YOK',
      directionAgreement: row.directionAgreement || 'VERI_YOK',
      heatCategory: row.heatCategory || 'EMPTY',
      confidenceBand: num(row.confidence) >= 65 ? 'YUKSEK' : (num(row.confidence) <= 35 ? 'DUSUK' : 'ORTA')
    });
  }

  if (state.predictions.length > maxPredictions) {
    state.predictions = state.predictions.slice(-maxPredictions);
  }
}

function resolveTrades(state, trades = [], options = {}) {
  const existing = new Set(state.resolutions.map(r => r.tradeId));
  const maxResolutions = Math.max(100, num(options.maxResolutions, 10000));

  for (const trade of trades) {
    const id = tradeId(trade);
    if (existing.has(id) || !trade.timestamp) continue;
    const normalizedTradeKey = canonicalKey(trade.key);
    const prediction = [...state.predictions].reverse().find(p => p.key === normalizedTradeKey && p.observedAt < trade.timestamp);
    if (!prediction) continue;

    const won = num(trade.net) > 0;
    const validationSuccess = prediction.class === 'GUCLU'
      ? won
      : prediction.class === 'RISK'
        ? !won
        : null;

    state.resolutions.push({
      tradeId: id,
      predictionId: prediction.id,
      key: normalizedTradeKey,
      sourceKey: trade.key,
      symbol: trade.symbol,
      closedAt: trade.timestamp,
      closedTime: trade.time,
      result: trade.result,
      net: round(trade.net, 6),
      predictionClass: prediction.class,
      decision: prediction.decision,
      score: prediction.score,
      confidence: prediction.confidence,
      confidenceBand: prediction.confidenceBand || 'ORTA',
      heatCategory: prediction.heatCategory || 'EMPTY',
      evolutionStatus: prediction.evolutionStatus || 'VERI_YOK',
      directionAgreement: prediction.directionAgreement || 'VERI_YOK',
      validationSuccess
    });
    existing.add(id);
  }

  if (state.resolutions.length > maxResolutions) {
    state.resolutions = state.resolutions.slice(-maxResolutions);
  }
}

function groupMetrics(rows = [], expectedSuccess = true) {
  const resolved = rows.filter(r => typeof r.validationSuccess === 'boolean');
  const success = resolved.filter(r => r.validationSuccess === expectedSuccess).length;
  const net = rows.reduce((sum, row) => sum + num(row.net), 0);
  return {
    total: rows.length,
    resolved: resolved.length,
    success,
    accuracy: round(resolved.length ? (success / resolved.length) * 100 : 0, 2),
    net: round(net, 6),
    expectancy: round(rows.length ? net / rows.length : 0, 6)
  };
}

function buildModel(state, source = {}) {
  const strongRows = state.resolutions.filter(r => r.predictionClass === 'GUCLU');
  const riskRows = state.resolutions.filter(r => r.predictionClass === 'RISK');
  const conflictRows = state.resolutions.filter(r => r.predictionClass === 'CATISMALI');
  const strong = groupMetrics(strongRows);
  const risk = groupMetrics(riskRows);
  const conflict = groupMetrics(conflictRows);
  const pendingPredictions = state.predictions.filter(p => !state.resolutions.some(r => r.predictionId === p.id)).length;
  return {
    version: VERSION,
    mode: 'FORWARD_ONLY_ANALYSIS',
    predictions: state.predictions.length,
    resolutions: state.resolutions.length,
    pendingPredictions,
    strong,
    risk,
    conflict,
    source,
    recent: state.resolutions.slice(-10).reverse(),
    validationRows: state.resolutions,
    note: 'Sadece karar verildikten sonra kapanan işlemler doğrulamaya alınır; geçmişe dönük başarı yazılmaz.'
  };
}

function build(consensusModel = {}, options = {}) {
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const nowMs = num(options.nowMs, Date.now());
  const persist = options.persist !== false;
  const loaded = dnaEvolution.loadTrades(options.tradesFile || dnaEvolution.DEFAULT_JSONL);
  const state = normalizeState(safeReadJson(stateFile));

  resolveTrades(state, loaded.trades, options);
  recordPredictions(state, consensusModel, nowMs, options);
  state.updatedAt = new Date(nowMs).toISOString();

  if (persist) atomicWriteJson(stateFile, state);
  return buildModel(state, {
    stateFile,
    tradesFile: loaded.filePath,
    tradesExists: loaded.exists,
    invalidLines: loaded.invalidLines
  });
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  let text = `\n\n🧪 <b>CONSENSUS CANLI DOĞRULAMA — A8.1</b>\n`;
  text += `İleri tahmin: ${model.predictions} | Sonuçlanan: ${model.resolutions} | Bekleyen: ${model.pendingPredictions}\n`;
  if (!model.source?.tradesExists) {
    text += `BlackBox kapanış dosyası bulunamadı; canlı doğrulama veri geldikçe başlayacak.`;
    return text;
  }
  text += `⭐ Güçlü aday: ${model.strong.total} işlem | İsabet %${model.strong.accuracy.toFixed(1)} | Net ${signed(model.strong.net, 2)} | Exp ${signed(model.strong.expectancy, 4)}\n`;
  text += `🚫 Kaçın uyarısı: ${model.risk.total} işlem | Doğruluk %${model.risk.accuracy.toFixed(1)} | Gerçek Net ${signed(model.risk.net, 2)}\n`;
  text += `⚖️ Çatışmalı: ${model.conflict.total} işlem | Net ${signed(model.conflict.net, 2)}\n`;
  if (model.resolutions === 0) text += `⏳ İlk A8 kararlarından sonra kapanacak işlemler bekleniyor.\n`;
  text += `ℹ️ Geçmişe bakarak başarı yazmaz; yalnızca tahminden sonraki kapanışları ölçer.`;
  return text;
}

module.exports = {
  VERSION,
  DEFAULT_STATE_FILE,
  canonicalKey,
  predictionClass,
  tradeId,
  recordPredictions,
  resolveTrades,
  groupMetrics,
  buildModel,
  build,
  telegramText
};
