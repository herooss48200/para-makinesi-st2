/**
 * AGROS v3.5.3 Learning Validation Engine
 *
 * Amaç:
 * - Botun gerçekten neden kazandığını/kaybettiğini sayısal olarak doğrulamak.
 * - Kapanmış işlemlerden karlılık, Long/Short ayrımı ve Signature başarı doğrulaması üretmek.
 * - Açık pozisyonlardan Floating PNL ve gerçek net portföy görünümü hesaplamak.
 * - Trade Engine'e müdahale etmez; emir açmaz, kapatmaz, filtrelemez.
 */

const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const ANALIZ_JSONL = path.join(DATA_DIR, 'argos-trade-analiz.jsonl');
const BLACKBOX_JSONL = path.join(DATA_DIR, 'blackbox-snapshots.jsonl');
const MODEL_JSON = path.join(DATA_DIR, 'agros-learning-validation.json');
const MODEL_CSV = path.join(DATA_DIR, 'agros-learning-validation-signatures.csv');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(v, digits = 4) {
  const n = num(v);
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function pct(v, digits = 2) {
  return num(v).toFixed(digits);
}

function money(v, digits = 2) {
  const n = num(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function htmlSafe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function csvSafe(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function readJsonl(file, limit = 5000) {
  try {
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf8').trim();
    if (!text) return [];
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - limit)).map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (err) {
    console.error(`⚠️ [LEARNING VALIDATION] JSONL okunamadı: ${path.basename(file)} | ${err.message}`);
    return [];
  }
}

function sonucNormalize(v, net) {
  const s = String(v || '').toUpperCase();
  if (['TP', 'SL', 'BE'].includes(s)) return s;
  if (num(net) > 0) return 'TP';
  if (num(net) < 0) return 'SL';
  return 'BE';
}

function kapanisKayitlari() {
  const bb = readJsonl(BLACKBOX_JSONL, num(ayarlar.learningValidationMaxKayit || 5000))
    .filter(r => String(r.kayitTipi || '').toUpperCase() === 'KAPANIS');

  if (bb.length) {
    return bb.map(r => ({
      kaynak: 'blackbox',
      tradeId: r.tradeId || '',
      zaman: r.zaman || '',
      symbol: r.symbol || '',
      yon: String(r.yon || '').toUpperCase(),
      sonuc: sonucNormalize(r.sonuc, r.netKarZarar),
      netKarZarar: num(r.netKarZarar),
      komisyon: num(r.komisyon),
      tutmaSuresiMs: num(r.tutmaSuresiMs || r.sureMs),
      fiyatKarYuzdesi: num(r.fiyatKarYuzdesi),
      signatureKey: r.acilis?.strategySignature?.key || '',
      signatureLabel: r.acilis?.strategySignature?.label || '',
      btcBits: r.acilis?.strategySignature?.btcBits || '',
      coinBits: r.acilis?.strategySignature?.coinBits || '',
      bbBolge: r.acilis?.coin?.bollinger?.bolge || '',
      acilis: r.acilis || null
    }));
  }

  return readJsonl(ANALIZ_JSONL, num(ayarlar.learningValidationMaxKayit || 5000))
    .filter(r => String(r.kayitTipi || '').toUpperCase() === 'KAPANIS')
    .map(r => ({
      kaynak: 'analiz',
      tradeId: r.tradeId || '',
      zaman: r.zaman || '',
      symbol: r.symbol || '',
      yon: String(r.yon || '').toUpperCase(),
      sonuc: sonucNormalize(r.sonuc, r.netKarZarar),
      netKarZarar: num(r.netKarZarar),
      komisyon: num(r.komisyon),
      tutmaSuresiMs: num(r.tutmaSuresiMs),
      fiyatKarYuzdesi: num(r.fiyatKarYuzdesi),
      signatureKey: '',
      signatureLabel: '',
      btcBits: '',
      coinBits: '',
      bbBolge: '',
      acilis: null
    }));
}

function emptyStats() {
  return {
    toplam: 0,
    tp: 0,
    sl: 0,
    be: 0,
    net: 0,
    komisyon: 0,
    tpNetToplam: 0,
    slNetToplam: 0,
    beNetToplam: 0,
    sureToplamMs: 0,
    sureSayisi: 0,
    karToplam: 0,
    zararToplamAbs: 0
  };
}

function addStats(st, r) {
  st.toplam += 1;
  st.net += num(r.netKarZarar);
  st.komisyon += num(r.komisyon);
  const sonuc = sonucNormalize(r.sonuc, r.netKarZarar);
  if (sonuc === 'TP') { st.tp += 1; st.tpNetToplam += num(r.netKarZarar); st.karToplam += Math.max(0, num(r.netKarZarar)); }
  else if (sonuc === 'SL') { st.sl += 1; st.slNetToplam += num(r.netKarZarar); st.zararToplamAbs += Math.abs(Math.min(0, num(r.netKarZarar))); }
  else { st.be += 1; st.beNetToplam += num(r.netKarZarar); }
  if (num(r.tutmaSuresiMs) > 0) { st.sureToplamMs += num(r.tutmaSuresiMs); st.sureSayisi += 1; }
}

function finalizeStats(st) {
  const kararli = st.tp + st.sl;
  const avgTp = st.tp > 0 ? st.tpNetToplam / st.tp : 0;
  const avgSl = st.sl > 0 ? st.slNetToplam / st.sl : 0;
  const avgBe = st.be > 0 ? st.beNetToplam / st.be : 0;
  const winRate = kararli > 0 ? (st.tp / kararli) * 100 : 0;
  const profitFactor = st.zararToplamAbs > 0 ? st.karToplam / st.zararToplamAbs : (st.karToplam > 0 ? 'INF' : 0);
  const expectancy = st.toplam > 0 ? st.net / st.toplam : 0;
  const payoffRatio = Math.abs(avgSl) > 0 ? avgTp / Math.abs(avgSl) : (avgTp > 0 ? 'INF' : 0);
  const ortSureDakika = st.sureSayisi > 0 ? (st.sureToplamMs / st.sureSayisi) / 60000 : 0;
  const edge = expectancy > 0.05 ? 'POZITIF' : (expectancy < -0.05 ? 'NEGATIF' : 'NOTR');
  return {
    ...st,
    net: round(st.net, 6),
    komisyon: round(st.komisyon, 6),
    winRate: round(winRate, 4),
    avgTp: round(avgTp, 6),
    avgSl: round(avgSl, 6),
    avgBe: round(avgBe, 6),
    profitFactor: profitFactor === 'INF' ? 'INF' : round(profitFactor, 6),
    expectancy: round(expectancy, 6),
    payoffRatio: payoffRatio === 'INF' ? 'INF' : round(payoffRatio, 6),
    ortSureDakika: round(ortSureDakika, 2),
    edge
  };
}

function pozisyonYon(p) { return String(p.yon || p.side || p.direction || '').toUpperCase(); }
function pozisyonSembol(p) { return p.sym || p.sembol || p.symbol || p.coin || p.girisAnalizi?.symbol || p.blackboxAcilis?.symbol || 'BILINMIYOR'; }
function pozisyonGiris(p) { return num(p.girisFiyati || p.entryPrice || p.giris || p.entry); }
function pozisyonFiyat(p) {
  const sembol = pozisyonSembol(p);
  return num(h.state.canliFiyatlar?.[sembol] || p.sonFiyat || p.anlikFiyat || p.currentPrice || p.fiyat || pozisyonGiris(p));
}
function pozisyonDegeri(p) {
  return num(p.pozisyonDegeri || p.notional || p.positionValue || (num(p.miktar || p.quantity || p.qty) * pozisyonGiris(p)) || (num(ayarlar.calisilmakIstenenUsdtMiktar) * num(ayarlar.mevcutKaldirac)));
}
function pozisyonFloatingNet(p) {
  if (Number.isFinite(Number(p.anlikNetPnl))) return num(p.anlikNetPnl);
  if (Number.isFinite(Number(p.netPnl))) return num(p.netPnl);
  const giris = pozisyonGiris(p);
  const fiyat = pozisyonFiyat(p);
  const deger = pozisyonDegeri(p);
  const yon = pozisyonYon(p);
  if (!giris || !fiyat || !deger) return 0;
  const hareket = yon === 'SHORT' ? ((giris - fiyat) / giris) : ((fiyat - giris) / giris);
  return hareket * deger;
}

function floatingAnaliz() {
  const aktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
  let toplam = 0, long = 0, short = 0;
  for (const p of aktifler) {
    const pnl = pozisyonFloatingNet(p);
    toplam += pnl;
    if (pozisyonYon(p) === 'SHORT') short += pnl;
    else long += pnl;
  }
  const netKasa = num(h.state.basariOzeti?.netKarZarar);
  return {
    aktifPozisyon: aktifler.length,
    floatingToplam: round(toplam, 6),
    floatingLong: round(long, 6),
    floatingShort: round(short, 6),
    netKasa: round(netKasa, 6),
    gercekNet: round(netKasa + toplam, 6)
  };
}

function signatureAnaliz(records) {
  const minSupport = num(ayarlar.learningValidationMinSupport || 3);
  const map = new Map();
  for (const r of records) {
    const key = r.signatureKey || (r.btcBits || r.coinBits ? `${r.yon}|BTC=${r.btcBits}|COIN=${r.coinBits}|BB=${r.bbBolge}` : 'SIGNATURE-YOK');
    if (!key || key === 'SIGNATURE-YOK') continue;
    if (!map.has(key)) map.set(key, { key, etiket: r.signatureLabel || key, ...emptyStats() });
    addStats(map.get(key), r);
  }
  const list = Array.from(map.values()).map(finalizeStats).filter(x => x.toplam >= minSupport);
  const basarili = [...list].sort((a, b) => num(b.expectancy) - num(a.expectancy) || num(b.winRate) - num(a.winRate) || num(b.toplam) - num(a.toplam));
  const riskli = [...list].sort((a, b) => num(a.expectancy) - num(b.expectancy) || num(a.winRate) - num(b.winRate) || num(b.toplam) - num(a.toplam));
  return {
    minSupport,
    signatureSayisi: list.length,
    enBasarili: basarili.slice(0, 5),
    enRiskli: riskli.slice(0, 5)
  };
}

function validationScore(global, sig) {
  const minSupport = num(ayarlar.learningValidationMinSupport || 3);
  const reliable = (sig.enBasarili || []).filter(x => x.toplam >= minSupport && num(x.expectancy) > 0).length +
    (sig.enRiskli || []).filter(x => x.toplam >= minSupport && num(x.expectancy) < 0).length;
  const coverage = global.toplam > 0 ? Math.min(100, (sig.signatureSayisi / Math.max(1, global.toplam)) * 100) : 0;
  const dataScore = Math.min(40, Math.log10(Math.max(1, global.toplam)) * 20);
  const edgeScore = Math.min(30, Math.abs(num(global.expectancy)) * 30);
  const signatureScore = Math.min(30, reliable * 4);
  return {
    kapanisSayisi: global.toplam,
    signatureSayisi: sig.signatureSayisi,
    guvenilirAdaySayisi: reliable,
    coverage: round(coverage, 2),
    learningProgress: round(Math.min(100, dataScore + edgeScore + signatureScore), 2),
    durum: global.toplam < minSupport ? 'VERI_BIRIKIYOR' : (reliable > 0 ? 'OGRENME_DOGRULANIYOR' : 'SIGNATURE_KANITI_ZAYIF')
  };
}

function buildLearningValidationModel() {
  const records = kapanisKayitlari();
  const globalRaw = emptyStats();
  const longRaw = emptyStats();
  const shortRaw = emptyStats();
  for (const r of records) {
    addStats(globalRaw, r);
    if (r.yon === 'SHORT') addStats(shortRaw, r);
    else addStats(longRaw, r);
  }
  const global = finalizeStats(globalRaw);
  const long = finalizeStats(longRaw);
  const short = finalizeStats(shortRaw);
  const signature = signatureAnaliz(records);
  const floating = floatingAnaliz();
  const score = validationScore(global, signature);
  return {
    version: 'v3.5.3-LEARNING-VALIDATION',
    createdAt: new Date().toISOString(),
    aciklama: 'Kapanmis islemlerden karlilik, Long/Short ayrimi, Signature dogrulamasi ve acik pozisyon Floating PNL hesaplar. Trade Engine degismez.',
    emirMotoruMudahalesi: false,
    kaynak: records.length && records[0].kaynak ? records[0].kaynak : 'state/fallback',
    global,
    long,
    short,
    floating,
    signature,
    learningScore: score
  };
}

function writeConsoleModel(model = buildLearningValidationModel()) {
  if (ayarlar.learningValidationExportAktif === false) return false;
  try {
    ensureDataDir();
    fs.writeFileSync(MODEL_JSON, JSON.stringify(model, null, 2));
    const rows = (model.signature?.enBasarili || []).concat(model.signature?.enRiskli || []);
    const cols = ['key','etiket','toplam','tp','sl','be','winRate','net','expectancy','profitFactor','payoffRatio','edge'];
    fs.writeFileSync(MODEL_CSV, [cols.join(';')].concat(rows.map(r => cols.map(c => csvSafe(r[c])).join(';'))).join('\n') + '\n');
    return true;
  } catch (err) {
    console.error(`⚠️ [LEARNING VALIDATION] Konsol modeli yazılamadı: ${err.message}`);
    return false;
  }
}

function signatureSatiri(r, i) {
  return `${i + 1}) ${htmlSafe(r.etiket || r.key)}\n` +
    `   Örnek ${r.toplam} | TP:${r.tp} SL:${r.sl} BE:${r.be} | Başarı %${pct(r.winRate, 1)} | Net ${money(r.net, 2)} | Exp ${money(r.expectancy, 3)}`;
}

function telegramMetni(model = buildLearningValidationModel()) {
  if (ayarlar.learningValidationAktif === false) return '';
  const g = model.global || {};
  const l = model.long || {};
  const s = model.short || {};
  const f = model.floating || {};
  const sc = model.learningScore || {};
  const sig = model.signature || {};
  let metin = `\n\n🧪 <b>LEARNING VALIDATION v3.5.3</b>\n` +
    `Amaç: Bugün neden kazanıldı/kaybedildi sorusunu sayısal doğrulamak. Emir motoruna müdahale yok.\n` +
    `📊 Kapanış ${g.toplam || 0} | Win %${pct(g.winRate, 2)} | PF ${htmlSafe(g.profitFactor)} | Payoff ${htmlSafe(g.payoffRatio)} | Exp ${money(g.expectancy, 3)} | Edge ${htmlSafe(g.edge)}\n` +
    `💰 Ort TP ${money(g.avgTp, 3)} | Ort SL ${money(g.avgSl, 3)} | Ort BE ${money(g.avgBe, 3)} | Ort Süre ${pct(g.ortSureDakika, 1)} dk\n` +
    `🟢 LONG: Win %${pct(l.winRate, 1)} | Exp ${money(l.expectancy, 3)} | Net ${money(l.net, 2)} | PF ${htmlSafe(l.profitFactor)}\n` +
    `🔴 SHORT: Win %${pct(s.winRate, 1)} | Exp ${money(s.expectancy, 3)} | Net ${money(s.net, 2)} | PF ${htmlSafe(s.profitFactor)}\n` +
    `📈 Floating: Toplam ${money(f.floatingToplam, 2)} | Long ${money(f.floatingLong, 2)} | Short ${money(f.floatingShort, 2)} | Gerçek Net ${money(f.gercekNet, 2)}\n` +
    `🧠 Öğrenme: ${htmlSafe(sc.durum)} | Progress %${pct(sc.learningProgress, 1)} | Signature ${sc.signatureSayisi || 0} | Güvenilir ${sc.guvenilirAdaySayisi || 0}`;

  if (sig.enBasarili?.length) {
    metin += `\n\n🏆 <b>Doğrulanan Başarılı DNA</b>\n` + sig.enBasarili.slice(0, 3).map(signatureSatiri).join('\n');
  }
  if (sig.enRiskli?.length) {
    metin += `\n\n⚠️ <b>Doğrulanan Riskli DNA</b>\n` + sig.enRiskli.slice(0, 3).map(signatureSatiri).join('\n');
  }
  metin += `\n\n📁 Konsol çıktısı: data/agros-learning-validation.json + .csv`;
  return metin;
}

function portfoyKisaMetni(model = buildLearningValidationModel()) {
  if (ayarlar.learningValidationAktif === false) return '';
  const g = model.global || {};
  const l = model.long || {};
  const s = model.short || {};
  const f = model.floating || {};
  return `\n📈 <b>Floating PNL:</b> ${money(f.floatingToplam, 4)} USDT | Long ${money(f.floatingLong, 2)} | Short ${money(f.floatingShort, 2)}\n` +
    `🧮 <b>Gerçek Net:</b> ${money(f.gercekNet, 4)} USDT\n` +
    `📊 <b>Karlılık:</b> PF ${htmlSafe(g.profitFactor)} | Exp ${money(g.expectancy, 3)} | TP Ort ${money(g.avgTp, 2)} | SL Ort ${money(g.avgSl, 2)}\n` +
    `🟢 L Exp ${money(l.expectancy, 3)} | 🔴 S Exp ${money(s.expectancy, 3)} | Edge ${htmlSafe(g.edge)}`;
}

function telegramMetniVeExport() {
  const model = buildLearningValidationModel();
  writeConsoleModel(model);
  return telegramMetni(model);
}

module.exports = {
  buildLearningValidationModel,
  writeConsoleModel,
  telegramMetni,
  portfoyKisaMetni,
  telegramMetniVeExport,
  dosyalar: { MODEL_JSON, MODEL_CSV }
};
