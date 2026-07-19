/** AGROS v4.5.5 — kalıcı DNA Kimlik Kartları ve aktif/Elite exit ayrımı. */
const path = require('path');
const league = require('./46_dna_league_engine.js');
const dynamic = require('./47_dynamic_dna_exit_engine.js');
const io = require('./53_memory_safe_io.js');
const identity = require('./59_dna_identity_registry.js');

const OUT = path.join(__dirname, 'data', 'dna-identity-cards.json');
const VERSION = 'v4.6.0-DNA-IDENTITY-PREMIER-VALIDATION';

function n(v, d = 0) {
  v = Number(v);
  return Number.isFinite(v) ? v : d;
}

function leagueName(key, model) {
  for (const [name, rows] of Object.entries(model?.leagues || {})) {
    if ((rows || []).some(x => league.normalizeSignatureKey(x.key) === key)) return name.toUpperCase();
  }
  return 'UNRANKED';
}

function chars(player) {
  return {
    trend: Boolean(player.regimeAligned || player.momentum?.status === 'GUCLENIYOR'),
    volatility: Boolean(player.volatility || player.regime),
    profit: n(player.expectancy) > 0 && n(player.net) > 0,
    risk: n(player.profitFactor) > 1 && player.death !== 'OLUM_RISKI'
  };
}

function trend(player) {
  if (player.momentum?.status) return player.momentum.status;
  const recent = player.recent5 || {};
  return n(recent.net) > 0 && n(recent.expectancy) > 0
    ? 'GUCLENIYOR'
    : n(recent.net) < 0 ? 'ZAYIFLIYOR' : 'STABIL';
}

function build(leagueModel = null, dynamicModel = null) {
  const lm = leagueModel || league.build();
  const dm = dynamicModel || dynamic.readModel() || {};
  const old = io.readJsonBounded(OUT, { cards: [] }, { maxBytes: 24 * 1024 * 1024 });
  const oldMap = new Map((old.cards || []).flatMap(x => [[x.dna, x], [x.dnaId ? `ID:${x.dnaId}` : '', x]]).filter(([k]) => k));
  const players = [...Object.values(lm.leagues || {}).flat()];
  const dynamicMap = new Map();
  // Kimlik düzeyi 256 temel DNA olduğundan tüm-zaman Elite için önce dnaBase kullanılır.
  // Eski modellerde dnaBase yoksa ayrıntılı dna satırı güvenli fallback'tir.
  for (const row of [...(dm.dnaBase || []), ...(dm.dna || [])]) {
    const exact = league.normalizeSignatureKey(row?.key || '');
    const base = identity.identityKey(row?.key || '');
    if (exact && !dynamicMap.has(exact)) dynamicMap.set(exact, row);
    if (base && !dynamicMap.has(base)) dynamicMap.set(base, row);
  }
  const seen = new Set();
  const cards = [];

  for (const player of players) {
    const dna = league.normalizeSignatureKey(player.key);
    if (!dna || seen.has(dna)) continue;
    seen.add(dna);

    const dnaIdentity = identity.ensure(dna, { source: 'DNA_IDENTITY_CARD' });
    const dnaDynamic = dynamicMap.get(dna) || dynamicMap.get(identity.identityKey(dna));
    const allTimeElite = dnaDynamic?.allBest || null;
    const previous = oldMap.get(`ID:${dnaIdentity?.id}`) || oldMap.get(dna);
    const resultSequence = player.recent5?.results || player.recent5?.sequence || '';
    const tp = n(player.tp);
    const sl = n(player.sl);
    const be = n(player.be);
    const decided = n(player.decided, tp + sl);
    const computedWinRate = decided > 0 ? (tp / decided) * 100 : 0;
    const storedWinRate = Number(player.winRate);
    const winRate = Number.isFinite(storedWinRate) && storedWinRate >= 0 ? storedWinRate : computedWinRate;

    // Aktif Exit: Lig ve yeni emir atama yolunun şu an kullandığı rejim-bazlı exit.
    const activeExitId = player.pairMetrics?.algorithmId || player.exit?.algorithmId || 'ACTUAL';
    const activeExit = player.pairMetrics?.algorithmLabel || player.exit?.algorithmLabel || 'Mevcut Kademe Sistemi';
    const activeExitSamples = n(player.pairMetrics?.total, player.exit?.samples);
    const activeExitRegime = player.exit?.regimeKey || dm.currentRegime?.key || 'BILINMIYOR';
    const activeExitReady = activeExitId !== 'ACTUAL' && Boolean(player.exit?.ready !== false);

    // Elite Exit: Aynı DNA'nın bütün rejimler/tüm dönem üzerinden tarihsel lideri.
    const eliteExitId = allTimeElite?.algorithmId || activeExitId;
    const eliteExit = allTimeElite?.algorithmLabel || activeExit;
    const eliteExitSamples = n(allTimeElite?.samples, activeExitSamples);
    const eliteDiffersFromActive = eliteExitId !== activeExitId;

    const assignedLeague = leagueName(dna, lm);
    const premierAudit = player.premierValidation || league.premierValidation(player);
    cards.push({
      dnaId: dnaIdentity?.id || player.dnaId || null,
      dnaLabel: dnaIdentity?.label || player.dnaLabel || 'DNA #YOK',
      identityKey: dnaIdentity?.key || identity.identityKey(dna),
      dna,
      league: assignedLeague,
      previousLeague: previous?.league || null,
      premierScore: +n(player.leagueScore).toFixed(2),
      trades: n(player.total),
      tp,
      sl,
      be,
      winRate: +n(winRate, computedWinRate).toFixed(2),
      net: +n(player.net).toFixed(4),
      profitFactor: +n(player.profitFactor).toFixed(2),
      expectancy: +n(player.expectancy).toFixed(4),
      last5: typeof resultSequence === 'string' ? resultSequence : '',
      trend: trend(player),
      activeExit,
      activeExitId,
      activeExitSamples,
      activeExitRegime,
      activeExitReady,
      eliteExit,
      eliteExitId,
      eliteExitSamples,
      eliteDiffersFromActive,
      previousExit: previous?.eliteExit || null,
      exitAdvantage: +n(allTimeElite?.deltaUsdt || allTimeElite?.netUsdt || player.exit?.deltaUsdt).toFixed(4),
      characters: chars(player),
      premierAudit: {
        ...premierAudit,
        assignedLeague,
        leagueReason: player.leagueReason || league.leagueDecision(player, assignedLeague).reason,
        reasons: Object.values(premierAudit.checks || {}).map(x => `${x.passed ? '✓' : '✗'} ${x.rule} | gerçek ${x.actual}`)
      },
      updatedAt: new Date().toISOString()
    });
  }

  const out = {
    version: VERSION,
    createdAt: new Date().toISOString(),
    currentRegime: dm.currentRegime?.key || 'BILINMIYOR',
    count: cards.length,
    identityAudit: identity.audit(),
    cards: cards.sort((a, b) => b.premierScore - a.premierScore || n(a.dnaId) - n(b.dnaId))
  };
  io.writeJsonAtomic(OUT, out);
  return out;
}

function telegram(out = build(), limit = 5) {
  const rows = out.cards.slice(0, limit).map((card, index) => {
    const active = `   🎯 Aktif Exit (${card.activeExitRegime}): ${card.activeExit} | ExitN${card.activeExitSamples}`;
    const elite = card.eliteDiffersFromActive
      ? `\n   ⭐ Tüm Dönem Elite: ${card.eliteExit} | EliteN${card.eliteExitSamples}`
      : `\n   ⭐ Aktif/Elite aynı | EliteN${card.eliteExitSamples}`;
    return `${index + 1}. ${card.dnaLabel} — ${card.dna}\n   ${card.league} | Skor ${card.premierScore} | N${card.trades} | WR %${card.winRate} | Net ${card.net >= 0 ? '+' : ''}${card.net} | PF ${card.profitFactor}\n${active}${elite}\n   📈 Form: ${card.trend}`;
  });

  return `\n\n🗺️ <b>FAMILY DNA HAFIZA KARTLARI — v4.8</b>\nToplam Family profil: ${out.count} | Güncel rejim: ${out.currentRegime} | Family emir açmaz; LAB evlatlarının aile hafızasıdır\n${rows.join('\n')}`;
}

module.exports = { VERSION, OUT, build, telegram };
