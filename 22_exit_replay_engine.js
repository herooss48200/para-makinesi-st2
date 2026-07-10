/**
 * AGROS v3.6.3 - EXIT EVOLUTION LAB / TIME PATH FOUNDATION
 *
 * Güvenlik ilkesi:
 * - Trade Engine'e ve gerçek kapanış kararına dokunmaz.
 * - Yalnızca kapanmış işlemleri, işlem sırasında kaydedilen fiyat yolu üzerinden yeniden oynatır.
 * - Tam veri olmayan modeller açıkça benchmark/uygunsuz olarak işaretlenir.
 */

const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const dnaProfitPotential = require('./25_dna_profit_potential_engine.js');

const VERSION = 'v3.6.6-DNA-PROFIT-POTENTIAL';
const DATA_DIR = path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'exit-replay-results.jsonl');
const CSV = path.join(DATA_DIR, 'exit-replay-results.csv');
const MODEL_JSON = path.join(DATA_DIR, 'exit-replay-model.json');

const CSV_COLUMNS = [
  'tradeId','zaman','symbol','yon','signatureShort','algorithmId','algorithmLabel','algorithmClass',
  'isExecutable','exitSource','exitMinute','grossPct','netPct','netUsdt','commissionUsdt','deltaVsActualUsdt',
  'deltaVsActualPct','mfePct','maePct','reached','confidenceNote'
];

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function round(v, digits = 6) { return Number(num(v).toFixed(digits)); }
function htmlSafe(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function csvSafe(v) { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, CSV_COLUMNS.join(';') + '\n');
}
function tradeId(pos) { return String(pos?.tradeId || pos?.sanalOrderId || pos?.id || `${pos?.sym || 'SYM'}-${pos?.yon || 'YON'}-${pos?.acilisZamani || pos?.zaman || Date.now()}`); }
function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return { short: sig.shortKey || pos?.execution?.signatureShort || '', key: sig.key || pos?.execution?.signatureKey || '', label: sig.label || pos?.execution?.signatureLabel || '' };
}
function positionValue(pos, sonuc) {
  const direct = num(sonuc?.pozisyonDegeri || pos?.pozisyonDegeri || pos?.positionValue || pos?.notional);
  if (direct > 0) return direct;
  const qty = num(pos?.miktar || pos?.quantity || pos?.qty), entry = num(pos?.girisFiyati || pos?.entryPrice);
  if (qty > 0 && entry > 0) return qty * entry;
  const actualNet = num(sonuc?.netKarZarar), actualNetPct = num(sonuc?.netPozisyonYuzdesi), fee = num(sonuc?.komisyon);
  return actualNetPct && actualNet + fee !== 0 ? Math.abs(((actualNet + fee) * 100) / actualNetPct) : 0;
}
function normalizePath(pos, closeTs, actualGrossPct) {
  const startTs = num(pos?.acilisZamani || pos?.zaman || pos?.execution?.baslangicZamani, closeTs);
  const raw = Array.isArray(pos?.execution?.pricePath) ? pos.execution.pricePath : [];
  const pathRows = raw.map(x => ({ ts: num(x?.ts), price: num(x?.price), pnlPct: num(x?.pnlPct) }))
    .filter(x => x.ts > 0 && Number.isFinite(x.pnlPct)).sort((a, b) => a.ts - b.ts);
  if (!pathRows.length || pathRows[0].ts > startTs) pathRows.unshift({ ts: startTs, price: num(pos?.girisFiyati), pnlPct: 0 });
  if (!pathRows.length || pathRows[pathRows.length - 1].ts < closeTs) pathRows.push({ ts: closeTs, price: 0, pnlPct: actualGrossPct });
  return pathRows;
}
function normalizeInput(pos, sonuc = {}) {
  const ex = pos?.execution || {}, journey = pos?.journey || {};
  const actualGrossPct = num(sonuc?.fiyatKarYuzdesi), actualNetPct = num(sonuc?.netPozisyonYuzdesi, actualGrossPct);
  const actualNetUsdt = num(sonuc?.netKarZarar), commissionUsdt = Math.max(0, num(sonuc?.komisyon));
  const valueUsdt = positionValue(pos, sonuc), mfePct = Math.max(0, num(ex.mfeYuzde, num(journey.mfeYuzde)));
  const maePct = Math.min(0, num(ex.maeYuzde, num(journey.maeYuzde))), closeTs = Date.now();
  const sig = signature(pos), pathRows = normalizePath(pos, closeTs, actualGrossPct);
  return {
    tradeId: tradeId(pos), symbol: pos?.sym || '', side: String(pos?.yon || '').toUpperCase(),
    signatureShort: sig.short, signatureKey: sig.key, signatureLabel: sig.label,
    actualGrossPct, actualNetPct, actualNetUsdt, commissionUsdt, valueUsdt, mfePct, maePct,
    closeReason: sonuc?.kapanisSebebi || '', result: String(sonuc?.sonuc || '').toUpperCase(),
    startTs: pathRows[0]?.ts || closeTs, closeTs, durationMs: Math.max(0, closeTs - (pathRows[0]?.ts || closeTs)),
    pathRows, pathCoverage: pathRows.length
  };
}
function scenarioResult(input, algo, grossPct, meta = {}) {
  const commission = input.commissionUsdt;
  const netUsdt = input.valueUsdt > 0 ? ((grossPct / 100) * input.valueUsdt) - commission : input.actualNetUsdt;
  const netPct = input.valueUsdt > 0 ? (netUsdt / input.valueUsdt) * 100 : input.actualNetPct;
  return {
    algorithmId: algo.id, algorithmLabel: algo.label, algorithmClass: algo.className,
    isExecutable: algo.isExecutable, exitSource: meta.exitSource || 'REPLAY', exitMinute: meta.exitMinute ?? '',
    grossPct: round(grossPct, 4), netPct: round(netPct, 4), netUsdt: round(netUsdt, 6), commissionUsdt: round(commission, 6),
    deltaVsActualUsdt: round(netUsdt - input.actualNetUsdt, 6), deltaVsActualPct: round(netPct - input.actualNetPct, 4),
    mfePct: round(input.mfePct, 4), maePct: round(input.maePct, 4), reached: meta.reached !== false,
    confidenceNote: meta.confidenceNote || ''
  };
}
function pointAtMinute(input, minute) {
  const target = input.startTs + minute * 60000;
  if (target > input.closeTs) return null;
  return input.pathRows.find(x => x.ts >= target) || input.pathRows[input.pathRows.length - 1] || null;
}
function mfeProtectionExit(input, ratio) {
  let peak = 0;
  for (const p of input.pathRows) {
    peak = Math.max(peak, num(p.pnlPct));
    if (peak > 0 && num(p.pnlPct) <= peak * ratio) return { grossPct: num(p.pnlPct), point: p, peak };
  }
  return null;
}
function algorithms() {
  const fixedLevels = Array.isArray(ayarlar.exitReplayFixedTpLevels) ? ayarlar.exitReplayFixedTpLevels.map(Number).filter(x => x > 0) : [0.4,0.6,0.8,1,1.5];
  const captureLevels = Array.isArray(ayarlar.exitReplayMfeCaptureLevels) ? ayarlar.exitReplayMfeCaptureLevels.map(Number).filter(x => x > 0 && x <= 1) : [0.5,0.6,0.7,0.8,0.9];
  const timeMinutes = Array.isArray(ayarlar.exitReplayTimeMinutes) ? ayarlar.exitReplayTimeMinutes.map(Number).filter(x => x > 0) : [5,10,15,20,30,45,60,90,120];
  const list = [];
  for (const level of fixedLevels) list.push({
    id: `FIXED_TP_${String(level).replace('.', '_')}`, label: `Sabit TP %${level}`, className: 'FIXED_TP', isExecutable: true,
    run(input) { const reached = input.mfePct >= level; return scenarioResult(input, this, reached ? level : input.actualGrossPct, { reached, exitSource: reached ? 'MFE_TARGET_REACHED' : 'ACTUAL_FALLBACK', confidenceNote: reached ? 'Hedef erişimi MFE ile doğrulandı.' : 'Hedefe erişilmedi; gerçek kapanış korundu.' }); }
  });
  for (const minute of timeMinutes) list.push({
    id: `TIME_${minute}M`, label: `${minute} Dakika Exit`, className: 'TIME_EXIT', isExecutable: true,
    run(input) { const p = pointAtMinute(input, minute); return scenarioResult(input, this, p ? p.pnlPct : input.actualGrossPct, { reached: !!p, exitMinute: minute, exitSource: p ? 'RECORDED_TIME_PATH' : 'ACTUAL_FALLBACK', confidenceNote: p ? `Kaydedilmiş fiyat yolunda ${minute}. dakika örneği kullanıldı.` : 'İşlem bu süreye ulaşmadı; gerçek kapanış korundu.' }); }
  });
  for (const ratio of captureLevels) list.push({
    id: `MFE_PROTECT_${Math.round(ratio * 100)}`, label: `MFE Koruma %${Math.round(ratio * 100)}`, className: 'MFE_PROTECTION', isExecutable: true,
    run(input) { const hit = mfeProtectionExit(input, ratio); return scenarioResult(input, this, hit ? hit.grossPct : input.actualGrossPct, { reached: !!hit, exitSource: hit ? 'RECORDED_DRAWDOWN_TRIGGER' : 'ACTUAL_FALLBACK', confidenceNote: hit ? 'Kaydedilmiş fiyat yolunda tepe kâr geri çekilme tetikledi.' : 'Koruma tetiklenmedi; gerçek kapanış korundu.' }); }
  });
  return list;
}
function ozetEnsure() {
  h.state.exitReplayOzet = h.state.exitReplayOzet || { version: VERSION, totalTrades: 0, lastUpdate: null, byAlgorithm: {}, bySignature: {}, timeBehavior: {}, last10: [], actualTotalNetUsdt: 0, oracleBestTotalNetUsdt: 0, oraclePotentialDeltaUsdt: 0 };
  for (const key of ['actualTotalNetUsdt','oracleBestTotalNetUsdt','oraclePotentialDeltaUsdt']) oNumEnsure(h.state.exitReplayOzet, key);
  h.state.exitReplayOzet.version = VERSION;
  for (const key of ['byAlgorithm','bySignature','timeBehavior']) if (!h.state.exitReplayOzet[key] || typeof h.state.exitReplayOzet[key] !== 'object') h.state.exitReplayOzet[key] = {};
  h.state.exitReplayOzet.dnaProfitPotential = dnaProfitPotential.ensureStore(h.state.exitReplayOzet.dnaProfitPotential);
  if (!Array.isArray(h.state.exitReplayOzet.last10)) h.state.exitReplayOzet.last10 = [];
  return h.state.exitReplayOzet;
}
function oNumEnsure(obj, key) { if (!Number.isFinite(Number(obj[key]))) obj[key] = 0; }
function bucketAdd(map, key, label, result) {
  if (!map[key]) map[key] = { key, label, algorithmClass: result.algorithmClass || '', isExecutable: result.isExecutable !== false, samples: 0, netUsdt: 0, actualNetUsdt: 0, deltaUsdt: 0, winsVsActual: 0, lossesVsActual: 0, profitableTrades: 0, losingTrades: 0, grossProfitUsdt: 0, grossLossUsdt: 0 };
  const b = map[key];
  if (!b.algorithmClass && result.algorithmClass) b.algorithmClass = result.algorithmClass;
  if (result.isExecutable === false) b.isExecutable = false;
  for (const k of ['samples','netUsdt','actualNetUsdt','deltaUsdt','winsVsActual','lossesVsActual','profitableTrades','losingTrades','grossProfitUsdt','grossLossUsdt']) oNumEnsure(b, k);
  const net = num(result.netUsdt);
  b.samples++; b.netUsdt += net; b.actualNetUsdt += num(result.actualNetUsdt); b.deltaUsdt += num(result.deltaVsActualUsdt);
  if (net > 0.000001) { b.profitableTrades++; b.grossProfitUsdt += net; }
  else if (net < -0.000001) { b.losingTrades++; b.grossLossUsdt += Math.abs(net); }
  if (result.deltaVsActualUsdt > 0.000001) b.winsVsActual++; else if (result.deltaVsActualUsdt < -0.000001) b.lossesVsActual++;
}
function timeBehaviorAdd(o, input) {
  const sig = input.signatureShort || input.signatureKey || 'SIGNATURE_YOK';
  if (!o.timeBehavior[sig]) o.timeBehavior[sig] = { key: sig, label: input.signatureLabel || sig, checkpoints: {} };
  const minutes = Array.isArray(ayarlar.exitReplayTimeMinutes) ? ayarlar.exitReplayTimeMinutes : [5,10,15,20,30,45,60,90,120];
  for (const minute of minutes) {
    const p = pointAtMinute(input, Number(minute)); if (!p) continue;
    const upto = input.pathRows.filter(x => x.ts <= p.ts), mfe = Math.max(0, ...upto.map(x => num(x.pnlPct))), mae = Math.min(0, ...upto.map(x => num(x.pnlPct)));
    const giveback = Math.max(0, mfe - num(p.pnlPct));
    const k = String(minute), b = o.timeBehavior[sig].checkpoints[k] || { minute: Number(minute), samples: 0, netPctSum: 0, mfeSum: 0, maeSum: 0, givebackSum: 0 };
    b.samples++; b.netPctSum += num(p.pnlPct); b.mfeSum += mfe; b.maeSum += mae; b.givebackSum += giveback; o.timeBehavior[sig].checkpoints[k] = b;
  }
}
function replayTrade(pos, sonuc = {}) {
  if (ayarlar.exitReplayAktif === false) return null;
  try {
    ensureDataDir(); const input = normalizeInput(pos, sonuc), zaman = new Date().toISOString();
    const actual = { algorithmId:'ACTUAL', algorithmLabel:'Gerçek Çıkış', algorithmClass:'BASELINE', isExecutable:true, exitSource:'ACTUAL_CLOSE', exitMinute:'', grossPct:round(input.actualGrossPct,4), netPct:round(input.actualNetPct,4), netUsdt:round(input.actualNetUsdt,6), commissionUsdt:round(input.commissionUsdt,6), deltaVsActualUsdt:0, deltaVsActualPct:0, mfePct:round(input.mfePct,4), maePct:round(input.maePct,4), reached:true, confidenceNote:'Gerçek muhasebe sonucu.' };
    const results = [actual, ...algorithms().map(a => a.run(input))];
    const record = { version: VERSION, zaman, input, results: results.map(r => ({ ...r, actualNetUsdt: input.actualNetUsdt })) };
    fs.appendFileSync(JSONL, JSON.stringify(record) + '\n');
    for (const r of results) { const row = { tradeId:input.tradeId,zaman,symbol:input.symbol,yon:input.side,signatureShort:input.signatureShort,...r }; fs.appendFileSync(CSV, CSV_COLUMNS.map(c => csvSafe(row[c])).join(';') + '\n'); }
    const o = ozetEnsure(); o.totalTrades++; o.lastUpdate = zaman;
    for (const r of results) {
      const enriched = { ...r, actualNetUsdt:input.actualNetUsdt }; bucketAdd(o.byAlgorithm,r.algorithmId,r.algorithmLabel,enriched);
      const sigKey = input.signatureShort || input.signatureKey || 'SIGNATURE_YOK';
      if (!o.bySignature[sigKey]) o.bySignature[sigKey] = { key:sigKey,label:input.signatureLabel || sigKey,samples:0,algorithms:{} };
      if (r.algorithmId === 'ACTUAL') o.bySignature[sigKey].samples++;
      bucketAdd(o.bySignature[sigKey].algorithms,r.algorithmId,r.algorithmLabel,enriched);
    }
    timeBehaviorAdd(o,input);
    dnaProfitPotential.addTrade(o.dnaProfitPotential, input, ayarlar.dnaProfitTargetLevels);
    const ranked = results.filter(r => r.algorithmId !== 'ACTUAL' && r.isExecutable).sort((a,b) => b.netUsdt-a.netUsdt);
    const best = ranked[0] || actual;
    o.actualTotalNetUsdt += input.actualNetUsdt;
    o.oracleBestTotalNetUsdt += num(best.netUsdt, input.actualNetUsdt);
    o.oraclePotentialDeltaUsdt += Math.max(0, num(best.netUsdt) - input.actualNetUsdt);
    o.last10.unshift({ tradeId:input.tradeId,symbol:input.symbol,side:input.side,signature:input.signatureShort,actualNetUsdt:input.actualNetUsdt,best,pathPoints:input.pathCoverage,zaman }); o.last10=o.last10.slice(0,Math.max(10,num(ayarlar.exitReplayTelegramRaporKapanis,10)));
    fs.writeFileSync(MODEL_JSON, JSON.stringify(buildModel(),null,2)); return record;
  } catch (err) { console.error(`⚠️ [EXIT EVOLUTION] Replay yazılamadı: ${err.message}`); return null; }
}
function bucketModel(b) {
  const n=num(b?.samples), compared=num(b?.winsVsActual)+num(b?.lossesVsActual), decided=num(b?.profitableTrades)+num(b?.losingTrades), loss=num(b?.grossLossUsdt);
  return { ...b, netUsdt:round(b?.netUsdt,4),actualNetUsdt:round(b?.actualNetUsdt,4),deltaUsdt:round(b?.deltaUsdt,4),avgNetUsdt:n?round(num(b.netUsdt)/n,4):0,avgDeltaUsdt:n?round(num(b.deltaUsdt)/n,4):0,beatRate:compared?round((num(b.winsVsActual)/compared)*100,1):0,winRate:decided?round((num(b.profitableTrades)/decided)*100,1):0,profitFactor:loss>0?round(num(b?.grossProfitUsdt)/loss,2):(num(b?.grossProfitUsdt)>0?999:0) };
}
function isOracleModel(x) {
  return x?.isExecutable === false || x?.algorithmClass === 'ORACLE_BENCHMARK' || String(x?.key || '').startsWith('MFE_CAPTURE_');
}
function buildModel() {
  const o=ozetEnsure(), min=num(ayarlar.exitReplayMinOrnek,3);
  const allAlgorithms=Object.values(o.byAlgorithm).map(bucketModel);
  const algorithmRanking=allAlgorithms.filter(x=>x.key!=='ACTUAL' && !isOracleModel(x)).sort((a,b)=>b.deltaUsdt-a.deltaUsdt||b.samples-a.samples);
  const oracleRanking=allAlgorithms.filter(isOracleModel).sort((a,b)=>b.deltaUsdt-a.deltaUsdt||b.samples-a.samples);
  const dna=Object.values(o.bySignature).map(s=>{ const all=Object.values(s.algorithms||{}).map(bucketModel).filter(x=>x.key!=='ACTUAL'); const ranked=all.filter(x=>!isOracleModel(x)).sort((a,b)=>b.deltaUsdt-a.deltaUsdt||b.samples-a.samples); const oracle=all.filter(isOracleModel).sort((a,b)=>b.deltaUsdt-a.deltaUsdt||b.samples-a.samples); return { key:s.key,label:s.label,samples:s.samples,confidence:s.samples>=min?'GELISEN':'YETERSIZ_ORNEK',bestExit:ranked[0]||null,ranking:ranked,oracleBestBenchmark:oracle[0]||null,oracleRanking:oracle }; }).sort((a,b)=>b.samples-a.samples);
  const timeBehavior=Object.values(o.timeBehavior).map(s=>({ key:s.key,label:s.label,checkpoints:Object.values(s.checkpoints||{}).map(b=>({ minute:b.minute,samples:b.samples,avgNetPct:round(b.netPctSum/b.samples,4),avgMfePct:round(b.mfeSum/b.samples,4),avgMaePct:round(b.maeSum/b.samples,4),avgGivebackPct:round(b.givebackSum/b.samples,4) })).sort((a,b)=>a.minute-b.minute) }));
  const systemComparison={ actualNetUsdt:round(o.actualTotalNetUsdt,4), oracleBestNetUsdt:round(o.oracleBestTotalNetUsdt,4), potentialDeltaUsdt:round(o.oraclePotentialDeltaUsdt,4), improvementPct:num(o.actualTotalNetUsdt)!==0?round((o.oraclePotentialDeltaUsdt/Math.abs(o.actualTotalNetUsdt))*100,1):0 };
  const missedOpportunityDna=dna.filter(x=>x.bestExit).sort((a,b)=>num(b.bestExit.deltaUsdt)-num(a.bestExit.deltaUsdt)).slice(0,10);
  const profitPotential=dnaProfitPotential.buildModel(o.dnaProfitPotential,{ minSample:num(ayarlar.dnaProfitMinOrnek,10), safeReachRate:num(ayarlar.dnaProfitSafeReachRate,70), strongReachRate:num(ayarlar.dnaProfitStrongReachRate,80) });
  return { version:VERSION,createdAt:new Date().toISOString(),dataPolicy:'Uygulanabilir exit modelleri ile geleceği bilen oracle benchmarkları kesin olarak ayrı sıralanır. DNA Profit Potential yalnızca kapanmış işlem MFE/MAE verisinden öğrenir.',totalTrades:o.totalTrades,systemComparison,algorithmRanking,oracleRanking,dna,profitPotential,missedOpportunityDna,timeBehavior,last10:o.last10,pendingModels:['ATR_TRAILING','TREND_EXIT','DYNAMIC_EXIT','HYBRID_EXIT','ALTERNATIVE_LADDER'] };
}
function sign(v, digits = 4) {
  const n = num(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}
function dnaProfileForRecord(record) {
  const key = record?.input?.signatureShort || record?.input?.signatureKey || 'SIGNATURE_YOK';
  return buildModel().dna.find(x => x.key === key) || null;
}
function confidenceLabel(profile) {
  if (!profile) return 'VERİ YOK';
  const min = num(ayarlar.exitReplayMinOrnek, 3);
  if (profile.samples < min) return `ERKEN ÖĞRENME (${profile.samples}/${min})`;
  if (profile.samples < 10) return `GELİŞEN (${profile.samples})`;
  if (profile.samples < 30) return `ORTA (${profile.samples})`;
  return `GÜÇLÜ (${profile.samples})`;
}
function kapanisMetni(record) {
  if (!record || ayarlar.exitReplayTelegramAktif === false) return '';
  const actual = record.results.find(x => x.algorithmId === 'ACTUAL');
  const replayResults = record.results
    .filter(x => x.algorithmId !== 'ACTUAL' && x.isExecutable)
    .sort((a, b) => b.netUsdt - a.netUsdt);
  const best = replayResults[0];
  const profile = dnaProfileForRecord(record);
  const dnaBest = profile?.bestExit || null;
  const potential = buildModel().profitPotential?.dna?.find(x => x.key === (record.input.signatureShort || record.input.signatureKey || 'SIGNATURE_YOK')) || null;
  const signature = record.input.signatureShort || record.input.signatureLabel || 'İMZA YOK';
  const actualWon = !best || num(actual?.netUsdt) >= num(best.netUsdt) - 0.000001;

  let text = `\n\n━━━━━━━━━━━━━━━━━━\n🧬 <b>EXIT EVOLUTION LAB v3.6.6</b>\n`;
  text += `🔬 DNA: <b>${htmlSafe(signature)}</b>\n`;
  text += `✅ Gerçek Çıkış: <b>${sign(actual?.netUsdt)} USDT</b>\n`;
  if (best) {
    text += `${actualWon ? '🛡️' : '🏆'} Bu İşlemin En İyi Replay'i: <b>${htmlSafe(best.algorithmLabel)}</b>\n`;
    text += `💰 Replay Net: <b>${sign(best.netUsdt)} USDT</b>\n`;
    text += `📈 Gerçeğe Fark: <b>${sign(best.deltaVsActualUsdt)} USDT</b>\n`;
  }
  if (dnaBest) {
    text += `\n🧠 <b>DNA EXIT PROFİLİ</b>\n`;
    text += `🥇 Birikimli En İyi: <b>${htmlSafe(dnaBest.label)}</b>\n`;
    text += `📦 DNA Örneği: ${profile.samples} | Güven: ${confidenceLabel(profile)}\n`;
    text += `💎 Toplam Avantaj: ${sign(dnaBest.deltaUsdt, 2)} USDT | Gerçeği Geçme: %${num(dnaBest.beatRate).toFixed(1)}\n`;
    text += `📊 Net: ${sign(dnaBest.netUsdt, 2)} USDT | WR: %${num(dnaBest.winRate).toFixed(1)} | PF: ${num(dnaBest.profitFactor).toFixed(2)}\n`;
    if (profile.ranking?.[1]) text += `🥈 İkinci: ${htmlSafe(profile.ranking[1].label)} | Fark ${sign(profile.ranking[1].deltaUsdt, 2)} USDT\n`;
  }
  text += `\n🧭 Fiyat Yolu: ${record.input.pathCoverage} örnek | Süre ${(record.input.durationMs / 60000).toFixed(1)} dk\n`;
  text += `ℹ️ Yalnızca öğrenir; gerçek Trade Engine kararını değiştirmez.`;
  return text;
}
function telegramOzetMetni() {
  const m = buildModel();
  const top = m.algorithmRanking.filter(x => x.key !== 'ACTUAL').slice(0, 5);
  let text = `\n\n🧬 <b>EXIT EVOLUTION LAB v3.6.6</b>\n📦 Replay edilen kapanış: ${m.totalTrades}`;
  if (!top.length) return text + '\nHenüz replay sonucu yok.';
  return text + '\n\n🏆 <b>Genel Exit Sıralaması</b>\n' + top.map((x, i) => `${i + 1}) ${htmlSafe(x.label)} | Örnek ${x.samples} | Fark ${sign(x.deltaUsdt, 2)} USDT | Beat %${x.beatRate.toFixed(1)}`).join('\n');
}
function periyodikRaporGerekli() {
  if (ayarlar.exitReplayTelegramAktif === false) return false;
  const o = ozetEnsure();
  const interval = Math.max(1, num(ayarlar.exitReplayTelegramRaporKapanis, 10));
  const sentAt = num(o.lastTelegramReportTradeCount, 0);
  return o.totalTrades > 0 && o.totalTrades % interval === 0 && sentAt !== o.totalTrades;
}
function periyodikRaporMetni() {
  const m = buildModel();
  const o = ozetEnsure();
  const interval = Math.max(1, num(ayarlar.exitReplayTelegramRaporKapanis, 10));
  const recent = o.last10.slice(0, interval);
  const winners = {};
  let recentActual = 0, recentBest = 0;
  for (const row of recent) {
    recentActual += num(row?.actualNetUsdt);
    recentBest += num(row?.best?.netUsdt, row?.actualNetUsdt);
    if (!row?.best) continue;
    winners[row.best.algorithmLabel] = (winners[row.best.algorithmLabel] || 0) + 1;
  }
  const winnerRanking = Object.entries(winners).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const general = m.algorithmRanking.filter(x => x.key !== 'ACTUAL').slice(0, 7);
  const dnaLeaders = m.dna.filter(x => x.bestExit && x.samples >= num(ayarlar.exitReplayMinOrnek, 3)).sort((a, b) => num(b.bestExit.deltaUsdt) - num(a.bestExit.deltaUsdt)).slice(0, 5);
  const opportunities = m.missedOpportunityDna.filter(x => x.samples >= num(ayarlar.exitReplayMinOrnek, 3)).slice(0, 5);
  const recentDelta = recentBest - recentActual;

  let text = `🧠 <b>EXIT EVOLUTION SKOR TABLOSU v3.6.6</b>\n`;
  text += `📦 Toplam Replay: ${m.totalTrades} | Son Pencere: ${recent.length}\n`;
  text += `\n📈 <b>GERÇEK SİSTEM KARŞILAŞTIRMASI</b>\n`;
  text += `Gerçek Net: <b>${sign(m.systemComparison.actualNetUsdt, 2)} USDT</b>\n`;
  text += `En İyi Replay Toplamı: <b>${sign(m.systemComparison.oracleBestNetUsdt, 2)} USDT</b>\n`;
  text += `💎 Kaçan Potansiyel: <b>${sign(m.systemComparison.potentialDeltaUsdt, 2)} USDT</b>\n`;
  text += `Son ${recent.length}: Gerçek ${sign(recentActual,2)} | En iyi ${sign(recentBest,2)} | Fark ${sign(recentDelta,2)} USDT\n`;
  if (general.length) {
    text += `\n🏆 <b>EXIT EVOLUTION LİGİ</b>\n`;
    text += general.map((x, i) => `${i + 1}) ${htmlSafe(x.label)}\n   Net ${sign(x.netUsdt, 2)} | Fark ${sign(x.deltaUsdt, 2)} | WR %${x.winRate.toFixed(1)} | PF ${x.profitFactor.toFixed(2)} | Beat %${x.beatRate.toFixed(1)}`).join('\n');
  }
  if (winnerRanking.length) {
    text += `\n\n🏁 <b>Son ${recent.length} İşlemde Kazanan Modeller</b>\n`;
    text += winnerRanking.map(([label, count], i) => `${i + 1}) ${htmlSafe(label)} — ${count} kez`).join('\n');
  }
  if (dnaLeaders.length) {
    text += `\n\n🧬 <b>DNA EXIT LİDERLERİ</b>\n`;
    text += dnaLeaders.map((x, i) => `${i + 1}) ${htmlSafe(x.key)} → ${htmlSafe(x.bestExit.label)}\n   ${x.samples} örnek | Net ${sign(x.bestExit.netUsdt,2)} | Fark ${sign(x.bestExit.deltaUsdt,2)} | Güven ${confidenceLabel(x)}`).join('\n');
  }
  if (opportunities.length) {
    text += `\n\n📉 <b>EN ÇOK KÂR KAÇIRILAN DNA'LAR</b>\n`;
    text += opportunities.map((x, i) => `${i + 1}) ${htmlSafe(x.key)} | ${htmlSafe(x.bestExit.label)} | Kaçan ${sign(x.bestExit.deltaUsdt,2)} USDT`).join('\n');
  }
  text += `\n\nℹ️ Öğrenme raporudur; canlı stop/TP kararını değiştirmez.`;
  return text;
}
function periyodikRaporGonderildiIsaretle() {
  const o = ozetEnsure();
  o.lastTelegramReportTradeCount = o.totalTrades;
}
module.exports={ normalizeInput,algorithms,replayTrade,buildModel,kapanisMetni,telegramOzetMetni,periyodikRaporGerekli,periyodikRaporMetni,periyodikRaporGonderildiIsaretle };
