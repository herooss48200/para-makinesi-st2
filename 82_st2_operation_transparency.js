'use strict';
/**
 * AGROS ST2 v6.8.2 — OPERATION TRANSPARENCY
 * Telegram opening/closing messages explain the immutable plan and the dynamic
 * management path. This module is reporting-only and never changes Trade Engine math.
 */
const ayarlar = require('./ayarlar.js');

const VERSION = 'v6.8.2-OPERATION-TRANSPARENCY';
function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function html(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function signed(v, digits = 4) { const x = n(v); return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`; }
function pct(v, digits = 2) { const x = n(v); return `${x >= 0 ? '+' : ''}%${x.toFixed(digits)}`; }
function timeText(v) {
  if (!v) return 'YOK';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'YOK';
  try { return d.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch (_) { return d.toISOString().slice(11, 19); }
}
function price(v, digits = 6) { const x = n(v, NaN); return Number.isFinite(x) ? x.toFixed(Math.max(0, digits)) : 'YOK'; }
function resultLabel(outcome) { return ({ TP: 'KÂRLI', SL: 'ZARARLI', BE: 'BAŞABAŞ' })[String(outcome || '').toUpperCase()] || String(outcome || 'BELİRSİZ'); }
function entrySource(pos) {
  const ga = pos?.girisAnalizi || {};
  const gate = ga?.historicalEntryGate || {};
  return pos?.renkoPremierDecision?.source || gate?.decision?.source || gate?.evidence?.source || 'VARSAYILAN/GÜVENLİ BAŞLANGIÇ';
}
function contextLines(pos) {
  const snap = pos?.blackboxAcilis || {};
  const btc = snap?.uyum?.btc?.metin || 'YOK';
  const coin = snap?.uyum?.coin?.metin || 'YOK';
  const total = snap?.uyum?.toplam?.metin || 'YOK';
  const bb = snap?.coin?.bollinger?.bolge || pos?.girisAnalizi?.renkoBbState || 'YOK';
  return { btc, coin, total, bb };
}
function plan(pos) {
  const a = pos?.renkoExitAssignment || {};
  const risk = pos?.labLifecycleProfile || {};
  return {
    stopPct: n(risk.stopPct, n(ayarlar.sabitStopYuzdesi, 1.5)),
    beTriggerPct: n(risk.beTriggerPct, n(ayarlar.breakevenTetikYuzde, 0.4)),
    beBufferPct: n(risk.beBufferPct, n(ayarlar.breakevenTamponYuzde, 0.12)),
    takeoverPct: n(a.assignedTakeoverPct, NaN),
    safeFloorPct: n(a.assignedSafeFloorPct, NaN),
    atrMultiplier: n(a.assignedAtrMultiplier, NaN),
    captureRatio: n(a.assignedCaptureRatio, NaN),
    profileSamples: n(a.profileSamples),
    source: a.takeoverSource || 'GÜVENLİ BAŞLANGIÇ PROFİLİ',
    assignedAt: a.assignedAt || null
  };
}
function openingText(pos, options = {}) {
  const digits = Number.isInteger(options.pricePrecision) ? options.pricePrecision : 6;
  const ga = pos?.girisAnalizi || {};
  const p = plan(pos);
  const ctx = contextLines(pos);
  const brick = n(pos?.renkoPremierDecision?.activeBrick, n(ga.renkoEntryBrickDistance, n(ayarlar.renkoGirisVarsayilanTugla, 0.75)));
  const defaultBrick = n(ayarlar.renkoGirisVarsayilanTugla, 0.75);
  const learned = Math.abs(brick - defaultBrick) > 1e-9;
  const league = pos?.labPremierDecision?.upperLayerIncluded === true ? 'PREMIER' : 'SHADOW';
  const proof = pos?.labPremierDecision?.proofLevel || pos?.renkoPremierDecision?.reason || 'KANIT YOK';
  const exitLabel = pos?.executionExitAssignment?.label || 'Mevcut Kademe Sistemi';
  const mode = options.real === true ? 'GERÇEK' : 'SANAL';
  const stopLabel = options.real === true ? 'Borsaya iletilen başlangıç SL' : 'Başlangıç SL';
  const tpLabel = options.real === true ? 'Borsaya iletilen güvenlik TP' : 'Güvenlik/Final TP';
  const capture = Number.isFinite(p.captureRatio) ? `%${(p.captureRatio * 100).toFixed(0)}` : 'YOK';
  return `🚀 <b>ST2 ${mode} POZİSYON AÇILDI</b>\n\n` +
    `🔀 <b>${html(pos?.sym)} ${html(pos?.yon)}</b>\n` +
    `🪪 ${html(pos?.dnaLabel || pos?.realOrderReadiness?.dnaLabel || 'DNA #YOK')} | ${html(pos?.labDnaLabel || 'LAB #YOK')} | ${html(pos?.fullDnaLabel || 'FULL #YOK')}\n` +
    `🏆 Lig: <b>${league}</b> | Kanıt: ${html(proof)}\n\n` +
    `🚪 <b>GİRİŞ KARARI</b>\n` +
    `Giriş seviyesi: <b>${brick.toFixed(2)} tuğla</b> | ${learned ? 'Entry Evolution öğrenilmiş atama' : 'Varsayılan/güvenli giriş'}\n` +
    `Seçim kaynağı: ${html(entrySource(pos))}\n` +
    `Referans: ${price(ga.referansSeviye, digits)} | Tetik: ${price(ga.tetikFiyati, digits)} | Gerçek giriş: ${price(pos?.girisFiyati, digits)}\n\n` +
    `🌍 <b>AÇILIŞ BAĞLAMI</b>\n` +
    `BTC uyumu: ${html(ctx.btc)} | Coin uyumu: ${html(ctx.coin)} | Toplam: ${html(ctx.total)}\n` +
    `BB: ${html(ctx.bb)}\n\n` +
    `🛡️ <b>AÇILIŞ YÖNETİM PLANI</b>\n` +
    `${stopLabel}: ${price(pos?.sl, digits)} (%-${p.stopPct.toFixed(2)})\n` +
    `${tpLabel}: ${price(pos?.tp, digits)}\n` +
    `Başlangıç aşaması: <b>K0</b> | BE planı: +%${p.beTriggerPct.toFixed(2)} → +%${p.beBufferPct.toFixed(2)} koruma\n` +
    `Takeover: ${Number.isFinite(p.takeoverPct) ? `+%${p.takeoverPct.toFixed(2)}` : 'YOK'} | Güvenli taban: ${Number.isFinite(p.safeFloorPct) ? `+%${p.safeFloorPct.toFixed(2)}` : 'YOK'}\n` +
    `ATR takip: ${Number.isFinite(p.atrMultiplier) ? `${p.atrMultiplier.toFixed(2)}× ATR` : 'YOK'} | MFE yakalama hedefi: ${capture}\n` +
    `Exit planı: ${html(exitLabel)} | Profil kaynağı: ${html(p.source)}${p.profileSamples ? ` N${p.profileSamples}` : ''}\n\n` +
    `🔒 <b>SABİTLENENLER</b>: Giriş seçimi, başlangıç risk profili, takeover/ATR/MFE parametreleri bu pozisyon kapanana kadar değişmez.\n` +
    `🔄 <b>DİNAMİK ÇALIŞACAKLAR</b>: MFE zirvesi, ATR/MFE koruma seviyesi ve gerçek kapanış fiyatı piyasa yoluyla güncellenir.`;
}
function timelineSummary(pos, digits = 6) {
  const events = Array.isArray(pos?.renkoProtectionTimeline) ? pos.renkoProtectionTimeline : [];
  const assignment = events.find(e => e?.type === 'ASSIGNMENT');
  const takeover = events.find(e => e?.type === 'TAKEOVER_ACTIVE');
  const peaks = events.filter(e => e?.type === 'NEW_PEAK');
  const stops = events.filter(e => e?.type === 'STOP_MOVED');
  const lines = [];
  lines.push(`${timeText(pos?.acilisZamani || assignment?.at)} — K0 başlangıç koruması aktif`);
  if (pos?.breakevenAktif === true) lines.push(`${timeText(pos?.breakevenAktifAt || pos?.breakevenZamani)} — K1 BE/BE+ koruması aktif`);
  if (takeover) lines.push(`${timeText(takeover.at)} — K2 ATR + MFE takeover devraldı | Fiyat ${price(takeover.price, digits)} | Kâr ${pct(takeover.profitPct, 2)}`);
  if (peaks.length) {
    const last = peaks[peaks.length - 1];
    lines.push(`${timeText(last.at)} — Yeni MFE zirvesi | ${pct(last.peakProfitPct, 3)} | Fiyat ${price(last.price, digits)}`);
  }
  if (stops.length) {
    const first = stops[0]; const last = stops[stops.length - 1];
    lines.push(`${timeText(first.at)} — İlk dinamik stop | ${price(first.stop, digits)} | ${html(first.reasonLabel || first.reason)}`);
    if (stops.length > 1) lines.push(`${timeText(last.at)} — Son dinamik stop | ${price(last.stop, digits)} | Toplam güncelleme ${stops.length}`);
  }
  if (!takeover) lines.push(`Takeover eşiğine ulaşılmadı; işlem K0/K1 başlangıç yönetiminde kapandı.`);
  return { lines, assignment, takeover, peaks, stops };
}
function closingText(pos, ctx = {}) {
  const digits = Number.isInteger(ctx.pricePrecision) ? ctx.pricePrecision : 6;
  const p = plan(pos); const tl = timelineSummary(pos, digits);
  const mfe = n(pos?.journey?.mfeYuzde, n(ctx.mfePct, 0));
  const mae = n(pos?.journey?.maeYuzde, n(ctx.maePct, 0));
  const move = n(ctx.fiyatKarYuzdesi);
  const capture = mfe > 0 ? Math.max(0, Math.min(999, move / mfe * 100)) : 0;
  const giveback = mfe > 0 ? Math.max(0, (mfe - move) / mfe * 100) : 0;
  const takeover = tl.takeover || pos?.renkoExitActivated === true;
  const stage = pos?.renkoProtectionStage || (takeover ? 'K2' : (pos?.breakevenAktif ? 'K1' : 'K0'));
  const exitSource = pos?.renkoExitLastStopSourceLabel || ctx.reason || 'Bilinmiyor';
  return `${ctx.emoji || '🏁'} <b>${html(ctx.title || 'ST2 POZİSYON KAPANDI')}</b>\n\n` +
    `🔀 <b>${html(pos?.sym)} ${html(pos?.yon)}</b>\n` +
    `🪪 ${html(ctx.dnaLabel || pos?.dnaLabel || 'DNA #YOK')} | ${html(ctx.labDnaLabel || pos?.labDnaLabel || 'LAB #YOK')} | ${html(ctx.fullDnaLabel || pos?.fullDnaLabel || 'FULL #YOK')}\n` +
    `🏆 Açılış ligi: ${html(ctx.league || pos?.labLeagueAtOpen || 'YOK')} | Kanıt: ${html(ctx.proof || pos?.labProofLevelAtOpen || 'YOK')}\n\n` +
    `⏱️ <b>İŞLEM</b>\n` +
    `Açılış: ${html(ctx.openedAtText || 'YOK')} | Kapanış: ${html(ctx.closedAtText || 'YOK')} | Süre: ${html(ctx.durationText || 'YOK')}\n` +
    `Giriş: ${price(pos?.girisFiyati, digits)} | Çıkış: ${price(ctx.exitPrice, digits)}\n\n` +
    `🚪 <b>GİRİŞ KARARI</b>\n` +
    `Seçilen giriş: ${n(pos?.girisAnalizi?.renkoEntryBrickDistance, n(ayarlar.renkoGirisVarsayilanTugla, 0.75)).toFixed(2)} tuğla | Kaynak: ${html(entrySource(pos))}\n\n` +
    `🛡️ <b>AÇILIŞ YÖNETİM PLANI</b>\n` +
    `Başlangıç stopu: -%${p.stopPct.toFixed(2)} | Takeover: ${Number.isFinite(p.takeoverPct) ? `+%${p.takeoverPct.toFixed(2)}` : 'YOK'} | Güvenli taban: ${Number.isFinite(p.safeFloorPct) ? `+%${p.safeFloorPct.toFixed(2)}` : 'YOK'}\n` +
    `ATR: ${Number.isFinite(p.atrMultiplier) ? `${p.atrMultiplier.toFixed(2)}×` : 'YOK'} | MFE hedefi: ${Number.isFinite(p.captureRatio) ? `%${(p.captureRatio * 100).toFixed(0)}` : 'YOK'}\n\n` +
    `🔄 <b>GERÇEKLEŞEN YÖNETİM — SON AŞAMA ${html(stage)}</b>\n` +
    tl.lines.map(x => `• ${x}`).join('\n') + `\n` +
    `Takeover: <b>${takeover ? 'EVET' : 'HAYIR'}</b> | BE/BE+: ${pos?.breakevenAktif === true ? 'EVET' : 'HAYIR'} | Stop güncelleme: ${tl.stops.length}\n` +
    `Kapanış yönetim kaynağı: ${html(exitSource)}\n\n` +
    `📈 <b>FİYAT YOLU VE KORUMA</b>\n` +
    `MFE: ${pct(mfe, 3)} | MAE: ${pct(mae, 3)} | Yakalanan hareket: ${pct(move, 3)}\n` +
    `MFE Capture: %${capture.toFixed(1)} | Geri verilen kâr: %${giveback.toFixed(1)}\n\n` +
    `🏁 <b>KAPANIŞ</b>\n` +
    `Sonuç: <b>${html(resultLabel(ctx.outcome))}</b> | Ana neden: ${html(ctx.reason || 'YOK')}\n` +
    `Brüt PNL: ${signed(ctx.grossPnl)} USDT | Komisyon: -${Math.abs(n(ctx.commission)).toFixed(4)} USDT | Net PNL: <b>${signed(ctx.netPnl)} USDT</b>${ctx.shadowOnly ? ' | 👻 Üst kasa dışı' : ''}`;
}
module.exports = { VERSION, n, plan, entrySource, openingText, timelineSummary, closingText };
