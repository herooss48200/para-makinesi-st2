const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'blackbox-snapshots.jsonl');
const CSV = path.join(DATA_DIR, 'blackbox-trades.csv');
const TFS = ayarlar.blackboxTimeframes || ['5m', '15m', '1h', '4h'];

const CSV_BASLIK = [
  'tradeId','kayitTipi','zaman','symbol','yon','sonuc','kapanisSebebi',
  'girisFiyati','kapanisFiyati','netKarZarar','komisyon','mfeYuzde','maeYuzde',
  'open_btc_5m','open_btc_15m','open_btc_1h','open_btc_4h',
  'open_coin_5m','open_coin_15m','open_coin_1h','open_coin_4h',
  'close_btc_5m','close_btc_15m','close_btc_1h','close_btc_4h',
  'close_coin_5m','close_coin_15m','close_coin_1h','close_coin_4h',
  'open_btcUyum','open_coinUyum','open_toplamUyum','open_coinBbBolge','open_coinBbPozisyon','open_coinBbOrtaYakinlik',
  'close_btcUyum','close_coinUyum','close_toplamUyum','close_coinBbBolge','close_coinBbPozisyon','close_coinBbOrtaYakinlik'
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
  return { kayitTipi, zaman, symbol, yon, btc, coin, uyum: { btc: btcUyum, coin: coinUyum, toplam: toplamUyum } };
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
    `🧠 <b>Agros Yorumu</b>: ${trendYorumu(snap)}`;
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
      close_btcUyum: ka?.uyum?.btc?.metin || '', close_coinUyum: ka?.uyum?.coin?.metin || '', close_toplamUyum: ka?.uyum?.toplam?.metin || '', close_coinBbBolge: bbField(ka,'bolge'), close_coinBbPozisyon: bbField(ka,'position'), close_coinBbOrtaYakinlik: bbField(ka,'ortaYakinlik')
    };
    fs.appendFileSync(CSV, CSV_BASLIK.map(k => csv(row[k])).join(',') + '\n');
  } catch (err) { console.log(`⚠️ [BLACKBOX] Kayıt yazılamadı: ${err.message}`); }
}


function bosBucket() { return { toplam: 0, tp: 0, sl: 0, be: 0, net: 0 }; }
function ozetHazirla() {
  if (!h.state.blackboxOzet) h.state.blackboxOzet = { sonGuncelleme: new Date().toISOString(), long: bosBucket(), short: bosBucket(), btcTamUyum: bosBucket(), coinTamUyum: bosBucket(), toplamTamUyum: bosBucket(), toplam7Uyum: bosBucket(), toplam6Uyum: bosBucket(), toplamZayifUyum: bosBucket(), bbOrta: bosBucket(), bbOrtaBolge: bosBucket(), bbAltUst: bosBucket(), son5: [], comboStats: {} };
  for (const k of ['long','short','btcTamUyum','coinTamUyum','toplamTamUyum','toplam7Uyum','toplam6Uyum','toplamZayifUyum','bbOrta','bbOrtaBolge','bbAltUst']) if (!h.state.blackboxOzet[k]) h.state.blackboxOzet[k] = bosBucket();
  if (!Array.isArray(h.state.blackboxOzet.son5)) h.state.blackboxOzet.son5 = [];
  return h.state.blackboxOzet;
}
function bucketEkle(b, sonuc, net) {
  b.toplam += 1;
  if (sonuc === 'TP') b.tp += 1; else if (sonuc === 'BE') b.be += 1; else if (sonuc === 'SL') b.sl += 1;
  b.net += Number(net || 0);
}
function ozetGuncelle(pos, sonuc) {
  const o = ozetHazirla();
  const s = String(sonuc.sonuc || '').toUpperCase();
  const net = Number(sonuc.netKarZarar || 0);
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

  const stats = comboStatsHazirla(o);
  const key = comboKey(ac, pos.yon);
  if (!stats[key]) stats[key] = { ...bosBucket(), etiket: comboEtiket(ac, pos.yon), key };
  bucketEkle(stats[key], s, net);

  o.son5.unshift({ symbol: pos.sym, yon: pos.yon, sonuc: s, net, uyum: ac?.uyum?.toplam?.metin || 'YOK', bb: bb || 'YOK' });
  o.son5 = o.son5.slice(0, 5);
  o.sonGuncelleme = new Date().toISOString();
}
function oran(b) { const n = (b.tp || 0) + (b.sl || 0); return n > 0 ? ((b.tp / n) * 100).toFixed(1) : '0.0'; }
function bucketMetni(ad, b) { return `${ad}: ${b.toplam || 0} | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0} | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)}`; }

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
  const stats = comboStatsHazirla(o);
  const key = comboKey(ac, pos?.yon);
  const b = stats[key];
  if (!b || !b.toplam) {
    return `📚 <b>Aynı Kombinasyon</b>
Bu kombinasyon için ilk kapanış bekleniyor.`;
  }
  const sonucSayisi = (b.tp || 0) + (b.sl || 0);
  const beOran = b.toplam > 0 ? (((b.be || 0) / b.toplam) * 100).toFixed(1) : '0.0';
  return `📚 <b>Aynı Kombinasyon</b>
` +
    `${b.etiket || comboEtiket(ac, pos?.yon)}
` +
    `Toplam: ${b.toplam} | TP:${b.tp || 0} SL:${b.sl || 0} BE:${b.be || 0}
` +
    `Başarı: %${oran(b)} | BE Oranı: %${beOran} | Net: ${Number(b.net || 0).toFixed(2)} USDT` +
    (sonucSayisi < 10 ? `
Not: Örnek sayısı düşük; 4 günlük testte güçlenecek.` : '');
}

function enIyiKombinasyonMetni(limit = 3) {
  const o = ozetHazirla();
  const stats = Object.values(comboStatsHazirla(o));
  const sirali = stats
    .filter(x => (x.toplam || 0) > 0)
    .sort((a, b) => Number(b.net || 0) - Number(a.net || 0))
    .slice(0, limit);
  if (!sirali.length) return '';
  return `

🏆 <b>En Karlı Kombinasyonlar</b>
` + sirali.map((b, i) =>
    `${i + 1}) ${b.etiket} | ${b.toplam} işlem | Başarı %${oran(b)} | Net ${Number(b.net || 0).toFixed(2)}`
  ).join('\n');
}


function aktifPozisyonOzetMetni() {
  const aktif = (h.state.aktifPozisyonlar || []).filter(p => p.blackboxAcilis).slice(-6);
  if (!aktif.length) return 'Aktif pozisyon BlackBox fotoğrafı yok. İlk yeni işlemde oluşacak.';
  return aktif.map(p => {
    const ac = p.blackboxAcilis;
    const bb = ac?.coin?.bollinger?.bolge || 'YOK';
    return `${p.sym} ${p.yon} | Açılış ${tarihSaat(p.acilisZamani || ac?.zaman)} | Süre ${sureMetni(Date.now() - Number(p.acilisZamani || Date.now()))} | Uyum ${ac?.uyum?.toplam?.metin || 'YOK'} | BTC ${ac?.uyum?.btc?.metin || 'YOK'} | Coin ${ac?.uyum?.coin?.metin || 'YOK'} | BB ${bb}`;
  }).join('\n');
}

function telegramOzetMetni() {
  const o = ozetHazirla();
  const islemVar = (o.long.toplam + o.short.toplam) > 0;
  const son = (o.son5 || []).map(x => `${x.sonuc === 'TP' ? '✅' : x.sonuc === 'BE' ? '⚖️' : '❌'} ${x.symbol} ${x.yon} | Uyum ${x.uyum} | BB ${x.bb} | ${Number(x.net || 0).toFixed(2)}`).join('\n');
  return `\n\n🧠 <b>BLACKBOX TREND ETKİSİ</b>\n` +
    `<i>Açılış anındaki BTC/Coin 5m-15m-1h-4h SuperTrend uyumuna göre kapanan işlemler.</i>\n` +
    (islemVar ? (
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
      (son ? `\n\n📌 <b>Son BlackBox</b>\n${son}` : '') +
      enIyiKombinasyonMetni(3)
    ) : 'Henüz kapanan BlackBox işlemi yok. İlk kapanıştan sonra başarı/net tabloları dolacak.') +
    `\n\n📡 <b>Aktif Pozisyon Açılış Fotoğrafları</b>\n${aktifPozisyonOzetMetni()}`;
}

module.exports = { snapshotAl, telegramSnapshotMetni, gecisMetni, kayitYaz, emojiTrend, telegramOzetMetni, stSatiri, tarihSaat, sureMetni, tradeZamanMetni, kapanisAnalizMetni };
