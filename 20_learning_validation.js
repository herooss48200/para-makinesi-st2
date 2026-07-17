/**
 * AGROS v3.5.3 - LEARNING VALIDATION
 *
 * Amaç:
 * - Trade Engine'e dokunmadan canlı portföy raporuna öğrenme doğrulaması eklemek.
 * - Kapanan işlemler, açık pozisyon floating PNL ve BlackBox/DNA istatistiklerinden
 *   Telegram'da okunabilir kısa bir karar destek özeti üretmek.
 */

const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const dnaProfitRanking = require('./33_dna_profit_ranking_engine.js');
const dnaFilterSimulator = require('./34_dna_filter_simulator.js');
const confidenceEngineV2 = require('./35_confidence_engine_v2.js');
const dnaHeatMap = require('./36_dna_heat_map.js');
const directionIntelligence = require('./37_direction_intelligence_lab.js');
const dnaEvolution = require('./38_dna_evolution_engine.js');
const agrosConsensus = require('./39_agros_consensus_engine.js');
const consensusValidation = require('./40_consensus_validation_engine.js');
const intelligenceDashboard = require('./41_agros_intelligence_dashboard.js');
const performanceValidation = require('./42_performance_validation_dashboard.js');
const dnaLeague = require('./46_dna_league_engine.js');

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(v, p = 2) {
  const n = num(v);
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

function fmt(v, p = 2) {
  return num(v).toFixed(p);
}

function signed(v, p = 2) {
  const n = num(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(p)}`;
}

function pct(v, p = 1) {
  return `%${fmt(v, p)}`;
}

function yon(p) {
  return String(p?.yon || p?.side || p?.direction || '').toUpperCase();
}

function sembol(p) {
  return p?.sym || p?.sembol || p?.symbol || p?.coin || p?.girisAnalizi?.symbol || p?.blackboxAcilis?.symbol || 'BILINMIYOR';
}

function girisFiyati(p) {
  return num(p?.girisFiyati || p?.entryPrice || p?.giris || p?.entry || 0);
}

function canliFiyat(p) {
  const sym = sembol(p);
  return num(
    h.state.canliFiyatlar?.[sym] ||
    p?.sonFiyat ||
    p?.anlikFiyat ||
    p?.currentPrice ||
    p?.fiyat ||
    girisFiyati(p)
  );
}

function pozisyonDegeri(p) {
  const miktar = num(p?.miktar || p?.quantity || 0);
  const giris = girisFiyati(p);
  if (miktar > 0 && giris > 0) return miktar * giris;
  return num(ayarlar.calisilmakIstenenUsdtMiktar) * num(ayarlar.mevcutKaldirac, 1);
}

function floatingPnl(p) {
  const giris = girisFiyati(p);
  const fiyat = canliFiyat(p);
  const deger = pozisyonDegeri(p);
  const y = yon(p);
  if (!giris || !fiyat || !deger) return 0;
  const fiyatKarYuzdesi = y === 'SHORT'
    ? ((giris - fiyat) / giris) * 100
    : ((fiyat - giris) / giris) * 100;
  return deger * (fiyatKarYuzdesi / 100);
}

function bucketBasari(b) {
  const tp = num(b?.tp);
  const sl = num(b?.sl);
  const sonuc = tp + sl;
  return sonuc > 0 ? (tp / sonuc) * 100 : 0;
}

function bucketPf(b) {
  const kar = num(b?.karToplam);
  const zarar = num(b?.zararToplam);
  if (kar <= 0 && zarar <= 0) return 0;
  if (zarar <= 0) return 99;
  return kar / zarar;
}

function bucketSatiri(b) {
  if (!b) return 'Veri bekleniyor';
  const key = b.key || b.etiket || 'DNA';
  const kisaKey = String(key).length > 34 ? String(key).slice(0, 34) + '…' : String(key);
  return `${kisaKey} | ${num(b.toplam)} işlem | Başarı ${pct(bucketBasari(b), 1)} | Net ${signed(b.net, 2)} USDT`;
}

function sonIslemNetleri() {
  const son = Array.isArray(h.state.analizOzeti?.son10Islem) ? h.state.analizOzeti.son10Islem : [];
  return son.map(x => ({
    sonuc: String(x?.sonuc || '').toUpperCase(),
    net: num(x?.netKarZarar)
  })).filter(x => x.sonuc || x.net !== 0);
}

function sonIslemOzet() {
  const arr = sonIslemNetleri();
  const wins = arr.filter(x => x.net > 0);
  const losses = arr.filter(x => x.net < 0);
  const be = arr.filter(x => x.sonuc === 'BE');
  const kar = wins.reduce((a, x) => a + x.net, 0);
  const zarar = Math.abs(losses.reduce((a, x) => a + x.net, 0));
  return {
    ornek: arr.length,
    avgTp: wins.length ? kar / wins.length : 0,
    avgSl: losses.length ? -zarar / losses.length : 0,
    avgBe: be.length ? be.reduce((a, x) => a + x.net, 0) / be.length : 0,
    pf: zarar > 0 ? kar / zarar : (kar > 0 ? 99 : 0)
  };
}

function aktifFloatingOzet() {
  const aktifler = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
  let long = 0;
  let short = 0;
  for (const p of aktifler) {
    const pnl = floatingPnl(p);
    if (yon(p) === 'SHORT') short += pnl;
    else long += pnl;
  }
  return {
    toplam: long + short,
    long,
    short,
    adet: aktifler.length
  };
}

function enIyiEnRiskliDna() {
  const stats = h.state.blackboxOzet?.signatureMatrixStats || h.state.blackboxOzet?.fullSignatureStats || {};
  const min = Math.max(1, num(ayarlar.learningValidationMinDnaOrnek || ayarlar.blackbox256MatrixMinOrnek || 3));
  const arr = Object.values(stats)
    .filter(x => num(x?.toplam) >= min)
    .map(x => ({ ...x, basari: bucketBasari(x), pf: bucketPf(x) }));

  const guclu = [...arr]
    .filter(x => num(x.net) > 0 || x.basari >= 55)
    .sort((a, b) => num(b.net) - num(a.net) || num(b.basari) - num(a.basari) || num(b.toplam) - num(a.toplam))[0] || null;

  const riskli = [...arr]
    .filter(x => num(x.net) < 0 || x.basari <= 45)
    .sort((a, b) => num(a.net) - num(b.net) || num(a.basari) - num(b.basari) || num(b.toplam) - num(a.toplam))[0] || null;

  return {
    min,
    toplamDna: Object.keys(stats).length,
    yeterliDna: arr.length,
    guclu,
    riskli
  };
}

function buildLearningValidationModel() {
  const s = h.state.basariOzeti || {};
  const analiz = h.state.analizOzeti || {};
  const tp = num(s.tp);
  const sl = num(s.sl);
  const be = num(s.be);
  const kapanan = tp + sl + be;
  const sonuc = tp + sl;
  const winRate = sonuc > 0 ? (tp / sonuc) * 100 : 0;
  const netKasa = num(s.netKarZarar);
  const komisyon = num(s.toplamKomisyon);
  const expectancy = kapanan > 0 ? netKasa / kapanan : 0;
  const son = sonIslemOzet();
  const floating = aktifFloatingOzet();
  const dna = enIyiEnRiskliDna();
  const dnaStats = h.state.blackboxOzet?.signatureMatrixStats || {};
  const dnaRanking = dnaProfitRanking.rank(
    dnaStats,
    { minSample: Math.max(1, num(ayarlar.dnaProfitRankingMinOrnek || ayarlar.blackbox256MatrixMinOrnek || 3)) }
  );
  const dnaFilterSimulation = dnaFilterSimulator.simulate(dnaStats, {
    minSample: Math.max(1, num(ayarlar.dnaFilterSimulatorMinOrnek || ayarlar.dnaProfitRankingMinOrnek || 10)),
    maxCandidates: Math.max(1, num(ayarlar.dnaFilterSimulatorMaksAday || 10)),
    maxCumulative: Math.max(1, num(ayarlar.dnaFilterSimulatorKumulatifAday || 10)),
    maxPf: num(ayarlar.dnaFilterSimulatorMaksPf, 0.95),
    maxExpectancy: num(ayarlar.dnaFilterSimulatorMaksExpectancy, 0)
  });
  const confidenceV2 = confidenceEngineV2.build(dnaRanking, dnaFilterSimulation, {
    minSample: Math.max(1, num(ayarlar.confidenceEngineV2MinOrnek || ayarlar.dnaProfitRankingMinOrnek || 10)),
    targetSample: Math.max(1, num(ayarlar.confidenceEngineV2HedefOrnek || 50)),
    limit: Math.max(1, num(ayarlar.confidenceEngineV2TopAday || 10)),
    expectancyScale: num(ayarlar.confidenceEngineV2ExpectancyScale, 0.20),
    netScale: num(ayarlar.confidenceEngineV2NetScale, 10)
  });
  const dnaHeatMapModel = dnaHeatMap.build(confidenceV2, {
    minSample: Math.max(1, num(ayarlar.dnaHeatMapMinOrnek || ayarlar.confidenceEngineV2MinOrnek || 10)),
    rawStats: dnaStats
  });
  const directionIntelligenceModel = directionIntelligence.build(dnaStats, {
    minSample: Math.max(1, num(ayarlar.directionIntelligenceMinOrnek || 10)),
    targetSample: Math.max(1, num(ayarlar.directionIntelligenceHedefOrnek || 50)),
    strongEdge: num(ayarlar.directionIntelligenceGucluEdge, 20)
  });
  const dnaEvolutionModel = dnaEvolution.build({
    minSample: Math.max(1, num(ayarlar.dnaEvolutionMinOrnek || 10))
  });
  const agrosConsensusModel = agrosConsensus.build({
    confidence: confidenceV2,
    heatMap: dnaHeatMapModel,
    direction: directionIntelligenceModel,
    evolution: dnaEvolutionModel
  }, {
    minSample: Math.max(1, num(ayarlar.agrosConsensusMinOrnek || 10))
  });

  const consensusValidationModel = consensusValidation.build(agrosConsensusModel, {
    minSnapshotHours: Math.max(1, num(ayarlar.consensusValidationSnapshotSaat || 6)),
    maxPredictions: Math.max(100, num(ayarlar.consensusValidationMaksTahmin || 5000)),
    maxResolutions: Math.max(100, num(ayarlar.consensusValidationMaksSonuc || 10000))
  });

  const performanceValidationModel = performanceValidation.build(consensusValidationModel, {
    minCalls: Math.max(1, num(ayarlar.performanceValidationMinKarar || 10))
  });

  const dnaLeagueModel = dnaLeague.build({
    ranking: dnaRanking,
    confidence: confidenceV2,
    evolution: dnaEvolutionModel
  });

  const intelligenceDashboardModel = intelligenceDashboard.build({
    direction: directionIntelligenceModel,
    evolution: dnaEvolutionModel,
    consensus: agrosConsensusModel,
    validation: consensusValidationModel
  }, {
    limit: Math.max(1, num(ayarlar.intelligenceDashboardTopAday || 3))
  });

  const long = analiz.long || {};
  const short = analiz.short || {};
  const longSonuc = num(long.tp) + num(long.sl);
  const shortSonuc = num(short.tp) + num(short.sl);
  const longKapanan = longSonuc + num(long.be);
  const shortKapanan = shortSonuc + num(short.be);

  const guvenilirDna = dna.yeterliDna;
  const kapsama = dna.toplamDna > 0 ? (guvenilirDna / dna.toplamDna) * 100 : 0;
  const progress = Math.min(100, (kapanan / Math.max(1, num(ayarlar.learningValidationHedefKapanis || 500))) * 100);

  let edge = 'NÖTR';
  if (expectancy > 0.02 && winRate >= 50) edge = 'POZİTİF';
  else if (expectancy < -0.02 || winRate < 48) edge = 'NEGATİF';

  return {
    version: 'v3.5.3-LEARNING-VALIDATION-TELEGRAM',
    kapanan,
    tp,
    sl,
    be,
    winRate,
    netKasa,
    komisyon,
    expectancy,
    son,
    floating,
    gercekNet: netKasa + floating.toplam,
    edge,
    long: {
      kapanan: longKapanan,
      winRate: longSonuc > 0 ? (num(long.tp) / longSonuc) * 100 : 0,
      expectancy: longKapanan > 0 ? num(long.netKarZarar) / longKapanan : 0,
      net: num(long.netKarZarar)
    },
    short: {
      kapanan: shortKapanan,
      winRate: shortSonuc > 0 ? (num(short.tp) / shortSonuc) * 100 : 0,
      expectancy: shortKapanan > 0 ? num(short.netKarZarar) / shortKapanan : 0,
      net: num(short.netKarZarar)
    },
    dna,
    dnaRanking,
    dnaFilterSimulation,
    confidenceV2,
    dnaHeatMap: dnaHeatMapModel,
    directionIntelligence: directionIntelligenceModel,
    dnaEvolution: dnaEvolutionModel,
    agrosConsensus: agrosConsensusModel,
    consensusValidation: consensusValidationModel,
    intelligenceDashboard: intelligenceDashboardModel,
    performanceValidation: performanceValidationModel,
    dnaLeague: dnaLeagueModel,
    learningScore: {
      toplamDna: dna.toplamDna,
      yeterliDna: dna.yeterliDna,
      kapsama,
      progress
    }
  };
}

function telegramOzetMetni(model = buildLearningValidationModel()) {
  const pfText = model.son.ornek >= 3 ? fmt(model.son.pf, 2) : 'veri bekleniyor';
  const avgText = model.son.ornek >= 3
    ? `Ort TP ${signed(model.son.avgTp, 2)} | Ort SL ${signed(model.son.avgSl, 2)}`
    : `Ortalama TP/SL için kapanış verisi bekleniyor`;

  let m = '';
  m += `\n\n🧠 <b>LEARNING VALIDATION v3.5.3</b>\n`;
  m += `📈 Edge: <b>${model.edge}</b> | Win ${pct(model.winRate, 2)} | Exp ${signed(model.expectancy, 4)} USDT\n`;
  m += `📊 PF(son ${model.son.ornek}): ${pfText} | ${avgText}\n`;
  m += `📡 Floating: ${signed(model.floating.toplam, 2)} USDT | 🟢 ${signed(model.floating.long, 2)} | 🔴 ${signed(model.floating.short, 2)}\n`;
  m += `💰 Gerçek Net: ${signed(model.gercekNet, 2)} USDT\n`;
  m += `🟢 Long: Win ${pct(model.long.winRate, 1)} | Exp ${signed(model.long.expectancy, 3)} | Net ${signed(model.long.net, 2)}\n`;
  m += `🔴 Short: Win ${pct(model.short.winRate, 1)} | Exp ${signed(model.short.expectancy, 3)} | Net ${signed(model.short.net, 2)}\n`;
  m += `🧬 Güçlü DNA: ${bucketSatiri(model.dna.guclu)}\n`;
  m += `⚠️ Riskli DNA: ${bucketSatiri(model.dna.riskli)}\n`;
  m += dnaProfitRanking.telegramText(model.dnaRanking, { limit: 2 });
  m += dnaFilterSimulator.telegramText(model.dnaFilterSimulation, { limit: 2 });
  if (ayarlar.confidenceEngineV2Aktif !== false) m += confidenceEngineV2.telegramText(model.confidenceV2, { limit: 2 });
  if (ayarlar.dnaHeatMapAktif !== false) m += dnaHeatMap.telegramText(model.dnaHeatMap);
  if (ayarlar.intelligenceDashboardAktif !== false) {
    m += intelligenceDashboard.telegramText(model.intelligenceDashboard, {
      limit: Math.max(1, num(ayarlar.intelligenceDashboardTopAday || 3))
    });
    if (ayarlar.performanceValidationAktif !== false) m += performanceValidation.telegramText(model.performanceValidation);
  } else {
    if (ayarlar.directionIntelligenceAktif !== false) m += directionIntelligence.telegramText(model.directionIntelligence, { limit: 3 });
    if (ayarlar.dnaEvolutionAktif !== false) m += dnaEvolution.telegramText(model.dnaEvolution, { limit: Math.max(1, num(ayarlar.dnaEvolutionTopAday || 3)) });
    if (ayarlar.agrosConsensusAktif !== false) m += agrosConsensus.telegramText(model.agrosConsensus, { limit: Math.max(1, num(ayarlar.agrosConsensusTopAday || 3)) });
    if (ayarlar.consensusValidationAktif !== false) m += consensusValidation.telegramText(model.consensusValidation);
  }
  // DNA League raporu Telegram güvenilirliği için 2_rapor.js tarafından ayrı mesaj olarak gönderilir.
  m += `\n`;
  m += `🎓 Öğrenme: ${model.learningScore.yeterliDna}/${model.learningScore.toplamDna} DNA | Kapsam ${pct(model.learningScore.kapsama, 1)} | İlerleme ${pct(model.learningScore.progress, 1)}`;
  return m;
}

module.exports = {
  buildLearningValidationModel,
  telegramOzetMetni,
  floatingPnl
};
