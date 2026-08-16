'use strict';

// AGROS ST2 R27 — bağımsız Heikin Ashi gerçek giriş lane'i.
// Ağ çağrısı yapmaz; R26/R26.1'in hazır 15m mum cache'i ve canlı fiyat cache'ini kullanır.
// Kural: HA BB pusu -> en geç 3 kapanmış HA mum içinde karşı renk teyit ->
// çalışan GERÇEK fiyat teyit mumunun DOLU GÖVDESİNİ kırar -> gerçek emir.

const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const motor = require('./motor.js');
const realExecution = require('./85_st2_real_order_execution.js');

const VERSION = 'R27-HEIKIN-ASHI-REAL-CONFIRMED-BODY-BREAK';

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function upper(v) { return String(v || '').trim().toUpperCase(); }
function store() {
  h.state.st2HeikinAshi ||= { pusular: {}, sonKaynakMum: {}, audit: {} };
  h.state.st2HeikinAshi.pusular ||= {};
  h.state.st2HeikinAshi.sonKaynakMum ||= {};
  h.state.st2HeikinAshi.audit ||= {};
  return h.state.st2HeikinAshi;
}
function inc(key) { const s = store(); s.audit[key] = Number(s.audit[key] || 0) + 1; }
function candleCopy(c) {
  return { openTime:n(c?.openTime), closeTime:n(c?.closeTime), open:n(c?.open), high:n(c?.high), low:n(c?.low), close:n(c?.close), volume:n(c?.volume) };
}
function closedCandles(rows, now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).filter(c => c && n(c.closeTime) > 0 && n(c.closeTime) <= now && n(c.open) > 0 && n(c.high) > 0 && n(c.low) > 0 && n(c.close) > 0);
}

function heikinAshiSeries(rows) {
  const src = closedCandles(rows);
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const close = (n(c.open) + n(c.high) + n(c.low) + n(c.close)) / 4;
    const open = i === 0 ? (n(c.open) + n(c.close)) / 2 : (n(out[i-1].open) + n(out[i-1].close)) / 2;
    const high = Math.max(n(c.high), open, close);
    const low = Math.min(n(c.low), open, close);
    out.push({ openTime:n(c.openTime), closeTime:n(c.closeTime), open, high, low, close, source:candleCopy(c), color: close > open ? 'GREEN' : close < open ? 'RED' : 'DOJI' });
  }
  return out;
}

function bollingerAt(values, period = 20, multiplier = 2) {
  const p = Math.max(2, Math.floor(n(period, 20)));
  const arr = (Array.isArray(values) ? values : []).map(Number).filter(x => Number.isFinite(x) && x > 0);
  if (arr.length < p) return null;
  const w = arr.slice(-p);
  const mid = w.reduce((a,b)=>a+b,0) / p;
  const variance = w.reduce((a,b)=>a + Math.pow(b-mid,2),0) / p;
  const sd = Math.sqrt(variance);
  return { mid, upper: mid + n(multiplier,2)*sd, lower: mid - n(multiplier,2)*sd };
}

function sourceSetup(series) {
  const period = Math.max(2, Number(ayarlar.heikinAshiBollingerPeriod || 20));
  if (!Array.isArray(series) || series.length < period) return null;
  const last = series.at(-1);
  const bb = bollingerAt(series.map(x=>x.close), period, Number(ayarlar.heikinAshiBollingerCarpani || 2));
  if (!last || !bb) return null;
  const proximity = Math.max(0, Number(ayarlar.heikinAshiBandYakinlikYuzdesi ?? 0.5)) / 100;
  if (last.color === 'RED' && last.low <= bb.lower * (1 + proximity)) {
    return { side:'LONG', scenario:'HA_RED_LOWER_BB', source:last, bb, bandGapPct: bb.lower > 0 ? ((last.low-bb.lower)/bb.lower)*100 : 0 };
  }
  if (last.color === 'GREEN' && last.high >= bb.upper * (1 - proximity)) {
    return { side:'SHORT', scenario:'HA_GREEN_UPPER_BB', source:last, bb, bandGapPct: bb.upper > 0 ? ((bb.upper-last.high)/bb.upper)*100 : 0 };
  }
  return null;
}

function confirmationFor(pusu, series) {
  const max = Math.max(1, Math.floor(Number(ayarlar.heikinAshiMaxPusuBeklemeMum || 3)));
  const after = (series || []).filter(x => n(x.closeTime) > n(pusu.sourceCloseTime));
  const eligible = after.slice(0, max);
  const wanted = pusu.yon === 'LONG' ? 'GREEN' : 'RED';
  const confirmation = eligible.find(x => x.color === wanted) || null;
  return { afterCount: after.length, max, confirmation };
}

function confirmationBodyBoundary(candle, side) {
  if (!candle) return 0;
  return side === 'LONG' ? Math.max(n(candle.open), n(candle.close)) : Math.min(n(candle.open), n(candle.close));
}

function livePriceCrossed(side, price, boundary) {
  const p = n(price), b = n(boundary);
  if (!(p > 0 && b > 0)) return false;
  return side === 'LONG' ? p > b : p < b;
}

function occupiedSymbol(sym) {
  return (h.state.aktifPozisyonlar || []).some(p => p?.sanal === false && upper(p?.sym) === upper(sym));
}

async function processExisting(sym, series) {
  const s = store();
  const pusu = s.pusular[sym];
  if (!pusu) return false;
  const conf = confirmationFor(pusu, series);
  pusu.gecenMumSayisi = Math.min(conf.afterCount, conf.max);

  // Üç tam kapanmış mum şansı vardır; dördüncü kapanış geldiğinde eski sinyal kovalanmaz.
  if (conf.afterCount > conf.max) {
    console.log(`⏰ [HA PUSU EXPIRED] ${sym} ${pusu.yon} | ${conf.max} kapanmış HA mum içinde tetik yok`);
    delete s.pusular[sym]; inc('expired');
    return false;
  }

  if (!pusu.confirmation && conf.confirmation) {
    const c = conf.confirmation;
    pusu.confirmation = candleCopy(c);
    pusu.confirmationColor = c.color;
    pusu.confirmationCloseTime = n(c.closeTime);
    pusu.bodyBoundary = confirmationBodyBoundary(c, pusu.yon);
    pusu.confirmedAt = Date.now();
    inc('teyit');
    console.log(`✅ [HA TEYİT MUMU] ${sym} ${pusu.yon} | ${c.color} | Gövde tetik ${pusu.bodyBoundary} | Sayaç ${pusu.gecenMumSayisi}/${conf.max} | İğne kullanılmaz`);
  }
  if (!pusu.confirmation) return false;

  const price = n(h.state.canliFiyatlar?.[sym]);
  if (!livePriceCrossed(pusu.yon, price, pusu.bodyBoundary)) return false;

  // Aynı Binance one-way sembolü iki stratejiye ayrı pozisyon olarak bölünemez.
  // Yarışı muhasebe olarak temiz tutmak için çakışan ikinci sinyal kovalanmadan kapanır.
  if (occupiedSymbol(sym)) {
    console.log(`🚫 [HA REAL COLLISION] ${sym} ${pusu.yon} | Sembolde gerçek pozisyon var; HA sinyali yarışta COLLISION`);
    delete s.pusular[sym]; inc('collision');
    return false;
  }

  const laneLimit = motor.strategyLaneLimit('HEIKIN_ASHI');
  const laneActive = motor.aktifGercekPozisyonSayisiLane('HEIKIN_ASHI');
  if (laneActive >= laneLimit) {
    console.log(`🚫 [HA REAL SLOT] ${sym} ${pusu.yon} | ${laneActive}/${laneLimit}`);
    delete s.pusular[sym]; inc('slotRed');
    return false;
  }

  if (h.state.st2RealEntrySafety?.ready !== true) return false;
  inc('tetik');
  const analysis = {
    entryStrategy:'ST2_HEIKIN_ASHI', strategyLane:'HEIKIN_ASHI', entryMode:'CONFIRMED',
    entryTimingAuthority:'CLOSED_15M_HEIKIN_ASHI_REVERSAL_BODY_BREAK',
    patternKodu:pusu.scenario, patternSignature:`${pusu.yon}|${pusu.scenario}`,
    senaryo:pusu.scenario, pusuSayaci:pusu.gecenMumSayisi, maxPusuBeklemeMum:conf.max,
    olusumZamani:pusu.createdAt, kaynakMumZamani:pusu.sourceCloseTime,
    referansSeviye:pusu.bodyBoundary, tetikFiyati:pusu.bodyBoundary,
    heikinAshiBb:{ altBand:pusu.bb.lower, ortaBand:pusu.bb.mid, ustBand:pusu.bb.upper, bandFarkYuzde:pusu.bandGapPct },
    heikinAshiPusuMumu:pusu.sourceCandle, heikinAshiTeyitMumu:pusu.confirmation,
    confirmationBodyBoundary:pusu.bodyBoundary, wickIgnored:true,
    raceVersion:'R27-DUAL-REAL'
  };
  console.log(`🎯 [HA GERÇEK TETİK] ${sym} ${pusu.yon} | Canlı ${price} ${pusu.yon === 'LONG' ? '>' : '<'} Gövde ${pusu.bodyBoundary} | Sayaç ${pusu.gecenMumSayisi}/${conf.max}`);
  const opened = await motor.pozisyonAc(sym, pusu.yon, price, analysis);
  if (opened) { inc('opened'); delete s.pusular[sym]; return true; }
  return false;
}

function maybeCreate(sym, series) {
  const s = store();
  if (s.pusular[sym]) return null;
  const setup = sourceSetup(series);
  if (!setup) return null;
  const sourceTime = n(setup.source?.closeTime);
  const sourceKey = `${sym}|${setup.side}|${sourceTime}`;
  if (s.sonKaynakMum[sym] === sourceKey) return null;
  s.sonKaynakMum[sym] = sourceKey;
  const pusu = {
    sym, yon:setup.side, scenario:setup.scenario, createdAt:Date.now(), sourceCloseTime:sourceTime,
    sourceCandle:candleCopy(setup.source), bb:setup.bb, bandGapPct:setup.bandGapPct,
    gecenMumSayisi:0, confirmation:null, bodyBoundary:null
  };
  s.pusular[sym] = pusu;
  inc('yeniPusu');
  console.log(`🕯️ [YENİ HA PUSU] ${sym} ${setup.side} | ${setup.scenario} | BB A/O/U ${setup.bb.lower}/${setup.bb.mid}/${setup.bb.upper} | Maks ${Number(ayarlar.heikinAshiMaxPusuBeklemeMum || 3)} mum`);
  Promise.resolve(h.telegramMesajGonder(
    `<b>🕯️ YENİ HEIKIN ASHI PUSU</b>\n${sym} ${setup.side} | ${setup.scenario}\n` +
    `BB yaklaşma %${Number(setup.bandGapPct || 0).toFixed(3)} | Maks ${Number(ayarlar.heikinAshiMaxPusuBeklemeMum || 3)} mum\n` +
    `Tetik: karşı renk HA teyit kapanışı → çalışan gerçek fiyat teyit gövdesini kırar (iğne yok).`
  )).catch(()=>{});
  return pusu;
}

async function taraVeDegerlendir() {
  realExecution.ensureStrategyRaceBaseline();
  if (ayarlar.heikinAshiAktif !== true || h.state.startupMarketReady !== true) return { enabled:false };
  const s = store();
  const symbols = h.state.st2CoreUniverseSymbols || h.state.semboller || [];
  const audit = { version:VERSION, symbols:0, ready:0, active:0, long:0, short:0, opened:0, startedAt:Date.now() };
  for (let i=0;i<symbols.length;i++) {
    const sym = symbols[i]; audit.symbols++;
    const candles = h.state.yerelPusuHafizasi?.[sym];
    const series = heikinAshiSeries(candles);
    if (series.length < Math.max(20, Number(ayarlar.heikinAshiBollingerPeriod || 20))) continue;
    audit.ready++;
    const opened = await processExisting(sym, series);
    if (opened) audit.opened++;
    maybeCreate(sym, series);
    if ((i+1) % 25 === 0) await new Promise(resolve => setImmediate(resolve));
  }
  const active = Object.values(s.pusular || {});
  audit.active = active.length;
  audit.long = active.filter(x=>x.yon==='LONG').length;
  audit.short = active.filter(x=>x.yon==='SHORT').length;
  audit.durationMs = Date.now()-audit.startedAt;
  s.audit.lastScan = audit;
  return audit;
}

module.exports = {
  VERSION, heikinAshiSeries, bollingerAt, sourceSetup, confirmationFor,
  confirmationBodyBoundary, livePriceCrossed, taraVeDegerlendir,
  _store: store
};
