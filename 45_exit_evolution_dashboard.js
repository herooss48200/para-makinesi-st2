/**
 * AGROS v4.5.5 - EXIT EVOLUTION TELEGRAM DASHBOARD
 * Replay/selector modellerini tek, okunabilir Telegram raporunda birleştirir.
 * Trade Engine davranışını değiştirmez.
 */
const exitReplay = require('./22_exit_replay_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const ayarlar = require('./ayarlar.js');
const dnaIdentity = require('./59_dna_identity_registry.js');

const VERSION = 'v4.6.0-EXIT-EVOLUTION-DNA-ID';
function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function sign(v, digits = 2) { const n = num(v); return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`; }
function safe(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildDashboardModel(replayModel = null, validationModel = null) {
  const replay = replayModel || exitReplay.buildModel();
  const validation = validationModel || dnaExitSelector.buildValidationModel();
  const configuredCatalog = exitReplay.algorithms().filter(x => x?.isExecutable !== false);
  const configuredIds = new Set(configuredCatalog.map(x => String(x.id)));
  const algorithms = (replay?.algorithmRanking || []).filter(x => x.key !== 'ACTUAL' && configuredIds.has(String(x.key)));
  const dnaReady = (replay?.dna || []).filter(x => x.bestExit && configuredIds.has(String(x.bestExit.key || x.bestExit.algorithmId)) && x.samples >= num(ayarlar.exitEvolutionDashboardMinDnaOrnek, 10));
  const opportunities = (replay?.missedOpportunityDna || []).filter(x => x.bestExit);
  const topAlgorithms = algorithms.slice(0, num(ayarlar.exitEvolutionDashboardTopModel, 5));
  const topDna = dnaReady.sort((a,b) => num(b.bestExit?.deltaUsdt)-num(a.bestExit?.deltaUsdt)).slice(0, num(ayarlar.exitEvolutionDashboardTopDna, 5)).map(x => dnaIdentity.decorate(x, x.key, { source: 'EXIT_EVOLUTION_DASHBOARD' }));
  const shadow = validation?.algorithms || [];
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    totalTrades: num(replay?.totalTrades),
    totalAlgorithms: configuredCatalog.length,
    expectedCoreAlgorithms: 27,
    historicalInactiveAlgorithms: num(replay?.historicalInactiveAlgorithmCount),
    systemComparison: replay?.systemComparison || {},
    topAlgorithms,
    topDna,
    opportunities: opportunities.slice(0, 3).map(x => dnaIdentity.decorate(x, x.key, { source: 'EXIT_EVOLUTION_OPPORTUNITY' })),
    shadowTotal: num(validation?.totalValidated),
    shadowAlgorithms: shadow.slice(0, 5),
    pendingModels: replay?.pendingModels || []
  };
}

function telegramMetni(model = null) {
  if (ayarlar.exitEvolutionDashboardAktif === false) return '';
  const m = model || buildDashboardModel();
  let t = `🧬 <b>EXIT EVOLUTION DASHBOARD — v4.6</b>\n`;
  t += `📦 Replay kapanış: <b>${m.totalTrades}</b> | Çekirdek yarışan exit: <b>${m.totalAlgorithms}</b>\n`;
  if (num(m.historicalInactiveAlgorithms) > 0) t += `🗃️ Yarış dışı eski varyant: <b>${num(m.historicalInactiveAlgorithms)}</b> (arşivde korunur)\n`;
  t += `✅ Gerçek Kademe Net: <b>${sign(m.systemComparison.actualNetUsdt)} USDT</b>\n`;
  t += `🔭 Oracle potansiyeli: ${sign(m.systemComparison.potentialDeltaUsdt)} USDT`;
  if (num(m.systemComparison.improvementPct)) t += ` | %${num(m.systemComparison.improvementPct).toFixed(1)}`;

  if (m.topAlgorithms.length) {
    t += `\n\n🏁 <b>MEVCUT KADEMEYE KARŞI MODEL SIRALAMASI</b>\n`;
    t += m.topAlgorithms.map((x,i) => `${i+1}. <b>${safe(x.label)}</b> | N:${x.samples} | Δ ${sign(x.deltaUsdt)} | Beat %${num(x.beatRate).toFixed(1)} | PF ${num(x.profitFactor).toFixed(2)}`).join('\n');
  } else {
    t += `\n\n⏳ Henüz uygulanabilir replay sıralaması oluşmadı.`;
  }

  if (m.topDna.length) {
    t += `\n\n🧬 <b>DNA BAZINDA EN GÜÇLÜ EXIT ADAYLARI</b>\n`;
    t += m.topDna.map((x,i) => `${i+1}. ${safe(x.dnaLabel || 'DNA #YOK')} — ${safe(x.key)}\n   🥇 ${safe(x.bestExit.label)} | N:${x.samples} | Δ ${sign(x.bestExit.deltaUsdt)} | Beat %${num(x.bestExit.beatRate).toFixed(1)}`).join('\n');
  }

  if (m.opportunities.length) {
    t += `\n\n📉 <b>EN ÇOK KÂR KAÇIRILAN DNA'LAR</b>\n`;
    t += m.opportunities.map((x,i) => `${i+1}. ${safe(x.dnaLabel || 'DNA #YOK')} — ${safe(x.key)} → ${safe(x.bestExit.label)} | Kaçan ${sign(x.bestExit.deltaUsdt)} USDT`).join('\n');
  }

  t += `\n\n🧪 <b>GÖLGE EXIT CANLI DOĞRULAMA</b>\n`;
  t += `Sonuçlanan gölge plan: <b>${m.shadowTotal}</b>\n`;
  if (m.shadowAlgorithms.length) {
    t += m.shadowAlgorithms.map((x,i) => `${i+1}. ${safe(x.label)} | N:${x.samples} | Beat %${num(x.beatRate).toFixed(1)} | Δ ${sign(x.deltaUsdt)} | Ort ${sign(x.avgDeltaUsdt,4)}`).join('\n');
  } else {
    t += `⏳ Deploy sonrası seçilip kapanacak yeni pozisyonlar bekleniyor.`;
  }
  if (m.pendingModels.length) t += `\n\n⚙️ Veri bekleyen: ${m.pendingModels.map(safe).join(', ')}`;
  t += `\n\nℹ️ Replay/gölge analizidir; gerçek SL/TP ve kademe sistemi değişmedi.`;
  return t;
}

module.exports = { VERSION, buildDashboardModel, telegramMetni };
