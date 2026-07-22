'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = 'v5.2.2-FINAL-EVIDENCE-GATE';
const CORE_EXIT_MIN_REPLAY = 1000;
const STOP_CANDIDATES = [1.0, 1.2, 1.5, 1.8];
const BE_PLUS_CANDIDATES = [0.12, 0.15, 0.18, 0.20];

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  const p = 10 ** digits;
  return Math.round((n(value) + Number.EPSILON) * p) / p;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch (_) { /* malformed tail is ignored */ }
  }
  return rows;
}

function profitFactor(values) {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const value of values) {
    const v = n(value);
    if (v > 0) grossProfit += v;
    else if (v < 0) grossLoss += Math.abs(v);
  }
  return grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss;
}

function summarize(values) {
  const clean = values.map(v => n(v));
  const net = clean.reduce((a, b) => a + b, 0);
  const wins = clean.filter(v => v > 0).length;
  const losses = clean.filter(v => v < 0).length;
  const flat = clean.length - wins - losses;
  return {
    samples: clean.length,
    wins,
    losses,
    flat,
    netUsdt: round(net, 6),
    avgNetUsdt: round(clean.length ? net / clean.length : 0, 6),
    profitFactor: round(profitFactor(clean), 3),
    positiveRatePct: round(clean.length ? (wins / clean.length) * 100 : 0, 2)
  };
}

function familyFromSignature(signatureKey = '') {
  const parts = String(signatureKey).split('|');
  return parts.filter(part => /^(YON|BTC|COIN)=/.test(part)).join('|') || 'UNKNOWN';
}

function fixedStopNet(row, stopPct) {
  const input = row.input || {};
  const valueUsdt = n(input.valueUsdt);
  const commissionUsdt = n(input.commissionUsdt);
  return -(valueUsdt * stopPct / 100) - commissionUsdt;
}

function simulateStopRows(replayRows, stopPct) {
  const forwardOnly = stopPct > 1.5;
  if (forwardOnly) {
    return {
      stopPct,
      status: 'FORWARD_OBSERVATION_REQUIRED',
      reason: 'Geçmiş işlemler %1.5 civarında kapandığı için daha geniş stop sonrası fiyat yolu kaydedilmemiştir.',
      metrics: null
    };
  }

  const projected = [];
  let newlyStopped = 0;
  let rescuedFromLargerLoss = 0;
  let winnersCut = 0;
  for (const row of replayRows) {
    const input = row.input || {};
    const actual = n(input.actualNetUsdt);
    const maePct = n(input.maePct);
    const breached = maePct <= -stopPct;
    const value = breached ? fixedStopNet(row, stopPct) : actual;
    projected.push(value);
    if (breached) {
      newlyStopped += 1;
      if (actual < value) rescuedFromLargerLoss += 1;
      if (actual > 0) winnersCut += 1;
    }
  }
  const actualMetrics = summarize(replayRows.map(row => n(row.input && row.input.actualNetUsdt)));
  const projectedMetrics = summarize(projected);
  return {
    stopPct,
    status: 'HISTORICAL_MAE_SIMULATION',
    method: 'MAE eşik ihlalinde aday sabit stop; ihlal yoksa gerçek sonuç korunur.',
    newlyStopped,
    rescuedFromLargerLoss,
    winnersCut,
    metrics: projectedMetrics,
    deltaVsActualUsdt: round(projectedMetrics.netUsdt - actualMetrics.netUsdt, 6),
    pfDelta: round(projectedMetrics.profitFactor - actualMetrics.profitFactor, 3)
  };
}

function groupStopImpact(replayRows, stopPct, keyFn, minSamples = 5) {
  const groups = new Map();
  for (const row of replayRows) {
    const key = keyFn(row) || 'UNKNOWN';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const [key, rows] of groups.entries()) {
    if (rows.length < minSamples) continue;
    const actual = summarize(rows.map(r => n(r.input && r.input.actualNetUsdt)));
    const projected = summarize(rows.map(r => {
      const input = r.input || {};
      return n(input.maePct) <= -stopPct ? fixedStopNet(r, stopPct) : n(input.actualNetUsdt);
    }));
    out.push({
      key,
      samples: rows.length,
      actualNetUsdt: actual.netUsdt,
      projectedNetUsdt: projected.netUsdt,
      deltaUsdt: round(projected.netUsdt - actual.netUsdt, 6),
      actualPf: actual.profitFactor,
      projectedPf: projected.profitFactor
    });
  }
  return out.sort((a, b) => b.deltaUsdt - a.deltaUsdt);
}

function buildStopAnalysis(replayRows) {
  const actual = summarize(replayRows.map(row => n(row.input && row.input.actualNetUsdt)));
  const candidates = STOP_CANDIDATES.map(stop => simulateStopRows(replayRows, stop));
  const eligible = candidates.filter(c => c.metrics);
  const best = eligible.slice().sort((a, b) => {
    if (b.metrics.netUsdt !== a.metrics.netUsdt) return b.metrics.netUsdt - a.metrics.netUsdt;
    return b.metrics.profitFactor - a.metrics.profitFactor;
  })[0] || null;
  const candidatePct = best ? best.stopPct : 1.5;
  return {
    actual,
    candidates,
    recommendation: {
      action: best && best.deltaVsActualUsdt > 0 ? 'SHADOW_TEST' : 'KEEP_1_5',
      candidateStopPct: candidatePct,
      reason: best
        ? `%${candidatePct} geçmiş MAE simülasyonunda en iyi net sonucu verdi; Trade Engine değişmeden ileri Shadow doğrulaması gerekir.`
        : 'Yeterli veri yok.'
    },
    byDirection: groupStopImpact(replayRows, candidatePct, row => row.input && row.input.side, 20),
    byFamilyTopImprovement: groupStopImpact(
      replayRows,
      candidatePct,
      row => familyFromSignature(row.input && row.input.signatureKey),
      10
    ).slice(0, 15),
    byFamilyTopDamage: groupStopImpact(
      replayRows,
      candidatePct,
      row => familyFromSignature(row.input && row.input.signatureKey),
      10
    ).slice(-15).reverse()
  };
}

function buildBeAnalysis(replayRows) {
  const beRows = replayRows.filter(row => {
    const input = row.input || {};
    return String(input.result || '').toUpperCase() === 'BE' || /break|başa|basa|BE/i.test(String(input.closeReason || ''));
  });
  const actual = summarize(beRows.map(row => n(row.input && row.input.actualNetUsdt)));
  const candidates = BE_PLUS_CANDIDATES.map(targetPct => {
    const projected = [];
    let reachable = 0;
    for (const row of beRows) {
      const input = row.input || {};
      const mfe = n(input.mfePct);
      if (mfe >= targetPct) {
        reachable += 1;
        projected.push((n(input.valueUsdt) * targetPct / 100) - n(input.commissionUsdt));
      } else {
        projected.push(n(input.actualNetUsdt));
      }
    }
    const metrics = summarize(projected);
    return {
      targetPct,
      reachable,
      unreachable: beRows.length - reachable,
      metrics,
      deltaVsActualUsdt: round(metrics.netUsdt - actual.netUsdt, 6),
      status: 'UPPER_BOUND_MFE_TEST',
      caveat: 'MFE hedefe ulaştığını kanıtlar; emir sırası ve kayma için ileri Shadow testi gerekir.'
    };
  });
  const positive = candidates.filter(c => c.deltaVsActualUsdt > 0 && c.reachable > 0);
  const recommended = positive.sort((a, b) => a.targetPct - b.targetPct)[0] || null;
  return {
    beTrades: beRows.length,
    actual,
    candidates,
    recommendation: recommended ? {
      action: 'SHADOW_TEST',
      bePlusPct: recommended.targetPct,
      reason: 'Pozitif projeksiyon üreten en küçük tampon seçildi; komisyon ve kayma ileri Shadow defterinde doğrulanmalıdır.'
    } : {
      action: 'KEEP_CURRENT_BE',
      bePlusPct: null,
      reason: 'Mevcut veride güvenli pozitif aday oluşmadı.'
    }
  };
}

function buildExitAnalysis(replayRows, shadowRows, premierRows) {
  const algorithms = new Map();
  for (const row of replayRows) {
    for (const result of row.results || []) {
      const id = result.algorithmId;
      if (!id || id === 'ACTUAL') continue;
      if (!algorithms.has(id)) algorithms.set(id, { id, label: result.algorithmLabel || id, replayCount: 0, reached: 0, net: [], delta: [] });
      const a = algorithms.get(id);
      a.replayCount += 1;
      if (result.reached) a.reached += 1;
      a.net.push(n(result.netUsdt));
      a.delta.push(n(result.deltaVsActualUsdt));
    }
  }

  const assignments = new Map();
  const seenTrade = new Set();
  const addAssignment = (tradeId, id, label) => {
    if (!id || !tradeId || seenTrade.has(tradeId)) return;
    seenTrade.add(tradeId);
    if (!assignments.has(id)) assignments.set(id, { id, label: label || id, count: 0 });
    assignments.get(id).count += 1;
  };
  for (const row of shadowRows) addAssignment(row.tradeId, row.selectedAlgorithmId, row.selectedAlgorithmLabel);
  for (const row of premierRows) addAssignment(row.tradeId, row.exitAlgorithmId, row.exitAlgorithmLabel);

  const scoreboard = [...algorithms.values()].map(a => {
    const net = summarize(a.net);
    const assigned = assignments.get(a.id);
    return {
      algorithmId: a.id,
      algorithmLabel: a.label,
      class: a.id.startsWith('TIME_') ? 'TIME' : a.id.startsWith('MFE_') ? 'MFE' : a.id.startsWith('ATR_') ? 'ATR' : a.id.includes('HYBRID') ? 'HYBRID' : a.id.includes('DYNAMIC') ? 'DYNAMIC' : 'OTHER',
      replayCount: a.replayCount,
      reachedCount: a.reached,
      reachedRatePct: round(a.replayCount ? a.reached / a.replayCount * 100 : 0, 2),
      replayNetUsdt: net.netUsdt,
      replayPf: net.profitFactor,
      deltaVsActualUsdt: round(a.delta.reduce((x, y) => x + y, 0), 6),
      assignedTrades: assigned ? assigned.count : 0
    };
  }).sort((a, b) => b.deltaVsActualUsdt - a.deltaVsActualUsdt);

  const core = scoreboard.filter(a => a.replayCount >= CORE_EXIT_MIN_REPLAY);
  const assignedTotal = [...assignments.values()].reduce((sum, a) => sum + a.count, 0);
  const timeAssigned = [...assignments.values()].filter(a => a.id.startsWith('TIME_')).reduce((sum, a) => sum + a.count, 0);
  return {
    replayAlgorithms: scoreboard.length,
    coreAlgorithms: core.length,
    assignedDistinctAlgorithms: assignments.size,
    assignedTrades: assignedTotal,
    timeAssignedTrades: timeAssigned,
    timeAssignmentSharePct: round(assignedTotal ? timeAssigned / assignedTotal * 100 : 0, 2),
    unusedCoreAlgorithms: core.filter(a => a.assignedTrades === 0).map(a => ({ algorithmId: a.algorithmId, label: a.algorithmLabel })),
    scoreboard,
    diagnosis: timeAssigned > assignedTotal / 2
      ? 'Zaman bazlı Exit baskınlığı executor arızası değil; seçim/kanıt kapsamı ve fallback dağılımı incelenmelidir.'
      : 'Zaman bazlı Exitler canlı atamada çoğunluk oluşturmuyor.'
  };
}

function buildEvolutionAnalysis(shadowRows) {
  const valid = shadowRows.filter(row => Number.isFinite(Number(row.actualNetUsdt)) && Number.isFinite(Number(row.selectedNetUsdt)));
  const actual = summarize(valid.map(row => n(row.actualNetUsdt)));
  const selected = summarize(valid.map(row => n(row.selectedNetUsdt)));
  const byAlgorithm = new Map();
  for (const row of valid) {
    const id = row.selectedAlgorithmId || 'UNKNOWN';
    if (!byAlgorithm.has(id)) byAlgorithm.set(id, { id, label: row.selectedAlgorithmLabel || id, rows: [] });
    byAlgorithm.get(id).rows.push(row);
  }
  const algorithms = [...byAlgorithm.values()].map(group => {
    const a = summarize(group.rows.map(row => n(row.actualNetUsdt)));
    const s = summarize(group.rows.map(row => n(row.selectedNetUsdt)));
    return {
      algorithmId: group.id,
      algorithmLabel: group.label,
      samples: group.rows.length,
      actualNetUsdt: a.netUsdt,
      shadowNetUsdt: s.netUsdt,
      deltaUsdt: round(s.netUsdt - a.netUsdt, 6),
      actualPf: a.profitFactor,
      shadowPf: s.profitFactor,
      beatRatePct: round(group.rows.length ? group.rows.filter(row => n(row.selectedNetUsdt) > n(row.actualNetUsdt)).length / group.rows.length * 100 : 0, 2)
    };
  }).sort((a, b) => b.deltaUsdt - a.deltaUsdt);
  return {
    samples: valid.length,
    actual,
    shadow: selected,
    deltaUsdt: round(selected.netUsdt - actual.netUsdt, 6),
    pfDelta: round(selected.profitFactor - actual.profitFactor, 3),
    beatRatePct: round(valid.length ? valid.filter(row => n(row.selectedNetUsdt) > n(row.actualNetUsdt)).length / valid.length * 100 : 0, 2),
    byAlgorithm: algorithms
  };
}

function proofGroup(proofLevel) {
  const p = String(proofLevel || 'UNKNOWN');
  if (p.includes('RECENT5')) return 'RECENT5';
  if (p.includes('REVERSE')) return 'REVERSE';
  return 'HISTORICAL';
}

function buildPremierAnalysis(premierRows) {
  const groups = new Map();
  for (const row of premierRows) {
    const key = proofGroup(row.proofLevel);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = {};
  for (const key of ['HISTORICAL', 'RECENT5', 'REVERSE']) {
    const rows = groups.get(key) || [];
    const metrics = summarize(rows.map(row => n(row.net)));
    result[key] = {
      ...metrics,
      tp: rows.filter(row => row.outcome === 'TP').length,
      sl: rows.filter(row => row.outcome === 'SL').length,
      be: rows.filter(row => row.outcome === 'BE').length
    };
  }
  return {
    groups: result,
    recent5Decision: 'REMOVED_v5.3.0',
    reason: 'Son-5 lig yolu kaldırıldı; Championship → Premier terfisi izlenir.'
  };
}


function classifyEvidence({ samples, netUsdt, profitFactor, deltaUsdt = 0, independentForward = false, minSamples = 30 }) {
  const nSamples = Number(samples || 0);
  const net = Number(netUsdt || 0);
  const pf = Number(profitFactor || 0);
  const delta = Number(deltaUsdt || 0);
  if (nSamples < minSamples) return { code: 'INSUFFICIENT_DATA', icon: '🟡', label: 'VERİ YETERSİZ', reason: `Min ${minSamples}, mevcut ${nSamples}` };
  if (!independentForward) return { code: 'SHADOW_REQUIRED', icon: '🟡', label: 'SHADOW KANITI GEREKİYOR', reason: 'Tarihsel/replay sonuç tek başına canlıya alma kanıtı değildir.' };
  if (net > 0 && pf > 1 && delta > 0) return { code: 'READY', icon: '🟢', label: 'CANLIYA ALINABİLİR', reason: 'Bağımsız ileri örnekte Net>0, PF>1 ve avantaj>0.' };
  return { code: 'REJECTED', icon: '🔴', label: 'REDDEDİLDİ', reason: 'Bağımsız ileri sonuç Net/PF/avantaj koşullarını geçemedi.' };
}

function buildEvidenceGate(report) {
  const stopCandidate = report.stop.candidates.find(c => c.stopPct === report.stop.recommendation.candidateStopPct);
  const beCandidate = report.be.candidates.find(c => c.targetPct === report.be.recommendation.bePlusPct);
  const recent5 = report.premier.groups.RECENT5;
  return {
    stop: {
      proposal: report.stop.recommendation.candidateStopPct ? `Stop %${report.stop.recommendation.candidateStopPct}` : 'Stop değişikliği yok',
      metrics: stopCandidate && stopCandidate.metrics ? { samples: stopCandidate.metrics.samples, netUsdt: stopCandidate.metrics.netUsdt, profitFactor: stopCandidate.metrics.profitFactor, deltaUsdt: stopCandidate.deltaVsActualUsdt } : null,
      evidence: classifyEvidence({ samples: stopCandidate?.metrics?.samples, netUsdt: stopCandidate?.metrics?.netUsdt, profitFactor: stopCandidate?.metrics?.profitFactor, deltaUsdt: stopCandidate?.deltaVsActualUsdt, independentForward: false, minSamples: 100 })
    },
    be: {
      proposal: beCandidate ? `BE +%${beCandidate.targetPct}` : 'BE değişikliği yok',
      metrics: beCandidate ? { samples: beCandidate.reachable, netUsdt: beCandidate.metrics.netUsdt, profitFactor: beCandidate.metrics.profitFactor, deltaUsdt: beCandidate.deltaVsActualUsdt } : null,
      evidence: classifyEvidence({ samples: beCandidate?.reachable, netUsdt: beCandidate?.metrics?.netUsdt, profitFactor: beCandidate?.metrics?.profitFactor, deltaUsdt: beCandidate?.deltaVsActualUsdt, independentForward: false, minSamples: 30 })
    },
    exitEvolution: {
      proposal: 'Seçilen Shadow Exit',
      metrics: { samples: report.exitEvolution.samples, netUsdt: report.exitEvolution.shadow.netUsdt, profitFactor: report.exitEvolution.shadow.profitFactor, deltaUsdt: report.exitEvolution.deltaUsdt },
      evidence: classifyEvidence({ samples: report.exitEvolution.samples, netUsdt: report.exitEvolution.shadow.netUsdt, profitFactor: report.exitEvolution.shadow.profitFactor, deltaUsdt: report.exitEvolution.deltaUsdt, independentForward: true, minSamples: 100 })
    },
    autoApply: false,
    rule: 'READY yalnız bağımsız ileri kanıtta oluşur; sistem otomatik Trade Engine değişikliği yapmaz.'
  };
}

function compactTelegram(report) {
  const stop = report.stop;
  const be = report.be;
  const exit = report.exit;
  const evo = report.exitEvolution;
  const premier = report.premier;
  const gate = report.evidenceGate;
  const stopCandidate = stop.recommendation.candidateStopPct;
  const stopRow = stop.candidates.find(c => c.stopPct === stopCandidate);
  return [
    '🧪 <b>GERÇEK EMİR HAZIRLIĞI — AŞAMA 1</b>',
    `📦 Kanıt: Stop/Replay N${report.sourceCounts.replay} | Shadow N${report.sourceCounts.shadow} | Premier N${report.sourceCounts.premier}`,
    '',
    '🛡️ <b>STOP INTELLIGENCE</b>',
    `Mevcut: Net ${stop.actual.netUsdt >= 0 ? '+' : ''}${stop.actual.netUsdt} | PF ${stop.actual.profitFactor}`,
    stopRow && stopRow.metrics
      ? `Aday %${stopCandidate}: Net ${stopRow.metrics.netUsdt >= 0 ? '+' : ''}${stopRow.metrics.netUsdt} | PF ${stopRow.metrics.profitFactor} | Δ ${stopRow.deltaVsActualUsdt >= 0 ? '+' : ''}${stopRow.deltaVsActualUsdt}`
      : `Aday: ${stop.recommendation.action}`,
    `Karar: ${stop.recommendation.action} — Trade Engine değişmedi`,
    '',
    '⚖️ <b>BE INTELLIGENCE</b>',
    `BE N${be.beTrades} | Gerçek Net ${be.actual.netUsdt >= 0 ? '+' : ''}${be.actual.netUsdt}`,
    `Karar: ${be.recommendation.action}${be.recommendation.bePlusPct ? ` +%${be.recommendation.bePlusPct}` : ''}`,
    '',
    '🎯 <b>EXIT KULLANIMI</b>',
    `Çekirdek ${exit.coreAlgorithms} | Atanan ${exit.assignedDistinctAlgorithms} | Kullanılmayan ${exit.unusedCoreAlgorithms.length}`,
    `Zaman bazlı: ${exit.timeAssignedTrades}/${exit.assignedTrades} (%${exit.timeAssignmentSharePct})`,
    '',
    '🧬 <b>SHADOW vs GERÇEK</b>',
    `N${evo.samples} | Δ ${evo.deltaUsdt >= 0 ? '+' : ''}${evo.deltaUsdt} USDT | PF ${evo.actual.profitFactor} → ${evo.shadow.profitFactor} | Beat %${evo.beatRatePct}`,
    '',
    '🏆 <b>LİG FORMU</b>',
    `Tarihsel: N${premier.groups.HISTORICAL.samples} Net ${premier.groups.HISTORICAL.netUsdt >= 0 ? '+' : ''}${premier.groups.HISTORICAL.netUsdt} PF ${premier.groups.HISTORICAL.profitFactor}`,
    `Championship → Premier: Son-5 yolu kaldırıldı; terfi tarihsel pozitif ekonomi ve LAB kanıtıyla yapılır`,
    '',
    '🚦 <b>KANIT KAPISI</b>',
    `${gate.stop.evidence.icon} ${gate.stop.proposal}: ${gate.stop.evidence.label}`,
    `${gate.be.evidence.icon} ${gate.be.proposal}: ${gate.be.evidence.label}`,
    `${gate.exitEvolution.evidence.icon} Exit Evolution: ${gate.exitEvolution.evidence.label}`,
    '<i>READY olsa bile otomatik uygulanmaz; Trade Engine değişmez.</i>'
  ].join('\n');
}

function createTextReport(report) {
  const stop = report.stop;
  const be = report.be;
  const exit = report.exit;
  const evo = report.exitEvolution;
  const premier = report.premier;
  const lines = [
    `AGROS GERÇEK EMİR HAZIRLIĞI — AŞAMA 1 (${report.version})`,
    `Üretim: ${report.generatedAt}`,
    '',
    'STOP INTELLIGENCE',
    `Gerçek: N${stop.actual.samples} Net ${stop.actual.netUsdt} PF ${stop.actual.profitFactor}`,
    ...stop.candidates.map(c => c.metrics
      ? `%${c.stopPct}: Net ${c.metrics.netUsdt} PF ${c.metrics.profitFactor} Δ ${c.deltaVsActualUsdt} | kesilen kazanan ${c.winnersCut}`
      : `%${c.stopPct}: ${c.status}`),
    `Karar: ${stop.recommendation.action} → %${stop.recommendation.candidateStopPct}`,
    '',
    'BE INTELLIGENCE',
    `BE işlem: ${be.beTrades} | Gerçek Net ${be.actual.netUsdt}`,
    ...be.candidates.map(c => `BE+ %${c.targetPct}: ulaşan ${c.reachable}/${be.beTrades} Net ${c.metrics.netUsdt} Δ ${c.deltaVsActualUsdt}`),
    `Karar: ${be.recommendation.action}${be.recommendation.bePlusPct ? ` → +%${be.recommendation.bePlusPct}` : ''}`,
    '',
    'EXIT INTELLIGENCE',
    `Replay algoritma ${exit.replayAlgorithms} | Çekirdek ${exit.coreAlgorithms} | Atanan ${exit.assignedDistinctAlgorithms}`,
    `Zaman bazlı atama: ${exit.timeAssignedTrades}/${exit.assignedTrades} (%${exit.timeAssignmentSharePct})`,
    `Kullanılmayan çekirdek: ${exit.unusedCoreAlgorithms.length}`,
    `Teşhis: ${exit.diagnosis}`,
    '',
    'EXIT EVOLUTION',
    `N${evo.samples} | Gerçek Net ${evo.actual.netUsdt} PF ${evo.actual.profitFactor}`,
    `Shadow Net ${evo.shadow.netUsdt} PF ${evo.shadow.profitFactor} | Δ ${evo.deltaUsdt} | Beat %${evo.beatRatePct}`,
    '',
    'PREMIER LEAGUE',
    `Tarihsel: N${premier.groups.HISTORICAL.samples} Net ${premier.groups.HISTORICAL.netUsdt} PF ${premier.groups.HISTORICAL.profitFactor}`,
    `Reverse: N${premier.groups.REVERSE.samples} Net ${premier.groups.REVERSE.netUsdt} PF ${premier.groups.REVERSE.profitFactor}`,
    `Championship → Premier: Son-5 kaldırıldı; tarihsel LAB ekonomisi izlenir`,
    '',
    'KANIT KAPISI',
    `${report.evidenceGate.stop.evidence.icon} ${report.evidenceGate.stop.proposal}: ${report.evidenceGate.stop.evidence.label} — ${report.evidenceGate.stop.evidence.reason}`,
    `${report.evidenceGate.be.evidence.icon} ${report.evidenceGate.be.proposal}: ${report.evidenceGate.be.evidence.label} — ${report.evidenceGate.be.evidence.reason}`,
    `${report.evidenceGate.exitEvolution.evidence.icon} Exit Evolution: ${report.evidenceGate.exitEvolution.evidence.label} — ${report.evidenceGate.exitEvolution.evidence.reason}`,
    '',
    'GÜVENLİK',
    'Bu modül yalnız analiz/raporlama yapar. Trade Engine, açık pozisyon stopları ve gerçek emir yetkisi değiştirilmez.'
  ];
  return `${lines.join('\n')}\n`;
}

function run(dataDir, outputDir = dataDir) {
  const replayRows = readJsonl(path.join(dataDir, 'exit-replay-results.jsonl'));
  const shadowRows = readJsonl(path.join(dataDir, 'dna-exit-shadow-validation.jsonl'));
  const premierRows = readJsonl(path.join(dataDir, 'lab-premier-trades.jsonl'));
  if (!replayRows.length) throw new Error(`exit-replay-results.jsonl bulunamadı veya boş: ${dataDir}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const report = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourceCounts: { replay: replayRows.length, shadow: shadowRows.length, premier: premierRows.length },
    safety: { tradeEngineChanged: false, realOrderAuthorized: false, mode: 'ANALYSIS_ONLY' },
    stop: buildStopAnalysis(replayRows),
    be: buildBeAnalysis(replayRows),
    exit: buildExitAnalysis(replayRows, shadowRows, premierRows),
    exitEvolution: buildEvolutionAnalysis(shadowRows),
    premier: buildPremierAnalysis(premierRows)
  };
  report.evidenceGate = buildEvidenceGate(report);
  fs.writeFileSync(path.join(outputDir, 'real-order-preparation-intelligence.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outputDir, 'real-order-preparation-intelligence.txt'), createTextReport(report));
  return report;
}

if (require.main === module) {
  const dataDir = path.resolve(process.argv[2] || process.env.AGROS_DATA_DIR || path.join(__dirname, 'data'));
  const outputDir = path.resolve(process.argv[3] || dataDir);
  try {
    const report = run(dataDir, outputDir);
    process.stdout.write(createTextReport(report));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  VERSION,
  summarize,
  simulateStopRows,
  buildStopAnalysis,
  buildBeAnalysis,
  buildExitAnalysis,
  buildEvolutionAnalysis,
  buildPremierAnalysis,
  classifyEvidence,
  buildEvidenceGate,
  compactTelegram,
  run
};
