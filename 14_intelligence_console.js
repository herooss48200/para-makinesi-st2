/**
 * AGROS v3.3.0 - INTELLIGENCE CONSOLE FOUNDATION
 *
 * Tüm Intelligence Layer modüllerinin ortak özet modelini üretir.
 * Trade Engine'e dokunmaz; emir açmaz, kapatmaz, filtrelemez.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const featureImportanceLab = require('./9_feature_importance_lab.js');
const pairImportanceLab = require('./10_pair_importance_lab.js');
const tripleDnaLab = require('./11_triple_dna_lab.js');
const confidenceEngine = require('./12_confidence_engine.js');
const liveIntelligenceMonitor = require('./13_live_intelligence_monitor.js');
const exitOptimizer = require('./15_exit_optimizer_foundation.js');

const DATA_DIR = path.join(__dirname, 'data');
const CONSOLE_JSON = path.join(DATA_DIR, 'agros-intelligence-console.json');
const CONSOLE_CSV = path.join(DATA_DIR, 'agros-intelligence-console.csv');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function pct(v, digits = 1) {
  return num(v).toFixed(digits);
}

function htmlSafe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function csvSafe(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function safeBuild(name, fn, fallback = {}) {
  try {
    return { ok: true, name, model: fn() };
  } catch (err) {
    return { ok: false, name, error: err.message, model: fallback };
  }
}

function sonucN(r) {
  return num(r?.tp) + num(r?.sl);
}

function basari(r) {
  const n = sonucN(r);
  return n > 0 ? (num(r?.tp) / n) * 100 : 0;
}

function scoreItem(tip, r, extra = {}) {
  const toplam = num(r?.toplam || r?.toplamOrnek || r?.kaynakSayisi);
  const net = num(r?.net);
  const b = num(r?.basari ?? r?.actualBasari ?? basari(r));
  const conf = num(r?.confidenceComposite ?? r?.weightedScore ?? r?.score ?? b);
  const pf = r?.profitFactor === 'INF' ? 9 : num(r?.profitFactor);
  const ornekPuan = Math.min(25, Math.log10(Math.max(1, toplam)) * 12);
  const netPuan = Math.max(-15, Math.min(15, net));
  const pfPuan = Math.max(0, Math.min(15, pf * 4));
  const finalScore = Math.max(0, Math.min(100, (b * 0.40) + (conf * 0.30) + ornekPuan + netPuan + pfPuan));
  return {
    tip,
    key: String(r?.key || r?.bucket || r?.etiket || tip),
    etiket: String(r?.etiket || r?.bucket || r?.key || tip),
    toplam,
    tp: num(r?.tp),
    sl: num(r?.sl),
    be: num(r?.be),
    net,
    basari: b,
    confidence: conf,
    finalScore,
    confidenceLevel: r?.confidenceLevel || r?.kalibrasyon || r?.riskLevel || 'N/A',
    ...extra
  };
}

function collectTopSignals(featureModel, pairModel, tripleModel, confidenceModel, liveModel) {
  const items = [];
  const topLimit = num(ayarlar.intelligenceConsoleTopAday || 12);

  for (const r of (featureModel?.kazandiranlar || featureModel?.topKazandiranlar || [])) items.push(scoreItem('FEATURE', r));
  for (const r of (pairModel?.sinerjiAdaylari || pairModel?.kazandiranCiftler || pairModel?.topPairs || [])) items.push(scoreItem('PAIR', r));
  for (const r of (tripleModel?.sinerjiAdaylari || tripleModel?.kazandiranTriples || tripleModel?.topTriples || [])) items.push(scoreItem('TRIPLE', r));
  for (const r of (confidenceModel?.gucluAdaylar || confidenceModel?.topConfidence || [])) items.push(scoreItem('CONFIDENCE', r));
  for (const r of (liveModel?.buckets || [])) items.push(scoreItem('LIVE_BUCKET', r));

  const unique = new Map();
  for (const item of items) {
    const k = `${item.tip}:${item.key}`;
    const old = unique.get(k);
    if (!old || num(item.finalScore) > num(old.finalScore)) unique.set(k, item);
  }

  return Array.from(unique.values())
    .filter(r => num(r.toplam) >= num(ayarlar.intelligenceConsoleMinOrnek || 3))
    .sort((a, b) => num(b.finalScore) - num(a.finalScore) || num(b.toplam) - num(a.toplam))
    .slice(0, topLimit);
}

function collectRiskSignals(confidenceModel, liveModel) {
  const items = [];
  const topLimit = num(ayarlar.intelligenceConsoleTopAday || 12);
  for (const r of (confidenceModel?.riskliAdaylar || confidenceModel?.riskAdaylari || [])) items.push(scoreItem('CONFIDENCE_RISK', r));
  for (const r of (liveModel?.uyumsuzYuksekGuven || [])) items.push(scoreItem('LIVE_MISMATCH', r));
  for (const r of (liveModel?.kalibrasyonSapmalari || [])) items.push(scoreItem('CALIBRATION_DRIFT', r));
  return items
    .filter(r => num(r.toplam) >= num(ayarlar.intelligenceConsoleMinOrnek || 3))
    .sort((a, b) => num(a.net) - num(b.net) || num(b.confidence) - num(a.confidence))
    .slice(0, topLimit);
}

function moduleHealth(results) {
  return results.map(r => ({
    name: r.name,
    ok: r.ok,
    error: r.error || null,
    version: r.model?.version || 'N/A',
    sayaclar: r.model?.sayaclar || null
  }));
}

function buildIntelligenceConsoleModel(options = {}) {
  const feature = safeBuild('Feature Importance', () => featureImportanceLab.buildFeatureImportanceModel(options));
  const pair = safeBuild('Pair Importance', () => pairImportanceLab.buildPairImportanceModel(options));
  const triple = safeBuild('Triple DNA', () => tripleDnaLab.buildTripleDnaModel(options));
  const confidence = safeBuild('Confidence Engine', () => confidenceEngine.buildConfidenceModel(options));
  const live = safeBuild('Live Intelligence Monitor', () => liveIntelligenceMonitor.buildLiveMonitorModel({ ...options, confidenceModel: confidence.model }));
  const exit = safeBuild('Exit Optimizer', () => exitOptimizer.buildExitOptimizerModel(options));
  const results = [feature, pair, triple, confidence, live, exit];

  const topSignals = collectTopSignals(feature.model, pair.model, triple.model, confidence.model, live.model);
  const riskSignals = collectRiskSignals(confidence.model, live.model);
  const global = confidence.model?.global || live.model?.global || {};

  return {
    version: 'v3.3.0-INTELLIGENCE-CONSOLE-FOUNDATION',
    createdAt: new Date().toISOString(),
    aciklama: 'Feature, Pair, Triple, Confidence ve Live Monitor ciktisini tek Intelligence Snapshot altinda toplar. Trade Engine degismez.',
    global,
    health: moduleHealth(results),
    sayaclar: {
      moduleOk: results.filter(r => r.ok).length,
      moduleTotal: results.length,
      topSignal: topSignals.length,
      riskSignal: riskSignals.length,
      exitKapanis: exit.model?.global?.toplamKapanis || 0,
      exitOrtPcr: exit.model?.global?.ortPcr || 0
    },
    topSignals,
    riskSignals
  };
}

function writeConsoleModel(model = buildIntelligenceConsoleModel()) {
  if (ayarlar.intelligenceConsoleExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(CONSOLE_JSON, JSON.stringify(model, null, 2));
    const cols = ['tip','etiket','toplam','tp','sl','be','basari','confidence','finalScore','net','confidenceLevel'];
    const rows = (model.topSignals || []).concat(model.riskSignals || []);
    const csv = [cols.join(';')].concat(rows.map(r => cols.map(c => csvSafe(r[c])).join(';'))).join('\n');
    fs.writeFileSync(CONSOLE_CSV, csv);
    return true;
  } catch (err) {
    console.error('[INTELLIGENCE CONSOLE EXPORT HATASI]', err.message);
    return false;
  }
}

function signalSatiri(r, i) {
  return `${i + 1}) [${htmlSafe(r.tip)}] ${htmlSafe(r.etiket)}\n` +
    `   🧠 Score %${pct(r.finalScore, 1)} | Conf %${pct(r.confidence, 1)} | Başarı %${pct(r.basari, 1)} | Örnek ${r.toplam}\n` +
    `   📌 TP:${r.tp} SL:${r.sl} BE:${r.be} | Net ${pct(r.net, 2)} | ${htmlSafe(r.confidenceLevel)}`;
}

function telegramMetni(model = buildIntelligenceConsoleModel()) {
  if (ayarlar.intelligenceConsoleAktif === false) return '';
  const g = model.global || {};
  let metin = `\n\n🖥️ <b>INTELLIGENCE CONSOLE FOUNDATION v3.3.0</b>\n` +
    `Amaç: Feature + Pair + Triple + Confidence + Live Monitor çıktılarını tek snapshot altında toplamak. Emir motoruna müdahale yok.\n` +
    `📦 Modül: ${model.sayaclar.moduleOk}/${model.sayaclar.moduleTotal} OK | Global başarı %${pct(g.basari, 1)} | Net ${pct(g.net, 2)} | Top Signal ${model.sayaclar.topSignal} | Risk ${model.sayaclar.riskSignal} | Exit PCR %${pct(model.sayaclar.exitOrtPcr, 1)}`;

  if (model.topSignals && model.topSignals.length) {
    metin += `\n\n🏆 <b>Birleşik En Güçlü Intelligence Sinyalleri</b>\n` + model.topSignals.slice(0, 6).map(signalSatiri).join('\n');
  } else {
    metin += `\nHenüz birleşik Intelligence sinyali için yeterli veri yok.`;
  }

  if (model.riskSignals && model.riskSignals.length) {
    metin += `\n\n⚠️ <b>İzlenecek Risk / Sapma Sinyalleri</b>\n` + model.riskSignals.slice(0, 4).map(signalSatiri).join('\n');
  }

  return metin;
}

function telegramMetniVeExport() {
  const model = buildIntelligenceConsoleModel();
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildIntelligenceConsoleModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport
};
