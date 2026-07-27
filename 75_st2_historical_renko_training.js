'use strict';

/**
 * AGROS ST2 v5.7.0 — Historical Renko Replay & Offline Training
 *
 * Güvenlik sözleşmesi:
 * - Canlı Trade Engine'e, canlı Entry Evolution state'ine veya emir kararına yazmaz.
 * - Aynı 72_st2_renko_core çekirdeğini kullanır.
 * - Sonuçları yalnız data/st2-historical-training*.{json,jsonl} altında tutar.
 * - Varsayılan SHADOW moddur; canlıya otomatik terfi yoktur.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const core = require('./72_st2_renko_core.js');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v5.8.1-HISTORICAL-WINNING-INTELLIGENCE-RENKO-CONTEXT-FIX';
const DATA_DIR = process.env.AGROS_DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-historical-training.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const LEDGER_FILE = path.join(DATA_DIR, 'st2-historical-training-ledger.jsonl');
const CHECKPOINT_FILE = path.join(DATA_DIR, 'st2-historical-training-checkpoint.json');
const CANDIDATES = [0.25, 0.50, 0.75, 1.00, 1.25, 1.50];
const DEFAULT_COINS = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','LINK','LTC','AVAX','DOT','BCH','TRX','ATOM','ETC','NEAR','APT','SUI','ARB','OP','FIL','INJ','SEI','TON','UNI','AAVE','FET','PEPE','WIF','HBAR'];
const DEFAULT_SYMBOLS = DEFAULT_COINS.map(x => `${x}USDT`);

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function r(v, digits = 8) { return Number(n(v).toFixed(digits)); }
function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function atomicWrite(file, value) {
  ensureDir();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function blankFeatureMetric() { return { n: 0, wins: 0, losses: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0, mfeSum: 0, maeSum: 0, durationBarsSum: 0 }; }
function blankMetric() { return { samples: 0, triggered: 0, tp: 0, sl: 0, be: 0, unresolved: 0, grossProfit: 0, grossLoss: 0, net: 0, pnl: [], featureStats: {}, pairStats: {} }; }
function blank() {
  return {
    schema: 2, version: VERSION, mode: 'SHADOW', createdAt: new Date().toISOString(), updatedAt: null,
    contract: { writesLiveState: false, changesTradeEngine: false, autoPromotesPremier: false, core: '72_st2_renko_core.js' },
    config: {}, symbols: {}, profiles: {}, processedSignals: {}, totals: { signals: 0, candidateSamples: 0, triggered: 0, closed: 0, unresolved: 0 },
    health: { status: 'HEALTHY', duplicateSignals: 0, apiErrors: 0, invalidCandles: 0, lastError: null }
  };
}
function load() {
  ensureDir();
  for (const f of [STATE_FILE, BACKUP_FILE]) {
    try { if (fs.existsSync(f)) return { ...blank(), ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch (_) {}
  }
  return blank();
}
function save(s) {
  ensureDir(); s.updatedAt = new Date().toISOString(); s.version = VERSION;
  if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, BACKUP_FILE);
  atomicWrite(STATE_FILE, s); return s;
}
function appendLedger(event) { ensureDir(); fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(event)}\n`); }
function smaBb(values, period = 20, mult = 2) {
  if (!Array.isArray(values) || values.length < period) return { mid: 0, upper: [], lower: [] };
  const rows = values.slice(-period).map(Number).filter(Number.isFinite);
  if (rows.length !== period) return { mid: 0, upper: [], lower: [] };
  const mid = rows.reduce((a, b) => a + b, 0) / period;
  const variance = rows.reduce((a, b) => a + ((b - mid) ** 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { mid, upper: [mid + mult * sd], lower: [mid - mult * sd] };
}
function normalizeKline(row) {
  if (Array.isArray(row)) return { openTime: n(row[0]), open: n(row[1]), high: n(row[2]), low: n(row[3]), close: n(row[4]), volume: n(row[5]), closeTime: n(row[6]) };
  return { openTime: n(row.openTime), open: n(row.open), high: n(row.high), low: n(row.low), close: n(row.close), volume: n(row.volume), closeTime: n(row.closeTime || row.openTime) };
}
function validCandle(c) { return c.closeTime > 0 && c.open > 0 && c.high >= c.low && c.close > 0; }
function signalId(symbol, match) {
  return crypto.createHash('sha256').update(`${symbol}|${match.yon}|${match.patternId}|${match.bricks.at(-1)?.closeTime}|${r(match.referenceLevel, 12)}`).digest('hex').slice(0, 24);
}
function profileKey(match) { return `${match.yon}|${match.patternCode}`; }
function target(match, box, distance) {
  const p = { yon: match.yon, referansSeviye: match.referenceLevel, renkoBoxSize: box };
  return core.tetikFiyati(p, distance);
}
function pnlPct(direction, entry, price) { return direction === 'SHORT' ? ((entry - price) / entry) * 100 : ((price - entry) / entry) * 100; }
function priceForPct(direction, entry, pct) { return direction === 'SHORT' ? entry * (1 - pct / 100) : entry * (1 + pct / 100); }
function intrabarPath(candle, direction) {
  // Muhafazakâr sıra: girişten sonra aynı mumda stop ve TP birlikte görülürse stop önce kabul edilir.
  return direction === 'LONG'
    ? [candle.open, candle.low, candle.high, candle.close]
    : [candle.open, candle.high, candle.low, candle.close];
}
function bucket(value, cuts, labels) {
  const x = n(value);
  for (let i = 0; i < cuts.length; i++) if (x < cuts[i]) return labels[i];
  return labels[labels.length - 1];
}
function bbZone(price, bb) {
  const mid = n(bb?.mid), upper = n(bb?.upper?.[0]), lower = n(bb?.lower?.[0]);
  if (!(upper > lower) || !(price > 0)) return 'UNKNOWN';
  const pos = (price - lower) / (upper - lower);
  if (pos <= 0.10) return 'ALT';
  if (pos <= 0.40) return 'ORTA_ALT';
  if (pos <= 0.60) return 'ORTA';
  if (pos <= 0.90) return 'ORTA_UST';
  return 'UST';
}
function signalContext(candles, signalIndex, match, bricks, bb, box) {
  const c = candles[signalIndex] || {};
  const recent = candles.slice(Math.max(0, signalIndex - 19), signalIndex + 1);
  const volumeAvg = recent.length ? recent.reduce((a, x) => a + n(x.volume), 0) / recent.length : 0;
  const volumeRatio = volumeAvg > 0 ? n(c.volume) / volumeAvg : 0;
  const atrPct = n(c.close) > 0 ? box / n(c.close) * 100 : 0;
  const bbWidthPct = n(bb?.mid) > 0 ? (n(bb?.upper?.[0]) - n(bb?.lower?.[0])) / n(bb.mid) * 100 : 0;
  const closes = recent.map(x => n(x.close)).filter(x => x > 0);
  const momentumPct = closes.length >= 5 ? (closes.at(-1) / closes.at(-5) - 1) * 100 : 0;
  const slopePct = closes.length >= 20 ? (closes.at(-1) / closes[0] - 1) * 100 : 0;
  const seq = bricks.slice(-6).map(x => x.color === 'GREEN' ? 'G' : 'R').join('');
  const hour = new Date(n(c.openTime)).getUTCHours();
  const session = hour < 7 ? 'ASYA' : hour < 13 ? 'AVRUPA' : hour < 21 ? 'ABD' : 'GECIS';
  const features = [
    `BB=${bbZone(n(match.referenceLevel), bb)}`,
    `ATR=${bucket(atrPct, [0.20, 0.45, 0.80], ['DUSUK', 'NORMAL', 'YUKSEK', 'COK_YUKSEK'])}`,
    `BBW=${bucket(bbWidthPct, [0.8, 1.6, 3.0], ['DAR', 'NORMAL', 'GENIS', 'COK_GENIS'])}`,
    `HACIM=${bucket(volumeRatio, [0.75, 1.25, 2.0], ['DUSUK', 'NORMAL', 'YUKSEK', 'PATLAMA'])}`,
    `MOM5=${momentumPct > 0.20 ? 'UP' : momentumPct < -0.20 ? 'DOWN' : 'YATAY'}`,
    `TREND20=${slopePct > 0.60 ? 'UP' : slopePct < -0.60 ? 'DOWN' : 'YATAY'}`,
    `SESSION=${session}`,
    `RENKO6=${seq || 'YOK'}`
  ];
  return { features, atrPct: r(atrPct, 5), bbWidthPct: r(bbWidthPct, 5), volumeRatio: r(volumeRatio, 4), momentumPct: r(momentumPct, 5), slopePct: r(slopePct, 5), session, renko6: seq };
}
function observeFeature(map, key, replay) {
  const m = map[key] ||= blankFeatureMetric();
  m.n++;
  const p = n(replay.pnlPct);
  if (p > 0) m.wins++; else if (p < 0) m.losses++; else m.be++;
  m.net += p;
  if (p >= 0) m.grossProfit += p; else m.grossLoss += Math.abs(p);
  m.mfeSum += n(replay.mfePct);
  m.maeSum += n(replay.maePct);
  m.durationBarsSum += n(replay.durationBars);
}
function featureMetric(raw = {}) {
  const n0 = n(raw.n), gp = n(raw.grossProfit), gl = n(raw.grossLoss);
  return { ...raw, n: n0, wr: n0 ? n(raw.wins) / n0 * 100 : 0, pf: gl > 0 ? gp / gl : (gp > 0 ? 999 : 0), expectancy: n0 ? n(raw.net) / n0 : 0,
    avgMfe: n0 ? n(raw.mfeSum) / n0 : 0, avgMae: n0 ? n(raw.maeSum) / n0 : 0, avgDurationBars: n0 ? n(raw.durationBarsSum) / n0 : 0 };
}
function intelligenceForCandidate(raw = {}, minN = 20) {
  const features = Object.entries(raw.featureStats || {}).map(([feature, x]) => ({ feature, ...featureMetric(x) })).filter(x => x.n >= minN);
  const pairs = Object.entries(raw.pairStats || {}).map(([feature, x]) => ({ feature, ...featureMetric(x) })).filter(x => x.n >= minN);
  const positiveSort = (a, b) => b.expectancy - a.expectancy || b.pf - a.pf || b.n - a.n;
  const negativeSort = (a, b) => a.expectancy - b.expectancy || a.pf - b.pf || b.n - a.n;
  return {
    winning: [...features, ...pairs].filter(x => x.expectancy > 0 && x.pf > 1).sort(positiveSort).slice(0, 5),
    losing: [...features, ...pairs].filter(x => x.expectancy < 0 || x.pf < 1).sort(negativeSort).slice(0, 5)
  };
}

function replayCandidate(candles, signalIndex, match, box, distance, cfg) {
  const entry = target(match, box, distance);
  const stopPct = n(cfg.stopPct, 1.5);
  const tpPct = n(cfg.tpPct, 0.4);
  const beTriggerPct = Math.max(0, n(cfg.beTriggerPct, 0.4));
  const beBufferPct = Math.max(0, n(cfg.beBufferPct, 0.12));
  const maxBars = Math.max(1, n(cfg.maxHoldBars, 32));
  const feePct = Math.max(0, n(cfg.roundTripFeePct, 0.08));
  let triggered = false, be = false, stopLevelPct = -stopPct, peak = -Infinity, trough = Infinity, entryTime = 0, entryBar = -1;
  const end = Math.min(candles.length, signalIndex + 1 + maxBars);
  for (let i = signalIndex + 1; i < end; i++) {
    const c = candles[i];
    const entryTouched = match.yon === 'LONG' ? c.high >= entry : c.low <= entry;
    if (!triggered && !entryTouched) continue;
    if (!triggered) { triggered = true; entryTime = c.openTime; entryBar = i; }
    for (const px of intrabarPath(c, match.yon)) {
      if (!(px > 0)) continue;
      const pct = pnlPct(match.yon, entry, px);
      peak = Math.max(peak, pct); trough = Math.min(trough, pct);
      if (!be && peak >= beTriggerPct) { be = true; stopLevelPct = Math.max(stopLevelPct, beBufferPct); }
      if (pct <= stopLevelPct) {
        const exitPct = stopLevelPct - feePct;
        return { triggered: true, resolved: true, result: be ? 'BE' : 'SL', mfePct: r(Math.max(0, peak), 6), maePct: r(Math.min(0, trough), 6), durationBars: Math.max(1, i - entryBar + 1), entry: r(entry, 12), exit: r(priceForPct(match.yon, entry, stopLevelPct), 12), pnlPct: r(exitPct, 6), entryTime, exitTime: c.closeTime };
      }
      if (pct >= tpPct) {
        const exitPct = tpPct - feePct;
        return { triggered: true, resolved: true, result: 'TP', mfePct: r(Math.max(0, peak), 6), maePct: r(Math.min(0, trough), 6), durationBars: Math.max(1, i - entryBar + 1), entry: r(entry, 12), exit: r(priceForPct(match.yon, entry, tpPct), 12), pnlPct: r(exitPct, 6), entryTime, exitTime: c.closeTime };
      }
    }
  }
  if (!triggered) return { triggered: false, resolved: false, result: 'NOT_TRIGGERED', entry: r(entry, 12), pnlPct: 0 };
  const last = candles[Math.max(signalIndex + 1, end - 1)];
  const markPct = pnlPct(match.yon, entry, n(last?.close, entry)) - feePct;
  return { triggered: true, resolved: false, result: 'UNRESOLVED', mfePct: r(Math.max(0, peak), 6), maePct: r(Math.min(0, trough), 6), durationBars: Math.max(1, (end - 1) - entryBar + 1), entry: r(entry, 12), exit: r(last?.close, 12), pnlPct: r(markPct, 6), entryTime, exitTime: n(last?.closeTime) };
}
function observe(metric, replay, context = null) {
  metric.samples++; metric.featureStats ||= {}; metric.pairStats ||= {};
  if (!replay.triggered) return;
  metric.triggered++;
  if (!replay.resolved) metric.unresolved++;
  if (replay.result === 'TP') metric.tp++;
  else if (replay.result === 'SL') metric.sl++;
  else if (replay.result === 'BE') metric.be++;
  if (replay.resolved) {
    const p = n(replay.pnlPct); metric.net += p; metric.pnl.push(p);
    if (p >= 0) metric.grossProfit += p; else metric.grossLoss += Math.abs(p);
    const features = Array.isArray(context?.features) ? [...new Set(context.features)] : [];
    for (const feature of features) observeFeature(metric.featureStats, feature, replay);
    for (let i = 0; i < features.length; i++) for (let j = i + 1; j < features.length; j++) observeFeature(metric.pairStats, `${features[i]} & ${features[j]}`, replay);
  }
}
function metric(m) {
  const closed = n(m.tp) + n(m.sl) + n(m.be);
  const wins = m.pnl.filter(x => x > 0).length;
  const pf = m.grossLoss > 0 ? m.grossProfit / m.grossLoss : (m.grossProfit > 0 ? 999 : 0);
  return { ...m, closed, wr: closed ? wins / closed * 100 : 0, pf, expectancy: closed ? m.net / closed : 0 };
}
function chooseBest(candidates, minN = 30) {
  return Object.entries(candidates).map(([distance, raw]) => ({ distance: Number(distance), ...metric(raw) }))
    .filter(x => x.closed >= minN && x.net > 0 && x.pf > 1 && x.expectancy > 0)
    .sort((a, b) => b.expectancy - a.expectancy || b.net - a.net || b.pf - a.pf || a.distance - b.distance)[0] || null;
}
function trainSymbol(symbol, rawCandles, options = {}, state = null) {
  const s = state || blank();
  const candles = rawCandles.map(normalizeKline).filter(validCandle).sort((a, b) => a.openTime - b.openTime);
  const cfg = {
    atrPeriod: n(options.atrPeriod, ayarlar.renkoAtrPeriod || 14), bbPeriod: n(options.bbPeriod, ayarlar.renkoBollingerPeriod || 20),
    bbMultiplier: n(options.bbMultiplier, ayarlar.bollingercarpani || 2), toleranceBricks: n(options.toleranceBricks, ayarlar.renkoBbTemasToleransTugla ?? 0.25),
    sourceWindow: n(options.sourceWindow, 250), stopPct: n(options.stopPct, ayarlar.sabitStopYuzdesi || 1.5),
    tpPct: n(options.tpPct, ayarlar.sabitTpYuzdesi || 0.4), beTriggerPct: n(options.beTriggerPct, ayarlar.breakevenTetikYuzde || 0.4),
    beBufferPct: n(options.beBufferPct, ayarlar.breakevenTamponYuzde || 0.12), roundTripFeePct: n(options.roundTripFeePct, 0.08),
    maxHoldBars: n(options.maxHoldBars, 32), minTrainingN: n(options.minTrainingN, 30)
  };
  s.config = cfg;
  s.symbols[symbol] ||= { candles: 0, firstOpenTime: candles[0]?.openTime || null, lastCloseTime: null, signals: 0, duplicates: 0 };
  const seen = new Set(Object.keys(s.processedSignals || {}));
  const warmup = Math.max(cfg.sourceWindow, cfg.atrPeriod + 2);
  for (let i = warmup; i < candles.length - 1; i++) {
    const source = candles.slice(Math.max(0, i - cfg.sourceWindow + 1), i + 1);
    const box = core.atr(source, cfg.atrPeriod);
    if (!(box > 0)) continue;
    const bricks = core.renkoUret(source, box);
    if (bricks.length < cfg.bbPeriod) continue;
    const bb = smaBb(bricks.map(x => x.close), cfg.bbPeriod, cfg.bbMultiplier);
    const matches = [core.longPatternTespit(bricks), core.shortPatternTespit(bricks)].filter(Boolean);
    for (const match of matches) {
      const scenario = core.renkoBollingerSenaryosu(match, bb, box, cfg.toleranceBricks);
      if (!scenario?.senaryo) continue;
      const id = signalId(symbol, match);
      if (seen.has(id)) { s.health.duplicateSignals++; s.symbols[symbol].duplicates++; continue; }
      seen.add(id); s.processedSignals[id] = { symbol, at: match.bricks.at(-1)?.closeTime || null }; s.totals.signals++; s.symbols[symbol].signals++;
      const key = profileKey(match);
      const p = s.profiles[key] ||= { key, yon: match.yon, patternId: match.patternId, patternCode: match.patternCode, signals: 0, candidates: Object.fromEntries(CANDIDATES.map(x => [x.toFixed(2), blankMetric()])), bestHistoricalEntry: null };
      p.signals++;
      const context = signalContext(candles, i, match, bricks, bb, box);
      const event = { schema: 2, type: 'HISTORICAL_SIGNAL', id, symbol, signalTime: match.bricks.at(-1)?.closeTime, patternKey: key, patternId: match.patternId, patternCode: match.patternCode, yon: match.yon, boxSize: r(box, 12), referenceLevel: r(match.referenceLevel, 12), context, candidates: {} };
      for (const distance of CANDIDATES) {
        const replay = replayCandidate(candles, i, match, box, distance, cfg);
        observe(p.candidates[distance.toFixed(2)], replay, context); event.candidates[distance.toFixed(2)] = replay;
        s.totals.candidateSamples++; if (replay.triggered) s.totals.triggered++; if (replay.resolved) s.totals.closed++; else if (replay.triggered) s.totals.unresolved++;
      }
      appendLedger(event);
    }
  }
  for (const p of Object.values(s.profiles)) {
    p.bestHistoricalEntry = chooseBest(p.candidates, cfg.minTrainingN);
    const bestRaw = p.bestHistoricalEntry ? p.candidates[p.bestHistoricalEntry.distance.toFixed(2)] : null;
    p.winningIntelligence = bestRaw ? intelligenceForCandidate(bestRaw, Math.max(10, Math.min(30, cfg.minTrainingN))) : { winning: [], losing: [] };
  }
  s.symbols[symbol].candles = candles.length; s.symbols[symbol].lastCloseTime = candles.at(-1)?.closeTime || null;
  return s;
}
function requestJson(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const run = attempt => {
      const req = https.get(url, { timeout: 20000, headers: { 'User-Agent': 'AGROS-ST2-HISTORICAL-TRAINER/5.7.0' } }, res => {
        let body = ''; res.on('data', d => { body += d; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } }
          else if (attempt < retries) setTimeout(() => run(attempt + 1), 500 * attempt);
          else reject(new Error(`HTTP_${res.statusCode}: ${body.slice(0, 200)}`));
        });
      });
      req.on('timeout', () => req.destroy(new Error('BINANCE_TIMEOUT')));
      req.on('error', e => attempt < retries ? setTimeout(() => run(attempt + 1), 500 * attempt) : reject(e));
    }; run(1);
  });
}
async function downloadKlines(symbol, interval, startTime, endTime, options = {}) {
  const base = options.baseUrl || 'https://fapi.binance.com';
  const out = []; let cursor = n(startTime); const limit = 1500;
  while (cursor < endTime) {
    const url = `${base}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&startTime=${cursor}&endTime=${endTime}&limit=${limit}`;
    const rows = await requestJson(url, n(options.retries, 3));
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) out.push(normalizeKline(row));
    const next = n(rows.at(-1)?.[6]) + 1;
    if (!(next > cursor)) break;
    cursor = next;
    atomicWrite(CHECKPOINT_FILE, { version: VERSION, symbol, interval, nextStartTime: cursor, downloaded: out.length, updatedAt: new Date().toISOString() });
    if (rows.length < limit) break;
  }
  return out;
}
function report(state = load()) {
  const rows = Object.values(state.profiles || {}).map(p => ({ ...p, candidateRows: Object.entries(p.candidates || {}).map(([d, m]) => ({ distance: Number(d), ...metric(m) })) }))
    .sort((a, b) => (b.bestHistoricalEntry?.expectancy || -999) - (a.bestHistoricalEntry?.expectancy || -999));
  const lines = [
    '🧠 AGROS ST2 TARİHSEL RENKO EĞİTİMİ — SHADOW',
    `Sürüm ${VERSION}`,
    `Sinyal ${n(state.totals?.signals)} | Aday ${n(state.totals?.candidateSamples)} | Tetik ${n(state.totals?.triggered)} | Kapanan ${n(state.totals?.closed)} | Açık ${n(state.totals?.unresolved)}`,
    `Pattern ${rows.length} | Tarihsel giriş seçilen ${rows.filter(x => x.bestHistoricalEntry).length}`,
    '🔒 Canlı Trade Engine / Premier kararı değiştirilmedi.', ''
  ];
  for (const p of rows) {
    const b = p.bestHistoricalEntry;
    lines.push(`${p.yon} ${p.patternCode} | Sinyal N${p.signals} | En iyi ${b ? b.distance.toFixed(2) : 'YOK'} | ${b ? `N${b.closed} WR %${b.wr.toFixed(1)} PF ${b.pf.toFixed(2)} Exp ${b.expectancy >= 0 ? '+' : ''}${b.expectancy.toFixed(4)} Net ${b.net >= 0 ? '+' : ''}${b.net.toFixed(4)}` : 'Minimum veri/pozitif şart bekleniyor'}`);
    if (b) {
      const wi = p.winningIntelligence || { winning: [], losing: [] };
      const good = wi.winning?.slice(0, 3) || []; const bad = wi.losing?.slice(0, 3) || [];
      if (good.length) lines.push(`  ✅ Kazandıran ortak koşullar: ${good.map(x => `${x.feature} [N${x.n} PF ${x.pf.toFixed(2)} Exp ${x.expectancy >= 0 ? '+' : ''}${x.expectancy.toFixed(4)}]`).join(' | ')}`);
      if (bad.length) lines.push(`  ❌ Kaybettiren ortak koşullar: ${bad.map(x => `${x.feature} [N${x.n} PF ${x.pf.toFixed(2)} Exp ${x.expectancy >= 0 ? '+' : ''}${x.expectancy.toFixed(4)}]`).join(' | ')}`);
      if (!good.length && !bad.length) lines.push('  🧪 Neden analizi için alt-küme örnek sayısı henüz yetersiz.');
    }
  }
  return lines.join('\n');
}
function parseArgs(argv = []) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const eq = raw.indexOf('=');
    if (eq === -1) args[raw] = true;
    else args[raw.slice(0, eq)] = raw.slice(eq + 1);
  }
  return args;
}
async function cli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.report) { console.log(report()); return; }
  const symbols = String(args.symbols || args.symbol || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) symbols.push(...DEFAULT_SYMBOLS);
  const start = Date.parse(args.start); const end = Date.parse(args.end || new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Geçerli --start ve --end tarihleri zorunludur.');
  let state = args.reset ? blank() : load();
  for (const symbol of symbols) {
    const candles = await downloadKlines(symbol, args.interval || '15m', start, end, {});
    state = trainSymbol(symbol, candles, { minTrainingN: n(args.minN, 30), maxHoldBars: n(args.maxHoldBars, 32) }, state);
    save(state);
  }
  console.log(report(state));
}

if (require.main === module) cli().catch(e => { console.error(`❌ ${e.stack || e.message}`); process.exitCode = 1; });
module.exports = { VERSION, DEFAULT_COINS, DEFAULT_SYMBOLS, parseArgs, STATE_FILE, BACKUP_FILE, LEDGER_FILE, CHECKPOINT_FILE, CANDIDATES, blank, load, save, smaBb, normalizeKline, bbZone, signalContext, featureMetric, intelligenceForCandidate, replayCandidate, metric, chooseBest, trainSymbol, downloadKlines, report, cli };
