/**
 * AGROS v3.11.0 - DNA EXIT SELECTOR / SHADOW MODE
 *
 * Amaç:
 * - Exit Evolution/Consensus sonuçlarından her DNA için en güvenilir uygulanabilir exit planını seçmek.
 * - Seçimi yeni pozisyona gölge plan olarak eklemek.
 * - Gerçek kademe sistemini DEĞİŞTİRMEDEN, kapanışta seçilen planın replay sonucunu doğrulamak.
 *
 * Güvenlik:
 * - Trade Engine, SL/TP veya gerçek kapanış davranışına müdahale etmez.
 * - Yetersiz örnekte ve zayıf üstünlükte CURRENT_LADDER fallback kullanır.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const dynamicExit = require('./47_dynamic_dna_exit_engine.js');
const memorySafeIo = require('./53_memory_safe_io.js');

const VERSION = 'v4.2.1-DNA-EXIT-SELECTOR-SANAL-ACTIVE';
const DATA_DIR = path.join(__dirname, 'data');
const MODEL_JSON = path.join(DATA_DIR, 'exit-replay-model.json');
const VALIDATION_JSONL = path.join(DATA_DIR, 'dna-exit-shadow-validation.jsonl');
const VALIDATION_MODEL = path.join(DATA_DIR, 'dna-exit-shadow-validation-model.json');

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, d = 4) { return Number(num(v).toFixed(d)); }
function ensureDataDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return sig.shortKey || pos?.execution?.signatureShort || '';
}
function readModel() {
  try { return JSON.parse(fs.readFileSync(MODEL_JSON, 'utf8')); }
  catch (_) { return null; }
}
function fallbackPlan(key, reason, samples = 0) {
  return {
    version: VERSION,
    mode: 'SHADOW_ONLY',
    signature: key || 'SIGNATURE_YOK',
    selectedAlgorithmId: 'ACTUAL',
    selectedAlgorithmLabel: 'Mevcut Kademe Sistemi',
    decision: 'CURRENT_LADDER_FALLBACK',
    ready: false,
    samples,
    reason,
    createdAt: new Date().toISOString(),
    executionPolicy: 'NO_TRADE_ENGINE_EFFECT'
  };
}
function selectForPosition(pos, model = null) {
  if (ayarlar.dnaExitSelectorAktif === false) return null;
  if (ayarlar.dynamicExitEngineAktif !== false) {
    try { return dynamicExit.selectForPosition(pos); }
    catch (err) { return fallbackPlan(signature(pos), `Dinamik exit fallback: ${err.message}`); }
  }
  const key = signature(pos);
  if (!key) return fallbackPlan('', 'DNA imzası bulunamadı.');
  const m = model || readModel();
  if (!m) return fallbackPlan(key, 'Exit Replay modeli henüz oluşmadı.');
  const dna = (m.dna || []).find(x => x.key === key);
  if (!dna?.bestExit) return fallbackPlan(key, 'Bu DNA için replay profili yok.');
  return fallbackPlan(key, 'Dinamik exit motoru kapalı; güvenli kademe fallback.', num(dna.samples));
}

function attachToPosition(pos) {
  if (!pos || ayarlar.dnaExitSelectorAktif === false) return null;
  const plan = selectForPosition(pos);
  pos.exitPlanShadow = plan;
  pos.exitPlanActiveForVirtual = Boolean(ayarlar.sanalDynamicExitAktif === true && pos.sanal && plan?.ready);
  return plan;
}
function readValidationRows(limit = 5000) {
  return memorySafeIo.readJsonlTailSync(VALIDATION_JSONL, limit, { maxScanBytes: 16 * 1024 * 1024 });
}
function buildValidationModel(rows = null) {
  const buckets = {};
  let totalValidated = 0;
  const consume = (r) => {
    totalValidated++;
    const key = r.selectedAlgorithmId || 'UNKNOWN';
    const b = buckets[key] || { key, label: r.selectedAlgorithmLabel || key, samples: 0, beatActual: 0, lostToActual: 0, equalActual: 0, deltaUsdt: 0, selectedNetUsdt: 0, actualNetUsdt: 0 };
    b.samples++;
    b.deltaUsdt += num(r.deltaVsActualUsdt);
    b.selectedNetUsdt += num(r.selectedNetUsdt);
    b.actualNetUsdt += num(r.actualNetUsdt);
    if (num(r.deltaVsActualUsdt) > 0.000001) b.beatActual++;
    else if (num(r.deltaVsActualUsdt) < -0.000001) b.lostToActual++;
    else b.equalActual++;
    buckets[key] = b;
  };
  if (Array.isArray(rows)) rows.forEach(consume);
  else memorySafeIo.forEachJsonlSync(VALIDATION_JSONL, consume);
  const algorithms = Object.values(buckets).map(b => ({
    ...b,
    deltaUsdt: round(b.deltaUsdt, 4),
    selectedNetUsdt: round(b.selectedNetUsdt, 4),
    actualNetUsdt: round(b.actualNetUsdt, 4),
    beatRate: b.samples ? round((b.beatActual / b.samples) * 100, 1) : 0,
    avgDeltaUsdt: b.samples ? round(b.deltaUsdt / b.samples, 4) : 0
  })).sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
  return { version: VERSION, createdAt: new Date().toISOString(), totalValidated, algorithms };
}
function validateReplay(pos, record) {
  const plan = pos?.exitPlanShadow;
  if (!plan?.ready || !record?.results) return null;
  const selected = record.results.find(x => x.algorithmId === plan.selectedAlgorithmId);
  const actual = record.results.find(x => x.algorithmId === 'ACTUAL');
  if (!selected || !actual) return null;
  ensureDataDir();
  const row = {
    version: VERSION,
    zaman: new Date().toISOString(),
    tradeId: record.input?.tradeId || '',
    symbol: record.input?.symbol || pos?.sym || '',
    side: record.input?.side || pos?.yon || '',
    signature: plan.signature,
    selectedAlgorithmId: plan.selectedAlgorithmId,
    selectedAlgorithmLabel: plan.selectedAlgorithmLabel,
    planCreatedAt: plan.createdAt,
    planSamples: plan.samples,
    planBeatRate: plan.beatRate,
    actualNetUsdt: round(actual.netUsdt, 6),
    selectedNetUsdt: round(selected.netUsdt, 6),
    deltaVsActualUsdt: round(selected.netUsdt - actual.netUsdt, 6),
    selectedWouldWin: num(selected.netUsdt) > num(actual.netUsdt) + 0.000001
  };
  fs.appendFileSync(VALIDATION_JSONL, JSON.stringify(row) + '\n');
  fs.writeFileSync(VALIDATION_MODEL, JSON.stringify(buildValidationModel(), null, 2));
  record.shadowExitValidation = row;
  return row;
}
function openingText(plan) {
  if (!plan || ayarlar.dnaExitSelectorTelegramAktif === false) return '';
  if (!plan.ready) return `\n🧬 Exit Planı: Mevcut Kademe (gölge seçim için ${plan.reason})`;
  return `\n🧬 Exit Planı: ${plan.selectedAlgorithmLabel}\n📊 Kanıt: ${plan.samples} işlem | Beat %${num(plan.beatRate).toFixed(1)} | PF ${num(plan.profitFactor).toFixed(2)}\n🧪 Sanal modda aktif uygulanır; gerçek emir çıkışı kilitli kalır.`;
}
function closingText(record) {
  const v = record?.shadowExitValidation;
  if (!v || ayarlar.dnaExitSelectorTelegramAktif === false) return '';
  return `\n\n🧬 <b>DNA EXIT SHADOW DOĞRULAMA</b>\n🎯 Seçilen: <b>${v.selectedAlgorithmLabel}</b>\n✅ Gerçek Kademe: ${num(v.actualNetUsdt) >= 0 ? '+' : ''}${num(v.actualNetUsdt).toFixed(4)} USDT\n🧪 Gölge Sonuç: ${num(v.selectedNetUsdt) >= 0 ? '+' : ''}${num(v.selectedNetUsdt).toFixed(4)} USDT\n📈 Fark: <b>${num(v.deltaVsActualUsdt) >= 0 ? '+' : ''}${num(v.deltaVsActualUsdt).toFixed(4)} USDT</b> | ${v.selectedWouldWin ? 'GÖLGE KAZANDI' : 'KADEME KAZANDI'}\nℹ️ Henüz emir/stop davranışına uygulanmadı.`;
}

module.exports = { VERSION, readModel, selectForPosition, attachToPosition, validateReplay, buildValidationModel, openingText, closingText };
