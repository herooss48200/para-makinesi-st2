/**
 * AGROS v3.6.1 - EXIT REPLAY ENGINE FOUNDATION
 *
 * Trade Engine'e dokunmaz. Kapanan işlemi, mevcut yolculuk verilerinden
 * doğrulanabilen sanal çıkış senaryolarıyla yeniden değerlendirir.
 *
 * Veri dürüstlüğü:
 * - Fixed TP senaryoları MFE ile hedefe ulaşılıp ulaşılmadığını doğrular.
 * - MFE Capture senaryoları "oracle benchmark"tır; uygulanabilir emir önerisi değildir.
 * - Tam mum/tick yolu kaydedilmediği için hedefe ulaşmayan senaryolarda gerçek kapanış kullanılır.
 */

const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'exit-replay-results.jsonl');
const CSV = path.join(DATA_DIR, 'exit-replay-results.csv');
const MODEL_JSON = path.join(DATA_DIR, 'exit-replay-model.json');

const CSV_COLUMNS = [
  'tradeId','zaman','symbol','yon','signatureShort','algorithmId','algorithmLabel','algorithmClass',
  'isExecutable','exitSource','grossPct','netPct','netUsdt','commissionUsdt','deltaVsActualUsdt',
  'deltaVsActualPct','mfePct','maePct','reached','confidenceNote'
];

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, digits = 6) {
  return Number(num(v).toFixed(digits));
}

function htmlSafe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function csvSafe(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, CSV_COLUMNS.join(';') + '\n');
}

function tradeId(pos) {
  return String(pos?.tradeId || pos?.sanalOrderId || pos?.id || `${pos?.sym || 'SYM'}-${pos?.yon || 'YON'}-${pos?.acilisZamani || pos?.zaman || Date.now()}`);
}

function signature(pos) {
  const sig = pos?.blackboxAcilis?.strategySignature || {};
  return {
    short: sig.shortKey || pos?.execution?.signatureShort || '',
    key: sig.key || pos?.execution?.signatureKey || '',
    label: sig.label || pos?.execution?.signatureLabel || ''
  };
}

function positionValue(pos, sonuc) {
  const direct = num(sonuc?.pozisyonDegeri || pos?.pozisyonDegeri || pos?.positionValue || pos?.notional);
  if (direct > 0) return direct;
  const qty = num(pos?.miktar || pos?.quantity || pos?.qty);
  const entry = num(pos?.girisFiyati || pos?.entryPrice);
  if (qty > 0 && entry > 0) return qty * entry;
  const actualNet = num(sonuc?.netKarZarar);
  const actualNetPct = num(sonuc?.netPozisyonYuzdesi);
  const fee = num(sonuc?.komisyon);
  if (actualNetPct && actualNet + fee !== 0) return Math.abs(((actualNet + fee) * 100) / actualNetPct);
  return 0;
}

function normalizeInput(pos, sonuc = {}) {
  const ex = pos?.execution || {};
  const journey = pos?.journey || {};
  const actualGrossPct = num(sonuc?.fiyatKarYuzdesi);
  const actualNetPct = num(sonuc?.netPozisyonYuzdesi, actualGrossPct);
  const actualNetUsdt = num(sonuc?.netKarZarar);
  const commissionUsdt = Math.max(0, num(sonuc?.komisyon));
  const valueUsdt = positionValue(pos, sonuc);
  const mfePct = Math.max(0, num(ex.mfeYuzde, num(journey.mfeYuzde)));
  const maePct = Math.min(0, num(ex.maeYuzde, num(journey.maeYuzde)));
  const stops = Array.isArray(ex.stopHistory) ? ex.stopHistory : [];
  const ladders = Array.isArray(ex.kademeHistory) ? ex.kademeHistory : [];
  const maxProtectedPct = stops.reduce((m, x) => Math.max(m, num(x?.korunanKarYuzdesi)), 0);
  const sig = signature(pos);
  return {
    tradeId: tradeId(pos),
    symbol: pos?.sym || '',
    side: String(pos?.yon || '').toUpperCase(),
    signatureShort: sig.short,
    signatureKey: sig.key,
    signatureLabel: sig.label,
    actualGrossPct,
    actualNetPct,
    actualNetUsdt,
    commissionUsdt,
    valueUsdt,
    mfePct,
    maePct,
    maxProtectedPct,
    maxLadder: num(ex.maxKademe, num(pos?.tpKademe)),
    stopHistoryCount: stops.length,
    ladderHistoryCount: ladders.length,
    closeReason: sonuc?.kapanisSebebi || '',
    result: String(sonuc?.sonuc || '').toUpperCase()
  };
}

function scenarioResult(input, algo, grossPct, meta = {}) {
  const commission = input.commissionUsdt;
  const netUsdt = input.valueUsdt > 0
    ? ((grossPct / 100) * input.valueUsdt) - commission
    : input.actualNetUsdt + ((grossPct - input.actualGrossPct) / 100) * (input.valueUsdt || 0);
  const netPct = input.valueUsdt > 0 ? (netUsdt / input.valueUsdt) * 100 : input.actualNetPct;
  return {
    algorithmId: algo.id,
    algorithmLabel: algo.label,
    algorithmClass: algo.className,
    isExecutable: algo.isExecutable,
    exitSource: meta.exitSource || 'REPLAY',
    grossPct: round(grossPct, 4),
    netPct: round(netPct, 4),
    netUsdt: round(netUsdt, 6),
    commissionUsdt: round(commission, 6),
    deltaVsActualUsdt: round(netUsdt - input.actualNetUsdt, 6),
    deltaVsActualPct: round(netPct - input.actualNetPct, 4),
    mfePct: round(input.mfePct, 4),
    maePct: round(input.maePct, 4),
    reached: meta.reached !== false,
    confidenceNote: meta.confidenceNote || ''
  };
}

function algorithms() {
  const fixedLevels = Array.isArray(ayarlar.exitReplayFixedTpLevels)
    ? ayarlar.exitReplayFixedTpLevels.map(Number).filter(x => x > 0)
    : [0.4, 0.8, 1.2, 2, 3, 5];
  const captureLevels = Array.isArray(ayarlar.exitReplayMfeCaptureLevels)
    ? ayarlar.exitReplayMfeCaptureLevels.map(Number).filter(x => x > 0 && x <= 1)
    : [0.5, 0.65, 0.8, 0.9];

  const list = [{
    id: 'ACTUAL', label: 'Gerçek Çıkış', className: 'BASELINE', isExecutable: true,
    run: input => scenarioResult(input, this, input.actualGrossPct)
  }];

  for (const level of fixedLevels) {
    list.push({
      id: `FIXED_TP_${String(level).replace('.', '_')}`,
      label: `Fixed TP %${level}`,
      className: 'FIXED_TP',
      isExecutable: true,
      run(input) {
        const reached = input.mfePct >= level;
        return scenarioResult(input, this, reached ? level : input.actualGrossPct, {
          reached,
          exitSource: reached ? 'MFE_TARGET_REACHED' : 'ACTUAL_FALLBACK',
          confidenceNote: reached ? 'Hedefe ulaşıldığı MFE ile doğrulandı.' : 'Hedefe ulaşılmadı; tam fiyat yolu olmadığı için gerçek kapanış korundu.'
        });
      }
    });
  }

  for (const ratio of captureLevels) {
    list.push({
      id: `MFE_CAPTURE_${Math.round(ratio * 100)}`,
      label: `MFE %${Math.round(ratio * 100)} Yakalama`,
      className: 'ORACLE_BENCHMARK',
      isExecutable: false,
      run(input) {
        return scenarioResult(input, this, input.mfePct * ratio, {
          reached: input.mfePct > 0,
          exitSource: 'ORACLE_MFE_BENCHMARK',
          confidenceNote: 'Üst sınır benchmarkıdır; tek başına canlı emir kuralı değildir.'
        });
      }
    });
  }

  list.push({
    id: 'BEST_RECORDED_PROFIT_FLOOR',
    label: 'Kaydedilmiş En İyi Kâr Koruması',
    className: 'RECORDED_STOP_PATH',
    isExecutable: true,
    run(input) {
      const usable = input.maxProtectedPct > 0;
      const gross = usable ? Math.max(input.actualGrossPct, input.maxProtectedPct) : input.actualGrossPct;
      return scenarioResult(input, this, gross, {
        reached: usable,
        exitSource: usable ? 'STOP_HISTORY_PROTECTED_FLOOR' : 'ACTUAL_FALLBACK',
        confidenceNote: usable ? 'Stop geçmişindeki en yüksek korunan kâr kullanıldı.' : 'Korunan kâr geçmişi yok; gerçek kapanış korundu.'
      });
    }
  });

  return list;
}

function ozetEnsure() {
  h.state.exitReplayOzet = h.state.exitReplayOzet || {
    version: 'v3.6.1-EXIT-REPLAY-FOUNDATION',
    totalTrades: 0,
    lastUpdate: null,
    byAlgorithm: {},
    bySignature: {},
    last10: []
  };
  for (const key of ['byAlgorithm', 'bySignature']) {
    if (!h.state.exitReplayOzet[key] || typeof h.state.exitReplayOzet[key] !== 'object') h.state.exitReplayOzet[key] = {};
  }
  if (!Array.isArray(h.state.exitReplayOzet.last10)) h.state.exitReplayOzet.last10 = [];
  return h.state.exitReplayOzet;
}

function bucketAdd(map, key, label, result) {
  if (!map[key]) map[key] = { key, label, samples: 0, netUsdt: 0, actualNetUsdt: 0, deltaUsdt: 0, winsVsActual: 0, lossesVsActual: 0 };
  const b = map[key];
  b.samples += 1;
  b.netUsdt += num(result.netUsdt);
  b.actualNetUsdt += num(result.actualNetUsdt);
  b.deltaUsdt += num(result.deltaVsActualUsdt);
  if (result.deltaVsActualUsdt > 0.000001) b.winsVsActual += 1;
  else if (result.deltaVsActualUsdt < -0.000001) b.lossesVsActual += 1;
}

function replayTrade(pos, sonuc = {}) {
  if (ayarlar.exitReplayAktif === false) return null;
  try {
    ensureDataDir();
    const input = normalizeInput(pos, sonuc);
    const zaman = new Date().toISOString();
    const results = algorithms().map(algo => {
      if (algo.id === 'ACTUAL') {
        return {
          algorithmId: 'ACTUAL', algorithmLabel: 'Gerçek Çıkış', algorithmClass: 'BASELINE', isExecutable: true,
          exitSource: 'ACTUAL_CLOSE', grossPct: round(input.actualGrossPct, 4), netPct: round(input.actualNetPct, 4),
          netUsdt: round(input.actualNetUsdt, 6), commissionUsdt: round(input.commissionUsdt, 6),
          deltaVsActualUsdt: 0, deltaVsActualPct: 0, mfePct: round(input.mfePct, 4), maePct: round(input.maePct, 4),
          reached: true, confidenceNote: 'Gerçek muhasebe sonucu.'
        };
      }
      return algo.run(input);
    });

    const record = {
      version: 'v3.6.1-EXIT-REPLAY-FOUNDATION', zaman, input,
      results: results.map(r => ({ ...r, actualNetUsdt: input.actualNetUsdt }))
    };
    fs.appendFileSync(JSONL, JSON.stringify(record) + '\n');
    for (const r of results) {
      const row = { tradeId: input.tradeId, zaman, symbol: input.symbol, yon: input.side, signatureShort: input.signatureShort, ...r };
      fs.appendFileSync(CSV, CSV_COLUMNS.map(c => csvSafe(row[c])).join(';') + '\n');
    }

    const o = ozetEnsure();
    o.totalTrades += 1;
    o.lastUpdate = zaman;
    for (const r of results) {
      const enriched = { ...r, actualNetUsdt: input.actualNetUsdt };
      bucketAdd(o.byAlgorithm, r.algorithmId, r.algorithmLabel, enriched);
      const sigKey = input.signatureShort || input.signatureKey || 'SIGNATURE_YOK';
      if (!o.bySignature[sigKey]) o.bySignature[sigKey] = { key: sigKey, label: input.signatureLabel || sigKey, samples: 0, algorithms: {} };
      if (r.algorithmId === 'ACTUAL') o.bySignature[sigKey].samples += 1;
      bucketAdd(o.bySignature[sigKey].algorithms, r.algorithmId, r.algorithmLabel, enriched);
    }
    const ranked = results.filter(r => r.algorithmId !== 'ACTUAL').sort((a, b) => b.netUsdt - a.netUsdt);
    o.last10.unshift({ tradeId: input.tradeId, symbol: input.symbol, side: input.side, signature: input.signatureShort, actualNetUsdt: input.actualNetUsdt, best: ranked[0] || null, zaman });
    o.last10 = o.last10.slice(0, 10);
    fs.writeFileSync(MODEL_JSON, JSON.stringify(buildModel(), null, 2));
    return record;
  } catch (err) {
    console.error(`⚠️ [EXIT REPLAY] Replay yazılamadı: ${err.message}`);
    return null;
  }
}

function bucketModel(b) {
  const n = num(b?.samples);
  return {
    ...b,
    netUsdt: round(b?.netUsdt, 4), actualNetUsdt: round(b?.actualNetUsdt, 4), deltaUsdt: round(b?.deltaUsdt, 4),
    avgNetUsdt: n ? round(num(b.netUsdt) / n, 4) : 0,
    avgDeltaUsdt: n ? round(num(b.deltaUsdt) / n, 4) : 0,
    beatRate: (num(b?.winsVsActual) + num(b?.lossesVsActual)) ? round((num(b.winsVsActual) / (num(b.winsVsActual) + num(b.lossesVsActual))) * 100, 1) : 0
  };
}

function buildModel() {
  const o = ozetEnsure();
  const min = num(ayarlar.exitReplayMinOrnek, 3);
  const algorithmRanking = Object.values(o.byAlgorithm).map(bucketModel)
    .sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
  const dna = Object.values(o.bySignature).map(s => {
    const ranked = Object.values(s.algorithms || {}).map(bucketModel)
      .filter(x => x.key !== 'ACTUAL')
      .sort((a, b) => b.deltaUsdt - a.deltaUsdt || b.samples - a.samples);
    return { key: s.key, label: s.label, samples: s.samples, confidence: s.samples >= min ? 'GELISEN' : 'YETERSIZ_ORNEK', bestExit: ranked[0] || null, ranking: ranked };
  }).sort((a, b) => b.samples - a.samples);
  return {
    version: 'v3.6.1-EXIT-REPLAY-FOUNDATION', createdAt: new Date().toISOString(),
    dataPolicy: 'Tam fiyat yolu yoksa yalnızca MFE ile erişimi doğrulanan hedefler hesaplanır; oracle sonuçları açıkça benchmark olarak işaretlenir.',
    totalTrades: o.totalTrades, algorithmRanking, dna, last10: o.last10
  };
}

function kapanisMetni(record) {
  if (!record || ayarlar.exitReplayTelegramAktif === false) return '';
  const actual = record.results.find(x => x.algorithmId === 'ACTUAL');
  const executable = record.results.filter(x => x.algorithmId !== 'ACTUAL' && x.isExecutable).sort((a, b) => b.netUsdt - a.netUsdt);
  const benchmarks = record.results.filter(x => !x.isExecutable).sort((a, b) => b.netUsdt - a.netUsdt);
  const best = executable[0];
  const oracle = benchmarks[0];
  return `\n\n━━━━━━━━━━━━━━━━━━\n` +
    `🧬 <b>EXIT REPLAY LAB v3.6.1</b>\n` +
    `Gerçek Net: ${num(actual?.netUsdt).toFixed(4)} USDT\n` +
    (best ? `🏆 En İyi Uygulanabilir Replay: ${htmlSafe(best.algorithmLabel)} | ${num(best.netUsdt).toFixed(4)} USDT | Fark ${best.deltaVsActualUsdt >= 0 ? '+' : ''}${num(best.deltaVsActualUsdt).toFixed(4)}\n` : '') +
    (oracle ? `🔬 Teorik Üst Benchmark: ${htmlSafe(oracle.algorithmLabel)} | ${num(oracle.netUsdt).toFixed(4)} USDT\n` : '') +
    `ℹ️ Replay analizdir; Trade Engine kararlarına müdahale etmez.`;
}

function telegramOzetMetni() {
  const m = buildModel();
  const top = m.algorithmRanking.filter(x => x.key !== 'ACTUAL').slice(0, 5);
  let text = `\n\n🧬 <b>EXIT REPLAY LAB v3.6.1</b>\n📦 Replay edilen kapanış: ${m.totalTrades}`;
  if (!top.length) return text + '\nHenüz replay sonucu yok.';
  text += '\n\n🏆 <b>Genel Exit Sıralaması</b>\n' + top.map((x, i) => `${i + 1}) ${htmlSafe(x.label)} | Örnek ${x.samples} | Fark ${x.deltaUsdt >= 0 ? '+' : ''}${x.deltaUsdt.toFixed(2)} USDT | Beat %${x.beatRate.toFixed(1)}`).join('\n');
  return text;
}

module.exports = { normalizeInput, algorithms, replayTrade, buildModel, kapanisMetni, telegramOzetMetni };
