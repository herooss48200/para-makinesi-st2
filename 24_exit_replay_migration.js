/**
 * AGROS v3.6.5.1 - Exit Replay History Migration
 *
 * Eski exit-replay-results.jsonl kayıtlarını v3.6.5 DNA Scoreboard özetine taşır.
 * Trade engine'e dokunmaz. Çalıştırmadan önce state/model yedeği alır.
 */
const fs = require('fs');
const path = require('path');

const VERSION = 'v3.6.5.2-EXIT-ORACLE-SEPARATION';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const JSONL = path.join(DATA_DIR, 'exit-replay-results.jsonl');
const STATE = path.join(DATA_DIR, 'sanal-state.json');
const MODEL = path.join(DATA_DIR, 'exit-replay-model.json');

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function stamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-'); }
function backup(file, suffix) {
  if (!fs.existsSync(file)) return null;
  const target = `${file}.backup-before-exit-migration-${suffix}`;
  fs.copyFileSync(file, target);
  return target;
}
function emptySummary() {
  return {
    version: VERSION,
    totalTrades: 0,
    lastUpdate: null,
    byAlgorithm: {},
    bySignature: {},
    timeBehavior: {},
    last10: [],
    actualTotalNetUsdt: 0,
    oracleBestTotalNetUsdt: 0,
    oraclePotentialDeltaUsdt: 0,
    lastTelegramReportTradeCount: 0,
    migration: null
  };
}
function ensureBucket(map, key, label) {
  if (!map[key]) map[key] = { key, label: label || key, algorithmClass: '', isExecutable: true, samples: 0, netUsdt: 0, actualNetUsdt: 0, deltaUsdt: 0, winsVsActual: 0, lossesVsActual: 0, profitableTrades: 0, losingTrades: 0, grossProfitUsdt: 0, grossLossUsdt: 0 };
  return map[key];
}
function addBucket(map, key, label, result, actualNetUsdt) {
  const b = ensureBucket(map, key, label);
  if (!b.algorithmClass && result?.algorithmClass) b.algorithmClass = result.algorithmClass;
  if (result?.isExecutable === false) b.isExecutable = false;
  const net = num(result?.netUsdt);
  const actual = num(result?.actualNetUsdt, actualNetUsdt);
  const delta = num(result?.deltaVsActualUsdt, net - actual);
  b.samples += 1; b.netUsdt += net; b.actualNetUsdt += actual; b.deltaUsdt += delta;
  if (net > 0.000001) { b.profitableTrades += 1; b.grossProfitUsdt += net; }
  else if (net < -0.000001) { b.losingTrades += 1; b.grossLossUsdt += Math.abs(net); }
  if (delta > 0.000001) b.winsVsActual += 1;
  else if (delta < -0.000001) b.lossesVsActual += 1;
}
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || !raw.input || !Array.isArray(raw.results)) return null;
  const input = raw.input;
  const id = String(input.tradeId || `${input.symbol || 'SYM'}-${input.side || 'SIDE'}-${raw.zaman || ''}`);
  const actual = raw.results.find(r => r?.algorithmId === 'ACTUAL');
  const actualNet = num(actual?.netUsdt, input.actualNetUsdt);
  const signature = String(input.signatureShort || input.signatureKey || 'SIGNATURE_YOK');
  const executable = raw.results.filter(r => r && r.algorithmId !== 'ACTUAL' && r.isExecutable !== false);
  const best = executable.sort((a, b) => num(b.netUsdt) - num(a.netUsdt))[0] || actual || null;
  return { id, raw, input, actual, actualNet, signature, best };
}
function rebuild(records) {
  const o = emptySummary();
  for (const row of records) {
    const { raw, input, actualNet, signature, best } = row;
    o.totalTrades += 1;
    o.lastUpdate = raw.zaman || o.lastUpdate;
    if (!o.bySignature[signature]) o.bySignature[signature] = { key: signature, label: input.signatureLabel || signature, samples: 0, algorithms: {} };
    for (const r of raw.results) {
      if (!r || !r.algorithmId) continue;
      addBucket(o.byAlgorithm, r.algorithmId, r.algorithmLabel || r.algorithmId, r, actualNet);
      addBucket(o.bySignature[signature].algorithms, r.algorithmId, r.algorithmLabel || r.algorithmId, r, actualNet);
      if (r.algorithmId === 'ACTUAL') o.bySignature[signature].samples += 1;
    }
    o.actualTotalNetUsdt += actualNet;
    const bestNet = num(best?.netUsdt, actualNet);
    o.oracleBestTotalNetUsdt += bestNet;
    o.oraclePotentialDeltaUsdt += Math.max(0, bestNet - actualNet);
    o.last10.unshift({ tradeId: input.tradeId || row.id, symbol: input.symbol || '', side: input.side || '', signature, actualNetUsdt: actualNet, best, pathPoints: num(input.pathCoverage), zaman: raw.zaman || null });
    o.last10 = o.last10.slice(0, 10);
  }
  o.migration = { at: new Date().toISOString(), source: 'exit-replay-results.jsonl', uniqueTrades: records.length, policy: 'Trade ID bazında tekilleştirilmiş tarihsel yeniden oluşturma' };
  return o;
}
function bucketModel(b) {
  const n = num(b?.samples), compared = num(b?.winsVsActual) + num(b?.lossesVsActual), decided = num(b?.profitableTrades) + num(b?.losingTrades), loss = num(b?.grossLossUsdt);
  return { ...b, netUsdt: round(b?.netUsdt, 4), actualNetUsdt: round(b?.actualNetUsdt, 4), deltaUsdt: round(b?.deltaUsdt, 4), avgNetUsdt: n ? round(num(b.netUsdt) / n, 4) : 0, avgDeltaUsdt: n ? round(num(b.deltaUsdt) / n, 4) : 0, beatRate: compared ? round((num(b.winsVsActual) / compared) * 100, 1) : 0, winRate: decided ? round((num(b.profitableTrades) / decided) * 100, 1) : 0, profitFactor: loss > 0 ? round(num(b?.grossProfitUsdt) / loss, 2) : (num(b?.grossProfitUsdt) > 0 ? 999 : 0) };
}
function isOracleModel(x) {
  return x?.isExecutable === false || x?.algorithmClass === 'ORACLE_BENCHMARK' || String(x?.key || '').startsWith('MFE_CAPTURE_');
}
function buildModel(o) {
  const allAlgorithms = Object.values(o.byAlgorithm).map(bucketModel);
  const algorithmRanking = allAlgorithms.filter(x => x.key !== 'ACTUAL' && !isOracleModel(x)).sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
  const oracleRanking = allAlgorithms.filter(isOracleModel).sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
  const dna = Object.values(o.bySignature).map(s => {
    const all = Object.values(s.algorithms || {}).map(bucketModel).filter(x => x.key !== 'ACTUAL');
    const ranking = all.filter(x => !isOracleModel(x)).sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
    const oracle = all.filter(isOracleModel).sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
    return { key: s.key, label: s.label, samples: s.samples, confidence: s.samples >= 3 ? 'GELISEN' : 'YETERSIZ_ORNEK', bestExit: ranking[0] || null, ranking, oracleBestBenchmark: oracle[0] || null, oracleRanking: oracle };
  }).sort((a, b) => b.samples - a.samples);
  const systemComparison = { actualNetUsdt: round(o.actualTotalNetUsdt, 4), executableBestNetUsdt: round(o.oracleBestTotalNetUsdt, 4), executablePotentialDeltaUsdt: round(o.oraclePotentialDeltaUsdt, 4), improvementPct: o.actualTotalNetUsdt !== 0 ? round((o.oraclePotentialDeltaUsdt / Math.abs(o.actualTotalNetUsdt)) * 100, 1) : 0 };
  return { version: VERSION, createdAt: new Date().toISOString(), dataPolicy: 'Uygulanabilir exit modelleri ile geleceği bilen oracle benchmarkları ayrı sıralanır.', totalTrades: o.totalTrades, systemComparison, algorithmRanking, oracleRanking, dna, missedOpportunityDna: dna.filter(x => x.bestExit).sort((a, b) => num(b.bestExit.deltaUsdt) - num(a.bestExit.deltaUsdt)).slice(0, 10), timeBehavior: [], last10: o.last10, migration: o.migration, pendingModels: ['ATR_TRAILING','TREND_EXIT','DYNAMIC_EXIT','HYBRID_EXIT','ALTERNATIVE_LADDER'] };
}
function main() {
  if (!fs.existsSync(JSONL)) throw new Error(`Kaynak bulunamadı: ${JSONL}`);
  const parsed = [];
  const bad = [];
  fs.readFileSync(JSONL, 'utf8').split(/\r?\n/).filter(Boolean).forEach((line, i) => {
    try { const n = normalizeRecord(JSON.parse(line)); if (n) parsed.push(n); else bad.push(i + 1); }
    catch { bad.push(i + 1); }
  });
  const unique = new Map();
  for (const row of parsed) unique.set(row.id, row); // Aynı trade tekrarlandıysa son kayıt kazanır.
  const records = [...unique.values()].sort((a, b) => String(a.raw.zaman || '').localeCompare(String(b.raw.zaman || '')));
  if (!records.length) throw new Error('Geçerli replay kaydı bulunamadı.');
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  const suffix = stamp();
  const stateBackup = backup(STATE, suffix);
  const modelBackup = backup(MODEL, suffix);
  const summary = rebuild(records);
  state.exitReplayOzet = summary;
  state.kayitZamani = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  fs.writeFileSync(MODEL, JSON.stringify(buildModel(summary), null, 2));
  console.log('✅ EXIT REPLAY MIGRATION TAMAMLANDI');
  console.log(`Kaynak satır: ${parsed.length + bad.length}`);
  console.log(`Geçerli satır: ${parsed.length}`);
  console.log(`Tekil işlem: ${records.length}`);
  console.log(`DNA sayısı: ${Object.keys(summary.bySignature).length}`);
  console.log(`Bozuk/atlanmış satır: ${bad.length}`);
  console.log(`State yedeği: ${stateBackup || 'yok'}`);
  console.log(`Model yedeği: ${modelBackup || 'yok'}`);
  console.log(`Yeni model: ${MODEL}`);
}

try { main(); } catch (err) { console.error(`❌ MIGRATION BAŞARISIZ: ${err.message}`); process.exitCode = 1; }
