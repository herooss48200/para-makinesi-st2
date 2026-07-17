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

const VERSION = 'v4.0.0-ADAPTIVE-TRADING-LEAGUE';
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

function exitIndex() {
  const model = dynamicExit.readModel() || dynamicExit.build(null, { persist: true });
  return { model, map: new Map((model?.dna || []).map(row => [String(row.key || ''), row])) };
}

function exitEvidence(key, exits) {
  const row = exits.map.get(key);
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
    deltaUsdt: round(best?.netUsdt, 4),
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
  const exitBonus = exit.ready ? clamp(num(exit.beatRate) - 50, 0, 30) * 0.20 + 2 : 0;
  const base = num(confidence?.metaScore, 50) * 0.48 + num(confidence?.confidenceV2, row.confidenceScore || 0) * 0.20 + num(row.score) * 0.12;
  return round(clamp(base + momentum + stability + recentEdge + regimeAlignment + exitBonus, 0, 100), 2);
}

function buildPlayers(models = {}, options = {}) {
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
    return {
      key: String(row.key),
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
      leagueScore
    };
  }).sort((a, b) => b.leagueScore - a.leagueScore || b.expectancy - a.expectancy || b.total - a.total);
}

function qualify(player, league, options = {}) {
  const premierMin = Math.max(1, num(options.premierMinSample, ayarlar.dnaLeaguePremierMinOrnek || 20));
  const championshipMin = Math.max(1, num(options.championshipMinSample, ayarlar.dnaLeagueChampionshipMinOrnek || 10));
  if (league === 'PREMIER') {
    return player.total >= premierMin && player.expectancy > 0 && player.profitFactor > 1 &&
      player.confidence >= num(ayarlar.dnaLeaguePremierMinGuven, 50) &&
      player.recent20.expectancy >= num(ayarlar.dnaLeaguePremierMinSon20Exp, -0.02) &&
      !['COKUYOR'].includes(player.momentum.status) && player.death === 'YOK' &&
      (ayarlar.dnaLeaguePremierExitKanitiZorunlu === false || player.exit.ready === true);
  }
  if (league === 'CHAMPIONSHIP') {
    return player.total >= championshipMin && player.profitFactor >= num(ayarlar.dnaLeagueChampionshipMinPf, 0.85) &&
      player.expectancy >= num(ayarlar.dnaLeagueChampionshipMinExp, -0.05) && player.death !== 'OLUM_RISKI';
  }
  return true;
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
  const proposal = proposedLeagues(players, options);
  const previous = readJson(LEAGUE_FILE, null);
  const transferDue = shouldTransfer(previous, evolutionModel.totalTrades, options.forceTransfer === true);

  let leagues = proposal;
  let events = [];
  let lastTransferTradeCount = evolutionModel.totalTrades;
  if (!transferDue && previous?.leagues) {
    const playerMap = new Map(players.map(x => [x.key, x]));
    leagues = Object.fromEntries(Object.entries(previous.leagues).map(([league, rows]) => [league, (rows || []).map(old => playerMap.get(old.key) || old)]));
    lastTransferTradeCount = num(previous.lastTransferTradeCount);
  } else {
    const nextMap = new Map(players.map(x => [x.key, x]));
    events = transferEvents(previous, nextMap, evolutionModel.totalTrades);
  }

  const model = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    mode: 'ADAPTIVE_OBSERVATION_NO_REAL_ORDER_FILTER',
    totalTrades: evolutionModel.totalTrades,
    totalDna: players.length,
    lastTransferTradeCount,
    nextTransferAt: lastTransferTradeCount + Math.max(1, num(ayarlar.dnaLeagueTransferKapanisAraligi, 25)),
    transferDue,
    regime,
    leagueSizes: {
      premier: leagues.premier.length,
      championship: leagues.championship.length,
      development: leagues.development.length,
      historical: leagues.historical.length
    },
    leagues,
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
      recentTransfers: events.slice(-20),
      nextTransferAt: model.nextTransferAt,
      policy: model.policy
    });
  }
  return model;
}

function findPlayer(key, model = null) {
  const current = model || readJson(LEAGUE_FILE, null);
  if (!current?.leagues || !key) return null;
  for (const [league, rows] of Object.entries(current.leagues)) {
    const player = (rows || []).find(x => x.key === key);
    if (player) return { ...player, league: league.toUpperCase() };
  }
  return null;
}

function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return sig.key || (sig.btcBits && sig.coinBits && pos?.yon ? `YON=${String(pos.yon).toUpperCase()}|BTC=${sig.btcBits}|COIN=${sig.coinBits}` : '');
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
    regimeAligned: profile.regimeAligned,
    exit: profile.exit,
    attachedAt: new Date().toISOString(),
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
  return `${index + 1}. ${shortKey(row.key)} | Skor ${num(row.leagueScore).toFixed(1)} | N${row.total} | Exp ${row.expectancy >= 0 ? '+' : ''}${num(row.expectancy).toFixed(4)} | PF ${num(row.profitFactor).toFixed(2)} | ${row.momentum.status}`;
}

function telegramText(model, options = {}) {
  if (!model || ayarlar.dnaLeagueTelegramAktif === false) return '';
  const limit = Math.max(1, num(options.limit, ayarlar.dnaLeagueTelegramTopAday || 3));
  const regimeIcon = model.regime.activeDirection === 'LONG' ? '🟢' : model.regime.activeDirection === 'SHORT' ? '🔴' : '⚪';
  let text = `\n\n🏆 <b>AGROS DNA LEAGUE</b>\n`;
  text += `${regimeIcon} Aktif yön formu: <b>${model.regime.activeDirection}</b> | LONG Exp ${num(model.regime.long.expectancy).toFixed(4)} | SHORT Exp ${num(model.regime.short.expectancy).toFixed(4)}\n`;
  text += `🏆 Premier ${model.leagueSizes.premier} | 🥈 Championship ${model.leagueSizes.championship} | 🌱 Gelişim ${model.leagueSizes.development} | 📚 Tarihsel ${model.leagueSizes.historical}\n`;
  text += `🔄 Son transfer kapanışı: ${model.lastTransferTradeCount} | Sonraki: ${model.nextTransferAt}\n`;
  text += `⭐ <b>Premier İlk ${limit}</b>\n`;
  text += model.leagues.premier.slice(0, limit).length ? model.leagues.premier.slice(0, limit).map(line).join('\n') : 'Premier kriterlerini sağlayan DNA henüz yok.';
  if (model.transfers.length) {
    const promoted = model.transfers.filter(x => x.to === 'PREMIER').length;
    const relegated = model.transfers.filter(x => x.from === 'PREMIER').length;
    text += `\n🔁 Bu dönem: ${promoted} Premier terfi | ${relegated} Premier düşüş`;
  }
  text += `\n🧪 Gözlem modu: tüm DNA'lar öğrenmeye devam eder; Premier işlemleri ayrı başarı kasasında izlenir.`;
  text += `\n🎯 Premier sayı sınırı yoktur; kâr ve güven şartını sağlayanların tamamı lige girer.`;
  return text;
}

module.exports = {
  VERSION,
  LEAGUE_FILE,
  TRANSFER_FILE,
  CONSOLE_FILE,
  inferPerformanceRegime,
  buildPlayers,
  proposedLeagues,
  build,
  findPlayer,
  attachToPosition,
  telegramText
};
