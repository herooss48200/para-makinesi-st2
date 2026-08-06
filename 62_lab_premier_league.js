/**
 * AGROS ST1 v5.4.0 — SCIENTIFIC PREMIER AUDIT
 *
 * - Historical-positive LABs are the only main Premier upper-ledger authority.
 * - Bottom Premier LONG/SHORT are independent experiment ledgers with their own performance accounting.
 * - Systematic losing LABs may execute only as a single reversed virtual position in a separate ledger.
 * - Premier, Bottom and Reverse positions freeze the latest eligible LAB Exit at opening.
 * - Stop and BE/BE+ profiles evolve independently per track and affect only new positions.
 * - Open-position Exit/Stop/BE assignments are immutable; real-order authority remains fail-closed.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');
const labChampion = require('./61_lab_champion_engine.js');
const evidenceEngine = require('./63_universal_evidence_engine.js');
const accountingContinuity = require('./65_accounting_continuity.js');
const labLifecycle = require('./68_lab_lifecycle_evolution.js');

const VERSION = 'v6.8.2-LAB-LIFECYCLE-PERSISTENT-TRANSITIONS';
const PROCESS_STARTED_AT = new Date().toISOString();
const PROCESS_STARTED_AT_MS = Date.now();
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-premier-observation.json');
const MODEL_FILE = path.join(DATA_DIR, 'lab-premier-league-model.json');
const TRADES_FILE = path.join(DATA_DIR, 'lab-premier-trades.jsonl');
let cachedLeagueModel = null;
let cachedLeagueAt = 0;

const TRACK = Object.freeze({
  HISTORICAL: 'HISTORICAL_POSITIVE',
  RECENT5: 'RECENT5_PROVISIONAL',
  REVERSE: 'REVERSE_PREMIER',
  REVERSE_SHADOW: 'REVERSE_SHADOW',
  BOTTOM_LONG: 'BOTTOM_PREMIER_LONG',
  BOTTOM_SHORT: 'BOTTOM_PREMIER_SHORT',
  LAB: 'LAB_LEAGUE',
  LIVE: 'LAB_LIVE_PROMOTED_PREMIER',
  SHADOW: 'HISTORICAL_CONTEXT_SHADOW',
  RENKO: 'RENKO_PATTERN_PREMIER',
  SCORE: 'PREMIER_SCORE_RANKED'
});

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function signed(v, digits = 2) { const n = num(v); return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`; }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function blankBucket() { return { opened: 0, active: 0, closed: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0, commission: 0 }; }
function addBucket(target, source = {}) {
  for (const key of Object.keys(blankBucket())) target[key] = num(target[key]) + num(source[key]);
  return target;
}
function blankState() {
  return {
    version: VERSION,
    experimentId: ayarlar.labPremierExperimentId || 'LAB-PREMIER-DYNAMIC-LEAGUE-2026-07-21',
    startedAt: new Date().toISOString(), aggregate: blankBucket(), byLab: {}, lastTrades: [],
    liveLeagueByLab: {}, leagueTransitions: [], recentClosedIds: [],
    reverseAudit: { evaluated: 0, bound: 0, opened: 0, identityMismatch: 0, last: [] }, updatedAt: null
  };
}
function baseLeagueFromTrack(track) {
  return [TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE, TRACK.SCORE].includes(String(track || '').toUpperCase()) ? 'PREMIER' : 'SHADOW';
}
function normalizeLiveLeagueEntry(raw = {}, labKey = '') {
  return {
    labKey,
    initialLeague: ['PREMIER', 'SHADOW'].includes(String(raw.initialLeague || '').toUpperCase()) ? String(raw.initialLeague).toUpperCase() : null,
    currentLeague: ['PREMIER', 'SHADOW'].includes(String(raw.currentLeague || '').toUpperCase()) ? String(raw.currentLeague).toUpperCase() : null,
    previousLeague: ['PREMIER', 'SHADOW'].includes(String(raw.previousLeague || '').toUpperCase()) ? String(raw.previousLeague).toUpperCase() : null,
    recentTrades: Array.isArray(raw.recentTrades) ? raw.recentTrades.slice(0, 50) : [],
    promotedAt: raw.promotedAt || null, demotedAt: raw.demotedAt || null,
    promotionCount: num(raw.promotionCount), demotionCount: num(raw.demotionCount),
    lastTransition: raw.lastTransition || null, lastReview: raw.lastReview || null, updatedAt: raw.updatedAt || null
  };
}
function normalizeState(raw) {
  const out = { ...blankState(), ...(raw || {}) };
  out.aggregate = { ...blankBucket(), ...(raw?.aggregate || {}) };
  out.byLab = raw?.byLab && typeof raw.byLab === 'object' ? raw.byLab : {};
  // v5.0.x kalıcı defteri kaybolmaz; eski proof etiketi yeni üçlü Premier yoluna taşınır.
  for (const row of Object.values(out.byLab)) {
    if (!row) continue;
    if (!row.premierTrack) {
      const proof = String(row.currentProofLevel || row.proofLevelAtFirstOpen || '').toUpperCase();
      row.premierTrack = proof.includes('RECENT5') ? TRACK.RECENT5 : TRACK.HISTORICAL;
    }
    row.bucket = { ...blankBucket(), ...(row.bucket || {}) };
    row.exitChangeCount = num(row.exitChangeCount);
  }
  out.lastTrades = Array.isArray(raw?.lastTrades) ? raw.lastTrades.slice(0, 150) : [];
  out.liveLeagueByLab = raw?.liveLeagueByLab && typeof raw.liveLeagueByLab === 'object' ? raw.liveLeagueByLab : {};
  for (const [key, value] of Object.entries(out.liveLeagueByLab)) out.liveLeagueByLab[key] = normalizeLiveLeagueEntry(value, key);
  // Eski ortak lastTrades yapısından LAB bazlı pencereye kayıpsız geçiş.
  for (const trade of out.lastTrades) {
    if (trade?.reverseExecution) continue;
    const key = hierarchy.labKey(trade?.labKey);
    if (!key) continue;
    const entry = out.liveLeagueByLab[key] || normalizeLiveLeagueEntry({}, key);
    if (!entry.recentTrades.some(x => String(x?.tradeId || '') && String(x.tradeId) === String(trade?.tradeId || ''))) entry.recentTrades.push(trade);
    entry.recentTrades = entry.recentTrades.slice(0, 50);
    entry.initialLeague = entry.initialLeague || baseLeagueFromTrack(trade?.premierTrack);
    out.liveLeagueByLab[key] = entry;
  }
  out.leagueTransitions = Array.isArray(raw?.leagueTransitions) ? raw.leagueTransitions.slice(0, 2000) : [];
  out.recentClosedIds = Array.isArray(raw?.recentClosedIds) ? raw.recentClosedIds.slice(0, 2000) : [];
  out.reverseAudit = { evaluated: 0, bound: 0, opened: 0, identityMismatch: 0, last: [], ...(raw?.reverseAudit || {}) };
  out.reverseAudit.last = Array.isArray(out.reverseAudit.last) ? out.reverseAudit.last.slice(0, 50) : [];
  // v5.3 ters işlemleri yanlışlıkla ana aggregate'e yazılmış olabilir.
  const historicalAggregate = blankBucket();
  for (const row of Object.values(out.byLab)) {
    if ([TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE, TRACK.SCORE].includes(row?.premierTrack)) addBucket(historicalAggregate, row.bucket || {});
  }
  if (Object.values(out.byLab).some(row => row?.premierTrack)) out.aggregate = historicalAggregate;
  return out;
}
function readState() { ensureDir(); return normalizeState(io.readJsonBounded(STATE_FILE, null, { maxBytes: 24 * 1024 * 1024 })); }
function writeState(state) { ensureDir(); const out = normalizeState({ ...state, version: VERSION }); io.writeJsonAtomic(STATE_FILE, out); return out; }
function appendTrade(row) { ensureDir(); fs.appendFileSync(TRADES_FILE, `${JSON.stringify(row)}\n`); }
function recordReverseStage(stage, detail = {}) {
  const state = readState();
  const raw = String(stage || ''); const keyMap = { evaluated: 'evaluated', bound: 'bound', opened: 'opened', identitymismatch: 'identityMismatch' };
  const key = keyMap[raw.toLowerCase()] || raw;
  if (Object.prototype.hasOwnProperty.call(state.reverseAudit, key)) state.reverseAudit[key] = num(state.reverseAudit[key]) + 1;
  state.reverseAudit.last = [{ at: new Date().toISOString(), stage: String(stage || '').toUpperCase(), ...detail }, ...(state.reverseAudit.last || [])].slice(0, 50);
  writeState(state); return state.reverseAudit;
}
function metrics(bucket = {}) {
  const closed = num(bucket.closed); const grossLoss = num(bucket.grossLoss); const grossProfit = num(bucket.grossProfit);
  const decided = num(bucket.tp) + num(bucket.sl);
  return {
    ...blankBucket(), ...bucket,
    opened: num(bucket.opened), active: num(bucket.active), closed,
    tp: num(bucket.tp), sl: num(bucket.sl), be: num(bucket.be),
    net: round(bucket.net), commission: round(bucket.commission), grossProfit: round(grossProfit), grossLoss: round(grossLoss),
    winRate: decided ? (num(bucket.tp) / decided) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0),
    expectancy: closed ? num(bucket.net) / closed : 0
  };
}
function liveLeagueThresholds() {
  return {
    enabled: ayarlar.labCanliLigAktif !== false,
    minClosed: Math.max(1, num(ayarlar.labCanliLigMinKapanis, num(ayarlar.labChampionForwardMinKapanis, 5))),
    minPf: num(ayarlar.labCanliLigMinPF, num(ayarlar.labChampionForwardMinPF, 1)),
    minNet: num(ayarlar.labCanliLigMinNet, num(ayarlar.labChampionForwardMinNet, 0)),
    minExpectancy: num(ayarlar.labCanliLigMinExpectancy, num(ayarlar.labChampionForwardMinExpectancy, 0))
  };
}
function tradeOutcome(trade = {}) {
  const explicit = String(trade?.outcome || trade?.sonuc || '').toUpperCase();
  if (['TP', 'SL', 'BE'].includes(explicit)) return explicit;
  const net = num(trade?.net ?? trade?.netKarZarar);
  if (Math.abs(net) <= 0.000001) return 'BE';
  return net > 0 ? 'TP' : 'SL';
}
function liveBucketFromTrades(trades = []) {
  const bucket = blankBucket();
  for (const trade of trades) {
    const net = num(trade?.net ?? trade?.netKarZarar); const commission = Math.max(0, num(trade?.commission ?? trade?.komisyon));
    const outcome = tradeOutcome(trade);
    bucket.closed++; bucket.net += net; bucket.commission += commission;
    if (net > 0) bucket.grossProfit += net; else if (net < 0) bucket.grossLoss += Math.abs(net);
    if (outcome === 'TP') bucket.tp++; else if (outcome === 'BE') bucket.be++; else bucket.sl++;
  }
  return bucket;
}
function recentLabTrades(state, labKey, limit = 50) {
  const direct = state?.liveLeagueByLab?.[labKey]?.recentTrades;
  const source = Array.isArray(direct) && direct.length ? direct : (Array.isArray(state?.lastTrades) ? state.lastTrades : []);
  return source.filter(x => hierarchy.labKey(x?.labKey) === labKey && !x?.reverseExecution && String(x?.premierTrack || '').toUpperCase() !== TRACK.REVERSE).slice(0, limit);
}
function liveLeagueReview(labKeyValue, state = null, baseTrack = '') {
  const labKey = hierarchy.labKey(labKeyValue); const currentState = state || readState();
  const thresholds = liveLeagueThresholds(); const entry = currentState?.liveLeagueByLab?.[labKey] || normalizeLiveLeagueEntry({}, labKey);
  const trades = recentLabTrades(currentState, labKey, thresholds.minClosed);
  const m = metrics(liveBucketFromTrades(trades));
  const complete = thresholds.enabled && Boolean(labKey) && trades.length >= thresholds.minClosed;
  const positive = complete && m.net > thresholds.minNet && m.profitFactor > thresholds.minPf && m.expectancy > thresholds.minExpectancy;
  const initialLeague = entry.initialLeague || baseLeagueFromTrack(baseTrack || currentState?.byLab?.[labKey]?.premierTrack);
  const computedLeague = complete ? (positive ? 'PREMIER' : 'SHADOW') : (entry.currentLeague || initialLeague);
  return {
    version: VERSION, labKey, complete, currentLeague: computedLeague, previousLeague: entry.previousLeague || null,
    promoted: complete && computedLeague === 'PREMIER', demoted: complete && computedLeague === 'SHADOW',
    isLivePremier: complete && computedLeague === 'PREMIER', isLiveShadow: complete && computedLeague === 'SHADOW',
    reason: !complete ? `LAB_LIVE_N${thresholds.minClosed}_BEKLENIYOR` : (positive ? 'LAB_LIVE_N5_PREMIER_CONDITION' : 'LAB_LIVE_N5_SHADOW_CONDITION'),
    metrics: m, thresholds, tradeIds: trades.map(x => x.tradeId || '').filter(Boolean), reviewedAt: new Date().toISOString(),
    lastTransition: entry.lastTransition || null, promotionCount: num(entry.promotionCount), demotionCount: num(entry.demotionCount),
    promotedAt: entry.promotedAt || null, demotedAt: entry.demotedAt || null
  };
}
function updateLiveLeagueState(state, trade) {
  if (!trade || trade.reverseExecution) return null;
  const labKey = hierarchy.labKey(trade.labKey); if (!labKey) return null;
  const entry = normalizeLiveLeagueEntry(state.liveLeagueByLab?.[labKey] || {}, labKey);
  const tradeId = String(trade.tradeId || `${trade.symbol || ''}|${trade.side || ''}|${trade.closedAt || ''}`);
  entry.recentTrades = [trade, ...entry.recentTrades.filter(x => String(x?.tradeId || `${x?.symbol || ''}|${x?.side || ''}|${x?.closedAt || ''}`) !== tradeId)].slice(0, 50);
  entry.initialLeague = entry.initialLeague || baseLeagueFromTrack(trade.premierTrack);
  const tempState = { ...state, liveLeagueByLab: { ...(state.liveLeagueByLab || {}), [labKey]: entry } };
  const review = liveLeagueReview(labKey, tempState, trade.premierTrack);
  const previousLeague = entry.currentLeague || entry.initialLeague;
  const nextLeague = review.complete ? review.currentLeague : previousLeague;
  let transition = null;
  if (review.complete && previousLeague && nextLeague !== previousLeague) {
    transition = {
      version: VERSION, transitionId: `${labKey}|${tradeId}|${nextLeague}`, at: trade.closedAt || new Date().toISOString(), labKey,
      previousLeague, newLeague: nextLeague,
      type: previousLeague === 'SHADOW' && nextLeague === 'PREMIER' ? 'SHADOW_TO_PREMIER' : 'PREMIER_TO_SHADOW',
      reason: nextLeague === 'PREMIER' ? 'LAB_LIVE_N5_POSITIVE_ECONOMY' : 'LAB_LIVE_N5_POSITIVE_GATE_LOST',
      metrics: review.metrics, thresholds: review.thresholds, triggerTradeId: tradeId
    };
    entry.previousLeague = previousLeague; entry.currentLeague = nextLeague; entry.lastTransition = transition;
    if (nextLeague === 'PREMIER') { entry.promotedAt = transition.at; entry.promotionCount++; }
    else { entry.demotedAt = transition.at; entry.demotionCount++; }
    state.leagueTransitions = [transition, ...(state.leagueTransitions || []).filter(x => x?.transitionId !== transition.transitionId)].slice(0, 2000);
  } else if (!entry.currentLeague) entry.currentLeague = nextLeague;
  entry.lastReview = { at: trade.closedAt || new Date().toISOString(), complete: review.complete, currentLeague: nextLeague, reason: review.reason, metrics: review.metrics, thresholds: review.thresholds };
  entry.updatedAt = trade.closedAt || new Date().toISOString();
  state.liveLeagueByLab = { ...(state.liveLeagueByLab || {}), [labKey]: entry };
  return { entry, review: { ...review, currentLeague: nextLeague }, transition };
}
function oppositeSide(side) { return String(side || '').toUpperCase() === 'SHORT' ? 'LONG' : 'SHORT'; }
function invertBits(bits) { return String(bits || '').replace(/[01]/g, bit => bit === '1' ? '0' : '1'); }
function reverseLabKey(rawKey) {
  const f = hierarchy.keyFields(rawKey);
  if (!f.yon || !f.btc || !f.coin) return '';
  return hierarchy.labKey(`YON=${oppositeSide(f.yon)}|BTC=${invertBits(f.btc)}|COIN=${invertBits(f.coin)}|BB=${f.bb || 'YOK'}`);
}
function ownPositiveExit(row) { return Boolean(row?.exit?.positive && row?.exit?.ownLabExit && row?.exit?.algorithmId); }
function evidenceFor(row) {
  return row?.evidence || evidenceEngine.evaluate({
    strategyType: 'LAB_DNA', strategyKey: row?.labKey || '', historical: row?.historical || {},
    recent: row?.recent5 || {}, exit: row?.exit || {}, live: row?.forward?.metrics || {}
  });
}
function reversePremierReady(row) {
  const h = row?.historical || {};
  const hasWinRateEvidence = Object.prototype.hasOwnProperty.call(h, 'winRate') && Number.isFinite(Number(h.winRate));
  return hasWinRateEvidence && ayarlar.labReversePremierAktif !== false
    && num(h.total) >= Math.max(1, num(ayarlar.labReverseMinOrnek, 10))
    && num(h.winRate) <= num(ayarlar.labReverseMaxBasari, 35)
    && num(h.net) < num(ayarlar.labReverseMaxNet, 0)
    && num(h.profitFactor) < num(ayarlar.labReverseMaxPF, 1);
}
function reverseShadowReady(row) {
  const h = row?.historical || {};
  const hasWinRateEvidence = Object.prototype.hasOwnProperty.call(h, 'winRate') && Number.isFinite(Number(h.winRate));
  const min = Math.max(1, num(ayarlar.labReverseShadowMinOrnek, 5));
  const mature = Math.max(min, num(ayarlar.labReverseMinOrnek, 10));
  return hasWinRateEvidence && ayarlar.labReversePremierAktif !== false
    && num(h.total) >= min && num(h.total) < mature
    && num(h.winRate) <= num(ayarlar.labReverseMaxBasari, 35)
    && num(h.net) < num(ayarlar.labReverseMaxNet, 0)
    && num(h.profitFactor) < num(ayarlar.labReverseMaxPF, 1);
}
function bottomPremierReady(row) {
  const h = row?.historical || {};
  const side = hierarchy.keyFields(row?.labKey).yon;
  return ayarlar.labBottomPremierAktif !== false && ['LONG', 'SHORT'].includes(side)
    && num(h.total) >= Math.max(1, num(ayarlar.labBottomPremierMinOrnek, 5))
    && num(h.net) < num(ayarlar.labBottomPremierMaxNet, 0)
    && num(h.profitFactor) < num(ayarlar.labBottomPremierMaxPF, 1)
    && num(h.expectancy, h.total ? num(h.net) / num(h.total) : 0) < num(ayarlar.labBottomPremierMaxExpectancy, 0);
}
function bottomSort(a, b) {
  const ae = num(a.historical?.expectancy, num(a.historical?.total) ? num(a.historical?.net) / num(a.historical?.total) : 0);
  const be = num(b.historical?.expectancy, num(b.historical?.total) ? num(b.historical?.net) / num(b.historical?.total) : 0);
  return ae - be || num(a.historical?.net) - num(b.historical?.net) || num(b.historical?.total) - num(a.historical?.total);
}
function nearProfitReady(row) {
  const h = row?.historical || {};
  const n = num(h.total); const min = Math.max(1, num(ayarlar.evidenceWarmStartMinHistorical, 5));
  const gates = [num(h.net) > 0, num(h.profitFactor) > 1, num(h.expectancy) > 0];
  if (n === min - 1 && gates.every(Boolean)) return true;
  return n >= min && gates.filter(Boolean).length === 2;
}

function championTier(row) {
  const evidence = evidenceFor(row);
  if (row?.bottomTrack === TRACK.BOTTOM_LONG || row?.bottomTrack === TRACK.BOTTOM_SHORT) {
    const ownExitReady = ownPositiveExit(row) && ayarlar.labBottomPremierOwnExitAktif !== false;
    return {
      league: 'EXPERIMENT', premierTrack: row.bottomTrack, upperLayerIncluded: false, observationEligible: true,
      proofLevel: ownExitReady ? 'BOTTOM_PREMIER_OWN_EXIT' : 'BOTTOM_PREMIER_FALLBACK', evidence,
      entryProven: true, exitValidated: ownExitReady, safeFallback: !ownExitReady, reverseExecution: false,
      reason: ownExitReady ? 'En kötü yön liginde kendi LAB Exit + bağımsız Stop/BE testi' : 'En kötü yön liginde mevcut kademe fallback + bağımsız Stop/BE testi'
    };
  }
  const historicalReady = Boolean(row?.labKey && evidence.entryHistoricalEligible);
  const recentReady = false; // v5.3.0: Son-5 lig yolu tamamen kaldırıldı
  const reverseReady = Boolean(row?.labKey && !historicalReady && !recentReady && reversePremierReady(row));
  const reverseShadow = Boolean(row?.labKey && !historicalReady && !recentReady && !reverseReady && reverseShadowReady(row));
  const ownExitReady = ownPositiveExit(row);
  const forwardVerified = Boolean(row?.forward?.eligible);
  const fallbackEnabled = ayarlar.labPremierEntryProvenFallbackAktif !== false;
  const testEnabled = ayarlar.labPremierTarihselTestAktif !== false;
  const forwardRequired = ayarlar.labPremierIleriDogrulamaZorunlu === true;

  if (testEnabled && historicalReady && (!forwardRequired || forwardVerified) && (ownExitReady || fallbackEnabled)) {
    return {
      league: 'PREMIER', premierTrack: TRACK.HISTORICAL, upperLayerIncluded: true,
      proofLevel: forwardVerified && ownExitReady
        ? 'FORWARD_VERIFIED'
        : (ownExitReady
          ? (row?.warmStartCandidate === true && row?.historicalCandidate !== true ? 'WARM_START_VERIFIED' : 'HISTORICAL_POSITIVE_EXIT_TEST')
          : 'HISTORICAL_ENTRY_PROVEN_FALLBACK'),
      evidence, entryProven: true, exitValidated: ownExitReady, safeFallback: !ownExitReady,
      reverseExecution: false,
      reason: ownExitReady ? 'Tarihsel LAB ekonomisi pozitif + kendi LAB Exit doğrulanmış' : 'Tarihsel LAB ekonomisi pozitif; kendi Exit oluşana kadar kademe fallback'
    };
  }
  if (testEnabled && recentReady && (ownExitReady || fallbackEnabled)) {
    return {
      league: 'CHAMPIONSHIP', premierTrack: TRACK.RECENT5, upperLayerIncluded: false,
      proofLevel: ownExitReady ? 'RECENT5_SEPARATE_SHADOW' : 'RECENT5_SHADOW_FALLBACK',
      evidence, entryProven: true, exitValidated: ownExitReady, safeFallback: !ownExitReady,
      reverseExecution: false,
      reason: ownExitReady ? 'Son-5 form adayı; Premier kasasından ayrı gölge defterinde kendi LAB Exit ile ölçülür' : 'Son-5 form adayı; Premier kasasından ayrı gölge defterinde mevcut kademe ile ölçülür'
    };
  }
  if (testEnabled && reverseReady && fallbackEnabled) {
    return {
      league: 'EXPERIMENT', premierTrack: TRACK.REVERSE, upperLayerIncluded: false,
      proofLevel: 'REVERSE_SEPARATE_LEDGER_TEST', evidence, entryProven: true,
      exitValidated: false, safeFallback: true, reverseExecution: true,
      executionSide: oppositeSide(hierarchy.keyFields(row.labKey).yon), reverseTargetKey: reverseLabKey(row.labKey),
      reason: 'Orijinal LAB sistematik kaybeden; yalnız ters yönde ayrı bilimsel defter testi'
    };
  }
  if (reverseShadow) {
    return {
      league: 'CHAMPIONSHIP', premierTrack: TRACK.REVERSE_SHADOW, upperLayerIncluded: false,
      proofLevel: 'REVERSE_SHADOW_LEARNING', evidence, entryProven: false,
      exitValidated: false, safeFallback: false, reverseExecution: false,
      reason: 'N5–9 ters yön adayı; olgunlaşana kadar LAB gölgesinde'
    };
  }
  return {
    league: 'DEVELOPMENT', premierTrack: TRACK.LAB, upperLayerIncluded: false,
    proofLevel: nearProfitReady(row) ? 'NEAR_PROFIT_RACE' : 'LEARNING', evidence,
    entryProven: false, exitValidated: false, safeFallback: false, reverseExecution: false,
    reason: nearProfitReady(row) ? 'Premier şartlarından yalnız birine/tek örneğe uzak' : 'LAB ekonomisi henüz Premier kanıtı üretmedi'
  };
}
function rowFromChampion(row) {
  const tier = championTier(row);
  let reverseIdentity = null;
  if (tier.reverseExecution && tier.reverseTargetKey) reverseIdentity = hierarchy.ensureLab(tier.reverseTargetKey, { source: 'LAB_REVERSE_PREMIER_TARGET' });
  return {
    ...row,
    labLeague: tier.league, premierTrack: tier.premierTrack, upperLayerIncluded: tier.upperLayerIncluded,
    proofLevel: tier.proofLevel, admissionReason: tier.reason, evidence: tier.evidence,
    entryProven: Boolean(tier.entryProven), exitValidated: Boolean(tier.exitValidated), safeExitFallback: Boolean(tier.safeFallback),
    observationEligible: Boolean(tier.observationEligible || tier.upperLayerIncluded || tier.premierTrack === TRACK.REVERSE),
    reverseExecution: Boolean(tier.reverseExecution), executionSide: tier.executionSide || hierarchy.keyFields(row?.labKey).yon,
    reverseTargetKey: tier.reverseTargetKey || '',
    reverseTargetLabDnaId: reverseIdentity?.id || null, reverseTargetLabDnaLabel: reverseIdentity?.label || '',
    realTradingAuthorized: false, sizeMultiplier: tier.upperLayerIncluded ? 1 : 0
  };
}
function sortRows(rows) {
  return rows.sort((a, b) => num(b.historical?.net) - num(a.historical?.net) || num(b.historical?.total) - num(a.historical?.total));
}
function build({ catalogue = null, persist = true, force = false } = {}) {
  const cacheMs = Math.max(1000, num(ayarlar.labPremierModelCacheMs, 30000));
  if (!catalogue && !force && cachedLeagueModel && (Date.now() - cachedLeagueAt) < cacheMs) return cachedLeagueModel;
  const source = catalogue || labChampion.build({ persist: false });
  const rawRows = source?.allLabRows || [...(source?.labChampions || []), ...(source?.evidenceCandidates || [])];
  const unique = [...new Map(rawRows.filter(x => x?.labKey).map(row => [row.labKey, row])).values()];
  const baseRows = unique.map(rowFromChampion);
  const capacity = Math.max(1, num(ayarlar.labBottomPremierKapasiteYon, 10));
  const bottomLongKeys = new Set(baseRows.filter(x => x.premierTrack === TRACK.LAB && bottomPremierReady(x) && hierarchy.keyFields(x.labKey).yon === 'LONG').sort(bottomSort).slice(0, capacity).map(x => x.labKey));
  const bottomShortKeys = new Set(baseRows.filter(x => x.premierTrack === TRACK.LAB && bottomPremierReady(x) && hierarchy.keyFields(x.labKey).yon === 'SHORT').sort(bottomSort).slice(0, capacity).map(x => x.labKey));
  const rows = baseRows.map(row => {
    if (bottomLongKeys.has(row.labKey)) row.bottomTrack = TRACK.BOTTOM_LONG;
    else if (bottomShortKeys.has(row.labKey)) row.bottomTrack = TRACK.BOTTOM_SHORT;
    return row.bottomTrack ? rowFromChampion(row) : row;
  });
  const historicalPremier = sortRows(rows.filter(x => x.premierTrack === TRACK.HISTORICAL));
  const recent5Premier = sortRows(rows.filter(x => x.premierTrack === TRACK.RECENT5));
  const reversePremier = rows.filter(x => x.premierTrack === TRACK.REVERSE)
    .sort((a, b) => num(a.historical?.winRate) - num(b.historical?.winRate) || num(a.historical?.net) - num(b.historical?.net));
  const reverseShadow = rows.filter(x => x.premierTrack === TRACK.REVERSE_SHADOW)
    .sort((a, b) => num(a.historical?.winRate) - num(b.historical?.winRate));
  const bottomLong = rows.filter(x => x.premierTrack === TRACK.BOTTOM_LONG).sort(bottomSort);
  const bottomShort = rows.filter(x => x.premierTrack === TRACK.BOTTOM_SHORT).sort(bottomSort);
  const premier = [...historicalPremier];
  const labLeague = rows.filter(x => x.premierTrack === TRACK.LAB || x.premierTrack === TRACK.REVERSE_SHADOW);
  const nearProfit = labLeague.filter(nearProfitReady)
    .sort((a, b) => num(b.historical?.total) - num(a.historical?.total) || num(b.historical?.net) - num(a.historical?.net));
  const exitValidated = premier.filter(x => x.exitValidated);
  const entryFallback = premier.filter(x => x.safeExitFallback);
  const verified = historicalPremier.filter(x => x.proofLevel === 'FORWARD_VERIFIED');
  const model = {
    version: VERSION, generatedAt: new Date().toISOString(),
    experimentId: ayarlar.labPremierExperimentId || 'LAB-PREMIER-DYNAMIC-LEAGUE-2026-07-21',
    authority: 'LAB_DNA_ONLY', familyRole: 'PERMANENT_MARKET_MEMORY_NO_ORDER_AUTHORITY', realTradingAuthorized: false,
    historicalChampionCount: rows.length,
    premierCount: premier.length, historicalPositiveCount: historicalPremier.length,
    recent5ProvisionalCount: 0, reversePremierCount: reversePremier.length,
    reverseShadowCount: reverseShadow.length, bottomLongCount: bottomLong.length, bottomShortCount: bottomShort.length, labLeagueCount: labLeague.length,
    nearProfitCount: nearProfit.length, championshipCount: labLeague.length,
    forwardVerifiedCount: verified.length, exitValidatedCount: exitValidated.length, entryFallbackCount: entryFallback.length,
    historicalEntryFallbackCount: historicalPremier.filter(x => x.safeExitFallback).length,
    recent5EntryFallbackCount: recent5Premier.filter(x => x.safeExitFallback).length,
    historicalTestCount: historicalPremier.filter(x => x.proofLevel === 'HISTORICAL_POSITIVE_EXIT_TEST').length,
    warmStartCount: historicalPremier.filter(x => x.exitValidated).length,
    historicalPremier, recent5Premier: [], reversePremier, reverseShadow, bottomLong, bottomShort, nearProfit,
    premier, championship: labLeague, labLeague, allCandidates: rows,
    policy: {
      familyOrderAuthority: false, labPremierOrderAuthority: true, championshipOrderAuthority: false,
      historicalPositiveAdmission: 'N>=5 && Net>0 && PF>1 && Exp>0',
      recent5Admission: 'DISABLED_REMOVED_v5.3.0',
      reversePremierAdmission: 'N>=10 && WR<=35 && Net<0 && PF<1; ayrı defterde execution side reversed',
      bottomPremierAdmission: 'Yön başına en kötü ilk 10; N>=5, Net<0, PF<1, Exp<0; ana Premier kasasından tamamen ayrı',
      dynamicPromotionDemotion: true, learningMemoryReset: false, equalVirtualSize: true,
      universalEvidenceEngine: true, warmStartEnabled: ayarlar.evidenceWarmStartAktif !== false,
      recent5PositiveAdmissionEnabled: false, recent5SeparateShadowLedger: false, confidenceIsRankingOnly: true,
      premierSizeMultiplier: 1, championshipSizeMultiplier: 0,
      entryProvenFallbackEnabled: ayarlar.labPremierEntryProvenFallbackAktif !== false,
      ownLabExitRequiredForVirtualPremierAdmission: false, ownLabExitRequiredForRealTrading: true,
      fallbackExitAlgorithmId: 'ACTUAL', openPositionExitImmutable: true, newPositionGetsLatestExit: true,
      secondOrderCreated: false, realTradingAuthorized: false
    }
  };
  if (!catalogue) { cachedLeagueModel = model; cachedLeagueAt = Date.now(); }
  if (persist) { ensureDir(); io.writeJsonAtomic(MODEL_FILE, model); }
  return model;
}
function identityFor(pos) { return hierarchy.decoratePosition(pos, { source: 'LAB_PREMIER_DECISION' }); }
function tierWithLiveReview(baseTier, row, liveReview) {
  if (liveReview?.demoted) {
    return {
      league: 'DEVELOPMENT', premierTrack: TRACK.SHADOW, upperLayerIncluded: false, observationEligible: true,
      proofLevel: 'LAB_LIVE_N5_DEMOTED_TO_SHADOW', evidence: { liveLeagueReview: liveReview },
      entryProven: false, exitValidated: false, safeFallback: false, reverseExecution: false,
      reason: `Son ${liveReview.thresholds.minClosed} canlı LAB kapanışı pozitif ekonomi kapısını kaybetti; yeni işlemler Shadow`
    };
  }
  if (liveReview?.promoted) {
    const ownExitReady = ownPositiveExit(row);
    return {
      league: 'PREMIER', premierTrack: TRACK.LIVE, upperLayerIncluded: true, observationEligible: true,
      proofLevel: 'LAB_LIVE_N5_PROMOTED_PREMIER', evidence: { liveLeagueReview: liveReview },
      entryProven: true, exitValidated: ownExitReady, safeFallback: !ownExitReady, reverseExecution: false,
      reason: `Son ${liveReview.thresholds.minClosed} canlı LAB kapanışı pozitif ekonomi üretti; sonraki işlemler Premier`
    };
  }
  return baseTier;
}
function evaluate(pos, { model = null, realMode = false } = {}) {
  const identities = identityFor(pos); const leagueModel = model || build({ persist: false });
  const labKey = identities?.lab?.key || ''; const row = leagueModel.allCandidates.find(x => x.labKey === labKey) || null;
  const baseTier = row ? championTier(row) : championTier(null);
  const liveReview = liveLeagueReview(labKey, null, baseTier.premierTrack);
  const tier = tierWithLiveReview(baseTier, row, liveReview);
  const reverseExecution = Boolean(!realMode && row && tier.reverseExecution);
  const upperLayerIncluded = Boolean(!realMode && row && tier.upperLayerIncluded);
  const reasons = [];
  if (!identities?.lab) reasons.push('LAB_KIMLIGI_YOK');
  if (!row) reasons.push('LAB_KATALOGDA_YOK');
  if (row && !tier.upperLayerIncluded) reasons.push(tier.proofLevel);
  if (realMode) reasons.push('LAB_PREMIER_GERCEK_EMIR_YETKISI_KAPALI');
  const decision = {
    version: VERSION, at: new Date().toISOString(), symbol: pos?.sym || '', side: pos?.yon || '',
    sourceSignalSide: pos?.yon || '', executionSide: reverseExecution ? tier.executionSide : (pos?.yon || ''), reverseExecution,
    sourceLabDnaId: reverseExecution ? identities?.lab?.id || null : null,
    sourceLabDnaLabel: reverseExecution ? identities?.lab?.label || 'LAB #YOK' : null,
    sourceLabKey: reverseExecution ? labKey : null,
    reverseTargetKey: reverseExecution ? tier.reverseTargetKey : null,
    familyDnaId: identities?.family?.id || null, familyDnaLabel: identities?.family?.label || 'DNA #YOK', familyKey: identities?.family?.key || '',
    labDnaId: identities?.lab?.id || null, labDnaLabel: identities?.lab?.label || 'LAB #YOK', labKey,
    fullDnaId: identities?.full?.id || null, fullDnaLabel: identities?.full?.label || 'FULL #YOK', fullKey: identities?.full?.key || '',
    labLeague: row ? tier.league : 'DEVELOPMENT', premierTrack: row ? tier.premierTrack : TRACK.LAB,
    proofLevel: row ? tier.proofLevel : 'LEARNING', admissionReason: row ? tier.reason : 'LAB giriş kanıtı oluşmadı',
    entryProven: Boolean(row && tier.entryProven), exitValidated: Boolean(row && tier.exitValidated), safeExitFallback: Boolean(row && tier.safeFallback),
    upperLayerIncluded, observationEligible: Boolean(tier.observationEligible || upperLayerIncluded || tier.premierTrack === TRACK.REVERSE), virtualShadowOnly: !upperLayerIncluded, sizeMultiplier: upperLayerIncluded ? 1 : 0,
    historical: row?.historical || null, recent5: row?.recent5 || null, evidence: row?.evidence || null, forward: row?.forward || null, liveLeagueReview: liveReview, basePremierTrack: baseTier.premierTrack,
    exit: reverseExecution ? null : (row?.exit || null), realTradingAuthorized: false, allowed: !realMode, reasons
  };
  pos.labPremierDecision = decision;
  if (decision.reverseExecution) recordReverseStage('evaluated', { symbol: decision.symbol, sourceLabKey: decision.sourceLabKey, targetLabKey: decision.reverseTargetKey });
  return decision;
}
function bindReverseExecution(pos, sourceDecision, { model = null } = {}) {
  if (!pos || !sourceDecision?.reverseExecution) return sourceDecision;
  const identities = identityFor(pos); const actualKey = identities?.lab?.key || '';
  if (!actualKey || actualKey !== sourceDecision.reverseTargetKey) {
    recordReverseStage('identityMismatch', { actualKey, expectedKey: sourceDecision.reverseTargetKey, symbol: pos?.sym || '' });
    const err = new Error(`REVERSE_LAB_IDENTITY_MISMATCH:${actualKey}:${sourceDecision.reverseTargetKey}`); err.code = 'REVERSE_LAB_IDENTITY_MISMATCH'; throw err;
  }
  const leagueModel = model || build({ persist: false });
  const targetRow = leagueModel.allCandidates.find(x => x.labKey === actualKey) || null;
  const targetExitReady = ownPositiveExit(targetRow);
  const forwardVerified = Boolean(targetRow?.forward?.eligible && targetExitReady);
  const decision = {
    ...sourceDecision, at: new Date().toISOString(), side: pos.yon, executionSide: pos.yon,
    familyDnaId: identities.family?.id || null, familyDnaLabel: identities.family?.label || 'DNA #YOK', familyKey: identities.family?.key || '',
    labDnaId: identities.lab?.id || null, labDnaLabel: identities.lab?.label || 'LAB #YOK', labKey: actualKey,
    fullDnaId: identities.full?.id || null, fullDnaLabel: identities.full?.label || 'FULL #YOK', fullKey: identities.full?.key || '',
    premierTrack: TRACK.REVERSE, labLeague: 'EXPERIMENT', upperLayerIncluded: false, observationEligible: true, virtualShadowOnly: true, sizeMultiplier: 0,
    proofLevel: forwardVerified ? 'REVERSE_FORWARD_VERIFIED' : (targetExitReady ? 'REVERSE_PREMIER_OWN_EXIT' : 'REVERSE_PREMIER_FALLBACK'),
    exitValidated: targetExitReady, safeExitFallback: !targetExitReady, exit: targetRow?.exit || null,
    reverseSourceHistorical: sourceDecision.historical || null,
    executionHistorical: targetRow?.historical || null, executionForward: targetRow?.forward || null,
    admissionReason: targetExitReady
      ? `${sourceDecision.sourceLabDnaLabel} sistematik kaybeden → ${identities.lab.label} ters yön + kendi Exit`
      : `${sourceDecision.sourceLabDnaLabel} sistematik kaybeden → ${identities.lab.label} ters yön; kendi Exit oluşana kadar fallback`,
    realTradingAuthorized: false
  };
  pos.labPremierDecision = decision;
  recordReverseStage('bound', { symbol: pos?.sym || '', sourceLabKey: decision.sourceLabKey, targetLabKey: decision.labKey });
  return decision;
}
function frozenExit(decision) {
  const experimental = [TRACK.REVERSE, TRACK.BOTTOM_LONG, TRACK.BOTTOM_SHORT].includes(decision?.premierTrack);
  if (!decision?.upperLayerIncluded && !experimental) return null;
  const exit = decision?.exit; const assignedAt = decision.at || new Date().toISOString();
  const ownExitReady = Boolean(decision.exitValidated !== false && exit?.positive && exit?.ownLabExit && exit?.algorithmId);
  const algorithmId = ownExitReady ? exit.algorithmId : 'ACTUAL';
  const assignmentId = `${decision.premierTrack}|${decision.labDnaLabel}|${decision.labKey}|${algorithmId}|${assignedAt}`;
  if (!ownExitReady) {
    const entryProven = decision?.entryProven === true;
    const experimentalScope = decision.premierTrack === TRACK.REVERSE
      ? 'LAB_REVERSE_PREMIER_FALLBACK'
      : ([TRACK.BOTTOM_LONG, TRACK.BOTTOM_SHORT].includes(decision.premierTrack) ? 'LAB_BOTTOM_PREMIER_FALLBACK' : null);
    return {
      ready: false, algorithmId: 'ACTUAL', label: 'Mevcut Kademe Sistemi',
      scope: experimentalScope || (entryProven ? 'LAB_PREMIER_ENTRY_PROVEN_FALLBACK' : 'PREMIER_SCORE_EXIT_FALLBACK'),
      selectionQuality: entryProven ? 'ENTRY_PROVEN_EXIT_PENDING' : 'ENTRY_REPLAY_N0_EXIT_PENDING',
      executionPolicy: 'CURRENT_LADDER_FALLBACK', samples: 0, beatRate: 0,
      profitFactor: 0, netUsdt: 0,
      reason: entryProven
        ? 'Giriş kanıtlı; kendi LAB Exit doğrulanana kadar güvenli mevcut kademe'
        : 'Entry Replay kanıtı yok; kendi LAB Exit doğrulanana kadar güvenli mevcut kademe',
      activeForPosition: false, assignmentId, assignedAt, immutable: true, source: 'LAB_PREMIER_SAFE_FALLBACK'
    };
  }
  return {
    ready: true, algorithmId: exit.algorithmId, label: exit.algorithmLabel, scope: decision.premierTrack === TRACK.REVERSE ? 'LAB_REVERSE_PREMIER_OWN_EXIT' : ([TRACK.BOTTOM_LONG, TRACK.BOTTOM_SHORT].includes(decision.premierTrack) ? 'LAB_BOTTOM_PREMIER_OWN_EXIT' : 'LAB_PREMIER_OWN_EXIT'),
    selectionQuality: 'POSITIVE_CONFIRMED', executionPolicy: 'LAB_PREMIER_VALIDATED_OWN_EXIT_VIRTUAL_ACTIVE',
    samples: num(exit.samples), beatRate: num(exit.beatRate), profitFactor: num(exit.profitFactor), netUsdt: num(exit.netUsdt),
    reason: 'Yeni pozisyon için güncel LAB Exit donduruldu', activeForPosition: true,
    assignmentId, assignedAt, immutable: true, source: 'LAB_PREMIER'
  };
}
function applyToPosition(pos, decision = null) {
  if (!pos) return null; const d = decision || evaluate(pos, { realMode: pos.sanal === false });
  pos.labPremierDecision = d; pos.leagueShadowOnly = !d.upperLayerIncluded; pos.virtualAccountIncluded = d.upperLayerIncluded;
  pos.labLeagueAtOpen = d.labLeague; pos.labProofLevelAtOpen = d.proofLevel; pos.premierTrackAtOpen = d.premierTrack;
  const entryAssignment = pos?.renkoEntryAssignment || pos?.entryReplayAssignment || {};
  const entrySamples = num(entryAssignment.samples, num(entryAssignment.sampleCount));
  if (entrySamples > 0 || entryAssignment.proven === true || entryAssignment.learned === true) d.entryProven = true;
  const frozen = frozenExit(d);
  if (frozen) {
    pos.executionExitAssignment = frozen;
    pos.exitPlanShadow = {
      version: VERSION, createdAt: frozen.assignedAt, ready: Boolean(frozen.ready), selectedAlgorithmId: frozen.algorithmId,
      selectedAlgorithmLabel: frozen.label, samples: frozen.samples, beatRate: frozen.beatRate, profitFactor: frozen.profitFactor,
      netUsdt: frozen.netUsdt, selectionScope: frozen.scope, selectionQuality: frozen.selectionQuality, reason: frozen.reason,
      assignmentId: frozen.assignmentId, signature: `${d.labKey}|DETAIL=LAB_PREMIER`, currentRegime: d.exit?.currentRegime || null
    };
    pos.exitPlanActiveForVirtual = Boolean(frozen.ready && frozen.activeForPosition);
  } else if (pos.sanal) pos.exitPlanActiveForVirtual = Boolean(pos.executionExitAssignment?.activeForPosition);
  return d;
}
function bucketKeyFor(decision) {
  if (decision?.premierTrack === TRACK.REVERSE) return `REVERSE|${decision.sourceLabKey || 'YOK'}|${decision.labKey || 'YOK'}`;
  if ([TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE, TRACK.SCORE, TRACK.SHADOW].includes(decision?.premierTrack)) return `${decision.premierTrack}|${decision.labKey || 'LAB-YOK'}`;
  if (decision?.premierTrack === TRACK.BOTTOM_LONG || decision?.premierTrack === TRACK.BOTTOM_SHORT) {
    return `${decision.premierTrack}|${decision.labKey || 'LAB-YOK'}`;
  }
  return decision?.labKey || 'LAB-YOK';
}
function updateExitHistory(row, decision) {
  const nextId = decision.exitValidated ? (decision.exit?.algorithmId || 'ACTUAL') : 'ACTUAL';
  const nextLabel = decision.exitValidated ? (decision.exit?.algorithmLabel || 'Mevcut Kademe Sistemi') : 'Mevcut Kademe Sistemi';
  const previousId = row.exitAlgorithmId || 'ACTUAL';
  if (row.bucket?.opened > 0 && previousId !== nextId) {
    row.previousExitAlgorithmId = previousId; row.previousExitAlgorithmLabel = row.exitAlgorithmLabel || 'Mevcut Kademe Sistemi';
    row.exitChangeCount = num(row.exitChangeCount) + 1; row.lastExitChangedAt = new Date().toISOString();
  }
  row.exitAlgorithmId = nextId; row.exitAlgorithmLabel = nextLabel;
}
function ensureLabBucket(state, decision) {
  const key = bucketKeyFor(decision);
  if (!state.byLab[key]) state.byLab[key] = {
    bucketKey: key, labDnaId: decision.labDnaId, labDnaLabel: decision.labDnaLabel, labKey: decision.labKey,
    familyDnaLabel: decision.familyDnaLabel, premierTrack: decision.premierTrack, proofLevelAtFirstOpen: decision.proofLevel,
    sourceLabDnaLabel: decision.sourceLabDnaLabel || null, reverseSourceLabKey: decision.sourceLabKey || null,
    exitAlgorithmId: 'ACTUAL', exitAlgorithmLabel: 'Mevcut Kademe Sistemi', previousExitAlgorithmId: null,
    previousExitAlgorithmLabel: null, exitChangeCount: 0, lastExitChangedAt: null, bucket: blankBucket(), lastUpdatedAt: null
  };
  const row = state.byLab[key];
  row.labDnaId = decision.labDnaId; row.labDnaLabel = decision.labDnaLabel; row.labKey = decision.labKey;
  row.familyDnaLabel = decision.familyDnaLabel; row.premierTrack = decision.premierTrack; row.currentProofLevel = decision.proofLevel;
  row.sourceLabDnaLabel = decision.sourceLabDnaLabel || row.sourceLabDnaLabel || null;
  row.reverseSourceLabKey = decision.sourceLabKey || row.reverseSourceLabKey || null;
  updateExitHistory(row, decision); return row;
}
function anaPremierTrack(track) {
  return [TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE, TRACK.SCORE].includes(String(track || ''));
}
function snapshot(pos) {
  if (!pos || ayarlar.labPremierAktif === false) return null;
  const decision = pos.labPremierDecision || applyToPosition(pos); if (!decision?.observationEligible && !decision?.upperLayerIncluded) return null;
  const observation = {
    version: VERSION, openedAt: new Date().toISOString(), symbol: pos.sym || '', side: pos.yon || '',
    sourceSignalSide: decision.sourceSignalSide || pos.yon || '', reverseExecution: Boolean(decision.reverseExecution),
    sourceLabDnaLabel: decision.sourceLabDnaLabel || null, sourceLabKey: decision.sourceLabKey || null,
    labDnaId: decision.labDnaId, labDnaLabel: decision.labDnaLabel, labKey: decision.labKey,
    familyDnaLabel: decision.familyDnaLabel, proofLevel: decision.proofLevel, premierTrack: decision.premierTrack, labLeague: decision.labLeague || 'DEVELOPMENT',
    exitAlgorithmId: decision.exitValidated ? (decision.exit?.algorithmId || 'ACTUAL') : 'ACTUAL',
    exitAlgorithmLabel: decision.exitValidated ? (decision.exit?.algorithmLabel || 'Mevcut Kademe Sistemi') : 'Mevcut Kademe Sistemi',
    exitAssignmentId: pos.executionExitAssignment?.assignmentId || null,
    upperLayerIncluded: Boolean(decision.upperLayerIncluded), observationPool: decision.premierTrack === TRACK.REVERSE ? 'REVERSE_SEPARATE_LEDGER' : 'PREMIER', samePosition: true, secondOrderCreated: false, realTradingAuthorized: Boolean(pos.sanal === false && decision.realTradingAuthorized === true)
  };
  pos.labPremierObservation = observation;
  const state = readState(); if (decision.upperLayerIncluded && anaPremierTrack(decision.premierTrack)) { state.aggregate.opened++; state.aggregate.active++; }
  if (decision.premierTrack === TRACK.REVERSE) { state.reverseAudit.opened = num(state.reverseAudit.opened) + 1; state.reverseAudit.last = [{ at: observation.openedAt, stage: 'OPENED', symbol: pos.sym || '', sourceLabKey: decision.sourceLabKey, targetLabKey: decision.labKey }, ...(state.reverseAudit.last || [])].slice(0, 50); }
  const row = ensureLabBucket(state, decision); row.bucket.opened++; row.bucket.active++; row.lastUpdatedAt = observation.openedAt;
  state.updatedAt = observation.openedAt; writeState(state); return observation;
}
function outcomeFrom(result = {}) {
  const explicit = String(result.outcome || result.sonuc || '').toUpperCase(); if (['TP', 'SL', 'BE'].includes(explicit)) return explicit;
  const net = num(result.net ?? result.netKarZarar); if (Math.abs(net) <= 0.000001) return 'BE'; return net > 0 ? 'TP' : 'SL';
}
function applyClosed(bucket, net, commission, outcome) {
  bucket.active = Math.max(0, num(bucket.active) - 1); bucket.closed++; bucket.net += net; bucket.commission += Math.max(0, commission);
  if (net > 0) bucket.grossProfit += net; else if (net < 0) bucket.grossLoss += Math.abs(net);
  if (outcome === 'TP') bucket.tp++; else if (outcome === 'BE') bucket.be++; else bucket.sl++;
}
function close(pos, result = {}) {
  let observation = pos?.labPremierObservation;
  // v5.6.9: Açılış kararı Premier olduğu halde eski/restart kaydında snapshot eksikse
  // kapanışı sessizce kaybetme. Açılışta dondurulan kimlikten kanonik gözlem üret.
  if (!observation) {
    const d = pos?.labPremierDecision || null;
    const track = String(d?.premierTrack || pos?.premierTrackAtOpen || '').toUpperCase();
    const isMainPremier = d?.upperLayerIncluded === true && anaPremierTrack(track);
    if (!isMainPremier) return null;
    observation = {
      version: VERSION, openedAt: pos?.acilisZamani ? new Date(pos.acilisZamani).toISOString() : new Date().toISOString(),
      symbol: pos?.sym || '', side: pos?.yon || '', sourceSignalSide: d?.sourceSignalSide || pos?.yon || '',
      reverseExecution: false, sourceLabDnaLabel: d?.sourceLabDnaLabel || null, sourceLabKey: d?.sourceLabKey || null,
      labDnaId: d?.labDnaId, labDnaLabel: d?.labDnaLabel, labKey: d?.labKey, familyDnaLabel: d?.familyDnaLabel,
      proofLevel: d?.proofLevel || pos?.labProofLevelAtOpen || 'FORWARD', premierTrack: track, labLeague: d?.labLeague || pos?.labLeagueAtOpen || 'PREMIER',
      exitAlgorithmId: pos?.executionExitAssignment?.algorithmId || 'ACTUAL',
      exitAlgorithmLabel: pos?.executionExitAssignment?.label || 'Mevcut Kademe Sistemi',
      exitAssignmentId: pos?.executionExitAssignment?.assignmentId || null, upperLayerIncluded: true,
      observationPool: 'PREMIER', samePosition: true, secondOrderCreated: false, realTradingAuthorized: false, recoveredAtClose: true
    };
    pos.labPremierObservation = observation;
  }
  const net = num(result.net ?? result.netKarZarar); const commission = Math.max(0, num(result.commission ?? result.komisyon));
  const outcome = outcomeFrom(result); const closedAt = new Date().toISOString(); const state = readState();
  const closeId = String(pos?.closeId || result?.closeId || pos?.tradeId || pos?.sanalOrderId || `${observation.symbol}|${observation.side}|${observation.openedAt}`);
  state.recentClosedIds = Array.isArray(state.recentClosedIds) ? state.recentClosedIds : [];
  if (state.recentClosedIds.includes(closeId)) return null;
  if (observation.upperLayerIncluded && anaPremierTrack(observation.premierTrack)) applyClosed(state.aggregate, net, commission, outcome);
  const decision = pos.labPremierDecision || {
    labKey: observation.labKey, labDnaId: observation.labDnaId, labDnaLabel: observation.labDnaLabel,
    familyDnaLabel: observation.familyDnaLabel, proofLevel: observation.proofLevel, premierTrack: observation.premierTrack,
    sourceLabDnaLabel: observation.sourceLabDnaLabel, sourceLabKey: observation.sourceLabKey,
    exitValidated: observation.exitAlgorithmId !== 'ACTUAL',
    exit: { algorithmId: observation.exitAlgorithmId, algorithmLabel: observation.exitAlgorithmLabel }
  };
  const row = ensureLabBucket(state, decision); applyClosed(row.bucket, net, commission, outcome); row.lastUpdatedAt = closedAt;
  const trade = {
    version: VERSION, openedAt: observation.openedAt, closedAt, tradeId: pos.sanalOrderId || pos.tradeId || '',
    symbol: pos.sym || observation.symbol, side: pos.yon || observation.side, sourceSignalSide: observation.sourceSignalSide,
    reverseExecution: Boolean(observation.reverseExecution), sourceLabDnaLabel: observation.sourceLabDnaLabel,
    labDnaId: observation.labDnaId, labDnaLabel: observation.labDnaLabel, labKey: observation.labKey,
    familyDnaLabel: observation.familyDnaLabel, premierTrack: observation.premierTrack, proofLevel: observation.proofLevel,
    exitAlgorithmId: observation.exitAlgorithmId, exitAlgorithmLabel: observation.exitAlgorithmLabel,
    outcome, net: round(net), commission: round(commission), upperLayerIncluded: Boolean(observation.upperLayerIncluded), observationPool: observation.observationPool || (observation.premierTrack === TRACK.REVERSE ? 'REVERSE_SEPARATE_LEDGER' : 'PREMIER'), samePosition: true, secondOrderCreated: false, realTradingAuthorized: false
  };
  state.recentClosedIds = [closeId, ...state.recentClosedIds].slice(0, 2000);
  state.lastTrades = [trade, ...state.lastTrades].slice(0, 150);
  const liveLeagueUpdate = updateLiveLeagueState(state, trade);
  if (liveLeagueUpdate?.transition) trade.liveLeagueTransition = liveLeagueUpdate.transition;
  state.updatedAt = closedAt; writeState(state); appendTrade(trade); return trade;
}
function activeRows(activePositions = []) {
  return accountingContinuity.activeBreakdown(activePositions).premierPositions.map(p => ({
    symbol: p.sym || '', side: p.yon || '', labDnaLabel: p.labPremierObservation?.labDnaLabel || '',
    sourceLabDnaLabel: p.labPremierObservation?.sourceLabDnaLabel || '', premierTrack: p.labPremierObservation?.premierTrack || '',
    proofLevel: p.labPremierObservation?.proofLevel || '', exitAlgorithmLabel: p.labPremierObservation?.exitAlgorithmLabel || ''
  }));
}
function premierAccounting(activePositions = [], observationAggregate = {}) {
  const continuity = accountingContinuity.snapshot(activePositions);
  const canonical = continuity?.scientific?.premier || continuity?.canonical?.premier || {};
  const observation = metrics(observationAggregate);
  // Ana Premier sayacı gözlem defterinin yalnız HISTORICAL_POSITIVE aggregate'idir.
  // Continuity katmanı yalnız GAP ayrımı için kullanılır; Reverse/Bottom eski sayaçları ana kasaya sızamaz.
  const opened = observation.opened;
  const closedScientific = observation.closed;
  // Canlı aktif doğruluğunun tek kaynağı mevcut pozisyon listesinden üretilen continuity partition'dır.
  // Observation.active eski/restart dönemlerinden kalan kümülatif açık sayaç taşıyabilir; canlı aktif diye gösterilmez.
  const activeGap = Math.min(opened, num(canonical.activeGap));
  const activeScientific = Math.min(Math.max(0, opened - closedScientific - activeGap), Math.max(0, num(canonical.activeScientific)));
  const closedGap = Math.max(0, opened - closedScientific - activeScientific - activeGap);
  const difference = opened - closedScientific - activeScientific - activeGap - closedGap;
  const observationOpenedDifference = 0; const observationClosedDifference = 0;
  return {
    opened, closedScientific, activeScientific, activeGap, closedGap, difference, reconciled: difference === 0,
    observationOpened: observation.opened, observationClosed: observation.closed, observationActive: observation.active,
    observationOpenedDifference, observationClosedDifference, observationReconciled: true,
    continuityOpened: num(canonical.opened), continuityClosedScientific: num(canonical.closedScientific),
    activeRealPremier: num(continuity?.scientific?.activeRealPremier),
    activeVirtualPremier: num(continuity?.scientific?.activeVirtualPremier),
    equation: `${opened} = ${closedScientific} + ${activeScientific} + ${activeGap} + ${closedGap}`
  };
}

function progressStatus(candidate, live) {
  const m = metrics(live || {}); if (!m.closed) return { icon: '🆕', label: 'YENİ KANIT BEKLİYOR' };
  if (m.net > 0 && m.profitFactor > 1 && m.expectancy > 0) {
    const baseExp = candidate?.premierTrack === TRACK.REVERSE ? 0 : num(candidate?.historical?.expectancy);
    return m.closed >= 3 && m.expectancy >= baseExp ? { icon: '⬆️', label: 'GÜÇLENİYOR' } : { icon: '↗️', label: 'ARTIDA' };
  }
  if (m.net < 0 || m.profitFactor < 1 || m.expectancy < 0) return { icon: '⬇️', label: 'GERİLİYOR' };
  return { icon: '➡️', label: 'KORUNUYOR' };
}
function stateRowForCandidate(stateRows, candidate) {
  if (candidate.premierTrack === TRACK.REVERSE) return stateRows.find(x => x.reverseSourceLabKey === candidate.labKey && x.premierTrack === TRACK.REVERSE) || null;
  return stateRows.find(x => x.labKey === candidate.labKey && x.premierTrack === candidate.premierTrack)
    || stateRows.find(x => x.labKey === candidate.labKey && x.premierTrack !== TRACK.REVERSE) || null;
}
function enrichCandidate(candidate, stateRows, league) {
  const stateRow = stateRowForCandidate(stateRows, candidate); const liveMetrics = metrics(stateRow?.bucket || {});
  let currentExit = candidate.exit;
  if (candidate.premierTrack === TRACK.REVERSE) {
    const target = league.allCandidates.find(x => x.labKey === candidate.reverseTargetKey); currentExit = target?.exit || null;
  }
  const currentExitId = ownPositiveExit({ exit: currentExit }) ? currentExit.algorithmId : 'ACTUAL';
  const storedExitId = stateRow?.exitAlgorithmId || 'ACTUAL';
  const pendingExitChange = Boolean(stateRow && currentExitId !== storedExitId);
  const riskScope = [TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE].includes(candidate.premierTrack) ? 'PREMIER'
    : (candidate.premierTrack === TRACK.REVERSE ? 'REVERSE'
      : (candidate.premierTrack === TRACK.BOTTOM_LONG ? 'BOTTOM_LONG'
        : (candidate.premierTrack === TRACK.BOTTOM_SHORT ? 'BOTTOM_SHORT' : 'LAB')));
  const riskLabKey = candidate.premierTrack === TRACK.REVERSE ? candidate.reverseTargetKey : candidate.labKey;
  const riskProfile = labLifecycle.profileByKey(riskScope, riskLabKey);
  return {
    ...candidate, liveMetrics, progress: progressStatus(candidate, stateRow?.bucket), stateRow,
    currentExit, currentExitId, currentExitLabel: currentExitId === 'ACTUAL' ? 'Mevcut Kademe Sistemi' : currentExit?.algorithmLabel,
    riskProfile, riskScope,
    pendingExitChange, exitChangeCount: num(stateRow?.exitChangeCount), previousExitAlgorithmLabel: stateRow?.previousExitAlgorithmLabel || null
  };
}
function historicalCandidateMetrics(candidates = []) {
  const b = blankBucket();
  for (const row of candidates) {
    const h = row?.historical || {};
    b.opened += num(h.total); b.closed += num(h.total); b.tp += num(h.tp); b.sl += num(h.sl); b.be += num(h.be);
    b.net += num(h.net); b.grossProfit += num(h.grossProfit); b.grossLoss += num(h.grossLoss);
  }
  return metrics(b);
}
function bottomCounterfactual(league) {
  const all = Array.isArray(league?.allCandidates) ? league.allCandidates : [];
  const bottom = [...(league?.bottomLong || []), ...(league?.bottomShort || [])];
  const excluded = new Set(bottom.map(x => x.labKey));
  const baseline = historicalCandidateMetrics(all);
  const withoutBottom = historicalCandidateMetrics(all.filter(x => !excluded.has(x.labKey)));
  const removed = historicalCandidateMetrics(bottom);
  return { baseline, withoutBottom, removed, profitableWithoutBottom: withoutBottom.net > 0 && withoutBottom.profitFactor > 1 && withoutBottom.expectancy > 0 };
}
function groupMetrics(stateRows, track) {
  const b = blankBucket(); for (const row of stateRows.filter(x => x.premierTrack === track)) addBucket(b, row.bucket); return metrics(b);
}
function premierTrackAggregate(stateRows) {
  const b = blankBucket();
  // Exact-context ST2 Renko Premier, ana Premier kasasının ayrılmaz parçasıdır.
  // Eski rapor yalnız HISTORICAL_POSITIVE satırlarını topladığı için RENKO_PATTERN_PREMIER
  // kapanışları defterde durduğu halde ana raporda N0 görünüyordu.
  for (const row of stateRows.filter(x => [TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE].includes(x.premierTrack))) addBucket(b, row.bucket);
  return metrics(b);
}

function summaryModel(activePositions = [], { force = false } = {}) {
  const state = readState(); const league = build({ persist: false, force }); const stateRows = Object.values(state.byLab || {});
  const aggregate = premierTrackAggregate(stateRows);
  const accounting = premierAccounting(activePositions, aggregate);
  const allEnriched = league.allCandidates.map(x => {
    const enriched = enrichCandidate(x, stateRows, league);
    return { ...enriched, liveLeagueReview: liveLeagueReview(x.labKey, state, enriched.premierTrack) };
  });
  const isBasePremier = row => [TRACK.HISTORICAL, TRACK.RENKO, TRACK.LIVE].includes(row?.premierTrack);
  const historicalPremier = allEnriched.filter(x => isBasePremier(x) && x.liveLeagueReview.currentLeague !== 'SHADOW');
  const livePromotedPremier = allEnriched.filter(x => !isBasePremier(x) && x.liveLeagueReview.complete && x.liveLeagueReview.currentLeague === 'PREMIER').map(x => ({
    ...x, labLeague: 'PREMIER', premierTrack: TRACK.LIVE, upperLayerIncluded: true, proofLevel: 'LAB_LIVE_N5_PROMOTED_PREMIER'
  }));
  const liveDemoted = allEnriched.filter(x => isBasePremier(x) && x.liveLeagueReview.complete && x.liveLeagueReview.currentLeague === 'SHADOW');
  const liveConditionPremier = allEnriched.filter(x => x.liveLeagueReview.complete && x.liveLeagueReview.currentLeague === 'PREMIER');
  const liveConditionShadow = allEnriched.filter(x => x.liveLeagueReview.complete && x.liveLeagueReview.currentLeague === 'SHADOW');
  const transitions = Array.isArray(state.leagueTransitions) ? state.leagueTransitions : [];
  const sessionTransitions = transitions.filter(x => Date.parse(x?.at || 0) >= PROCESS_STARTED_AT_MS);
  const sessionPromotions = sessionTransitions.filter(x => x.type === 'SHADOW_TO_PREMIER');
  const sessionDemotions = sessionTransitions.filter(x => x.type === 'PREMIER_TO_SHADOW');
  const effectivePremier = [...new Map([...historicalPremier, ...livePromotedPremier].map(x => [x.labKey, x])).values()];
  const recent5Premier = [];
  const reversePremier = league.reversePremier.map(x => enrichCandidate(x, stateRows, league));
  const bottomLong = league.bottomLong.map(x => enrichCandidate(x, stateRows, league));
  const bottomShort = league.bottomShort.map(x => enrichCandidate(x, stateRows, league));
  return {
    version: VERSION, experimentId: state.experimentId,
    league: { ...league, historicalPremier, livePromotedPremier, liveDemoted,
      livePromotedCount: sessionPromotions.length, liveDemotedCount: sessionDemotions.length,
      sessionPromotions, sessionDemotions, recentTransitions: transitions.slice(0, 10),
      liveConditionPremier, liveConditionShadow, liveConditionPremierCount: liveConditionPremier.length, liveConditionShadowCount: liveConditionShadow.length,
      recent5Premier, reversePremier, bottomLong, bottomShort, premier: effectivePremier },
    aggregate, accounting,
    trackMetrics: {
      historical: groupMetrics(stateRows, TRACK.HISTORICAL), live: groupMetrics(stateRows, TRACK.LIVE), reverse: groupMetrics(stateRows, TRACK.REVERSE),
      bottomLong: groupMetrics(stateRows, TRACK.BOTTOM_LONG), bottomShort: groupMetrics(stateRows, TRACK.BOTTOM_SHORT)
    },
    byLab: stateRows.map(row => ({ ...row, metrics: metrics(row.bucket) })), active: activeRows(activePositions),
    reversePipeline: { candidateLabs: league.reversePremierCount, ...state.reverseAudit },
    bottomCounterfactual: bottomCounterfactual(league),
    lastTrades: state.lastTrades, liveLeagueByLab: state.liveLeagueByLab, leagueTransitions: state.leagueTransitions,
    processStartedAt: PROCESS_STARTED_AT, updatedAt: state.updatedAt
  };
}
function candidateLine(row, { reverse = false } = {}) {
  const h = row.historical || {}; const live = row.liveMetrics || metrics();
  const identity = reverse
    ? `${row.sourceLabDnaLabel || row.labDnaLabel} ${hierarchy.keyFields(row.labKey).yon}→${row.executionSide} ${row.reverseTargetLabDnaLabel || ''}`
    : `${row.labDnaLabel} ${hierarchy.keyFields(row.labKey).yon}`;
  const exitFlag = row.pendingExitChange ? '🔄 yeni işlemde güncellenecek' : (row.exitChangeCount ? `🔄 ${row.exitChangeCount} kez güncellendi` : '');
  const progress = row.progress || { icon: '🆕', label: 'YENİ KANIT BEKLİYOR' };
  const exitLabel = row.currentExitLabel || row.exit?.algorithmLabel || 'Mevcut Kademe Sistemi';
  const risk = row.riskProfile || {};
  const stopPct = num(risk.stopPct, num(ayarlar.sabitStopYuzdesi, 1.5));
  const beTrigger = num(risk.beTriggerPct, num(ayarlar.breakevenTetikYuzde, 0.4));
  const beBuffer = num(risk.beBufferPct, num(ayarlar.breakevenTamponYuzde, 0.12));
  return `${identity} | N${num(h.total)} WR%${num(h.winRate).toFixed(1)} Net${signed(h.net)} | Yeni N${live.closed} Net${signed(live.net)} ${progress.icon} | 🎯 ${exitLabel}${exitFlag ? ` ${exitFlag}` : ''} | 🛡 %${stopPct.toFixed(2)} | ⚖ %${beTrigger.toFixed(2)}/+%${beBuffer.toFixed(2)} N${num(risk.closed)}`;
}
function compactTelegramFromModel(model) {
  const league = { historicalPremier: [], recent5Premier: [], reversePremier: [], bottomLong: [], bottomShort: [], nearProfit: [], premier: [], ...model.league };
  const a = model.aggregate || metrics(); const l = model.accounting || premierAccounting([], a);
  const tracks = model.trackMetrics || {};
  const reverse = tracks.reverse || metrics(); const bottomLong = tracks.bottomLong || metrics(); const bottomShort = tracks.bottomShort || metrics();
  const pipeline = model.reversePipeline || {};
  const cf = model.bottomCounterfactual || bottomCounterfactual(league);
  const topHistorical = league.historicalPremier.slice(0, Math.max(1, num(ayarlar.labPremierCanliTopTarihsel, 6)));
  const changed = league.historicalPremier.filter(x => x.liveMetrics.closed || x.pendingExitChange).slice(0, 3);
  const shown = [...new Map([...changed, ...topHistorical].map(x => [x.labKey, x])).values()].slice(0, 7);
  let text = `━━━━━━━━━━━━━━━━━━\n💰 <b>PREMIER KASA VE PERFORMANS</b>\n━━━━━━━━━━━━━━━━━━\n`;
  text += `📦 Açılan ${l.opened} | Bilimsel aktif ${l.activeScientific} | Bilimsel kapanan ${l.closedScientific}\n`;
  text += `✅ Kârlı/TP ${a.tp} | ❌ Zararlı/SL ${a.sl} | ⚖️ BE ${a.be} | Başarı %${a.winRate.toFixed(2)}\n`;
  text += `💎 Net ${signed(a.net, 4)} | PF ${a.profitFactor >= 999 ? '∞' : a.profitFactor.toFixed(2)} | Exp ${signed(a.expectancy, 4)}\n`;
  text += `🏆 Aktif lig: Tarihsel Premier ${league.historicalPositiveCount || 0} | Kendi Exit ${league.exitValidatedCount || 0} | Fallback ${league.entryFallbackCount || 0}\n`;
  if (shown.length) {
    text += `\n🥇 <b>PREMIER İLERLEME</b>\n`;
    text += shown.map(x => candidateLine(x)).join('\n') + '\n';
  }
  text += `\n🔴 <b>BOTTOM PREMIER LONG</b> — İlk ${league.bottomLongCount || 0} | Kasa N${bottomLong.closed} Net ${signed(bottomLong.net, 4)} | PF ${bottomLong.profitFactor >= 999 ? '∞' : bottomLong.profitFactor.toFixed(2)} | Exp ${signed(bottomLong.expectancy, 4)}\n`;
  if (league.bottomLong.length) text += league.bottomLong.slice(0, 3).map(x => candidateLine(x)).join('\n') + '\n';
  text += `🔴 <b>BOTTOM PREMIER SHORT</b> — İlk ${league.bottomShortCount || 0} | Kasa N${bottomShort.closed} Net ${signed(bottomShort.net, 4)} | PF ${bottomShort.profitFactor >= 999 ? '∞' : bottomShort.profitFactor.toFixed(2)} | Exp ${signed(bottomShort.expectancy, 4)}\n`;
  text += `🧮 <b>EN KÖTÜ LİG OLMASAYDI</b> — Baz N${cf.baseline.closed} Net ${signed(cf.baseline.net, 4)} PF ${cf.baseline.profitFactor >= 999 ? '∞' : cf.baseline.profitFactor.toFixed(2)} → Filtresiz N${cf.withoutBottom.closed} Net ${signed(cf.withoutBottom.net, 4)} PF ${cf.withoutBottom.profitFactor >= 999 ? '∞' : cf.withoutBottom.profitFactor.toFixed(2)} | Δ ${signed(cf.withoutBottom.net - cf.baseline.net, 4)} | ${cf.profitableWithoutBottom ? '✅ KÂRLI OLURDU' : '❌ YİNE KÂRLI DEĞİL'}\n`;
  if (league.bottomShort.length) text += league.bottomShort.slice(0, 3).map(x => candidateLine(x)).join('\n') + '\n';
  text += `\n🔁 <b>TERS İŞLEM DEFTERİ</b> — LAB ${league.reversePremierCount || 0} | Kasa N${reverse.closed} Net ${signed(reverse.net, 4)} | PF ${reverse.profitFactor >= 999 ? '∞' : reverse.profitFactor.toFixed(2)} | Exp ${signed(reverse.expectancy, 4)}\n`;
  text += `Zincir: Karar ${num(pipeline.evaluated)} | Kimlik bağlandı ${num(pipeline.bound)} | Açıldı ${num(pipeline.opened)} | Kimlik hatası ${num(pipeline.identityMismatch)}\n`;
  if (league.reversePremier.length) text += league.reversePremier.slice(0, 3).map(x => candidateLine(x, { reverse: true })).join('\n') + '\n';
  const allExperimental = [...league.bottomLong, ...league.bottomShort, ...league.reversePremier];
  const pendingExit = [...league.premier, ...allExperimental].filter(x => x.pendingExitChange).length;
  const ownExperimentalExit = allExperimental.filter(x => x.exitValidated).length;
  text += `\n🎯 <b>EXIT / STOP / BE</b>\n`;
  text += `Premier kendi Exit ${league.exitValidatedCount || 0} | Deney kendi Exit ${ownExperimentalExit} | Yeni işlemde Exit değişecek ${pendingExit}\n`;
  text += `🛡 Stop ve ⚖ BE profilleri lig/LAB bazında; ilk N${Math.max(5, num(ayarlar.labLifecycleMinKapanis, 5))}, her ${Math.max(1, num(ayarlar.labLifecycleYenidenHesaplamaAdimi, 5))} kapanışta yeniden hesaplanır.\n`;
  text += `\n🔎 <b>DENETİM / MUTABAKAT</b>\n`;
  text += `🛡️ Restart-GAP: Aktif ${l.activeGap} | Kapanan ${l.closedGap} | Öğrenme dışı\n`;
  text += `🧮 Premier mutabakatı: ${l.equation} | Fark ${l.difference >= 0 ? '+' : ''}${l.difference} ${l.reconciled ? '✅' : '⚠️'}\n`;
  text += `🔒 Bottom ve Reverse ana Premier kasasına dahil değildir; açık pozisyonun Exit/Stop/BE ataması değişmez; GAP sonuçları dahil edilmez.`;
  return text;
}
function compactTelegram(activePositions = []) { return compactTelegramFromModel(summaryModel(activePositions)); }
function telegram(model = null, limit = 10) {
  const data = model || summaryModel([]); const league = { historicalPremier: [], recent5Premier: [], reversePremier: [], bottomLong: [], bottomShort: [], nearProfit: [], ...data.league }; let text = '\n\n🏁 <b>LAB PREMIER — DİNAMİK LİG</b>\n';
  text += `🏆 Premier LAB ${league.premierCount || 0} | 🎯 Exit-Validated ${league.exitValidatedCount || 0} | 🛟 Entry-Proven/Fallback ${league.entryFallbackCount || 0} | ✅ İleri ${league.forwardVerifiedCount || 0}\n`;
  text += `🧬 Yetkili yarışmacı: LAB DNA | Family rolü: kalıcı piyasa hafızası\n`;
  text += `⚖️ Giriş kanıtı Premier sanal teste yeter | Kendi LAB Exit yoksa Mevcut Kademe güvenli fallback | Gerçek emir için kendi Exit + ileri kanıt zorunlu\n`;
  text += `🔥 Kanıt güveni sıralamadır; işlem kapısı değil\n`;
  text += `🥇 Tarihsel ${league.historicalPositiveCount || 0} | 🔁 Ters ayrı defter ${league.reversePremierCount} | 👻 Championship/LAB ${league.labLeagueCount}\n`;
  text += `⬆️/⬇️ okları Premier'e girişten sonraki bilimsel sonuçları; 🔄 işareti Exit değişimini gösterir.\n`;
  if (league.historicalPremier.length) {
    text += '\n🥇 <b>TARİHSEL POZİTİF PREMIER</b>\n';
    text += league.historicalPremier.slice(0, limit).map(x => candidateLine(x)).join('\n');
  }
  if (league.recent5Premier.length) {
    text += '\n\n🟡 <b>SON-5 AYRI GÖLGE HAVUZU</b>\n';
    text += league.recent5Premier.slice(0, limit).map(x => candidateLine(x)).join('\n');
  }
  if (league.bottomLong.length) {
    text += '\n\n🔴 <b>BOTTOM PREMIER LONG</b>\n';
    text += league.bottomLong.slice(0, limit).map(x => candidateLine(x)).join('\n');
  }
  if (league.bottomShort.length) {
    text += '\n\n🔴 <b>BOTTOM PREMIER SHORT</b>\n';
    text += league.bottomShort.slice(0, limit).map(x => candidateLine(x)).join('\n');
  }
  if (league.reversePremier.length) {
    text += '\n\n🔁 <b>TERS İŞLEM DEFTERİ</b>\n';
    text += league.reversePremier.slice(0, limit).map(x => candidateLine(x, { reverse: true })).join('\n');
  }
  if (league.nearProfit.length) {
    text += '\n\n🏃 <b>LAB LİGİ — KÂRA YAKIN</b>\n';
    text += league.nearProfit.slice(0, limit).map(x => `${x.labDnaLabel} | N${num(x.historical?.total)} WR%${num(x.historical?.winRate).toFixed(1)} Net${signed(x.historical?.net)} PF${num(x.historical?.profitFactor).toFixed(2)} | ${x.proofLevel}`).join('\n');
  }
  text += '\n\n🔒 Tek sanal pozisyon; ters adayda aynı sinyalin yönü çevrilir, ikinci pozisyon açılmaz. Gerçek emir kapalı.';
  return text;
}
function audit() {
  const league = build({ persist: false, force: true }); const state = readState();
  return {
    authority: league.authority, familyOrderAuthority: league.policy.familyOrderAuthority,
    labPremierOrderAuthority: league.policy.labPremierOrderAuthority, premierCount: league.premierCount,
    historicalPositiveCount: league.historicalPositiveCount, recent5ProvisionalCount: league.recent5ProvisionalCount,
    reversePremierCount: league.reversePremierCount, reverseShadowCount: league.reverseShadowCount, bottomLongCount: league.bottomLongCount, bottomShortCount: league.bottomShortCount,
    labLeagueCount: league.labLeagueCount, nearProfitCount: league.nearProfitCount,
    forwardVerifiedCount: league.forwardVerifiedCount, exitValidatedCount: league.exitValidatedCount,
    entryFallbackCount: league.entryFallbackCount, championshipSizeMultiplier: league.policy.championshipSizeMultiplier, observationOpened: num(state.aggregate.opened), observationClosed: num(state.aggregate.closed),
    secondOrderCreated: false, realTradingAuthorized: false
  };
}

module.exports = {
  VERSION, TRACK, STATE_FILE, MODEL_FILE, TRADES_FILE,
  readState, writeState, metrics, liveLeagueThresholds, liveLeagueReview, updateLiveLeagueState, recentLabTrades, tradeOutcome, baseLeagueFromTrack, oppositeSide, invertBits, reverseLabKey, reversePremierReady, reverseShadowReady, bottomPremierReady, nearProfitReady, recordReverseStage,
  championTier, tierWithLiveReview, build, evaluate, bindReverseExecution, frozenExit, applyToPosition, snapshot, close, activeRows,
  premierAccounting, summaryModel, compactTelegramFromModel, compactTelegram, telegram, audit
};
