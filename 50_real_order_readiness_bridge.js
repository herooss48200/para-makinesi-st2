/**
 * AGROS v4.2.0 - REAL ORDER READINESS BRIDGE
 *
 * Ortak karar kapısı:
 * - Sanal öğrenme katmanı ligden bağımsızdır; tüm geçerli tetikler veri üretir.
 * - Gerçek emir katmanı Premier + kârlılık + açık yetki ile fail-closed çalışır.
 * - Gerçek emir fail-closed çalışır.
 * - Lig modeli, DNA imzası veya açık yetkilendirme yoksa Binance emri gönderilmez.
 * - Dinamik exit kanıtı varsa plana eklenir; yoksa mevcut kademe güvenli fallback'tir.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const dnaLeague = require('./46_dna_league_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');

const VERSION = 'v4.2.8-DUAL-LAYER-RUNTIME-LOCK';
const DATA_DIR = path.join(__dirname, 'data');
const AUDIT_JSONL = path.join(DATA_DIR, 'real-order-readiness-audit.jsonl');

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
  const profile = dnaLeague.attachToPosition(pos);
  const exitPlan = dnaExitSelector.attachToPosition(pos);
  const maxAge = Math.max(5, num(ayarlar.gercekEmirLigModelMaksYasDakika, 360));
  const age = modelAgeMinutes();
  const auth = realAuthorization();
  const reasons = [];

  if (ayarlar.dnaLeagueAktif === false) reasons.push('DNA_LIGI_KAPALI');
  if (!key) reasons.push('DNA_IMZASI_YOK');

  const currentLeague = profile?.league || 'UNRANKED';

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

    if (premier) {
      realTier = 'PREMIER';
      sizeMultiplier = Math.max(0.01, Math.min(1, num(ayarlar.gercekEmirPremierBoyutCarpani, 1)));
      if (ayarlar.gercekEmirPremierKapisiAktif !== true) reasons.push('GERCEK_PREMIER_KAPISI_KAPALI');
    } else if (championship) {
      realTier = 'CHAMPIONSHIP';
      sizeMultiplier = Math.max(0.01, Math.min(1, num(ayarlar.gercekEmirChampionshipBoyutCarpani, 0.25)));
      if (ayarlar.gercekEmirChampionshipKapisiAktif !== true) reasons.push('GERCEK_CHAMPIONSHIP_KAPISI_KAPALI');
    }
  } else {
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
    key: key || 'SIGNATURE_YOK',
    allowed: reasons.length === 0,
    reasons,
    league: currentLeague,
    leagueMatchType: profile?.matchType || (profile ? 'EXACT' : 'NONE'),
    virtualPool: !realMode ? 'ALL_VALID_DNA_LEARNING' : null,
    realTier,
    sizeMultiplier: realMode ? sizeMultiplier : 1,
    leagueModelAgeMinutes: Number.isFinite(age) ? Number(age.toFixed(2)) : null,
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
      executionPolicy: exitPlan?.ready ? (realMode ? 'VALIDATED_DYNAMIC_EXIT_REAL_GUARDED' : 'VALIDATED_DYNAMIC_EXIT_VIRTUAL_ACTIVE') : 'CURRENT_LADDER_FALLBACK'
    },
    authorization: realMode ? { enabled: auth.enabled, expectedConfigured: auth.expectedConfigured, envConfigured: auth.envConfigured, valid: auth.valid } : undefined
  };
  pos.realOrderReadiness = decision;
  console.log(`${decision.allowed ? '✅' : '🚫'} [LİG KARAR TEŞHİSİ] ${decision.symbol} ${decision.side} | ${decision.key} | Lig ${decision.league} | Eşleşme ${decision.leagueMatchType} | Exit ${decision.exit.label} | ${decision.allowed ? 'İZİN' : decision.reasons.join(', ')}`);
  append(decision);
  return decision;
}
function telegramText(d) {
  if (!d) return '';
  const m = d.metrics || {};
  const icon = d.allowed ? '✅' : '🚫';
  return `\n\n🛡️ <b>AGROS EMİR KARAR KAPISI</b>\n` +
    `${icon} Mod: ${d.mode} | Karar: <b>${d.allowed ? 'İZİN' : 'ENGEL'}</b>\n` +
    `🏆 Lig: ${d.league} | N${m.total || 0} | Exp ${num(m.expectancy).toFixed(4)} | PF ${num(m.profitFactor).toFixed(2)} | Net ${num(m.net).toFixed(4)}\n` +
    `🌦️ Rejim: ${d.regime?.key || 'YOK'}\n` +
    `🚪 Exit: ${d.exit?.label || 'Mevcut Kademe Sistemi'} | ${d.exit?.scope || 'FALLBACK'}\n` +
    (!d.allowed ? `📌 Sebep: ${d.reasons.join(', ')}` : (d.mode === 'VIRTUAL' ? `🧪 Alt öğrenme katmanı: tüm geçerli DNA'lar açık | Lig yalnız etiket` : `🔒 Gerçek katman: ${d.realTier} | Boyut x${num(d.sizeMultiplier, 1).toFixed(2)} | Güncel kazanan exit`));
}
module.exports = { VERSION, AUDIT_JSONL, evaluate, telegramText, realAuthorization };
