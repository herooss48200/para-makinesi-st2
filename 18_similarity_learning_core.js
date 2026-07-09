/**
 * AGROS v3.5.0 - SIMILARITY LEARNING CORE
 *
 * Cluster Intelligence uzerine ogrenme cekirdegi.
 * Amac: Yeni bir islem icin gelecekte kullanilacak "gecmiste buna benzeyen
 * basarili/riskli davranislar" modelini hazirlamak.
 *
 * ONEMLI: Bu surum Trade Engine'e dokunmaz. Emir acmaz, kapatmaz, filtrelemez.
 * Sadece Intelligence Console icin benzerlik, ogrenme ve karar onerisi modeli uretir.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const clusterIntelligenceEngine = require('./17_cluster_intelligence_engine.js');

const DATA_DIR = path.join(__dirname, 'data');
const MODEL_JSON = path.join(DATA_DIR, 'agros-similarity-learning-core.json');
const MODEL_CSV = path.join(DATA_DIR, 'agros-similarity-learning-core.csv');

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
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normType(type) {
  return String(type || 'UNKNOWN').replace(/_RISK$/,'').replace(/CONFIDENCE_RISK/,'CONFIDENCE');
}

function learningToken(r) {
  return `${normType(r?.type)}:${String(r?.etiket || r?.token || r?.key || 'YOK')}`;
}

function evidenceWeight(r) {
  const support = Math.max(0, num(r?.support || r?.toplam || r?.successOrnek || r?.riskOrnek));
  const edge = Math.abs(num(r?.netEdge));
  const basariEdge = Math.abs(num(r?.basariEdge));
  const confidence = Math.max(num(r?.successBasari), 100 - num(r?.riskBasari), num(r?.confidence));
  const supportScore = Math.min(35, Math.log10(Math.max(1, support)) * 18);
  const edgeScore = Math.min(35, edge * 0.55);
  const basariScore = Math.min(20, basariEdge * 0.35);
  const confScore = Math.min(10, confidence * 0.10);
  return round(supportScore + edgeScore + basariScore + confScore, 3);
}

function normalizeCandidate(r, yon) {
  const support = num(r?.support || r?.toplam || r?.successOrnek || r?.riskOrnek);
  const successBasari = num(r?.successBasari ?? r?.basari);
  const riskBasari = num(r?.riskBasari);
  const netEdge = num(r?.netEdge);
  const basariEdge = num(r?.basariEdge);
  const weight = evidenceWeight(r);
  const similarityRole = yon === 'SUCCESS' ? 'BENZER_BASARILI_GECMIS' : yon === 'RISK' ? 'BENZER_RISKLI_GECMIS' : 'BELIRSIZ_GECMIS';
  return {
    yon,
    similarityRole,
    token: learningToken(r),
    type: normType(r?.type),
    etiket: String(r?.etiket || r?.token || r?.key || 'YOK'),
    sinif: String(r?.sinif || (yon === 'SUCCESS' ? 'POZITIF' : 'RISK')),
    support,
    successOrnek: num(r?.successOrnek),
    riskOrnek: num(r?.riskOrnek),
    successBasari: round(successBasari, 2),
    riskBasari: round(riskBasari, 2),
    successNet: round(num(r?.successNet), 4),
    riskNet: round(num(r?.riskNet), 4),
    netEdge: round(netEdge, 3),
    basariEdge: round(basariEdge, 3),
    evidenceWeight: weight,
    learningScore: round((yon === 'SUCCESS' ? 1 : -1) * weight, 3),
    yorum: yon === 'SUCCESS'
      ? 'Gelecekte yeni islem bu cekirdege benzerse pozitif gecmis benzerligi sayilacak.'
      : 'Gelecekte yeni islem bu cekirdege benzerse riskli gecmis benzerligi sayilacak.'
  };
}

function dedupe(list) {
  const m = new Map();
  for (const r of list) {
    const old = m.get(r.token);
    if (!old || Math.abs(num(r.learningScore)) > Math.abs(num(old.learningScore))) m.set(r.token, r);
  }
  return Array.from(m.values());
}

function buildSimilarityIndex(clusterModel) {
  const success = (clusterModel?.kararAdaylari || []).map(r => normalizeCandidate(r, 'SUCCESS'));
  const risk = (clusterModel?.riskAdaylari || []).map(r => normalizeCandidate(r, 'RISK'));
  const conflict = (clusterModel?.celiskiliKumeler || []).map(r => normalizeCandidate(r, 'CONFLICT'));
  const index = dedupe(success.concat(risk, conflict))
    .filter(r => num(r.support) >= num(ayarlar.similarityLearningMinSupport || ayarlar.clusterIntelligenceMinSupport || 3))
    .sort((a, b) => Math.abs(num(b.learningScore)) - Math.abs(num(a.learningScore)) || num(b.support) - num(a.support));
  return { success, risk, conflict, index };
}

function buildRecommendation(successList, riskList) {
  const s = successList.slice(0, num(ayarlar.similarityLearningTopAday || 10));
  const r = riskList.slice(0, num(ayarlar.similarityLearningTopAday || 10));
  const successPower = s.reduce((sum, x) => sum + Math.max(0, num(x.learningScore)), 0);
  const riskPower = r.reduce((sum, x) => sum + Math.max(0, -num(x.learningScore)), 0);
  const netLearningEdge = round(successPower - riskPower, 3);
  let karar = 'VERI_BIRIKIYOR';
  if (netLearningEdge >= num(ayarlar.similarityLearningEdgeEsik || 25)) karar = 'POZITIF_GECMIS_BENZERLIGI';
  else if (netLearningEdge <= -num(ayarlar.similarityLearningEdgeEsik || 25)) karar = 'RISKLI_GECMIS_BENZERLIGI';
  else if (successPower > 0 || riskPower > 0) karar = 'KARISIK_BENZERLIK';

  return {
    karar,
    successPower: round(successPower, 3),
    riskPower: round(riskPower, 3),
    netLearningEdge,
    yorum: 'Bu karar emir motorunu etkilemez. v3.5.0 sadece gecmis benzerlik modelini hazirlar ve raporlar.'
  };
}

function buildSimilarityLearningModel(options = {}) {
  const cluster = options.clusterModel || clusterIntelligenceEngine.buildClusterIntelligenceModel(options);
  const built = buildSimilarityIndex(cluster);
  const topLimit = num(ayarlar.similarityLearningTopAday || 10);
  const successList = built.index.filter(r => r.yon === 'SUCCESS').sort((a, b) => num(b.learningScore) - num(a.learningScore));
  const riskList = built.index.filter(r => r.yon === 'RISK').sort((a, b) => num(a.learningScore) - num(b.learningScore));
  const conflictList = built.index.filter(r => r.yon === 'CONFLICT');
  const recommendation = buildRecommendation(successList, riskList);

  return {
    version: 'v3.5.0-SIMILARITY-LEARNING-CORE',
    createdAt: new Date().toISOString(),
    aciklama: 'Yeni islemler icin gelecekte kullanilacak gecmis benzerlik cekirdegini kurar: basarili/riskli kumelerden similarity index uretir. Trade Engine degismez.',
    emirMotoruMudahalesi: false,
    ayarlar: {
      minSupport: num(ayarlar.similarityLearningMinSupport || ayarlar.clusterIntelligenceMinSupport || 3),
      topAday: topLimit,
      edgeEsik: num(ayarlar.similarityLearningEdgeEsik || 25)
    },
    kaynak: {
      clusterVersion: cluster?.version || 'N/A',
      kararAdayi: cluster?.ozet?.kararAdayi || 0,
      riskAdayi: cluster?.ozet?.riskAdayi || 0,
      celiskiliKume: cluster?.ozet?.celiskiliKume || 0
    },
    recommendation,
    successSimilarity: successList.slice(0, topLimit),
    riskSimilarity: riskList.slice(0, topLimit),
    conflictSimilarity: conflictList.slice(0, Math.min(5, topLimit)),
    similarityIndex: built.index.slice(0, Math.max(topLimit * 3, 30)),
    yorum: 'v3.5.0 ile AGROS artik en basarili/riskli kumeleri sadece listelemez; bunlari gelecekteki islemler icin benzerlik cekirdegi olarak hazirlar.'
  };
}

function writeConsoleModel(model = buildSimilarityLearningModel()) {
  if (ayarlar.similarityLearningExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(MODEL_JSON, JSON.stringify(model, null, 2));
    const cols = ['yon','similarityRole','type','etiket','sinif','support','successBasari','riskBasari','netEdge','basariEdge','evidenceWeight','learningScore'];
    const rows = model.similarityIndex || [];
    fs.writeFileSync(MODEL_CSV, [cols.join(';')].concat(rows.map(r => cols.map(c => csvSafe(r[c])).join(';'))).join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [SIMILARITY LEARNING CORE] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function satir(r, i) {
  return `${i + 1}) [${htmlSafe(r.type)}] ${htmlSafe(r.etiket)}\n` +
    `   ${htmlSafe(r.similarityRole)} | Skor ${num(r.learningScore).toFixed(1)} | Kanıt ${num(r.evidenceWeight).toFixed(1)} | Support ${r.support} | Edge ${num(r.netEdge).toFixed(1)}`;
}

function telegramMetni(model = buildSimilarityLearningModel()) {
  if (ayarlar.similarityLearningAktif === false) return '';
  const rec = model.recommendation || {};
  let metin = `\n\n🧠 <b>SIMILARITY LEARNING CORE v3.5.0</b>\n` +
    `Amaç: Geçmişteki başarılı/riskli kümeleri gelecekteki işlemler için benzerlik çekirdeğine çevirmek. Emir motoruna müdahale yok.\n` +
    `📦 Karar: ${htmlSafe(rec.karar)} | Pozitif Güç ${num(rec.successPower).toFixed(1)} | Risk Gücü ${num(rec.riskPower).toFixed(1)} | Net Edge ${num(rec.netLearningEdge).toFixed(1)}\n`;

  if (model.successSimilarity?.length) {
    metin += `\n🏆 <b>Başarılı Geçmiş Benzerlik Çekirdeği</b>\n` + model.successSimilarity.slice(0, 5).map(satir).join('\n');
  } else {
    metin += `\nHenüz başarılı geçmiş benzerlik çekirdeği için yeterli veri yok.`;
  }

  if (model.riskSimilarity?.length) {
    metin += `\n\n⚠️ <b>Riskli Geçmiş Benzerlik Çekirdeği</b>\n` + model.riskSimilarity.slice(0, 4).map(satir).join('\n');
  }

  metin += `\n\n📁 Konsol çıktısı: data/agros-similarity-learning-core.json + .csv`;
  return metin;
}

function telegramMetniVeExport() {
  const model = buildSimilarityLearningModel();
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildSimilarityLearningModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  dosyalar: { MODEL_JSON, MODEL_CSV }
};
