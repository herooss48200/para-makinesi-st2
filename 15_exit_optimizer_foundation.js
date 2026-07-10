/**
 * AGROS v3.4.0 - EXIT OPTIMIZER FOUNDATION
 *
 * Bu modül Trade Engine'e dokunmaz.
 * Açık/kapanmış işlemlerin çıkış verimini ölçer:
 * MFE, MAE, kaçırılan kâr, Profit Capture Ratio, stop/kademe geçmişi ve DNA/Confidence bağlamı.
 */

const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'exit-optimizer-trades.jsonl');
const CSV = path.join(DATA_DIR, 'exit-optimizer-trades.csv');
const MODEL_JSON = path.join(DATA_DIR, 'exit-optimizer-foundation.json');

const CSV_COLUMNS = [
  'tradeId','zaman','symbol','yon','sonuc','kapanisSebebi','girisFiyati','kapanisFiyati',
  'fiyatKarYuzdesi','netPozisyonYuzdesi','netMarjinYuzdesi','netKarZarar','komisyon',
  'mfeYuzde','maeYuzde','missedProfitYuzde','givebackYuzde','profitCaptureRatio','exitEfficiency',
  'maxKarFiyat','maxZararFiyat','sureMs','stopGuncellemeSayisi','kademeDegisimSayisi','sonKademe','maxKademe',
  'confidenceScore','confidenceLevel','signatureShort','signatureKey','signatureLabel','pusuKalite','pusuSenaryo','stopMode'
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, CSV_COLUMNS.join(';') + '\n');
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, digits = 4) {
  const n = num(v);
  return Number(n.toFixed(digits));
}

function csvSafe(v) {
  const s = String(v ?? '');
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function htmlSafe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tradeId(pos) {
  return String(pos?.tradeId || pos?.sanalOrderId || `${pos?.sym || 'SYM'}-${pos?.yon || 'YON'}-${pos?.acilisZamani || pos?.zaman || Date.now()}`);
}

function pricePrecision(pos) {
  return h.state.basamaklar?.[pos?.sym]?.pricePrecision ?? 4;
}

function karYuzde(pos, fiyat) {
  const giris = num(pos?.girisFiyati);
  const f = num(fiyat);
  if (!giris || !f) return 0;
  return pos?.yon === 'LONG' ? ((f - giris) / giris) * 100 : ((giris - f) / giris) * 100;
}

function confidenceBilgisi(pos) {
  const kaynak = pos?.confidence || pos?.confidenceSnapshot || pos?.blackboxAcilis?.confidence || pos?.blackboxAcilis?.confidenceEngine || pos?.girisAnalizi?.confidence || {};
  return {
    score: num(kaynak.score ?? kaynak.confidence ?? kaynak.confidenceScore ?? kaynak.finalScore ?? kaynak.weightedScore, 0),
    level: kaynak.level || kaynak.confidenceLevel || kaynak.riskLevel || kaynak.kalibrasyon || 'N/A'
  };
}

function signatureBilgisi(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return {
    short: sig.shortKey || '',
    key: sig.key || '',
    label: sig.label || ''
  };
}

function kaliteBilgisi(pos) {
  const kalite = pos?.girisAnalizi?.pusuKalite || {};
  return {
    kalite: kalite.sinif || '',
    senaryo: kalite.senaryo || pos?.girisAnalizi?.senaryo || ''
  };
}

function executionEnsure(pos) {
  if (!pos) return null;
  const id = tradeId(pos);
  const now = Date.now();
  pos.execution = pos.execution || {
    version: 'v3.4.0-EXIT-OPTIMIZER-FOUNDATION',
    tradeId: id,
    baslangicZamani: pos.acilisZamani || pos.zaman || now,
    sonGuncelleme: now,
    ilkGirisFiyati: num(pos.girisFiyati),
    maxKarFiyat: num(pos.girisFiyati),
    maxZararFiyat: num(pos.girisFiyati),
    mfeYuzde: 0,
    maeYuzde: 0,
    stopHistory: [],
    kademeHistory: [],
    pricePath: [],
    tickSayisi: 0,
    maxKademe: num(pos.tpKademe, 0)
  };
  if (!Array.isArray(pos.execution.stopHistory)) pos.execution.stopHistory = [];
  if (!Array.isArray(pos.execution.kademeHistory)) pos.execution.kademeHistory = [];
  if (!Array.isArray(pos.execution.pricePath)) pos.execution.pricePath = [];
  if (!pos.execution.tradeId) pos.execution.tradeId = id;
  return pos.execution;
}

function pozisyonBaslat(pos) {
  const ex = executionEnsure(pos);
  if (!ex) return null;
  const sig = signatureBilgisi(pos);
  const conf = confidenceBilgisi(pos);
  const kalite = kaliteBilgisi(pos);
  ex.signatureShort = sig.short;
  ex.signatureKey = sig.key;
  ex.signatureLabel = sig.label;
  ex.confidenceScore = conf.score;
  ex.confidenceLevel = conf.level;
  ex.pusuKalite = kalite.kalite;
  ex.pusuSenaryo = kalite.senaryo;
  ex.stopMode = ayarlar.stopTakipModu || '';
  return ex;
}

function tickGuncelle(pos, canliFiyat) {
  const ex = executionEnsure(pos);
  if (!ex) return null;
  const fiyat = num(canliFiyat);
  if (!fiyat) return ex;
  ex.tickSayisi = num(ex.tickSayisi) + 1;
  ex.sonGuncelleme = Date.now();

  const k = karYuzde(pos, fiyat);

  // Exit Evolution için hafif fiyat yolu kaydı. Canlı işlem kararına müdahale etmez.
  // Normal örnekler ayarlanabilir aralıkla, yeni MFE/MAE uçları ise anında saklanır.
  const sampleMs = Math.max(5000, num(ayarlar.exitReplayPathSampleSeconds, 30) * 1000);
  const lastPath = ex.pricePath[ex.pricePath.length - 1];
  const newExtreme = k > num(ex.mfeYuzde) || k < num(ex.maeYuzde);
  if (!lastPath || ex.sonGuncelleme - num(lastPath.ts) >= sampleMs || newExtreme) {
    const trendNow = h.state.trendSuperTrendCanli?.[pos.sym] || h.state.trendSuperTrend?.[pos.sym] || h.state.sniperSuperTrend?.[pos.sym] || null;
    const expectedTrend = pos?.yon === 'LONG' ? 'UP' : 'DOWN';
    ex.pricePath.push({
      ts: ex.sonGuncelleme,
      price: round(fiyat, 12),
      pnlPct: round(k, 4),
      stTrend: trendNow,
      stAligned: trendNow ? trendNow === expectedTrend : null
    });
    const maxPoints = Math.max(120, num(ayarlar.exitReplayMaxPathPoints, 600));
    if (ex.pricePath.length > maxPoints) {
      // İlk örneği koru; en eski ara örnekleri seyrelterek hafızayı sınırla.
      ex.pricePath = [ex.pricePath[0], ...ex.pricePath.slice(-(maxPoints - 1))];
    }
  }

  if (k >= num(ex.mfeYuzde)) {
    ex.mfeYuzde = round(k, 4);
    ex.maxKarFiyat = fiyat;
    ex.maxKarZamani = ex.sonGuncelleme;
  }
  if (k <= num(ex.maeYuzde)) {
    ex.maeYuzde = round(k, 4);
    ex.maxZararFiyat = fiyat;
    ex.maxZararZamani = ex.sonGuncelleme;
  }

  // Analiz Merkezi journey alanıyla uyumlu kal.
  if (pos.journey) {
    ex.mfeYuzde = round(Math.max(num(ex.mfeYuzde), num(pos.journey.mfeYuzde)), 4);
    ex.maeYuzde = round(Math.min(num(ex.maeYuzde), num(pos.journey.maeYuzde)), 4);
    ex.maxKarFiyat = num(pos.yon === 'LONG' ? pos.journey.enYuksekFiyat : pos.journey.enDusukFiyat, ex.maxKarFiyat);
    ex.maxZararFiyat = num(pos.yon === 'LONG' ? pos.journey.enDusukFiyat : pos.journey.enYuksekFiyat, ex.maxZararFiyat);
  }

  const kademe = num(pos.tpKademe, 0);
  if (kademe > num(ex.maxKademe, 0)) ex.maxKademe = kademe;
  const son = ex.kademeHistory[ex.kademeHistory.length - 1];
  if (!son || num(son.kademe) !== kademe) {
    ex.kademeHistory.push({ zaman: new Date().toISOString(), kademe, karYuzde: round(k, 4), fiyat });
    if (ex.kademeHistory.length > 80) ex.kademeHistory = ex.kademeHistory.slice(-80);
  }
  return ex;
}

function stopKaydet(pos, oncekiSl, yeniSl, canliFiyat, meta = {}) {
  const ex = executionEnsure(pos);
  if (!ex) return null;
  const rec = {
    zaman: new Date().toISOString(),
    oncekiSl: round(oncekiSl, 12),
    yeniSl: round(yeniSl, 12),
    canliFiyat: round(canliFiyat, 12),
    karYuzde: round(karYuzde(pos, canliFiyat), 4),
    kademeOnceki: num(pos.oncekiTpKademe, 0),
    kademeYeni: num(pos.tpKademe, 0),
    mevcutTpYuzdesi: round(pos.mevcutTpYuzdesi || 0, 4),
    korunanKarYuzdesi: round(pos.korunanKarYuzdesi || 0, 4),
    kaynak: meta.kaynak || (pos.sanal ? 'SANAL' : 'BORSA')
  };
  ex.stopHistory.push(rec);
  if (ex.stopHistory.length > 80) ex.stopHistory = ex.stopHistory.slice(-80);
  ex.sonStopGuncelleme = rec;
  return rec;
}

function exitMetrics(pos, sonuc = {}) {
  const ex = executionEnsure(pos) || {};
  const kapanisFiyati = num(sonuc.kapanisFiyati);
  const fiyatKar = num(sonuc.fiyatKarYuzdesi, kapanisFiyati ? karYuzde(pos, kapanisFiyati) : 0);
  const netPozYuzde = num(sonuc.netPozisyonYuzdesi, fiyatKar);
  const mfe = Math.max(0, num(ex.mfeYuzde ?? pos?.journey?.mfeYuzde));
  const mae = num(ex.maeYuzde ?? pos?.journey?.maeYuzde);
  const missed = Math.max(0, mfe - Math.max(0, fiyatKar));
  const giveback = mfe > 0 ? (missed / mfe) * 100 : 0;
  const pcr = mfe > 0 ? (Math.max(0, fiyatKar) / mfe) * 100 : (fiyatKar > 0 ? 100 : 0);
  const exitEfficiency = mfe > 0 ? Math.max(0, Math.min(100, pcr)) : (fiyatKar >= 0 ? 100 : 0);
  const sureMs = Date.now() - num(pos?.acilisZamani || pos?.zaman || Date.now());
  return {
    mfeYuzde: round(mfe, 4),
    maeYuzde: round(mae, 4),
    missedProfitYuzde: round(missed, 4),
    givebackYuzde: round(giveback, 2),
    profitCaptureRatio: round(pcr, 2),
    exitEfficiency: round(exitEfficiency, 2),
    fiyatKarYuzdesi: round(fiyatKar, 4),
    netPozisyonYuzdesi: round(netPozYuzde, 4),
    sureMs
  };
}

function ozetEnsure() {
  h.state.executionOzet = h.state.executionOzet || {
    version: 'v3.4.0-EXIT-OPTIMIZER-FOUNDATION',
    sonGuncelleme: new Date().toISOString(),
    toplamKapanis: 0,
    toplamMfe: 0,
    toplamMae: 0,
    toplamMissed: 0,
    toplamPcr: 0,
    enCokKaciranlar: [],
    son10: [],
    bySignature: {},
    byConfidence: {}
  };
  for (const k of ['enCokKaciranlar','son10']) if (!Array.isArray(h.state.executionOzet[k])) h.state.executionOzet[k] = [];
  for (const k of ['bySignature','byConfidence']) if (!h.state.executionOzet[k] || typeof h.state.executionOzet[k] !== 'object') h.state.executionOzet[k] = {};
  return h.state.executionOzet;
}

function bucketEkle(stats, key, label, rec) {
  if (!key) key = 'YOK';
  if (!stats[key]) stats[key] = { key, label: label || key, toplam: 0, tp: 0, sl: 0, be: 0, net: 0, mfeToplam: 0, maeToplam: 0, missedToplam: 0, pcrToplam: 0 };
  const b = stats[key];
  b.label = label || b.label || key;
  b.toplam += 1;
  if (rec.sonuc === 'TP') b.tp += 1;
  else if (rec.sonuc === 'BE') b.be += 1;
  else if (rec.sonuc === 'SL') b.sl += 1;
  b.net += num(rec.netKarZarar);
  b.mfeToplam += num(rec.mfeYuzde);
  b.maeToplam += num(rec.maeYuzde);
  b.missedToplam += num(rec.missedProfitYuzde);
  b.pcrToplam += num(rec.profitCaptureRatio);
}

function confidenceBucket(score) {
  const s = num(score);
  if (s >= 80) return 'CONF_80_PLUS';
  if (s >= 60) return 'CONF_60_79';
  if (s >= 40) return 'CONF_40_59';
  if (s > 0) return 'CONF_1_39';
  return 'CONF_YOK';
}

function kapanisKaydet(pos, sonuc = {}) {
  if (ayarlar.exitOptimizerAktif === false) return null;
  try {
    ensureDataDir();
    const ex = executionEnsure(pos) || {};
    const met = exitMetrics(pos, sonuc);
    const sig = signatureBilgisi(pos);
    const conf = confidenceBilgisi(pos);
    const kalite = kaliteBilgisi(pos);
    const rec = {
      version: 'v3.4.0-EXIT-OPTIMIZER-FOUNDATION',
      tradeId: tradeId(pos),
      zaman: new Date().toISOString(),
      symbol: pos?.sym || '',
      yon: pos?.yon || '',
      sonuc: String(sonuc?.sonuc || '').toUpperCase(),
      kapanisSebebi: sonuc?.kapanisSebebi || '',
      girisFiyati: num(pos?.girisFiyati),
      kapanisFiyati: num(sonuc?.kapanisFiyati),
      netMarjinYuzdesi: round(sonuc?.netMarjinYuzdesi || 0, 4),
      netKarZarar: round(sonuc?.netKarZarar || 0, 6),
      komisyon: round(sonuc?.komisyon || 0, 6),
      maxKarFiyat: num(ex.maxKarFiyat),
      maxZararFiyat: num(ex.maxZararFiyat),
      stopGuncellemeSayisi: Array.isArray(ex.stopHistory) ? ex.stopHistory.length : 0,
      kademeDegisimSayisi: Array.isArray(ex.kademeHistory) ? ex.kademeHistory.length : 0,
      sonKademe: num(pos?.tpKademe, 0),
      maxKademe: num(ex.maxKademe, 0),
      confidenceScore: conf.score,
      confidenceLevel: conf.level,
      signatureShort: sig.short,
      signatureKey: sig.key,
      signatureLabel: sig.label,
      pusuKalite: kalite.kalite,
      pusuSenaryo: kalite.senaryo,
      stopMode: ayarlar.stopTakipModu || '',
      stopHistory: ex.stopHistory || [],
      kademeHistory: ex.kademeHistory || [],
      ...met
    };

    fs.appendFileSync(JSONL, JSON.stringify(rec) + '\n');
    fs.appendFileSync(CSV, CSV_COLUMNS.map(c => csvSafe(rec[c])).join(';') + '\n');

    const o = ozetEnsure();
    o.sonGuncelleme = new Date().toISOString();
    o.toplamKapanis += 1;
    o.toplamMfe += num(rec.mfeYuzde);
    o.toplamMae += num(rec.maeYuzde);
    o.toplamMissed += num(rec.missedProfitYuzde);
    o.toplamPcr += num(rec.profitCaptureRatio);
    o.son10.unshift(rec);
    o.son10 = o.son10.slice(0, 10);
    o.enCokKaciranlar.push(rec);
    o.enCokKaciranlar = o.enCokKaciranlar
      .sort((a, b) => num(b.missedProfitYuzde) - num(a.missedProfitYuzde))
      .slice(0, 10);
    bucketEkle(o.bySignature, rec.signatureShort || rec.signatureKey || 'SIGNATURE_YOK', rec.signatureLabel || rec.signatureShort || 'Signature yok', rec);
    bucketEkle(o.byConfidence, confidenceBucket(rec.confidenceScore), confidenceBucket(rec.confidenceScore), rec);
    fs.writeFileSync(MODEL_JSON, JSON.stringify(buildExitOptimizerModel(), null, 2));
    return rec;
  } catch (err) {
    console.error(`⚠️ [EXIT OPTIMIZER] Kayıt yazılamadı: ${err.message}`);
    return null;
  }
}

function bucketModel(b) {
  const toplam = num(b?.toplam);
  return {
    ...b,
    ortMfe: toplam ? round(num(b.mfeToplam) / toplam, 3) : 0,
    ortMae: toplam ? round(num(b.maeToplam) / toplam, 3) : 0,
    ortMissed: toplam ? round(num(b.missedToplam) / toplam, 3) : 0,
    ortPcr: toplam ? round(num(b.pcrToplam) / toplam, 1) : 0,
    basari: (num(b?.tp) + num(b?.sl)) ? round((num(b.tp) / (num(b.tp) + num(b.sl))) * 100, 1) : 0
  };
}

function buildExitOptimizerModel() {
  const o = ozetEnsure();
  const toplam = num(o.toplamKapanis);
  const signatures = Object.values(o.bySignature || {}).map(bucketModel)
    .sort((a, b) => num(b.ortMissed) - num(a.ortMissed) || num(b.toplam) - num(a.toplam))
    .slice(0, num(ayarlar.exitOptimizerTopAday || 8));
  const confidence = Object.values(o.byConfidence || {}).map(bucketModel)
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
  return {
    version: 'v3.4.0-EXIT-OPTIMIZER-FOUNDATION',
    createdAt: new Date().toISOString(),
    aciklama: 'Çıkış verimi ölçüm katmanı. Emir motoruna müdahale etmez.',
    global: {
      toplamKapanis: toplam,
      ortMfe: toplam ? round(num(o.toplamMfe) / toplam, 3) : 0,
      ortMae: toplam ? round(num(o.toplamMae) / toplam, 3) : 0,
      ortMissed: toplam ? round(num(o.toplamMissed) / toplam, 3) : 0,
      ortPcr: toplam ? round(num(o.toplamPcr) / toplam, 1) : 0
    },
    enCokKaciranlar: (o.enCokKaciranlar || []).slice(0, num(ayarlar.exitOptimizerTopAday || 8)),
    son10: (o.son10 || []).slice(0, 10),
    signatures,
    confidence
  };
}

function kapanisMetni(pos, sonuc = {}) {
  if (ayarlar.exitOptimizerTelegramAktif === false) return '';
  const met = exitMetrics(pos, sonuc);
  const ex = executionEnsure(pos) || {};
  const p = pricePrecision(pos);
  const maxKarFiyat = num(ex.maxKarFiyat);
  const maxZararFiyat = num(ex.maxZararFiyat);
  return `\n\n━━━━━━━━━━━━━━━━━━\n` +
    `🧠 <b>EXIT OPTIMIZER FOUNDATION v3.4.0</b>\n` +
    `Amaç: İşlemden alınan kâr verimini ölçmek. Emir motoruna müdahale yok.\n` +
    `📈 MFE Max Kâr: %${met.mfeYuzde.toFixed(3)}${maxKarFiyat ? ` @ ${maxKarFiyat.toFixed(p)}` : ''}\n` +
    `📉 MAE Max Zarar: %${met.maeYuzde.toFixed(3)}${maxZararFiyat ? ` @ ${maxZararFiyat.toFixed(p)}` : ''}\n` +
    `💸 Kaçırılan Kâr: %${met.missedProfitYuzde.toFixed(3)} | Geri Verme: %${met.givebackYuzde.toFixed(1)}\n` +
    `🎯 Profit Capture Ratio: %${met.profitCaptureRatio.toFixed(1)} | Exit Efficiency: %${met.exitEfficiency.toFixed(1)}\n` +
    `🪜 Max Kademe: ${num(ex.maxKademe, 0)} | Stop Güncelleme: ${Array.isArray(ex.stopHistory) ? ex.stopHistory.length : 0}\n` +
    `🧬 DNA: ${htmlSafe(ex.signatureShort || signatureBilgisi(pos).short || 'YOK')} | Confidence: %${num(ex.confidenceScore || confidenceBilgisi(pos).score).toFixed(1)} ${htmlSafe(ex.confidenceLevel || confidenceBilgisi(pos).level)}`;
}

function bucketSatiri(b, i) {
  return `${i + 1}) ${htmlSafe(b.label || b.key)} | Örnek ${b.toplam} | MFE %${num(b.ortMfe).toFixed(2)} | PCR %${num(b.ortPcr).toFixed(1)} | Kaçan %${num(b.ortMissed).toFixed(2)} | Net ${num(b.net).toFixed(2)}`;
}

function telegramMetni(model = buildExitOptimizerModel()) {
  if (ayarlar.exitOptimizerAktif === false) return '';
  const g = model.global || {};
  let metin = `\n\n🧠 <b>EXIT OPTIMIZER FOUNDATION v3.4.0</b>\n` +
    `Amaç: MFE/MAE, kaçırılan kâr ve Profit Capture Ratio ile çıkış kalitesini ölçmek. Emir motoruna müdahale yok.\n` +
    `📦 Kapanış: ${num(g.toplamKapanis)} | Ort.MFE %${num(g.ortMfe).toFixed(2)} | Ort.MAE %${num(g.ortMae).toFixed(2)} | Ort.Kaçan %${num(g.ortMissed).toFixed(2)} | Ort.PCR %${num(g.ortPcr).toFixed(1)}`;
  if (model.enCokKaciranlar?.length) {
    metin += `\n\n💸 <b>En Çok Kâr Geri Veren Sonuçlar</b>\n` + model.enCokKaciranlar.slice(0, 5).map((r, i) => `${i + 1}) ${r.symbol} ${r.yon} ${r.sonuc} | MFE %${num(r.mfeYuzde).toFixed(2)} → Kapanış %${num(r.fiyatKarYuzdesi).toFixed(2)} | Kaçan %${num(r.missedProfitYuzde).toFixed(2)} | PCR %${num(r.profitCaptureRatio).toFixed(1)}`).join('\n');
  } else {
    metin += `\nHenüz kapanan Exit Optimizer verisi yok.`;
  }
  if (model.signatures?.length) {
    metin += `\n\n🧬 <b>DNA Bazlı Çıkış Verimi</b>\n` + model.signatures.slice(0, 5).map(bucketSatiri).join('\n');
  }
  return metin;
}

function telegramMetniVeExport() {
  const model = buildExitOptimizerModel();
  if (ayarlar.exitOptimizerExportAktif !== false) {
    try { ensureDataDir(); fs.writeFileSync(MODEL_JSON, JSON.stringify(model, null, 2)); } catch (err) { console.error(`[EXIT OPTIMIZER EXPORT] ${err.message}`); }
  }
  return telegramMetni(model);
}

module.exports = {
  pozisyonBaslat,
  tickGuncelle,
  stopKaydet,
  kapanisKaydet,
  kapanisMetni,
  buildExitOptimizerModel,
  telegramMetni,
  telegramMetniVeExport
};
