'use strict';
require('dotenv').config();
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');
const versiyon = require('./versiyon.js');
const realExecution = require('./85_st2_real_order_execution.js');
const haFormation = require('./77_st2_ha_formation_intelligence.js');

let raporZinciriCalisiyor = false;
let raporTekrarIstegi = false;
let raporTekrarOneCikar = false;

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function yon(p) { return String(p?.yon || p?.side || p?.direction || '').toUpperCase(); }
function sym(p) { return p?.sym || p?.symbol || p?.sembol || 'BILINMIYOR'; }
function entry(p) { return n(p?.girisFiyati || p?.entryPrice); }
function strategyLane(p) {
  const raw = String(p?.strategyLane || p?.entryStrategy || p?.girisAnalizi?.strategyLane || p?.girisAnalizi?.entryStrategy || 'ST2_RENKO').toUpperCase();
  return raw.includes('HEIKIN') || raw === 'HA' ? 'HEIKIN_ASHI' : 'RENKO';
}
function livePrice(p) { return n(h.state.canliFiyatlar?.[sym(p)] || p?.sonFiyat || p?.currentPrice || entry(p)); }
function pnlPct(p) {
  const e = entry(p), px = livePrice(p), side = yon(p);
  if (!(e > 0 && px > 0)) return 0;
  return side === 'SHORT' ? ((e - px) / e) * 100 : ((px - e) / e) * 100;
}
function stopPct(p) {
  const e = entry(p), sl = n(p?.realStopLastAppliedTrigger || p?.sl || p?.stopLoss || p?.stop), side = yon(p);
  if (!(e > 0 && sl > 0)) return null;
  return side === 'SHORT' ? ((e - sl) / e) * 100 : ((sl - e) / e) * 100;
}
function posLine(p) {
  const profit = pnlPct(p); const sp = stopPct(p);
  const mode = String(p?.girisAnalizi?.entryMode || p?.entryMode || 'DIRECT').toUpperCase();
  const lane = strategyLane(p);
  const q = p?.renkoPremierDecision?.premierScore || p?.labPremierDecision?.premierScore || {};
  let out = `${sym(p)} ${yon(p)} | ${lane === 'HEIKIN_ASHI' ? 'HA' : 'RENKO'}-${mode} | Anlık ${profit >= 0 ? '+' : ''}%${profit.toFixed(2)}`;
  if (sp != null) out += ` | SL ${sp >= 0 ? '+' : ''}%${sp.toFixed(2)}`;
  if (Number.isFinite(Number(q.score))) out += ` | Skor ${n(q.score).toFixed(1)}/${n(q.threshold).toFixed(1)}`;
  return out;
}
function st2VeriSagligiOzeti() {
  const state = h.state || {};
  const warm = state.startupMarketWarmup || {};
  const health = state.sembolVeriSagligi || {};
  const audit = state.st2Renko?.audit || {};
  const selected = n(health.secilen, n(warm.toplam, (state.st2CoreUniverseSymbols || state.semboller || []).length));
  const coreSet = new Set((state.st2CoreUniverseSymbols || state.semboller || []).map(String));
  const countCore = obj => Object.keys(obj || {}).filter(k => coreSet.has(String(k))).length;
  return {
    selected,
    requested: n(ayarlar.taranacakCoinSayisi, 200),
    candles: countCore(state.yerelPusuHafizasi),
    oneMin: countCore(state.sniperMumlar),
    renkoSt: Object.entries(state.renko1mStHazirlik || {}).filter(([k,v]) => coreSet.has(String(k)) && v?.ready === true).length,
    errors: n(health.superTrendHata || warm.hata),
    scanned: n(audit.sembol),
    scanMs: n(audit.sureMs),
    processed: n(warm.islenen),
    ready: state.startupMarketReady === true
  };
}
function canliRaporMetniOlustur() {
  const list = Array.isArray(h.state.aktifPozisyonlar) ? h.state.aktifPozisyonlar : [];
  const real = list.filter(p => p?.sanal === false);
  const renkoReal = real.filter(p => strategyLane(p) === 'RENKO');
  const haReal = real.filter(p => strategyLane(p) === 'HEIKIN_ASHI');
  const race = realExecution.strategyRaceSummary();
  const renkoRace = race.lanes.RENKO || {};
  const haRace = race.lanes.HEIKIN_ASHI || {};
  const warm = h.state.startupMarketWarmup || {};
  const data = st2VeriSagligiOzeti();
  const time = typeof h.binanceTimeHealth === 'function' ? h.binanceTimeHealth() : { healthy:false, offsetMs:0 };
  const tg = typeof h.telegramKuyrukOzeti === 'function' ? h.telegramKuyrukOzeti() : { critical:0, panel:0, detail:0, transport:{} };
  const rec = h.state.st2ExchangeReconciliation || {};
  const safety = h.state.st2RealEntrySafety || {};
  const price = h.state.st2PriceRuntime || {};
  const pc = price.coverage || {};
  const pusular = Object.values(h.state.st2Renko?.pusular || {});
  const haPusular = Object.values(h.state.st2HeikinAshi?.pusular || {});
  const haAudit = h.state.st2HeikinAshi?.audit || {};
  const gate = data.ready ? 'READY' : `${String(warm.durum || 'CALISIYOR')}/${String(warm.asama || 'CORE_15M_1M_RENKO')} ${data.processed}/${data.selected}`;
  const lines = [
    `📊 AGROS ST2 CORE — ${versiyon.botSurumu}`,
    `🕒 ${new Date().toLocaleTimeString('tr-TR',{hour12:false})} | ${ayarlar.sanalEmirModu ? 'SANAL' : 'BINANCE'}`,
    `🛡️ Gerçek pozisyon ${real.length} | State ${list.length} | RENKO ${renkoReal.length}/${n(ayarlar.renkoGercekMaxAktifPozisyon,10)} | HA ${haReal.length}/${n(ayarlar.heikinAshiGercekMaxAktifPozisyon,10)}`,
    `🌐 Evren ${data.selected}/${data.requested} | Gate ${gate}`,
    `📡 15m ${data.candles}/${data.selected} | 1m ${data.oneMin}/${data.selected} | 1m Renko ST ${data.renkoSt}/${data.selected} | Hata ${data.errors} | Son tarama ${data.scanned}/${data.selected} ${(data.scanMs/1000).toFixed(1)}sn`,
    `⚙️ Saat ${time.healthy ? 'HEALTHY' : 'DEGRADED'} ${n(time.offsetMs)>=0?'+':''}${n(time.offsetMs)}ms | Fiyat ${String(price.source || 'BEKLIYOR')} ${n(pc.fresh)}/${n(pc.total)} | TG ${tg.transport?.nativeCircuitOpen ? 'NATIVE-CIRCUIT' : 'OK'} | Kuyruk ${n(tg.critical)}/${n(tg.panel)}/${n(tg.detail)}`,
    `🔁 Mutabakat ${String(rec.status || 'BEKLIYOR')} | Gerçek Entry ${ayarlar.sanalEmirModu ? 'SANAL' : (safety.ready === true && data.ready ? 'READY' : `FAIL-CLOSED/${String(!data.ready ? 'MARKET_WARMUP_NOT_READY' : (safety.reason || 'NOT_READY'))}`)}`,
    `🎯 Pusu RENKO ${pusular.length} (L${pusular.filter(x=>yon(x)==='LONG').length}/S${pusular.filter(x=>yon(x)==='SHORT').length}) | HA ${haPusular.length} (L${haPusular.filter(x=>yon(x)==='LONG').length}/S${haPusular.filter(x=>yon(x)==='SHORT').length})`,
    `🏁 RENKO Sayaç: Aç ${n(renkoRace.opened)} | Kap ${n(renkoRace.closed)} | W/L/BE ${n(renkoRace.wins)}/${n(renkoRace.losses)}/${n(renkoRace.be)} | WR %${n(renkoRace.wr).toFixed(1)} | Net ${n(renkoRace.netPnl)>=0?'+':''}${n(renkoRace.netPnl).toFixed(4)} | Kom ${n(renkoRace.commission).toFixed(4)}`,
    `🏁 HA Sayaç: Aç ${n(haRace.opened)} | Kap ${n(haRace.closed)} | W/L/BE ${n(haRace.wins)}/${n(haRace.losses)}/${n(haRace.be)} | WR %${n(haRace.wr).toFixed(1)} | Net ${n(haRace.netPnl)>=0?'+':''}${n(haRace.netPnl).toFixed(4)} | Kom ${n(haRace.commission).toFixed(4)}`,
    `🧠 RENKO: 15m ATR-Renko/BB → Entry Evolution → CONFIRMED → 1m Renko ST → Premier/N5 → REAL`,
    `🕯️ HA: KAPANMIŞ 15m HA/BB pusu → ≤${n(ayarlar.heikinAshiMaxPusuBeklemeMum,3)} kapanmış mum → KAPANMIŞ renk teyit → yalnız SONRAKİ 15m mumda gövde kırılımı → Formasyon → REAL/VETO`,
    `🧩 HA Formasyon: ${ayarlar.heikinAshiFormasyonVetoAktif===false?'SHADOW':'LIVE VETO'} | Veto ${n(haAudit.formationVeto)} | Pozisyonlu sembol temiz ${n(haAudit.occupiedDrop)}`,
    `🛡️ Ortak ekonomi: SL -%${n(ayarlar.sabitStopYuzdesi).toFixed(2)} | +%${n(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde).toFixed(2)} → SL +%${n(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde).toFixed(2)} | sonra %${n(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde).toFixed(2)} geriden / ${n(ayarlar.confirmedYuzdeselEkonomiAdimYuzde).toFixed(2)} puan`,
  ];
  if (real.length) {
    lines.push('', `💼 GERÇEK POZİSYONLAR (${Math.min(real.length,10)}/${real.length})`);
    lines.push(...real.slice(0,10).map(posLine));
  }
  if (haPusular.length) {
    const sample=haPusular.slice(0,6);
    lines.push('', `🕯️ HA AKTİF PUSU (${sample.length}/${haPusular.length})`);
    lines.push(...sample.map(p => `${sym(p)} ${yon(p)} | ${p.confirmation?'SONRAKİ MUM GÖVDE BEKLİYOR':'KAPANMIŞ TEYİT BEKLİYOR'} ${n(p.gecenMumSayisi)}/${n(ayarlar.heikinAshiMaxPusuBeklemeMum,3)} | ${haFormation.shortSummary(p.formationNow||p.formationAtPusu)}`));
    if (haPusular.length>sample.length) lines.push(`… +${haPusular.length-sample.length} HA pusu`);
  }
  return lines.join('\n').slice(0, 3900);
}
const minimalCanliRaporMetniOlustur = canliRaporMetniOlustur;
async function raporGonder(oneCikar = false) {
  if (raporZinciriCalisiyor) { raporTekrarIstegi = true; raporTekrarOneCikar ||= oneCikar; return false; }
  raporZinciriCalisiyor = true;
  try {
    const message = canliRaporMetniOlustur();
    if (ayarlar.canliRaporAktif) Promise.resolve(h.telegramCanliRaporGuncelle(message, oneCikar)).catch(e=>console.error(`⚠️ [CORE PANEL] ${e.message}`));
    else if (oneCikar) Promise.resolve(h.telegramMesajGonder(message)).catch(()=>{});
    return true;
  } finally {
    raporZinciriCalisiyor = false;
    if (raporTekrarIstegi) {
      const once = raporTekrarOneCikar; raporTekrarIstegi = false; raporTekrarOneCikar = false;
      setTimeout(()=>raporGonder(once).catch(()=>{}),250).unref?.();
    }
  }
}
function raporTalepEt(oneCikar = false) { setImmediate(()=>raporGonder(oneCikar).catch(()=>{})); }
module.exports = { raporGonder, raporTalepEt, canliRaporMetniOlustur, minimalCanliRaporMetniOlustur };
