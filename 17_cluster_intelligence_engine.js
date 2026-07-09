/**
 * AGROS v3.4.2 - CLUSTER INTELLIGENCE ENGINE
 *
 * Success Cluster Foundation uzerine ikinci zeka katmani.
 * Amac: Kazanan ve kaybeden kumeleri karsilastirmak, ortak/ayrisan ozellikleri
 * gorunur yapmak ve gelecekteki Adaptive Manager icin karar verisi uretmek.
 *
 * ONEMLI: Trade Engine'e dokunmaz. Emir acmaz, kapatmaz, filtrelemez.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const successClusterEngine = require('./16_success_cluster_engine.js');

const DATA_DIR = path.join(__dirname, 'data');
const MODEL_JSON = path.join(DATA_DIR, 'agros-cluster-intelligence-engine.json');
const MODEL_CSV = path.join(DATA_DIR, 'agros-cluster-intelligence-engine.csv');

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
  if (/["];|[\n\r]/.test(s) || s.includes(';')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function featureToken(r) {
  const type = String(r?.type || r?.tip || 'UNKNOWN').replace(/_RISK$/,'');
  const etiket = String(r?.etiket || r?.label || r?.key || 'YOK');
  return `${type}:${etiket}`;
}

function successScore(r) {
  const basari = num(r?.basari);
  const skor = num(r?.skor ?? r?.finalScore);
  const conf = num(r?.confidence);
  const net = num(r?.net);
  const toplam = num(r?.toplam);
  return round((basari * 0.34) + (skor * 0.30) + (conf * 0.18) + (Math.min(50, toplam) * 0.18) + (Math.max(-20, Math.min(20, net)) * 0.20), 3);
}

function riskScore(r) {
  const basari = num(r?.basari);
  const skor = num(r?.skor ?? r?.finalScore);
  const conf = num(r?.confidence);
  const net = num(r?.net);
  const toplam = num(r?.toplam);
  return round(((100 - basari) * 0.34) + (Math.max(0, 50 - skor) * 0.22) + (conf * 0.10) + (Math.min(50, toplam) * 0.20) + (Math.max(0, -net) * 0.35), 3);
}

function enrich(r, yon) {
  const token = featureToken(r);
  const raw = {
    yon,
    token,
    type: String(r?.type || r?.tip || 'UNKNOWN'),
    etiket: String(r?.etiket || r?.label || r?.key || token),
    toplam: num(r?.toplam),
    tp: num(r?.tp),
    sl: num(r?.sl),
    be: num(r?.be),
    basari: round(num(r?.basari), 2),
    confidence: round(num(r?.confidence), 2),
    skor: round(num(r?.skor ?? r?.finalScore), 3),
    net: round(num(r?.net), 4),
    guven: String(r?.guven || r?.confidenceLevel || 'N/A')
  };
  raw.clusterScore = yon === 'SUCCESS' ? successScore(raw) : riskScore(raw);
  return raw;
}

function indexByToken(list) {
  const m = new Map();
  for (const r of list) {
    const old = m.get(r.token);
    if (!old || num(r.clusterScore) > num(old.clusterScore)) m.set(r.token, r);
  }
  return m;
}

function compareClusters(successSignals, riskSignals) {
  const successMap = indexByToken(successSignals);
  const riskMap = indexByToken(riskSignals);
  const allTokens = new Set([...successMap.keys(), ...riskMap.keys()]);

  const rows = [];
  for (const token of allTokens) {
    const s = successMap.get(token);
    const r = riskMap.get(token);
    const support = num(s?.toplam) + num(r?.toplam);
    const netEdge = num(s?.clusterScore) - num(r?.clusterScore);
    const basariEdge = num(s?.basari) - num(r?.basari);
    let sinif = 'NÖTR/İZLE';
    if (s && !r) sinif = 'SAF_KAZANAN';
    else if (!s && r) sinif = 'SAF_RISK';
    else if (netEdge >= num(ayarlar.clusterIntelligenceEdgeEsik || 12)) sinif = 'KAZANAN_AGIRLIKLI';
    else if (netEdge <= -num(ayarlar.clusterIntelligenceEdgeEsik || 12)) sinif = 'RISK_AGIRLIKLI';
    else if (s && r) sinif = 'CELISKILI_KUME';

    rows.push({
      token,
      type: String(s?.type || r?.type || 'UNKNOWN').replace(/_RISK$/,''),
      etiket: String(s?.etiket || r?.etiket || token),
      sinif,
      support,
      successScore: round(num(s?.clusterScore), 3),
      riskScore: round(num(r?.clusterScore), 3),
      netEdge: round(netEdge, 3),
      basariEdge: round(basariEdge, 2),
      successBasari: round(num(s?.basari), 2),
      riskBasari: round(num(r?.basari), 2),
      successOrnek: num(s?.toplam),
      riskOrnek: num(r?.toplam),
      successNet: round(num(s?.net), 4),
      riskNet: round(num(r?.net), 4),
      guven: String(s?.guven || r?.guven || 'N/A')
    });
  }
  return rows.sort((a, b) => Math.abs(num(b.netEdge)) - Math.abs(num(a.netEdge)) || num(b.support) - num(a.support));
}

function groupSummary(rows) {
  const out = {};
  for (const r of rows) {
    const key = r.sinif || 'BILINMIYOR';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function topBy(rows, predicate, sorter, limit) {
  return rows.filter(predicate).sort(sorter).slice(0, limit);
}

function buildClusterIntelligenceModel(options = {}) {
  const base = options.successClusterModel || successClusterEngine.buildSuccessClusterModel(options);
  const limit = num(ayarlar.clusterIntelligenceTopAday || 10);
  const successSignals = (base.successSignals || []).map(r => enrich(r, 'SUCCESS'));
  const riskSignals = (base.riskSignals || []).map(r => enrich(r, 'RISK'));
  const rows = compareClusters(successSignals, riskSignals);

  const safKazananlar = topBy(rows, r => r.sinif === 'SAF_KAZANAN' || r.sinif === 'KAZANAN_AGIRLIKLI', (a,b) => num(b.netEdge)-num(a.netEdge), limit);
  const safRiskler = topBy(rows, r => r.sinif === 'SAF_RISK' || r.sinif === 'RISK_AGIRLIKLI', (a,b) => num(a.netEdge)-num(b.netEdge), limit);
  const celiskiliKumeler = topBy(rows, r => r.sinif === 'CELISKILI_KUME', (a,b) => num(b.support)-num(a.support), limit);
  const kararAdaylari = safKazananlar.filter(r => r.support >= num(ayarlar.clusterIntelligenceMinSupport || 3) && r.netEdge >= num(ayarlar.clusterIntelligenceEdgeEsik || 12));
  const riskAdaylari = safRiskler.filter(r => r.support >= num(ayarlar.clusterIntelligenceMinSupport || 3) && r.netEdge <= -num(ayarlar.clusterIntelligenceEdgeEsik || 12));

  return {
    version: 'v3.4.2-CLUSTER-INTELLIGENCE',
    createdAt: new Date().toISOString(),
    aciklama: 'Kazanan ve kaybeden kesişim kümelerini karşılaştırır. Trade Engine değişmez; sadece öğrenme/rapor/console verisi üretir.',
    emirMotoruMudahalesi: false,
    ayarlar: {
      minSupport: num(ayarlar.clusterIntelligenceMinSupport || 3),
      edgeEsik: num(ayarlar.clusterIntelligenceEdgeEsik || 12),
      topAday: limit
    },
    kaynak: {
      successSignal: successSignals.length,
      riskSignal: riskSignals.length,
      compareRow: rows.length,
      baseVersion: base.version || 'N/A'
    },
    ozet: {
      sinifDagilimi: groupSummary(rows),
      kararAdayi: kararAdaylari.length,
      riskAdayi: riskAdaylari.length,
      celiskiliKume: celiskiliKumeler.length,
      enGucluEdge: rows.length ? round(Math.max(...rows.map(r => num(r.netEdge))), 3) : 0,
      enRiskliEdge: rows.length ? round(Math.min(...rows.map(r => num(r.netEdge))), 3) : 0
    },
    kararAdaylari,
    riskAdaylari,
    celiskiliKumeler,
    safKazananlar,
    safRiskler,
    tumKarsilastirma: rows.slice(0, Math.max(limit * 3, 30)),
    yorum: 'Karar adayları gelecekte Adaptive Trade Manager için pozitif benzerlik çekirdeğidir; bu sürümde emir açma/kapatma kararı üretmez.'
  };
}

function writeConsoleModel(model = buildClusterIntelligenceModel()) {
  if (ayarlar.clusterIntelligenceExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(MODEL_JSON, JSON.stringify(model, null, 2));
    const cols = ['sinif','type','etiket','support','successScore','riskScore','netEdge','basariEdge','successBasari','riskBasari','successOrnek','riskOrnek','successNet','riskNet','guven'];
    const rows = model.tumKarsilastirma || [];
    fs.writeFileSync(MODEL_CSV, [cols.join(';')].concat(rows.map(r => cols.map(c => csvSafe(r[c])).join(';'))).join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [CLUSTER INTELLIGENCE] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function satir(r, i) {
  return `${i + 1}) [${htmlSafe(r.type)}] ${htmlSafe(r.etiket)}\n` +
    `   ${htmlSafe(r.sinif)} | Edge ${num(r.netEdge).toFixed(1)} | Support ${r.support} | Success %${num(r.successBasari).toFixed(1)} (${r.successOrnek}) | Risk %${num(r.riskBasari).toFixed(1)} (${r.riskOrnek})`;
}

function telegramMetni(model = buildClusterIntelligenceModel()) {
  if (ayarlar.clusterIntelligenceAktif === false) return '';
  const o = model.ozet || {};
  let metin = `\n\n🧬 <b>CLUSTER INTELLIGENCE v3.4.2</b>\n` +
    `Amaç: Kazanan/kaybeden kesişim kümelerini karşılaştırmak. Emir motoruna müdahale yok.\n` +
    `📦 Success:${model.kaynak.successSignal} | Risk:${model.kaynak.riskSignal} | Karar:${o.kararAdayi || 0} | RiskAday:${o.riskAdayi || 0} | Çelişkili:${o.celiskiliKume || 0}\n`;

  if (model.kararAdaylari?.length) {
    metin += `\n🏆 <b>Pozitif Karar Çekirdeği</b>\n` + model.kararAdaylari.slice(0, 5).map(satir).join('\n');
  } else {
    metin += `\nHenüz pozitif karar çekirdeği için yeterli ayrışma yok. Veri biriktikçe burası dolacak.`;
  }

  if (model.riskAdaylari?.length) {
    metin += `\n\n⚠️ <b>Risk Çekirdeği</b>\n` + model.riskAdaylari.slice(0, 4).map(satir).join('\n');
  }

  if (model.celiskiliKumeler?.length) {
    metin += `\n\n🔎 <b>Çelişkili / Daha Fazla Veri Gerekli</b>\n` + model.celiskiliKumeler.slice(0, 3).map(satir).join('\n');
  }

  metin += `\n\n📁 Konsol çıktısı: data/agros-cluster-intelligence-engine.json + .csv`;
  return metin;
}

function telegramMetniVeExport() {
  const model = buildClusterIntelligenceModel();
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildClusterIntelligenceModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  dosyalar: { MODEL_JSON, MODEL_CSV }
};
