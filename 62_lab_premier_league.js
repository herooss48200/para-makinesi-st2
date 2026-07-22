/**
 * AGROS v5.1.0 — DYNAMIC LAB PREMIER LEAGUE
 *
 * - Family DNA is permanent market memory only.
 * - LAB DNA is the only virtual league competitor.
 * - Historical-positive LAB children open in their original direction.
 * - Recent-5 positive LAB children remain a separately measured provisional Premier track.
 * - Systematic losing LAB children (N>=10, WR<=35%, Net<0, PF<1) open only in reverse direction.
 * - Every other LAB remains in the learning league; memory and Exit learning are never reset.
 * - Open positions keep their frozen Exit; only new positions receive the latest LAB Exit.
 * - Real-order authority remains disabled.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');
const labChampion = require('./61_lab_champion_engine.js');
const evidenceEngine = require('./63_universal_evidence_engine.js');
const accountingContinuity = require('./65_accounting_continuity.js');

const VERSION = 'v5.3.0-FINAL-PLUS';
const DATA_DIR = path.join(__dirname, 'data');
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
  LAB: 'LAB_LEAGUE'
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
    startedAt: new Date().toISOString(), aggregate: blankBucket(), byLab: {}, lastTrades: [], updatedAt: null
  };
}
function normalizeState(raw) {
  const out = { ...blankState(), ...(raw || {}) };
  out.aggregate = { ...blankBucket(), ...(raw?.aggregate || {}) };
  out.byLab = raw?.byLab && typeof raw.byLab === 'object' ? raw.byLab : {};
  // v5.0.x kalıcı defteri kaybolmaz; eski proof etiketi yeni üçlü Premier yoluna taşınır.
  for (const row of Object.values(out.byLab)) {
    if (!row || row.premierTrack) continue;
    const proof = String(row.currentProofLevel || row.proofLevelAtFirstOpen || '').toUpperCase();
    row.premierTrack = proof.includes('RECENT5') ? TRACK.RECENT5 : TRACK.HISTORICAL;
    row.bucket = { ...blankBucket(), ...(row.bucket || {}) };
    row.exitChangeCount = num(row.exitChangeCount);
  }
  out.lastTrades = Array.isArray(raw?.lastTrades) ? raw.lastTrades : [];
  return out;
}
function readState() { ensureDir(); return normalizeState(io.readJsonBounded(STATE_FILE, null, { maxBytes: 24 * 1024 * 1024 })); }
function writeState(state) { ensureDir(); const out = normalizeState({ ...state, version: VERSION }); io.writeJsonAtomic(STATE_FILE, out); return out; }
function appendTrade(row) { ensureDir(); fs.appendFileSync(TRADES_FILE, `${JSON.stringify(row)}\n`); }
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
function nearProfitReady(row) {
  const h = row?.historical || {};
  const n = num(h.total); const min = Math.max(1, num(ayarlar.evidenceWarmStartMinHistorical, 5));
  const gates = [num(h.net) > 0, num(h.profitFactor) > 1, num(h.expectancy) > 0];
  if (n === min - 1 && gates.every(Boolean)) return true;
  return n >= min && gates.filter(Boolean).length === 2;
}

function championTier(row) {
  const evidence = evidenceFor(row);
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
  const rows = unique.map(rowFromChampion);
  const historicalPremier = sortRows(rows.filter(x => x.premierTrack === TRACK.HISTORICAL));
  const recent5Premier = sortRows(rows.filter(x => x.premierTrack === TRACK.RECENT5));
  const reversePremier = rows.filter(x => x.premierTrack === TRACK.REVERSE)
    .sort((a, b) => num(a.historical?.winRate) - num(b.historical?.winRate) || num(a.historical?.net) - num(b.historical?.net));
  const reverseShadow = rows.filter(x => x.premierTrack === TRACK.REVERSE_SHADOW)
    .sort((a, b) => num(a.historical?.winRate) - num(b.historical?.winRate));
  const premier = [...historicalPremier];
  const labLeague = rows.filter(x => !x.upperLayerIncluded);
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
    reverseShadowCount: reverseShadow.length, labLeagueCount: labLeague.length,
    nearProfitCount: nearProfit.length, championshipCount: labLeague.length,
    forwardVerifiedCount: verified.length, exitValidatedCount: exitValidated.length, entryFallbackCount: entryFallback.length,
    historicalEntryFallbackCount: historicalPremier.filter(x => x.safeExitFallback).length,
    recent5EntryFallbackCount: recent5Premier.filter(x => x.safeExitFallback).length,
    historicalTestCount: historicalPremier.filter(x => x.proofLevel === 'HISTORICAL_POSITIVE_EXIT_TEST').length,
    warmStartCount: historicalPremier.filter(x => x.exitValidated).length,
    historicalPremier, recent5Premier: [], reversePremier, reverseShadow, nearProfit,
    premier, championship: labLeague, labLeague, allCandidates: rows,
    policy: {
      familyOrderAuthority: false, labPremierOrderAuthority: true, championshipOrderAuthority: false,
      historicalPositiveAdmission: 'N>=5 && Net>0 && PF>1 && Exp>0',
      recent5Admission: 'DISABLED_REMOVED_v5.3.0',
      reversePremierAdmission: 'N>=10 && WR<=35 && Net<0 && PF<1; ayrı defterde execution side reversed',
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
function evaluate(pos, { model = null, realMode = false } = {}) {
  const identities = identityFor(pos); const leagueModel = model || build({ persist: false });
  const labKey = identities?.lab?.key || ''; const row = leagueModel.allCandidates.find(x => x.labKey === labKey) || null;
  const tier = row ? championTier(row) : championTier(null);
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
    upperLayerIncluded, observationEligible: Boolean(upperLayerIncluded || tier.premierTrack === TRACK.REVERSE), virtualShadowOnly: !upperLayerIncluded, sizeMultiplier: upperLayerIncluded ? 1 : 0,
    historical: row?.historical || null, recent5: row?.recent5 || null, evidence: row?.evidence || null, forward: row?.forward || null,
    exit: reverseExecution ? null : (row?.exit || null), realTradingAuthorized: false, allowed: !realMode, reasons
  };
  pos.labPremierDecision = decision; return decision;
}
function bindReverseExecution(pos, sourceDecision, { model = null } = {}) {
  if (!pos || !sourceDecision?.reverseExecution) return sourceDecision;
  const identities = identityFor(pos); const actualKey = identities?.lab?.key || '';
  if (!actualKey || actualKey !== sourceDecision.reverseTargetKey) {
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
    premierTrack: TRACK.REVERSE, labLeague: 'PREMIER', upperLayerIncluded: true, virtualShadowOnly: false, sizeMultiplier: 1,
    proofLevel: forwardVerified ? 'REVERSE_FORWARD_VERIFIED' : (targetExitReady ? 'REVERSE_PREMIER_OWN_EXIT' : 'REVERSE_PREMIER_FALLBACK'),
    exitValidated: targetExitReady, safeExitFallback: !targetExitReady, exit: targetRow?.exit || null,
    reverseSourceHistorical: sourceDecision.historical || null,
    executionHistorical: targetRow?.historical || null, executionForward: targetRow?.forward || null,
    admissionReason: targetExitReady
      ? `${sourceDecision.sourceLabDnaLabel} sistematik kaybeden → ${identities.lab.label} ters yön + kendi Exit`
      : `${sourceDecision.sourceLabDnaLabel} sistematik kaybeden → ${identities.lab.label} ters yön; kendi Exit oluşana kadar fallback`,
    realTradingAuthorized: false
  };
  pos.labPremierDecision = decision; return decision;
}
function frozenExit(decision) {
  if (!decision?.upperLayerIncluded) return null;
  const exit = decision?.exit; const assignedAt = decision.at || new Date().toISOString();
  const ownExitReady = Boolean(decision.exitValidated !== false && exit?.positive && exit?.ownLabExit && exit?.algorithmId);
  const algorithmId = ownExitReady ? exit.algorithmId : 'ACTUAL';
  const assignmentId = `${decision.premierTrack}|${decision.labDnaLabel}|${decision.labKey}|${algorithmId}|${assignedAt}`;
  if (!ownExitReady) return {
    ready: false, algorithmId: 'ACTUAL', label: 'Mevcut Kademe Sistemi', scope: decision.premierTrack === TRACK.REVERSE ? 'LAB_REVERSE_PREMIER_FALLBACK' : 'LAB_PREMIER_ENTRY_PROVEN_FALLBACK',
    selectionQuality: 'ENTRY_PROVEN_EXIT_PENDING', executionPolicy: 'CURRENT_LADDER_FALLBACK', samples: 0, beatRate: 0,
    profitFactor: 0, netUsdt: 0, reason: 'Giriş kanıtlı; kendi LAB Exit doğrulanana kadar güvenli mevcut kademe',
    activeForPosition: false, assignmentId, assignedAt, immutable: true, source: 'LAB_PREMIER_SAFE_FALLBACK'
  };
  return {
    ready: true, algorithmId: exit.algorithmId, label: exit.algorithmLabel, scope: decision.premierTrack === TRACK.REVERSE ? 'LAB_REVERSE_PREMIER_OWN_EXIT' : 'LAB_PREMIER_OWN_EXIT',
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
  return decision?.premierTrack === TRACK.REVERSE
    ? `REVERSE|${decision.sourceLabKey || 'YOK'}|${decision.labKey || 'YOK'}`
    : (decision?.labKey || 'LAB-YOK');
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
function snapshot(pos) {
  if (!pos || pos.sanal === false || ayarlar.labPremierAktif === false) return null;
  const decision = pos.labPremierDecision || applyToPosition(pos); if (!decision?.observationEligible && !decision?.upperLayerIncluded) return null;
  const observation = {
    version: VERSION, openedAt: new Date().toISOString(), symbol: pos.sym || '', side: pos.yon || '',
    sourceSignalSide: decision.sourceSignalSide || pos.yon || '', reverseExecution: Boolean(decision.reverseExecution),
    sourceLabDnaLabel: decision.sourceLabDnaLabel || null, sourceLabKey: decision.sourceLabKey || null,
    labDnaId: decision.labDnaId, labDnaLabel: decision.labDnaLabel, labKey: decision.labKey,
    familyDnaLabel: decision.familyDnaLabel, proofLevel: decision.proofLevel, premierTrack: decision.premierTrack, labLeague: 'PREMIER',
    exitAlgorithmId: decision.exitValidated ? (decision.exit?.algorithmId || 'ACTUAL') : 'ACTUAL',
    exitAlgorithmLabel: decision.exitValidated ? (decision.exit?.algorithmLabel || 'Mevcut Kademe Sistemi') : 'Mevcut Kademe Sistemi',
    exitAssignmentId: pos.executionExitAssignment?.assignmentId || null,
    upperLayerIncluded: Boolean(decision.upperLayerIncluded), observationPool: decision.premierTrack === TRACK.REVERSE ? 'REVERSE_SEPARATE_LEDGER' : 'PREMIER', samePosition: true, secondOrderCreated: false, realTradingAuthorized: false
  };
  pos.labPremierObservation = observation;
  const state = readState(); if (decision.upperLayerIncluded) { state.aggregate.opened++; state.aggregate.active++; }
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
  const observation = pos?.labPremierObservation; if (!observation) return null;
  const net = num(result.net ?? result.netKarZarar); const commission = Math.max(0, num(result.commission ?? result.komisyon));
  const outcome = outcomeFrom(result); const closedAt = new Date().toISOString(); const state = readState();
  if (observation.upperLayerIncluded) applyClosed(state.aggregate, net, commission, outcome);
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
  state.lastTrades = [trade, ...state.lastTrades].slice(0, 150); state.updatedAt = closedAt; writeState(state); appendTrade(trade); return trade;
}
function activeRows(activePositions = []) {
  return accountingContinuity.activeBreakdown(activePositions).premierPositions.map(p => ({
    symbol: p.sym || '', side: p.yon || '', labDnaLabel: p.labPremierObservation?.labDnaLabel || '',
    sourceLabDnaLabel: p.labPremierObservation?.sourceLabDnaLabel || '', premierTrack: p.labPremierObservation?.premierTrack || '',
    proofLevel: p.labPremierObservation?.proofLevel || '', exitAlgorithmLabel: p.labPremierObservation?.exitAlgorithmLabel || ''
  }));
}
function premierAccounting(activePositions = [], observationAggregate = {}) {
  const continuity = accountingContinuity.snapshot(activePositions); const canonical = continuity?.canonical?.premier || {};
  const observation = metrics(observationAggregate); const opened = num(canonical.opened); const closedScientific = num(canonical.closedScientific);
  const activeScientific = num(canonical.activeScientific); const activeGap = num(canonical.activeGap); const closedGap = num(canonical.closedGap);
  const difference = opened - closedScientific - activeScientific - activeGap - closedGap;
  const observationOpenedDifference = observation.opened - opened; const observationClosedDifference = observation.closed - closedScientific;
  return {
    opened, closedScientific, activeScientific, activeGap, closedGap, difference, reconciled: difference === 0,
    observationOpened: observation.opened, observationClosed: observation.closed, observationActive: observation.active,
    observationOpenedDifference, observationClosedDifference,
    observationReconciled: observationOpenedDifference === 0 && observationClosedDifference === 0,
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
  if (candidate.premierTrack === TRACK.REVERSE) return stateRows.find(x => x.reverseSourceLabKey === candidate.labKey) || null;
  return stateRows.find(x => x.labKey === candidate.labKey && x.premierTrack !== TRACK.REVERSE) || null;
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
  return {
    ...candidate, liveMetrics, progress: progressStatus(candidate, stateRow?.bucket), stateRow,
    currentExit, currentExitId, currentExitLabel: currentExitId === 'ACTUAL' ? 'Mevcut Kademe Sistemi' : currentExit?.algorithmLabel,
    pendingExitChange, exitChangeCount: num(stateRow?.exitChangeCount), previousExitAlgorithmLabel: stateRow?.previousExitAlgorithmLabel || null
  };
}
function groupMetrics(stateRows, track) {
  const b = blankBucket(); for (const row of stateRows.filter(x => x.premierTrack === track)) addBucket(b, row.bucket); return metrics(b);
}
function premierTrackAggregate(stateRows) {
  const b = blankBucket();
  for (const row of stateRows.filter(x => x.premierTrack === TRACK.HISTORICAL)) addBucket(b, row.bucket);
  return metrics(b);
}
function summaryModel(activePositions = [], { force = false } = {}) {
  const state = readState(); const league = build({ persist: false, force }); const stateRows = Object.values(state.byLab || {});
  const aggregate = premierTrackAggregate(stateRows);
  const accounting = premierAccounting(activePositions, aggregate);
  const historicalPremier = league.historicalPremier.map(x => enrichCandidate(x, stateRows, league));
  const recent5Premier = [];
  const reversePremier = league.reversePremier.map(x => enrichCandidate(x, stateRows, league));
  return {
    version: VERSION, experimentId: state.experimentId,
    league: { ...league, historicalPremier, recent5Premier, reversePremier, premier: [...historicalPremier] },
    aggregate, accounting,
    trackMetrics: {
      historical: groupMetrics(stateRows, TRACK.HISTORICAL), reverse: groupMetrics(stateRows, TRACK.REVERSE)
    },
    byLab: stateRows.map(row => ({ ...row, metrics: metrics(row.bucket) })), active: activeRows(activePositions),
    lastTrades: state.lastTrades, updatedAt: state.updatedAt
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
  return `${identity} | N${num(h.total)} WR%${num(h.winRate).toFixed(1)} Net${signed(h.net)} | Yeni N${live.closed} Net${signed(live.net)} ${progress.icon} | 🎯 ${exitLabel}${exitFlag ? ` ${exitFlag}` : ''}`;
}
function compactTelegramFromModel(model) {
  const league = { historicalPremier: [], recent5Premier: [], reversePremier: [], nearProfit: [], premier: [], ...model.league };
  const a = model.aggregate; const l = model.accounting || premierAccounting([], a);
  const tracks = model.trackMetrics || {};
  const hist = tracks.historical || metrics(); const reverse = tracks.reverse || metrics();
  const topHistorical = league.historicalPremier.slice(0, Math.max(1, num(ayarlar.labPremierCanliTopTarihsel, 6)));
  const changed = league.historicalPremier.filter(x => x.liveMetrics.closed || x.pendingExitChange).slice(0, 3);
  const shown = [...new Map([...changed, ...topHistorical].map(x => [x.labKey, x])).values()].slice(0, 7);
  let text = `🏆 <b>LAB PREMIER LİGİ</b>\n`;
  text += `🥇 Tarihsel Premier ${league.historicalPositiveCount || 0} | Üst toplam ${league.premierCount || 0}
🔁 Ters ayrı defter ${league.reversePremierCount || 0}\n`;
  text += `👻 LAB Ligi ${league.labLeagueCount || 0} | Kâra yakın ${league.nearProfitCount || 0} | Ters gölge ${league.reverseShadowCount || 0}\n`;
  if (shown.length) {
    text += `\n🥇 <b>TARİHSEL PREMIER — İLERLEME</b>\n`;
    text += shown.map(x => candidateLine(x)).join('\n');
  }
  text += `🔁 <b>TERS İŞLEM DEFTERİ</b>: ${league.reversePremierCount} LAB | Yeni N${reverse.closed} Net ${signed(reverse.net, 4)} | PF ${reverse.profitFactor >= 999 ? '∞' : reverse.profitFactor.toFixed(2)}\n`;
  if (league.reversePremier.length) text += league.reversePremier.slice(0, 3).map(x => candidateLine(x, { reverse: true })).join('\n') + '\n';
  const pendingExit = league.premier.filter(x => x.pendingExitChange).length;
  text += `🎯 Exit: Kendi Exit ${league.exitValidatedCount} | Fallback ${league.entryFallbackCount} | Yeni işlemde değişecek ${pendingExit} | Açık pozisyon Exit'i değişmez\n`;
  text += `\n🧬 <b>PREMIER SONUÇ DEFTERİ</b>\n`;
  text += `📦 Açılan ${l.opened} | Bilimsel aktif ${l.activeScientific} | Bilimsel kapanan ${l.closedScientific}\n`;
  text += `🛡️ Restart-GAP: Aktif ${l.activeGap} | Kapanan ${l.closedGap} | Öğrenme dışı\n`;
  text += `🧮 Premier mutabakatı: ${l.equation} | Fark ${l.difference >= 0 ? '+' : ''}${l.difference} ${l.reconciled ? '✅' : '⚠️'}\n`;
  text += `✅ Kârlı/TP ${a.tp} | ❌ Zararlı/SL ${a.sl} | ⚖️ BE ${a.be} | Başarı %${a.winRate.toFixed(2)}\n`;
  text += `💎 Net ${signed(a.net, 4)} | PF ${a.profitFactor >= 999 ? '∞' : a.profitFactor.toFixed(2)} | Exp ${signed(a.expectancy, 4)}\n`;
  text += `🔒 Lig değişimi öğrenmeyi/Exit hafızasını sıfırlamaz; performans yalnız bilimsel kapanışlardır; GAP sonuçları dahil edilmez.`;
  return text;
}
function compactTelegram(activePositions = []) { return compactTelegramFromModel(summaryModel(activePositions)); }
function telegram(model = null, limit = 10) {
  const data = model || summaryModel([]); const league = { historicalPremier: [], recent5Premier: [], reversePremier: [], nearProfit: [], ...data.league }; let text = '\n\n🏁 <b>LAB PREMIER — DİNAMİK LİG</b>\n';
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
    reversePremierCount: league.reversePremierCount, reverseShadowCount: league.reverseShadowCount,
    labLeagueCount: league.labLeagueCount, nearProfitCount: league.nearProfitCount,
    forwardVerifiedCount: league.forwardVerifiedCount, exitValidatedCount: league.exitValidatedCount,
    entryFallbackCount: league.entryFallbackCount, championshipSizeMultiplier: league.policy.championshipSizeMultiplier, observationOpened: num(state.aggregate.opened), observationClosed: num(state.aggregate.closed),
    secondOrderCreated: false, realTradingAuthorized: false
  };
}

module.exports = {
  VERSION, TRACK, STATE_FILE, MODEL_FILE, TRADES_FILE,
  readState, writeState, metrics, oppositeSide, invertBits, reverseLabKey, reversePremierReady, reverseShadowReady, nearProfitReady,
  championTier, build, evaluate, bindReverseExecution, frozenExit, applyToPosition, snapshot, close, activeRows,
  premierAccounting, summaryModel, compactTelegramFromModel, compactTelegram, telegram, audit
};
