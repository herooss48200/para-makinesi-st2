const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'blackbox-snapshots.jsonl');
const CSV = path.join(DATA_DIR, 'blackbox-trades.csv');
const TFS = ayarlar.blackboxTimeframes || ['5m', '15m', '1h', '4h'];

function deneyKimligi() {
  const raw = ayarlar.strategyLabDeneyId || `${ayarlar.trendPeriyodu}-${ayarlar.pusuPeriyodu}-${ayarlar.sniperPeriyodu}-ST${ayarlar.superTrendPeriod}x${ayarlar.superTrendMultiplier}-BB${ayarlar.bollingerperiod}x${ayarlar.bollingercarpani}-${ayarlar.stopTakipModu}`;
  return String(raw).replace(/[^A-Za-z0-9_.-]+/g, '_');
}

function deneyEtiketi() {
  return ayarlar.strategyLabDeneyAdi || `${ayarlar.trendPeriyodu} trend + ${ayarlar.pusuPeriyodu} pusu + ${ayarlar.sniperPeriyodu} sniper`;
}

function deneyMeta() {
  return {
    id: deneyKimligi(),
    etiket: deneyEtiketi(),
    versiyon: (() => { try { return require('./versiyon.js').botSurumu || 'YOK'; } catch (_) { return 'YOK'; } })(),
    trendTf: ayarlar.trendPeriyodu,
    superTrendTf: ayarlar.superTrendPeriyodu || ayarlar.trendPeriyodu,
    pusuTf: ayarlar.pusuPeriyodu,
    sniperTf: ayarlar.sniperPeriyodu,
    stPeriod: ayarlar.superTrendPeriod,
    stMultiplier: ayarlar.superTrendMultiplier,
    bbPeriod: ayarlar.bollingerperiod,
    bbMultiplier: ayarlar.bollingercarpani,
    stopMode: ayarlar.stopTakipModu,
    leverage: ayarlar.mevcutKaldirac
  };
}

const CSV_BASLIK = [
  'tradeId','kayitTipi','zaman','symbol','yon','sonuc','kapanisSebebi',
  'girisFiyati','kapanisFiyati','netKarZarar','komisyon','mfeYuzde','maeYuzde',
  'open_btc_5m','open_btc_15m','open_btc_1h','open_btc_4h',
  'open_coin_5m','open_coin_15m','open_coin_1h','open_coin_4h',
  'close_btc_5m','close_btc_15m','close_btc_1h','close_btc_4h',
  'close_coin_5m','close_coin_15m','close_coin_1h','close_coin_4h',
  'open_btcUyum','open_coinUyum','open_toplamUyum','open_coinBbBolge','open_coinBbPozisyon','open_coinBbOrtaYakinlik',
  'open_btcPattern','open_coinPattern','open_fullPattern','open_exactComboKey','open_signatureKey','open_signatureLabel','open_btcAlignedTf','open_coinAlignedTf','open_btcBits','open_coinBits',
  'close_btcUyum','close_coinUyum','close_toplamUyum','close_coinBbBolge','close_coinBbPozisyon','close_coinBbOrtaYakinlik',
  'close_btcPattern','close_coinPattern','close_fullPattern','close_signatureKey','close_signatureLabel','close_btcAlignedTf','close_coinAlignedTf','close_btcBits','close_coinBits',
  'experimentId','experimentLabel','trendTf','pusuTf','sniperTf','stPeriod','stMultiplier','bbPeriod','bbMultiplier','stopMode','leverage'
];

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, CSV_BASLIK.join(',') + '\n');
}

function csv(v) {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function emojiTrend(t) { return t === 'UP' ? '🟢' : (t === 'DOWN' ? '🔴' : '⚪'); }
function yonTrend(yon) { return String(yon).toUpperCase() === 'SHORT' ? 'DOWN' : 'UP'; }

function trendDegeri(t) {
  const v = String(t || '').toUpperCase();
  return (v === 'UP' || v === 'DOWN') ? v : 'YOK';
}

function tfTrendDegeri(matrix, tf) {
  return trendDegeri(matrix?.[tf]?.trend);
}

function uyumEmoji(yon, trend) {
  const hedef = yonTrend(yon);
  const t = trendDegeri(trend);
  if (t === 'YOK') return '⚪';
  if (t === hedef) return hedef === 'UP' ? '🟢' : '🔴';
  return '⚫';
}

function uyumluTfListesi(matrix, yon) {
  const hedef = yonTrend(yon);
  return TFS.filter(tf => tfTrendDegeri(matrix, tf) === hedef);
}

function karsiTfListesi(matrix, yon) {
  const hedef = yonTrend(yon);
  return TFS.filter(tf => {
    const t = tfTrendDegeri(matrix, tf);
    return t !== 'YOK' && t !== hedef;
  });
}

function uyumBitleri(matrix, yon) {
  const hedef = yonTrend(yon);
  return TFS.map(tf => {
    const t = tfTrendDegeri(matrix, tf);
    if (t === 'YOK') return 'Y';
    return t === hedef ? '1' : '0';
  }).join('');
}

function tfListeMetni(list) {
  return list && list.length ? list.join('+') : '-';
}

function strategySignatureOlustur(symbol, yon, btc, coin) {
  const y = String(yon || 'YOK').toUpperCase();
  const btcUyumlu = uyumluTfListesi(btc?.superTrend, y);
  const coinUyumlu = uyumluTfListesi(coin?.superTrend, y);
  const btcKarsi = karsiTfListesi(btc?.superTrend, y);
  const coinKarsi = karsiTfListesi(coin?.superTrend, y);
  const btcBits = uyumBitleri(btc?.superTrend, y);
  const coinBits = uyumBitleri(coin?.superTrend, y);
  const bb = coin?.bollinger?.bolge || 'YOK';
  const hedef = yonTrend(y);
  const key = `YON=${y}|BTC=${btcBits}|COIN=${coinBits}|BTC_TF=${tfListeMetni(btcUyumlu)}|COIN_TF=${tfListeMetni(coinUyumlu)}|BB=${bb}`;
  const shortKey = `${y === 'SHORT' ? 'S' : 'L'}_B${btcBits}_C${coinBits}_${bb}`;
  // v3.0.2 FIX: Bu label imza istatistiklerinde birden fazla coin'i aynı koşul altında toplar.
  // Bu yüzden coin adını etikete yazmıyoruz; aksi halde ilk görülen coin (örn. DOGEUSDT)
  // sonraki ADA/YFI gibi işlemlerin 'Aynı Tam Kombinasyon + BB' satırında yanlış görünür.
  const label = `${y} | BTC[${tfListeMetni(btcUyumlu)}] ${btcUyumlu.length}/4 | Coin[${tfListeMetni(coinUyumlu)}] ${coinUyumlu.length}/4 | BB ${bb}`;
  return {
    yon: y,
    hedef,
    symbol: symbol || 'YOK',
    btcScore: `${btcUyumlu.length}/4`,
    coinScore: `${coinUyumlu.length}/4`,
    toplamScore: `${btcUyumlu.length + coinUyumlu.length}/8`,
    btcUyumluTf: btcUyumlu,
    coinUyumluTf: coinUyumlu,
    btcKarsiTf: btcKarsi,
    coinKarsiTf: coinKarsi,
    btcBits,
    coinBits,
    bb,
    key,
    shortKey,
    label
  };
}

function strategySignatureMetni(snap) {
  const sig = snap?.strategySignature;
  if (!snap || !sig) return '';
  function line(label, matrix) {
    return TFS.map(tf => {
      const t = tfTrendDegeri(matrix, tf);
      return `${tf} ${uyumEmoji(sig.yon, t)} ${t}`;
    }).join(' | ');
  }
  return `\n🧬 <b>STRATEGY LAB İMZASI</b>\n` +
    `📈 Yön: ${sig.yon === 'SHORT' ? '🔴 SHORT' : '🟢 LONG'} | Hedef ST: ${sig.hedef}\n` +
    `₿ BTC Uyum: ${sig.btcScore}\n${line('BTC', snap.btc?.superTrend)}\n` +
    `🪙 ${snap.symbol} Uyum: ${sig.coinScore}\n${line(snap.symbol, snap.coin?.superTrend)}\n` +
    `🔑 İmza: ${sig.shortKey}\n` +
    `🧩 Açılım: BTC[${tfListeMetni(sig.btcUyumluTf)}] | Coin[${tfListeMetni(sig.coinUyumluTf)}]`;
}


function bucketKopya(b) {
  return b ? { ...bosBucket(), ...b } : null;
}

function matrixSirasiBul(key, mode = 'best') {
  const o = ozetHazirla();
  const stats = Object.values(o.signatureMatrixStats || {}).filter(x => Number(x?.toplam || 0) > 0);
  const sorted = stats.sort((a, b) => {
    if (mode === 'worst') return Number(oran(a)) - Number(oran(b)) || Number(a.net || 0) - Number(b.net || 0) || Number(b.toplam || 0) - Number(a.toplam || 0);
    return Number(oran(b)) - Number(oran(a)) || Number(b.net || 0) - Number(a.net || 0) || Number(b.toplam || 0) - Number(a.toplam || 0);
  });
  const idx = sorted.findIndex(x => x.key === key);
  return idx >= 0 ? idx + 1 : null;
}

function matrixGecmisPerformansMetni(snap, baslik = 'GEÇMİŞ PERFORMANS') {
  if (!snap) return '';
  const o = ozetHazirla();
  const key = signatureMatrixKey(snap);
  const b = bucketKopya(o.signatureMatrixStats?.[key]);
  const sig = snap.strategySignature || {};
  const kisa = signatureMatrixKisa(snap);
  const etiket = signatureMatrixEtiket(snap);
  if (!b || !Number(b.toplam || 0)) {
    return `\n\n📚 <b>${baslik}</b>\n` +
      `🧬 İmza: ${kisa}\n` +
      `BTC: ${bitTfMetni(sig.btcBits || uyumBitleri(snap?.btc?.superTrend, sig.yon || snap.yon), sig.yon || snap.yon)}\n` +
      `Coin: ${bitTfMetni(sig.coinBits || uyumBitleri(snap?.coin?.superTrend, sig.yon || snap.yon), sig.yon || snap.yon)}\n` +
      `Bu 256 BTC×Coin imzası için henüz kapanan geçmiş işlem yok. İlk kapanıştan sonra oran oluşacak.`;
  }
  const toplam = Number(b.toplam || 0);
  const sonucN = Number(b.tp || 0) + Number(b.sl || 0);
  const basari = Number(oran(b)).toFixed(1);
  const basarisiz = sonucN > 0 ? ((Number(b.sl || 0) / sonucN) * 100).toFixed(1) : '0.0';
  const beOran = toplam > 0 ? ((Number(b.be || 0) / toplam) * 100).toFixed(1) : '0.0';
  const ortNet = toplam > 0 ? (Number(b.net || 0) / toplam).toFixed(3) : '0.000';
  const rankBest = matrixSirasiBul(key, 'best');
  const rankWorst = matrixSirasiBul(key, 'worst');
  return `\n\n📚 <b>${baslik}</b>\n` +
    `🧬 İmza: ${kisa}\n` +
    `${etiket}\n` +
    `🎯 Bu imzanın geçmiş başarı oranı: %${basari} | Başarısızlık: %${basarisiz} | BE: %${beOran}\n` +
    `📌 Örnek: ${toplam} işlem | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0}\n` +
    `💰 Net: ${Number(b.net || 0).toFixed(2)} USDT | Ort.Net: ${ortNet} | PF: ${profitFactor(b)}\n` +
    `🏁 Sıralama: En iyi #${rankBest || '-'} | En kötü #${rankWorst || '-'} | Güven: ${guvenMetni(b)}\n` +
    `🧠 Karar: ${imzaKararSeviyesi(b)}`;
}

function signatureKey(snap) { return snap?.strategySignature?.key || tamKombinasyonKey(snap, snap?.yon); }
function signatureEtiket(snap) { return snap?.strategySignature?.label || detayliKombinasyonEtiket(snap, snap?.yon); }
function signatureShort(snap) { return snap?.strategySignature?.shortKey || ''; }


function bitTrendEmoji(bit, yon) {
  const y = String(yon || '').toUpperCase();
  if (bit === '1') return y === 'SHORT' ? '🔴' : '🟢';
  if (bit === '0') return '⚫';
  return '⚪';
}

function bitTfMetni(bits, yon) {
  const b = String(bits || 'YYYY').padEnd(TFS.length, 'Y').slice(0, TFS.length).split('');
  return TFS.map((tf, i) => `${tf}${bitTrendEmoji(b[i], yon)}`).join(' ');
}

function bitTfListe(bits) {
  const b = String(bits || '').split('');
  const arr = [];
  for (let i = 0; i < TFS.length; i++) if (b[i] === '1') arr.push(TFS[i]);
  return arr.length ? arr.join('+') : '-';
}

function signatureMatrixKey(snap) {
  const sig = snap?.strategySignature || null;
  const yon = String(sig?.yon || snap?.yon || 'YOK').toUpperCase();
  const btcBits = sig?.btcBits || uyumBitleri(snap?.btc?.superTrend, yon);
  const coinBits = sig?.coinBits || uyumBitleri(snap?.coin?.superTrend, yon);
  return `YON=${yon}|BTC=${btcBits}|COIN=${coinBits}`;
}

function signatureMatrixEtiket(snap) {
  const sig = snap?.strategySignature || null;
  const yon = String(sig?.yon || snap?.yon || 'YOK').toUpperCase();
  const btcBits = sig?.btcBits || uyumBitleri(snap?.btc?.superTrend, yon);
  const coinBits = sig?.coinBits || uyumBitleri(snap?.coin?.superTrend, yon);
  return `${yon} | BTC ${bitTfMetni(btcBits, yon)} | Coin ${bitTfMetni(coinBits, yon)} | BTC[${bitTfListe(btcBits)}] Coin[${bitTfListe(coinBits)}]`;
}

function signatureMatrixKisa(snap) {
  const sig = snap?.strategySignature || null;
  const yon = String(sig?.yon || snap?.yon || 'YOK').toUpperCase();
  const btcBits = sig?.btcBits || uyumBitleri(snap?.btc?.superTrend, yon);
  const coinBits = sig?.coinBits || uyumBitleri(snap?.coin?.superTrend, yon);
  return `${yon === 'SHORT' ? 'S' : 'L'}_B${btcBits}_C${coinBits}`;
}

function tarihSaat(msOrIso) {
  const d = msOrIso ? new Date(msOrIso) : new Date();
  if (Number.isNaN(d.getTime())) return 'YOK';
  try {
    return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (_) {
    return d.toISOString();
  }
}

function sureMetni(ms) {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return 'YOK';
  let s = Math.floor(n / 1000);
  const gun = Math.floor(s / 86400); s %= 86400;
  const saat = Math.floor(s / 3600); s %= 3600;
  const dk = Math.floor(s / 60); const sn = s % 60;
  const parca = [];
  if (gun) parca.push(`${gun}g`);
  if (saat) parca.push(`${saat}s`);
  if (dk) parca.push(`${dk}dk`);
  parca.push(`${sn}sn`);
  return parca.join(' ');
}

function tradeZamanMetni(pos, kapanisZamani = Date.now()) {
  const acilis = Number(pos?.acilisZamani || pos?.zaman || 0);
  const kapanis = Number(kapanisZamani || Date.now());
  return `\n\n⏱️ <b>İşlem Zamanı</b>\n` +
    `🕒 Açılış: ${acilis ? tarihSaat(acilis) : 'YOK'}\n` +
    `🕒 Kapanış: ${kapanis ? tarihSaat(kapanis) : 'YOK'}\n` +
    `⏳ Süre: ${acilis && kapanis ? sureMetni(kapanis - acilis) : 'YOK'}`;
}

function uyumDegisimMetni(acilis, kapanis) {
  if (!acilis || !kapanis) return 'Uyum değişimi hesaplanamadı.';
  const a = acilis.uyum?.toplam?.metin || 'YOK';
  const k = kapanis.uyum?.toplam?.metin || 'YOK';
  const au = acilis.uyum?.toplam?.uygun ?? null;
  const ku = kapanis.uyum?.toplam?.uygun ?? null;
  let yonet = '';
  if (au !== null && ku !== null) {
    if (ku > au) yonet = 'Uyum işlem boyunca güçlendi.';
    else if (ku < au) yonet = 'Uyum işlem boyunca zayıfladı.';
    else yonet = 'Uyum seviyesi değişmedi.';
  }
  const bbA = acilis.coin?.bollinger?.bolge || 'YOK';
  const bbK = kapanis.coin?.bollinger?.bolge || 'YOK';
  return `Açılış uyumu: ${a}\nKapanış uyumu: ${k}\n${yonet}\nBB: ${bbA} → ${bbK}`;
}

function kapanisAnalizMetni(pos, sonuc = {}, kapanisZamani = Date.now()) {
  const ac = pos?.blackboxAcilis || null;
  const ka = pos?.blackboxKapanis || null;
  const net = Number(sonuc?.netKarZarar || 0).toFixed(4);
  const komisyon = Number(sonuc?.komisyon || 0).toFixed(4);
  const mfe = pos?.journey?.mfeYuzde !== undefined ? `%${Number(pos.journey.mfeYuzde).toFixed(3)}` : 'YOK';
  const mae = pos?.journey?.maeYuzde !== undefined ? `%${Number(pos.journey.maeYuzde).toFixed(3)}` : 'YOK';
  return `

━━━━━━━━━━━━━━━━━━
📊 <b>BLACKBOX KAPANIŞ ANALİZİ</b>
━━━━━━━━━━━━━━━━━━
` +
    tradeZamanMetni(pos, kapanisZamani) +
    `

🎯 <b>Sonuç</b>: ${sonuc?.sonuc || 'YOK'} | Net: ${net} USDT | Komisyon: ${komisyon} USDT
` +
    `📈 Max Kâr: ${mfe} | 📉 Max Zarar: ${mae}
` +
    `
🤝 <b>Uyum Özeti</b>
${uyumDegisimMetni(ac, ka)}
` +
    `🧠 <b>Kapanış Yorumu</b>: ${trendYorumu(ka)}

` +
    comboOgrenmeMetni(pos);
}

function normalizeMum(m) {
  return {
    openTime: Number(m.openTime || m.openTimeMillis || 0),
    closeTime: Number(m.closeTime || m.closeTimeMillis || 0),
    open: toNum(m.open), high: toNum(m.high), low: toNum(m.low), close: toNum(m.close), volume: toNum(m.volume)
  };
}

async function mumlariCek(symbol, interval, limit = 80) {
  try {
    const raw = await h.client.futuresCandles({ symbol, interval, limit });
    return (raw || []).map(normalizeMum).filter(x => x.open && x.high && x.low && x.close);
  } catch (err) {
    console.log(`⚠️ [BLACKBOX] Mum çekilemedi: ${symbol} ${interval} | ${err.message}`);
    return [];
  }
}

function hesaplaSuperTrend(mumlar, period = ayarlar.superTrendPeriod || 10, multiplier = ayarlar.superTrendMultiplier || 3) {
  if (!mumlar || mumlar.length < period + 2) return { trend: 'YOK', value: 0, age: null };
  const tr = [];
  for (let i = 0; i < mumlar.length; i++) {
    if (i === 0) tr.push(mumlar[i].high - mumlar[i].low);
    else tr.push(Math.max(mumlar[i].high - mumlar[i].low, Math.abs(mumlar[i].high - mumlar[i - 1].close), Math.abs(mumlar[i].low - mumlar[i - 1].close)));
  }
  const atr = new Array(mumlar.length).fill(null);
  let toplam = 0;
  for (let i = 0; i < period; i++) toplam += tr[i];
  atr[period - 1] = toplam / period;
  for (let i = period; i < mumlar.length; i++) atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
  const finalUpper = new Array(mumlar.length).fill(null);
  const finalLower = new Array(mumlar.length).fill(null);
  const superTrend = new Array(mumlar.length).fill(null);
  const trends = new Array(mumlar.length).fill(null);
  let trend = 'UP';
  for (let i = period; i < mumlar.length; i++) {
    const hl2 = (mumlar[i].high + mumlar[i].low) / 2;
    const basicUpper = hl2 + multiplier * atr[i];
    const basicLower = hl2 - multiplier * atr[i];
    if (i === period) {
      finalUpper[i] = basicUpper; finalLower[i] = basicLower;
      trend = mumlar[i].close >= basicLower ? 'UP' : 'DOWN';
      superTrend[i] = trend === 'UP' ? finalLower[i] : finalUpper[i];
      trends[i] = trend; continue;
    }
    finalUpper[i] = (basicUpper < finalUpper[i - 1] || mumlar[i - 1].close > finalUpper[i - 1]) ? basicUpper : finalUpper[i - 1];
    finalLower[i] = (basicLower > finalLower[i - 1] || mumlar[i - 1].close < finalLower[i - 1]) ? basicLower : finalLower[i - 1];
    trend = superTrend[i - 1] === finalUpper[i - 1]
      ? (mumlar[i].close <= finalUpper[i] ? 'DOWN' : 'UP')
      : (mumlar[i].close >= finalLower[i] ? 'UP' : 'DOWN');
    superTrend[i] = trend === 'UP' ? finalLower[i] : finalUpper[i];
    trends[i] = trend;
  }
  const son = mumlar.length - 1;
  let age = 0;
  for (let i = son - 1; i >= 0; i--) {
    if (!trends[i] || trends[i] !== trend) break;
    age++;
  }
  return { trend: trend || 'YOK', value: Number(superTrend[son] || 0), age };
}

function hesaplaBollinger(mumlar) {
  const period = ayarlar.bollingerperiod || 20;
  if (!mumlar || mumlar.length < period) return null;
  const closes = mumlar.slice(-period).map(x => x.close);
  const mid = closes.reduce((a,b)=>a+b,0) / period;
  const variance = closes.reduce((a,b)=>a + Math.pow(b - mid, 2), 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + (ayarlar.bollingercarpani || 2) * sd;
  const lower = mid - (ayarlar.bollingercarpani || 2) * sd;
  const close = mumlar[mumlar.length - 1].close;
  const width = upper - lower;
  const pos = width > 0 ? (close - lower) / width : null;
  let bolge = 'YOK';
  if (pos !== null) {
    if (pos < 0.20) bolge = 'ALT';
    else if (pos < 0.45) bolge = 'ORTA_ALT';
    else if (pos <= 0.55) bolge = 'ORTA';
    else if (pos <= 0.80) bolge = 'ORTA_UST';
    else bolge = 'UST';
  }
  return {
    lower: Number(lower.toFixed(8)), mid: Number(mid.toFixed(8)), upper: Number(upper.toFixed(8)), close,
    position: pos === null ? null : Number(pos.toFixed(4)),
    bolge,
    ortaYakinlik: pos === null ? null : Number(Math.abs(pos - 0.5).toFixed(4)),
    widthYuzde: mid ? Number(((width / mid) * 100).toFixed(4)) : null
  };
}

function uyumSay(matrix, yon) {
  const hedef = yonTrend(yon);
  let uygun = 0, toplam = 0;
  for (const tf of TFS) {
    const t = matrix?.[tf]?.trend;
    if (t === 'UP' || t === 'DOWN') { toplam++; if (t === hedef) uygun++; }
  }
  return { uygun, toplam, metin: `${uygun}/${toplam}` };
}

async function varlikSnapshot(symbol) {
  const matrix = {};
  let bb = null;
  for (const tf of TFS) {
    const mumlar = await mumlariCek(symbol, tf, Math.max(80, (ayarlar.superTrendPeriod || 10) * 5));
    const st = hesaplaSuperTrend(mumlar);
    matrix[tf] = st;
    if (tf === (ayarlar.blackboxBollingerTf || ayarlar.pusuPeriyodu || '15m')) bb = hesaplaBollinger(mumlar);
  }
  return { symbol, superTrend: matrix, bollinger: bb };
}

async function snapshotAl(symbol, yon, kayitTipi = 'ACILIS') {
  if (ayarlar.blackboxAktif === false) return null;
  const zaman = new Date().toISOString();
  const [btc, coin] = await Promise.all([varlikSnapshot('BTCUSDT'), varlikSnapshot(symbol)]);
  const btcUyum = uyumSay(btc.superTrend, yon);
  const coinUyum = uyumSay(coin.superTrend, yon);
  const toplamUyum = { uygun: btcUyum.uygun + coinUyum.uygun, toplam: btcUyum.toplam + coinUyum.toplam };
  toplamUyum.metin = `${toplamUyum.uygun}/${toplamUyum.toplam}`;
  const snap = { kayitTipi, zaman, symbol, yon, deney: deneyMeta(), btc, coin, uyum: { btc: btcUyum, coin: coinUyum, toplam: toplamUyum } };
  snap.strategySignature = strategySignatureOlustur(symbol, yon, btc, coin);
  return snap;
}

function stSatiri(prefix, snap) {
  const st = snap?.superTrend || {};
  return `${prefix}: 5m${emojiTrend(st['5m']?.trend)} ${st['5m']?.trend || 'YOK'} | 15m${emojiTrend(st['15m']?.trend)} ${st['15m']?.trend || 'YOK'} | 1h${emojiTrend(st['1h']?.trend)} ${st['1h']?.trend || 'YOK'} | 4h${emojiTrend(st['4h']?.trend)} ${st['4h']?.trend || 'YOK'}`;
}

function stKisa(snap) {
  const st = snap?.superTrend || {};
  return `5m ${emojiTrend(st['5m']?.trend)} ${st['5m']?.trend || 'YOK'}\n` +
    `15m ${emojiTrend(st['15m']?.trend)} ${st['15m']?.trend || 'YOK'}\n` +
    `1h  ${emojiTrend(st['1h']?.trend)} ${st['1h']?.trend || 'YOK'}\n` +
    `4h  ${emojiTrend(st['4h']?.trend)} ${st['4h']?.trend || 'YOK'}`;
}

function trendYorumu(snap) {
  if (!snap) return 'Snapshot alınamadı.';
  const yon = String(snap.yon || '').toUpperCase();
  const hedef = yonTrend(yon);
  const btc = snap.uyum?.btc?.uygun ?? 0;
  const coin = snap.uyum?.coin?.uygun ?? 0;
  const toplam = snap.uyum?.toplam?.uygun ?? 0;
  const bb = snap.coin?.bollinger?.bolge || 'YOK';
  const anaBtc = [snap.btc?.superTrend?.['1h']?.trend, snap.btc?.superTrend?.['4h']?.trend].filter(Boolean);
  const anaDestek = anaBtc.length && anaBtc.every(x => x === hedef);
  const anaKarsi = anaBtc.length && anaBtc.every(x => x !== hedef && (x === 'UP' || x === 'DOWN'));
  let yorum = [];
  if (toplam >= 7) yorum.push('Trend uyumu çok güçlü.');
  else if (toplam >= 5) yorum.push('Trend uyumu orta-güçlü.');
  else yorum.push('Trend uyumu zayıf/riskli.');
  if (anaDestek) yorum.push('BTC 1h/4h işlem yönünü destekliyor.');
  if (anaKarsi) yorum.push('BTC 1h/4h işlem yönüne karşı.');
  if (bb === 'ORTA') yorum.push('Coin Bollinger orta banda çok yakın; BE riski izlenmeli.');
  else if (bb === 'ORTA_ALT' || bb === 'ORTA_UST') yorum.push('Coin Bollinger orta bölgeye yakın.');
  return yorum.join(' ');
}

function telegramSnapshotMetni(snap, baslik = 'BLACKBOX') {
  if (!snap) return `\n\n🧠 <b>${baslik}</b>\nSnapshot alınamadı.`;
  const bb = snap.coin?.bollinger;
  return `\n\n━━━━━━━━━━━━━━━━━━\n🧠 <b>${baslik}</b>\n━━━━━━━━━━━━━━━━━━\n` +
    `🕒 Snapshot: ${tarihSaat(snap.zaman)}\n` +
    `📈 <b>BTC SuperTrend</b>\n${stKisa(snap.btc)}\n\n` +
    `🪙 <b>${snap.symbol} SuperTrend</b>\n${stKisa(snap.coin)}\n\n` +
    `🤝 <b>Uyum</b>: BTC ${snap.uyum?.btc?.metin || 'YOK'} | Coin ${snap.uyum?.coin?.metin || 'YOK'} | Toplam ${snap.uyum?.toplam?.metin || 'YOK'}\n` +
    (bb ? `📊 <b>BB(${ayarlar.blackboxBollingerTf || ayarlar.pusuPeriyodu})</b>: ${bb.bolge} | Poz: ${bb.position} | Orta uzaklık: ${bb.ortaYakinlik} | Genişlik: %${bb.widthYuzde}\n` : `📊 <b>BB</b>: YOK\n`) +
    `🧠 <b>Agros Yorumu</b>: ${trendYorumu(snap)}` +
    strategySignatureMetni(snap) +
    matrixGecmisPerformansMetni(snap, 'BU İMZANIN GEÇMİŞİ');
}

function gecisMetni(acilis, kapanis) {
  if (!acilis || !kapanis) return '';
  function line(label, a, k) {
    const out = TFS.map(tf => `${tf}${emojiTrend(a?.superTrend?.[tf]?.trend)}→${emojiTrend(k?.superTrend?.[tf]?.trend)}`).join(' ');
    return `${label}: ${out}`;
  }
  return `\n\n🔄 <b>Trend Değişimi</b>\n` + line('BTC', acilis.btc, kapanis.btc) + `\n` + line(acilis.symbol, acilis.coin, kapanis.coin);
}

function duz(snap, side, tf) { return snap?.[side]?.superTrend?.[tf]?.trend || ''; }
function bbField(snap, field) { return snap?.coin?.bollinger?.[field] ?? ''; }


function tfTrend(snap, side, tf) {
  const t = snap?.[side]?.superTrend?.[tf]?.trend;
  return (t === 'UP' || t === 'DOWN') ? t : 'YOK';
}

function trendHarf(t) {
  if (t === 'UP') return 'U';
  if (t === 'DOWN') return 'D';
  return 'Y';
}

function trendEmojiKisa(t) {
  if (t === 'UP') return '🟢';
  if (t === 'DOWN') return '🔴';
  return '⚪';
}

function patternKey(snap, side) {
  return TFS.map(tf => `${tf}:${trendHarf(tfTrend(snap, side, tf))}`).join(',');
}

function patternEmoji(snap, side) {
  return TFS.map(tf => trendEmojiKisa(tfTrend(snap, side, tf))).join('');
}

function tamKombinasyonKey(ac, yon) {
  if (!ac) return 'SNAPSHOT-YOK';
  return [
    `YON=${String(yon || ac.yon || 'YOK').toUpperCase()}`,
    `BTC=${patternKey(ac, 'btc')}`,
    `COIN=${patternKey(ac, 'coin')}`,
    `BB=${ac?.coin?.bollinger?.bolge || 'YOK'}`
  ].join('|');
}

function tamKombinasyonEtiket(ac, yon) {
  if (!ac) return 'Snapshot yok';
  return `${String(yon || ac.yon || 'YOK').toUpperCase()} | BTC ${patternEmoji(ac, 'btc')} | Coin ${patternEmoji(ac, 'coin')} | BB ${ac?.coin?.bollinger?.bolge || 'YOK'}`;
}

function detayliKombinasyonEtiket(ac, yon) {
  if (!ac) return 'Snapshot yok';
  return `${String(yon || ac.yon || 'YOK').toUpperCase()} | BTC 5m${trendEmojiKisa(tfTrend(ac,'btc','5m'))} 15m${trendEmojiKisa(tfTrend(ac,'btc','15m'))} 1h${trendEmojiKisa(tfTrend(ac,'btc','1h'))} 4h${trendEmojiKisa(tfTrend(ac,'btc','4h'))} | Coin 5m${trendEmojiKisa(tfTrend(ac,'coin','5m'))} 15m${trendEmojiKisa(tfTrend(ac,'coin','15m'))} 1h${trendEmojiKisa(tfTrend(ac,'coin','1h'))} 4h${trendEmojiKisa(tfTrend(ac,'coin','4h'))} | BB ${ac?.coin?.bollinger?.bolge || 'YOK'}`;
}

function tfStatsKey(side, tf, trend, yon) {
  return `${side.toUpperCase()}_${tf}_${trend || 'YOK'}_${String(yon || 'YOK').toUpperCase()}`;
}

function tfStatsEtiket(side, tf, trend, yon) {
  const ad = side === 'btc' ? 'BTC' : 'Coin';
  return `${ad} ${tf} ${trendEmojiKisa(trend)} ${trend || 'YOK'} → ${String(yon || 'YOK').toUpperCase()}`;
}

function kayitYaz(pos, kayitTipi, sonuc = {}) {
  if (ayarlar.blackboxAktif === false) return;
  try {
    ensureData();
    const ac = pos.blackboxAcilis || null;
    const ka = pos.blackboxKapanis || null;
    const rec = { kayitTipi, zaman: new Date().toISOString(), tradeId: pos.tradeId || pos.sanalOrderId || '', symbol: pos.sym, yon: pos.yon, sonuc: sonuc.sonuc || '', kapanisSebebi: sonuc.kapanisSebebi || '', girisFiyati: pos.girisFiyati, kapanisFiyati: sonuc.kapanisFiyati ?? '', netKarZarar: sonuc.netKarZarar ?? '', komisyon: sonuc.komisyon ?? '', mfeYuzde: pos.journey?.mfeYuzde ?? '', maeYuzde: pos.journey?.maeYuzde ?? '', acilis: ac, kapanis: ka };
    if (kayitTipi === 'KAPANIS') ozetGuncelle(pos, sonuc);
    fs.appendFileSync(JSONL, JSON.stringify(rec) + '\n');
    const row = {
      tradeId: rec.tradeId, kayitTipi, zaman: rec.zaman, symbol: rec.symbol, yon: rec.yon, sonuc: rec.sonuc, kapanisSebebi: rec.kapanisSebebi,
      girisFiyati: rec.girisFiyati, kapanisFiyati: rec.kapanisFiyati, netKarZarar: rec.netKarZarar, komisyon: rec.komisyon, mfeYuzde: rec.mfeYuzde, maeYuzde: rec.maeYuzde,
      open_btc_5m: duz(ac,'btc','5m'), open_btc_15m: duz(ac,'btc','15m'), open_btc_1h: duz(ac,'btc','1h'), open_btc_4h: duz(ac,'btc','4h'),
      open_coin_5m: duz(ac,'coin','5m'), open_coin_15m: duz(ac,'coin','15m'), open_coin_1h: duz(ac,'coin','1h'), open_coin_4h: duz(ac,'coin','4h'),
      close_btc_5m: duz(ka,'btc','5m'), close_btc_15m: duz(ka,'btc','15m'), close_btc_1h: duz(ka,'btc','1h'), close_btc_4h: duz(ka,'btc','4h'),
      close_coin_5m: duz(ka,'coin','5m'), close_coin_15m: duz(ka,'coin','15m'), close_coin_1h: duz(ka,'coin','1h'), close_coin_4h: duz(ka,'coin','4h'),
      open_btcUyum: ac?.uyum?.btc?.metin || '', open_coinUyum: ac?.uyum?.coin?.metin || '', open_toplamUyum: ac?.uyum?.toplam?.metin || '', open_coinBbBolge: bbField(ac,'bolge'), open_coinBbPozisyon: bbField(ac,'position'), open_coinBbOrtaYakinlik: bbField(ac,'ortaYakinlik'),
      open_btcPattern: ac ? patternKey(ac, 'btc') : '', open_coinPattern: ac ? patternKey(ac, 'coin') : '', open_fullPattern: ac ? `${patternKey(ac,'btc')}|${patternKey(ac,'coin')}` : '', open_exactComboKey: ac ? signatureKey(ac) : '', open_signatureKey: ac?.strategySignature?.key || '', open_signatureLabel: ac?.strategySignature?.label || '', open_btcAlignedTf: ac?.strategySignature?.btcUyumluTf?.join('+') || '', open_coinAlignedTf: ac?.strategySignature?.coinUyumluTf?.join('+') || '', open_btcBits: ac?.strategySignature?.btcBits || '', open_coinBits: ac?.strategySignature?.coinBits || '',
      close_btcUyum: ka?.uyum?.btc?.metin || '', close_coinUyum: ka?.uyum?.coin?.metin || '', close_toplamUyum: ka?.uyum?.toplam?.metin || '', close_coinBbBolge: bbField(ka,'bolge'), close_coinBbPozisyon: bbField(ka,'position'), close_coinBbOrtaYakinlik: bbField(ka,'ortaYakinlik'),
      close_btcPattern: ka ? patternKey(ka, 'btc') : '', close_coinPattern: ka ? patternKey(ka, 'coin') : '', close_fullPattern: ka ? `${patternKey(ka,'btc')}|${patternKey(ka,'coin')}` : '', close_signatureKey: ka?.strategySignature?.key || '', close_signatureLabel: ka?.strategySignature?.label || '', close_btcAlignedTf: ka?.strategySignature?.btcUyumluTf?.join('+') || '', close_coinAlignedTf: ka?.strategySignature?.coinUyumluTf?.join('+') || '', close_btcBits: ka?.strategySignature?.btcBits || '', close_coinBits: ka?.strategySignature?.coinBits || '',
      experimentId: deneyMeta().id, experimentLabel: deneyMeta().etiket, trendTf: ayarlar.trendPeriyodu, pusuTf: ayarlar.pusuPeriyodu, sniperTf: ayarlar.sniperPeriyodu, stPeriod: ayarlar.superTrendPeriod, stMultiplier: ayarlar.superTrendMultiplier, bbPeriod: ayarlar.bollingerperiod, bbMultiplier: ayarlar.bollingercarpani, stopMode: ayarlar.stopTakipModu, leverage: ayarlar.mevcutKaldirac
    };
    fs.appendFileSync(CSV, CSV_BASLIK.map(k => csv(row[k])).join(',') + '\n');
  } catch (err) { console.log(`⚠️ [BLACKBOX] Kayıt yazılamadı: ${err.message}`); }
}


function bosBucket() { return { toplam: 0, tp: 0, sl: 0, be: 0, net: 0, karToplam: 0, zararToplam: 0 }; }
function ozetHazirla() {
  if (!h.state.blackboxOzet) {
    h.state.blackboxOzet = {
      sonGuncelleme: new Date().toISOString(),
      long: bosBucket(), short: bosBucket(),
      btcTamUyum: bosBucket(), coinTamUyum: bosBucket(), toplamTamUyum: bosBucket(), toplam7Uyum: bosBucket(), toplam6Uyum: bosBucket(), toplamZayifUyum: bosBucket(),
      bbOrta: bosBucket(), bbOrtaBolge: bosBucket(), bbAltUst: bosBucket(),
      son5: [],
      comboStats: {},
      exactComboStats: {},
      signatureMatrixStats: {},
      btcTfStats: {},
      coinTfStats: {},
      bbYonStats: {},
      pusuKaliteStats: {},
      pusuSenaryoStats: {},
      trendAyniYon: bosBucket(),
      trendTersYon: bosBucket(),
      experimentStats: {},
      deneyBaslangiclari: {}
    };
  }
  for (const k of ['long','short','btcTamUyum','coinTamUyum','toplamTamUyum','toplam7Uyum','toplam6Uyum','toplamZayifUyum','bbOrta','bbOrtaBolge','bbAltUst','trendAyniYon','trendTersYon']) {
    if (!h.state.blackboxOzet[k]) h.state.blackboxOzet[k] = bosBucket();
  }
  for (const k of ['comboStats','exactComboStats','signatureMatrixStats','btcTfStats','coinTfStats','bbYonStats','pusuKaliteStats','pusuSenaryoStats','experimentStats','deneyBaslangiclari']) {
    if (!h.state.blackboxOzet[k] || typeof h.state.blackboxOzet[k] !== 'object') h.state.blackboxOzet[k] = {};
  }
  if (!Array.isArray(h.state.blackboxOzet.son5)) h.state.blackboxOzet.son5 = [];
  return h.state.blackboxOzet;
}
function bucketEkle(b, sonuc, net) {
  b.toplam = Number(b.toplam || 0) + 1;
  b.tp = Number(b.tp || 0);
  b.sl = Number(b.sl || 0);
  b.be = Number(b.be || 0);
  b.net = Number(b.net || 0);
  b.karToplam = Number(b.karToplam || 0);
  b.zararToplam = Number(b.zararToplam || 0);
  if (sonuc === 'TP') b.tp += 1; else if (sonuc === 'BE') b.be += 1; else if (sonuc === 'SL') b.sl += 1;
  const n = Number(net || 0);
  b.net += n;
  if (n > 0) b.karToplam += n;
  if (n < 0) b.zararToplam += Math.abs(n);
}

function statsBucketEkle(stats, key, etiket, sonuc, net) {
  if (!stats[key]) stats[key] = { ...bosBucket(), key, etiket };
  // v3.0.2 FIX: Eski state içinde ilk coin adıyla oluşmuş etiketler kalabiliyordu.
  // Her güncellemede güncel nötr etiketi yaz, istatistik anahtarını ve sayaçları değiştirme.
  if (etiket) stats[key].etiket = etiket;
  bucketEkle(stats[key], sonuc, net);
  return stats[key];
}

function trendAyniMi(ac, yon) {
  if (!ac) return null;
  const toplam = ac?.uyum?.toplam;
  if (!toplam || !toplam.toplam) return null;
  return Number(toplam.uygun || 0) >= Math.ceil(Number(toplam.toplam || 8) / 2);
}

function deneyBucketKey() {
  return deneyMeta().id;
}

function deneyBucketEtiket(meta = deneyMeta()) {
  return `${meta.etiket} | ST ${meta.superTrendTf || meta.trendTf} | Pusu ${meta.pusuTf} | Sniper ${meta.sniperTf} | ST(${meta.stPeriod}/${meta.stMultiplier}) | BB(${meta.bbPeriod}/${meta.bbMultiplier}) | Stop ${meta.stopMode} | ${meta.leverage}x`;
}

function deneyStatsGuncelle(o, sonuc, net) {
  const meta = deneyMeta();
  const key = deneyBucketKey();
  if (!o.experimentStats[key]) {
    o.experimentStats[key] = { ...bosBucket(), key, etiket: deneyBucketEtiket(meta), meta, ilkKayit: new Date().toISOString(), sonKayit: new Date().toISOString() };
  }
  o.experimentStats[key].sonKayit = new Date().toISOString();
  bucketEkle(o.experimentStats[key], sonuc, net);
  return o.experimentStats[key];
}

function deneyBaslikMetni() {
  const meta = deneyMeta();
  return `\n\n🧪 <b>AKTİF DENEY</b>\n` +
    `ID: ${meta.id}\n` +
    `Ad: ${meta.etiket}\n` +
    `TF: ST ${meta.superTrendTf || meta.trendTf} | Pusu ${meta.pusuTf} | Sniper ${meta.sniperTf}\n` +
    `ST: ${meta.stPeriod}/${meta.stMultiplier} | BB: ${meta.bbPeriod}/${meta.bbMultiplier} | Stop: ${meta.stopMode} | Kaldıraç: ${meta.leverage}x`;
}

function ozetGuncelle(pos, sonuc) {
  const o = ozetHazirla();
  const s = String(sonuc.sonuc || '').toUpperCase();
  const net = Number(sonuc.netKarZarar || 0);
  deneyStatsGuncelle(o, s, net);
  bucketEkle(String(pos.yon).toUpperCase() === 'SHORT' ? o.short : o.long, s, net);
  const ac = pos.blackboxAcilis;
  if (ac?.uyum?.btc && ac.uyum.btc.toplam > 0 && ac.uyum.btc.uygun === ac.uyum.btc.toplam) bucketEkle(o.btcTamUyum, s, net);
  if (ac?.uyum?.coin && ac.uyum.coin.toplam > 0 && ac.uyum.coin.uygun === ac.uyum.coin.toplam) bucketEkle(o.coinTamUyum, s, net);
  if (ac?.uyum?.toplam && ac.uyum.toplam.toplam > 0 && ac.uyum.toplam.uygun === ac.uyum.toplam.toplam) bucketEkle(o.toplamTamUyum, s, net);
  if (ac?.uyum?.toplam && ac.uyum.toplam.uygun === 7) bucketEkle(o.toplam7Uyum, s, net);
  if (ac?.uyum?.toplam && ac.uyum.toplam.uygun === 6) bucketEkle(o.toplam6Uyum, s, net);
  if (ac?.uyum?.toplam && ac.uyum.toplam.toplam > 0 && ac.uyum.toplam.uygun <= 3) bucketEkle(o.toplamZayifUyum, s, net);
  const bb = ac?.coin?.bollinger?.bolge;
  if (bb === 'ORTA') bucketEkle(o.bbOrta, s, net);
  if (bb === 'ORTA_ALT' || bb === 'ORTA_UST') bucketEkle(o.bbOrtaBolge, s, net);
  if (bb === 'ALT' || bb === 'UST') bucketEkle(o.bbAltUst, s, net);

  const ayni = trendAyniMi(ac, pos.yon);
  if (ayni === true) bucketEkle(o.trendAyniYon, s, net);
  else if (ayni === false) bucketEkle(o.trendTersYon, s, net);

  const exactStats = o.exactComboStats;
  statsBucketEkle(exactStats, signatureKey(ac), signatureEtiket(ac), s, net);

  const matrixStats = o.signatureMatrixStats;
  statsBucketEkle(matrixStats, signatureMatrixKey(ac), signatureMatrixEtiket(ac), s, net);

  const bbKey = `YON=${String(pos.yon || 'YOK').toUpperCase()}|BB=${bb || 'YOK'}`;
  statsBucketEkle(o.bbYonStats, bbKey, `${String(pos.yon || 'YOK').toUpperCase()} | BB ${bb || 'YOK'}`, s, net);

  const kalite = pos?.girisAnalizi?.pusuKalite || {};
  const kaliteSinif = String(kalite.sinif || 'YOK').toUpperCase();
  const kaliteKey = `YON=${String(pos.yon || 'YOK').toUpperCase()}|KALITE=${kaliteSinif}`;
  statsBucketEkle(o.pusuKaliteStats, kaliteKey, `${String(pos.yon || 'YOK').toUpperCase()} | Pusu kalite ${kaliteSinif}`, s, net);
  const senaryo = String(kalite.senaryo || pos?.girisAnalizi?.senaryo || 'YOK').toUpperCase();
  const senaryoKey = `YON=${String(pos.yon || 'YOK').toUpperCase()}|SENARYO=${senaryo}`;
  statsBucketEkle(o.pusuSenaryoStats, senaryoKey, `${String(pos.yon || 'YOK').toUpperCase()} | ${senaryo}`, s, net);

  for (const tf of TFS) {
    const btcTrend = tfTrend(ac, 'btc', tf);
    const coinTrend = tfTrend(ac, 'coin', tf);
    statsBucketEkle(o.btcTfStats, tfStatsKey('btc', tf, btcTrend, pos.yon), tfStatsEtiket('btc', tf, btcTrend, pos.yon), s, net);
    statsBucketEkle(o.coinTfStats, tfStatsKey('coin', tf, coinTrend, pos.yon), tfStatsEtiket('coin', tf, coinTrend, pos.yon), s, net);
  }

  const stats = comboStatsHazirla(o);
  const key = comboKey(ac, pos.yon);
  if (!stats[key]) stats[key] = { ...bosBucket(), etiket: comboEtiket(ac, pos.yon), key };
  bucketEkle(stats[key], s, net);

  o.son5.unshift({ symbol: pos.sym, yon: pos.yon, sonuc: s, net, uyum: ac?.uyum?.toplam?.metin || 'YOK', bb: bb || 'YOK', imza: signatureShort(ac) });
  o.son5 = o.son5.slice(0, 5);
  o.sonGuncelleme = new Date().toISOString();
}
function oran(b) { const n = (b.tp || 0) + (b.sl || 0); return n > 0 ? ((b.tp / n) * 100).toFixed(1) : '0.0'; }
function bucketMetni(ad, b) { return `${ad}: ${b.toplam || 0} | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)} | PF ${profitFactor(b)}`; }

function sonucSayisi(b) { return Number((b?.tp || 0) + (b?.sl || 0)); }
function guvenMetni(b) {
  const n = Number(b?.toplam || 0);
  const min = Number(ayarlar.blackboxKararMinOrnek || 10);
  if (n >= min * 5) return 'ÇOK YÜKSEK';
  if (n >= min * 3) return 'YÜKSEK';
  if (n >= min) return 'ORTA';
  return 'DÜŞÜK';
}
function imzaKararSeviyesi(b) {
  const n = Number(b?.toplam || 0);
  const basari = Number(oran(b));
  const net = Number(b?.net || 0);
  const min = Number(ayarlar.blackboxTersYonMinOrnek || ayarlar.blackboxKararMinOrnek || 10);
  const tersEsik = Number(ayarlar.blackboxTersYonBasariEsigi || ayarlar.blackboxRiskBasariEsigi || 35);
  const gucluEsik = Number(ayarlar.blackboxKararBasariEsigi || 65);
  if (n >= min && basari <= 0 && Number(b?.sl || 0) > 0) return '🧨 %100 başarısız — ters yön test adayı';
  if (n >= min && basari <= tersEsik && net < 0) return '⚠️ çok başarısız — ters yön test adayı';
  if (n >= min && basari >= gucluEsik && net > 0) return '✅ güçlü — aynı yönde izlenebilir';
  if (n < min) return `⏳ veri birikiyor — karar için min ${min}`;
  return '👀 izleme devam';
}
function kararSatiri(b, i) {
  const toplam = Number(b?.toplam || 0);
  const tp = Number(b?.tp || 0);
  const sl = Number(b?.sl || 0);
  const be = Number(b?.be || 0);
  const sonucN = tp + sl;
  const basari = Number(oran(b)).toFixed(1);
  const basarisiz = sonucN > 0 ? ((sl / sonucN) * 100).toFixed(1) : '0.0';
  const beOran = toplam > 0 ? ((be / toplam) * 100).toFixed(1) : '0.0';
  const ortNet = toplam > 0 ? (Number(b?.net || 0) / toplam).toFixed(3) : '0.000';
  return `${i + 1}) ${b.etiket}
` +
    `   🎯 İmza başarı oranı: %${basari} | Başarısızlık: %${basarisiz} | BE: %${beOran}
` +
    `   📌 Örnek: ${toplam} işlem | TP:${tp} SL:${sl} BE:${be} | Net ${Number(b.net || 0).toFixed(2)} | Ort.Net ${ortNet} | PF ${profitFactor(b)}
` +
    `   🧠 Karar: ${imzaKararSeviyesi(b)} | Güven: ${guvenMetni(b)}`;
}
function bucketYon(b) {
  const raw = `${b?.key || ''}|${b?.etiket || ''}`.toUpperCase();
  if (raw.includes('YON=SHORT') || raw.includes('SHORT')) return 'SHORT';
  if (raw.includes('YON=LONG') || raw.includes('LONG')) return 'LONG';
  return 'YOK';
}
function tersYon(yon) {
  const y = String(yon || '').toUpperCase();
  if (y === 'LONG') return 'SHORT';
  if (y === 'SHORT') return 'LONG';
  return 'YOK';
}
function tersYonOneriSatiri(b, i) {
  const y = bucketYon(b);
  const ters = tersYon(y);
  const basari = Number(oran(b));
  const sonucN = Number(b?.tp || 0) + Number(b?.sl || 0);
  const basarisiz = sonucN > 0 ? ((Number(b?.sl || 0) / sonucN) * 100).toFixed(1) : '0.0';
  const guven = guvenMetni(b);
  const islem = Number(b?.toplam || 0);
  const net = Number(b?.net || 0).toFixed(2);
  const seviye = basari <= 0 ? '🧨 %100 başarısız' : '⚠️ çok zayıf';
  return `${i + 1}) ${seviye}
` +
    `   ${b.etiket}
` +
    `   🎯 Bu imzanın başarı oranı: %${basari.toFixed(1)} | Başarısızlık oranı: %${basarisiz}
` +
    `   📌 Örnek: ${islem} işlem | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Net ${net} | PF ${profitFactor(b)} | Güven: ${guven}
` +
    `   🔁 AGROS ters yön test önerisi: Aynı imza tekrar gelirse ${y} yerine ${ters} yönü deney adayı olarak işaretle. Şimdilik emir motoruna müdahale yok.`;
}
function yuzdeYuzBasarisizMetni(limit = 5) {
  const o = ozetHazirla();
  const min = Number(ayarlar.blackboxTersYonMinOrnek || ayarlar.blackboxKararMinOrnek || 10);
  const arr = Object.values(o.exactComboStats || {})
    .filter(b => Number(b?.toplam || 0) >= min && Number(b?.tp || 0) === 0 && Number(b?.sl || 0) > 0)
    .sort((a, b) => Number(b.sl || 0) - Number(a.sl || 0) || Number(a.net || 0) - Number(b.net || 0))
    .slice(0, limit);
  if (!arr.length) return '';
  return `\n\n🧨 <b>%100 BAŞARISIZ İMZA ALARMI</b>\n` +
    `Bu bölüm otomatik ters işlem açmaz; hangi imzaların ters yönde test edilmesi gerektiğini gösterir.\n` +
    arr.map((b, i) => tersYonOneriSatiri(b, i)).join('\n');
}
function tersYonAdaylariMetni(limit = 5) {
  const o = ozetHazirla();
  const min = Number(ayarlar.blackboxTersYonMinOrnek || ayarlar.blackboxKararMinOrnek || 10);
  const esik = Number(ayarlar.blackboxTersYonBasariEsigi || ayarlar.blackboxRiskBasariEsigi || 35);
  const arr = Object.values(o.exactComboStats || {})
    .filter(b => Number(b?.toplam || 0) >= min && Number(oran(b)) <= esik && Number(b?.net || 0) < 0)
    .sort((a, b) => Number(oran(a)) - Number(oran(b)) || Number(a.net || 0) - Number(b.net || 0))
    .slice(0, limit);
  if (!arr.length) return `\n\n🔁 <b>TERS YÖN TEST ADAYLARI</b>\nHenüz ters yön önerisi için yeterli güvenilir başarısız imza yok. Eşik: min ${min} işlem ve başarı ≤ %${esik}.`;
  return `\n\n🔁 <b>TERS YÖN TEST ADAYLARI</b>\n` +
    `Eşik: min ${min} işlem + başarı ≤ %${esik} + net negatif. Bu liste şimdilik öneridir; emir motoru değiştirilmedi.\n` +
    arr.map((b, i) => tersYonOneriSatiri(b, i)).join('\n');
}

function matrixGorulenSayisi(stats) {
  const keys = Object.keys(stats || {}).filter(k => (stats[k]?.toplam || 0) > 0);
  const longSet = new Set();
  const shortSet = new Set();
  for (const k of keys) {
    if (k.includes('YON=LONG')) longSet.add(k.replace('YON=LONG|', ''));
    else if (k.includes('YON=SHORT')) shortSet.add(k.replace('YON=SHORT|', ''));
  }
  return { toplam: keys.length, long: longSet.size, short: shortSet.size };
}

function profitFactor(b) {
  const kar = Number(b?.karToplam || 0);
  const zarar = Number(b?.zararToplam || 0);
  if (kar <= 0 && zarar <= 0) return 'N/A';
  if (kar > 0 && zarar <= 0) return '∞';
  if (kar <= 0 && zarar > 0) return '0.00';
  return (kar / zarar).toFixed(2);
}

function matrixSatiri(b, i) {
  const toplam = Number(b?.toplam || 0);
  const tp = Number(b?.tp || 0);
  const sl = Number(b?.sl || 0);
  const be = Number(b?.be || 0);
  const sonucN = tp + sl;
  const basari = Number(oran(b)).toFixed(1);
  const basarisiz = sonucN > 0 ? ((sl / sonucN) * 100).toFixed(1) : '0.0';
  const ortNet = toplam > 0 ? (Number(b?.net || 0) / toplam).toFixed(3) : '0.000';
  return `${i + 1}) ${b.etiket}
` +
    `   🎯 Bu 256 imzasının başarı oranı: %${basari} | Başarısızlık: %${basarisiz}
` +
    `   📌 Örnek: ${toplam} işlem | TP:${tp} SL:${sl} BE:${be} | Net ${Number(b.net || 0).toFixed(2)} | Ort.Net ${ortNet}
` +
    `   🧪 PF: ${profitFactor(b)} | Güven: ${guvenMetni(b)} | Karar: ${imzaKararSeviyesi(b)}`;
}

function signature256MatrixMetni() {
  const o = ozetHazirla();
  const stats = o.signatureMatrixStats || {};
  const min = Number(ayarlar.blackbox256MatrixMinOrnek || ayarlar.blackboxMinKombinasyonOrnek || 3);
  const limit = Number(ayarlar.blackbox256MatrixTopAday || ayarlar.blackboxKararTopAday || 5);
  const gorulen = matrixGorulenSayisi(stats);
  const arr = Object.values(stats).filter(b => Number(b?.toplam || 0) >= min);
  const best = [...arr]
    .sort((a, b) => Number(oran(b)) - Number(oran(a)) || Number(b.net || 0) - Number(a.net || 0) || Number(b.toplam || 0) - Number(a.toplam || 0))
    .slice(0, limit);
  const worst = [...arr]
    .sort((a, b) => Number(oran(a)) - Number(oran(b)) || Number(a.net || 0) - Number(b.net || 0) || Number(b.toplam || 0) - Number(a.toplam || 0))
    .slice(0, limit);
  let metin = `\n\n🧬 <b>256 BTC×COIN İMZA MATRİSİ</b>\n` +
    `Saf matris: BTC 5m/15m/1h/4h + Coin 5m/15m/1h/4h. BB ve pusu kalitesi bu bölümde karıştırılmaz.\n` +
    `Görülen imza: ${gorulen.toplam}/512 yönlü kayıt | LONG ${gorulen.long}/256 | SHORT ${gorulen.short}/256 | Liste eşiği: min ${min} işlem.\n`;
  if (best.length) {
    metin += `\n🏆 <b>En Başarılı 256 İmzaları</b>\n` + best.map((b, i) => matrixSatiri(b, i)).join('\n');
  } else {
    metin += `\n🏆 <b>En Başarılı 256 İmzaları</b>\nHenüz min ${min} işlemli 256 imzası yok.`;
  }
  if (worst.length) {
    metin += `\n\n☠️ <b>En Başarısız 256 İmzaları</b>\n` + worst.map((b, i) => matrixSatiri(b, i)).join('\n');
  } else {
    metin += `\n\n☠️ <b>En Başarısız 256 İmzaları</b>\nHenüz min ${min} işlemli başarısız imza yok.`;
  }
  const tersMin = Number(ayarlar.blackboxTersYonMinOrnek || ayarlar.blackboxKararMinOrnek || 10);
  const tersEsik = Number(ayarlar.blackboxTersYonBasariEsigi || ayarlar.blackboxRiskBasariEsigi || 35);
  const ters = Object.values(stats)
    .filter(b => Number(b?.toplam || 0) >= tersMin && Number(oran(b)) <= tersEsik && Number(b?.net || 0) < 0)
    .sort((a, b) => Number(oran(a)) - Number(oran(b)) || Number(a.net || 0) - Number(b.net || 0))
    .slice(0, limit);
  if (ters.length) {
    metin += `\n\n🔁 <b>256 MATRİS TERS YÖN TEST ADAYLARI</b>\n` +
      `Eşik: min ${tersMin} işlem + başarı ≤ %${tersEsik} + net negatif. Emir motoruna müdahale yok; sadece test adayı.\n` +
      ters.map((b, i) => tersYonOneriSatiri(b, i)).join('\n');
  }
  return metin;
}

function strategyLabRadarMetni() {
  const o = ozetHazirla();
  const toplam = toplamKapanisSayisi();
  const limit = Number(ayarlar.blackboxKararTopAday || 10);
  const min = Number(ayarlar.blackboxMinKombinasyonOrnek || 3);
  const exact = Object.values(o.exactComboStats || {}).filter(b => Number(b?.toplam || 0) >= min);
  const enBasarili = [...exact]
    .sort((a, b) => Number(oran(b)) - Number(oran(a)) || Number(b.net || 0) - Number(a.net || 0))
    .slice(0, limit);
  const enBasarisiz = [...exact]
    .sort((a, b) => Number(oran(a)) - Number(oran(b)) || Number(a.net || 0) - Number(b.net || 0))
    .slice(0, limit);
  let metin = `🧬 <b>AGROS STRATEGY LAB RADARI</b>\n` +
    `Kapanan işlem: ${toplam} | Dakika raporu: ${Number(ayarlar.blackboxIstatistikRaporAraligiDakika || 10)} dk | Kapanış raporu: her ${Number(ayarlar.blackboxIstatistikRaporAraligiKapanis || 10)} kapanış\n` +
    `Amaç: Her imzanın başarı oranını, örnek sayısını ve ters yön test adaylarını Telegram'dan izlemek.\n` +
    `Not: Başarı oranı TP/(TP+SL) ile hesaplanır; BE ayrı gösterilir.\n`;
  if (enBasarili.length) {
    metin += `\n🏆 <b>TOP 10 EN BAŞARILI TAM İMZA</b>\n` + enBasarili.map((b, i) => kararSatiri(b, i)).join('\n');
  } else {
    metin += `\n🏆 <b>TOP 10 EN BAŞARILI TAM İMZA</b>\nHenüz en az ${min} örnekli imza yok.`;
  }
  if (enBasarisiz.length) {
    metin += `\n\n☠️ <b>WORST 10 EN BAŞARISIZ TAM İMZA</b>\n` + enBasarisiz.map((b, i) => kararSatiri(b, i)).join('\n');
  }
  metin += yuzdeYuzBasarisizMetni(limit);
  metin += tersYonAdaylariMetni(limit);
  return metin;
}

function kararlikPuani(b) {
  const basari = Number(oran(b));
  const net = Number(b?.net || 0);
  const n = Number(b?.toplam || 0);
  const beCeza = n > 0 ? ((b.be || 0) / n) * 10 : 0;
  return basari + Math.min(20, Math.max(-20, net)) + Math.min(15, n / 2) - beCeza;
}

function comboKey(ac, yon) {
  if (!ac) return 'SNAPSHOT-YOK';
  const bb = ac?.coin?.bollinger?.bolge || 'YOK';
  return [
    `YON=${String(yon || ac.yon || 'YOK').toUpperCase()}`,
    `BTC=${ac?.uyum?.btc?.metin || 'YOK'}`,
    `COIN=${ac?.uyum?.coin?.metin || 'YOK'}`,
    `TOPLAM=${ac?.uyum?.toplam?.metin || 'YOK'}`,
    `BB=${bb}`
  ].join('|');
}

function comboEtiket(ac, yon) {
  if (!ac) return 'Snapshot yok';
  return `${String(yon || ac.yon || 'YOK').toUpperCase()} | BTC ${ac?.uyum?.btc?.metin || 'YOK'} | Coin ${ac?.uyum?.coin?.metin || 'YOK'} | Toplam ${ac?.uyum?.toplam?.metin || 'YOK'} | BB ${ac?.coin?.bollinger?.bolge || 'YOK'}`;
}

function comboStatsHazirla(o) {
  if (!o.comboStats || typeof o.comboStats !== 'object') o.comboStats = {};
  return o.comboStats;
}

function comboOgrenmeMetni(pos) {
  const ac = pos?.blackboxAcilis || null;
  const o = ozetHazirla();
  const exactStats = o.exactComboStats || {};
  const exactKey = signatureKey(ac);
  const exact = exactStats[exactKey];
  const matrixText = matrixGecmisPerformansMetni(ac, 'GÜNCELLENMİŞ 256 İMZA PERFORMANSI');
  if (!exact || !exact.toplam) {
    return matrixText + `\n\n📚 <b>Aynı Tam Kombinasyon</b>\nBu tam BTC/Coin/BB kombinasyonu için ilk kapanış bekleniyor.`;
  }
  const sonucSayisi = (exact.tp || 0) + (exact.sl || 0);
  const beOran = exact.toplam > 0 ? (((exact.be || 0) / exact.toplam) * 100).toFixed(1) : '0.0';
  return matrixText + `\n\n📚 <b>Aynı Tam Kombinasyon + BB</b>\n` +
    `${signatureEtiket(ac)}\n` +
    `🎯 Bu tam imzanın başarı oranı: %${oran(exact)} | BE Oranı: %${beOran}\n` +
    `📌 Örnek: ${exact.toplam} | TP:${exact.tp || 0} SL:${exact.sl || 0} BE:${exact.be || 0}\n` +
    `💰 Net: ${Number(exact.net || 0).toFixed(2)} USDT` +
    (sonucSayisi < 10 ? `\nNot: Örnek sayısı düşük; veri toplandıkça güven artacak.` : '');
}

function enIyiKombinasyonMetni(limit = 10) {
  const o = ozetHazirla();
  const stats = Object.values(o.exactComboStats || {});
  const minOrnek = Number(ayarlar.blackboxMinKombinasyonOrnek || 3);
  const sirali = stats
    .filter(x => (x.toplam || 0) >= minOrnek)
    .sort((a, b) => Number(b.net || 0) - Number(a.net || 0))
    .slice(0, limit);
  if (!sirali.length) return '';
  return `

🏆 <b>En Karlı Tam Kombinasyonlar</b>
` + sirali.map((b, i) =>
    `${i + 1}) ${b.etiket} | ${b.toplam} işlem | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)} | PF ${profitFactor(b)} | Güven ${guvenMetni(b)}`
  ).join('\n');
}

function enBasariliTfMetni(stats, baslik, limit = 4) {
  const minOrnek = Number(ayarlar.blackboxMinTfOrnek || 5);
  const arr = Object.values(stats || {})
    .filter(x => (x.toplam || 0) >= minOrnek)
    .sort((a, b) => Number(oran(b)) - Number(oran(a)) || Number(b.net || 0) - Number(a.net || 0))
    .slice(0, limit);
  if (!arr.length) return '';
  return `

${baslik}
` + arr.map((b, i) => `${i + 1}) ${b.etiket} | ${b.toplam} işlem | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)} | PF ${profitFactor(b)} | Güven ${guvenMetni(b)}`).join('\n');
}


function tfEtkiHaritasiMetni(stats, baslik, side, limitSatir = 4) {
  const min = Number(ayarlar.blackboxTfHaritaMinOrnek || 1);
  const satirlar = [];
  for (const tf of TFS) {
    const adaylar = [];
    for (const trend of ['UP', 'DOWN']) {
      for (const yon of ['LONG', 'SHORT']) {
        const key = tfStatsKey(side, tf, trend, yon);
        const b = stats?.[key];
        if (b && (b.toplam || 0) >= min) {
          adaylar.push(`${trendEmojiKisa(trend)} ${trend}→${yon}: ${b.toplam} | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)}`);
        }
      }
    }
    if (adaylar.length) satirlar.push(`<b>${side === 'btc' ? 'BTC' : 'Coin'} ${tf}</b>\n` + adaylar.join('\n'));
  }
  if (!satirlar.length) return '';
  return `\n\n${baslik}\n` + satirlar.slice(0, limitSatir).join('\n\n');
}

function deneyKarsilastirmaMetni(limit = 5) {
  const o = ozetHazirla();
  const arr = Object.values(o.experimentStats || {})
    .filter(x => (x.toplam || 0) > 0)
    .sort((a,b) => Number(b.net || 0) - Number(a.net || 0))
    .slice(0, limit);
  if (!arr.length) return deneyBaslikMetni();
  return deneyBaslikMetni() + `\n\n🧪 <b>Deney / Periyot Karşılaştırması</b>\n` +
    arr.map((b,i) => `${i+1}) ${b.etiket} | ${b.toplam} işlem | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)} | Güven: ${guvenMetni(b)}`).join('\n');
}

function agrosBulgusuMetni() {
  const o = ozetHazirla();
  const min = Number(ayarlar.blackboxKararMinOrnek || 10);
  const kaynaklar = [
    ...Object.values(o.exactComboStats || {}),
    ...Object.values(o.btcTfStats || {}),
    ...Object.values(o.coinTfStats || {}),
    ...Object.values(o.bbYonStats || {}),
    ...Object.values(o.pusuKaliteStats || {}),
    ...Object.values(o.pusuSenaryoStats || {})
  ].filter(b => (b.toplam || 0) >= min);
  if (!kaynaklar.length) return `\n\n🧠 <b>AGROS BULGUSU</b>\nHenüz güvenilir bulgu için veri az. En az ${min} kapanışlı kombinasyon/filtre bekleniyor.`;
  const enIyi = [...kaynaklar].sort((a,b) => kararlikPuani(b) - kararlikPuani(a))[0];
  const enKotu = [...kaynaklar].sort((a,b) => kararlikPuani(a) - kararlikPuani(b))[0];
  return `\n\n🧠 <b>AGROS BULGUSU</b>\n` +
    `En güçlü ölçüm: ${enIyi.etiket} | ${enIyi.toplam} işlem | Başarı %${oran(enIyi)} | Net ${Number(enIyi.net || 0).toFixed(2)} | Güven: ${guvenMetni(enIyi)}\n` +
    `En zayıf ölçüm: ${enKotu.etiket} | ${enKotu.toplam} işlem | Başarı %${oran(enKotu)} | Net ${Number(enKotu.net || 0).toFixed(2)} | Güven: ${guvenMetni(enKotu)}`;
}

function bbYonMetni(limit = 5) {
  const o = ozetHazirla();
  const arr = Object.values(o.bbYonStats || {})
    .filter(x => (x.toplam || 0) > 0)
    .sort((a, b) => Number(b.net || 0) - Number(a.net || 0))
    .slice(0, limit);
  if (!arr.length) return '';
  return `

📊 <b>BB + Yön İstatistiği</b>
` + arr.map((b, i) => `${i + 1}) ${b.etiket} | ${b.toplam} işlem | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)}`).join('\n');
}


function statsListeMetni(stats, baslik, limit = 5, mode = 'best') {
  const minOrnek = Number(ayarlar.blackboxKararMinOrnek || 10);
  let arr = Object.values(stats || {}).filter(x => (x.toplam || 0) >= Math.max(1, Math.min(minOrnek, Number(ayarlar.blackboxMinKombinasyonOrnek || 3))));
  if (!arr.length) return '';
  if (mode === 'worst') arr.sort((a, b) => kararlikPuani(a) - kararlikPuani(b));
  else arr.sort((a, b) => kararlikPuani(b) - kararlikPuani(a));
  arr = arr.slice(0, limit);
  return `

${baslik}
` + arr.map((b, i) => kararSatiri(b, i)).join('\n');
}

function kararLaboratuvariMetni() {
  if (ayarlar.blackboxKararLaboratuvariAktif === false) return '';
  const o = ozetHazirla();
  const min = Number(ayarlar.blackboxKararMinOrnek || 10);
  const basariEsik = Number(ayarlar.blackboxKararBasariEsigi || 65);
  const riskEsik = Number(ayarlar.blackboxRiskBasariEsigi || 35);
  const limit = Number(ayarlar.blackboxKararTopAday || 10);
  const exact = Object.values(o.exactComboStats || {});
  const guclu = exact
    .filter(b => (b.toplam || 0) >= min && Number(oran(b)) >= basariEsik && Number(b.net || 0) > 0)
    .sort((a, b) => kararlikPuani(b) - kararlikPuani(a))
    .slice(0, limit);
  const riskli = exact
    .filter(b => (b.toplam || 0) >= min && (Number(oran(b)) <= riskEsik || Number(b.net || 0) < 0))
    .sort((a, b) => kararlikPuani(a) - kararlikPuani(b))
    .slice(0, limit);
  let metin = `

🤖 <b>AGROS KARAR LABORATUVARI</b>
` +
    `Stratejiye müdahale yok; bu bölüm sadece hangi koşulların kazandırdığını gösterir.\n` +
    `Güçlü aday eşiği: min ${min} işlem + başarı ≥ %${basariEsik} + net pozitif.\n` +
    `Riskli aday eşiği: min ${min} işlem + başarı ≤ %${riskEsik} veya net negatif.`;
  if (guclu.length) {
    metin += `

✅ <b>İşlem Açmaya Değer Adaylar</b>
` + guclu.map((b, i) => kararSatiri(b, i)).join('\n');
  } else {
    metin += `

✅ <b>İşlem Açmaya Değer Adaylar</b>
Henüz eşiği geçen tam kombinasyon yok. Veri biriktikçe burası dolacak.`;
  }
  if (riskli.length) {
    metin += `

🚫 <b>Filtre/Yasak Adayları</b>
` + riskli.map((b, i) => kararSatiri(b, i)).join('\n');
  } else {
    metin += `

🚫 <b>Filtre/Yasak Adayları</b>
Henüz güçlü riskli kombinasyon yok.`;
  }
  metin += statsListeMetni(o.pusuKaliteStats, '🏅 <b>Pusu Kalite Sınıfı Etkisi</b>', 4, 'best');
  metin += statsListeMetni(o.pusuSenaryoStats, '🌊 <b>Dip/Tepe Dalga Senaryosu Etkisi</b>', 4, 'best');
  metin += tfEtkiHaritasiMetni(o.btcTfStats, '📈 <b>BTC TF Detay Haritası</b>', 'btc', 4);
  metin += tfEtkiHaritasiMetni(o.coinTfStats, '🪙 <b>Coin TF Detay Haritası</b>', 'coin', 4);
  metin += yuzdeYuzBasarisizMetni(limit);
  metin += tersYonAdaylariMetni(limit);
  metin += agrosBulgusuMetni();
  return metin;
}

function aktifPozisyonOzetMetni() {
  const aktif = (h.state.aktifPozisyonlar || []).filter(p => p.blackboxAcilis).slice(-6);
  if (!aktif.length) return 'Aktif pozisyon BlackBox fotoğrafı yok. İlk yeni işlemde oluşacak.';
  return aktif.map(p => {
    const ac = p.blackboxAcilis;
    const bb = ac?.coin?.bollinger?.bolge || 'YOK';
    return `${p.sym} ${p.yon} | Açılış ${tarihSaat(p.acilisZamani || ac?.zaman)} | Süre ${sureMetni(Date.now() - Number(p.acilisZamani || Date.now()))} | ${signatureShort(ac) || 'İmza:YOK'} | Uyum ${ac?.uyum?.toplam?.metin || 'YOK'} | BTC ${ac?.uyum?.btc?.metin || 'YOK'} | Coin ${ac?.uyum?.coin?.metin || 'YOK'} | BB ${bb}`;
  }).join('\n');
}


function toplamKapanisSayisi() {
  const o = ozetHazirla();
  return Number((o.long?.toplam || 0) + (o.short?.toplam || 0));
}

function istatistikRaporGerekli() {
  if (ayarlar.blackboxIstatistikRaporuAktif === false) return false;
  const toplam = toplamKapanisSayisi();
  const min = Number(ayarlar.blackboxIstatistikMinIslem || 10);
  const aralik = Number(ayarlar.blackboxIstatistikRaporAraligiKapanis || 10);
  if (!Number.isFinite(toplam) || !Number.isFinite(aralik) || aralik <= 0) return false;
  if (toplam < min) return false;
  if (toplam % aralik !== 0) return false;
  if (h.state.blackboxSonIstatistikRaporKapanis === toplam) return false;
  h.state.blackboxSonIstatistikRaporKapanis = toplam;
  return true;
}

function istatistikDakikaRaporGerekli() {
  if (ayarlar.blackboxIstatistikRaporuAktif === false) return false;
  if (ayarlar.blackboxIstatistikDakikaRaporuAktif === false) return false;

  const toplam = toplamKapanisSayisi();
  const dakika = Number(ayarlar.blackboxIstatistikRaporAraligiDakika || 10);
  if (!Number.isFinite(toplam)) return false;
  if (!Number.isFinite(dakika) || dakika <= 0) return false;

  const now = Date.now();
  const aralikMs = dakika * 60 * 1000;
  const son = Number(h.state.blackboxSonIstatistikDakikaRaporZamani || 0);

  // v3.0.3 FIX:
  // Dakika bazlı Strategy Lab raporu, kapanış sayısı minimumuna bağlı değildir.
  // Ama bot açılır açılmaz da Telegram'ı kirletmesin; ilk zaman damgasını kurar,
  // ilk gerçek raporu ayarlanan dakika aralığı dolunca gönderir.
  if (!son) {
    h.state.blackboxSonIstatistikDakikaRaporZamani = now;
    h.state.blackboxSonIstatistikDakikaRaporKapanis = toplam;
    return false;
  }

  if (now - son < aralikMs) return false;

  // v3.0.4 CLEANUP:
  // Genel canlı rapor 10 dakikada bir bilgi vermeye devam eder.
  // Strategy Lab radarı ise aynı kapanış sayısı ve aynı istatistikle tekrar Telegram'a düşmez.
  // Yeni kapanış yoksa kullanıcı aynı bilimsel raporu ikinci kez okumak zorunda kalmaz.
  const sonKapanis = Number(h.state.blackboxSonIstatistikDakikaRaporKapanis ?? -1);
  if (sonKapanis === toplam) {
    h.state.blackboxSonIstatistikDakikaRaporZamani = now;
    return false;
  }

  h.state.blackboxSonIstatistikDakikaRaporZamani = now;
  h.state.blackboxSonIstatistikDakikaRaporKapanis = toplam;
  return true;
}

function enKotuKombinasyonMetni(limit = 10) {
  const o = ozetHazirla();
  const stats = Object.values(o.exactComboStats || {});
  const minOrnek = Number(ayarlar.blackboxMinKombinasyonOrnek || 3);
  const sirali = stats
    .filter(x => (x.toplam || 0) >= minOrnek)
    .sort((a, b) => Number(a.net || 0) - Number(b.net || 0))
    .slice(0, limit);
  if (!sirali.length) return '';
  return `\n\n📉 <b>En Zayıf Tam Kombinasyonlar</b>\n` + sirali.map((b, i) =>
    `${i + 1}) ${b.etiket} | ${b.toplam} işlem | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)}`
  ).join('\n');
}

function trendYonMetni() {
  const o = ozetHazirla();
  return `\n\n🤝 <b>Trend Aynı/Ters Yön İstatistiği</b>\n` +
    `${bucketMetni('Trend ile aynı yönde', o.trendAyniYon)}\n` +
    `${bucketMetni('Trendin tersinde', o.trendTersYon)}`;
}

function sonBlackboxSatirlari(o) {
  return (o.son5 || [])
    .map(x => `${x.sonuc === 'TP' ? '✅' : x.sonuc === 'BE' ? '⚖️' : '❌'} ${x.symbol} ${x.yon} | ${x.imza || 'İmza:YOK'} | Uyum ${x.uyum} | BB ${x.bb} | ${Number(x.net || 0).toFixed(2)}`)
    .join('\n');
}

function blackboxReportModelOlustur() {
  const o = ozetHazirla();
  const toplam = toplamKapanisSayisi();
  const topK = Number(ayarlar.blackboxRaporTopKombinasyon || 10);
  const son = sonBlackboxSatirlari(o);
  const islemVar = (Number(o.long?.toplam || 0) + Number(o.short?.toplam || 0)) > 0;

  return {
    o,
    toplam,
    topK,
    son,
    islemVar,
    bolumler: {
      strategyLabRadar: strategyLabRadarMetni(),
      anaYonOzet: `${bucketMetni('🟢 LONG', o.long)}\n${bucketMetni('🔴 SHORT', o.short)}`,
      trendYon: trendYonMetni(),
      enIyiKombinasyon: enIyiKombinasyonMetni(topK),
      enKotuKombinasyon: enKotuKombinasyonMetni(topK),
      btcTf: enBasariliTfMetni(o.btcTfStats, '⏱️ <b>BTC TF → İşlem Yönü</b>', 4),
      coinTf: enBasariliTfMetni(o.coinTfStats, '🪙 <b>Coin TF → İşlem Yönü</b>', 4),
      btcTfOzet: enBasariliTfMetni(o.btcTfStats, '⏱️ <b>En Başarılı BTC TF → İşlem Yönü</b>', 4),
      coinTfOzet: enBasariliTfMetni(o.coinTfStats, '🪙 <b>En Başarılı Coin TF → İşlem Yönü</b>', 4),
      bbYon: bbYonMetni(5),
      kararLab: kararLaboratuvariMetni(),
      aktifPozisyonlar: aktifPozisyonOzetMetni()
    }
  };
}

function renderIstatistikRaporu(model = blackboxReportModelOlustur()) {
  const b = model.bolumler;
  return b.strategyLabRadar + `\n\n━━━━━━━━━━━━━━━━━━\n` +
    `🧠 <b>BLACKBOX İSTATİSTİK RAPORU</b>\n` +
    `Kapanan BlackBox işlem: ${model.toplam}\n` +
    `Rapor aralığı: ${Number(ayarlar.blackboxIstatistikRaporAraligiDakika || 10)} dakika + her ${Number(ayarlar.blackboxIstatistikRaporAraligiKapanis || 10)} kapanış\n` +
    `--------------------------------\n` +
    b.anaYonOzet +
    b.trendYon +
    b.enIyiKombinasyon +
    b.enKotuKombinasyon +
    b.btcTf +
    b.coinTf +
    b.bbYon +
    b.kararLab;
}

function renderOzetRaporu(model = blackboxReportModelOlustur()) {
  const o = model.o;
  const b = model.bolumler;
  return `\n\n🧠 <b>BLACKBOX TREND ETKİSİ</b>\n` +
    `<i>Açılış anındaki BTC/Coin 5m-15m-1h-4h SuperTrend uyumuna göre kapanan işlemler.</i>\n` +
    (model.islemVar ? (
      `${bucketMetni('🟢 LONG', o.long)}\n` +
      `${bucketMetni('🔴 SHORT', o.short)}\n` +
      `${bucketMetni('BTC 4/4 işlem yönü', o.btcTamUyum)}\n` +
      `${bucketMetni('Coin 4/4 işlem yönü', o.coinTamUyum)}\n` +
      `${bucketMetni('Toplam 8/8 uyum', o.toplamTamUyum)}\n` +
      `${bucketMetni('Toplam 7/8 uyum', o.toplam7Uyum)}\n` +
      `${bucketMetni('Toplam 6/8 uyum', o.toplam6Uyum)}\n` +
      `${bucketMetni('Zayıf uyum ≤3/8', o.toplamZayifUyum)}\n` +
      `${bucketMetni('BB TAM ORTA', o.bbOrta)}\n` +
      `${bucketMetni('BB ORTA BÖLGE', o.bbOrtaBolge)}\n` +
      `${bucketMetni('BB ALT/ÜST', o.bbAltUst)}` +
      (model.son ? `\n\n📌 <b>Son BlackBox</b>\n${model.son}` : '') +
      b.enIyiKombinasyon +
      b.btcTfOzet +
      b.coinTfOzet +
      b.bbYon +
      b.kararLab
    ) : 'Henüz kapanan BlackBox işlemi yok. İlk kapanıştan sonra başarı/net tabloları dolacak.') +
    `\n\n📡 <b>Aktif Pozisyon Açılış Fotoğrafları</b>\n${b.aktifPozisyonlar}`;
}

function telegramIstatistikRaporMetni() {
  return renderIstatistikRaporu(blackboxReportModelOlustur());
}

function telegramOzetMetni() {
  return renderOzetRaporu(blackboxReportModelOlustur());
}

module.exports = { strategySignatureOlustur, strategySignatureMetni, deneyMeta, deneyKimligi, snapshotAl, telegramSnapshotMetni, gecisMetni, kayitYaz, emojiTrend, telegramOzetMetni, telegramIstatistikRaporMetni, istatistikRaporGerekli, istatistikDakikaRaporGerekli, stSatiri, tarihSaat, sureMetni, tradeZamanMetni, kapanisAnalizMetni, blackboxReportModelOlustur, renderIstatistikRaporu, renderOzetRaporu };
