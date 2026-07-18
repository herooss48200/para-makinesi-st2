/**
 * AGROS v3.12.0 - DNA LEAGUE ENGINE
 *
 * Amaç:
 * - DNA'ları Premier, Championship, Development ve Historical liglerine ayırmak.
 * - Piyasa yönü değişimini son kapanışlardaki LONG/SHORT performansından algılamak.
 * - Belirli kapanış aralıklarında otomatik terfi/düşme yapmak ve transfer geçmişini saklamak.
 * - Gelecekte Argos Dev Console'un okuyabileceği kalıcı JSON çıktıları üretmek.
 *
 * Güvenlik:
 * - Trade Engine'i filtrelemez; emir açmaz veya kapatmaz.
 * - İlk sürümde yalnızca karar/etiketleme katmanıdır.
 * - Hiçbir DNA silinmez; tüm DNA'lar lig veya arşiv kaydında korunur.
 */

const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const dnaEvolution = require('./38_dna_evolution_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');

const VERSION = 'v4.4.3-LEAGUE-STATE-RECLASSIFICATION';
const CLASSIFICATION_POLICY_VERSION = 2;
const DATA_DIR = path.join(__dirname, 'data');
const LEAGUE_FILE = path.join(DATA_DIR, 'dna-league-state.json');
const TRANSFER_FILE = path.join(DATA_DIR, 'dna-league-transfers.jsonl');
const CONSOLE_FILE = path.join(DATA_DIR, 'dna-league-console.json');

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Number(num(value).toFixed(digits));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, num(value)));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}

function atomicWriteJson(file, value) {
  ensureDataDir();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function directionFromKey(key = '') {
  return String(key).match(/(?:^|\|)YON=(LONG|SHORT)(?:\||$)/i)?.[1]?.toUpperCase() || 'UNKNOWN';
}


function normalizeSignatureKey(key = '') {
  const raw = String(key || '').trim().toUpperCase();
  if (!raw) return '';
  const parts = Object.create(null);
  for (const token of raw.split('|')) {
    const i = token.indexOf('=');
    if (i <= 0) continue;
    parts[token.slice(0, i).trim()] = token.slice(i + 1).trim();
  }
  const yon = parts.YON || directionFromKey(raw);
  const btc = parts.BTC || raw.match(/BTC=([01]{4})/)?.[1] || '';
  const coin = parts.COIN || raw.match(/COIN=([01]{4})/)?.[1] || '';
  if (!yon || yon === 'UNKNOWN' || !btc || !coin) return raw.replace(/\s+/g, '');
  const ordered = [`YON=${yon}`, `BTC=${btc}`, `COIN=${coin}`];
  if (parts.BTC_TF !== undefined) ordered.push(`BTC_TF=${parts.BTC_TF || '-'}`);
  if (parts.COIN_TF !== undefined) ordered.push(`COIN_TF=${parts.COIN_TF || '-'}`);
  if (parts.BB !== undefined) ordered.push(`BB=${parts.BB || 'YOK'}`);
  return ordered.join('|');
}

function baseSignatureKey(key = '') {
  const normalized = normalizeSignatureKey(key);
  const yon = directionFromKey(normalized);
  const btc = normalized.match(/BTC=([01]{4})/)?.[1] || '';
  const coin = normalized.match(/COIN=([01]{4})/)?.[1] || '';
  return yon !== 'UNKNOWN' && btc && coin ? `YON=${yon}|BTC=${btc}|COIN=${coin}` : '';
}

function shortKey(key = '') {
  const direction = directionFromKey(key);
  const btc = String(key).match(/BTC=([01]{4})/i)?.[1] || '????';
  const coin = String(key).match(/COIN=([01]{4})/i)?.[1] || '????';
  return `${direction} BTC ${btc} Coin ${coin}`;
}

function metricIndex(model = {}, key = 'key') {
  return new Map((model?.all || model?.allDnas || []).map(row => [String(row?.[key] || row?.key || ''), row]));
}

function inferPerformanceRegime(trades = [], window = 60, edgeThreshold = 0.025) {
  const recent = trades.slice(-Math.max(20, window));
  const groups = { LONG: [], SHORT: [] };
  for (const trade of recent) {
    const direction = String(trade.direction || directionFromKey(trade.key)).toUpperCase();
    if (groups[direction]) groups[direction].push(trade);
  }
  const long = dnaEvolution.metrics(groups.LONG);
  const short = dnaEvolution.metrics(groups.SHORT);
  const edge = long.expectancy - short.expectancy;
  let activeDirection = 'NEUTRAL';
  if (edge >= edgeThreshold && long.total >= 10) activeDirection = 'LONG';
  else if (edge <= -edgeThreshold && short.total >= 10) activeDirection = 'SHORT';
  return {
    type: 'RECENT_PERFORMANCE_REGIME',
    window: recent.length,
    activeDirection,
    edge: round(edge, 6),
    long,
    short,
    note: 'Rejim, fiyat tahmini değil; son kapanışlarda hangi yönün daha kârlı çalıştığını gösterir.'
  };
}

function emptyExitModel() {
  return { version: dynamicExit.VERSION, generatedAt: null, currentRegime: { key: 'MIXED|VOL_MEDIUM', regime: 'MIXED', regimeFamily: 'MIXED', volatility: 'MEDIUM', window: 0, distribution: {} }, dna: [] };
}

function exitIndex() {
  // Kritik RAM koruması: lig hesaplanırken büyük exit-replay geçmişini otomatik olarak
  // yeniden kurma. Dinamik model kapanış aralığında 22_exit_replay_engine tarafından
  // kontrollü güncellenir. Model henüz yoksa güvenli ACTUAL fallback kullanılır.
  const model = dynamicExit.readModel() || emptyExitModel();
  return { model, map: new Map((model?.dnaBase || model?.dna || []).map(row => [normalizeSignatureKey(String(row.key || '')), row])) };
}

function exitEvidence(key, exits) {
  const row = exits.map.get(normalizeSignatureKey(key)) || exits.map.get(baseSignatureKey(key));
  const regimeKey = exits.model?.currentRegime?.key;
  const regime = row?.regimes?.[regimeKey];
  const best = regime?.best || row?.allBest;
  const minSamples = Math.max(1, num(ayarlar.dnaLeagueExitMinOrnek, ayarlar.dynamicExitMinOrnek || 12));
  const ready = Boolean(best && best.algorithmId !== 'ACTUAL' && num(best.samples) >= minSamples && num(best.beatRate) >= num(ayarlar.dnaLeagueExitMinBeatRate, 55) && num(best.netUsdt) > 0 && num(best.profitFactor) > 1);
  return {
    ready,
    dynamic: true,
    regimeKey: regimeKey || 'BILINMIYOR',
    selectionScope: regime?.best ? 'EXACT_CURRENT_REGIME' : (row?.allBest ? 'DNA_ALL_REGIMES_FALLBACK' : 'NONE'),
    algorithmId: ready ? best.algorithmId : 'ACTUAL',
    algorithmLabel: ready ? best.algorithmLabel : 'Mevcut Kademe Sistemi',
    samples: num(best?.samples),
    beatRate: round(best?.beatRate, 1),
    netUsdt: round(best?.netUsdt, 4),
    avgNetUsdt: round(best?.avgNetUsdt, 6),
    deltaUsdt: round(best?.deltaUsdt, 4),
    profitFactor: round(best?.profitFactor, 2),
    strengthening: Boolean(best?.strengthening)
  };
}

function scorePlayer(row, confidence, evolution, regime, exit) {
  const recent20 = evolution?.windows?.[20] || {};
  const direction = directionFromKey(row.key);
  const regimeAlignment = regime.activeDirection === 'NEUTRAL' ? 0 : direction === regime.activeDirection ? 8 : -8;
  const momentum = clamp(num(evolution?.momentum?.score), -100, 100) * 0.12;
  const stability = clamp(num(evolution?.stability?.score), 0, 100) * 0.08;
  const recentEdge = clamp(num(recent20.expectancy) / 0.20, -1, 1) * 12;
  const exitProfitScore = exit.ready ? (
    clamp(num(exit.avgNetUsdt) / 0.20, -1, 1) * 12 +
    clamp((num(exit.profitFactor) - 1) * 12, -10, 18) +
    clamp(num(exit.beatRate) - 50, 0, 30) * 0.25
  ) : 0;
  const base = num(confidence?.metaScore, 50) * 0.48 + num(confidence?.confidenceV2, row.confidenceScore || 0) * 0.20 + num(row.score) * 0.12;
  return round(clamp(base + momentum + stability + recentEdge + regimeAlignment + exitProfitScore, 0, 100), 2);
}

function buildPlayers(models = {}, options = {}) {
  // Kapanışlar tam BB/TF anahtarıyla, ranking ise temel YON/BTC/COIN anahtarıyla gelebilir.
  // İki indeks birlikte tutulur; böylece son 5 form hiçbir zaman anahtar biçimi yüzünden kaybolmaz.
  const exactTradeGroups = new Map();
  const baseTradeGroups = new Map();
  for (const trade of models.trades || []) {
    const key = normalizeSignatureKey(trade.key);
    if (!key) continue;
    if (!exactTradeGroups.has(key)) exactTradeGroups.set(key, []);
    exactTradeGroups.get(key).push(trade);
    const base = baseSignatureKey(key);
    if (base) {
      if (!baseTradeGroups.has(base)) baseTradeGroups.set(base, []);
      baseTradeGroups.get(base).push(trade);
    }
  }
  const ranking = models.ranking || {};
  const confidenceMap = metricIndex(models.confidence || {});
  const evolutionMap = metricIndex(models.evolution || {});
  const exits = exitIndex();
  const regime = models.regime || inferPerformanceRegime(models.trades || [], options.regimeWindow, options.regimeEdgeThreshold);

  return (ranking.all || []).map(row => {
    const confidence = confidenceMap.get(String(row.key)) || {};
    const evolution = evolutionMap.get(String(row.key)) || {};
    const exit = exitEvidence(String(row.key), exits);
    const leagueScore = scorePlayer(row, confidence, evolution, regime, exit);
    const recent20 = evolution?.windows?.[20] || {};
    const normalizedRowKey = normalizeSignatureKey(String(row.key));
    const rowTrades = exactTradeGroups.get(normalizedRowKey) || baseTradeGroups.get(baseSignatureKey(normalizedRowKey)) || [];
    const recent5 = dnaEvolution.windowMetrics(rowTrades, 5);
    const pairMetrics = exit.ready ? {
      source: 'DNA_BEST_VALIDATED_EXIT',
      algorithmId: exit.algorithmId,
      algorithmLabel: exit.algorithmLabel,
      total: exit.samples,
      expectancy: round(exit.avgNetUsdt, 6),
      profitFactor: round(exit.profitFactor, 3),
      net: round(exit.netUsdt, 6),
      beatRate: round(exit.beatRate, 1)
    } : {
      source: 'DNA_ACTUAL_EXIT', algorithmId: 'ACTUAL', algorithmLabel: 'Mevcut Kademe Sistemi',
      total: num(row.total), expectancy: round(row.expectancy, 6), profitFactor: round(row.profitFactor, 3), net: round(row.net, 6), beatRate: 0
    };
    return {
      key: normalizeSignatureKey(row.key),
      label: row.label || shortKey(row.key),
      direction: directionFromKey(row.key),
      total: num(row.total),
      expectancy: round(row.expectancy, 6),
      profitFactor: round(row.profitFactor, 3),
      net: round(row.net, 6),
      rankingScore: round(row.score, 2),
      metaScore: round(confidence.metaScore, 1),
      confidence: round(confidence.confidenceV2, row.confidenceScore || 0),
      recommendation: confidence.recommendation || row.verdict || 'WATCH',
      recent5: { total: num(recent5.total), expectancy: round(recent5.expectancy, 6), profitFactor: round(recent5.profitFactor, 3), net: round(recent5.net, 4) },
      recent20: {
        total: num(recent20.total),
        expectancy: round(recent20.expectancy, 6),
        profitFactor: round(recent20.profitFactor, 3),
        net: round(recent20.net, 4)
      },
      momentum: {
        score: round(evolution?.momentum?.score, 1),
        status: evolution?.momentum?.status || 'YENI'
      },
      stability: round(evolution?.stability?.score, 1),
      stage: evolution?.stage || (num(row.total) >= 20 ? 'BUYUYOR' : 'DENEYSEL'),
      death: evolution?.death || 'YOK',
      regimeAligned: regime.activeDirection === 'NEUTRAL' || directionFromKey(row.key) === regime.activeDirection,
      exit,
      pairMetrics,
      effectiveExpectancy: pairMetrics.expectancy,
      effectiveProfitFactor: pairMetrics.profitFactor,
      effectiveNet: pairMetrics.net,
      leagueScore
    };
  }).sort((a, b) => b.leagueScore - a.leagueScore || b.expectancy - a.expectancy || b.total - a.total);
}

function historicalProfitGate(player, minSamples) {
  const m = player.pairMetrics || { total: player.total, expectancy: player.expectancy, profitFactor: player.profitFactor, net: player.net };
  return num(m.total) >= minSamples && num(m.expectancy) > 0 && num(m.profitFactor) > 1 && num(m.net) > 0;
}

function recentFivePositive(player) {
  const r = player.recent5 || {};
  // Kusursuzluk veya %100 kazanma aranmaz. Son beş işlemin toplam ekonomik sonucu pozitiftir.
  return num(r.total) >= 5 && num(r.expectancy) > 0 && num(r.profitFactor) > 1 && num(r.net) > 0;
}

function qualify(player, league, options = {}) {
  const premierMin = Math.max(1, num(options.premierMinSample, ayarlar.dnaLeaguePremierMinOrnek || 5));
  const championshipMin = Math.max(1, num(options.championshipMinSample, ayarlar.dnaLeagueChampionshipMinOrnek || 5));
  const premierMinConfidence = num(options.premierMinConfidence, ayarlar.dnaLeaguePremierMinGuven || 50);
  const historicalPositive = historicalProfitGate(player, premierMin);

  if (league === 'PREMIER') {
    // v4.5 Premier League 2.0: kabul kapısı yalnız gerçekleşmiş DNA performansıdır.
    // Son-5, güven, rejim ve Elite Exit metrikleri sıralama/audit bilgisidir; temel kapıyı değiştiremez.
    return historicalPositive && player.death !== 'OLUM_RISKI';
  }
  if (league === 'CHAMPIONSHIP') {
    const m = player.pairMetrics || { total: player.total, expectancy: player.expectancy, profitFactor: player.profitFactor, net: player.net };
    const nearPositive = num(m.total) >= championshipMin &&
      num(m.profitFactor) >= num(ayarlar.dnaLeagueChampionshipMinPf, 0.85) &&
      num(m.expectancy) >= num(ayarlar.dnaLeagueChampionshipMinExp, -0.05);
    // Geçmişi kârlı olup güncel formu Premier kapısını geçemeyen DNA burada x0.25 ile yaşamaya devam eder.
    return player.death !== 'OLUM_RISKI' && (historicalPositive || nearPositive);
  }
  return true;
}


function worstTen(players = [], options = {}) {
  const limit = Math.max(1, num(options.worstLimit, ayarlar.dnaLeagueWorstDnaLimit || 10));
  const minSamples = Math.max(1, num(options.worstMinSamples, ayarlar.dnaLeagueWorstMinOrnek || 5));
  return players
    .filter(p => num(p.recent5?.total) >= minSamples && num(p.recent5?.expectancy) < 0 && num(p.recent5?.profitFactor) < 1)
    .sort((a, b) => num(a.recent5.expectancy) - num(b.recent5.expectancy) || num(a.recent5.profitFactor) - num(b.recent5.profitFactor) || num(a.recent5.net) - num(b.recent5.net))
    .slice(0, limit)
    .map((p, index) => ({ ...p, worstRank: index + 1, virtualTradingBlocked: true, shadowLearning: true, blockReason: 'DYNAMIC_WORST_10_RECENT_5' }));
}

function audit(players = [], leagues = {}) {
  const minSample = Math.max(1, num(ayarlar.dnaLeaguePremierMinOrnek, 10));
  const profitable = players.filter(p => { const m=p.pairMetrics||p; return num(m.total)>=minSample && num(m.expectancy)>0 && num(m.profitFactor)>1 && num(m.net)>0; });
  const premierKeys = new Set((leagues.premier || []).map(p => p.key));
  const profitableOutsidePremier = profitable.filter(p => !premierKeys.has(p.key));
  const nearProfit = players.filter(p => { const m=p.pairMetrics||p; return num(m.total)>=minSample && !profitable.some(x=>x.key===p.key) && num(m.expectancy)>=-0.05 && num(m.profitFactor)>=0.85; });
  return {
    rule: `Premier League 2.0: gerçekleşmiş DNA performansı N>=${minSample}, Exp>0, PF>1, Net>0; son 5/güven/Elite Exit yalnız sıralama ve audit içindir; Championship: yakın-pozitif veya yeterli kanıtı henüz oluşmamış aday`,
    totalPlayers: players.length,
    profitableCount: profitable.length,
    premierCount: (leagues.premier || []).length,
    profitableOutsidePremierCount: profitableOutsidePremier.length,
    profitableOutsidePremier,
    nearProfitCount: nearProfit.length,
    topProfitable: profitable.slice().sort((a,b) => b.net-a.net || b.expectancy-a.expectancy).slice(0,20)
  };
}

function proposedLeagues(players, options = {}) {
  // v3.14: Premier artık kapasite/sayı ligi değildir. Kalite şartlarını sağlayan tüm DNA'lar girer.
  const championshipSize = Math.max(1, num(options.championshipSize, ayarlar.dnaLeagueChampionshipKapasite || 50));
  const premier = players.filter(x => qualify(x, 'PREMIER', options));
  const premierKeys = new Set(premier.map(x => x.key));
  const championship = players.filter(x => !premierKeys.has(x.key) && qualify(x, 'CHAMPIONSHIP', options)).slice(0, championshipSize);
  const upperKeys = new Set([...premierKeys, ...championship.map(x => x.key)]);
  const development = players.filter(x => !upperKeys.has(x.key) && x.total < num(ayarlar.dnaLeagueHistoricalMinOrnek, 20));
  const historical = players.filter(x => !upperKeys.has(x.key) && !development.some(d => d.key === x.key));
  return { premier, championship, development, historical };
}

/**
 * Tek DNA - tek lig garantisi.
 * Exit modelleri DNA kaydının altında yarışır; ayrı lig üyeliği oluşturmaz.
 * Eski state dosyalarında mükerrer DNA varsa en üst lig korunur.
 */
function normalizeUniqueLeagues(leagues = {}) {
  const result = { premier: [], championship: [], development: [], historical: [] };
  const seen = new Set();
  for (const league of ['premier', 'championship', 'development', 'historical']) {
    for (const row of leagues[league] || []) {
      const key = String(row?.key || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result[league].push(row);
    }
  }
  return result;
}

function duplicateLeagueKeys(leagues = {}) {
  const counts = new Map();
  for (const league of ['premier', 'championship', 'development', 'historical']) {
    for (const row of leagues[league] || []) {
      const key = String(row?.key || '');
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

function leagueMap(leagues = {}) {
  const map = new Map();
  for (const league of ['premier', 'championship', 'development', 'historical']) {
    for (const row of leagues[league] || []) map.set(row.key, league.toUpperCase());
  }
  return map;
}

function transferEvents(previous, next, totalTrades) {
  if (!previous?.leagues) return [];
  const oldMap = leagueMap(previous.leagues);
  const newMap = leagueMap(next);
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const events = [];
  for (const key of keys) {
    const from = oldMap.get(key) || 'UNRANKED';
    const to = newMap.get(key) || 'HISTORICAL';
    if (from === to) continue;
    events.push({
      version: VERSION,
      timestamp: new Date().toISOString(),
      totalTrades,
      key,
      label: next.get ? next.get(key)?.label : shortKey(key),
      from,
      to,
      type: to === 'PREMIER' ? 'PROMOTION_TO_PREMIER' : from === 'PREMIER' ? 'RELEGATION_FROM_PREMIER' : 'LEAGUE_CHANGE'
    });
  }
  return events;
}

function appendTransfers(events = []) {
  if (!events.length) return;
  ensureDataDir();
  fs.appendFileSync(TRANSFER_FILE, events.map(x => JSON.stringify(x)).join('\n') + '\n');
}

function classificationPolicyMigrationRequired(previous) {
  return num(previous?.classificationPolicyVersion, 0) !== CLASSIFICATION_POLICY_VERSION;
}

function shouldTransfer(previous, totalTrades, force = false) {
  if (force || !previous) return true;
  const interval = Math.max(1, num(ayarlar.dnaLeagueTransferKapanisAraligi, 25));
  return totalTrades - num(previous.lastTransferTradeCount) >= interval;
}

function build(models = {}, options = {}) {
  const evolutionModel = models.evolution || dnaEvolution.build({ minSample: ayarlar.dnaEvolutionMinOrnek || 10 });
  const loaded = models.trades ? { trades: models.trades } : dnaEvolution.loadTrades();
  const regime = inferPerformanceRegime(loaded.trades || [], num(options.regimeWindow, ayarlar.dnaLeagueRejimPenceresi || 60), num(options.regimeEdgeThreshold, ayarlar.dnaLeagueRejimEdgeEsik || 0.025));
  const players = buildPlayers({ ...models, evolution: evolutionModel, trades: loaded.trades || [], regime }, options);
  const previous = readJson(LEAGUE_FILE, null);
  const previousLeagueCount = Object.values(previous?.leagueSizes || {}).reduce((a, b) => a + num(b), 0);

  // Rapor çağrısında ağır ranking modeli henüz hazır değilse dolu ligi boş veriyle yeniden kurma.
  // Kalıcı lig üyelerini koru ve kurtarma sayacını gerçek kayıtlı DNA sayısından üret.
  if (!players.length && previous?.leagues && previousLeagueCount > 0) {
    const analyzedDna = Math.max(num(previous.totalDna), previousLeagueCount);
    return {
      ...previous,
      generatedAt: new Date().toISOString(),
      recovery: {
        ...(previous.recovery || {}),
        required: false,
        restoredFromLearning: true,
        analyzedDna,
        source: 'PERSISTED_LEAGUE_STATE'
      }
    };
  }

  const proposal = proposedLeagues(players, options);
  const recoveryRequired = !previous?.leagues || num(previous?.totalDna) === 0 || previousLeagueCount === 0;
  // Eski 42/0 gibi lig state'leri yeni kural yazıldıktan sonra transfer aralığı dolana kadar korunuyordu.
  // Politika sürümü değiştiğinde bir defalık zorunlu yeniden sınıflandırma yapılır.
  const policyMigrationRequired = classificationPolicyMigrationRequired(previous);
  const transferDue = shouldTransfer(previous, evolutionModel.totalTrades, options.forceTransfer === true || recoveryRequired || policyMigrationRequired);

  let leagues = normalizeUniqueLeagues(proposal);
  let events = [];
  let lastTransferTradeCount = evolutionModel.totalTrades;
  if (!transferDue && previous?.leagues) {
    const playerMap = new Map(players.map(x => [x.key, x]));
    leagues = normalizeUniqueLeagues(Object.fromEntries(Object.entries(previous.leagues).map(([league, rows]) => [league, (rows || []).map(old => playerMap.get(old.key) || old)])));
    lastTransferTradeCount = num(previous.lastTransferTradeCount);
  } else {
    leagues = normalizeUniqueLeagues(proposal);
    events = transferEvents(previous, leagues, evolutionModel.totalTrades);
  }

  const worst = worstTen(players, options);
  const worstKeys = new Set(worst.map(x => x.key));
  for (const player of players) { player.virtualTradingBlocked = worstKeys.has(player.key); player.shadowLearning = worstKeys.has(player.key); }

  const model = {
    version: VERSION,
    classificationPolicyVersion: CLASSIFICATION_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ADAPTIVE_OBSERVATION_NO_REAL_ORDER_FILTER',
    totalTrades: evolutionModel.totalTrades,
    totalDna: players.length,
    lastTransferTradeCount,
    nextTransferAt: lastTransferTradeCount + Math.max(1, num(ayarlar.dnaLeagueTransferKapanisAraligi, 25)),
    transferDue,
    recovery: { required: recoveryRequired, restoredFromLearning: recoveryRequired, analyzedDna: players.length, policyMigrationApplied: policyMigrationRequired },
    regime,
    leagueSizes: {
      premier: leagues.premier.length,
      championship: leagues.championship.length,
      development: leagues.development.length,
      historical: leagues.historical.length
    },
    leagues,
    worstTen: worst,
    worstTenCount: worst.length,
    audit: { ...audit(players, leagues), duplicateLeagueKeys: duplicateLeagueKeys(leagues), singleDnaSingleLeague: duplicateLeagueKeys(leagues).length === 0 },
    transfers: events,
    allPlayers: players,
    policy: {
      premierCanTrade: false,
      note: 'Lig hazırdır; gerçek emir filtresi ayrıca ve kontrollü biçimde etkinleştirilecektir.'
    }
  };

  if (options.persist !== false && ayarlar.dnaLeagueAktif !== false) {
    appendTransfers(events);
    atomicWriteJson(LEAGUE_FILE, model);
    atomicWriteJson(CONSOLE_FILE, {
      version: model.version,
      generatedAt: model.generatedAt,
      regime: model.regime,
      leagueSizes: model.leagueSizes,
      leagues: model.leagues,
      audit: model.audit,
      recentTransfers: events.slice(-20),
      nextTransferAt: model.nextTransferAt,
      policy: model.policy
    });
  }
  return model;
}


function leagueLookupDiagnostics(key, model = null, options = {}) {
  const current = model || readJson(LEAGUE_FILE, null);
  const wanted = normalizeSignatureKey(key);
  const base = baseSignatureKey(wanted);
  const leagues = current?.leagues || {};
  const leagueSizes = {};
  const exactMatches = [];
  const baseMatches = [];
  const samples = [];
  const sampleLimit = Math.max(1, num(options.sampleLimit, 8));

  for (const [league, rowsRaw] of Object.entries(leagues)) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    leagueSizes[String(league).toUpperCase()] = rows.length;
    for (const player of rows) {
      const normalized = normalizeSignatureKey(player?.key || '');
      const candidateBase = baseSignatureKey(normalized);
      if (normalized === wanted) exactMatches.push({ league: String(league).toUpperCase(), key: normalized });
      if (base && candidateBase === base) baseMatches.push({ league: String(league).toUpperCase(), key: normalized });
      if (samples.length < sampleLimit && normalized) samples.push({ league: String(league).toUpperCase(), key: normalized });
    }
  }

  let matchType = 'NONE';
  if (exactMatches.length === 1) matchType = 'EXACT_NORMALIZED';
  else if (exactMatches.length > 1) matchType = 'AMBIGUOUS_EXACT';
  else if (baseMatches.length === 1) matchType = 'UNIQUE_BASE_FALLBACK';
  else if (baseMatches.length > 1) matchType = 'AMBIGUOUS_BASE';

  return {
    version: VERSION,
    leagueFile: LEAGUE_FILE,
    modelLoaded: Boolean(current?.leagues),
    generatedAt: current?.generatedAt || null,
    requestedKey: String(key || ''),
    normalizedKey: wanted,
    baseKey: base,
    matchType,
    exactMatchCount: exactMatches.length,
    baseMatchCount: baseMatches.length,
    exactMatches,
    baseMatches: baseMatches.slice(0, 12),
    leagueSizes,
    totalPlayers: Object.values(leagueSizes).reduce((a, b) => a + num(b), 0),
    sampleKeys: samples
  };
}

function formatLeagueLookupDiagnostics(diag, context = {}) {
  const sizes = Object.entries(diag?.leagueSizes || {}).map(([k, v]) => `${k}:${v}`).join(' | ') || 'YOK';
  const exact = (diag?.exactMatches || []).map(x => `${x.league}:${x.key}`).join(' || ') || 'YOK';
  const base = (diag?.baseMatches || []).map(x => `${x.league}:${x.key}`).join(' || ') || 'YOK';
  const sample = (diag?.sampleKeys || []).map(x => `${x.league}:${x.key}`).join(' || ') || 'YOK';
  return [
    `🧪 [LEAGUE DEBUG] ${context.symbol || '-'} ${context.side || '-'}`,
    `Aranan DNA: ${diag?.requestedKey || 'YOK'}`,
    `Normalize DNA: ${diag?.normalizedKey || 'YOK'}`,
    `Temel DNA: ${diag?.baseKey || 'YOK'}`,
    `Model: ${diag?.modelLoaded ? 'YUKLU' : 'YOK'} | Üretim: ${diag?.generatedAt || 'BILINMIYOR'}`,
    `Lig boyutları: ${sizes} | Toplam: ${num(diag?.totalPlayers)}`,
    `Eşleşme: ${diag?.matchType || 'NONE'} | Exact:${num(diag?.exactMatchCount)} | Base:${num(diag?.baseMatchCount)}`,
    `Exact adaylar: ${exact}`,
    `Base adaylar: ${base}`,
    `Örnek lig anahtarları: ${sample}`,
    `Karar ligi: ${context.league || 'BILINMIYOR'} | Sebep: ${context.reason || 'YOK'}`
  ].join('\n');
}

function isWorstDna(key, model = null) {
  const current = model || readJson(LEAGUE_FILE, null);
  const wanted = normalizeSignatureKey(key);
  return (current?.worstTen || []).find(x => normalizeSignatureKey(x.key) === wanted) || null;
}

function findPlayer(key, model = null) {
  const current = model || readJson(LEAGUE_FILE, null);
  if (!current?.leagues || !key) return null;
  const wanted = normalizeSignatureKey(key);
  for (const [league, rows] of Object.entries(current.leagues)) {
    const player = (rows || []).find(x => normalizeSignatureKey(x.key) === wanted);
    if (player) return { ...player, key: normalizeSignatureKey(player.key), league: league.toUpperCase(), matchType: 'EXACT_NORMALIZED' };
  }
  // Güvenli geriye uyumluluk: eski model yalnızca temel YON/BTC/COIN anahtarı taşıyorsa
  // ve tek bir aday varsa eşleştir. Birden fazla BB/TF varyantında fail-closed kalır.
  const base = baseSignatureKey(wanted);
  if (!base) return null;
  const matches = [];
  for (const [league, rows] of Object.entries(current.leagues)) {
    for (const player of rows || []) if (baseSignatureKey(player.key) === base) matches.push({ ...player, league: league.toUpperCase() });
  }
  return matches.length === 1 ? { ...matches[0], key: normalizeSignatureKey(matches[0].key), matchType: 'UNIQUE_BASE_FALLBACK' } : null;
}

function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return normalizeSignatureKey(sig.key || (sig.btcBits && sig.coinBits && pos?.yon ? `YON=${String(pos.yon).toUpperCase()}|BTC=${sig.btcBits}|COIN=${sig.coinBits}` : ''));
}

function attachToPosition(pos) {
  if (!pos || ayarlar.dnaLeagueAktif === false) return null;
  const key = signature(pos);
  const profile = findPlayer(key);
  pos.dnaLeagueProfile = profile ? {
    version: VERSION,
    key,
    league: profile.league,
    leagueScore: profile.leagueScore,
    total: profile.total,
    expectancy: profile.expectancy,
    profitFactor: profile.profitFactor,
    net: profile.net,
    pairMetrics: profile.pairMetrics,
    effectiveExpectancy: profile.effectiveExpectancy,
    effectiveProfitFactor: profile.effectiveProfitFactor,
    effectiveNet: profile.effectiveNet,
    confidence: profile.confidence,
    regimeAligned: profile.regimeAligned,
    exit: profile.exit,
    attachedAt: new Date().toISOString(),
    virtualTradingBlocked: Boolean(isWorstDna(key)),
    shadowLearning: Boolean(isWorstDna(key)),
    executionPolicy: ayarlar.premierObservationAktif === false ? 'METADATA_ONLY' : 'PREMIER_OBSERVATION'
  } : {
    version: VERSION,
    key: key || 'SIGNATURE_YOK',
    league: 'UNRANKED',
    attachedAt: new Date().toISOString(),
    executionPolicy: ayarlar.premierObservationAktif === false ? 'METADATA_ONLY' : 'PREMIER_OBSERVATION'
  };
  return pos.dnaLeagueProfile;
}

function line(row, index) {
  const m=row.pairMetrics||row; return `${index + 1}. ${shortKey(row.key)} | ${m.algorithmLabel||'Mevcut Kademe'} | Skor ${num(row.leagueScore).toFixed(1)} | N${num(m.total)} | Exp ${num(m.expectancy)>=0?'+':''}${num(m.expectancy).toFixed(4)} | PF ${num(m.profitFactor).toFixed(2)} | ${row.momentum.status}`;
}

function telegramText(model, options = {}) {
  if (!model || ayarlar.dnaLeagueTelegramAktif === false) return '';
  const limit = Math.max(1, num(options.limit, ayarlar.dnaLeagueTelegramTopAday || 3));
  const regimeIcon = model.regime.activeDirection === 'LONG' ? '🟢' : model.regime.activeDirection === 'SHORT' ? '🔴' : '⚪';
  let text = `\n\n🏆 <b>AGROS DNA LEAGUE</b>\n`;
  text += `${regimeIcon} Aktif yön formu: <b>${model.regime.activeDirection}</b> | LONG Exp ${num(model.regime.long.expectancy).toFixed(4)} | SHORT Exp ${num(model.regime.short.expectancy).toFixed(4)}\n`;
  text += `🏆 Premier ${model.leagueSizes.premier} | 🥈 Championship ${model.leagueSizes.championship} | 🌱 Gelişim ${model.leagueSizes.development} | 📚 Tarihsel ${model.leagueSizes.historical}\n`;
  text += `🚫 Dinamik En Kötü 10: ${model.worstTenCount || 0} | Sanal kasa dışı gölge öğrenme\n`;
  text += `🔄 Son transfer kapanışı: ${model.lastTransferTradeCount} | Sonraki: ${model.nextTransferAt}\n`;
  text += `⭐ <b>Premier İlk ${limit}</b>\n`;
  text += model.leagues.premier.slice(0, limit).length ? model.leagues.premier.slice(0, limit).map(line).join('\n') : 'Premier kriterlerini sağlayan DNA henüz yok.';
  if (model.transfers.length) {
    const promoted = model.transfers.filter(x => x.to === 'PREMIER').length;
    const relegated = model.transfers.filter(x => x.from === 'PREMIER').length;
    text += `\n🔁 Bu dönem: ${promoted} Premier terfi | ${relegated} Premier düşüş`;
  }
  text += `\n🧪 Gözlem modu: tüm DNA'lar öğrenmeye devam eder; Premier işlemleri ayrı başarı kasasında izlenir.`;
  text += `\n💰 Kârlı DNA: ${model.audit.profitableCount} | Premier dışında kârlı: ${model.audit.profitableOutsidePremierCount}`;
  text += `\n🎯 Kural: ${model.audit.rule}. Diğer göstergeler yalnızca sıralama içindir.`;
  return text;
}

module.exports = { normalizeSignatureKey, baseSignatureKey, classificationPolicyMigrationRequired, CLASSIFICATION_POLICY_VERSION, leagueLookupDiagnostics, formatLeagueLookupDiagnostics,
  VERSION,
  LEAGUE_FILE,
  TRANSFER_FILE,
  CONSOLE_FILE,
  inferPerformanceRegime,
  buildPlayers,
  proposedLeagues,
  normalizeUniqueLeagues,
  duplicateLeagueKeys,
  audit,
  build,
  worstTen,
  isWorstDna,
  findPlayer,
  attachToPosition,
  telegramText
};
