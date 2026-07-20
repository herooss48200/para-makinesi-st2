/**
 * AGROS v4.2.0 - REAL ORDER READINESS BRIDGE
 *
 * Ortak karar kapısı:
 * - Sanal öğrenme katmanı ligden bağımsızdır; tüm geçerli tetikler veri üretir.
 * - Legacy Family gerçek emir katmanı audit için korunur; v4.8 LAB gerçek kapısı bağlanana kadar fail-closed kalır.
 * - Gerçek emir fail-closed çalışır.
 * - Lig modeli, DNA imzası veya açık yetkilendirme yoksa Binance emri gönderilmez.
 * - Dinamik exit kanıtı varsa plana eklenir; yoksa mevcut kademe güvenli fallback'tir.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const dnaLeague = require('./46_dna_league_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
const memorySafeIo = require('./53_memory_safe_io.js');
const dnaIdentity = require('./59_dna_identity_registry.js');
const premierObservation = require('./48_premier_observation_engine.js');

const VERSION = 'v4.6.1-REAL-TRADING-FORWARD-PROOF';
const DATA_DIR = path.join(__dirname, 'data');
const AUDIT_JSONL = path.join(DATA_DIR, 'real-order-readiness-audit.jsonl');
const PREPARATION_JSON = path.join(DATA_DIR, 'real-trading-preparation.json');

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function append(row) { try { ensureDir(); fs.appendFileSync(AUDIT_JSONL, JSON.stringify(row) + '\n'); } catch (_) {} }
function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  const raw = sig.key || (sig.btcBits && sig.coinBits && pos?.yon
    ? `YON=${String(pos.yon).toUpperCase()}|BTC=${sig.btcBits}|COIN=${sig.coinBits}` : '');
  return dnaLeague.normalizeSignatureKey(raw);
}
function modelAgeMinutes() {
  try {
    const st = fs.statSync(dnaLeague.LEAGUE_FILE);
    return Math.max(0, (Date.now() - st.mtimeMs) / 60000);
  } catch (_) { return Infinity; }
}
function realAuthorization() {
  const enabled = ayarlar.gercekEmirYetkilendirmeAktif === true;
  const expected = String(ayarlar.gercekEmirOnayKodu || '').trim();
  const supplied = String(process.env.AGROS_REAL_ORDER_ARM || '').trim();
  return { enabled, expectedConfigured: Boolean(expected), envConfigured: Boolean(supplied), valid: enabled && Boolean(expected) && supplied === expected };
}
function evaluate(pos, { realMode = false } = {}) {
  const key = signature(pos);
  const profile = pos?.dnaLeagueProfile || dnaLeague.attachToPosition(pos);
  const identity = key ? dnaIdentity.ensure(key, { source: 'REAL_ORDER_READINESS' }) : null;
  const exitPlan = pos?.exitPlanShadow || dnaExitSelector.attachToPosition(pos);
  const maxAge = Math.max(5, num(ayarlar.gercekEmirLigModelMaksYasDakika, 360));
  const age = modelAgeMinutes();
  const auth = realAuthorization();
  const forwardProof = key ? premierObservation.dnaForwardProof(key) : null;
  const reasons = [];

  if (ayarlar.dnaLeagueAktif === false) reasons.push('DNA_LIGI_KAPALI');
  if (!key) reasons.push('DNA_IMZASI_YOK');

  const currentLeague = profile?.league || 'UNRANKED';
  const worst = dnaLeague.isWorstDna(key);
  const virtualShadowOnly = !realMode && Boolean(worst);

  let realTier = null;
  let sizeMultiplier = 0;
  if (realMode) {
    const pair = profile?.pairMetrics || profile || {};
    const premier = currentLeague === 'PREMIER';
    const championship = currentLeague === 'CHAMPIONSHIP';
    if (!premier && !championship) reasons.push(`LIG_${currentLeague}`);

    const minSamples = premier
      ? Math.max(1, num(ayarlar.dnaLeaguePremierMinOrnek, 10))
      : Math.max(1, num(ayarlar.dnaLeagueChampionshipMinOrnek, 10));
    if (!(num(pair.total) >= minSamples)) reasons.push('DNA_EXIT_ORNEK_YETERSIZ');
    if (!(num(pair.expectancy) > 0)) reasons.push('DNA_EXIT_EXPECTANCY_POZITIF_DEGIL');
    if (!(num(pair.profitFactor) > 1)) reasons.push('DNA_EXIT_PF_1_USTU_DEGIL');
    if (!(num(pair.net) > 0)) reasons.push('DNA_EXIT_NET_POZITIF_DEGIL');
    if (!Number.isFinite(age) || age > maxAge) reasons.push('LIG_MODELI_ESKI_VEYA_YOK');
    if (ayarlar.gercekEmirIleriDogrulamaAktif !== false && !forwardProof?.eligible) reasons.push('ILERI_DOGRULAMA_POZITIF_DEGIL');

    if (premier) {
      realTier = 'PREMIER';
      sizeMultiplier = Math.max(0.01, Math.min(1, num(ayarlar.gercekEmirPremierBoyutCarpani, 1)));
      if (ayarlar.gercekEmirPremierKapisiAktif !== true) reasons.push('GERCEK_PREMIER_KAPISI_KAPALI');
    } else if (championship) {
      realTier = 'CHAMPIONSHIP';
      sizeMultiplier = Math.max(0.01, Math.min(1, num(ayarlar.gercekEmirChampionshipBoyutCarpani, 1)));
      if (ayarlar.gercekEmirChampionshipKapisiAktif !== true) reasons.push('GERCEK_CHAMPIONSHIP_KAPISI_KAPALI');
    }
  } else {
    if (virtualShadowOnly) reasons.push('DYNAMIC_WORST_10_SHADOW_ONLY');
    // Alt öğrenme katmanı: lig giriş engeli değildir. UNRANKED/Development dahil
    // tüm geçerli strateji tetikleri sanal işlem açarak DNA + exit yarışına veri üretir.
    // Lig yalnızca gözlem/etiket bilgisidir; gerçek emir yetkisini aşağıdaki realMode kapısı verir.
  }

  if (realMode) {
    if (!auth.valid) reasons.push('GERCEK_EMIR_YETKISI_YOK');
  }

  const decision = {
    version: VERSION,
    at: new Date().toISOString(),
    mode: realMode ? 'REAL' : 'VIRTUAL',
    symbol: pos?.sym || '',
    side: pos?.yon || '',
    dnaId: identity?.id || profile?.dnaId || pos?.dnaId || null,
    dnaLabel: identity?.label || profile?.dnaLabel || pos?.dnaLabel || 'DNA #YOK',
    identityKey: identity?.key || profile?.identityKey || pos?.dnaIdentityKey || dnaIdentity.identityKey(key),
    key: key || 'SIGNATURE_YOK',
    allowed: realMode ? reasons.length === 0 : true,
    reasons,
    league: currentLeague,
    leagueMatchType: profile?.matchType || (currentLeague === 'UNRANKED' ? 'NONE' : 'EXACT_NORMALIZED'),
    virtualPool: !realMode ? (virtualShadowOnly ? 'WORST_10_SHADOW_LEARNING' : 'ALL_VALID_DNA_LEARNING') : null,
    virtualShadowOnly,
    realTier,
    sizeMultiplier: realMode ? sizeMultiplier : 1,
    leagueModelAgeMinutes: Number.isFinite(age) ? Number(age.toFixed(2)) : null,
    premierValidation: profile ? dnaLeague.premierValidation(profile) : null,
    todayRealCandidate: currentLeague === 'PREMIER' && Boolean(profile && dnaLeague.premierValidation(profile).eligible) && Boolean(exitPlan?.ready) && exitPlan?.selectionQuality === 'POSITIVE_CONFIRMED' && Boolean(forwardProof?.eligible),
    forwardProof,
    metrics: {
      total: num(profile?.pairMetrics?.total, profile?.total), expectancy: num(profile?.pairMetrics?.expectancy, profile?.expectancy),
      profitFactor: num(profile?.pairMetrics?.profitFactor, profile?.profitFactor), net: num(profile?.pairMetrics?.net, profile?.net),
      source: profile?.pairMetrics?.source || 'DNA_ACTUAL_EXIT',
      score: num(profile?.leagueScore)
    },
    regime: exitPlan?.currentRegime || null,
    exit: {
      ready: Boolean(exitPlan?.ready),
      algorithmId: exitPlan?.selectedAlgorithmId || 'ACTUAL',
      label: exitPlan?.selectedAlgorithmLabel || 'Mevcut Kademe Sistemi',
      scope: exitPlan?.selectionScope || 'ACTUAL_FALLBACK',
      executionPolicy: exitPlan?.ready ? (realMode ? 'VALIDATED_DYNAMIC_EXIT_REAL_GUARDED' : 'VALIDATED_DYNAMIC_EXIT_VIRTUAL_ACTIVE') : 'CURRENT_LADDER_FALLBACK',
      samples: num(exitPlan?.samples),
      beatRate: num(exitPlan?.beatRate),
      profitFactor: num(exitPlan?.profitFactor),
      netUsdt: num(exitPlan?.netUsdt),
      recent20: exitPlan?.recent20 || null,
      strengthening: Boolean(exitPlan?.strengthening),
      reason: exitPlan?.reason || (exitPlan?.ready ? 'DOĞRULANMIŞ DİNAMİK EXIT' : 'GÜVENLİ KADEME FALLBACK'),
      activeForPosition: Boolean(!realMode && ayarlar.sanalDynamicExitAktif === true && pos?.sanal && exitPlan?.ready),
      planVersion: exitPlan?.version || null,
      planCreatedAt: exitPlan?.createdAt || null
    },
    authorization: realMode ? { enabled: auth.enabled, expectedConfigured: auth.expectedConfigured, envConfigured: auth.envConfigured, valid: auth.valid } : undefined
  };
  decision.exit.assignmentId = `${decision.dnaLabel}|${decision.key}|${decision.exit.algorithmId}|${decision.exit.planCreatedAt || decision.at}`;
  pos.realOrderReadiness = decision;
  pos.executionExitAssignment = { ...decision.exit, assignedAt: decision.at, immutable: true };
  pos.exitPlanActiveForVirtual = decision.exit.activeForPosition;
  console.log(`${decision.allowed ? '✅' : '🚫'} [LİG KARAR TEŞHİSİ] ${decision.symbol} ${decision.side} | ${decision.dnaLabel} | ${decision.key} | Lig ${decision.league} | Eşleşme ${decision.leagueMatchType} | Exit ${decision.exit.label} | Aktif ${decision.exit.activeForPosition ? 'EVET' : 'HAYIR'} | Scope ${decision.exit.scope} | ${decision.allowed ? 'İZİN' : decision.reasons.join(', ')}`);
  append(decision);
  return decision;
}

function eliteIndex(model = null) {
  const m = model || dynamicExit.readModel() || {};
  const map = new Map();
  for (const row of [...(m.dnaBase || []), ...(m.dna || [])]) {
    const key = dnaIdentity.identityKey(row?.key);
    if (key && !map.has(key)) map.set(key, row);
  }
  return { model: m, map };
}

function buildPreparation(leagueModel = null, options = {}) {
  const lm = leagueModel || dnaLeague.build();
  const elites = eliteIndex(options.dynamicModel);
  const observationState = options.observationState || premierObservation.read();
  const players = lm?.allPlayers?.length ? lm.allPlayers : Object.values(lm?.leagues || {}).flat();
  const seen = new Set();
  const rows = [];
  for (const player of players) {
    const key = dnaLeague.normalizeSignatureKey(player?.key || '');
    const identity = dnaIdentity.ensure(key, { source: 'REAL_TRADING_PREPARATION' });
    if (!identity || seen.has(identity.id)) continue;
    seen.add(identity.id);
    const assignedLeague = dnaLeague.findAssignedLeague(key, lm?.leagues || {});
    const validation = player?.premierValidation || dnaLeague.premierValidation(player);
    const activeExit = player?.exit || {};
    const elite = elites.map.get(identity.key)?.allBest || null;
    const forwardProof = premierObservation.dnaForwardProof(key, observationState, options.forwardProof || {});
    const positiveExit = Boolean(activeExit.ready && activeExit.algorithmId !== 'ACTUAL' && num(activeExit.samples) >= 5 && num(activeExit.profitFactor) > 1 && num(activeExit.netUsdt) > 0);
    const blockers = [];
    if (assignedLeague !== 'PREMIER') blockers.push(`LIG_${assignedLeague}`);
    for (const failed of validation.failed || []) blockers.push(`PREMIER_${String(failed.key).toUpperCase()}_FAIL`);
    if (!positiveExit) blockers.push('GUNCEL_POZITIF_EXIT_KANITI_YOK');
    if (ayarlar.gercekEmirIleriDogrulamaAktif !== false && !forwardProof.eligible) blockers.push('ILERI_DOGRULAMA_POZITIF_DEGIL');
    const historicalCandidate = assignedLeague === 'PREMIER' && validation.eligible && positiveExit;
    const ready = historicalCandidate && (ayarlar.gercekEmirIleriDogrulamaAktif === false || forwardProof.eligible);
    rows.push({
      dnaId: identity.id,
      dnaLabel: identity.label,
      identityKey: identity.key,
      key,
      league: assignedLeague,
      ready,
      historicalCandidate,
      blockers,
      forwardProof,
      proof: {
        total: num(player.total),
        winRate: num(player.winRate),
        profitFactor: num(player.profitFactor),
        expectancy: num(player.expectancy),
        net: num(player.net),
        premierValidation: validation
      },
      activeExit: {
        algorithmId: activeExit.algorithmId || 'ACTUAL',
        label: activeExit.algorithmLabel || 'Mevcut Kademe Sistemi',
        regime: activeExit.regimeKey || lm?.regime?.activeDirection || 'BILINMIYOR',
        ready: positiveExit,
        samples: num(activeExit.samples),
        beatRate: num(activeExit.beatRate),
        profitFactor: num(activeExit.profitFactor),
        netUsdt: num(activeExit.netUsdt),
        scope: activeExit.selectionScope || 'NONE'
      },
      eliteExit: {
        algorithmId: elite?.algorithmId || activeExit.algorithmId || 'ACTUAL',
        label: elite?.algorithmLabel || activeExit.algorithmLabel || 'Mevcut Kademe Sistemi',
        samples: num(elite?.samples, activeExit.samples),
        profitFactor: num(elite?.profitFactor),
        netUsdt: num(elite?.netUsdt),
        deltaUsdt: num(elite?.deltaUsdt)
      },
      score: num(player.leagueScore)
    });
  }
  rows.sort((a, b) => Number(b.ready) - Number(a.ready) || b.score - a.score || b.proof.expectancy - a.proof.expectancy || b.proof.net - a.proof.net);
  const historicalCandidates = rows.filter(x => x.historicalCandidate);
  const ready = rows.filter(x => x.ready);
  const out = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    question: 'Bugün gerçek emir açacak olsam hangi DNA\'ları kullanırım?',
    answer: ready.length ? `${ready.length} DNA; tarihsel Premier, pozitif Exit ve ileri sanal doğrulama kanıtıyla gerçek emir için hazır.` : historicalCandidates.length ? `${historicalCandidates.length} tarihsel DNA + Exit adayı var; ileri sanal doğrulama geçilmediği için gerçek emir açılmaz.` : 'Doğrulanmış DNA + güncel pozitif Exit eşleşmesi yok; gerçek emir açılmaz.',
    failClosed: ready.length === 0,
    currentRegime: elites.model?.currentRegime?.key || 'BILINMIYOR',
    identityAudit: dnaIdentity.audit(),
    premierCount: (lm?.leagues?.premier || []).length,
    historicalCandidateCount: historicalCandidates.length,
    readyCount: ready.length,
    ready,
    forwardPending: historicalCandidates.filter(x => !x.ready),
    exitPending: rows.filter(x => x.league === 'PREMIER' && x.proof.premierValidation?.eligible && !x.historicalCandidate),
    lostChampions: lm?.audit?.lostChampions || [],
    all: rows
  };
  if (options.persist !== false) memorySafeIo.writeJsonAtomic(PREPARATION_JSON, out);
  return out;
}

function preparationTelegram(model = buildPreparation(), limit = 5) {
  let t = `\n\n🚀 <b>GERÇEK EMİR HAZIRLIK DENETİMİ — v4.6.1</b>\n`;
  t += `❓ Bugün gerçek emir açsam hangi DNA'ları kullanırım?\n`;
  t += `📌 ${model.answer}\n`;
  t += `🏆 Premier ${model.premierCount} | 🧾 Tarihsel+Exit ${model.historicalCandidateCount || 0} | ✅ İleri doğrulanmış ${model.readyCount} | ⏳ İleri bekleyen ${(model.forwardPending || []).length}\n`;
  if (model.ready.length) {
    t += model.ready.slice(0, limit).map((x, i) => `${i + 1}. ${x.dnaLabel} — ${x.key}\n   DNA: N${x.proof.total} | WR %${x.proof.winRate.toFixed(2)} | PF ${x.proof.profitFactor.toFixed(2)} | Exp ${x.proof.expectancy.toFixed(4)} | Net ${x.proof.net.toFixed(4)}\n   🎯 Aktif Exit (${x.activeExit.regime}): ${x.activeExit.label} | ExitN${x.activeExit.samples} | PF ${x.activeExit.profitFactor.toFixed(2)}\n   ⭐ Tüm Dönem Elite: ${x.eliteExit.label} | EliteN${x.eliteExit.samples}\n   🧪 İleri Kanıt: N${x.forwardProof.metrics.closed} | PF ${x.forwardProof.metrics.profitFactor.toFixed(2)} | Exp ${x.forwardProof.metrics.expectancy.toFixed(4)} | Net ${x.forwardProof.metrics.net.toFixed(4)}`).join('\n');
  } else {
    t += '🛑 Fail-closed: tarihsel başarı + pozitif Exit + DNA bazlı ileri sanal kanıt birlikte oluşmadan gerçek emir adayı üretilmez.';
    if ((model.forwardPending || []).length) {
      t += `\n⏳ <b>İLERİ KANIT BEKLEYENLER</b>\n` + model.forwardPending.slice(0, limit).map((x, i) => `${i + 1}. ${x.dnaLabel} | N${x.forwardProof.metrics.closed}/${x.forwardProof.checks.closed.required} | PF ${x.forwardProof.metrics.profitFactor.toFixed(2)} | Exp ${x.forwardProof.metrics.expectancy.toFixed(4)} | Net ${x.forwardProof.metrics.net.toFixed(4)}\n   Eksik: ${x.forwardProof.failed.map(f => f.key).join(', ')}`).join('\n');
    }
  }
  return t;
}
function copyDecisionToPosition(target, source) {
  if (!target || !source) return target;
  if (source.dnaLeagueProfile) target.dnaLeagueProfile = source.dnaLeagueProfile;
  if (source.exitPlanShadow) target.exitPlanShadow = source.exitPlanShadow;
  if (source.realOrderReadiness) target.realOrderReadiness = source.realOrderReadiness;
  if (source.executionExitAssignment) {
    target.executionExitAssignment = {
      ...source.executionExitAssignment,
      immutable: true
    };
  }
  if (Object.prototype.hasOwnProperty.call(source, 'exitPlanActiveForVirtual')) {
    target.exitPlanActiveForVirtual = Boolean(source.exitPlanActiveForVirtual);
  }
  return target;
}

function telegramText(d) {
  if (!d) return '';
  const m = d.metrics || {};
  const icon = d.allowed ? '✅' : '🚫';
  return `\n\n🛡️ <b>AGROS EMİR KARAR KAPISI</b>\n` +
    `${icon} Mod: ${d.mode} | Karar: <b>${d.allowed ? 'İZİN' : 'ENGEL'}</b>\n` +
    `🏆 Lig: ${d.league} | N${m.total || 0} | Exp ${num(m.expectancy).toFixed(4)} | PF ${num(m.profitFactor).toFixed(2)} | Net ${num(m.net).toFixed(4)}\n` +
    `🌦️ Rejim: ${d.regime?.key || 'YOK'}\n` +
    `🚪 Exit: ${d.exit?.label || 'Mevcut Kademe Sistemi'} | ${d.exit?.scope || 'FALLBACK'} | ${d.exit?.activeForPosition ? 'AKTİF' : 'FALLBACK'}\n` +
    `📊 Exit Kanıtı: N${num(d.exit?.samples)} | Beat %${num(d.exit?.beatRate).toFixed(1)} | PF ${num(d.exit?.profitFactor).toFixed(2)} | Net ${num(d.exit?.netUsdt).toFixed(4)}\n` +
    `🧪 İleri DNA Kanıtı: N${num(d.forwardProof?.metrics?.closed)} | PF ${num(d.forwardProof?.metrics?.profitFactor).toFixed(2)} | Exp ${num(d.forwardProof?.metrics?.expectancy).toFixed(4)} | Net ${num(d.forwardProof?.metrics?.net).toFixed(4)} | ${d.forwardProof?.eligible ? 'GEÇTİ' : 'BEKLİYOR'}\n` +
    `🔎 Exit Sebebi: ${d.exit?.reason || 'YOK'}\n` +
    (!d.allowed ? `📌 Sebep: ${d.reasons.join(', ')}` : (d.mode === 'VIRTUAL' ? `🧪 Alt öğrenme katmanı: tüm geçerli DNA'lar açık | Lig yalnız etiket` : `🔒 Gerçek katman: ${d.realTier} | Boyut x${num(d.sizeMultiplier, 1).toFixed(2)} | Güncel kazanan exit`));
}
module.exports = { VERSION, AUDIT_JSONL, PREPARATION_JSON, evaluate, buildPreparation, preparationTelegram, copyDecisionToPosition, telegramText, realAuthorization };
