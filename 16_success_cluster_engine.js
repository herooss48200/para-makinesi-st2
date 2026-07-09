/**
 * AGROS v3.4.1 - SUCCESS CLUSTER ENGINE FOUNDATION
 *
 * Trade Engine'e dokunmaz.
 * Feature + Pair + Triple + Confidence + Exit verilerini tek öğrenme haritasında birleştirir.
 * Amaç: En başarılı imzaların kesişen kümelerini görünür yapmak.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const featureLab = require('./9_feature_importance_lab.js');
const pairLab = require('./10_pair_importance_lab.js');
const tripleLab = require('./11_triple_dna_lab.js');
const confidenceEngine = require('./12_confidence_engine.js');
const exitOptimizer = require('./15_exit_optimizer_foundation.js');

const DATA_DIR = path.join(__dirname, 'data');
const MODEL_JSON = path.join(DATA_DIR, 'agros-success-cluster-engine.json');
const MODEL_CSV = path.join(DATA_DIR, 'agros-success-cluster-engine.csv');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, digits = 3) {
  return Number(num(v).toFixed(digits));
}

function htmlSafe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function csvSafe(v) {
  const s = typeof v === 'object' ? JSON.stringify(v ?? '') : String(v ?? '');
  if (/["]|[;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function safeBuild(name, fn) {
  try { return { name, ok: true, model: fn() }; }
  catch (err) { return { name, ok: false, error: err.message, model: null }; }
}

function rate(r) {
  const tp = num(r?.tp);
  const sl = num(r?.sl);
  const n = tp + sl;
  if (n <= 0) return num(r?.tpOrani ?? r?.basari ?? r?.actualBasari ?? 0);
  return (tp / n) * 100;
}

function confidence(r) {
  return num(r?.confidenceComposite ?? r?.confidenceScore ?? r?.confidence ?? r?.finalScore ?? r?.tripleScore ?? r?.pairScore ?? r?.importanceScore ?? 0);
}

function label(r) {
  return String(r?.etiket || r?.label || r?.key || 'YOK');
}

function sourceKey(type, r) {
  return `${type}:${String(r?.key || label(r)).slice(0, 220)}`;
}

function normalize(type, r, extra = {}) {
  const toplam = num(r?.toplam);
  const basari = rate(r);
  const net = num(r?.net);
  const conf = confidence(r);
  const edge = num(r?.ayirtEdicilik ?? r?.edge ?? r?.ortIyilesme ?? r?.pairIyilesme ?? r?.tekilIyilesme ?? 0);
  const pf = r?.profitFactor === 'INF' ? 99 : num(r?.profitFactor, 0);
  const veri = Math.min(1, toplam / Math.max(1, num(ayarlar.successClusterHighOrnek || 25)));
  const skor = ((basari - 50) * 0.38) + (conf * 0.20) + (edge * 0.22) + (Math.min(3, Math.max(0, pf)) * 6) + (Math.max(-25, Math.min(25, net)) * 0.20);
  return {
    type,
    key: sourceKey(type, r),
    rawKey: String(r?.key || ''),
    etiket: label(r),
    toplam,
    tp: num(r?.tp),
    sl: num(r?.sl),
    be: num(r?.be),
    basari: round(basari, 2),
    net: round(net, 4),
    confidence: round(conf, 2),
    edge: round(edge, 3),
    profitFactorText: r?.profitFactorText || (r?.profitFactor === 'INF' ? '∞' : (pf ? pf.toFixed(2) : 'N/A')),
    skor: round(skor * (0.45 + veri * 0.55), 3),
    guven: r?.guven || r?.confidenceLevel || r?.riskLevel || 'N/A',
    ...extra
  };
}

function collectSignals(feature, pair, triple, confidenceModel, exitModel) {
  const out = [];
  for (const r of feature?.gucluOzellikler || []) out.push(normalize('FEATURE', r, { kaynak: r.kaynak, grup: r.grup }));
  for (const r of pair?.gucluPairler || []) out.push(normalize('PAIR', r));
  for (const r of triple?.gucluTripleler || []) out.push(normalize('TRIPLE', r));
  for (const r of confidenceModel?.gucluConfidence || confidenceModel?.gucluAdaylar || confidenceModel?.topConfidence || []) out.push(normalize('CONFIDENCE', r));
  for (const r of exitModel?.signatures || []) {
    const toplam = num(r.toplam);
    out.push(normalize('EXIT_SIGNATURE', {
      key: r.key,
      etiket: r.label || r.key,
      toplam,
      tp: r.tp,
      sl: r.sl,
      be: r.be,
      net: r.net,
      tpOrani: r.basari,
      confidenceScore: r.ortPcr,
      ayirtEdicilik: Math.max(0, num(r.ortPcr) - 50),
      profitFactorText: `PCR %${num(r.ortPcr).toFixed(1)}`,
      guven: 'EXIT'
    }, { ortPcr: num(r.ortPcr), ortMfe: num(r.ortMfe), ortMissed: num(r.ortMissed) }));
  }
  return out
    .filter(r => r.toplam >= num(ayarlar.successClusterMinOrnek || 3))
    .sort((a, b) => num(b.skor) - num(a.skor) || num(b.toplam) - num(a.toplam));
}

function collectRisks(feature, pair, triple, confidenceModel) {
  const out = [];
  for (const r of feature?.riskliOzellikler || []) out.push(normalize('FEATURE_RISK', r, { kaynak: r.kaynak, grup: r.grup }));
  for (const r of pair?.riskliPairler || []) out.push(normalize('PAIR_RISK', r));
  for (const r of triple?.riskliTripleler || []) out.push(normalize('TRIPLE_RISK', r));
  for (const r of confidenceModel?.riskliConfidence || confidenceModel?.riskliAdaylar || confidenceModel?.riskAdaylari || []) out.push(normalize('CONFIDENCE_RISK', r));
  return out
    .filter(r => r.toplam >= num(ayarlar.successClusterMinOrnek || 3))
    .sort((a, b) => num(a.skor) - num(b.skor) || num(b.toplam) - num(a.toplam));
}

function clusterFromSignals(signals) {
  const top = signals.slice(0, num(ayarlar.successClusterTopAday || 10));
  const byType = {};
  for (const r of top) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  }
  const avg = (arr, f) => arr.length ? arr.reduce((s, x) => s + num(f(x)), 0) / arr.length : 0;
  return {
    clusterId: `SUCCESS-${new Date().toISOString().slice(0, 10)}`,
    toplamSinyal: top.length,
    ortBasari: round(avg(top, x => x.basari), 2),
    ortConfidence: round(avg(top, x => x.confidence), 2),
    ortSkor: round(avg(top, x => x.skor), 2),
    tipDagilimi: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
    kesisenKume: top.map(r => ({ type: r.type, etiket: r.etiket, toplam: r.toplam, basari: r.basari, skor: r.skor, guven: r.guven })),
    yorum: 'Bu küme emir açmaz/kapatmaz; sadece geçmişte kazanan tarafı temsil eden kesişen ortak özellikleri gösterir.'
  };
}

function buildSuccessClusterModel(options = {}) {
  const feature = options.featureModel || safeBuild('Feature', () => featureLab.buildFeatureImportanceModel(options)).model;
  const pair = options.pairModel || safeBuild('Pair', () => pairLab.buildPairImportanceModel(options)).model;
  const triple = options.tripleModel || safeBuild('Triple', () => tripleLab.buildTripleDnaModel(options)).model;
  const conf = options.confidenceModel || safeBuild('Confidence', () => confidenceEngine.buildConfidenceModel(options)).model;
  const exit = options.exitModel || safeBuild('Exit', () => exitOptimizer.buildExitOptimizerModel(options)).model;

  const successSignals = collectSignals(feature, pair, triple, conf, exit);
  const riskSignals = collectRisks(feature, pair, triple, conf);
  const successCluster = clusterFromSignals(successSignals);
  const riskCluster = clusterFromSignals(riskSignals).kesisenKume;

  return {
    version: 'v3.4.1-SUCCESS-CLUSTER-FOUNDATION',
    createdAt: new Date().toISOString(),
    aciklama: 'En başarılı imzaların kesişen kümelerini Feature + Pair + Triple + Confidence + Exit verileriyle görünür yapar. Trade Engine değişmez.',
    emirMotoruMudahalesi: false,
    ayarlar: {
      minOrnek: num(ayarlar.successClusterMinOrnek || 3),
      topAday: num(ayarlar.successClusterTopAday || 10)
    },
    successCluster,
    successSignals: successSignals.slice(0, num(ayarlar.successClusterTopAday || 10)),
    riskSignals: riskSignals.slice(0, num(ayarlar.successClusterTopAday || 10)),
    riskCluster,
    kaynakOzet: {
      feature: feature?.gucluOzellikler?.length || 0,
      pair: pair?.gucluPairler?.length || 0,
      triple: triple?.gucluTripleler?.length || 0,
      confidence: (conf?.gucluConfidence || conf?.gucluAdaylar || conf?.topConfidence || []).length,
      exit: exit?.signatures?.length || 0
    }
  };
}

function writeConsoleModel(model = buildSuccessClusterModel()) {
  if (ayarlar.successClusterExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(MODEL_JSON, JSON.stringify(model, null, 2));
    const cols = ['type','etiket','toplam','tp','sl','be','basari','confidence','edge','skor','net','guven'];
    const rows = (model.successSignals || []).concat(model.riskSignals || []);
    fs.writeFileSync(MODEL_CSV, [cols.join(';')].concat(rows.map(r => cols.map(c => csvSafe(r[c])).join(';'))).join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [SUCCESS CLUSTER ENGINE] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function satir(r, i) {
  return `${i + 1}) [${htmlSafe(r.type)}] ${htmlSafe(r.etiket)}\n` +
    `   📌 ${r.toplam} örnek | Başarı %${num(r.basari).toFixed(1)} | Conf %${num(r.confidence).toFixed(1)} | Skor ${num(r.skor).toFixed(1)} | Net ${num(r.net).toFixed(2)} | ${htmlSafe(r.guven)}`;
}

function telegramMetni(model = buildSuccessClusterModel()) {
  if (ayarlar.successClusterAktif === false) return '';
  const c = model.successCluster || {};
  let metin = `\n\n🧠 <b>SUCCESS CLUSTER ENGINE v3.4.1</b>\n` +
    `Amaç: En başarılı imzaların kesişen kümesini bulmak. Emir motoruna müdahale yok.\n` +
    `📦 Success sinyal: ${(model.successSignals || []).length} | Risk sinyal: ${(model.riskSignals || []).length} | Küme başarı ort: %${num(c.ortBasari).toFixed(1)} | Küme skor: ${num(c.ortSkor).toFixed(1)}\n`;

  if (model.successSignals?.length) {
    metin += `\n🏆 <b>Kazanan Kesişim Kümesi</b>\n` + model.successSignals.slice(0, 6).map(satir).join('\n');
  } else {
    metin += `Henüz Success Cluster için yeterli veri yok. Feature/Pair/Triple/Confidence örnekleri çoğaldıkça bu bölüm dolacak.`;
  }

  if (model.riskSignals?.length) {
    metin += `\n\n⚠️ <b>Kaybeden/Risk Kesişim Kümesi</b>\n` + model.riskSignals.slice(0, 4).map(satir).join('\n');
  }

  metin += `\n\n📁 Konsol çıktısı: data/agros-success-cluster-engine.json + .csv`;
  return metin;
}

function telegramMetniVeExport() {
  const model = buildSuccessClusterModel();
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildSuccessClusterModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  dosyalar: { MODEL_JSON, MODEL_CSV }
};
