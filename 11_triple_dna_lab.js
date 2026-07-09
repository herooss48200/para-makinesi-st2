const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const TRIPLE_MODEL_JSON = path.join(DATA_DIR, 'agros-triple-dna-lab.json');
const TRIPLE_MODEL_CSV = path.join(DATA_DIR, 'agros-triple-dna-lab.csv');

const TFS = ['5m', '15m', '1h', '4h'];
const DEFAULT_MIN_ORNEK = 3;
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

function bosBucket() {
  return { toplam: 0, tp: 0, sl: 0, be: 0, net: 0, karToplam: 0, zararToplam: 0 };
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
  const veryHigh = num(ayarlar.tripleDnaVeryHighOrnek || 50);
  const high = num(ayarlar.tripleDnaHighOrnek || 25);
  const medium = num(ayarlar.tripleDnaMediumOrnek || 10);
  const low = num(ayarlar.tripleDnaMinOrnek || DEFAULT_MIN_ORNEK);
  if (n >= veryHigh) return 'VERY_HIGH';
  if (n >= high) return 'HIGH';
  if (n >= medium) return 'MEDIUM';
  if (n >= low) return 'LOW';
  return 'DATA_WAIT';
}

function yonTrend(yon) {
  const v = String(yon || '').toUpperCase();
  if (v === 'LONG') return 'UP';
  if (v === 'SHORT') return 'DOWN';
  return 'YOK';
}

function tersHamTrend(t) {
  const v = String(t || '').toUpperCase();
  if (v === 'UP') return 'DOWN';
  if (v === 'DOWN') return 'UP';
  return 'YOK';
}

function bitHamTrend(bit, yon) {
  const hedef = yonTrend(yon);
  if (bit === '1') return hedef;
  if (bit === '0') return tersHamTrend(hedef);
  return 'YOK';
}

function hamTrendEmoji(t) {
  const v = String(t || '').toUpperCase();
  if (v === 'UP') return '🟢';
  if (v === 'DOWN') return '🔴';
  return '⚪';
}

function keyMapOlustur(key = '') {
  const out = {};
  String(key || '').split('|').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  });
  return out;
}

function bucketYon(b) {
  const m = keyMapOlustur(b?.key || '');
  return String(m.YON || b?.yon || b?.direction || 'YOK').toUpperCase();
}

function signatureOzellikleri(bucket) {
  const m = keyMapOlustur(bucket?.key || '');
  const yon = String(m.YON || bucketYon(bucket) || 'YOK').toUpperCase();
  const btcBits = String(m.BTC || '').padEnd(TFS.length, 'Y').slice(0, TFS.length);
  const coinBits = String(m.COIN || '').padEnd(TFS.length, 'Y').slice(0, TFS.length);
  const bb = String(m.BB || 'YOK').toUpperCase();
  const pusu = String(m.PUSU || 'YOK').toUpperCase();
  const yonFeature = { key: `YON=${yon}`, etiket: `Yön ${yon}`, tip: 'YON' };
  const features = [];

  for (let i = 0; i < TFS.length; i++) {
    const tf = TFS[i];
    const btcTrend = bitHamTrend(btcBits[i], yon);
    const coinTrend = bitHamTrend(coinBits[i], yon);
    features.push({ key: `BTC_${tf}=${btcTrend}`, etiket: `BTC ${tf} ${hamTrendEmoji(btcTrend)} ${btcTrend}`, tip: 'BTC_TF' });
    features.push({ key: `COIN_${tf}=${coinTrend}`, etiket: `Coin ${tf} ${hamTrendEmoji(coinTrend)} ${coinTrend}`, tip: 'COIN_TF' });
  }

  features.push({ key: `BB=${bb}`, etiket: `BB ${bb}`, tip: 'BB' });
  features.push({ key: `PUSU=${pusu}`, etiket: `Pusu ${pusu}`, tip: 'PUSU' });
  return { yon, yonFeature, features };
}

function kombinasyonlar(arr, size) {
  const out = [];
  function rec(start, secilen) {
    if (secilen.length === size) {
      out.push([...secilen]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      secilen.push(arr[i]);
      rec(i + 1, secilen);
      secilen.pop();
    }
  }
  rec(0, []);
  return out;
}

function bucketEkle(map, key, etiket, kaynak, ozellikler) {
  if (!map[key]) map[key] = { ...bosBucket(), key, etiket, ozellikler: ozellikler || [], parcaSayisi: (ozellikler || []).length };
  const b = map[key];
  b.toplam += num(kaynak?.toplam);
  b.tp += num(kaynak?.tp);
  b.sl += num(kaynak?.sl);
  b.be += num(kaynak?.be);
  b.net += num(kaynak?.net);
  b.karToplam += num(kaynak?.karToplam);
  b.zararToplam += num(kaynak?.zararToplam);
  return b;
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

function tripleHaritasiOlustur(blackboxOzet) {
  const o = blackboxOzet || h.state.blackboxOzet || {};
  const full = Object.values(o.fullSignatureStats || {}).filter(b => num(b?.toplam) > 0 && b?.key);
  const singles = {};
  const pairs = {};
  const triples = {};

  for (const bucket of full) {
    const parsed = signatureOzellikleri(bucket);
    const tekiller = parsed.features.map(f => [f]);
    const ikililer = kombinasyonlar(parsed.features, 2);
    const ucluler = kombinasyonlar(parsed.features, 3);

    for (const combo of tekiller) {
      const oz = [parsed.yonFeature, ...combo];
      const key = oz.map(x => x.key).join('|');
      const etiket = oz.map(x => x.etiket).join(' + ');
      bucketEkle(singles, key, etiket, bucket, oz);
    }

    for (const combo of ikililer) {
      const oz = [parsed.yonFeature, ...combo];
      const key = oz.map(x => x.key).join('|');
      const etiket = oz.map(x => x.etiket).join(' + ');
      bucketEkle(pairs, key, etiket, bucket, oz);
    }

    for (const combo of ucluler) {
      const oz = [parsed.yonFeature, ...combo];
      const key = oz.map(x => x.key).join('|');
      const etiket = oz.map(x => x.etiket).join(' + ');
      bucketEkle(triples, key, etiket, bucket, oz);
    }
  }

  return { singles, pairs, triples };
}

function pairAltKumeleri(yon, ozellikler, pairs) {
  return kombinasyonlar(ozellikler, 2)
    .map(combo => pairs[[yon?.key, ...combo.map(f => f.key)].filter(Boolean).join('|')])
    .filter(Boolean);
}

function tripleAnalizEkle(bucket, singles, pairs, global) {
  const ozellikler = (bucket.ozellikler || []).filter(x => x.tip !== 'YON');
  const yon = (bucket.ozellikler || []).find(x => x.tip === 'YON');
  const tekiller = ozellikler
    .map(f => singles[[yon?.key, f.key].filter(Boolean).join('|')])
    .filter(Boolean);
  const altPairler = pairAltKumeleri(yon, ozellikler, pairs);

  const tekilOranlar = tekiller.map(x => basariOrani(x));
  const pairOranlar = altPairler.map(x => basariOrani(x));
  const tekilOrt = tekilOranlar.length ? tekilOranlar.reduce((a, v) => a + v, 0) / tekilOranlar.length : 0;
  const tekilMax = tekilOranlar.length ? Math.max(...tekilOranlar) : 0;
  const pairOrt = pairOranlar.length ? pairOranlar.reduce((a, v) => a + v, 0) / pairOranlar.length : 0;
  const pairMax = pairOranlar.length ? Math.max(...pairOranlar) : 0;
  const basari = basariOrani(bucket);
  const tekilIyilesme = basari - tekilOrt;
  const pairIyilesme = basari - pairOrt;
  const maxIyilesme = basari - Math.max(tekilMax, pairMax);
  const pf = profitFactor(bucket);
  const toplam = num(bucket.toplam);
  const ortNet = toplam > 0 ? num(bucket.net) / toplam : 0;
  const kazananDnaFrekansi = global.tp > 0 ? (num(bucket.tp) / global.tp) * 100 : 0;
  const kaybedenDnaFrekansi = global.sl > 0 ? (num(bucket.sl) / global.sl) * 100 : 0;
  const dnaFrequency = global.toplam > 0 ? (toplam / global.toplam) * 100 : 0;
  const ayirtEdicilik = kazananDnaFrekansi - kaybedenDnaFrekansi;
  const veriAgirligi = Math.min(1, toplam / Math.max(1, num(ayarlar.tripleDnaHighOrnek || 20)));
  const pfKatki = pf === 'INF' ? 22 : Math.max(-22, Math.min(22, (num(pf, 1) - 1) * 11));
  const netKatki = Math.max(-20, Math.min(20, ortNet * 10));
  const sinerjiKatki = Math.max(-30, Math.min(30, (tekilIyilesme * 0.35) + (pairIyilesme * 0.50) + (maxIyilesme * 0.15)));
  const discriminativeScore = ((ayirtEdicilik * 0.50) + ((basari - slOrani(bucket)) * 0.18) + pfKatki + netKatki + sinerjiKatki) * veriAgirligi;
  const confidenceScore = Math.max(0, Math.min(100, (veriAgirligi * 45) + Math.max(0, basari - slOrani(bucket)) * 0.25 + Math.max(0, ayirtEdicilik) * 0.20 + Math.max(0, pairIyilesme) * 0.10));

  return {
    ...bucket,
    toplam,
    tp: num(bucket.tp),
    sl: num(bucket.sl),
    be: num(bucket.be),
    net: num(bucket.net),
    ortNet,
    tpOrani: basari,
    slOrani: slOrani(bucket),
    beOrani: beOrani(bucket),
    profitFactor: pf,
    profitFactorText: profitFactorMetni(pf),
    tekilOrt,
    tekilMax,
    pairOrt,
    pairMax,
    tekilIyilesme,
    pairIyilesme,
    maxIyilesme,
    kazananDnaFrekansi,
    kaybedenDnaFrekansi,
    dnaFrequency,
    ayirtEdicilik,
    discriminativeScore,
    tripleScore: discriminativeScore,
    confidenceScore,
    guven: guvenSeviyesi(toplam)
  };
}

function siralaGuclu(a, b) {
  return num(b.tripleScore) - num(a.tripleScore) || num(b.net) - num(a.net) || num(b.toplam) - num(a.toplam);
}

function siralaRiskli(a, b) {
  return num(a.tripleScore) - num(b.tripleScore) || num(a.net) - num(b.net) || num(b.toplam) - num(a.toplam);
}

function buildTripleDnaModel(options = {}) {
  const o = options.blackboxOzet || h.state.blackboxOzet || {};
  const minOrnek = num(options.minOrnek ?? ayarlar.tripleDnaMinOrnek, DEFAULT_MIN_ORNEK);
  const limit = num(options.limit ?? ayarlar.tripleDnaTopAday, DEFAULT_TOP_LIMIT);
  const global = globalOzet(o);
  const { singles, pairs, triples } = tripleHaritasiOlustur(o);
  const tumTripleler = Object.values(triples || {}).map(b => tripleAnalizEkle(b, singles, pairs, global));
  const yeterli = tumTripleler.filter(r => r.toplam >= minOrnek);
  const guclu = [...yeterli]
    .filter(r => r.pairIyilesme > 0 || r.ayirtEdicilik > 0 || r.net > 0)
    .sort(siralaGuclu)
    .slice(0, limit);
  const riskli = [...yeterli]
    .filter(r => r.pairIyilesme < 0 || r.ayirtEdicilik < 0 || r.net < 0)
    .sort(siralaRiskli)
    .slice(0, limit);
  const sinerji = [...yeterli]
    .filter(r => Math.abs(num(r.pairIyilesme)) >= num(ayarlar.tripleDnaSinerjiEsigi || 6) || Math.abs(num(r.tekilIyilesme)) >= num(ayarlar.tripleDnaSinerjiEsigi || 6))
    .sort((a, b) => Math.abs(num(b.pairIyilesme)) - Math.abs(num(a.pairIyilesme)) || Math.abs(num(b.tekilIyilesme)) - Math.abs(num(a.tekilIyilesme)))
    .slice(0, limit);

  return {
    lab: 'TRIPLE_DNA_LAB',
    surum: 'v3.2.6',
    uretilmeZamani: new Date().toISOString(),
    aciklama: 'Trade Engine degistirilmeden mevcut Full Signature DNA parcalanir ve uclu ozellik kumelerinin pair/feature ustu ek katkisi olculur.',
    consoleUyumlu: true,
    emirMotoruMudahalesi: false,
    ayarlar: { minOrnek, limit },
    global,
    tripleSayisi: tumTripleler.length,
    yeterliTripleSayisi: yeterli.length,
    tumTripleler: tumTripleler.sort(siralaGuclu),
    yeterliTripleler: yeterli.sort(siralaGuclu),
    gucluTripleler: guclu,
    riskliTripleler: riskli,
    sinerjiTripleleri: sinerji
  };
}

function csvValue(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeConsoleModel(model = buildTripleDnaModel()) {
  if (ayarlar.tripleDnaConsoleExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(TRIPLE_MODEL_JSON, JSON.stringify(model, null, 2));
    const cols = ['key','etiket','toplam','tp','sl','be','tpOrani','slOrani','beOrani','net','ortNet','profitFactorText','tekilOrt','tekilMax','pairOrt','pairMax','tekilIyilesme','pairIyilesme','maxIyilesme','kazananDnaFrekansi','kaybedenDnaFrekansi','dnaFrequency','ayirtEdicilik','discriminativeScore','confidenceScore','tripleScore','guven'];
    const lines = [cols.join(',')];
    for (const r of model.tumTripleler || []) lines.push(cols.map(c => csvValue(r[c])).join(','));
    fs.writeFileSync(TRIPLE_MODEL_CSV, lines.join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [TRIPLE DNA LAB] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function tripleSatiri(r, i) {
  const pairGain = num(r.pairIyilesme);
  const singleGain = num(r.tekilIyilesme);
  const ayr = num(r.ayirtEdicilik);
  const skor = num(r.discriminativeScore);
  const conf = num(r.confidenceScore);
  return `${i + 1}) ${htmlSafe(r.etiket)}\n` +
    `   📌 ${r.toplam} işlem | TP:${r.tp} SL:${r.sl} BE:${r.be} | Başarı %${pct(r.tpOrani, 1)} | Net ${pct(r.net, 2)} | PF ${htmlSafe(r.profitFactorText)}\n` +
    `   🧬 Pair Ort:%${pct(r.pairOrt, 1)} | Pair üstü ${pairGain >= 0 ? '+' : ''}${pct(pairGain, 1)} | Tekil üstü ${singleGain >= 0 ? '+' : ''}${pct(singleGain, 1)} | DNA ${ayr >= 0 ? '+' : ''}${pct(ayr, 1)}\n` +
    `   🎯 Discriminative ${skor >= 0 ? '+' : ''}${pct(skor, 1)} | Confidence %${pct(conf, 1)} | Frekans %${pct(r.dnaFrequency, 1)} | Güven ${r.guven}`;
}

function telegramMetni(model = buildTripleDnaModel()) {
  if (ayarlar.tripleDnaLabAktif === false) return '';
  const min = model.ayarlar?.minOrnek || DEFAULT_MIN_ORNEK;
  const kapanan = num(model.global?.tp) + num(model.global?.sl) + num(model.global?.be);
  let metin = `\n\n🧬 <b>TRIPLE DNA LAB v3.2.6</b>\n` +
    `Amaç: Üç özelliğin birlikte geldiğinde single/pair ortalamasına göre gerçek avantaj üretip üretmediğini ölçmek. Emir motoruna müdahale yok.\n` +
    `📦 BlackBox kapanış: ${kapanan || num(model.global?.toplam)} | Ölçülen triple: ${model.tripleSayisi || 0} | Min örnek: ${min}\n`;

  if (!model.yeterliTripleler || !model.yeterliTripleler.length) {
    metin += `Henüz güvenilir Triple DNA için yeterli veri yok. En az ${min} örnekli üçlü DNA kümeleri oluştukça bu bölüm dolacak.`;
    return metin;
  }

  if (model.gucluTripleler?.length) {
    metin += `\n✅ <b>Güçlü Üçlü DNA / Triple Sinerji</b>\n` + model.gucluTripleler.map(tripleSatiri).join('\n');
  }
  if (model.riskliTripleler?.length) {
    metin += `\n\n🚫 <b>Riskli Üçlü DNA</b>\n` + model.riskliTripleler.map(tripleSatiri).join('\n');
  }
  if (model.sinerjiTripleleri?.length) {
    metin += `\n\n🔬 <b>En Belirgin Triple Farkları</b>\n` + model.sinerjiTripleleri.map(tripleSatiri).join('\n');
  }
  metin += `\n\n📁 Konsol çıktısı: data/agros-triple-dna-lab.json + .csv`;
  return metin;
}

function telegramMetniVeExport(model = buildTripleDnaModel()) {
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildTripleDnaModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  tripleHaritasiOlustur,
  dosyalar: { TRIPLE_MODEL_JSON, TRIPLE_MODEL_CSV }
};
