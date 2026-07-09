/**
 * AGROS v3.2.8 - LIVE INTELLIGENCE MONITOR
 *
 * Confidence Engine skorlarının gerçek kapanış sonuçlarıyla ne kadar uyumlu olduğunu izler.
 * Trade Engine'e dokunmaz; yalnızca BlackBox/Strategy Lab rapor ve console export katmanıdır.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const confidenceEngine = require('./12_confidence_engine.js');
const h = require('./1_hafiza.js');

const DATA_DIR = path.join(__dirname, 'data');
const MONITOR_JSON = path.join(DATA_DIR, 'agros-live-intelligence-monitor.json');
const MONITOR_CSV = path.join(DATA_DIR, 'agros-live-intelligence-monitor.csv');

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

function sonucToplam(r) {
  return num(r?.tp) + num(r?.sl);
}

function basariOrani(r) {
  const n = sonucToplam(r);
  return n > 0 ? (num(r?.tp) / n) * 100 : 0;
}

function beOrani(r) {
  const n = num(r?.tp) + num(r?.sl) + num(r?.be);
  return n > 0 ? (num(r?.be) / n) * 100 : 0;
}

function scoreBucket(score) {
  const s = num(score);
  if (s >= 80) return '80-100 COK_YUKSEK';
  if (s >= 70) return '70-79 YUKSEK';
  if (s >= 60) return '60-69 OLUMLU';
  if (s >= 50) return '50-59 NOTR_USTU';
  if (s >= 40) return '40-49 NOTR_ALTI';
  if (s >= 30) return '30-39 RISKLI';
  return '0-29 COK_RISKLI';
}

function riskEmoji(bucket) {
  if (bucket.startsWith('80') || bucket.startsWith('70')) return '🟢';
  if (bucket.startsWith('60') || bucket.startsWith('50')) return '🟡';
  if (bucket.startsWith('40')) return '🟠';
  return '🔴';
}

function bosBucket(bucket) {
  return {
    bucket,
    kaynakSayisi: 0,
    toplamOrnek: 0,
    tp: 0,
    sl: 0,
    be: 0,
    net: 0,
    scoreToplam: 0,
    beklenenBasariToplam: 0,
    agirlikliScoreToplam: 0,
    agirlikliBeklenenToplam: 0,
    gucluKaynak: 0,
    riskliKaynak: 0
  };
}

function bucketEkle(map, r) {
  const bkey = scoreBucket(r.confidenceComposite);
  if (!map[bkey]) map[bkey] = bosBucket(bkey);
  const b = map[bkey];
  const toplam = num(r.toplam);
  b.kaynakSayisi += 1;
  b.toplamOrnek += toplam;
  b.tp += num(r.tp);
  b.sl += num(r.sl);
  b.be += num(r.be);
  b.net += num(r.net);
  b.scoreToplam += num(r.confidenceComposite);
  b.beklenenBasariToplam += num(r.confidenceComposite);
  b.agirlikliScoreToplam += num(r.confidenceComposite) * Math.max(1, toplam);
  b.agirlikliBeklenenToplam += num(r.confidenceComposite) * Math.max(1, toplam);
  if (num(r.confidenceComposite) >= num(ayarlar.liveMonitorGucluEsik || 70)) b.gucluKaynak += 1;
  if (num(r.confidenceComposite) <= num(ayarlar.liveMonitorRiskEsik || 40)) b.riskliKaynak += 1;
  return b;
}

function bucketFinalize(b, globalBasari) {
  const sonucN = num(b.tp) + num(b.sl);
  const basari = sonucN > 0 ? (num(b.tp) / sonucN) * 100 : 0;
  const avgScore = b.kaynakSayisi > 0 ? num(b.scoreToplam) / b.kaynakSayisi : 0;
  const weightedScore = b.toplamOrnek > 0 ? num(b.agirlikliScoreToplam) / b.toplamOrnek : avgScore;
  const sapma = basari - weightedScore;
  const edge = basari - num(globalBasari);
  let kalibrasyon = 'DATA_WAIT';
  if (sonucN >= num(ayarlar.liveMonitorMinBucketSonuc || 5)) {
    const abs = Math.abs(sapma);
    kalibrasyon = abs <= 7 ? 'UYUMLU' : abs <= 15 ? 'SAPMA_VAR' : 'SERT_SAPMA';
  }
  return {
    ...b,
    sonucN,
    basari,
    beOrani: beOrani(b),
    avgScore,
    weightedScore,
    sapma,
    edge,
    kalibrasyon
  };
}

function siralaBucket(a, b) {
  return num(b.weightedScore) - num(a.weightedScore) || num(b.toplamOrnek) - num(a.toplamOrnek);
}

function kaynakRiskAnalizi(r, globalBasari) {
  const actual = basariOrani(r);
  const expected = num(r.confidenceComposite);
  const sapma = actual - expected;
  return {
    tip: r.tip,
    key: r.key,
    etiket: r.etiket,
    toplam: num(r.toplam),
    tp: num(r.tp),
    sl: num(r.sl),
    be: num(r.be),
    net: num(r.net),
    confidenceComposite: expected,
    actualBasari: actual,
    globalEdge: actual - num(globalBasari),
    sapma,
    bucket: scoreBucket(expected),
    riskLevel: r.riskLevel,
    confidenceLevel: r.confidenceLevel
  };
}

function buildLiveMonitorModel(options = {}) {
  const confidenceModel = options.confidenceModel || confidenceEngine.buildConfidenceModel(options);
  const global = confidenceModel.global || {};
  const kaynaklar = (confidenceModel.tumKaynaklar || []).filter(r => num(r.toplam) >= num(ayarlar.liveMonitorMinOrnek || ayarlar.confidenceEngineMinOrnek || 3));
  const map = {};
  kaynaklar.forEach(r => bucketEkle(map, r));
  const buckets = Object.values(map).map(b => bucketFinalize(b, num(global.basari))).sort(siralaBucket);

  const izleme = kaynaklar.map(r => kaynakRiskAnalizi(r, num(global.basari)));
  const yuksekGuvenTest = izleme
    .filter(r => num(r.confidenceComposite) >= num(ayarlar.liveMonitorGucluEsik || 70))
    .sort((a, b) => num(b.confidenceComposite) - num(a.confidenceComposite) || num(b.toplam) - num(a.toplam))
    .slice(0, num(ayarlar.liveMonitorTopAday || 8));
  const uyumsuzYuksekGuven = izleme
    .filter(r => num(r.confidenceComposite) >= num(ayarlar.liveMonitorGucluEsik || 70) && (num(r.actualBasari) + num(ayarlar.liveMonitorSapmaEsigi || 12) < num(r.confidenceComposite) || num(r.net) < 0))
    .sort((a, b) => num(a.sapma) - num(b.sapma) || num(a.net) - num(b.net))
    .slice(0, num(ayarlar.liveMonitorTopAday || 8));
  const dusukGuvenFirsat = izleme
    .filter(r => num(r.confidenceComposite) <= num(ayarlar.liveMonitorRiskEsik || 40) && num(r.actualBasari) > num(global.basari) && num(r.net) > 0)
    .sort((a, b) => num(b.globalEdge) - num(a.globalEdge) || num(b.net) - num(a.net))
    .slice(0, num(ayarlar.liveMonitorTopAday || 8));
  const kalibrasyonSapmalari = buckets
    .filter(b => b.kalibrasyon !== 'DATA_WAIT' && Math.abs(num(b.sapma)) >= num(ayarlar.liveMonitorSapmaEsigi || 12))
    .sort((a, b) => Math.abs(num(b.sapma)) - Math.abs(num(a.sapma)))
    .slice(0, num(ayarlar.liveMonitorTopAday || 8));

  return {
    version: 'v3.2.8-LIVE-INTELLIGENCE-MONITOR',
    createdAt: new Date().toISOString(),
    aciklama: 'Confidence Engine skorlarinin gercek TP/SL/BE sonuclariyla kalibrasyonunu izler. Trade Engine degistirilmez; emir engellemez/acmaz.',
    ayarlar: {
      minOrnek: num(ayarlar.liveMonitorMinOrnek || ayarlar.confidenceEngineMinOrnek || 3),
      minBucketSonuc: num(ayarlar.liveMonitorMinBucketSonuc || 5),
      gucluEsik: num(ayarlar.liveMonitorGucluEsik || 70),
      riskEsik: num(ayarlar.liveMonitorRiskEsik || 40),
      sapmaEsigi: num(ayarlar.liveMonitorSapmaEsigi || 12)
    },
    global,
    sayaclar: {
      kaynak: kaynaklar.length,
      bucket: buckets.length,
      yuksekGuvenTest: yuksekGuvenTest.length,
      uyumsuzYuksekGuven: uyumsuzYuksekGuven.length,
      dusukGuvenFirsat: dusukGuvenFirsat.length,
      kalibrasyonSapmasi: kalibrasyonSapmalari.length
    },
    buckets,
    yuksekGuvenTest,
    uyumsuzYuksekGuven,
    dusukGuvenFirsat,
    kalibrasyonSapmalari
  };
}

function csvSafe(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeConsoleModel(model = buildLiveMonitorModel()) {
  if (ayarlar.liveIntelligenceMonitorConsoleExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(MONITOR_JSON, JSON.stringify(model, null, 2));
    const cols = ['bucket','kaynakSayisi','toplamOrnek','tp','sl','be','sonucN','basari','weightedScore','sapma','edge','beOrani','net','kalibrasyon'];
    const csv = [cols.join(';')]
      .concat((model.buckets || []).map(r => cols.map(c => csvSafe(r[c])).join(';')))
      .join('\n');
    fs.writeFileSync(MONITOR_CSV, csv);
    return true;
  } catch (err) {
    console.error('[LIVE INTELLIGENCE MONITOR EXPORT HATASI]', err.message);
    return false;
  }
}

function bucketSatiri(b, i) {
  const sapma = num(b.sapma);
  return `${i + 1}) ${riskEmoji(b.bucket)} ${htmlSafe(b.bucket)} | Kaynak ${b.kaynakSayisi} | Örnek ${b.toplamOrnek}\n` +
    `   🎯 Skor %${pct(b.weightedScore, 1)} → Gerçek %${pct(b.basari, 1)} | Sapma ${sapma >= 0 ? '+' : ''}${pct(sapma, 1)} | Global fark ${num(b.edge) >= 0 ? '+' : ''}${pct(b.edge, 1)}\n` +
    `   📌 TP:${b.tp} SL:${b.sl} BE:${b.be} | BE %${pct(b.beOrani, 1)} | Net ${pct(b.net, 2)} | ${htmlSafe(b.kalibrasyon)}`;
}

function kaynakSatiri(r, i) {
  const sapma = num(r.sapma);
  return `${i + 1}) [${htmlSafe(r.tip)}] ${htmlSafe(r.etiket)}\n` +
    `   🎯 Confidence %${pct(r.confidenceComposite, 1)} → Gerçek %${pct(r.actualBasari, 1)} | Sapma ${sapma >= 0 ? '+' : ''}${pct(sapma, 1)} | Örnek ${r.toplam}\n` +
    `   📌 TP:${r.tp} SL:${r.sl} BE:${r.be} | Net ${pct(r.net, 2)} | Bucket ${htmlSafe(r.bucket)}`;
}

function telegramMetni(model = buildLiveMonitorModel()) {
  if (ayarlar.liveIntelligenceMonitorAktif === false) return '';
  const g = model.global || {};
  let metin = `\n\n👁️ <b>LIVE INTELLIGENCE MONITOR v3.2.8</b>\n` +
    `Amaç: Confidence skorlarının gerçek TP/SL/BE sonuçlarıyla uyumunu izlemek. Emir motoruna müdahale yok.\n` +
    `📦 Kaynak: ${model.sayaclar?.kaynak || 0} DNA | Bucket: ${model.sayaclar?.bucket || 0} | Global başarı %${pct(g.basari, 1)} | Min örnek: ${model.ayarlar?.minOrnek || 3}`;

  if (!model.buckets || !model.buckets.length) {
    metin += `\nHenüz Live Monitor için yeterli Confidence kaynağı yok. Kapanışlar biriktikçe kalibrasyon tablosu dolacak.`;
    return metin;
  }

  metin += `\n\n📊 <b>Confidence Kalibrasyon Bucket'ları</b>\n` + model.buckets.slice(0, 6).map(bucketSatiri).join('\n');

  if (model.kalibrasyonSapmalari?.length) {
    metin += `\n\n⚠️ <b>Kalibrasyon Sapması Olan Bucket'lar</b>\n` + model.kalibrasyonSapmalari.map(bucketSatiri).join('\n');
  }
  if (model.uyumsuzYuksekGuven?.length) {
    metin += `\n\n🧯 <b>Yüksek Güven Ama Zayıf Gerçek Sonuç</b>\n` + model.uyumsuzYuksekGuven.map(kaynakSatiri).join('\n');
  }
  if (model.dusukGuvenFirsat?.length) {
    metin += `\n\n💎 <b>Düşük Güven Görünüp İyi Çalışan Fırsatlar</b>\n` + model.dusukGuvenFirsat.map(kaynakSatiri).join('\n');
  }
  if (model.yuksekGuvenTest?.length) {
    metin += `\n\n🧪 <b>İzlenecek Yüksek Güven DNA Testleri</b>\n` + model.yuksekGuvenTest.slice(0, 5).map(kaynakSatiri).join('\n');
  }
  metin += `\n\n📁 Konsol çıktısı: data/agros-live-intelligence-monitor.json + .csv`;
  return metin;
}

function telegramMetniVeExport(model = buildLiveMonitorModel()) {
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildLiveMonitorModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  dosyalar: { MONITOR_JSON, MONITOR_CSV }
};
