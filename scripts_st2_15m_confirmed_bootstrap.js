'use strict';

/**
 * AGROS ST2 v6.13.5-R22 — OFFLINE 15m CONFIRMED bootstrap worker
 *
 * Bu dosya PM2 trade process içinde require edilmez.
 * Ayrı process olarak çalışır, mevcut historical signal ledger'ını okur,
 * yalnız 15m Binance mumlarını indirir ve DIRECT vs 15m-CONFIRMED için
 * aynı standart exit modeliyle başlangıç kanıtı üretir.
 *
 * 1m Renko ST bu bootstrap'ta modellenmez. Bu nedenle bootstrap bir PRIOR'dır;
 * canlı 1m ST gerçek girişte yine zorunludur ve live sonuçlar state'e eklenir.
 */
const fs = require('fs');
const path = require('path');
const core = require('./72_st2_renko_core.js');
const trainer = require('./75_st2_historical_renko_training.js');
const evidence = require('./94_st2_15m_confirmed_evidence.js');
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.13.5-R22-15M-CONFIRMED-OFFLINE-BOOTSTRAP';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'st2-historical-training-ledger.jsonl');
const CANDIDATES = [0.25, 0.50, 0.75];

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2), i = raw.indexOf('=');
    if (i < 0) out[raw] = true;
    else out[raw.slice(0, i)] = raw.slice(i + 1);
  }
  return out;
}
function colorOf(brick) {
  const raw = String(brick?.color || brick?.renk || '').toUpperCase();
  if (raw === 'GREEN' || raw === 'G') return 'GREEN';
  if (raw === 'RED' || raw === 'R') return 'RED';
  return n(brick?.close) >= n(brick?.open) ? 'GREEN' : 'RED';
}
function readEvents(options = {}) {
  if (!fs.existsSync(LEDGER_FILE)) throw new Error(`HISTORICAL_LEDGER_NOT_FOUND:${LEDGER_FILE}`);
  const cutoff = Date.now() - Math.max(7, n(options.lookbackDays, 60)) * 86400000;
  const wanted = new Set((options.symbols || []).map(x => String(x).toUpperCase()));
  const dedupe = new Set(), events = [];
  const lines = fs.readFileSync(LEDGER_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let row; try { row = JSON.parse(line); } catch (_) { continue; }
    if (row?.type !== 'HISTORICAL_SIGNAL') continue;
    const signalTime = n(row.signalTime);
    if (!(signalTime >= cutoff)) continue;
    const symbol = String(row.symbol || '').toUpperCase();
    if (!symbol || (wanted.size && !wanted.has(symbol))) continue;
    const direction = String(row.yon || '').toUpperCase();
    const pattern = String(row.patternCode || row.patternKodu || 'UNKNOWN').toUpperCase();
    const box = n(row.boxSize);
    if (!['LONG', 'SHORT'].includes(direction) || !(box > 0)) continue;
    const id = String(row.id || `${symbol}|${direction}|${pattern}|${signalTime}|${box}`);
    if (dedupe.has(id)) continue;
    dedupe.add(id);
    events.push({ ...row, id, symbol, direction, pattern, signalTime, boxSize: box });
  }
  events.sort((a, b) => a.signalTime - b.signalTime);
  return events;
}
function blankMetric() { return evidence._blankMetric(); }
function observeMetric(profiles, key, result) {
  profiles[key] ||= blankMetric();
  evidence.observe(profiles[key], result);
}
function candidateKey(mode, event, offsetT) { return evidence.profileKey(mode, event.direction, event.pattern, offsetT); }
function normalizeCandle(c) {
  return Array.isArray(c)
    ? { openTime:n(c[0]), open:n(c[1]), high:n(c[2]), low:n(c[3]), close:n(c[4]), volume:n(c[5]), closeTime:n(c[6]) }
    : { openTime:n(c.openTime), open:n(c.open), high:n(c.high), low:n(c.low), close:n(c.close), volume:n(c.volume), closeTime:n(c.closeTime || c.openTime) };
}
function findFirstReversal(bricks, event, maxNewBricks) {
  const expectedA = event.direction === 'LONG' ? 'RED' : 'GREEN';
  const expectedB = event.direction === 'LONG' ? 'GREEN' : 'RED';
  const source = (bricks || []).filter(x => n(x.closeTime) >= event.signalTime);
  let afterCount = 0;
  for (let i = 0; i < source.length; i++) {
    const current = source[i];
    if (n(current.closeTime) > event.signalTime) afterCount++;
    if (afterCount >= maxNewBricks) break; // canlı pusu bu noktada expire olur
    if (i < 1) continue;
    const prev = source[i - 1];
    if (colorOf(prev) !== expectedA || colorOf(current) !== expectedB) continue;
    if (!(n(current.closeTime) > event.signalTime)) continue;
    if (n(prev.closeTime) < event.signalTime) continue;
    return { found:true, previous:prev, confirmation:current, pair:`${expectedA}->${expectedB}`, afterCount };
  }
  return { found:false, pair:`${expectedA}->${expectedB}` };
}
function targetTouched(direction, candle, target) {
  return direction === 'LONG' ? n(candle.high) >= target : n(candle.low) <= target;
}
function movePct(direction, entry, price) {
  return direction === 'LONG' ? ((price - entry) / entry) * 100 : ((entry - price) / entry) * 100;
}
function intrabarPath(candle, direction) {
  return direction === 'LONG'
    ? [candle.open, candle.low, candle.high, candle.close]
    : [candle.open, candle.high, candle.low, candle.close];
}
function replayFromEntry(candles, triggerIndex, direction, entry, cfg = {}) {
  const stopPct = Math.max(0.05, n(cfg.stopPct, 1.5));
  const tpPct = Math.max(0.05, n(cfg.tpPct, 0.4));
  const beTriggerPct = Math.max(0, n(cfg.beTriggerPct, 0.4));
  const beBufferPct = Math.max(0, n(cfg.beBufferPct, 0.12));
  const feePct = Math.max(0, n(cfg.roundTripFeePct, 0.08));
  const maxBars = Math.max(1, Math.floor(n(cfg.maxHoldBars, 32)));
  let stopLevelPct = -stopPct, be = false, peak = -Infinity, trough = Infinity;
  const end = Math.min(candles.length, triggerIndex + maxBars);
  for (let i = triggerIndex; i < end; i++) {
    const c = candles[i];
    for (const px of intrabarPath(c, direction)) {
      const p = movePct(direction, entry, n(px));
      peak = Math.max(peak, p); trough = Math.min(trough, p);
      if (!be && p >= beTriggerPct) { be = true; stopLevelPct = Math.max(stopLevelPct, beBufferPct); }
      if (p <= stopLevelPct) {
        const net = stopLevelPct - feePct;
        return { triggered:true, resolved:true, result: net > 0 ? 'TP' : (Math.abs(net) < 1e-9 ? 'BE' : 'SL'), pnlPct:net, mfePct:Math.max(0,peak), maePct:Math.min(0,trough) };
      }
      if (p >= tpPct) {
        const net = tpPct - feePct;
        return { triggered:true, resolved:true, result:'TP', pnlPct:net, mfePct:Math.max(0,peak), maePct:Math.min(0,trough) };
      }
    }
  }
  const last = candles[Math.max(triggerIndex, end - 1)];
  const mark = movePct(direction, entry, n(last?.close)) - feePct;
  return { triggered:true, resolved:false, result:'UNRESOLVED', pnlPct:mark, mfePct:Math.max(0,peak), maePct:Math.min(0,trough) };
}
function confirmedReplayForSignal(allCandles, event, offsetT, cfg = {}) {
  const warmupMs = Math.max(24, n(cfg.warmupHours, 96)) * 3600000;
  const maxFutureMs = Math.max(6, n(cfg.maxSignalFutureHours, 36)) * 3600000;
  const local = allCandles.filter(c => c.closeTime >= event.signalTime - warmupMs && c.openTime <= event.signalTime + maxFutureMs);
  if (local.length < 30) return { triggered:false, noEntry:true, reason:'CANDLES_INSUFFICIENT' };
  const bricks = core.renkoUret(local, event.boxSize);
  const maxNewBricks = Math.max(2, Math.floor(n(ayarlar.maxPusuBeklemeTugla, 3)));
  const reversal = findFirstReversal(bricks, event, maxNewBricks);
  if (!reversal.found) return { triggered:false, noEntry:true, reason:'CLOSED_15M_REVERSAL_NOT_FOUND' };
  const base = n(reversal.confirmation.close);
  const target = event.direction === 'LONG' ? base + offsetT * event.boxSize : base - offsetT * event.boxSize;
  if (!(target > 0)) return { triggered:false, noEntry:true, reason:'TARGET_INVALID' };

  const afterBricks = bricks.filter(x => n(x.closeTime) > event.signalTime);
  const expiryBrick = afterBricks[maxNewBricks - 1] || null;
  const expiryTime = n(expiryBrick?.closeTime, event.signalTime + maxFutureMs);
  const startTime = n(reversal.confirmation.closeTime);
  let triggerIndex = -1;
  for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    if (c.closeTime < startTime) continue;
    if (c.openTime >= expiryTime) break;
    if (targetTouched(event.direction, c, target)) { triggerIndex = i; break; }
  }
  if (triggerIndex < 0) return { triggered:false, noEntry:true, reason:'TARGET_NOT_REACHED_BEFORE_PUSU_EXPIRY', reversal, target };
  const replay = replayFromEntry(allCandles, triggerIndex, event.direction, target, cfg);
  return { ...replay, reversal, target, triggerTime:allCandles[triggerIndex]?.openTime || null };
}
function directReplayFromEvent(event, offsetT) {
  const key = Number(offsetT).toFixed(2);
  const row = event?.candidates?.[key] || event?.candidates?.[String(Number(offsetT))] || null;
  if (!row || row.triggered !== true) return { triggered:false, noEntry:true, reason:'DIRECT_NO_ENTRY' };
  if (row.resolved !== true) return { triggered:true, resolved:false, pnlPct:n(row.pnlPct), reason:'DIRECT_UNRESOLVED' };
  return { triggered:true, resolved:true, pnlPct:n(row.pnlPct), result:row.result || null };
}
async function downloadBySymbol(events, options = {}) {
  const grouped = new Map();
  for (const e of events) { const a = grouped.get(e.symbol) || []; a.push(e); grouped.set(e.symbol, a); }
  const out = new Map();
  const warmupMs = Math.max(24, n(options.warmupHours, 96)) * 3600000;
  const futureMs = Math.max(24, n(options.maxSignalFutureHours, 36)) * 3600000;
  let idx = 0;
  for (const [symbol, rows] of grouped.entries()) {
    idx++;
    const start = Math.max(0, Math.min(...rows.map(x => x.signalTime)) - warmupMs);
    const end = Math.min(Date.now(), Math.max(...rows.map(x => x.signalTime)) + futureMs);
    console.log(`🧱 [15M BOOTSTRAP ${idx}/${grouped.size}] ${symbol} | Sinyal ${rows.length} | ${new Date(start).toISOString()} → ${new Date(end).toISOString()}`);
    try {
      const candles = (await trainer.downloadKlines(symbol, '15m', start, end, { retries:2 })).map(normalizeCandle).filter(x => x.closeTime > 0 && x.close > 0);
      out.set(symbol, candles);
      console.log(`✅ [15M BOOTSTRAP DATA] ${symbol} | Mum ${candles.length}`);
    } catch (e) {
      console.error(`❌ [15M BOOTSTRAP DATA] ${symbol} | ${e.message || e}`);
      out.set(symbol, []);
    }
    await sleep(Math.max(0, n(options.symbolPauseMs, 120)));
  }
  return out;
}
async function run(options = {}) {
  const historicalState = trainer.load();
  const cfg = {
    stopPct:n(historicalState?.config?.stopPct, ayarlar.sabitStopYuzdesi || 1.5),
    tpPct:n(historicalState?.config?.tpPct, ayarlar.sabitTpYuzdesi || 0.4),
    beTriggerPct:n(historicalState?.config?.beTriggerPct, ayarlar.breakevenTetikYuzde || 0.4),
    beBufferPct:n(historicalState?.config?.beBufferPct, ayarlar.breakevenTamponYuzde || 0.12),
    roundTripFeePct:n(historicalState?.config?.roundTripFeePct, 0.08),
    maxHoldBars:n(historicalState?.config?.maxHoldBars, 32),
    warmupHours:n(options.warmupHours, 96),
    maxSignalFutureHours:n(options.maxSignalFutureHours, 36)
  };
  const events = readEvents(options);
  if (!events.length) throw new Error('NO_HISTORICAL_SIGNALS_IN_SELECTED_WINDOW');
  const data = await downloadBySymbol(events, options);
  const profiles = {};
  let directResolved = 0, confirmedResolved = 0, confirmedNoEntry = 0, unresolved = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i], candles = data.get(event.symbol) || [];
    for (const offsetT of CANDIDATES) {
      const d = directReplayFromEvent(event, offsetT);
      const dk = candidateKey('DIRECT', event, offsetT);
      if (d.triggered && d.resolved) { observeMetric(profiles, dk, { triggered:true, pnlPct:d.pnlPct, at:new Date(event.signalTime).toISOString() }); directResolved++; }
      else if (!d.triggered) observeMetric(profiles, dk, { triggered:false, noEntry:true, at:new Date(event.signalTime).toISOString() });
      else unresolved++;

      const c = confirmedReplayForSignal(candles, event, offsetT, cfg);
      const ck = candidateKey('CONFIRMED', event, offsetT);
      if (c.triggered && c.resolved) { observeMetric(profiles, ck, { triggered:true, pnlPct:c.pnlPct, at:new Date(event.signalTime).toISOString() }); confirmedResolved++; }
      else if (!c.triggered) { observeMetric(profiles, ck, { triggered:false, noEntry:true, at:new Date(event.signalTime).toISOString() }); confirmedNoEntry++; }
      else unresolved++;
    }
    if ((i + 1) % 50 === 0 || i === events.length - 1) console.log(`📚 [15M BOOTSTRAP İLERLEME] ${i + 1}/${events.length} sinyal | Profil ${Object.keys(profiles).length}`);
  }
  const meta = {
    status:'READY', version:VERSION, source:'HISTORICAL_SIGNAL_LEDGER_PLUS_BINANCE_15M',
    timeframeAuthority:'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET', exact1mStModeled:false,
    oneMinuteStPolicy:'NOT_MODELED_IN_BOOTSTRAP__LIVE_ENTRY_STILL_REQUIRES_1M_RENKO_ST',
    lookbackDays:n(options.lookbackDays,60), signals:events.length, symbols:new Set(events.map(x => x.symbol)).size,
    directResolved, confirmedResolved, confirmedNoEntry, unresolved, generatedAt:new Date().toISOString()
  };
  evidence.replaceBootstrap(profiles, meta);
  await evidence.saveNow();
  console.log(`✅ [15M CONFIRMED BOOTSTRAP HAZIR] Sinyal ${meta.signals} | Coin ${meta.symbols} | DIRECT kapanan ${directResolved} | CONFIRMED kapanan ${confirmedResolved} | CONFIRMED no-entry ${confirmedNoEntry} | Profil ${Object.keys(profiles).length}`);
  return { meta, profiles };
}

async function cli() {
  const args = parseArgs();
  if (args.report) {
    console.log(JSON.stringify(evidence.summary(), null, 2));
    return;
  }
  const symbols = String(args.symbols || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  await run({
    lookbackDays:n(args['lookback-days'], 60), symbols,
    warmupHours:n(args['warmup-hours'], 96), maxSignalFutureHours:n(args['future-hours'],36),
    symbolPauseMs:n(args['symbol-pause-ms'],120)
  });
}
if (require.main === module) cli().catch(e => { console.error(`❌ [15M CONFIRMED BOOTSTRAP FATAL] ${e.stack || e.message || e}`); process.exitCode = 1; });

module.exports = { VERSION, readEvents, findFirstReversal, confirmedReplayForSignal, directReplayFromEvent, replayFromEntry, run, _parseArgs:parseArgs };
