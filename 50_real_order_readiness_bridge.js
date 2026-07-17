/**
 * AGROS v4.2.0 - REAL ORDER READINESS BRIDGE
 *
 * Ortak karar kapısı:
 * - Sanal ve gerçek emir aynı DNA/Premier kararından geçer.
 * - Gerçek emir fail-closed çalışır.
 * - Lig modeli, DNA imzası veya açık yetkilendirme yoksa Binance emri gönderilmez.
 * - Dinamik exit kanıtı varsa plana eklenir; yoksa mevcut kademe güvenli fallback'tir.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const dnaLeague = require('./46_dna_league_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');

const VERSION = 'v4.2.2-DYNAMIC-LEAGUE-VIRTUAL-GATE';
const DATA_DIR = path.join(__dirname, 'data');
const AUDIT_JSONL = path.join(DATA_DIR, 'real-order-readiness-audit.jsonl');

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function append(row) { try { ensureDir(); fs.appendFileSync(AUDIT_JSONL, JSON.stringify(row) + '\n'); } catch (_) {} }
function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return sig.key || (sig.btcBits && sig.coinBits && pos?.yon
    ? `YON=${String(pos.yon).toUpperCase()}|BTC=${sig.btcBits}|COIN=${sig.coinBits}` : '');
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
  const virtualLeagueAllowed =
    (currentLeague === 'PREMIER' && ayarlar.sanalTestPremierAktif !== false) ||
    (currentLeague === 'CHAMPIONSHIP' && ayarlar.sanalTestChampionshipAktif === true);

  if (realMode) {
    // Gerçek emir güvenliği değişmez: sadece o an Premier olan, kanıtlı kârlı DNA geçebilir.
    if (currentLeague !== 'PREMIER') reasons.push(`LIG_${currentLeague}`);
    if (!(num(profile?.total) >= Math.max(1, num(ayarlar.dnaLeaguePremierMinOrnek, 10)))) reasons.push('ORNEK_YETERSIZ');
    if (!(num(profile?.expectancy) > 0)) reasons.push('EXPECTANCY_POZITIF_DEGIL');
    if (!(num(profile?.profitFactor) > 1)) reasons.push('PF_1_USTU_DEGIL');
    if (!(num(profile?.net) > 0)) reasons.push('NET_POZITIF_DEGIL');
    if (!Number.isFinite(age) || age > maxAge) reasons.push('LIG_MODELI_ESKI_VEYA_YOK');
  } else if (!virtualLeagueAllowed) {
    // Sanal test havuzu sabit sayı kullanmaz; güncel lig dosyasındaki tüm Premier ve Championship üyeleri dinamiktir.
    reasons.push(`SANAL_TEST_LIGI_${currentLeague}`);
  }

  if (realMode) {
    if (ayarlar.gercekEmirPremierKapisiAktif !== true) reasons.push('GERCEK_PREMIER_KAPISI_KAPALI');
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
    virtualPool: !realMode && virtualLeagueAllowed ? currentLeague : null,
    leagueModelAgeMinutes: Number.isFinite(age) ? Number(age.toFixed(2)) : null,
    metrics: {
      total: num(profile?.total), expectancy: num(profile?.expectancy),
      profitFactor: num(profile?.profitFactor), net: num(profile?.net),
      score: num(profile?.leagueScore)
    },
    regime: exitPlan?.currentRegime || null,
    exit: {
      ready: Boolean(exitPlan?.ready),
      algorithmId: exitPlan?.selectedAlgorithmId || 'ACTUAL',
      label: exitPlan?.selectedAlgorithmLabel || 'Mevcut Kademe Sistemi',
      scope: exitPlan?.selectionScope || 'ACTUAL_FALLBACK',
      executionPolicy: exitPlan?.ready ? 'VALIDATED_PLAN_METADATA_CURRENT_LADDER_GUARD' : 'CURRENT_LADDER_FALLBACK'
    },
    authorization: realMode ? { enabled: auth.enabled, expectedConfigured: auth.expectedConfigured, envConfigured: auth.envConfigured, valid: auth.valid } : undefined
  };
  pos.realOrderReadiness = decision;
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
    (!d.allowed ? `📌 Sebep: ${d.reasons.join(', ')}` : (d.mode === 'VIRTUAL' ? `🧪 Sanal test havuzu: ${d.virtualPool || d.league}` : '🔒 Gerçek emir yalnızca Premier ve açık yetki ile çalışır.'));
}
module.exports = { VERSION, AUDIT_JSONL, evaluate, telegramText, realAuthorization };
