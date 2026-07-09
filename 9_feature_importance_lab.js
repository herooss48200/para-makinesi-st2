const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const FEATURE_MODEL_JSON = path.join(DATA_DIR, 'agros-feature-importance-lab.json');
const FEATURE_MODEL_CSV = path.join(DATA_DIR, 'agros-feature-importance-lab.csv');

const DEFAULT_MIN_ORNEK = 5;
const DEFAULT_TOP_LIMIT = 8;

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

function sonucToplam(b) {
  return num(b?.tp) + num(b?.sl);
}

function basariOrani(b) {
  const n = sonucToplam(b);
  return n > 0 ? (num(b?.tp) / n) * 100 : 0;
}

function slOrani(b) {
  const n = sonucToplam(b);
  return n > 0 ? (num(b?.sl) / n) * 100 : 0;
}

function beOrani(b) {
  const toplam = num(b?.toplam);
  return toplam > 0 ? (num(b?.be) / toplam) * 100 : 0;
}

function profitFactor(b) {
  const kar = num(b?.karToplam);
  const zarar = num(b?.zararToplam);
  if (kar <= 0 && zarar <= 0) return null;
  if (kar > 0 && zarar <= 0) return 'INF';
  if (kar <= 0 && zarar > 0) return 0;
  return kar / zarar;
}

function profitFactorMetni(v) {
  if (v === null || v === undefined) return 'N/A';
  if (v === 'INF') return '∞';
  return num(v).toFixed(2);
}

function guvenSeviyesi(toplam) {
  const n = num(toplam);
  const veryHigh = num(ayarlar.featureImportanceVeryHighOrnek || 50);
  const high = num(ayarlar.featureImportanceHighOrnek || 25);
  const medium = num(ayarlar.featureImportanceMediumOrnek || 10);
  const low = num(ayarlar.featureImportanceMinOrnek || DEFAULT_MIN_ORNEK);
  if (n >= veryHigh) return 'VERY_HIGH';
  if (n >= high) return 'HIGH';
  if (n >= medium) return 'MEDIUM';
  if (n >= low) return 'LOW';
  return 'DATA_WAIT';
}

function featureKaynaklari(o) {
  return [
    { kaynak: 'BTC_TF', grup: 'BTC SuperTrend TF', stats: o?.btcTfStats || {} },
    { kaynak: 'COIN_TF', grup: 'Coin SuperTrend TF', stats: o?.coinTfStats || {} },
    { kaynak: 'BB_YON', grup: 'Bollinger Bölgesi + Yön', stats: o?.bbYonStats || {} },
    { kaynak: 'PUSU_KALITE', grup: 'Pusu Kalitesi + Yön', stats: o?.pusuKaliteStats || {} },
    { kaynak: 'PUSU_SENARYO', grup: 'Pusu Senaryosu + Yön', stats: o?.pusuSenaryoStats || {} },
    { kaynak: 'TREND_ETKI', grup: 'Trend Etki Özeti', stats: {
      TREND_AYNI_YON: { ...(o?.trendAyniYon || {}), key: 'TREND_AYNI_YON', etiket: 'Trend çoğunluğu işlem yönüyle aynı' },
      TREND_TERS_YON: { ...(o?.trendTersYon || {}), key: 'TREND_TERS_YON', etiket: 'Trend çoğunluğu işlem yönüne ters' },
      BTC_TAM_UYUM: { ...(o?.btcTamUyum || {}), key: 'BTC_TAM_UYUM', etiket: 'BTC 4/4 işlem yönü' },
      COIN_TAM_UYUM: { ...(o?.coinTamUyum || {}), key: 'COIN_TAM_UYUM', etiket: 'Coin 4/4 işlem yönü' },
      TOPLAM_8_8: { ...(o?.toplamTamUyum || {}), key: 'TOPLAM_8_8', etiket: 'Toplam 8/8 uyum' },
      TOPLAM_ZAYIF: { ...(o?.toplamZayifUyum || {}), key: 'TOPLAM_ZAYIF', etiket: 'Zayıf uyum ≤3/8' }
    } }
  ];
}

function globalOzet(o) {
  const long = o?.long || {};
  const short = o?.short || {};
  const tp = num(long.tp) + num(short.tp);
  const sl = num(long.sl) + num(short.sl);
  const be = num(long.be) + num(short.be);
  const toplam = num(long.toplam) + num(short.toplam);
  const net = num(long.net) + num(short.net);
  return { tp, sl, be, toplam, net, sonucToplam: tp + sl };
}

function normalizeFeature(bucket, kaynak, grup, global) {
  const toplam = num(bucket?.toplam);
  const tp = num(bucket?.tp);
  const sl = num(bucket?.sl);
  const be = num(bucket?.be);
  const net = num(bucket?.net);
  const pf = profitFactor(bucket);
  const ortNet = toplam > 0 ? net / toplam : 0;
  const tpRate = basariOrani(bucket);
  const slRate = slOrani(bucket);
  const beRate = beOrani(bucket);
  const kazananDnaFrekansi = global.tp > 0 ? (tp / global.tp) * 100 : 0;
  const kaybedenDnaFrekansi = global.sl > 0 ? (sl / global.sl) * 100 : 0;
  const ayirtEdicilik = kazananDnaFrekansi - kaybedenDnaFrekansi;
  const veriAgirligi = Math.min(1, toplam / Math.max(1, num(ayarlar.featureImportanceHighOrnek || 25)));
  const pfKatki = pf === 'INF' ? 20 : Math.max(-20, Math.min(20, (num(pf, 1) - 1) * 10));
  const netKatki = Math.max(-20, Math.min(20, ortNet * 10));
  const importanceScore = (ayirtEdicilik * 0.55) + ((tpRate - slRate) * 0.25) + pfKatki + netKatki;

  return {
    kaynak,
    grup,
    key: String(bucket?.key || ''),
    etiket: String(bucket?.etiket || bucket?.key || 'Özellik'),
    toplam,
    tp,
    sl,
    be,
    tpOrani: tpRate,
    slOrani: slRate,
    beOrani: beRate,
    net,
    ortNet,
    profitFactor: pf,
    profitFactorText: profitFactorMetni(pf),
    kazananDnaFrekansi,
    kaybedenDnaFrekansi,
    ayirtEdicilik,
    importanceScore: importanceScore * veriAgirligi,
    guven: guvenSeviyesi(toplam)
  };
}

function tumFeatureListesi(o) {
  const global = globalOzet(o);
  const rows = [];
  for (const src of featureKaynaklari(o)) {
    for (const bucket of Object.values(src.stats || {})) {
      if (!bucket || num(bucket.toplam) <= 0) continue;
      rows.push(normalizeFeature(bucket, src.kaynak, src.grup, global));
    }
  }
  return rows;
}

function siralaGuclu(a, b) {
  return num(b.importanceScore) - num(a.importanceScore) || num(b.net) - num(a.net) || num(b.toplam) - num(a.toplam);
}

function siralaRiskli(a, b) {
  return num(a.importanceScore) - num(b.importanceScore) || num(a.net) - num(b.net) || num(b.toplam) - num(a.toplam);
}

function grupOzetleri(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.grup)) map.set(r.grup, { grup: r.grup, kaynaklar: new Set(), ozellikSayisi: 0, toplamOrnek: 0, enGuclu: null, enRiskli: null });
    const g = map.get(r.grup);
    g.kaynaklar.add(r.kaynak);
    g.ozellikSayisi += 1;
    g.toplamOrnek += r.toplam;
    if (!g.enGuclu || siralaGuclu(r, g.enGuclu) < 0) g.enGuclu = r;
    if (!g.enRiskli || siralaRiskli(r, g.enRiskli) < 0) g.enRiskli = r;
  }
  return [...map.values()].map(g => ({
    grup: g.grup,
    kaynaklar: [...g.kaynaklar],
    ozellikSayisi: g.ozellikSayisi,
    toplamOrnek: g.toplamOrnek,
    enGuclu: g.enGuclu ? g.enGuclu.etiket : null,
    enRiskli: g.enRiskli ? g.enRiskli.etiket : null
  }));
}

function buildFeatureImportanceModel(options = {}) {
  const o = options.blackboxOzet || h.state.blackboxOzet || {};
  const minOrnek = num(options.minOrnek ?? ayarlar.featureImportanceMinOrnek, DEFAULT_MIN_ORNEK);
  const limit = num(options.limit ?? ayarlar.featureImportanceTopAday, DEFAULT_TOP_LIMIT);
  const global = globalOzet(o);
  const tumOzellikler = tumFeatureListesi(o);
  const yeterli = tumOzellikler.filter(r => r.toplam >= minOrnek);
  const guclu = [...yeterli]
    .filter(r => r.ayirtEdicilik > 0 || r.net > 0)
    .sort(siralaGuclu)
    .slice(0, limit);
  const riskli = [...yeterli]
    .filter(r => r.ayirtEdicilik < 0 || r.net < 0)
    .sort(siralaRiskli)
    .slice(0, limit);
  const ayirtEdici = [...yeterli]
    .filter(r => Math.abs(r.ayirtEdicilik) >= num(ayarlar.featureImportanceAyirtEdicilikEsigi || 10))
    .sort((a, b) => Math.abs(num(b.ayirtEdicilik)) - Math.abs(num(a.ayirtEdicilik)))
    .slice(0, limit);

  return {
    lab: 'FEATURE_IMPORTANCE_LAB',
    surum: 'v3.2.4',
    uretilmeZamani: new Date().toISOString(),
    aciklama: 'Trade Engine degistirilmeden mevcut blackboxOzet uzerinden ozellik bazli ayirt edicilik analizi.',
    consoleUyumlu: true,
    emirMotoruMudahalesi: false,
    ayarlar: { minOrnek, limit },
    global,
    grupOzetleri: grupOzetleri(tumOzellikler),
    tumOzellikler: tumOzellikler.sort(siralaGuclu),
    yeterliOzellikler: yeterli.sort(siralaGuclu),
    gucluOzellikler: guclu,
    riskliOzellikler: riskli,
    ayirtEdiciOzellikler: ayirtEdici
  };
}

function csvValue(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeConsoleModel(model = buildFeatureImportanceModel()) {
  if (ayarlar.featureImportanceConsoleExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(FEATURE_MODEL_JSON, JSON.stringify(model, null, 2));
    const cols = ['kaynak','grup','key','etiket','toplam','tp','sl','be','tpOrani','slOrani','beOrani','net','ortNet','profitFactorText','kazananDnaFrekansi','kaybedenDnaFrekansi','ayirtEdicilik','importanceScore','guven'];
    const lines = [cols.join(',')];
    for (const r of model.tumOzellikler || []) lines.push(cols.map(c => csvValue(r[c])).join(','));
    fs.writeFileSync(FEATURE_MODEL_CSV, lines.join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [FEATURE IMPORTANCE LAB] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function featureSatiri(r, i) {
  const ayr = num(r.ayirtEdicilik);
  const ayrText = `${ayr >= 0 ? '+' : ''}${pct(ayr, 1)}`;
  const imp = num(r.importanceScore);
  return `${i + 1}) ${htmlSafe(r.etiket)} | ${r.toplam} işlem | TP:${r.tp} SL:${r.sl} BE:${r.be} | Başarı %${pct(r.tpOrani, 1)} | Net ${pct(r.net, 2)} | PF ${htmlSafe(r.profitFactorText)} | DNA ${ayrText} | Skor ${imp >= 0 ? '+' : ''}${pct(imp, 1)} | Güven ${r.guven}`;
}

function telegramMetni(model = buildFeatureImportanceModel()) {
  if (ayarlar.featureImportanceLabAktif === false) return '';
  const min = model.ayarlar?.minOrnek || DEFAULT_MIN_ORNEK;
  const toplam = model.global?.toplam || 0;
  const kapanan = (model.global?.tp || 0) + (model.global?.sl || 0) + (model.global?.be || 0);
  let metin = `\n\n🧬 <b>FEATURE IMPORTANCE LAB v3.2.4</b>\n` +
    `Amaç: Tek tek özelliklerin kazanan/kaybeden DNA içindeki ayırt ediciliğini ölçmek. Emir motoruna müdahale yok.\n` +
    `📦 BlackBox kapanış: ${kapanan || toplam} | Ölçülen özellik: ${(model.tumOzellikler || []).length} | Min örnek: ${min}\n`;

  if (!model.yeterliOzellikler || !model.yeterliOzellikler.length) {
    metin += `Henüz güvenilir Feature Importance için yeterli veri yok. En az ${min} örnekli özellikler oluştukça bu bölüm dolacak.`;
    return metin;
  }

  if (model.gucluOzellikler?.length) {
    metin += `\n✅ <b>Kazanan DNA'yı Güçlendiren Özellikler</b>\n` + model.gucluOzellikler.map(featureSatiri).join('\n');
  }
  if (model.riskliOzellikler?.length) {
    metin += `\n\n🚫 <b>Kaybeden DNA'da Öne Çıkan Özellikler</b>\n` + model.riskliOzellikler.map(featureSatiri).join('\n');
  }
  if (model.ayirtEdiciOzellikler?.length) {
    metin += `\n\n🔬 <b>En Ayırt Edici Özellikler</b>\n` + model.ayirtEdiciOzellikler.map(featureSatiri).join('\n');
  }
  metin += `\n\n📁 Konsol çıktısı: data/agros-feature-importance-lab.json + .csv`;
  return metin;
}

function telegramMetniVeExport(model = buildFeatureImportanceModel()) {
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildFeatureImportanceModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  dosyalar: { FEATURE_MODEL_JSON, FEATURE_MODEL_CSV }
};
