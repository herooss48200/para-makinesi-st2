/**
 * AGROS v4.8.0 — LAB PREMIER TRUE LEAGUE
 *
 * Family DNA is permanent market memory only.
 * LAB DNA is the actual league competitor and the only virtual upper-layer authority.
 *
 * Test policy:
 * - Historical LAB evidence + positive own LAB exit => LAB PREMIER TEST admission.
 * - Five positive forward closures upgrade proof level to FORWARD_VERIFIED.
 * - Championship/Development remain shadow learning only; no 0.25 order sizing.
 * - Real-order authorization is never granted here.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');
const labChampion = require('./61_lab_champion_engine.js');
const evidenceEngine = require('./63_universal_evidence_engine.js');

const VERSION = 'v4.9.2-RECENT5-POSITIVE-PREMIER';
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-premier-observation.json');
const MODEL_FILE = path.join(DATA_DIR, 'lab-premier-league-model.json');
const TRADES_FILE = path.join(DATA_DIR, 'lab-premier-trades.jsonl');
let cachedLeagueModel = null;
let cachedLeagueAt = 0;

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function blankBucket() {
  return { opened: 0, active: 0, closed: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0, commission: 0 };
}
function blankState() {
  return {
    version: VERSION,
    experimentId: ayarlar.labPremierExperimentId || 'LAB-PREMIER-TRUE-LEAGUE-2026-07-19',
    startedAt: new Date().toISOString(),
    aggregate: blankBucket(),
    byLab: {},
    lastTrades: [],
    updatedAt: null
  };
}
function normalizeState(raw) {
  const out = { ...blankState(), ...(raw || {}) };
  out.aggregate = { ...blankBucket(), ...(raw?.aggregate || {}) };
  out.byLab = raw?.byLab && typeof raw.byLab === 'object' ? raw.byLab : {};
  out.lastTrades = Array.isArray(raw?.lastTrades) ? raw.lastTrades : [];
  return out;
}
function readState() {
  ensureDir();
  return normalizeState(io.readJsonBounded(STATE_FILE, null, { maxBytes: 16 * 1024 * 1024 }));
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
function metrics(bucket = {}) {
  const closed = num(bucket.closed);
  const grossLoss = num(bucket.grossLoss);
  const grossProfit = num(bucket.grossProfit);
  const decided = num(bucket.tp) + num(bucket.sl);
  return {
    ...blankBucket(),
    ...bucket,
    opened: num(bucket.opened),
    active: num(bucket.active),
    closed,
    tp: num(bucket.tp),
    sl: num(bucket.sl),
    be: num(bucket.be),
    net: round(bucket.net),
    commission: round(bucket.commission),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    winRate: decided ? (num(bucket.tp) / decided) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0),
    expectancy: closed ? num(bucket.net) / closed : 0
  };
}
function championTier(champion) {
  const historicalReady = Boolean(champion?.historicalCandidate);
  const ownExitReady = Boolean(champion?.exit?.positive && champion?.exit?.ownLabExit);
  const forwardVerified = Boolean(champion?.forward?.eligible);
  const evidence = champion?.evidence || evidenceEngine.evaluate({
    strategyType: 'LAB_DNA', strategyKey: champion?.labKey || '', historical: champion?.historical || {},
    recent: champion?.recent5 || {}, exit: champion?.exit || {}, live: champion?.forward?.metrics || {}
  });
  const warmStartVerified = Boolean(ayarlar.evidenceWarmStartAktif !== false && evidence.warmStartEligible);
  const recent5Provisional = Boolean(ayarlar.evidenceWarmStartAktif !== false && evidence.recentProvisionalEligible);
  const historicalTestEnabled = ayarlar.labPremierTarihselTestAktif !== false;
  const forwardRequired = ayarlar.labPremierIleriDogrulamaZorunlu === true;

  if ((historicalReady && ownExitReady && (forwardVerified || (historicalTestEnabled && !forwardRequired))) || ((warmStartVerified || recent5Provisional) && !forwardRequired)) {
    const proofLevel = forwardVerified ? 'FORWARD_VERIFIED'
      : (historicalReady && ownExitReady ? 'HISTORICAL_POSITIVE_EXIT_TEST'
        : recent5Provisional ? 'RECENT5_PROVISIONAL_PREMIER' : 'WARM_START_VERIFIED');
    return { league:'PREMIER', upperLayerIncluded:true, proofLevel, evidence,
      reason: forwardVerified ? 'Tarihsel LAB + kendi Exit + 5 ileri pozitif kapanış'
        : proofLevel === 'RECENT5_PROVISIONAL_PREMIER' ? `Son 5 ekonomik sonuç pozitif + kendi pozitif Exit | Güven yalnız sıralama %${evidence.confidence}`
        : proofLevel === 'WARM_START_VERIFIED' ? `Kendi pozitif tarihsel kanıtı + kendi pozitif Exit | Güven yalnız sıralama %${evidence.confidence}`
        : 'Tarihsel LAB + kendi pozitif Exit; sanal geniş test kabulü' };
  }
  if (historicalReady || champion?.warmStartCandidate) return { league:'CHAMPIONSHIP', upperLayerIncluded:false,
    proofLevel: ownExitReady ? 'FORWARD_PENDING' : 'OWN_EXIT_PENDING', evidence,
    reason: ownExitReady ? 'Pozitif toplam/son5 ekonomik kanıt veya ileri kanıt bekliyor' : 'Kendi pozitif LAB Exit kanıtı bekliyor' };
  return { league:'DEVELOPMENT', upperLayerIncluded:false, proofLevel:'LEARNING', evidence, reason:'Tarihsel LAB şartları oluşmadı' };
}
function rowFromChampion(champion) {
  const tier = championTier(champion);
  return {
    ...champion,
    labLeague: tier.league,
    upperLayerIncluded: tier.upperLayerIncluded,
    proofLevel: tier.proofLevel,
    admissionReason: tier.reason,
    evidence: tier.evidence,
    realTradingAuthorized: false,
    sizeMultiplier: tier.upperLayerIncluded ? 1 : 0
  };
}
function build({ catalogue = null, persist = true, force = false } = {}) {
  const cacheMs = Math.max(1000, num(ayarlar.labPremierModelCacheMs, 30000));
  if (!catalogue && !force && cachedLeagueModel && (Date.now() - cachedLeagueAt) < cacheMs) return cachedLeagueModel;
  const source = catalogue || labChampion.build({ persist: false });
  const merged = [...(source?.labChampions || []), ...(source?.evidenceCandidates || [])];
  const unique = [...new Map(merged.map(row => [row.labKey, row])).values()];
  const rows = unique.map(rowFromChampion);
  const premier = rows.filter(x => x.labLeague === 'PREMIER');
  const championship = rows.filter(x => x.labLeague === 'CHAMPIONSHIP');
  const verified = premier.filter(x => x.proofLevel === 'FORWARD_VERIFIED');
  const historicalTest = premier.filter(x => x.proofLevel === 'HISTORICAL_POSITIVE_EXIT_TEST');
  const warmStart = premier.filter(x => x.proofLevel === 'WARM_START_VERIFIED');
  const recent5Provisional = premier.filter(x => x.proofLevel === 'RECENT5_PROVISIONAL_PREMIER');
  const model = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    experimentId: ayarlar.labPremierExperimentId || 'LAB-PREMIER-TRUE-LEAGUE-2026-07-19',
    authority: 'LAB_DNA_ONLY',
    familyRole: 'PERMANENT_MARKET_MEMORY_NO_ORDER_AUTHORITY',
    realTradingAuthorized: false,
    historicalChampionCount: rows.length,
    premierCount: premier.length,
    championshipCount: championship.length,
    forwardVerifiedCount: verified.length,
    historicalTestCount: historicalTest.length,
    warmStartCount: warmStart.length,
    recent5ProvisionalCount: recent5Provisional.length,
    premier,
    championship,
    allCandidates: rows,
    policy: {
      familyOrderAuthority: false,
      labPremierOrderAuthority: true,
      championshipOrderAuthority: false,
      equalVirtualSize: true,
      premierSizeMultiplier: 1,
      championshipSizeMultiplier: 0,
      universalEvidenceEngine: true,
      warmStartEnabled: ayarlar.evidenceWarmStartAktif !== false,
      recent5PositiveAdmissionEnabled: ayarlar.evidenceRecent5Aktif !== false,
      confidenceIsRankingOnly: true,
      historicalPositiveExitTestEnabled: ayarlar.labPremierTarihselTestAktif !== false,
      forwardVerificationRequired: ayarlar.labPremierIleriDogrulamaZorunlu === true,
      forwardVerificationClosed: Math.max(1, num(ayarlar.labChampionForwardMinKapanis, 5)),
      secondOrderCreated: false,
      realTradingAuthorized: false
    }
  };
  if (!catalogue) { cachedLeagueModel = model; cachedLeagueAt = Date.now(); }
  if (persist) {
    ensureDir();
    io.writeJsonAtomic(MODEL_FILE, model);
  }
  return model;
}
function identityFor(pos) {
  return hierarchy.decoratePosition(pos, { source: 'LAB_PREMIER_DECISION' });
}
function evaluate(pos, { model = null, realMode = false } = {}) {
  const identities = identityFor(pos);
  const leagueModel = model || build({ persist: false });
  const labKey = identities?.lab?.key || '';
  const row = leagueModel.allCandidates.find(x => x.labKey === labKey) || null;
  const tier = row ? championTier(row) : championTier(null);
  const upperLayerIncluded = Boolean(!realMode && row && tier.upperLayerIncluded);
  const reasons = [];
  if (!identities?.lab) reasons.push('LAB_KIMLIGI_YOK');
  if (!row) reasons.push('LAB_SAMPIYON_ADAYI_DEGIL');
  if (row && !tier.upperLayerIncluded) reasons.push(tier.proofLevel);
  if (realMode) reasons.push('LAB_PREMIER_GERCEK_EMIR_YETKISI_KAPALI');
  const decision = {
    version: VERSION,
    at: new Date().toISOString(),
    symbol: pos?.sym || '',
    side: pos?.yon || '',
    familyDnaId: identities?.family?.id || null,
    familyDnaLabel: identities?.family?.label || 'DNA #YOK',
    familyKey: identities?.family?.key || '',
    labDnaId: identities?.lab?.id || null,
    labDnaLabel: identities?.lab?.label || 'LAB #YOK',
    labKey,
    fullDnaId: identities?.full?.id || null,
    fullDnaLabel: identities?.full?.label || 'FULL #YOK',
    fullKey: identities?.full?.key || '',
    labLeague: row ? tier.league : 'DEVELOPMENT',
    proofLevel: row ? tier.proofLevel : 'LEARNING',
    admissionReason: row ? tier.reason : 'LAB şampiyon şartları oluşmadı',
    upperLayerIncluded,
    virtualShadowOnly: !upperLayerIncluded,
    sizeMultiplier: upperLayerIncluded ? 1 : 0,
    historical: row?.historical || null,
    recent5: row?.recent5 || null,
    evidence: row?.evidence || null,
    forward: row?.forward || null,
    exit: row?.exit || null,
    realTradingAuthorized: false,
    allowed: !realMode,
    reasons
  };
  pos.labPremierDecision = decision;
  return decision;
}
function frozenExit(decision) {
  const exit = decision?.exit;
  if (!decision?.upperLayerIncluded || !exit?.positive || !exit?.algorithmId) return null;
  const assignedAt = decision.at || new Date().toISOString();
  const assignmentId = `${decision.labDnaLabel}|${decision.labKey}|${exit.algorithmId}|${assignedAt}`;
  return {
    ready: true,
    algorithmId: exit.algorithmId,
    label: exit.algorithmLabel,
    scope: 'LAB_PREMIER_OWN_EXIT',
    selectionQuality: 'POSITIVE_CONFIRMED',
    executionPolicy: 'LAB_PREMIER_VALIDATED_OWN_EXIT_VIRTUAL_ACTIVE',
    samples: num(exit.samples),
    beatRate: num(exit.beatRate),
    profitFactor: num(exit.profitFactor),
    netUsdt: num(exit.netUsdt),
    reason: 'LAB Premier kendi tarihsel doğrulanmış Exit’i',
    activeForPosition: true,
    assignmentId,
    assignedAt,
    immutable: true,
    source: 'LAB_PREMIER'
  };
}
function applyToPosition(pos, decision = null) {
  if (!pos) return null;
  const d = decision || evaluate(pos, { realMode: pos.sanal === false });
  pos.labPremierDecision = d;
  pos.leagueShadowOnly = !d.upperLayerIncluded;
  pos.virtualAccountIncluded = d.upperLayerIncluded;
  pos.labLeagueAtOpen = d.labLeague;
  pos.labProofLevelAtOpen = d.proofLevel;

  const frozen = frozenExit(d);
  if (frozen) {
    pos.executionExitAssignment = frozen;
    pos.exitPlanShadow = {
      version: VERSION,
      createdAt: frozen.assignedAt,
      ready: true,
      selectedAlgorithmId: frozen.algorithmId,
      selectedAlgorithmLabel: frozen.label,
      samples: frozen.samples,
      beatRate: frozen.beatRate,
      profitFactor: frozen.profitFactor,
      netUsdt: frozen.netUsdt,
      selectionScope: frozen.scope,
      selectionQuality: frozen.selectionQuality,
      reason: frozen.reason,
      assignmentId: frozen.assignmentId,
      signature: `${d.labKey}|DETAIL=LAB_PREMIER`,
      currentRegime: d.exit?.currentRegime || null
    };
    pos.exitPlanActiveForVirtual = true;
  } else if (pos.sanal) {
    pos.exitPlanActiveForVirtual = Boolean(pos.executionExitAssignment?.activeForPosition);
  }
  return d;
}
function ensureLabBucket(state, decision) {
  const key = decision.labKey;
  if (!state.byLab[key]) {
    state.byLab[key] = {
      labDnaId: decision.labDnaId,
      labDnaLabel: decision.labDnaLabel,
      labKey: decision.labKey,
      familyDnaLabel: decision.familyDnaLabel,
      proofLevelAtFirstOpen: decision.proofLevel,
      exitAlgorithmId: decision.exit?.algorithmId || 'ACTUAL',
      exitAlgorithmLabel: decision.exit?.algorithmLabel || 'Mevcut Kademe Sistemi',
      bucket: blankBucket(),
      lastUpdatedAt: null
    };
  }
  return state.byLab[key];
}
function snapshot(pos) {
  if (!pos || pos.sanal === false || ayarlar.labPremierAktif === false) return null;
  const decision = pos.labPremierDecision || applyToPosition(pos);
  if (!decision?.upperLayerIncluded) return null;
  const observation = {
    version: VERSION,
    openedAt: new Date().toISOString(),
    symbol: pos.sym || '',
    side: pos.yon || '',
    labDnaId: decision.labDnaId,
    labDnaLabel: decision.labDnaLabel,
    labKey: decision.labKey,
    familyDnaLabel: decision.familyDnaLabel,
    proofLevel: decision.proofLevel,
    labLeague: 'PREMIER',
    exitAlgorithmId: decision.exit?.algorithmId || 'ACTUAL',
    exitAlgorithmLabel: decision.exit?.algorithmLabel || 'Mevcut Kademe Sistemi',
    upperLayerIncluded: true,
    samePosition: true,
    secondOrderCreated: false,
    realTradingAuthorized: false
  };
  pos.labPremierObservation = observation;
  const state = readState();
  state.aggregate.opened++;
  state.aggregate.active++;
  const row = ensureLabBucket(state, decision);
  row.bucket.opened++;
  row.bucket.active++;
  row.lastUpdatedAt = observation.openedAt;
  state.updatedAt = observation.openedAt;
  writeState(state);
  return observation;
}
function outcomeFrom(result = {}) {
  const explicit = String(result.outcome || result.sonuc || '').toUpperCase();
  if (['TP', 'SL', 'BE'].includes(explicit)) return explicit;
  const net = num(result.net ?? result.netKarZarar);
  if (Math.abs(net) <= 0.000001) return 'BE';
  return net > 0 ? 'TP' : 'SL';
}
function applyClosed(bucket, net, commission, outcome) {
  bucket.active = Math.max(0, num(bucket.active) - 1);
  bucket.closed++;
  bucket.net += net;
  bucket.commission += Math.max(0, commission);
  if (net > 0) bucket.grossProfit += net;
  else if (net < 0) bucket.grossLoss += Math.abs(net);
  if (outcome === 'TP') bucket.tp++;
  else if (outcome === 'BE') bucket.be++;
  else bucket.sl++;
}
function close(pos, result = {}) {
  const observation = pos?.labPremierObservation;
  if (!observation) return null;
  const net = num(result.net ?? result.netKarZarar);
  const commission = Math.max(0, num(result.commission ?? result.komisyon));
  const outcome = outcomeFrom(result);
  const closedAt = new Date().toISOString();
  const state = readState();
  applyClosed(state.aggregate, net, commission, outcome);
  const decision = pos.labPremierDecision || {
    labKey: observation.labKey,
    labDnaId: observation.labDnaId,
    labDnaLabel: observation.labDnaLabel,
    familyDnaLabel: observation.familyDnaLabel,
    proofLevel: observation.proofLevel,
    exit: { algorithmId: observation.exitAlgorithmId, algorithmLabel: observation.exitAlgorithmLabel }
  };
  const row = ensureLabBucket(state, decision);
  applyClosed(row.bucket, net, commission, outcome);
  row.lastUpdatedAt = closedAt;
  const trade = {
    version: VERSION,
    openedAt: observation.openedAt,
    closedAt,
    tradeId: pos.sanalOrderId || pos.tradeId || '',
    symbol: pos.sym || observation.symbol,
    side: pos.yon || observation.side,
    labDnaId: observation.labDnaId,
    labDnaLabel: observation.labDnaLabel,
    labKey: observation.labKey,
    familyDnaLabel: observation.familyDnaLabel,
    proofLevel: observation.proofLevel,
    exitAlgorithmId: observation.exitAlgorithmId,
    exitAlgorithmLabel: observation.exitAlgorithmLabel,
    outcome,
    net: round(net),
    commission: round(commission),
    samePosition: true,
    secondOrderCreated: false,
    realTradingAuthorized: false
  };
  state.lastTrades = [trade, ...state.lastTrades].slice(0, 100);
  state.updatedAt = closedAt;
  writeState(state);
  appendTrade(trade);
  return trade;
}
function activeRows(activePositions = []) {
  return (activePositions || []).filter(p => p?.labPremierObservation?.upperLayerIncluded).map(p => ({
    symbol: p.sym || '', side: p.yon || '', labDnaLabel: p.labPremierObservation.labDnaLabel,
    familyDnaLabel: p.labPremierObservation.familyDnaLabel,
    proofLevel: p.labPremierObservation.proofLevel,
    exitAlgorithmLabel: p.labPremierObservation.exitAlgorithmLabel
  }));
}
function summaryModel(activePositions = [], { force = false } = {}) {
  const state = readState();
  const league = build({ persist: false, force });
  return {
    version: VERSION,
    experimentId: state.experimentId,
    league,
    aggregate: metrics(state.aggregate),
    byLab: Object.values(state.byLab || {}).map(row => ({ ...row, metrics: metrics(row.bucket) })),
    active: activeRows(activePositions),
    lastTrades: state.lastTrades,
    updatedAt: state.updatedAt
  };
}
function compactTelegram(activePositions = []) {
  const model = summaryModel(activePositions);
  const a = model.aggregate;
  return `🧬 <b>LAB PREMIER SANAL TESTİ</b>\n`
    + `🏆 Premier LAB ${model.league.premierCount} | 🔥 Warm ${model.league.warmStartCount} | ⚡ Son5 ${model.league.recent5ProvisionalCount || 0} | ✅ İleri ${model.league.forwardVerifiedCount} | ⏳ Tarihsel ${model.league.historicalTestCount}\n`
    + `📦 Açılan ${a.opened} | Aktif ${model.active.length} | Kapalı ${a.closed} | Başarı %${a.winRate.toFixed(2)}\n`
    + `💎 Net ${a.net >= 0 ? '+' : ''}${a.net.toFixed(4)} | PF ${a.profitFactor >= 999 ? '∞' : a.profitFactor.toFixed(2)} | Exp ${a.expectancy >= 0 ? '+' : ''}${a.expectancy.toFixed(4)}\n`
    + `🔒 Alt lig tek gölge sanal pozisyonla öğrenir ve Telegram verir; Premier kasasına girmez`;
}
function telegram(model = null, limit = 9) {
  const data = model || summaryModel([]);
  const league = data.league || build({ persist: false });
  let text = '\n\n🏁 <b>LAB PREMIER — GERÇEK DNA LİGİ</b>\n';
  text += `🧬 Yetkili yarışmacı: LAB DNA | Family rolü: kalıcı piyasa hafızası\n`;
  text += `🏆 Premier LAB ${league.premierCount} | 🔥 Warm Start ${league.warmStartCount} | ⚡ Son5 Provisional ${league.recent5ProvisionalCount || 0} | ✅ İleri doğrulanmış ${league.forwardVerifiedCount} | ⏳ Tarihsel test ${league.historicalTestCount} | 🥈 Gölge Championship ${league.championshipCount}\n`;
  text += `⚖️ Premier x1 üst kasa | Championship/Development tek gölge sanal pozisyonla öğrenir, Telegram verir, üst kasaya sayılmaz | Eski Family 1/0.25 kuralı kullanılmaz\n`;
  if (league.premier.length) {
    text += '⭐ <b>LAB PREMIER LİSTESİ</b>\n';
    text += league.premier.slice(0, Math.max(1, limit)).map((row, i) => {
      const h = row.historical || {};
      const f = row.forward?.metrics || {};
      const r = row.recent5 || {};
      return `${i + 1}. ${row.labDnaLabel} | ${row.familyDnaLabel} — ${row.label}\n`
        + `   Tarihsel N${num(h.total)} | WR %${num(h.winRate).toFixed(1)} | PF ${num(h.profitFactor) >= 999 ? '∞' : num(h.profitFactor).toFixed(2)} | Net ${num(h.net) >= 0 ? '+' : ''}${num(h.net).toFixed(2)}\n`
        + `   🎯 ${row.exit?.algorithmLabel || 'Exit yok'} | ExitN${num(row.exit?.samples)} | PF ${num(row.exit?.profitFactor).toFixed(2)} | ${row.proofLevel}\n`
        + `   ⚡ Son5 N${num(r.total)} | PF ${num(r.profitFactor).toFixed(2)} | Exp ${num(r.expectancy).toFixed(4)} | Net ${num(r.net).toFixed(4)}\n`
        + `   🔥 Kanıt güveni %${num(row.evidence?.confidence).toFixed(1)} (${row.evidence?.confidenceBand || 'DENEYSEL'}) | SIRALAMA; işlem kapısı değil\n`
        + `   🧪 İleri N${num(f.closed)}/${Math.max(1, num(ayarlar.labChampionForwardMinKapanis, 5))} | PF ${num(f.profitFactor).toFixed(2)} | Exp ${num(f.expectancy).toFixed(4)} | Net ${num(f.net).toFixed(4)}`;
    }).join('\n');
  }
  text += '\n🔒 Tek sanal pozisyon; ikinci emir yok. Gerçek emir yetkisi kapalı.';
  return text;
}
function audit() {
  const league = build({ persist: false, force: true });
  const state = readState();
  return {
    authority: league.authority,
    familyOrderAuthority: league.policy.familyOrderAuthority,
    labPremierOrderAuthority: league.policy.labPremierOrderAuthority,
    premierCount: league.premierCount,
    forwardVerifiedCount: league.forwardVerifiedCount,
    championshipSizeMultiplier: league.policy.championshipSizeMultiplier,
    observationOpened: num(state.aggregate.opened),
    observationClosed: num(state.aggregate.closed),
    secondOrderCreated: false,
    realTradingAuthorized: false
  };
}

module.exports = {
  VERSION, STATE_FILE, MODEL_FILE, TRADES_FILE,
  readState, writeState, metrics, championTier, build, evaluate, frozenExit,
  applyToPosition, snapshot, close, summaryModel, compactTelegram, telegram, audit
};
