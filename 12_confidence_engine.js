const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const featureImportanceLab = require('./9_feature_importance_lab.js');
const pairImportanceLab = require('./10_pair_importance_lab.js');
const tripleDnaLab = require('./11_triple_dna_lab.js');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIDENCE_MODEL_JSON = path.join(DATA_DIR, 'agros-confidence-engine.json');
const CONFIDENCE_MODEL_CSV = path.join(DATA_DIR, 'agros-confidence-engine.csv');

const DEFAULT_TOP_LIMIT = 10;
const DEFAULT_MIN_ORNEK = 3;

function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function pct(v, digits = 1) {
  return num(v).toFixed(digits);
}

function htmlSafe(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function profitFactorDegeri(v) {
  if (v === 'INF' || v === '∞') return 5;
  if (v === null || v === undefined || v === 'N/A') return 0;
  return Math.max(0, Math.min(5, num(v)));
}

function sonucToplam(r) {
  return num(r?.tp) + num(r?.sl);
}

function guvenSeviyesi(score, toplam) {
  const s = num(score);
  const n = num(toplam);
  if (n < num(ayarlar.confidenceEngineMinOrnek || DEFAULT_MIN_ORNEK)) return 'DATA_WAIT';
  if (s >= 80) return 'A_PLUS';
  if (s >= 68) return 'A';
  if (s >= 55) return 'B';
  if (s >= 42) return 'C';
  return 'D_RISK';
}

function riskSeviyesi(score) {
  const s = num(score);
  if (s <= 25) return 'COK_RISKLI';
  if (s <= 40) return 'RISKLI';
  if (s <= 55) return 'NOTR';
  if (s <= 70) return 'GUCLU';
  return 'COK_GUCLU';
}

function globalOzet(o) {
  const long = o?.long || {};
  const short = o?.short || {};
  const tp = num(long.tp) + num(short.tp);
  const sl = num(long.sl) + num(short.sl);
  const be = num(long.be) + num(short.be);
  const toplam = num(long.toplam) + num(short.toplam);
  const net = num(long.net) + num(short.net);
  const n = tp + sl;
  return {
    tp,
    sl,
    be,
    toplam,
    net,
    sonucToplam: n,
    basari: n > 0 ? (tp / n) * 100 : 0,
    slOrani: n > 0 ? (sl / n) * 100 : 0
  };
}

function satirKaynak(r, tip, agirlik, scoreField) {
  const tpOrani = num(r?.tpOrani ?? r?.basariOrani);
  const slOrani = num(r?.slOrani);
  const net = num(r?.net);
  const toplam = num(r?.toplam);
  const pf = profitFactorDegeri(r?.profitFactor ?? r?.profitFactorText);
  const ayirt = num(r?.ayirtEdicilik);
  const confidence = num(r?.confidenceScore ?? r?.confidence ?? 0);
  const rawScore = num(r?.[scoreField] ?? r?.discriminativeScore ?? confidence);
  const veriAgirligi = Math.min(1, toplam / Math.max(1, num(ayarlar.confidenceEngineHighOrnek || 25)));
  const edge = tpOrani - slOrani;
  const netKatki = Math.max(-15, Math.min(15, net * 1.5));
  const pfKatki = pf > 0 ? Math.min(14, pf * 3) : -5;
  const confidenceKatki = confidence > 0 ? (confidence - 50) * 0.20 : 0;
  const rawKatki = Math.max(-20, Math.min(20, rawScore * 0.20));
  const kaliteSkoru = Math.max(0, Math.min(100,
    50 + (edge * 0.35) + (ayirt * 0.20) + netKatki + pfKatki + confidenceKatki + rawKatki
  )) * veriAgirligi;

  return {
    tip,
    key: String(r?.key || ''),
    etiket: String(r?.etiket || r?.label || r?.key || tip),
    toplam,
    tp: num(r?.tp),
    sl: num(r?.sl),
    be: num(r?.be),
    sonucToplam: sonucToplam(r),
    tpOrani,
    slOrani,
    beOrani: num(r?.beOrani),
    net,
    ortNet: num(r?.ortNet),
    profitFactorText: String(r?.profitFactorText ?? r?.profitFactor ?? 'N/A'),
    ayirtEdicilik: ayirt,
    confidenceScore: confidence,
    rawScore,
    kaliteSkoru,
    veriAgirligi,
    agirlik,
    agirlikliSkor: kaliteSkoru * agirlik
  };
}

function normalizeSources(featureModel, pairModel, tripleModel) {
  const out = [];
  const min = num(ayarlar.confidenceEngineMinOrnek || DEFAULT_MIN_ORNEK);

  for (const r of (featureModel?.yeterliOzellikler || [])) {
    if (num(r.toplam) >= min) out.push(satirKaynak(r, 'FEATURE', 0.20, 'featureScore'));
  }
  for (const r of (pairModel?.yeterliPairler || [])) {
    if (num(r.toplam) >= min) out.push(satirKaynak(r, 'PAIR', 0.30, 'pairScore'));
  }
  for (const r of (tripleModel?.yeterliTripleler || [])) {
    if (num(r.toplam) >= min) out.push(satirKaynak(r, 'TRIPLE', 0.50, 'tripleScore'));
  }
  return out;
}

function compositeConfidence(r, global) {
  const globalBase = num(global?.basari, 50);
  const edge = num(r.tpOrani) - globalBase;
  const slEdge = num(global?.slOrani) - num(r.slOrani);
  const data = Math.min(1, num(r.toplam) / Math.max(1, num(ayarlar.confidenceEngineHighOrnek || 25)));
  const pf = profitFactorDegeri(r.profitFactorText);
  const netKatki = Math.max(-12, Math.min(12, num(r.net) * 1.2));
  const dnaKatki = Math.max(-16, Math.min(16, num(r.ayirtEdicilik) * 0.22));
  const labKatki = Math.max(-18, Math.min(18, (num(r.kaliteSkoru) - 50) * 0.32));
  const tipBonus = r.tip === 'TRIPLE' ? 5 : r.tip === 'PAIR' ? 2 : 0;
  const raw = 50 + (edge * 0.42) + (slEdge * 0.20) + (pf * 2.2) + netKatki + dnaKatki + labKatki + tipBonus;
  const score = Math.max(0, Math.min(100, (raw * (0.45 + data * 0.55))));
  return {
    ...r,
    globalBase,
    edge,
    slEdge,
    confidenceComposite: score,
    confidenceLevel: guvenSeviyesi(score, r.toplam),
    riskLevel: riskSeviyesi(score)
  };
}

function sortGuclu(a, b) {
  return num(b.confidenceComposite) - num(a.confidenceComposite) || num(b.net) - num(a.net) || num(b.toplam) - num(a.toplam);
}

function sortRiskli(a, b) {
  return num(a.confidenceComposite) - num(b.confidenceComposite) || num(a.net) - num(b.net) || num(b.toplam) - num(a.toplam);
}

function buildConfidenceModel(options = {}) {
  const o = options.blackboxOzet || h.state.blackboxOzet || {};
  const global = globalOzet(o);
  const featureModel = options.featureModel || featureImportanceLab.buildFeatureImportanceModel(o);
  const pairModel = options.pairModel || pairImportanceLab.buildPairImportanceModel(o);
  const tripleModel = options.tripleModel || tripleDnaLab.buildTripleDnaModel(o);
  const limit = num(options.limit ?? ayarlar.confidenceEngineTopAday, DEFAULT_TOP_LIMIT);
  const minOrnek = num(options.minOrnek ?? ayarlar.confidenceEngineMinOrnek, DEFAULT_MIN_ORNEK);
  const kaynaklar = normalizeSources(featureModel, pairModel, tripleModel)
    .map(r => compositeConfidence(r, global));
  const yeterli = kaynaklar.filter(r => num(r.toplam) >= minOrnek);

  const guclu = yeterli
    .filter(r => num(r.confidenceComposite) >= num(ayarlar.confidenceEngineGucluEsik || 58) && (num(r.net) > 0 || num(r.edge) > 0))
    .sort(sortGuclu)
    .slice(0, limit);

  const riskli = yeterli
    .filter(r => num(r.confidenceComposite) <= num(ayarlar.confidenceEngineRiskEsik || 42) || num(r.net) < 0 || num(r.slOrani) > num(r.tpOrani))
    .sort(sortRiskli)
    .slice(0, limit);

  const izlemeAdaylari = yeterli
    .filter(r => r.tip === 'TRIPLE' || r.tip === 'PAIR')
    .sort((a, b) => Math.abs(num(b.edge)) - Math.abs(num(a.edge)) || num(b.toplam) - num(a.toplam))
    .slice(0, limit);

  return {
    version: 'v3.2.7-CONFIDENCE-ENGINE',
    createdAt: new Date().toISOString(),
    aciklama: 'Feature + Pair + Triple DNA Lab sonuclarini tek matematiksel guven puaninda birlestirir. Trade Engine degistirilmez; sadece analiz/rapor katmanidir.',
    ayarlar: { minOrnek, limit },
    global,
    sayaclar: {
      feature: (featureModel?.yeterliOzellikler || []).length,
      pair: (pairModel?.yeterliPairler || []).length,
      triple: (tripleModel?.yeterliTripleler || []).length,
      toplamKaynak: kaynaklar.length,
      yeterliKaynak: yeterli.length
    },
    gucluConfidence: guclu,
    riskliConfidence: riskli,
    izlemeAdaylari,
    tumKaynaklar: yeterli.sort(sortGuclu)
  };
}

function csvSafe(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeConsoleModel(model = buildConfidenceModel()) {
  if (ayarlar.confidenceEngineConsoleExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIDENCE_MODEL_JSON, JSON.stringify(model, null, 2));
    const rows = model.tumKaynaklar || [];
    const cols = ['tip','key','etiket','toplam','tp','sl','be','tpOrani','slOrani','beOrani','net','ortNet','profitFactorText','globalBase','edge','slEdge','ayirtEdicilik','kaliteSkoru','rawScore','confidenceScore','confidenceComposite','confidenceLevel','riskLevel'];
    const csv = [cols.join(';')]
      .concat(rows.map(r => cols.map(c => csvSafe(r[c])).join(';')))
      .join('\n');
    fs.writeFileSync(CONFIDENCE_MODEL_CSV, csv);
    return true;
  } catch (err) {
    console.error('[CONFIDENCE ENGINE EXPORT HATASI]', err.message);
    return false;
  }
}

function confidenceSatiri(r, i) {
  const score = num(r.confidenceComposite);
  const edge = num(r.edge);
  const slEdge = num(r.slEdge);
  return `${i + 1}) [${htmlSafe(r.tip)}] ${htmlSafe(r.etiket)}\n` +
    `   🎯 Confidence %${pct(score, 1)} | Seviye ${htmlSafe(r.confidenceLevel)} | Risk ${htmlSafe(r.riskLevel)} | Örnek ${r.toplam}\n` +
    `   📌 TP:${r.tp} SL:${r.sl} BE:${r.be} | Başarı %${pct(r.tpOrani, 1)} | Global üstü ${edge >= 0 ? '+' : ''}${pct(edge, 1)} | SL fark ${slEdge >= 0 ? '+' : ''}${pct(slEdge, 1)}\n` +
    `   💰 Net ${pct(r.net, 2)} | PF ${htmlSafe(r.profitFactorText)} | DNA ${num(r.ayirtEdicilik) >= 0 ? '+' : ''}${pct(r.ayirtEdicilik, 1)} | LabSkor %${pct(r.kaliteSkoru, 1)}`;
}

function telegramMetni(model = buildConfidenceModel()) {
  if (ayarlar.confidenceEngineAktif === false) return '';
  const min = model.ayarlar?.minOrnek || DEFAULT_MIN_ORNEK;
  const kapanan = num(model.global?.tp) + num(model.global?.sl) + num(model.global?.be);
  let metin = `\n\n🧠 <b>CONFIDENCE ENGINE v3.2.7</b>\n` +
    `Amaç: Feature + Pair + Triple DNA sonuçlarını tek güven puanında birleştirmek. Emir motoruna müdahale yok.\n` +
    `📦 BlackBox kapanış: ${kapanan || num(model.global?.toplam)} | Kaynak: F${model.sayaclar?.feature || 0}/P${model.sayaclar?.pair || 0}/T${model.sayaclar?.triple || 0} | Min örnek: ${min}\n`;

  if (!model.tumKaynaklar || !model.tumKaynaklar.length) {
    metin += `Henüz güvenilir Confidence Engine için yeterli veri yok. Feature/Pair/Triple DNA örnekleri biriktikçe bu bölüm dolacak.`;
    return metin;
  }

  if (model.gucluConfidence?.length) {
    metin += `\n✅ <b>Yüksek Güven DNA Adayları</b>\n` + model.gucluConfidence.map(confidenceSatiri).join('\n');
  }
  if (model.riskliConfidence?.length) {
    metin += `\n\n🚫 <b>Düşük Güven / Riskli DNA Adayları</b>\n` + model.riskliConfidence.map(confidenceSatiri).join('\n');
  }
  if (model.izlemeAdaylari?.length) {
    metin += `\n\n👁️ <b>Watch Mode İçin İzlenecek DNA'lar</b>\n` + model.izlemeAdaylari.map(confidenceSatiri).join('\n');
  }
  metin += `\n\n📁 Konsol çıktısı: data/agros-confidence-engine.json + .csv`;
  return metin;
}

function telegramMetniVeExport(model = buildConfidenceModel()) {
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildConfidenceModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  dosyalar: { CONFIDENCE_MODEL_JSON, CONFIDENCE_MODEL_CSV }
};
