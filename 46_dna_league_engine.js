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
const memorySafeIo = require('./53_memory_safe_io.js');
const ayarlar = require('./ayarlar.js');
const dnaEvolution = require('./38_dna_evolution_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
const dnaIdentity = require('./59_dna_identity_registry.js');

const VERSION = 'v4.6.0-PREMIER-VALIDATION';
const CLASSIFICATION_POLICY_VERSION = 4;
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
  return memorySafeIo.readJsonBounded(file, fallback, { maxBytes: 32 * 1024 * 1024 });
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

  const players = (ranking.all || []).map(row => {
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
      tp: num(row.tp),
      sl: num(row.sl),
      be: num(row.be),
      decided: num(row.decided, num(row.tp) + num(row.sl)),
      winRate: round(row.winRate, 2),
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
  });

  // Tek merkezli kimlik kaydı: ilk kurulumda toplu ve deterministik, sonraki
  // DNA'larda otomatik artan ID. Sıralama değişse bile eski ID değişmez.
  const identityMap = dnaIdentity.ensureMany(players.map(x => x.key), { source: 'DNA_LEAGUE_BUILD' });
  for (const player of players) {
    const identity = identityMap.get(dnaIdentity.identityKey(player.key));
    player.dnaId = identity?.id || null;
    player.dnaLabel = identity?.label || 'DNA #YOK';
    player.identityKey = identity?.key || dnaIdentity.identityKey(player.key);
  }
  return players.sort((a, b) => b.leagueScore - a.leagueScore || b.expectancy - a.expectancy || b.total - a.total);
}

function realizedMetrics(player = {}) {
  return {
    total: num(player.total),
    expectancy: num(player.expectancy),
    profitFactor: num(player.profitFactor),
    net: num(player.net)
  };
}

function historicalProfitGate(player, minSamples) {
  const m = realizedMetrics(player);
  return m.total >= minSamples && m.expectancy > 0 && m.profitFactor > 1 && m.net > 0;
}

function recentFivePositive(player) {
  const r = player.recent5 || {};
  // Kusursuzluk veya %100 kazanma aranmaz. Son beş işlemin toplam ekonomik sonucu pozitiftir.
  return num(r.total) >= 5 && num(r.expectancy) > 0 && num(r.profitFactor) > 1 && num(r.net) > 0;
}

function premierValidation(player = {}, options = {}) {
  const minSample = Math.max(1, num(options.premierMinSample, ayarlar.dnaLeaguePremierMinOrnek || 5));
  const checks = {
    sample: { passed: num(player.total) >= minSample, actual: num(player.total), rule: `N >= ${minSample}` },
    profitFactor: { passed: num(player.profitFactor) > 1, actual: round(player.profitFactor, 3), rule: 'PF > 1' },
    net: { passed: num(player.net) > 0, actual: round(player.net, 6), rule: 'Net > 0' },
    expectancy: { passed: num(player.expectancy) > 0, actual: round(player.expectancy, 6), rule: 'Expectancy > 0' },
    survival: { passed: player.death !== 'OLUM_RISKI', actual: player.death || 'YOK', rule: 'Ölüm riski yok' }
  };
  const failed = Object.entries(checks).filter(([, v]) => !v.passed).map(([key, v]) => ({ key, ...v }));
  const passed = Object.entries(checks).filter(([, v]) => v.passed).map(([key, v]) => ({ key, ...v }));
  return {
    policy: 'PREMIER_LEAGUE_2_0',
    minSample,
    eligible: failed.length === 0,
    checks,
    passed,
    failed,
    reason: failed.length === 0
      ? `Premier: N${num(player.total)}, PF ${round(player.profitFactor, 2)}, Exp ${round(player.expectancy, 4)}, Net ${round(player.net, 4)} şartların tamamını geçti.`
      : `Premier değil: ${failed.map(x => `${x.rule} (gerçek ${x.actual})`).join('; ')}`
  };
}

function leagueDecision(player = {}, assignedLeague = 'UNRANKED', options = {}) {
  const validation = premierValidation(player, options);
  const league = String(assignedLeague || 'UNRANKED').toUpperCase();
  let reason = validation.reason;
  if (league === 'CHAMPIONSHIP') reason = validation.eligible
    ? 'Premier şartları sağlandı; transfer anı bekleniyor veya kalıcı state yeniden sınıflandırılacak.'
    : `Championship: ${validation.failed.map(x => x.rule).join(', ')} eksik; yakın-pozitif gelişim adayı.`;
  if (league === 'DEVELOPMENT') reason = `Development: örnek/güç kanıtı gelişiyor. ${validation.reason}`;
  if (league === 'HISTORICAL') reason = `Historical: yeterli geçmiş var ancak Premier/Championship ekonomik kapıları geçilmedi. ${validation.reason}`;
  return { league, reason, premierValidation: validation };
}

function qualify(player, league, options = {}) {
  const premierMin = Math.max(1, num(options.premierMinSample, ayarlar.dnaLeaguePremierMinOrnek || 5));
  const championshipMin = Math.max(1, num(options.championshipMinSample, ayarlar.dnaLeagueChampionshipMinOrnek || 5));
  const historicalPositive = historicalProfitGate(player, premierMin);

  if (league === 'PREMIER') {
    // Premier 2.0 tek doğruluk kaynağı: N>=5, PF>1, Net>0, Expectancy>0 ve ölüm riski yok.
    return premierValidation(player, options).eligible;
  }
  if (league === 'CHAMPIONSHIP') {
    const m = realizedMetrics(player);
    const nearPositive = m.total >= championshipMin &&
      m.profitFactor >= num(ayarlar.dnaLeagueChampionshipMinPf, 0.85) &&
      m.expectancy >= num(ayarlar.dnaLeagueChampionshipMinExp, -0.05);
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

function findAssignedLeague(key, leagues = {}) {
  const wanted = normalizeSignatureKey(key);
  for (const [name, rows] of Object.entries(leagues || {})) {
    if ((rows || []).some(x => normalizeSignatureKey(x.key) === wanted)) return String(name).toUpperCase();
  }
  return 'UNRANKED';
}

function applyLeagueDecisions(leagues = {}, options = {}) {
  for (const [name, rows] of Object.entries(leagues || {})) {
    for (const row of rows || []) {
      const decision = leagueDecision(row, String(name).toUpperCase(), options);
      row.assignedLeague = decision.league;
      row.leagueReason = decision.reason;
      row.premierValidation = decision.premierValidation;
    }
  }
  return leagues;
}

function audit(players = [], leagues = {}) {
  const minSample = Math.max(1, num(ayarlar.dnaLeaguePremierMinOrnek, 5));
  const profitable = players.filter(p => { const m=realizedMetrics(p); return m.total>=minSample && m.expectancy>0 && m.profitFactor>1 && m.net>0; });
  const premierKeys = new Set((leagues.premier || []).map(p => normalizeSignatureKey(p.key)));
  const profitableOutsidePremier = profitable.filter(p => !premierKeys.has(normalizeSignatureKey(p.key)));
  const nearProfit = players.filter(p => { const m=realizedMetrics(p); return m.total>=minSample && !profitable.some(x=>x.key===p.key) && m.expectancy>=-0.05 && m.profitFactor>=0.85; });
  return {
    rule: `Premier League 2.0: gerçekleşmiş DNA performansı N>=${minSample}, Exp>0, PF>1, Net>0 ve ölüm riski yok; son 5/güven/Elite Exit yalnız sıralama ve audit içindir; Championship: yakın-pozitif veya yeterli kanıtı henüz oluşmamış aday`,
    totalPlayers: players.length,
    profitableCount: profitable.length,
    premierCount: (leagues.premier || []).length,
    profitableOutsidePremierCount: profitableOutsidePremier.length,
    profitableOutsidePremier: profitableOutsidePremier.map(p => ({ ...p, missingChampionReason: leagueDecision(p, findAssignedLeague(p.key, leagues)).reason })),
    lostChampionCount: profitableOutsidePremier.length,
    lostChampions: profitableOutsidePremier.map(p => ({
      dnaId: p.dnaId, dnaLabel: p.dnaLabel, key: p.key, assignedLeague: findAssignedLeague(p.key, leagues),
      total: p.total, winRate: p.winRate, profitFactor: p.profitFactor, expectancy: p.expectancy, net: p.net,
      reason: leagueDecision(p, findAssignedLeague(p.key, leagues)).reason
    })),
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
  return applyLeagueDecisions({ premier, championship, development, historical }, options);
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
    const to = newMap.get(key) || 'UNRANKED';
    if (from === to) continue;
    const identity = dnaIdentity.ensure(key, { source: 'LEAGUE_TRANSFER' });
    events.push({
      version: VERSION,
      timestamp: new Date().toISOString(),
      totalTrades,
      key,
      dnaId: identity?.id || null,
      dnaLabel: identity?.label || 'DNA #YOK',
      label: shortKey(key),
      from,
      to,
      type: to === 'UNRANKED' ? 'PROFILE_SET_EXIT' : (to === 'PREMIER' ? 'PROMOTION_TO_PREMIER' : from === 'PREMIER' ? 'RELEGATION_FROM_PREMIER' : 'LEAGUE_CHANGE')
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

function ensureLeagueIdentities(leagues = {}, source = 'PERSISTED_LEAGUE_STATE') {
  const rows = Object.values(leagues || {}).flat();
  const ids = dnaIdentity.ensureMany(rows.map(x => x?.key), { source });
  for (const row of rows) {
    const entry = ids.get(dnaIdentity.identityKey(row?.key));
    row.dnaId = entry?.id || row.dnaId || null;
    row.dnaLabel = entry?.label || row.dnaLabel || 'DNA #YOK';
    row.identityKey = entry?.key || dnaIdentity.identityKey(row?.key);
  }
  return leagues;
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
    const preservedLeagues = applyLeagueDecisions(ensureLeagueIdentities(previous.leagues), options);
    return {
      ...previous,
      version: VERSION,
      classificationPolicyVersion: CLASSIFICATION_POLICY_VERSION,
      generatedAt: new Date().toISOString(),
      leagues: preservedLeagues,
      identityAudit: dnaIdentity.audit(),
      audit: { ...audit(Object.values(preservedLeagues).flat(), preservedLeagues), duplicateLeagueKeys: duplicateLeagueKeys(preservedLeagues), singleDnaSingleLeague: duplicateLeagueKeys(preservedLeagues).length === 0 },
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

  leagues = applyLeagueDecisions(ensureLeagueIdentities(leagues, 'LEAGUE_CLASSIFICATION'), options);

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
    identityAudit: dnaIdentity.audit(),
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

function attachToPosition(pos, model = null) {
  if (!pos || ayarlar.dnaLeagueAktif === false) return null;
  const key = signature(pos);
  const profile = findPlayer(key, model);
  const identity = key ? dnaIdentity.ensure(key, { source: 'POSITION_ATTACH' }) : null;
  pos.dnaId = identity?.id || null;
  pos.dnaLabel = identity?.label || 'DNA #YOK';
  pos.dnaIdentityKey = identity?.key || dnaIdentity.identityKey(key);
  pos.dnaLeagueProfile = profile ? {
    dnaId: identity?.id || profile.dnaId || null,
    dnaLabel: identity?.label || profile.dnaLabel || 'DNA #YOK',
    identityKey: identity?.key || profile.identityKey || dnaIdentity.identityKey(key),
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
    virtualTradingBlocked: Boolean(isWorstDna(key, model)),
    shadowLearning: Boolean(isWorstDna(key, model)),
    executionPolicy: ayarlar.premierObservationAktif === false ? 'METADATA_ONLY' : 'PREMIER_OBSERVATION'
  } : {
    version: VERSION,
    dnaId: identity?.id || null,
    dnaLabel: identity?.label || 'DNA #YOK',
    identityKey: identity?.key || dnaIdentity.identityKey(key),
    key: key || 'SIGNATURE_YOK',
    league: 'UNRANKED',
    matchType: 'NONE',
    attachedAt: new Date().toISOString(),
    executionPolicy: ayarlar.premierObservationAktif === false ? 'METADATA_ONLY' : 'PREMIER_OBSERVATION'
  };
  return pos.dnaLeagueProfile;
}

function line(row, index) {
  const exit=row.pairMetrics||{};
  const realized=realizedMetrics(row);
  const exitSample=num(exit.total);
  const exitEvidence=exit.algorithmLabel && exit.algorithmLabel !== 'Mevcut Kademe Sistemi' ? ` | ExitN${exitSample}` : '';
  return `${index + 1}. ${row.dnaLabel || dnaIdentity.label(row.dnaId)} — ${shortKey(row.key)} | ${exit.algorithmLabel||'Mevcut Kademe'} | Skor ${num(row.leagueScore).toFixed(1)} | DNA N${realized.total} | Exp ${realized.expectancy>=0?'+':''}${realized.expectancy.toFixed(4)} | PF ${realized.profitFactor.toFixed(2)}${exitEvidence} | ${row.momentum?.status||'YENI'}`;
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
  const premierRows = (model.leagues?.premier || []).slice(0, limit);
  text += premierRows.length ? premierRows.map((row, i) => {
    const base = line(row, i);
    const checks = row.premierValidation?.checks || premierValidation(row).checks;
    return `${base}\n   ✅ N ${num(checks.sample?.actual)} | ✅ PF ${num(checks.profitFactor?.actual).toFixed(2)} | ✅ Exp ${num(checks.expectancy?.actual).toFixed(4)} | ✅ Net ${num(checks.net?.actual).toFixed(4)}\n   🎯 Aktif Exit: ${row.exit?.algorithmLabel || 'Mevcut Kademe Sistemi'} | ${row.exit?.ready ? 'DOĞRULANDI' : 'KANIT BEKLİYOR'}`;
  }).join('\n') : 'Premier kriterlerini sağlayan DNA henüz yok.';
  if ((model.transfers || []).length) {
    const promoted = model.transfers.filter(x => x.to === 'PREMIER').length;
    const relegated = model.transfers.filter(x => x.from === 'PREMIER').length;
    text += `\n🔁 Bu dönem: ${promoted} Premier terfi | ${relegated} Premier düşüş`;
  }
  text += `\n🧪 Gözlem modu: tüm DNA'lar öğrenmeye devam eder; Premier işlemleri ayrı başarı kasasında izlenir.`;
  text += `\n💰 Kârlı DNA: ${model.audit?.profitableCount || 0} | Premier dışında güçlü: ${model.audit?.lostChampionCount || model.audit?.profitableOutsidePremierCount || 0}`;
  if ((model.audit?.lostChampions || []).length) {
    text += `\n🚨 <b>KAYIP ŞAMPİYON DENETİMİ</b>\n` + model.audit.lostChampions.slice(0, limit).map((x, i) => `${i + 1}. ${x.dnaLabel || dnaIdentity.label(x.dnaId)} | ${shortKey(x.key)}\n   N${x.total} | WR %${num(x.winRate).toFixed(2)} | PF ${num(x.profitFactor).toFixed(2)} | Exp ${num(x.expectancy).toFixed(4)} | Net ${num(x.net).toFixed(4)}\n   Neden Premier değil? ${x.reason}`).join('\n');
  } else {
    text += `\n✅ Kayıp şampiyon yok: Premier şartlarını geçen bütün DNA'lar Premier'de.`;
  }
  const ready = (model.leagues?.premier || []).filter(x => (x.premierValidation || premierValidation(x)).eligible && x.exit?.ready);
  text += `\n🚀 <b>BUGÜN GERÇEK EMİR ADAYI</b>: ${ready.length}`;
  text += ready.length ? `\n` + ready.slice(0, limit).map((x, i) => `${i + 1}. ${x.dnaLabel || dnaIdentity.label(x.dnaId)} | ${shortKey(x.key)} | ${x.exit.algorithmLabel} | DNA N${x.total} / ExitN${x.exit.samples}`).join('\n') : `\nDoğrulanmış DNA + güncel pozitif Exit eşleşmesi henüz yok; gerçek emir için fail-closed.`;
  text += `\n🎯 Kural: ${model.audit?.rule || 'Premier League 2.0'}. Diğer göstergeler yalnızca sıralama içindir.`;
  return text;
}

module.exports = { normalizeSignatureKey, baseSignatureKey, realizedMetrics, premierValidation, leagueDecision, findAssignedLeague, applyLeagueDecisions, classificationPolicyMigrationRequired, CLASSIFICATION_POLICY_VERSION, transferEvents, leagueLookupDiagnostics, formatLeagueLookupDiagnostics,
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
