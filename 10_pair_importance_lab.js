const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const PAIR_MODEL_JSON = path.join(DATA_DIR, 'agros-pair-importance-lab.json');
const PAIR_MODEL_CSV = path.join(DATA_DIR, 'agros-pair-importance-lab.csv');

const TFS = ['5m', '15m', '1h', '4h'];
const DEFAULT_MIN_ORNEK = 4;
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
  const veryHigh = num(ayarlar.pairImportanceVeryHighOrnek || 50);
  const high = num(ayarlar.pairImportanceHighOrnek || 25);
  const medium = num(ayarlar.pairImportanceMediumOrnek || 10);
  const low = num(ayarlar.pairImportanceMinOrnek || DEFAULT_MIN_ORNEK);
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

function pairHaritasiOlustur(blackboxOzet) {
  const o = blackboxOzet || h.state.blackboxOzet || {};
  const full = Object.values(o.fullSignatureStats || {}).filter(b => num(b?.toplam) > 0 && b?.key);
  const singles = {};
  const pairs = {};

  for (const bucket of full) {
    const parsed = signatureOzellikleri(bucket);
    const tekiller = parsed.features.map(f => [f]);
    const ikililer = kombinasyonlar(parsed.features, 2);

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
  }

  return { singles, pairs };
}

function pairAnalizEkle(bucket, singles, global) {
  const ozellikler = (bucket.ozellikler || []).filter(x => x.tip !== 'YON');
  const yon = (bucket.ozellikler || []).find(x => x.tip === 'YON');
  const tekiller = ozellikler
    .map(f => singles[[yon?.key, f.key].filter(Boolean).join('|')])
    .filter(Boolean);

  const tekilOranlar = tekiller.map(x => basariOrani(x));
  const tekilOrt = tekilOranlar.length ? tekilOranlar.reduce((a, v) => a + v, 0) / tekilOranlar.length : 0;
  const tekilMax = tekilOranlar.length ? Math.max(...tekilOranlar) : 0;
  const basari = basariOrani(bucket);
  const ortIyilesme = basari - tekilOrt;
  const maxIyilesme = basari - tekilMax;
  const pf = profitFactor(bucket);
  const toplam = num(bucket.toplam);
  const ortNet = toplam > 0 ? num(bucket.net) / toplam : 0;
  const kazananDnaFrekansi = global.tp > 0 ? (num(bucket.tp) / global.tp) * 100 : 0;
  const kaybedenDnaFrekansi = global.sl > 0 ? (num(bucket.sl) / global.sl) * 100 : 0;
  const ayirtEdicilik = kazananDnaFrekansi - kaybedenDnaFrekansi;
  const veriAgirligi = Math.min(1, toplam / Math.max(1, num(ayarlar.pairImportanceHighOrnek || 25)));
  const pfKatki = pf === 'INF' ? 20 : Math.max(-20, Math.min(20, (num(pf, 1) - 1) * 10));
  const netKatki = Math.max(-20, Math.min(20, ortNet * 10));
  const sinerjiKatki = Math.max(-25, Math.min(25, (ortIyilesme * 0.65) + (maxIyilesme * 0.35)));
  const pairScore = ((ayirtEdicilik * 0.45) + sinerjiKatki + ((basari - slOrani(bucket)) * 0.18) + pfKatki + netKatki) * veriAgirligi;

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
    ortIyilesme,
    maxIyilesme,
    kazananDnaFrekansi,
    kaybedenDnaFrekansi,
    ayirtEdicilik,
    pairScore,
    guven: guvenSeviyesi(toplam)
  };
}

function siralaGuclu(a, b) {
  return num(b.pairScore) - num(a.pairScore) || num(b.net) - num(a.net) || num(b.toplam) - num(a.toplam);
}

function siralaRiskli(a, b) {
  return num(a.pairScore) - num(b.pairScore) || num(a.net) - num(b.net) || num(b.toplam) - num(a.toplam);
}

function buildPairImportanceModel(options = {}) {
  const o = options.blackboxOzet || h.state.blackboxOzet || {};
  const minOrnek = num(options.minOrnek ?? ayarlar.pairImportanceMinOrnek, DEFAULT_MIN_ORNEK);
  const limit = num(options.limit ?? ayarlar.pairImportanceTopAday, DEFAULT_TOP_LIMIT);
  const global = globalOzet(o);
  const { singles, pairs } = pairHaritasiOlustur(o);
  const tumPairler = Object.values(pairs || {}).map(b => pairAnalizEkle(b, singles, global));
  const yeterli = tumPairler.filter(r => r.toplam >= minOrnek);
  const guclu = [...yeterli]
    .filter(r => r.ortIyilesme > 0 || r.ayirtEdicilik > 0 || r.net > 0)
    .sort(siralaGuclu)
    .slice(0, limit);
  const riskli = [...yeterli]
    .filter(r => r.ortIyilesme < 0 || r.ayirtEdicilik < 0 || r.net < 0)
    .sort(siralaRiskli)
    .slice(0, limit);
  const sinerji = [...yeterli]
    .filter(r => Math.abs(num(r.ortIyilesme)) >= num(ayarlar.pairImportanceSinerjiEsigi || 8))
    .sort((a, b) => Math.abs(num(b.ortIyilesme)) - Math.abs(num(a.ortIyilesme)))
    .slice(0, limit);

  return {
    lab: 'PAIR_IMPORTANCE_LAB',
    surum: 'v3.2.5',
    uretilmeZamani: new Date().toISOString(),
    aciklama: 'Trade Engine degistirilmeden mevcut Full Signature DNA parcalanir ve ikili ozellik sinerjileri olculur.',
    consoleUyumlu: true,
    emirMotoruMudahalesi: false,
    ayarlar: { minOrnek, limit },
    global,
    pairSayisi: tumPairler.length,
    yeterliPairSayisi: yeterli.length,
    tumPairler: tumPairler.sort(siralaGuclu),
    yeterliPairler: yeterli.sort(siralaGuclu),
    gucluPairler: guclu,
    riskliPairler: riskli,
    sinerjiPairleri: sinerji
  };
}

function csvValue(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeConsoleModel(model = buildPairImportanceModel()) {
  if (ayarlar.pairImportanceConsoleExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(PAIR_MODEL_JSON, JSON.stringify(model, null, 2));
    const cols = ['key','etiket','toplam','tp','sl','be','tpOrani','slOrani','beOrani','net','ortNet','profitFactorText','tekilOrt','tekilMax','ortIyilesme','maxIyilesme','kazananDnaFrekansi','kaybedenDnaFrekansi','ayirtEdicilik','pairScore','guven'];
    const lines = [cols.join(',')];
    for (const r of model.tumPairler || []) lines.push(cols.map(c => csvValue(r[c])).join(','));
    fs.writeFileSync(PAIR_MODEL_CSV, lines.join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [PAIR IMPORTANCE LAB] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function pairSatiri(r, i) {
  const ort = num(r.ortIyilesme);
  const ayr = num(r.ayirtEdicilik);
  const skor = num(r.pairScore);
  return `${i + 1}) ${htmlSafe(r.etiket)}\n` +
    `   📌 ${r.toplam} işlem | TP:${r.tp} SL:${r.sl} BE:${r.be} | Başarı %${pct(r.tpOrani, 1)} | Net ${pct(r.net, 2)} | PF ${htmlSafe(r.profitFactorText)}\n` +
    `   🧬 Tekil Ort:%${pct(r.tekilOrt, 1)} | Sinerji ${ort >= 0 ? '+' : ''}${pct(ort, 1)} | DNA ${ayr >= 0 ? '+' : ''}${pct(ayr, 1)} | Pair Skor ${skor >= 0 ? '+' : ''}${pct(skor, 1)} | Güven ${r.guven}`;
}

function telegramMetni(model = buildPairImportanceModel()) {
  if (ayarlar.pairImportanceLabAktif === false) return '';
  const min = model.ayarlar?.minOrnek || DEFAULT_MIN_ORNEK;
  const kapanan = num(model.global?.tp) + num(model.global?.sl) + num(model.global?.be);
  let metin = `\n\n🧪 <b>PAIR IMPORTANCE LAB v3.2.5</b>\n` +
    `Amaç: İki özelliğin birlikte geldiğinde tekil ortalamaya göre güçlenip güçlenmediğini ölçmek. Emir motoruna müdahale yok.\n` +
    `📦 BlackBox kapanış: ${kapanan || num(model.global?.toplam)} | Ölçülen pair: ${model.pairSayisi || 0} | Min örnek: ${min}\n`;

  if (!model.yeterliPairler || !model.yeterliPairler.length) {
    metin += `Henüz güvenilir Pair Importance için yeterli veri yok. En az ${min} örnekli ikili DNA'lar oluştukça bu bölüm dolacak.`;
    return metin;
  }

  if (model.gucluPairler?.length) {
    metin += `\n✅ <b>Güçlü İkili DNA / Sinerji</b>\n` + model.gucluPairler.map(pairSatiri).join('\n');
  }
  if (model.riskliPairler?.length) {
    metin += `\n\n🚫 <b>Riskli İkili DNA</b>\n` + model.riskliPairler.map(pairSatiri).join('\n');
  }
  if (model.sinerjiPairleri?.length) {
    metin += `\n\n🔬 <b>En Belirgin Sinerji/Fark Pairleri</b>\n` + model.sinerjiPairleri.map(pairSatiri).join('\n');
  }
  metin += `\n\n📁 Konsol çıktısı: data/agros-pair-importance-lab.json + .csv`;
  return metin;
}

function telegramMetniVeExport(model = buildPairImportanceModel()) {
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildPairImportanceModel,
  writeConsoleModel,
  telegramMetni,
  telegramMetniVeExport,
  pairHaritasiOlustur,
  dosyalar: { PAIR_MODEL_JSON, PAIR_MODEL_CSV }
};
