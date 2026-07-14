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

const VERSION = 'v3.11.0-DNA-EXIT-SELECTOR-SHADOW';
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
  const key = signature(pos);
  if (!key) return fallbackPlan('', 'DNA imzası bulunamadı.');
  const m = model || readModel();
  if (!m) return fallbackPlan(key, 'Exit Replay modeli henüz oluşmadı.');

  const minSamples = Math.max(1, num(ayarlar.dnaExitSelectorMinOrnek, 20));
  const minBeatRate = Math.max(0, num(ayarlar.dnaExitSelectorMinBeatRate, 60));
  const minDelta = Math.max(0, num(ayarlar.dnaExitSelectorMinDeltaUsdt, 1));
  const minPf = Math.max(0, num(ayarlar.dnaExitSelectorMinProfitFactor, 1.10));
  const minAgreement = Math.max(0, num(ayarlar.dnaExitSelectorMinConsensus, 60));

  const dna = (m.dna || []).find(x => x.key === key);
  const consensus = (m.exitConsensus?.dna || []).find(x => x.key === key);
  if (!dna) return fallbackPlan(key, 'Bu DNA için replay profili yok.');
  if (num(dna.samples) < minSamples) return fallbackPlan(key, `Örnek yetersiz (${dna.samples}/${minSamples}).`, dna.samples);

  const best = dna.bestExit;
  if (!best || !best.key || best.key === 'ACTUAL') return fallbackPlan(key, 'Uygulanabilir alternatif exit lideri yok.', dna.samples);
  if (num(best.samples) < minSamples) return fallbackPlan(key, `Lider exit örneği yetersiz (${best.samples}/${minSamples}).`, dna.samples);
  if (num(best.beatRate) < minBeatRate) return fallbackPlan(key, `Gerçeği geçme oranı düşük (%${num(best.beatRate).toFixed(1)} < %${minBeatRate}).`, dna.samples);
  if (num(best.deltaUsdt) < minDelta) return fallbackPlan(key, `Toplam üstünlük zayıf (${num(best.deltaUsdt).toFixed(2)} < ${minDelta.toFixed(2)} USDT).`, dna.samples);
  if (num(best.profitFactor) < minPf) return fallbackPlan(key, `Profit Factor yetersiz (${num(best.profitFactor).toFixed(2)} < ${minPf.toFixed(2)}).`, dna.samples);
  if (consensus?.ready && num(consensus.agreementPct) < minAgreement) return fallbackPlan(key, `Exit Consensus düşük (%${num(consensus.agreementPct).toFixed(1)} < %${minAgreement}).`, dna.samples);

  return {
    version: VERSION,
    mode: 'SHADOW_ONLY',
    signature: key,
    selectedAlgorithmId: best.key,
    selectedAlgorithmLabel: best.label,
    decision: 'DNA_EXIT_CANDIDATE',
    ready: true,
    samples: dna.samples,
    beatRate: round(best.beatRate, 1),
    totalDeltaUsdt: round(best.deltaUsdt, 4),
    avgDeltaUsdt: round(best.avgDeltaUsdt, 4),
    profitFactor: round(best.profitFactor, 2),
    consensusAgreementPct: consensus?.ready ? round(consensus.agreementPct, 1) : null,
    consensusRecommendation: consensus?.recommendation || 'VERI_YOK',
    reason: `${best.label}; ${dna.samples} örnek, gerçeği geçme %${num(best.beatRate).toFixed(1)}, avantaj ${num(best.deltaUsdt).toFixed(2)} USDT.`,
    createdAt: new Date().toISOString(),
    executionPolicy: 'NO_TRADE_ENGINE_EFFECT'
  };
}
function attachToPosition(pos) {
  if (!pos || ayarlar.dnaExitSelectorAktif === false) return null;
  const plan = selectForPosition(pos);
  pos.exitPlanShadow = plan;
  return plan;
}
function readValidationRows() {
  try {
    if (!fs.existsSync(VALIDATION_JSONL)) return [];
    return fs.readFileSync(VALIDATION_JSONL, 'utf8').split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x));
  } catch (_) { return []; }
}
function buildValidationModel(rows = null) {
  const data = rows || readValidationRows();
  const buckets = {};
  for (const r of data) {
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
  }
  const algorithms = Object.values(buckets).map(b => ({
    ...b,
    deltaUsdt: round(b.deltaUsdt, 4),
    selectedNetUsdt: round(b.selectedNetUsdt, 4),
    actualNetUsdt: round(b.actualNetUsdt, 4),
    beatRate: b.samples ? round((b.beatActual / b.samples) * 100, 1) : 0,
    avgDeltaUsdt: b.samples ? round(b.deltaUsdt / b.samples, 4) : 0
  })).sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
  return { version: VERSION, createdAt: new Date().toISOString(), totalValidated: data.length, algorithms };
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
  return `\n🧬 Gölge Exit Planı: ${plan.selectedAlgorithmLabel}\n📊 Kanıt: ${plan.samples} işlem | Beat %${num(plan.beatRate).toFixed(1)} | Δ ${num(plan.totalDeltaUsdt) >= 0 ? '+' : ''}${num(plan.totalDeltaUsdt).toFixed(2)} USDT\n🛡️ Gerçek çıkış hâlâ mevcut kademe sistemi.`;
}
function closingText(record) {
  const v = record?.shadowExitValidation;
  if (!v || ayarlar.dnaExitSelectorTelegramAktif === false) return '';
  return `\n\n🧬 <b>DNA EXIT SHADOW DOĞRULAMA</b>\n🎯 Seçilen: <b>${v.selectedAlgorithmLabel}</b>\n✅ Gerçek Kademe: ${num(v.actualNetUsdt) >= 0 ? '+' : ''}${num(v.actualNetUsdt).toFixed(4)} USDT\n🧪 Gölge Sonuç: ${num(v.selectedNetUsdt) >= 0 ? '+' : ''}${num(v.selectedNetUsdt).toFixed(4)} USDT\n📈 Fark: <b>${num(v.deltaVsActualUsdt) >= 0 ? '+' : ''}${num(v.deltaVsActualUsdt).toFixed(4)} USDT</b> | ${v.selectedWouldWin ? 'GÖLGE KAZANDI' : 'KADEME KAZANDI'}\nℹ️ Henüz emir/stop davranışına uygulanmadı.`;
}

module.exports = { VERSION, readModel, selectForPosition, attachToPosition, validateReplay, buildValidationModel, openingText, closingText };
