/**
 * AGROS EXPECTANCY REVOLUTION - AŞAMA 6
 * DNA EVOLUTION ENGINE
 *
 * Amaç:
 * - Her yönlü DNA imzasının kapanış sırasındaki yaşam döngüsünü izlemek.
 * - Rolling 10/20/50/100 performansını, momentumunu, istikrarını ve olgunluk evresini ölçmek.
 *
 * Güvenlik:
 * - Trade Engine'e dokunmaz.
 * - Emir açmaz, kapatmaz veya filtre uygulamaz.
 * - Yalnızca data/blackbox-snapshots.jsonl içindeki KAPANIS kayıtlarını okur.
 */

const fs = require('fs');
const path = require('path');

const VERSION = 'ER-A6-DNA-EVOLUTION-v1';
const DEFAULT_JSONL = path.join(__dirname, 'data', 'blackbox-snapshots.jsonl');
const WINDOWS = [10, 20, 50, 100];

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

function directionOf(rec = {}) {
  return String(rec.yon || rec.direction || rec.side || rec.acilis?.yon || rec.acilis?.strategySignature?.yon || '').toUpperCase();
}

function dnaKeyOf(rec = {}) {
  const direction = directionOf(rec);
  const signature = rec.acilis?.strategySignature || {};
  if (signature.key) return String(signature.key);
  if (signature.btcBits && signature.coinBits && direction) {
    return `YON=${direction}|BTC=${signature.btcBits}|COIN=${signature.coinBits}`;
  }
  const btcBits = rec.open_btcBits || rec.btcBits;
  const coinBits = rec.open_coinBits || rec.coinBits;
  if (btcBits && coinBits && direction) return `YON=${direction}|BTC=${btcBits}|COIN=${coinBits}`;
  return '';
}

function shortKey(key = '') {
  const direction = String(key).match(/YON=(LONG|SHORT)/i)?.[1]?.toUpperCase() || 'YOK';
  const btc = String(key).match(/BTC=([01Y]{4})/i)?.[1] || '????';
  const coin = String(key).match(/COIN=([01Y]{4})/i)?.[1] || '????';
  const bb = String(key).match(/BB=([^|]+)/i)?.[1] || '';
  return `${direction} | BTC ${btc} | Coin ${coin}${bb ? ` | BB ${bb}` : ''}`;
}

function normalizeTrade(rec = {}) {
  if (String(rec.kayitTipi || '').toUpperCase() !== 'KAPANIS') return null;
  const key = dnaKeyOf(rec);
  if (!key) return null;
  const result = String(rec.sonuc || '').toUpperCase();
  if (!['TP', 'SL', 'BE'].includes(result)) return null;
  const timestamp = Date.parse(rec.zaman || rec.kapanisZamani || '') || 0;
  return {
    key,
    label: rec.acilis?.strategySignature?.label || shortKey(key),
    direction: directionOf(rec),
    result,
    net: num(rec.netKarZarar),
    timestamp,
    time: rec.zaman || '',
    symbol: rec.symbol || rec.sym || ''
  };
}

function parseJsonlText(text = '') {
  const trades = [];
  let invalidLines = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const trade = normalizeTrade(JSON.parse(line));
      if (trade) trades.push(trade);
    } catch (_) {
      invalidLines += 1;
    }
  }
  trades.sort((a, b) => a.timestamp - b.timestamp);
  return { trades, invalidLines };
}

function loadTrades(filePath = DEFAULT_JSONL) {
  if (!fs.existsSync(filePath)) return { trades: [], invalidLines: 0, filePath, exists: false };
  const parsed = parseJsonlText(fs.readFileSync(filePath, 'utf8'));
  return { ...parsed, filePath, exists: true };
}

function metrics(trades = []) {
  const total = trades.length;
  const tp = trades.filter(x => x.result === 'TP').length;
  const sl = trades.filter(x => x.result === 'SL').length;
  const be = trades.filter(x => x.result === 'BE').length;
  const net = trades.reduce((sum, x) => sum + num(x.net), 0);
  const grossProfit = trades.reduce((sum, x) => sum + Math.max(0, num(x.net)), 0);
  const grossLoss = trades.reduce((sum, x) => sum + Math.abs(Math.min(0, num(x.net))), 0);
  const decided = tp + sl;
  return {
    total,
    tp,
    sl,
    be,
    net: round(net, 6),
    expectancy: round(total ? net / total : 0, 6),
    winRate: round(decided ? (tp / decided) * 100 : 0, 2),
    profitFactor: round(grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0), 3)
  };
}

function windowMetrics(trades = [], size = 20, offset = 0) {
  const end = Math.max(0, trades.length - offset);
  const start = Math.max(0, end - size);
  return metrics(trades.slice(start, end));
}

function momentumScore(trades = [], recentSize = 20) {
  const recent = windowMetrics(trades, recentSize, 0);
  const previous = windowMetrics(trades, recentSize, recentSize);
  if (recent.total < Math.min(10, recentSize) || previous.total < Math.min(10, recentSize)) {
    return { score: 0, status: 'YENI', recent, previous, expectancyDelta: 0, winRateDelta: 0, pfDelta: 0 };
  }
  const expectancyDelta = recent.expectancy - previous.expectancy;
  const winRateDelta = recent.winRate - previous.winRate;
  const pfDelta = clamp(recent.profitFactor, 0, 3) - clamp(previous.profitFactor, 0, 3);
  const raw = clamp(expectancyDelta / 0.20, -1.5, 1.5) * 55 + clamp(winRateDelta / 25, -1, 1) * 25 + clamp(pfDelta / 1.5, -1, 1) * 20;
  const score = round(clamp(raw, -100, 100), 1);
  let status = 'STABIL';
  if (score >= 45) status = 'HIZLA_GUCLENIYOR';
  else if (score >= 15) status = 'GUCLENIYOR';
  else if (score <= -45) status = 'COKUYOR';
  else if (score <= -15) status = 'ZAYIFLIYOR';
  return { score, status, recent, previous, expectancyDelta: round(expectancyDelta, 6), winRateDelta: round(winRateDelta, 2), pfDelta: round(pfDelta, 3) };
}

function chunkExpectancies(trades = [], chunkSize = 10, maxChunks = 10) {
  const start = Math.max(0, trades.length - chunkSize * maxChunks);
  const selected = trades.slice(start);
  const chunks = [];
  for (let i = 0; i < selected.length; i += chunkSize) {
    const chunk = selected.slice(i, i + chunkSize);
    if (chunk.length >= Math.min(5, chunkSize)) chunks.push(metrics(chunk).expectancy);
  }
  return chunks;
}

function stability(trades = []) {
  const values = chunkExpectancies(trades);
  if (values.length < 2) return { score: 0, status: 'VERI_YETERSIZ', volatility: 0, chunks: values.length };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const volatility = Math.sqrt(variance);
  const score = round(clamp(100 - volatility / 0.30 * 100, 0, 100), 1);
  const status = score >= 75 ? 'COK_STABIL' : score >= 50 ? 'STABIL' : score >= 25 ? 'OYNAK' : 'COK_OYNAK';
  return { score, status, volatility: round(volatility, 6), chunks: values.length };
}

function lifeStage(total = 0) {
  if (total >= 100) return 'OLGUN';
  if (total >= 50) return 'GELISMIS';
  if (total >= 20) return 'BUYUYOR';
  if (total >= 10) return 'GELISEN';
  return 'DENEYSEL';
}

function deathStatus(all, momentum) {
  if (all.total < 40) return 'YOK';
  if (all.expectancy > 0 && momentum.recent.expectancy < 0 && momentum.score <= -45) return 'OLUYOR';
  if (momentum.recent.total >= 20 && momentum.recent.expectancy < -0.08 && momentum.recent.profitFactor < 0.75) return 'OLUM_RISKI';
  return 'YOK';
}

function analyzeDna(key, trades = []) {
  const all = metrics(trades);
  const windows = {};
  for (const size of WINDOWS) windows[size] = windowMetrics(trades, size);
  const momentum = momentumScore(trades, 20);
  const stable = stability(trades);
  return {
    key,
    label: trades[trades.length - 1]?.label || shortKey(key),
    direction: trades[trades.length - 1]?.direction || '',
    total: trades.length,
    firstTime: trades[0]?.time || '',
    lastTime: trades[trades.length - 1]?.time || '',
    ageDays: trades[0]?.timestamp && trades[trades.length - 1]?.timestamp ? round((trades[trades.length - 1].timestamp - trades[0].timestamp) / 86400000, 2) : 0,
    stage: lifeStage(trades.length),
    all,
    windows,
    momentum,
    stability: stable,
    death: deathStatus(all, momentum)
  };
}

function buildFromTrades(trades = [], options = {}) {
  const minSample = Math.max(1, num(options.minSample, 10));
  const groups = new Map();
  for (const trade of trades) {
    if (!groups.has(trade.key)) groups.set(trade.key, []);
    groups.get(trade.key).push(trade);
  }
  const allDnas = [...groups.entries()].map(([key, rows]) => analyzeDna(key, rows));
  const eligible = allDnas.filter(x => x.total >= minSample);
  const strengthening = eligible.filter(x => ['GUCLENIYOR', 'HIZLA_GUCLENIYOR'].includes(x.momentum.status)).sort((a, b) => b.momentum.score - a.momentum.score);
  const weakening = eligible.filter(x => ['ZAYIFLIYOR', 'COKUYOR'].includes(x.momentum.status)).sort((a, b) => a.momentum.score - b.momentum.score);
  const stable = eligible.filter(x => x.momentum.status === 'STABIL').sort((a, b) => b.stability.score - a.stability.score);
  const newDnas = allDnas.filter(x => x.total < minSample).sort((a, b) => b.total - a.total);
  const dying = eligible.filter(x => x.death !== 'YOK').sort((a, b) => a.momentum.score - b.momentum.score);
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ANALYSIS_ONLY',
    minSample,
    totalTrades: trades.length,
    totalDnas: allDnas.length,
    eligibleDnas: eligible.length,
    strengtheningCount: strengthening.length,
    weakeningCount: weakening.length,
    stableCount: stable.length,
    newCount: newDnas.length,
    dyingCount: dying.length,
    allDnas,
    eligible,
    strengthening,
    weakening,
    stable,
    newDnas,
    dying,
    note: 'Yalnızca analizdir. Evolution kararları emir veya filtre motoruna uygulanmaz.'
  };
}

function build(options = {}) {
  const loaded = loadTrades(options.filePath || DEFAULT_JSONL);
  return { ...buildFromTrades(loaded.trades, options), source: { filePath: loaded.filePath, exists: loaded.exists, invalidLines: loaded.invalidLines } };
}

function statusIcon(status) {
  if (status === 'HIZLA_GUCLENIYOR') return '🚀';
  if (status === 'GUCLENIYOR') return '🟢';
  if (status === 'ZAYIFLIYOR') return '🔴';
  if (status === 'COKUYOR') return '💀';
  return '⚪';
}

function dnaLine(dna, index) {
  const w20 = dna.windows[20];
  return `${index + 1}. ${statusIcon(dna.momentum.status)} ${shortKey(dna.key)} | M ${signed(dna.momentum.score, 1)} | N${dna.total}\n` +
    `   Son20 Exp ${signed(w20.expectancy, 4)} PF ${w20.profitFactor.toFixed(2)} Net ${signed(w20.net, 2)} | İstikrar %${dna.stability.score.toFixed(0)}`;
}

function telegramText(model, options = {}) {
  if (options.enabled === false) return '';
  const limit = Math.max(1, num(options.limit, 3));
  let text = `\n\n🧬 <b>DNA EVOLUTION ENGINE — A6</b>\n`;
  if (!model.source?.exists) {
    text += `BlackBox geçmiş dosyası bulunamadı; kapanışlar biriktikçe evrim analizi başlayacak.`;
    return text;
  }
  text += `Kapanış: ${model.totalTrades} | DNA: ${model.totalDnas} | Olgun veri: ${model.eligibleDnas}\n`;
  text += `🟢 Güçlenen ${model.strengtheningCount} | 🔴 Zayıflayan ${model.weakeningCount} | ⚪ Stabil ${model.stableCount} | 🌱 Yeni ${model.newCount} | 💀 Riskli ${model.dyingCount}\n`;
  text += `🏆 <b>En hızlı güçlenen</b>\n${model.strengthening.slice(0, limit).length ? model.strengthening.slice(0, limit).map(dnaLine).join('\n') : 'Yeterli güçlenme sinyali yok.'}`;
  text += `\n⚠️ <b>En hızlı zayıflayan</b>\n${model.weakening.slice(0, limit).length ? model.weakening.slice(0, limit).map(dnaLine).join('\n') : 'Yeterli zayıflama sinyali yok.'}`;
  text += `\nℹ️ Rolling 10/20/50/100 izlenir; otomatik filtre uygulanmaz.`;
  return text;
}

module.exports = {
  VERSION,
  DEFAULT_JSONL,
  WINDOWS,
  dnaKeyOf,
  normalizeTrade,
  parseJsonlText,
  loadTrades,
  metrics,
  windowMetrics,
  momentumScore,
  stability,
  lifeStage,
  analyzeDna,
  buildFromTrades,
  build,
  telegramText
};
