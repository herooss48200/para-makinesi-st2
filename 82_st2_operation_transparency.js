'use strict';
/**
 * AGROS ST2 v6.9.0 — FINAL OPERATION TRANSPARENCY
 * Reporting-only: Trade Engine, entry, stop, BE and exit mathematics are unchanged.
 */
const ayarlar = require('./ayarlar.js');
const premierQuality = require('./83_st2_premier_quality_score.js');

const VERSION = 'v6.10.9-FINAL-ENTRY-EXIT-BINDING-NET-PROFIT';
function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function html(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function signed(v, digits = 4) { const x = n(v); return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`; }
function pct(v, digits = 2) { const x = n(v); return `${x >= 0 ? '+' : ''}%${x.toFixed(digits)}`; }
function price(v, digits = 6) { const x = n(v, NaN); return Number.isFinite(x) ? x.toFixed(Math.max(0, digits)) : 'YOK'; }
function compactEvidenceValue(v, digits = 4) { const x = Number(v); return Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(digits)}` : 'YOK'; }
function resultLabel(outcome) { return ({ TP: 'KÂRLI', SL: 'ZARARLI', BE: 'BAŞABAŞ' })[String(outcome || '').toUpperCase()] || String(outcome || 'BELİRSİZ'); }
function timeText(v) {
  if (!v) return 'YOK';
  const d = new Date(v); if (Number.isNaN(d.getTime())) return 'YOK';
  try { return d.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch (_) { return d.toISOString().slice(11, 19); }
}
function entrySource(pos) {
  const gate = pos?.girisAnalizi?.historicalEntryGate || {};
  return pos?.renkoPremierDecision?.source || gate?.decision?.source || gate?.evidence?.source || 'VARSAYILAN/GÜVENLİ BAŞLANGIÇ';
}
function contextLines(pos) {
  const snap = pos?.blackboxAcilis || {};
  return {
    btc: snap?.uyum?.btc?.metin || 'YOK', coin: snap?.uyum?.coin?.metin || 'YOK',
    total: snap?.uyum?.toplam?.metin || 'YOK',
    bb: snap?.coin?.bollinger?.bolge || pos?.girisAnalizi?.renkoBbState || 'YOK'
  };
}
function entryEvidence(pos) {
  const d = pos?.renkoPremierDecision || pos?.girisAnalizi?.historicalEntryGate?.decision || {};
  const e = pos?.girisAnalizi?.historicalEntryGate?.evidence || {};
  const historical = d?.historical || e?.historical || {};
  const live = d?.live || e?.live || {};
  return {
    samples: n(d.closed, n(d.historicalN, n(e.n, n(historical.n, n(live.n))))),
    pf: n(d.pf, n(e.pf, n(historical.pf, n(live.pf, NaN)))),
    expectancy: n(d.expectancy, n(e.expectancy, n(historical.expectancy, n(live.expectancy, NaN)))),
    net: n(d.net, n(e.net, n(historical.net, n(live.net, NaN)))),
    reason: d.reason || d.decision?.reason || e.reason || 'ENTRY_REPLAY_KANITI_YOK'
  };
}
function exitEvidence(pos) {
  const e = pos?.executionExitAssignment || {};
  const entry = entryEvidence(pos);
  const samples = n(e.samples, n(e.sampleCount));
  const ready = e.ready === true || e.activeForPosition === true;
  let reason = e.reason || (samples > 0 ? 'EXIT_REPLAY_ATAMASI_VAR' : 'EXIT_FALLBACK_N0');
  const normalizedReason = String(reason).toLocaleUpperCase('tr-TR').replace(/İ/g, 'I');
  if (!ready && entry.samples > 0 && (normalizedReason.includes('ENTRY REPLAY KANITI YOK') || normalizedReason.includes('ENTRY_REPLAY_KANITI_YOK'))) {
    reason = 'Giriş kanıtlı; kendi LAB Exit doğrulanana kadar güvenli mevcut kademe';
  }
  return {
    ready, status: ready ? 'AKTİF ATAMA' : 'FALLBACK', samples,
    label: e.label || e.algorithmLabel || 'Mevcut Kademe Sistemi',
    beatRate: n(e.beatRate, NaN), profitFactor: n(e.profitFactor, n(e.pf, NaN)),
    netUsdt: n(e.netUsdt, n(e.net, NaN)), reason
  };
}
function takeoverReplayEvidence(pos) {
  const a = pos?.renkoExitAssignment || {};
  const samples = n(a.profileSamples);
  const source = a.takeoverSource || 'SAFE_DEFAULT';
  const active = pos?.renkoExitActivated === true || String(a.status || '').toUpperCase() === 'ACTIVE';
  const assigned = samples > 0;
  return {
    samples, confidence: n(a.profileConfidence), source, active, assigned,
    status: active
      ? (String(a.liveExitMode || '').toUpperCase() === 'SAFE_COMMISSION_BRICK_TRAIL' ? 'RENKO TUĞLA KÂR TAKİBİ DEVREDE' : 'TAKEOVER AKTİF / ATR KÂR TAKİBİ DEVREDE')
      : (assigned ? (String(a.liveExitMode || '').toUpperCase() === 'SAFE_COMMISSION_BRICK_TRAIL' ? 'RENKO TUĞLA PROFİLİ ATANDI / KOMİSYON GÜVENLİ EŞİK BEKLENİYOR' : 'TAKEOVER PROFİLİ ATANDI / EŞİK BEKLENİYOR') : 'KÂR TAKİP REPLAY N0 / SAFE DEFAULT'),
    reason: assigned ? (source === 'ONLINE_LEARNED_PROFILE' ? 'TAKEOVER_REPLAY_LEARNED_PROFILE' : source) : 'TAKEOVER_REPLAY_N0_SAFE_DEFAULT',
    takeoverPct: n(a.assignedTakeoverPct, NaN), atrMultiplier: n(a.assignedAtrMultiplier, NaN),
    captureRatio: n(a.assignedCaptureRatio, NaN), safeFloorPct: n(a.assignedSafeFloorPct, NaN)
  };
}
function premierScoreEvidence(pos) {
  const q = pos?.renkoPremierDecision?.premierScore || pos?.labPremierDecision?.premierScore || pos?.girisAnalizi?.historicalEntryGate?.premierScore || {};
  return {
    score: n(q.score), threshold: n(q.threshold), rank: n(q.rank), cohortSize: n(q.cohortSize),
    selected: q.selected === true, explanation: q.explanation || q.reason || pos?.renkoPremierDecision?.reason || 'PREMIER_SCORE_KANITI_YOK',
    components: premierQuality.componentText(q)
  };
}
function plan(pos) {
  const a = pos?.renkoExitAssignment || {};
  return {
    stopPct: n(ayarlar.sabitStopYuzdesi, 1.5), beTriggerPct: n(pos?.labBeTetikYuzde, n(ayarlar.breakevenTetikYuzde, 0.25)),
    beBufferPct: n(pos?.labBeTamponYuzde, n(ayarlar.breakevenTamponYuzde, 0.05)),
    takeoverPct: n(a.assignedTakeoverPct, NaN), safeFloorPct: n(a.assignedSafeFloorPct, NaN), trailBricks: n(a.assignedTrailBricks, NaN), liveMode: a.liveExitMode || 'SAFE_COMMISSION_BRICK_TRAIL',
    atrMultiplier: n(a.assignedAtrMultiplier, NaN), captureRatio: n(a.assignedCaptureRatio, NaN),
    profileSamples: n(a.profileSamples), source: a.takeoverSource || 'GÜVENLİ BAŞLANGIÇ PROFİLİ'
  };
}
function openingText(pos, options = {}) {
  const digits = Number.isInteger(options.pricePrecision) ? options.pricePrecision : 6;
  const ga = pos?.girisAnalizi || {}; const p = plan(pos); const ctx = contextLines(pos);
  const entry = entryEvidence(pos); const exit = exitEvidence(pos); const takeover = takeoverReplayEvidence(pos); const quality = premierScoreEvidence(pos);
  const brick = n(pos?.renkoPremierDecision?.activeBrick, n(ga.renkoEntryBrickDistance, n(ayarlar.renkoGirisVarsayilanTugla, 0.75)));
  const sourceText = entrySource(pos);
  const learned = entry.samples > 0 && !/VARSAYILAN|GÜVENLİ|SAFE_DEFAULT|KANITI_YOK|N0/i.test(`${sourceText}|${entry.reason}`);
  const scorePremier = pos?.renkoPremierDecision?.premier === true || String(pos?.premierTrackAtOpen || pos?.labPremierDecision?.premierTrack || '').toUpperCase() === 'PREMIER_SCORE_RANKED';
  const league = pos?.liveShadowObservation === true || pos?.leagueShadowOnly === true ? 'SHADOW ÖĞRENME' : (scorePremier ? 'PREMIER' : 'SHADOW');
  const transition = pos?.labPremierDecision?.scoreTransition || null;
  const transitionText = transition ? `${transition.from} → ${transition.to}${transition.changed ? ' (DEĞİŞTİ)' : ' (KORUNDU)'}` : 'İLK SCORE KARARI';
  const mode = options.real === true ? 'GERÇEK' : 'SANAL';
  const leagueIcon = league === 'PREMIER' ? '🏆' : '👻';
  const execution = pos?.gercekEmirYurutme || {};
  const entryOrder = execution?.entryOrder || pos?.girisEmriCevabi || {};
  const protections = execution?.protections || {};
  const stop = protections?.stop || {};
  const takeProfit = protections?.takeProfit || {};
  const actualQty = n(pos?.miktar, n(entryOrder?.executedQty));
  const actualPrice = n(pos?.girisFiyati, n(entryOrder?.avgPrice));
  const actualNotional = actualQty * actualPrice;
  const protectionReady = options.real === true && stop && takeProfit
    && (stop.algoId || stop.clientAlgoId) && (takeProfit.algoId || takeProfit.clientAlgoId);
  const realProtectionBlock = options.real === true
    ? `\n\n🛡️ <b>BİNANCE KORUMA ${protectionReady ? 'DOĞRULANDI' : 'KANITI EKSİK'}</b>\n` +
      `${entryOrder?.status === 'FILLED' || actualQty > 0 ? '✅' : '⚠️'} Giriş ${html(entryOrder?.status || 'FILL MUTABAKATI')} | Qty ${actualQty || 'YOK'} | Ort. ${price(actualPrice, digits)}\n` +
      `${stop?.algoId || stop?.clientAlgoId ? '✅' : '⚠️'} STOP_MARKET ${stop?.algoId || stop?.clientAlgoId ? 'aktif' : 'kanıtsız'} | ${price(stop?.triggerPrice, digits)} | ${html(stop?.algoId || stop?.clientAlgoId || 'ID YOK')}\n` +
      `${takeProfit?.algoId || takeProfit?.clientAlgoId ? '✅' : '⚠️'} TAKE_PROFIT_MARKET ${takeProfit?.algoId || takeProfit?.clientAlgoId ? 'aktif' : 'kanıtsız'} | ${price(takeProfit?.triggerPrice, digits)} | ${html(takeProfit?.algoId || takeProfit?.clientAlgoId || 'ID YOK')}\n` +
      `${protectionReady ? '✅' : '⚠️'} Koruma durumu: ${protectionReady ? 'SL_TP_ACTIVE' : 'DOĞRULAMA BEKLENİYOR'} | Gerçek notional ${actualNotional > 0 ? actualNotional.toFixed(4) : 'YOK'} USDT`
    : '';
  return `🚀 <b>ST2 ${mode} POZİSYON AÇILDI</b>\n\n` +
    `🔀 <b>${html(pos?.sym)} ${html(pos?.yon)}</b> | ${leagueIcon} <b>${league}</b>\n` +
    `🪪 ${html(pos?.dnaLabel || 'DNA #YOK')} | ${html(pos?.labDnaLabel || 'LAB #YOK')} | ${html(pos?.fullDnaLabel || 'FULL #YOK')}\n` +
    `⭐ Premier Score: <b>${quality.score.toFixed(1)}/${quality.threshold.toFixed(1)}</b> | Sıra #${quality.rank}/${quality.cohortSize}\n` +
    `🔄 Score geçişi: ${html(transitionText)}\n` +
    `🧾 ${html(quality.explanation)}\n` +
    `📐 ${html(quality.components)}\n\n` +
    `🚪 <b>GİRİŞ KARARI / ENTRY REPLAY</b>\n` +
    `Giriş seviyesi: <b>${brick.toFixed(2)} tuğla</b> | ${learned ? 'Entry Evolution öğrenilmiş atama' : 'Varsayılan/güvenli giriş'}\n` +
    `Seçim kaynağı: ${html(entrySource(pos))}\n` +
    `Giriş kanıtı: N${entry.samples} | PF ${Number.isFinite(entry.pf) ? entry.pf.toFixed(2) : 'YOK'} | Exp ${compactEvidenceValue(entry.expectancy)} | Net ${compactEvidenceValue(entry.net)}\n` +
    `Neden: ${html(entry.reason)} | Referans ${price(ga.referansSeviye, digits)} → Tetik ${price(ga.tetikFiyati, digits)} → Giriş ${price(pos?.girisFiyati, digits)}\n\n` +
    `🌍 <b>AÇILIŞ BAĞLAMI</b>\nBTC ${html(ctx.btc)} | Coin ${html(ctx.coin)} | Toplam ${html(ctx.total)} | BB ${html(ctx.bb)}\n\n` +
    `🧪 <b>EXIT REPLAY</b>\n` +
    `Exit replay kanıtı: ${exit.status} | N${exit.samples} | Beat ${Number.isFinite(exit.beatRate) ? `%${exit.beatRate.toFixed(1)}` : 'YOK'} | PF ${Number.isFinite(exit.profitFactor) ? exit.profitFactor.toFixed(2) : 'YOK'} | Net ${compactEvidenceValue(exit.netUsdt)}\n` +
    `Exit planı: ${html(exit.label)} | Neden: ${html(exit.reason)}\n\n` +
    `🧬 <b>TAKEOVER REPLAY</b>\n` +
    `${html(takeover.status)} | N${takeover.samples} | Güven %${(takeover.confidence * 100).toFixed(1)} | ${html(takeover.reason)}\n` +
    `Takeover: ${Number.isFinite(p.takeoverPct) ? `+%${p.takeoverPct.toFixed(2)}` : 'YOK'} | ATR ${Number.isFinite(p.atrMultiplier) ? `${p.atrMultiplier.toFixed(2)}×` : 'YOK'} | MFE %${Number.isFinite(p.captureRatio) ? (p.captureRatio * 100).toFixed(0) : 'YOK'}\n\n` +
    `🛡️ <b>AÇILIŞ YÖNETİM PLANI</b>\n` +
    `Başlangıç SL ${price(pos?.sl, digits)} (-%${p.stopPct.toFixed(2)}) | Güvenlik TP ${price(pos?.tp, digits)} | K0 → BE +%${p.beTriggerPct.toFixed(2)}\n` +
    `🔒 <b>SABİTLENENLER</b>: Giriş, başlangıç risk profili ve atanan replay profilleri kapanana kadar değişmez.\n` +
    `🔄 <b>DİNAMİK ÇALIŞACAKLAR</b>: Renko zirvesi, öğrenilmiş tuğla takip mesafesi ve gerçekleşen kapanış fiyatı; ATR/MFE yalnız bilimsel gölge replay.` +
    realProtectionBlock;
}
function timelineSummary(pos, digits = 6) {
  const events = Array.isArray(pos?.renkoProtectionTimeline) ? pos.renkoProtectionTimeline : [];
  const takeover = events.find(e => ['TAKEOVER_ACTIVE','BRICK_TRAIL_ACTIVE'].includes(e?.type));
  const peaks = events.filter(e => e?.type === 'NEW_PEAK'); const stops = events.filter(e => e?.type === 'STOP_MOVED');
  const lines = [`${timeText(pos?.acilisZamani)} — K0 başlangıç koruması`];
  if (pos?.breakevenAktif === true) lines.push(`${timeText(pos?.breakevenAktifAt || pos?.breakevenZamani)} — K1 BE/BE+`);
  if (takeover) lines.push(`${timeText(takeover.at)} — K2 Takeover | ${price(takeover.price, digits)} | ${pct(takeover.profitPct, 2)}`);
  if (peaks.length) { const x = peaks.at(-1); lines.push(`${timeText(x.at)} — MFE zirvesi ${pct(x.peakProfitPct, 3)}`); }
  if (stops.length) { const x = stops.at(-1); lines.push(`${timeText(x.at)} — Son dinamik stop ${price(x.stop, digits)} | Güncelleme ${stops.length}`); }
  if (!takeover) lines.push('Takeover eşiğine ulaşılmadı; K0/K1 yönetiminde kapandı.');
  return { lines, takeover, peaks, stops };
}
function closingText(pos, ctx = {}) {
  const digits = Number.isInteger(ctx.pricePrecision) ? ctx.pricePrecision : 6;
  const p = plan(pos); const tl = timelineSummary(pos, digits); const entry = entryEvidence(pos); const exit = exitEvidence(pos);
  const takeoverProof = takeoverReplayEvidence(pos); const quality = premierScoreEvidence(pos); const replay = ctx.replayValidation || null;
  const mfe = n(pos?.journey?.mfeYuzde, n(ctx.mfePct)); const mae = n(pos?.journey?.maeYuzde, n(ctx.maePct)); const move = n(ctx.fiyatKarYuzdesi);
  const capture = mfe > 0 ? Math.max(0, Math.min(999, move / mfe * 100)) : 0;
  const giveback = mfe > 0 ? Math.max(0, (mfe - move) / mfe * 100) : 0;
  const takeover = Boolean(tl.takeover || pos?.renkoExitActivated === true);
  const replayReason = ctx.replayUnavailableReason || 'EXIT_REPLAY_REASON_NOT_PROVIDED';
  const replayBlock = replay
    ? `🧪 <b>EXIT REPLAY KANITI</b>\nSeçilen ${html(replay.selectedAlgorithmLabel || exit.label)} | Gerçek ${compactEvidenceValue(replay.actualNetUsdt)} | Replay ${compactEvidenceValue(replay.selectedNetUsdt)} USDT\nFark: ${compactEvidenceValue(replay.deltaVsActualUsdt)} USDT | ${replay.selectedWouldWin ? 'REPLAY ÜSTÜN' : 'GERÇEK KADEME ÜSTÜN/EŞİT'}`
    : `🧪 <b>EXIT REPLAY KANITI</b>\nÜretilemedi: <b>${html(replayReason)}</b> | Exit ${exit.status} N${exit.samples}`;
  return `${ctx.emoji || '🏁'} <b>${html(ctx.title || 'ST2 POZİSYON KAPANDI')}</b>\n\n` +
    `🔀 <b>${html(pos?.sym)} ${html(pos?.yon)}</b> | 🏆 ${html(ctx.league || pos?.labLeagueAtOpen || 'YOK')}\n` +
    `⭐ Açılış Premier Score ${quality.score.toFixed(1)}/${quality.threshold.toFixed(1)} | Sıra #${quality.rank}/${quality.cohortSize}\n` +
    `⏱️ ${html(ctx.openedAtText || 'YOK')} → ${html(ctx.closedAtText || 'YOK')} | ${html(ctx.durationText || 'YOK')}\n` +
    `Giriş ${price(pos?.girisFiyati, digits)} → Çıkış ${price(ctx.exitPrice, digits)}\n\n` +
    `🚪 <b>GİRİŞ KARARI / ENTRY REPLAY</b>\nGiriş ${n(pos?.girisAnalizi?.renkoEntryBrickDistance, n(ayarlar.renkoGirisVarsayilanTugla, 0.75)).toFixed(2)} tuğla | N${entry.samples} | PF ${Number.isFinite(entry.pf) ? entry.pf.toFixed(2) : 'YOK'} | Exp ${compactEvidenceValue(entry.expectancy)}\n\n` +
    `🛡️ <b>AÇILIŞ YÖNETİM PLANI</b>\nSL -%${p.stopPct.toFixed(2)} | Takeover ${Number.isFinite(p.takeoverPct) ? `+%${p.takeoverPct.toFixed(2)}` : 'YOK'} | ATR ${Number.isFinite(p.atrMultiplier) ? `${p.atrMultiplier.toFixed(2)}×` : 'YOK'} | MFE hedef ${Number.isFinite(p.captureRatio) ? `%${(p.captureRatio * 100).toFixed(0)}` : 'YOK'}\n\n` +
    `🧪 <b>EXIT REPLAY</b>\nExit ${exit.status} N${exit.samples} | ${html(exit.label)} | ${html(exit.reason)}\n\n` +
    `🧬 <b>TAKEOVER REPLAY</b>\n${html(takeoverProof.status)} | N${takeoverProof.samples} | ${html(takeoverProof.reason)}\n\n` +
    `🔄 <b>GERÇEKLEŞEN YÖNETİM</b>\n${tl.lines.map(x => `• ${x}`).join('\n')}\nTakeover: <b>${takeover ? 'EVET' : 'HAYIR'}</b> | BE/BE+: ${pos?.breakevenAktif === true ? 'EVET' : 'HAYIR'} | Stop güncelleme ${tl.stops.length}\n\n` +
    `📈 <b>FİYAT YOLU VE KORUMA</b>\nMFE ${pct(mfe, 3)} | MAE ${pct(mae, 3)} | Yakalanan ${pct(move, 3)} | MFE Capture: %${capture.toFixed(1)} | Giveback %${giveback.toFixed(1)}\n\n` +
    `${replayBlock}\n\n` +
    `🏁 <b>KAPANIŞ</b>\nSonuç <b>${html(resultLabel(ctx.outcome))}</b> | Neden ${html(ctx.reason || 'YOK')}\n` +
    `Brüt ${signed(ctx.grossPnl)} | Komisyon -${Math.abs(n(ctx.commission)).toFixed(4)} | Net <b>${signed(ctx.netPnl)} USDT</b>${ctx.shadowOnly ? ' | 👻 Üst kasa dışı' : ''}` +
    (ctx.accountingExact ? `\nGiriş komisyonu ${Math.abs(n(ctx.entryCommission)).toFixed(6)} | Çıkış komisyonu ${Math.abs(n(ctx.exitCommission)).toFixed(6)} | Muhasebe TAM` : '');
}
module.exports = { VERSION, n, plan, entrySource, entryEvidence, exitEvidence, takeoverReplayEvidence, premierScoreEvidence, openingText, timelineSummary, closingText };
