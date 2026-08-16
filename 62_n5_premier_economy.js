'use strict';

// AGROS ST2 R26 CORE N5 LIVE ECONOMY
// Tek görevi: exact N5 key için son N kapanış ekonomisini tutmak ve Premier/N5 seçimine kanıt vermek.
// Champion/Reverse/Bottom/Exit/N5 dışı lifecycle deneyleri canlı runtime'dan fiziksel olarak çıkarılmıştır.

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');

const VERSION = 'R26-CORE-N5-LIVE-ECONOMY';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-premier-observation.json');
const TRADES_FILE = path.join(DATA_DIR, 'lab-premier-trades.jsonl');
const TRACK = Object.freeze({ RENKO: 'RENKO_PATTERN_PREMIER', LIVE: 'LAB_LIVE_PROMOTED_PREMIER', SCORE: 'PREMIER_SCORE_RANKED', SHADOW: 'PREMIER_SCORE_REJECTED' });

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function blankBucket() { return { closed:0,tp:0,sl:0,be:0,net:0,grossProfit:0,grossLoss:0,commission:0 }; }
function normalizeEntry(raw = {}, labKey = '') {
  return {
    labKey,
    initialLeague: ['PREMIER','SHADOW'].includes(String(raw.initialLeague || '').toUpperCase()) ? String(raw.initialLeague).toUpperCase() : null,
    currentLeague: ['PREMIER','SHADOW'].includes(String(raw.currentLeague || '').toUpperCase()) ? String(raw.currentLeague).toUpperCase() : null,
    previousLeague: ['PREMIER','SHADOW'].includes(String(raw.previousLeague || '').toUpperCase()) ? String(raw.previousLeague).toUpperCase() : null,
    recentTrades: Array.isArray(raw.recentTrades) ? raw.recentTrades.slice(0, 50) : [],
    promotedAt: raw.promotedAt || null,
    demotedAt: raw.demotedAt || null,
    promotionCount: num(raw.promotionCount),
    demotionCount: num(raw.demotionCount),
    lastTransition: raw.lastTransition || null,
    lastReview: raw.lastReview || null,
    updatedAt: raw.updatedAt || null
  };
}
function normalizeState(raw = {}) {
  const state = raw && typeof raw === 'object' ? { ...raw } : {};
  state.version = VERSION;
  state.lastTrades = Array.isArray(state.lastTrades) ? state.lastTrades.slice(0, 150) : [];
  state.liveLeagueByLab = state.liveLeagueByLab && typeof state.liveLeagueByLab === 'object' ? { ...state.liveLeagueByLab } : {};
  for (const [key, value] of Object.entries(state.liveLeagueByLab)) state.liveLeagueByLab[key] = normalizeEntry(value, key);
  state.leagueTransitions = Array.isArray(state.leagueTransitions) ? state.leagueTransitions.slice(0, 2000) : [];
  state.recentClosedIds = Array.isArray(state.recentClosedIds) ? state.recentClosedIds.slice(0, 2000) : [];
  return state;
}
function readState() { ensureDir(); return normalizeState(io.readJsonBounded(STATE_FILE, {}, { maxBytes: 24 * 1024 * 1024 })); }
function writeState(state) { ensureDir(); const out = normalizeState(state); io.writeJsonAtomic(STATE_FILE, out); return out; }
function appendTrade(row) { ensureDir(); fs.appendFileSync(TRADES_FILE, `${JSON.stringify(row)}\n`); }
function liveLeagueThresholds() {
  return {
    enabled: ayarlar.n5CanliEkonomiAktif !== false,
    minClosed: Math.max(1, num(ayarlar.n5MinKapanis, 5)),
    minPf: num(ayarlar.n5MinPF, 1),
    minNet: num(ayarlar.n5MinNet, 0),
    minExpectancy: num(ayarlar.n5MinExpectancy, 0)
  };
}
function tradeOutcome(trade = {}) {
  const explicit = String(trade.outcome || trade.sonuc || '').toUpperCase();
  if (['TP','SL','BE'].includes(explicit)) return explicit;
  const net = num(trade.net ?? trade.netKarZarar);
  return Math.abs(net) <= 1e-9 ? 'BE' : (net > 0 ? 'TP' : 'SL');
}
function metricsFromTrades(trades = []) {
  const b = blankBucket();
  for (const t of trades) {
    const net = num(t.net ?? t.netKarZarar); const commission = Math.max(0, num(t.commission ?? t.komisyon));
    const outcome = tradeOutcome(t); b.closed++; b.net += net; b.commission += commission;
    if (net > 0) b.grossProfit += net; else if (net < 0) b.grossLoss += Math.abs(net);
    if (outcome === 'TP') b.tp++; else if (outcome === 'SL') b.sl++; else b.be++;
  }
  const decided = b.tp + b.sl;
  return { ...b, net:round(b.net), commission:round(b.commission), grossProfit:round(b.grossProfit), grossLoss:round(b.grossLoss), winRate:decided ? b.tp/decided*100 : 0, profitFactor:b.grossLoss>0 ? b.grossProfit/b.grossLoss : (b.grossProfit>0 ? 999 : 0), expectancy:b.closed ? b.net/b.closed : 0 };
}
function baseLeagueFromTrack(track = '') { return ['RENKO_PATTERN_PREMIER','LAB_LIVE_PROMOTED_PREMIER','PREMIER_SCORE_RANKED'].includes(String(track).toUpperCase()) ? 'PREMIER' : 'SHADOW'; }
function recentLabTrades(state, labKey, limit = 50) {
  const direct = state?.liveLeagueByLab?.[labKey]?.recentTrades;
  const source = Array.isArray(direct) && direct.length ? direct : (Array.isArray(state?.lastTrades) ? state.lastTrades : []);
  return source.filter(t => hierarchy.labKey(t?.labKey) === labKey && t?.reverseExecution !== true).slice(0, limit);
}
function liveLeagueReview(labKeyValue, state = null, baseTrack = '') {
  const labKey = hierarchy.labKey(labKeyValue); const s = state || readState(); const thresholds = liveLeagueThresholds();
  const entry = normalizeEntry(s?.liveLeagueByLab?.[labKey] || {}, labKey); const trades = recentLabTrades(s, labKey, 50); const m = metricsFromTrades(trades.slice(0, thresholds.minClosed));
  const complete = thresholds.enabled && Boolean(labKey) && trades.length >= thresholds.minClosed;
  const positive = complete && m.net > thresholds.minNet && m.profitFactor > thresholds.minPf && m.expectancy > thresholds.minExpectancy;
  const initialLeague = entry.initialLeague || baseLeagueFromTrack(baseTrack);
  const currentLeague = complete ? (positive ? 'PREMIER' : 'SHADOW') : (entry.currentLeague || initialLeague);
  return { version:VERSION, labKey, complete, currentLeague, previousLeague:entry.previousLeague, promoted:complete&&currentLeague==='PREMIER', demoted:complete&&currentLeague==='SHADOW', isLivePremier:complete&&currentLeague==='PREMIER', isLiveShadow:complete&&currentLeague==='SHADOW', reason:!complete ? `LAB_LIVE_N${thresholds.minClosed}_BEKLENIYOR` : (positive ? 'LAB_LIVE_N5_PREMIER_CONDITION' : 'LAB_LIVE_N5_SHADOW_CONDITION'), metrics:m, thresholds, reviewedAt:new Date().toISOString() };
}
function evaluate(pos, { realMode = false } = {}) {
  const labKey = hierarchy.labKey(pos?.labIdentityKey || pos?.blackboxAcilis?.strategySignature?.labKey || pos?.blackboxAcilis?.strategySignature?.key || '');
  const gate = pos?.girisAnalizi?.historicalEntryGate || null;
  const basePremierTrack = gate?.allow === true ? TRACK.RENKO : TRACK.SHADOW;
  const liveLeagueReviewValue = liveLeagueReview(labKey, null, basePremierTrack);
  return {
    version:VERSION, at:new Date().toISOString(), symbol:pos?.sym||'', side:pos?.yon||'', labKey,
    familyDnaId:pos?.dnaId||null, familyDnaLabel:pos?.dnaLabel||'DNA #YOK',
    labDnaId:pos?.labDnaId||null, labDnaLabel:pos?.labDnaLabel||'LAB #YOK',
    fullDnaId:pos?.fullDnaId||null, fullDnaLabel:pos?.fullDnaLabel||'FULL #YOK',
    labLeague:basePremierTrack===TRACK.RENKO?'PREMIER':'DEVELOPMENT', premierTrack:basePremierTrack,
    basePremierTrack, proofLevel:basePremierTrack===TRACK.RENKO?'RENKO_PATTERN_PREMIER':'PREMIER_SCORE_PENDING',
    upperLayerIncluded:basePremierTrack===TRACK.RENKO, liveLeagueReview:liveLeagueReviewValue,
    realTradingAuthorized:false, allowed:!realMode, reasons:realMode?['FINAL_PREMIER_SCORE_REQUIRED']:[]
  };
}
function updateLiveLeagueState(state, trade) {
  const labKey = hierarchy.labKey(trade?.labKey); if (!labKey) return null;
  const entry = normalizeEntry(state.liveLeagueByLab?.[labKey] || {}, labKey);
  const tradeId = String(trade.tradeId || `${trade.symbol||''}|${trade.side||''}|${trade.closedAt||''}`);
  entry.recentTrades = [trade, ...entry.recentTrades.filter(x => String(x?.tradeId || '') !== tradeId)].slice(0, 50);
  entry.initialLeague = entry.initialLeague || baseLeagueFromTrack(trade.premierTrack);
  const tmp = { ...state, liveLeagueByLab:{ ...(state.liveLeagueByLab||{}), [labKey]:entry } };
  const review = liveLeagueReview(labKey, tmp, trade.premierTrack); const previous = entry.currentLeague || entry.initialLeague; const next = review.complete ? review.currentLeague : previous;
  let transition = null;
  if (review.complete && previous && previous !== next) {
    transition = { version:VERSION, transitionId:`${labKey}|${tradeId}|${next}`, at:trade.closedAt||new Date().toISOString(), labKey, previousLeague:previous, newLeague:next, type:previous==='SHADOW'&&next==='PREMIER'?'SHADOW_TO_PREMIER':'PREMIER_TO_SHADOW', reason:next==='PREMIER'?'LAB_LIVE_N5_POSITIVE_ECONOMY':'LAB_LIVE_N5_NEGATIVE_ECONOMY', metrics:review.metrics, thresholds:review.thresholds, triggerTradeId:tradeId };
    entry.previousLeague = previous; entry.currentLeague = next; entry.lastTransition = transition;
    if (next==='PREMIER') { entry.promotedAt=transition.at; entry.promotionCount++; } else { entry.demotedAt=transition.at; entry.demotionCount++; }
    state.leagueTransitions = [transition, ...(state.leagueTransitions||[]).filter(x=>x?.transitionId!==transition.transitionId)].slice(0,2000);
  } else if (!entry.currentLeague) entry.currentLeague = next;
  entry.lastReview = { at:trade.closedAt||new Date().toISOString(), complete:review.complete, currentLeague:next, reason:review.reason, metrics:review.metrics, thresholds:review.thresholds };
  entry.updatedAt = trade.closedAt || new Date().toISOString(); state.liveLeagueByLab = { ...(state.liveLeagueByLab||{}), [labKey]:entry };
  return { entry, review:{...review,currentLeague:next}, transition };
}
function close(pos, result = {}) {
  if (!pos || pos.sanal !== false || pos.manualExternalClose === true || pos.scientificLearningExcluded === true) return null;
  const labKey = hierarchy.labKey(pos?.labPremierDecision?.labKey || pos?.labIdentityKey || ''); if (!labKey) return null;
  const state = readState(); const closeId = String(result.closeId || pos.closeId || pos.tradeId || pos.borsaOrderId || `${pos.sym}|${pos.yon}|${pos.acilisZamani}`);
  if (state.recentClosedIds.includes(closeId)) return null;
  const trade = { version:VERSION, tradeId:closeId, openedAt:pos.acilisZamani?new Date(pos.acilisZamani).toISOString():null, closedAt:new Date().toISOString(), symbol:pos.sym||'', side:pos.yon||'', labKey, labDnaId:pos.labDnaId||null, labDnaLabel:pos.labDnaLabel||'LAB #YOK', premierTrack:pos.premierTrackAtOpen||pos?.labPremierDecision?.premierTrack||TRACK.SHADOW, outcome:tradeOutcome(result), net:round(result.net??result.netKarZarar), commission:round(Math.max(0,num(result.commission??result.komisyon))), reverseExecution:false };
  state.recentClosedIds = [closeId, ...state.recentClosedIds].slice(0,2000); state.lastTrades = [trade, ...state.lastTrades].slice(0,150);
  const update = updateLiveLeagueState(state, trade); if (update?.transition) trade.liveLeagueTransition = update.transition;
  state.updatedAt = trade.closedAt; writeState(state); appendTrade(trade); return trade;
}
function snapshot(labKey='') { const state=readState(); return { version:VERSION, labKey:hierarchy.labKey(labKey), review:liveLeagueReview(labKey,state), updatedAt:state.updatedAt||null }; }

module.exports = { VERSION, TRACK, STATE_FILE, TRADES_FILE, readState, writeState, liveLeagueThresholds, liveLeagueReview, recentLabTrades, updateLiveLeagueState, evaluate, close, snapshot, baseLeagueFromTrack, tradeOutcome };
