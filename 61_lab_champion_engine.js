/**
 * AGROS v4.7.0 — LAB CHAMPION GOLDEN BRIDGE
 *
 * Connects 2000+ historical BlackBox learning to a separate forward virtual test:
 * - Historical Lab DNA = YON + BTC + COIN + BB.
 * - Full DNA = Lab DNA + PUSU.
 * - The same already-opened position is observed; no second order is created.
 * - The Lab DNA's own replay-selected exit is evaluated from the same price path.
 * - Real trading authorization is never granted by this module.
 */
const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');

const VERSION = 'v4.8.0-LAB-CHAMPION-SOURCE-FOR-LAB-PREMIER';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-champion-observation.json');
const TRADES_FILE = path.join(DATA_DIR, 'lab-champion-trades.jsonl');
const MODEL_FILE = path.join(DATA_DIR, 'lab-champion-model.json');

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, digits = 6) {
  return Number(num(v).toFixed(digits));
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyBucket() {
  return {
    opened: 0,
    closed: 0,
    tp: 0,
    sl: 0,
    be: 0,
    net: 0,
    grossProfit: 0,
    grossLoss: 0,
    commission: 0
  };
}

function emptyTrackedRow(identity = {}) {
  return {
    labDnaId: identity.labDnaId || null,
    labDnaLabel: identity.labDnaLabel || 'LAB #YOK',
    labKey: identity.labKey || '',
    fullDnaId: identity.fullDnaId || null,
    fullDnaLabel: identity.fullDnaLabel || 'FULL #YOK',
    fullKey: identity.fullKey || '',
    familyDnaId: identity.familyDnaId || null,
    familyDnaLabel: identity.familyDnaLabel || 'DNA #YOK',
    familyKey: identity.familyKey || '',
    actual: emptyBucket(),
    selectedExit: emptyBucket(),
    lastExitAlgorithmId: 'ACTUAL',
    lastExitAlgorithmLabel: 'Mevcut Kademe Sistemi',
    lastUpdatedAt: null
  };
}

function blankState() {
  return {
    version: VERSION,
    startedAt: new Date().toISOString(),
    opened: 0,
    closed: 0,
    replayEvaluated: 0,
    replayMissing: 0,
    byLab: {},
    byFull: {},
    lastTrades: [],
    updatedAt: null
  };
}

function normalizeState(raw) {
  const out = { ...blankState(), ...(raw || {}) };
  out.byLab = raw?.byLab && typeof raw.byLab === 'object' ? raw.byLab : {};
  out.byFull = raw?.byFull && typeof raw.byFull === 'object' ? raw.byFull : {};
  out.lastTrades = Array.isArray(raw?.lastTrades) ? raw.lastTrades : [];
  return out;
}

function readState() {
  ensureDir();
  return normalizeState(io.readJsonBounded(STATE_FILE, null, { maxBytes: 32 * 1024 * 1024 }));
}

function writeState(state) {
  ensureDir();
  const out = normalizeState({ ...state, version: VERSION });
  io.writeJsonAtomic(STATE_FILE, out);
  return out;
}

function appendTrade(row) {
  ensureDir();
  fs.appendFileSync(TRADES_FILE, `${JSON.stringify(row)}\n`);
}

function bucketMetrics(bucket = {}) {
  const closed = num(bucket.closed);
  const decided = num(bucket.tp) + num(bucket.sl);
  return {
    ...bucket,
    opened: num(bucket.opened),
    closed,
    tp: num(bucket.tp),
    sl: num(bucket.sl),
    be: num(bucket.be),
    net: round(bucket.net),
    grossProfit: round(bucket.grossProfit),
    grossLoss: round(bucket.grossLoss),
    commission: round(bucket.commission),
    winRate: decided ? (num(bucket.tp) / decided) * 100 : 0,
    profitFactor: num(bucket.grossLoss) > 0
      ? num(bucket.grossProfit) / num(bucket.grossLoss)
      : (num(bucket.grossProfit) > 0 ? 999 : 0),
    expectancy: closed ? num(bucket.net) / closed : 0
  };
}

function historicalMetrics(bucket = {}) {
  const total = num(bucket.toplam);
  const tp = num(bucket.tp);
  const sl = num(bucket.sl);
  const be = num(bucket.be);
  const decided = tp + sl;
  const grossProfit = num(bucket.karToplam);
  const grossLoss = num(bucket.zararToplam);
  return {
    total,
    tp,
    sl,
    be,
    net: round(bucket.net),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    winRate: decided ? (tp / decided) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0),
    expectancy: total ? num(bucket.net) / total : 0
  };
}

function historicalEligible(metrics) {
  return metrics.total >= Math.max(1, num(ayarlar.labChampionMinOrnek, 10))
    && metrics.winRate >= num(ayarlar.labChampionMinBasari, 65)
    && metrics.net > num(ayarlar.labChampionMinNet, 0)
    && metrics.profitFactor > num(ayarlar.labChampionMinPF, 1)
    && metrics.expectancy > num(ayarlar.labChampionMinExpectancy, 0);
}

function historicalScore(metrics) {
  const pf = Math.min(15, num(metrics.profitFactor));
  return round(
    num(metrics.net) * 2
      + pf * 2
      + num(metrics.winRate) / 5
      + num(metrics.expectancy) * 20
      + Math.log10(Math.max(1, num(metrics.total))) * 5,
    3
  );
}

function pseudoPositionForLab(labKey, model) {
  const fields = hierarchy.keyFields(labKey);
  return {
    sym: 'LAB-CHAMPION',
    yon: fields.yon,
    marketRegime: model?.currentRegime || null,
    blackboxAcilis: {
      strategySignature: {
        key: labKey,
        shortKey: hierarchy.labShortKey(labKey),
        btcBits: fields.btc,
        coinBits: fields.coin,
        bb: fields.bb,
        yon: fields.yon
      }
    }
  };
}

function exitForLab(labKey, model = null) {
  const dynamicModel = model || dynamicExit.readModel();
  if (!dynamicModel) return null;
  const plan = dynamicExit.selectForPosition(
    pseudoPositionForLab(labKey, dynamicModel),
    dynamicModel,
    { persistDecision: false }
  );
  if (!plan) return null;
  const ownLabExit = plan.ready
    && !String(plan.selectionScope || '').startsWith('BASE_DNA')
    && String(plan.signature || '').includes('DETAIL=');
  const positive = ownLabExit
    && plan.selectionQuality === 'POSITIVE_CONFIRMED'
    && num(plan.samples) >= Math.max(1, num(ayarlar.labChampionExitMinOrnek, 5))
    && num(plan.profitFactor) > num(ayarlar.labChampionExitMinPF, 1)
    && num(plan.netUsdt) > num(ayarlar.labChampionExitMinNet, 0);
  return {
    algorithmId: plan.selectedAlgorithmId,
    algorithmLabel: plan.selectedAlgorithmLabel,
    samples: num(plan.samples),
    profitFactor: num(plan.profitFactor),
    netUsdt: num(plan.netUsdt),
    beatRate: num(plan.beatRate),
    selectionScope: plan.selectionScope,
    selectionQuality: plan.selectionQuality,
    currentRegime: plan.currentRegime,
    ownLabExit,
    positive,
    ready: Boolean(plan.ready),
    reason: plan.reason
  };
}

function proofChecks(metrics) {
  const minClosed = Math.max(1, num(ayarlar.labChampionForwardMinKapanis, 5));
  const minPf = num(ayarlar.labChampionForwardMinPF, 1);
  const minNet = num(ayarlar.labChampionForwardMinNet, 0);
  const minExpectancy = num(ayarlar.labChampionForwardMinExpectancy, 0);
  return {
    closed: { pass: num(metrics.closed) >= minClosed, actual: num(metrics.closed), required: minClosed },
    profitFactor: { pass: num(metrics.profitFactor) > minPf, actual: num(metrics.profitFactor), required: `>${minPf}` },
    net: { pass: num(metrics.net) > minNet, actual: num(metrics.net), required: `>${minNet}` },
    expectancy: { pass: num(metrics.expectancy) > minExpectancy, actual: num(metrics.expectancy), required: `>${minExpectancy}` }
  };
}

function forwardProof(labKeyValue, state = null) {
  const key = hierarchy.labKey(labKeyValue);
  const row = (state || readState())?.byLab?.[key];
  const metrics = bucketMetrics(row?.selectedExit || {});
  const checks = proofChecks(metrics);
  const failed = Object.entries(checks)
    .filter(([, value]) => !value.pass)
    .map(([name, value]) => ({ key: name, ...value }));
  return {
    labKey: key,
    eligible: failed.length === 0,
    checks,
    failed,
    metrics,
    source: row ? 'LAB_CHAMPION_SELECTED_EXIT_FORWARD' : 'NO_FORWARD_SAMPLE'
  };
}

function fullChildren(summary, labKeyValue) {
  const rows = [];
  for (const [rawKey, bucket] of Object.entries(summary?.fullSignatureStats || {})) {
    if (hierarchy.labKey(rawKey) !== labKeyValue) continue;
    const identity = hierarchy.ensureFull(rawKey, { source: 'LAB_CHAMPION_FULL_CHILD' });
    if (!identity) continue;
    const metrics = historicalMetrics(bucket);
    rows.push({
      fullDnaId: identity.id,
      fullDnaLabel: identity.label,
      fullKey: identity.key,
      label: bucket?.etiket || identity.key,
      historical: metrics,
      historicalEligible: historicalEligible(metrics),
      score: historicalScore(metrics),
      exitInheritance: 'LAB_EXIT_UNTIL_FULL_REPLAY_PROOF'
    });
  }
  return rows.sort((a, b) => b.score - a.score || b.historical.total - a.historical.total);
}

function build({ summary = null, state = null, dynamicModel = null, persist = true } = {}) {
  const blackboxSummary = summary || h.state.blackboxOzet || {};
  const migration = hierarchy.bootstrapFromBlackbox(blackboxSummary, {
    source: 'LAB_CHAMPION_2000_PLUS_BOOTSTRAP'
  });
  const observationState = state || readState();
  const exitModel = dynamicModel || dynamicExit.readModel() || null;
  const champions = [];
  let strongSourceCount = 0;

  for (const [rawKey, bucket] of Object.entries(blackboxSummary.exactComboStats || {})) {
    const identity = hierarchy.ensureLab(rawKey, { source: 'LAB_CHAMPION_MODEL' });
    if (!identity) continue;
    const historical = historicalMetrics(bucket);
    if (!historicalEligible(historical)) continue;
    strongSourceCount++;
    const exit = exitForLab(identity.key, exitModel);
    const forward = forwardProof(identity.key, observationState);
    const children = fullChildren(blackboxSummary, identity.key);
    champions.push({
      labDnaId: identity.id,
      labDnaLabel: identity.label,
      labKey: identity.key,
      labShortKey: identity.shortKey,
      familyDnaId: identity.familyId,
      familyDnaLabel: identity.familyLabel,
      familyKey: identity.familyKey,
      label: bucket?.etiket || identity.key,
      historical,
      score: historicalScore(historical),
      exit,
      forward,
      fullChildren: children,
      fullChampionCount: children.filter(x => x.historicalEligible).length,
      historicalCandidate: true,
      promotionReady: Boolean(
        migration.coverage.complete
          && exit?.positive
          && forward.eligible
      ),
      realTradingAuthorized: false
    });
  }

  champions.sort((a, b) => b.score - a.score || b.historical.total - a.historical.total);
  const lost = champions.filter(row => !row.labDnaId || row.labDnaLabel === 'LAB #YOK');
  const model = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'LAB_PREMIER_CANDIDATE_SOURCE_AND_FORWARD_PROOF',
    sourceClosed: migration.coverage.baseClosed,
    allLabDnaCount: Object.keys(blackboxSummary.exactComboStats || {}).length,
    allFullDnaCount: Object.keys(blackboxSummary.fullSignatureStats || {}).length,
    coverage: migration.coverage,
    identityAudit: hierarchy.audit(),
    strongSourceCount,
    championCount: champions.length,
    lostChampionCount: lost.length,
    promotionReadyCount: champions.filter(x => x.promotionReady).length,
    labChampions: champions,
    policy: {
      familyIdsPreserved: true,
      labIdsPersistent: true,
      fullIdsPersistent: true,
      existingCountersUntouched: true,
      samePositionOnly: true,
      secondOrderCreated: false,
      labOwnExitReplayRequired: true,
      fullExitInheritsLabUntilOwnReplayProof: true,
      realOrderGateChanged: false,
      labPremierCandidateSource: true,
      realTradingAuthorized: false
    }
  };

  if (persist) {
    ensureDir();
    io.writeJsonAtomic(MODEL_FILE, model);
  }
  return model;
}

function liveExitFromPosition(pos, champion) {
  const plan = pos?.exitPlanShadow || pos?.premierObservation?.exit || null;
  if (!plan) return champion?.exit || null;
  const ownLabExit = Boolean(
    plan.ready
      && !String(plan.selectionScope || '').startsWith('BASE_DNA')
      && String(plan.signature || '').includes('DETAIL=')
  );
  return {
    algorithmId: plan.selectedAlgorithmId,
    algorithmLabel: plan.selectedAlgorithmLabel,
    samples: num(plan.samples),
    profitFactor: num(plan.profitFactor),
    netUsdt: num(plan.netUsdt),
    beatRate: num(plan.beatRate),
    selectionScope: plan.selectionScope,
    selectionQuality: plan.selectionQuality,
    currentRegime: plan.currentRegime,
    ownLabExit,
    positive: ownLabExit
      && plan.selectionQuality === 'POSITIVE_CONFIRMED'
      && num(plan.profitFactor) > 1
      && num(plan.netUsdt) > 0,
    ready: Boolean(plan.ready),
    reason: plan.reason
  };
}

function snapshot(pos) {
  if (!pos || ayarlar.labChampionAktif === false) return null;
  const identities = hierarchy.decoratePosition(pos, { source: 'LAB_CHAMPION_OPEN' });
  if (!identities?.lab || pos.sanal === false) return null;

  const catalogue = build({ persist: false });
  const champion = catalogue.labChampions.find(row => row.labKey === identities.lab.key);
  if (!champion) return null;

  const exit = liveExitFromPosition(pos, champion);
  const observation = {
    version: VERSION,
    openedAt: new Date().toISOString(),
    symbol: pos.sym || '',
    side: pos.yon || '',
    familyDnaId: identities.family?.id || null,
    familyDnaLabel: identities.family?.label || 'DNA #YOK',
    familyKey: identities.family?.key || '',
    labDnaId: identities.lab.id,
    labDnaLabel: identities.lab.label,
    labKey: identities.lab.key,
    fullDnaId: identities.full?.id || null,
    fullDnaLabel: identities.full?.label || 'FULL #YOK',
    fullKey: identities.full?.key || '',
    historicalAtOpen: champion.historical,
    exit,
    replayRequired: true,
    singlePosition: true,
    secondOrderCreated: false,
    performanceLayer: 'LAB_CHAMPION_VIRTUAL'
  };
  pos.labChampionObservation = observation;

  const state = readState();
  state.opened++;
  const labRow = state.byLab[observation.labKey]
    || emptyTrackedRow(observation);
  labRow.actual.opened++;
  labRow.selectedExit.opened++;
  labRow.lastExitAlgorithmId = exit?.algorithmId || 'ACTUAL';
  labRow.lastExitAlgorithmLabel = exit?.algorithmLabel || 'Mevcut Kademe Sistemi';
  labRow.lastUpdatedAt = observation.openedAt;
  state.byLab[observation.labKey] = labRow;

  if (observation.fullKey) {
    const fullRow = state.byFull[observation.fullKey]
      || emptyTrackedRow(observation);
    fullRow.actual.opened++;
    fullRow.selectedExit.opened++;
    fullRow.lastExitAlgorithmId = exit?.algorithmId || 'ACTUAL';
    fullRow.lastExitAlgorithmLabel = exit?.algorithmLabel || 'Mevcut Kademe Sistemi';
    fullRow.lastUpdatedAt = observation.openedAt;
    state.byFull[observation.fullKey] = fullRow;
  }

  state.updatedAt = observation.openedAt;
  writeState(state);
  return observation;
}

function classifyOutcome(net) {
  const value = num(net);
  if (Math.abs(value) <= 0.000001) return 'BE';
  return value > 0 ? 'TP' : 'SL';
}

function applyResult(bucket, net, commission = 0) {
  const outcome = classifyOutcome(net);
  bucket.closed++;
  bucket.net += num(net);
  bucket.commission += Math.max(0, num(commission));
  if (num(net) > 0) bucket.grossProfit += num(net);
  else if (num(net) < 0) bucket.grossLoss += Math.abs(num(net));
  if (outcome === 'TP') bucket.tp++;
  else if (outcome === 'BE') bucket.be++;
  else bucket.sl++;
}

function replayResult(record, algorithmId) {
  if (!record?.results || !algorithmId) return null;
  return record.results.find(row => row?.algorithmId === algorithmId) || null;
}

function close(pos, result = {}, replayRecord = null) {
  const observation = pos?.labChampionObservation;
  if (!observation) return null;

  const actualNet = num(result.netKarZarar ?? result.net);
  const commission = Math.max(0, num(result.komisyon ?? result.commission));
  const selectedResult = replayResult(replayRecord, observation.exit?.algorithmId);
  const selectedNet = selectedResult ? num(selectedResult.netUsdt) : actualNet;
  const replayEvaluated = Boolean(selectedResult && observation.exit?.ready && observation.exit?.ownLabExit);
  const closedAt = new Date().toISOString();

  const row = {
    version: VERSION,
    openedAt: observation.openedAt,
    closedAt,
    tradeId: replayRecord?.input?.tradeId || pos?.tradeId || pos?.sanalOrderId || '',
    symbol: pos.sym || observation.symbol,
    side: pos.yon || observation.side,
    familyDnaId: observation.familyDnaId,
    familyDnaLabel: observation.familyDnaLabel,
    familyKey: observation.familyKey,
    labDnaId: observation.labDnaId,
    labDnaLabel: observation.labDnaLabel,
    labKey: observation.labKey,
    fullDnaId: observation.fullDnaId,
    fullDnaLabel: observation.fullDnaLabel,
    fullKey: observation.fullKey,
    exitAlgorithmId: observation.exit?.algorithmId || 'ACTUAL',
    exitAlgorithmLabel: observation.exit?.algorithmLabel || 'Mevcut Kademe Sistemi',
    exitSelectionScope: observation.exit?.selectionScope || 'NONE',
    exitOwnLabProof: observation.exit?.ownLabExit === true,
    replayEvaluated,
    actualNet: round(actualNet),
    selectedExitNet: round(selectedNet),
    deltaVsActual: round(selectedNet - actualNet),
    commission: round(commission),
    actualOutcome: classifyOutcome(actualNet),
    selectedExitOutcome: classifyOutcome(selectedNet),
    realTradingAuthorized: false,
    samePosition: true,
    secondOrderCreated: false
  };

  const state = readState();
  state.closed++;
  if (replayEvaluated) state.replayEvaluated++;
  else state.replayMissing++;

  const labRow = state.byLab[observation.labKey]
    || emptyTrackedRow(observation);
  applyResult(labRow.actual, actualNet, commission);
  applyResult(labRow.selectedExit, selectedNet, commission);
  labRow.lastExitAlgorithmId = row.exitAlgorithmId;
  labRow.lastExitAlgorithmLabel = row.exitAlgorithmLabel;
  labRow.lastUpdatedAt = closedAt;
  state.byLab[observation.labKey] = labRow;

  if (observation.fullKey) {
    const fullRow = state.byFull[observation.fullKey]
      || emptyTrackedRow(observation);
    applyResult(fullRow.actual, actualNet, commission);
    applyResult(fullRow.selectedExit, selectedNet, commission);
    fullRow.lastExitAlgorithmId = row.exitAlgorithmId;
    fullRow.lastExitAlgorithmLabel = row.exitAlgorithmLabel;
    fullRow.lastUpdatedAt = closedAt;
    state.byFull[observation.fullKey] = fullRow;
  }

  state.lastTrades = [row, ...state.lastTrades].slice(0, 100);
  state.updatedAt = closedAt;
  writeState(state);
  appendTrade(row);
  return row;
}

function activeRows(activePositions = []) {
  return (activePositions || []).map(pos => {
    const observation = pos?.labChampionObservation;
    if (!observation) return null;
    return {
      symbol: pos.sym || observation.symbol,
      side: pos.yon || observation.side,
      familyDnaLabel: observation.familyDnaLabel,
      labDnaLabel: observation.labDnaLabel,
      fullDnaLabel: observation.fullDnaLabel,
      exitAlgorithmLabel: observation.exit?.algorithmLabel || 'Mevcut Kademe Sistemi'
    };
  }).filter(Boolean);
}

function summaryModel(activePositions = []) {
  const state = readState();
  return {
    version: VERSION,
    opened: num(state.opened),
    closed: num(state.closed),
    replayEvaluated: num(state.replayEvaluated),
    replayMissing: num(state.replayMissing),
    active: activeRows(activePositions),
    updatedAt: state.updatedAt
  };
}

function telegram(model = null, limit = 8) {
  const data = model || build();
  let text = '\n\n🥇 <b>2000+ ÖĞRENME — LAB CHAMPION ALTIN KÖPRÜ</b>\n';
  text += `📦 Geçmiş kapanış: ${data.sourceClosed} | LAB DNA: ${data.allLabDnaCount} | FULL DNA: ${data.allFullDnaCount}\n`;
  text += `🧬 LAB kapsama %${num(data.coverage.labCoveragePct).toFixed(1)} | FULL kapsama %${num(data.coverage.fullCoveragePct).toFixed(1)} | Kayıp ${data.lostChampionCount}\n`;
  text += `🏆 Tarihsel şampiyon ${data.championCount} | İleri doğrulanmış ${data.promotionReadyCount}\n`;
  text += data.coverage.complete
    ? '✅ Geçmiş kapanış toplamı Family/LAB/FULL katmanlarında eksiksiz eşleşiyor.'
    : `🚨 Kapsama farkı: LAB -${data.coverage.labMissing}, FULL -${data.coverage.fullMissing}. Gerçek emir fail-closed.`;

  if (data.labChampions.length) {
    text += '\n⭐ <b>LAB ŞAMPİYONLARI</b>\n';
    text += data.labChampions.slice(0, Math.max(1, limit)).map((row, index) => {
      const hst = row.historical;
      const fwd = row.forward.metrics;
      const exit = row.exit;
      return `${index + 1}. ${row.labDnaLabel} | ${row.familyDnaLabel} — ${row.label}\n`
        + `   Tarihsel N${hst.total} | WR %${hst.winRate.toFixed(1)} | PF ${hst.profitFactor >= 999 ? '∞' : hst.profitFactor.toFixed(2)} | Exp ${hst.expectancy >= 0 ? '+' : ''}${hst.expectancy.toFixed(4)} | Net ${hst.net >= 0 ? '+' : ''}${hst.net.toFixed(2)}\n`
        + `   🎯 Kendi Exit: ${exit ? `${exit.algorithmLabel} | N${exit.samples} | PF ${exit.profitFactor.toFixed(2)} | ${exit.positive ? 'POZİTİF' : (exit.ownLabExit ? 'KANIT BEKLİYOR' : 'AİLE FALLBACK')}` : 'EŞLEŞME YOK'}\n`
        + `   🧪 İleri Exit: N${fwd.closed} | PF ${fwd.profitFactor >= 999 ? '∞' : fwd.profitFactor.toFixed(2)} | Exp ${fwd.expectancy >= 0 ? '+' : ''}${fwd.expectancy.toFixed(4)} | Net ${fwd.net >= 0 ? '+' : ''}${fwd.net.toFixed(4)} | ${row.promotionReady ? 'TERFİ HAZIR' : 'KANIT BEKLİYOR'}\n`
        + `   🧩 FULL alt imza ${row.fullChildren.length} | Güçlü FULL ${row.fullChampionCount}`;
    }).join('\n');
  }

  text += '\n🧬 Tarihsel güçlü + kendi pozitif Exit’li LAB’lar, LAB Premier sanal test havuzunun aday kaynağıdır.';
  text += '\n🔒 Tek sanal pozisyon izlenir; ikinci emir yoktur. Gerçek emir yetkisi kapalıdır.';
  return text;
}

function audit(summary = null) {
  const model = build({ summary, persist: false });
  const state = readState();
  return {
    coverageComplete: model.coverage.complete,
    sourceClosed: model.sourceClosed,
    labClosed: model.coverage.labClosed,
    fullClosed: model.coverage.fullClosed,
    championCount: model.championCount,
    lostChampionCount: model.lostChampionCount,
    identityAudit: model.identityAudit,
    observationOpened: state.opened,
    observationClosed: state.closed,
    secondOrderCreated: false,
    realTradingAuthorized: false
  };
}

module.exports = {
  VERSION,
  STATE_FILE,
  TRADES_FILE,
  MODEL_FILE,
  readState,
  writeState,
  historicalMetrics,
  historicalEligible,
  historicalScore,
  exitForLab,
  forwardProof,
  build,
  snapshot,
  close,
  summaryModel,
  telegram,
  audit
};
