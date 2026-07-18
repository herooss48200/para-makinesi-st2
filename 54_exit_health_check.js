/** AGROS v4.5.1 — Exit Health Check, memory-safe. Trade Engine'e dokunmaz. */
const fs = require('fs');
const path = require('path');
const replay = require('./22_exit_replay_engine.js');
const io = require('./53_memory_safe_io.js');
const FILE = path.join(__dirname, 'data', 'exit-replay-results.jsonl');
const OUT = path.join(__dirname, 'data', 'exit-health-check.json');
const VERSION = 'v4.5.1-EXIT-HEALTH-CHECK-MEMORY-SAFE';
function n(v, d = 0) { v = Number(v); return Number.isFinite(v) ? v : d; }
function catalog() { return replay.algorithms().map(a => ({ id: a.id, label: a.label, className: a.className || '', isExecutable: a.isExecutable !== false })); }
function build(file = FILE) {
  const rows = {};
  for (const a of catalog()) rows[a.id] = { ...a, evaluated: 0, dataAvailable: 0, dataMissing: 0, triggered: 0, fallback: 0, winner: 0, netUsdt: 0, deltaUsdt: 0 };
  let trades = 0, atrPathTrades = 0;
  const scan = io.forEachJsonlSync(file, r => {
    trades++;
    if ((r.input?.pathRows || []).some(x => n(x.atrPct) > 0)) atrPathTrades++;
    const candidates = (r.results || []).filter(x => x.algorithmId !== 'ACTUAL' && x.isExecutable !== false && x.dataAvailable !== false);
    const best = candidates.slice().sort((a, b) => n(b.netUsdt) - n(a.netUsdt))[0];
    for (const x of (r.results || [])) {
      const b = rows[x.algorithmId];
      if (!b) continue;
      b.evaluated++;
      if (x.dataAvailable === false) b.dataMissing++; else b.dataAvailable++;
      if (x.modelTriggered !== false) b.triggered++;
      if (String(x.exitSource || '').includes('FALLBACK') || x.modelTriggered === false) b.fallback++;
      b.netUsdt += n(x.netUsdt); b.deltaUsdt += n(x.deltaVsActualUsdt);
      if (best && best.algorithmId === x.algorithmId) b.winner++;
    }
  }, { chunkBytes: 256 * 1024, maxLineBytes: 8 * 1024 * 1024 });
  const models = Object.values(rows).map(x => ({ ...x, netUsdt: +x.netUsdt.toFixed(4), deltaUsdt: +x.deltaUsdt.toFixed(4), health: x.evaluated === 0 ? 'NEVER_EVALUATED' : x.dataAvailable === 0 ? 'NO_DATA' : x.triggered === 0 ? 'NEVER_TRIGGERED' : 'ACTIVE' }));
  const out = { version: VERSION, createdAt: new Date().toISOString(), catalogCount: models.length, expectedLegacyCount: 33, catalogMismatch: models.length !== 33, trades, invalid: scan.invalid, oversized: scan.oversized, atr: { pathTrades: atrPathTrades, models: models.filter(x => x.className === 'ATR_TRAILING') }, models };
  io.writeJsonAtomic(OUT, out);
  return out;
}
function telegram(m = build()) { const atr = m.atr.models; return `\n\n🩺 <b>EXIT HEALTH CHECK — v4.5.1</b>\n📚 Aktif katalog: <b>${m.catalogCount}</b> | Eski hedef: 33 ${m.catalogMismatch ? '⚠️' : '✅'}\n📦 İncelenen kapanış: ${m.trades} | Bozuk satır: ${m.invalid}\n🌡️ ATR verili işlem: ${m.atr.pathTrades}\n${atr.map(x => `${x.label}: Değ ${x.evaluated} | Veri ${x.dataAvailable} | Eksik ${x.dataMissing} | Tetik ${x.triggered} | Winner ${x.winner} | Fallback ${x.fallback}`).join('\n') || 'ATR modeli katalogda yok.'}`; }
module.exports = { VERSION, FILE, OUT, catalog, build, telegram };
