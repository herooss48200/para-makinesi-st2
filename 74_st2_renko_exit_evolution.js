'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');

const VERSION = 'v6.7.0-ONLINE-ADAPTIVE-ATR-CAPTURE';
const DATA_DIR = process.env.AGROS_DATA_DIR
  ? path.resolve(process.env.AGROS_DATA_DIR)
  : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'st2-renko-exit-evolution.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;
const LEDGER_FILE = path.join(DATA_DIR, 'st2-renko-exit-evolution-ledger.jsonl');

const CANDIDATES = () => (ayarlar.renkoCikisAdayTugla || [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
  .map(Number).filter(x => x > 0).sort((a, b) => a - b);
const TAKEOVER_CANDIDATES = () => (ayarlar.renkoDevralmaAdayKarYuzde || [0.25, 0.40, 0.50, 0.75, 1.00, 1.25])
  .map(Number).filter(x => x >= 0).sort((a, b) => a - b);
const ATR_CANDIDATES = () => (ayarlar.renkoCikisAtrCarpanAdaylari || ayarlar.exitReplayAtrMultipliers || [1.0, 1.25, 1.5, 1.75, 2.0, 2.5])
  .map(Number).filter(x => x > 0).sort((a, b) => a - b);
const CAPTURE_CANDIDATES = () => (ayarlar.renkoCikisMfeYakalamaAdaylari || [0.50, 0.60, 0.70, 0.80, 0.90])
  .map(Number).filter(x => x > 0 && x < 1).sort((a, b) => a - b);
const DEFAULT_TRAIL = () => Number(ayarlar.renkoCikisVarsayilanTugla || 1);
const DEFAULT_ATR = () => Number(ayarlar.renkoCikisVarsayilanAtrCarpani || 1.5);
const DEFAULT_CAPTURE = () => Number(ayarlar.renkoCikisVarsayilanMfeYakalamaOrani || ayarlar.renkoCikisMinMfeKorumaOrani || 0.60);
const DEFAULT_TAKEOVER = () => Number(ayarlar.renkoCikisMfeKorumaTetikYuzde || 0.40);
const DEFAULT_SAFE_FLOOR = () => Math.max(0, Number(ayarlar.renkoCikisGuvenliKarTabaniYuzde || 0.10));

function n(v, d = 0) { v = Number(v); return Number.isFinite(v) ? v : d; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, n(v, min))); }
function blend(from, to, weight) {
  const w = clamp(weight, 0, 1);
  return Math.round((n(from) + (n(to) - n(from)) * w) * 10000) / 10000;
}
function key(y, p) { return `${String(y || '').toUpperCase()}|${String(p || 'UNKNOWN').toUpperCase()}`; }
function candidateKey(takeoverPct, atrMultiplier, captureRatio) {
  return `${n(takeoverPct).toFixed(2)}|${n(atrMultiplier).toFixed(2)}|${n(captureRatio).toFixed(2)}`;
}
function blankMetric() {
  return {
    samples: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0,
    mfeCaptureSum: 0, givebackSum: 0, missedProfitSum: 0,
    emaNet: 0, emaCapture: 0, emaGiveback: 0
  };
}
function blankAudit() {
  return {
    samples: 0, mfeSum: 0, exitPctSum: 0, captureSum: 0, givebackSum: 0,
    activationDelayMsSum: 0, activationDelaySamples: 0,
    preTakeoverMfeSum: 0, postTakeoverMfeSum: 0, reasonCounts: {}
  };
}
function blank() {
  return {
    version: VERSION, updatedAt: null, profiles: {}, processedIds: {},
    health: { duplicate: 0, restartGap: 0, manualExcluded: 0, notActivated: 0, saveErrors: 0, loadErrors: 0 }
  };
}
function ensure() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function normalizeProfile(p = {}, patternKey = 'UNKNOWN|UNKNOWN') {
  return {
    patternKey,
    closed: n(p.closed),
    activeTrail: n(p.activeTrail, DEFAULT_TRAIL()),
    activeTakeoverPct: p.activeTakeoverPct == null ? null : n(p.activeTakeoverPct),
    activeAtrMultiplier: p.activeAtrMultiplier == null ? null : n(p.activeAtrMultiplier),
    activeCaptureRatio: p.activeCaptureRatio == null ? null : n(p.activeCaptureRatio),
    activeSafeFloorPct: p.activeSafeFloorPct == null ? null : n(p.activeSafeFloorPct),
    activeProfileUpdatedAt: p.activeProfileUpdatedAt || null,
    candidates: p.candidates || {},
    takeoverCandidates: p.takeoverCandidates || {},
    jointCandidates: p.jointCandidates || {},
    onlineCandidates: p.onlineCandidates || {},
    audit: { ...blankAudit(), ...(p.audit || {}), reasonCounts: p.audit?.reasonCounts || {} },
    promotion: p.promotion || {},
    online: p.online || {}
  };
}
function mergeState(raw) {
  const base = blank();
  const out = { ...base, ...(raw || {}) };
  out.health = { ...base.health, ...(raw?.health || {}) };
  out.processedIds = raw?.processedIds || {};
  out.profiles = {};
  for (const [k, p] of Object.entries(raw?.profiles || {})) out.profiles[k] = normalizeProfile(p, k);
  return out;
}
function read() {
  ensure();
  try { return mergeState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); }
  catch (_) {
    try { return mergeState(JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'))); }
    catch (_) { return blank(); }
  }
}
function write(s) {
  ensure();
  try {
    if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, BACKUP_FILE);
    s.version = VERSION;
    s.updatedAt = new Date().toISOString();
    io.writeJsonAtomic(STATE_FILE, s);
    return s;
  } catch (e) {
    s.health.saveErrors = n(s.health?.saveErrors) + 1;
    throw e;
  }
}
function metric(m) {
  const samples = n(m?.samples), loss = n(m?.grossLoss);
  return {
    ...blankMetric(), ...(m || {}),
    wr: samples ? 100 * n(m?.tp) / samples : 0,
    pf: loss > 0 ? n(m?.grossProfit) / loss : (n(m?.grossProfit) > 0 ? 999 : 0),
    expectancy: samples ? n(m?.net) / samples : 0,
    mfeCapture: samples ? n(m?.mfeCaptureSum) / samples : 0,
    avgGiveback: samples ? n(m?.givebackSum) / samples : 0,
    avgMissedProfit: samples ? n(m?.missedProfitSum) / samples : 0
  };
}
function auditMetric(a) {
  const samples = n(a?.samples);
  return {
    ...blankAudit(), ...(a || {}),
    avgMfe: samples ? n(a?.mfeSum) / samples : 0,
    avgExitPct: samples ? n(a?.exitPctSum) / samples : 0,
    avgCapture: samples ? n(a?.captureSum) / samples : 0,
    avgGiveback: samples ? n(a?.givebackSum) / samples : 0,
    avgActivationDelayMin: n(a?.activationDelaySamples) ? n(a?.activationDelayMsSum) / n(a?.activationDelaySamples) / 60000 : 0,
    avgPreTakeoverMfe: samples ? n(a?.preTakeoverMfeSum) / samples : 0,
    avgPostTakeoverMfe: samples ? n(a?.postTakeoverMfeSum) / samples : 0
  };
}
function minN() { return 1; }
function confidence(samples) {
  const prior = Math.max(1, n(ayarlar.renkoCikisOnlineGuvenOnculN, 4));
  return n(samples) / (n(samples) + prior);
}
function adaptiveScore(row) {
  const m = metric(row);
  const positiveBias = m.net > 0 ? 0.10 : 0;
  return n(m.emaNet, m.expectancy)
    + (n(m.emaCapture, m.mfeCapture) / 100) * 0.22
    - n(m.emaGiveback, m.avgGiveback) * 0.35
    + Math.min(3, m.pf) * 0.025
    + positiveBias;
}
function eligible(row) { return n(row?.samples) > 0; }
function chooseTrail(p) {
  const rows = Object.entries(p.candidates || {}).map(([x, m]) => ({ trail: n(x), ...metric(m) })).filter(eligible);
  rows.sort((a, b) => b.net - a.net || b.pf - a.pf || b.expectancy - a.expectancy || b.mfeCapture - a.mfeCapture || a.trail - b.trail);
  return rows[0] || null;
}
function chooseJoint(p) {
  const rows = Object.values(p.jointCandidates || {}).map(r => ({ ...r, ...metric(r) })).filter(eligible);
  rows.sort((a, b) => b.net - a.net || b.pf - a.pf || b.expectancy - a.expectancy || b.mfeCapture - a.mfeCapture || a.takeoverPct - b.takeoverPct || a.trail - b.trail);
  return rows[0] || null;
}
function chooseOnline(p) {
  const rows = Object.values(p.onlineCandidates || {}).map(r => ({ ...r, ...metric(r) })).filter(eligible);
  rows.sort((a, b) => adaptiveScore(b) - adaptiveScore(a)
    || b.net - a.net
    || b.mfeCapture - a.mfeCapture
    || a.avgGiveback - b.avgGiveback
    || a.takeoverPct - b.takeoverPct
    || a.atrMultiplier - b.atrMultiplier
    || b.captureRatio - a.captureRatio);
  return rows[0] || null;
}
function activeProfileFor(yon, pattern) {
  const s = read();
  const p = s.profiles[key(yon, pattern)];
  const learned = p && (p.activeTakeoverPct != null || p.activeAtrMultiplier != null || p.activeCaptureRatio != null);
  return {
    trail: n(p?.activeTrail, DEFAULT_TRAIL()),
    takeoverPct: n(p?.activeTakeoverPct, DEFAULT_TAKEOVER()),
    atrMultiplier: n(p?.activeAtrMultiplier, DEFAULT_ATR()),
    captureRatio: p?.activeCaptureRatio == null ? DEFAULT_CAPTURE() : clamp(p.activeCaptureRatio, 0.40, 0.95),
    safeFloorPct: Math.min(p?.activeSafeFloorPct == null ? DEFAULT_SAFE_FLOOR() : n(p.activeSafeFloorPct), p?.activeTakeoverPct == null ? DEFAULT_TAKEOVER() : n(p.activeTakeoverPct)),
    samples: n(p?.online?.samples, p?.closed),
    confidence: confidence(n(p?.online?.samples, p?.closed)),
    source: learned ? 'ONLINE_LEARNED_PROFILE' : 'SAFE_DEFAULT'
  };
}
function activeFor(yon, pattern) { return activeProfileFor(yon, pattern).trail; }
function addTimeline(pos, type, detail = {}) {
  if (!pos) return null;
  const now = new Date().toISOString();
  pos.renkoProtectionTimeline = Array.isArray(pos.renkoProtectionTimeline) ? pos.renkoProtectionTimeline : [];
  const last = pos.renkoProtectionTimeline.at(-1);
  const signature = JSON.stringify([type, detail?.stage, detail?.reason, detail?.stop, detail?.peakProfitPct, detail?.atrMultiplier, detail?.captureRatio]);
  if (last?.signature === signature) return last;
  const event = { at: now, type, ...detail, signature };
  pos.renkoProtectionTimeline.push(event);
  if (pos.renkoProtectionTimeline.length > 40) pos.renkoProtectionTimeline = pos.renkoProtectionTimeline.slice(-40);
  pos.renkoProtectionLastEvent = event;
  return event;
}
function assign(pos) {
  if (!pos) return null;
  if (pos.renkoExitAssignment) return pos.renkoExitAssignment;
  const ga = pos.girisAnalizi || {};
  const profile = activeProfileFor(pos.yon, ga.patternKodu);
  pos.renkoExitAssignment = {
    patternKey: key(pos.yon, ga.patternKodu),
    assignedTrailBricks: profile.trail,
    assignedTakeoverPct: profile.takeoverPct,
    assignedAtrMultiplier: profile.atrMultiplier,
    assignedCaptureRatio: profile.captureRatio,
    assignedSafeFloorPct: profile.safeFloorPct,
    profileSamples: profile.samples,
    profileConfidence: profile.confidence,
    takeoverSource: profile.source,
    assignedAt: new Date().toISOString(),
    activationMode: 'SAFE_PROFIT_THEN_ATR_AND_MFE_CAPTURE',
    status: 'WAITING_TAKEOVER',
    takeoverLearningMode: 'ONLINE_EVERY_SCIENTIFIC_CLOSE_NEW_POSITIONS_ONLY'
  };
  pos.renkoProtectionStage = 'K0';
  pos.renkoProtectionState = 'TAKEOVER_BEKLIYOR';
  addTimeline(pos, 'ASSIGNMENT', {
    stage: 'K0', takeoverPct: profile.takeoverPct, trail: profile.trail,
    atrMultiplier: profile.atrMultiplier, captureRatio: profile.captureRatio,
    confidence: profile.confidence, source: profile.source
  });
  return pos.renkoExitAssignment;
}
function firstProtectionReady(pos) {
  return pos?.breakevenAktif === true && n(pos?.korunanKarYuzdesi, n(pos?.labBeTamponYuzde, 0)) >= 0;
}
function profitPct(yon, entry, price) {
  if (!(entry > 0) || !(price > 0)) return 0;
  return yon === 'LONG' ? (price - entry) / entry * 100 : (entry - price) / entry * 100;
}
function priceFromProfitPct(yon, entry, pct) {
  if (!(entry > 0)) return null;
  return yon === 'LONG' ? entry * (1 + pct / 100) : entry * (1 - pct / 100);
}
function peakProfitPct(pos, peak) { return profitPct(pos?.yon, n(pos?.girisFiyati), n(peak)); }
function takeoverThresholdReady(pos, price) {
  const a = pos?.renkoExitAssignment || assign(pos);
  const entry = n(pos?.girisFiyati);
  if (!(entry > 0)) return firstProtectionReady(pos);
  return profitPct(pos?.yon, entry, n(price)) >= Math.max(0, n(a?.assignedTakeoverPct, DEFAULT_TAKEOVER()));
}
function latestAtrPct(pos, price) {
  const rows = pos?.execution?.pricePath || pos?.journey?.pricePath || pos?.pricePath || [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const atr = n(rows[i]?.atrPct, NaN);
    if (Number.isFinite(atr) && atr > 0) return { value: atr, source: 'LIVE_ATR_PATH' };
  }
  const box = n(pos?.girisAnalizi?.renkoBoxSize || pos?.renkoBoxSize);
  const p = n(price);
  if (box > 0 && p > 0) return { value: box / p * 100, source: 'RENKO_BOX_FALLBACK' };
  return { value: null, source: 'ATR_MISSING' };
}
function safeFloorStop(pos) {
  const a = pos?.renkoExitAssignment || assign(pos);
  const entry = n(pos?.girisFiyati);
  const pct = Math.max(0, Math.min(n(a?.assignedSafeFloorPct, DEFAULT_SAFE_FLOOR()), n(a?.assignedTakeoverPct, DEFAULT_TAKEOVER())));
  return priceFromProfitPct(pos?.yon, entry, pct);
}
function mfeProtectionStop(pos, peak) {
  const entry = n(pos?.girisFiyati);
  if (!(entry > 0) || !(peak > 0)) return null;
  const a = pos?.renkoExitAssignment || assign(pos);
  const trigger = Math.max(0, n(a?.assignedTakeoverPct, DEFAULT_TAKEOVER()));
  const ratio = clamp(a?.assignedCaptureRatio, 0.40, 0.95) || DEFAULT_CAPTURE();
  const peakPct = peakProfitPct(pos, peak);
  if (peakPct < trigger || ratio <= 0) return null;
  return priceFromProfitPct(pos?.yon, entry, peakPct * ratio);
}
function atrProtectionStop(pos, peak, price) {
  const entry = n(pos?.girisFiyati);
  if (!(entry > 0) || !(peak > 0)) return { stop: null, atrPct: null, source: 'ATR_MISSING', floorPct: null };
  const a = pos?.renkoExitAssignment || assign(pos);
  const current = latestAtrPct(pos, price);
  const previousPeakPct = n(pos?.renkoExitPeakProfitPct, -Infinity);
  const peakPct = peakProfitPct(pos, peak);
  if (peakPct >= previousPeakPct && current.value > 0) {
    pos.renkoExitPeakAtrPct = current.value;
    pos.renkoExitPeakAtrSource = current.source;
    pos.renkoExitPeakProfitPct = peakPct;
  }
  const atrPct = n(pos?.renkoExitPeakAtrPct, current.value);
  if (!(atrPct > 0)) return { stop: null, atrPct: null, source: current.source, floorPct: null };
  const multiplier = Math.max(0.25, n(a?.assignedAtrMultiplier, DEFAULT_ATR()));
  const floorPct = peakPct - atrPct * multiplier;
  return {
    stop: priceFromProfitPct(pos?.yon, entry, floorPct),
    atrPct, source: pos?.renkoExitPeakAtrSource || current.source, floorPct
  };
}
function stopSource(pos, old, safeFloor, atrStop, mfeFloor, effective) {
  const eps = Math.max(1e-12, Math.abs(n(effective)) * 1e-10);
  const rows = [
    ['MEVCUT_STOP', old], ['ILK_KAR_KORUMA', safeFloor],
    ['ATR_TAKIP', atrStop], ['MFE_KORUMA', mfeFloor]
  ].filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0);
  const hit = rows.find(([, v]) => Math.abs(Number(v) - Number(effective)) <= eps);
  return hit?.[0] || 'BILINMIYOR';
}
function sourceLabel(src) {
  return ({
    MEVCUT_STOP: 'Mevcut stop', ILK_KAR_KORUMA: 'Güvenli kâr tabanı',
    ATR_TAKIP: 'ATR trailing stopu', RENKO_TAKIP: 'Renko takip stopu',
    MFE_KORUMA: 'Öğrenilmiş MFE kâr koruma', BILINMIYOR: 'Bilinmiyor'
  })[src] || String(src || 'Bilinmiyor');
}
function update(pos, price) {
  assign(pos);
  const a = pos.renkoExitAssignment;
  const entry = n(pos?.girisFiyati);
  const pnl = profitPct(pos?.yon, entry, n(price));
  const threshold = takeoverThresholdReady(pos, price);
  if (!threshold) {
    const externalSafe = firstProtectionReady(pos);
    pos.renkoProtectionStage = externalSafe ? 'K1' : 'K0';
    pos.renkoProtectionState = externalSafe ? 'BE_AKTIF_TAKEOVER_BEKLIYOR' : 'GUVENLI_KAR_ESIGI_BEKLENIYOR';
    a.status = 'WAITING_TAKEOVER';
    return {
      active: false, changed: false, reason: 'TAKEOVER_THRESHOLD_NOT_REACHED',
      currentProfitPct: pnl, takeoverPct: n(a.assignedTakeoverPct), mfeFloor: null
    };
  }

  let justActivated = false;
  if (!pos.renkoExitActivated) {
    justActivated = true;
    pos.renkoExitActivated = true;
    pos.renkoExitActivatedAt = new Date().toISOString();
    pos.renkoExitActivationPrice = price;
    const autoSafe = safeFloorStop(pos);
    const currentStop = n(pos.sl);
    pos.renkoExitFirstProtectionStop = pos.yon === 'LONG'
      ? Math.max(currentStop, n(autoSafe, currentStop))
      : Math.min(currentStop, n(autoSafe, currentStop));
    pos.renkoExitPeak = price;
    a.status = 'ACTIVE';
    pos.renkoProtectionStage = 'K2';
    pos.renkoProtectionState = 'ATR_TAKEOVER_AKTIF';
    addTimeline(pos, 'TAKEOVER_ACTIVE', {
      stage: 'K2', price, takeoverPct: n(a.assignedTakeoverPct),
      atrMultiplier: n(a.assignedAtrMultiplier), captureRatio: n(a.assignedCaptureRatio),
      safeFloorPct: n(a.assignedSafeFloorPct), profitPct: pnl
    });
  }

  const previousPeak = n(pos.renkoExitPeak, price);
  pos.renkoExitPeak = pos.yon === 'LONG' ? Math.max(previousPeak, price) : Math.min(previousPeak, price);
  const peakPct = peakProfitPct(pos, pos.renkoExitPeak);
  if (pos.renkoExitPeak !== previousPeak) addTimeline(pos, 'NEW_PEAK', { stage: 'K2', price: pos.renkoExitPeak, peakProfitPct: peakPct });

  const atr = atrProtectionStop(pos, pos.renkoExitPeak, price);
  const mfeFloor = mfeProtectionStop(pos, pos.renkoExitPeak);
  const safeFloor = n(pos.renkoExitFirstProtectionStop, safeFloorStop(pos));
  const old = n(pos.sl);
  const atrStop = n(atr.stop, pos.yon === 'LONG' ? 0 : Number.POSITIVE_INFINITY);
  if (!(old > 0) || !(safeFloor > 0)) {
    return { active: true, justActivated, changed: false, reason: 'INVALID_STOP_INPUT', old, safeFloor, atrStop, mfeFloor };
  }

  const effective = pos.yon === 'LONG'
    ? Math.max(old, safeFloor, atrStop, n(mfeFloor, 0))
    : Math.min(old, safeFloor, atrStop, n(mfeFloor, Number.POSITIVE_INFINITY));
  if (!(effective > 0) || !Number.isFinite(effective)) {
    return { active: true, justActivated, changed: false, reason: 'INVALID_EFFECTIVE_STOP', effective, atrStop, mfeFloor };
  }

  const source = stopSource(pos, old, safeFloor, atrStop, mfeFloor, effective);
  const changed = pos.yon === 'LONG' ? effective > old : effective < old;
  if (changed) {
    pos.sl = effective;
    pos.renkoExitAppliedTrailBricks = n(a.assignedTrailBricks);
    pos.renkoExitAppliedAtrMultiplier = n(a.assignedAtrMultiplier);
    pos.renkoExitAppliedCaptureRatio = n(a.assignedCaptureRatio);
    pos.renkoExitAtrProtectionStop = atr.stop;
    pos.renkoExitMfeProtectionStop = mfeFloor;
    pos.renkoExitLastStopSource = source;
    pos.renkoExitLastStopSourceLabel = sourceLabel(source);
    pos.renkoExitLastStopUpdatedAt = new Date().toISOString();
    pos.renkoProtectionStage = 'K3';
    pos.renkoProtectionState = 'RENKO_STOP_GUNCELLENDI';
    addTimeline(pos, 'STOP_MOVED', {
      stage: 'K3', reason: source, reasonLabel: sourceLabel(source), oldStop: old, stop: effective,
      peakProfitPct: peakPct, atrPct: atr.atrPct, atrMultiplier: n(a.assignedAtrMultiplier),
      captureRatio: n(a.assignedCaptureRatio), atrSource: atr.source
    });
  } else if (pos.renkoExitLastStopUpdatedAt || pos.renkoProtectionStage === 'K3') {
    pos.renkoProtectionStage = 'K3';
    pos.renkoProtectionState = 'RENKO_STOP_KORUNUYOR';
  } else {
    pos.renkoProtectionStage = 'K2';
    pos.renkoProtectionState = 'ATR_TAKEOVER_AKTIF';
  }

  return {
    active: true, justActivated, changed, effective, atrStop: atr.stop, atrPct: atr.atrPct,
    atrSource: atr.source, mfeFloor, source, sourceLabel: sourceLabel(source), peakProfitPct: peakPct,
    trail: n(a.assignedTrailBricks), atrMultiplier: n(a.assignedAtrMultiplier),
    captureRatio: n(a.assignedCaptureRatio), takeoverPct: n(a.assignedTakeoverPct)
  };
}
function takeoverText(pos) {
  const a = pos.renkoExitAssignment || assign(pos);
  return `🏁 <b>ÖĞRENEN ATR KÂR TAKİBİ DEVREDE</b>\n\n` +
    `🔀 ${pos.sym} (${pos.yon})\n` +
    `🧩 Pattern: ${pos.girisAnalizi?.patternKodu || 'YOK'}\n` +
    `🎯 Güvenli devralma eşiği: %${n(a.assignedTakeoverPct).toFixed(2)}\n` +
    `🔒 Güvenli kâr tabanı: %${n(a.assignedSafeFloorPct).toFixed(2)}\n` +
    `📐 ATR trailing: ${n(a.assignedAtrMultiplier).toFixed(2)}× ATR\n` +
    `💰 MFE yakalama hedefi: %${(n(a.assignedCaptureRatio) * 100).toFixed(0)}\n` +
    `🧠 Kaynak: ${a.takeoverSource === 'ONLINE_LEARNED_PROFILE' ? `çevrimiçi replay N${n(a.profileSamples)}` : 'güvenli başlangıç profili'}\n` +
    `🔐 Bu atama pozisyon kapanana kadar sabittir.`;
}
function closeId(pos, result) {
  return String(pos?.closeId || pos?.tradeId || pos?.sanalOrderId || pos?.borsaOrderId ||
    crypto.createHash('sha1').update([pos?.sym, pos?.yon, pos?.acilisZamani, result?.exitPrice, result?.reason].join('|')).digest('hex'));
}
function normalizePath(pos) {
  const raw = pos?.execution?.pricePath || pos?.journey?.pricePath || pos?.pricePath || [];
  return (Array.isArray(raw) ? raw : []).map((r, i) => ({
    price: n(r?.price ?? r?.fiyat),
    pnlPct: Number.isFinite(Number(r?.pnlPct)) ? Number(r.pnlPct) : null,
    atrPct: Number.isFinite(Number(r?.atrPct)) ? Number(r.atrPct) : null,
    at: r?.at || r?.time || r?.ts || r?.timestamp || i
  })).filter(r => r.price > 0);
}
function replay(pathRows, yon, entry, box, trail, takeoverPct = 0, finalPrice = entry) {
  let activated = takeoverPct <= 0, activationPrice = entry, activationIndex = activated ? 0 : -1;
  let peak = entry, exit = null, mfe = 0;
  for (let i = 0; i < pathRows.length; i++) {
    const p = n(pathRows[i].price);
    if (!p) continue;
    const pnl = profitPct(yon, entry, p);
    mfe = Math.max(mfe, pnl);
    if (!activated && pnl >= takeoverPct) { activated = true; activationPrice = p; activationIndex = i; peak = p; }
    if (!activated) continue;
    peak = yon === 'LONG' ? Math.max(peak, p) : Math.min(peak, p);
    const stop = yon === 'LONG' ? peak - box * trail : peak + box * trail;
    if ((yon === 'LONG' && p <= stop) || (yon === 'SHORT' && p >= stop)) { exit = stop; break; }
  }
  if (exit == null) exit = n(finalPrice, n(pathRows.at(-1)?.price, activationPrice));
  const pct = profitPct(yon, entry, exit);
  const capture = mfe > 0 ? Math.max(0, Math.min(100, pct / mfe * 100)) : 0;
  return { pct, mfe, capture, giveback: Math.max(0, mfe - pct), missedProfit: Math.max(0, mfe - Math.max(0, pct)), activated, activationPrice, activationIndex };
}
function adaptiveReplay(pathRows, yon, entry, takeoverPct, atrMultiplier, captureRatio, finalPrice = entry, safeFloorPct = DEFAULT_SAFE_FLOOR()) {
  let activated = false, peakPct = 0, peakAtrPct = null, exitPct = null, mfe = 0, activationIndex = -1;
  let atrAvailable = false, exitReason = 'ACTUAL_CLOSE';
  for (let i = 0; i < pathRows.length; i++) {
    const row = pathRows[i];
    const pnl = row.pnlPct != null && Number.isFinite(Number(row.pnlPct)) ? Number(row.pnlPct) : profitPct(yon, entry, n(row.price));
    const atrPct = n(row.atrPct, NaN);
    mfe = Math.max(mfe, pnl);
    if (!activated && pnl >= takeoverPct) {
      activated = true; activationIndex = i; peakPct = pnl;
      if (Number.isFinite(atrPct) && atrPct > 0) { peakAtrPct = atrPct; atrAvailable = true; }
    }
    if (!activated) continue;
    if (pnl >= peakPct) {
      peakPct = pnl;
      if (Number.isFinite(atrPct) && atrPct > 0) { peakAtrPct = atrPct; atrAvailable = true; }
    }
    const atrFloor = peakAtrPct > 0 ? peakPct - peakAtrPct * atrMultiplier : -Infinity;
    const captureFloor = peakPct * captureRatio;
    const effectiveFloor = Math.max(Math.min(safeFloorPct, takeoverPct), atrFloor, captureFloor);
    if (pnl <= effectiveFloor) {
      exitPct = effectiveFloor;
      exitReason = captureFloor >= atrFloor ? 'MFE_CAPTURE' : 'ATR_TRAIL';
      break;
    }
  }
  if (exitPct == null) exitPct = profitPct(yon, entry, n(finalPrice, n(pathRows.at(-1)?.price, entry)));
  const capture = mfe > 0 ? clamp(exitPct / mfe * 100, 0, 100) : 0;
  return {
    pct: exitPct, mfe, capture, giveback: Math.max(0, mfe - exitPct),
    missedProfit: Math.max(0, mfe - Math.max(0, exitPct)), activated,
    activationIndex, atrAvailable, exitReason
  };
}
function actualAudit(pos, result, pathRows) {
  const entry = n(pos?.girisFiyati), exit = n(result?.exitPrice, n(pathRows.at(-1)?.price));
  let mfe = 0, pre = 0, post = 0;
  const activatedAtMs = Date.parse(pos?.renkoExitActivatedAt || '');
  const openedAtMs = Date.parse(pos?.acilisZamani || pos?.openedAt || pos?.girisZamani || '');
  for (const row of pathRows) {
    const pnl = row.pnlPct != null && Number.isFinite(Number(row.pnlPct)) ? Number(row.pnlPct) : profitPct(pos.yon, entry, row.price);
    mfe = Math.max(mfe, pnl);
    const t = Number.isFinite(Number(row.at)) ? Number(row.at) : Date.parse(row.at);
    if (Number.isFinite(activatedAtMs) && Number.isFinite(t)) {
      if (t < activatedAtMs) pre = Math.max(pre, pnl); else post = Math.max(post, pnl);
    } else post = Math.max(post, pnl);
  }
  const exitPct = Number.isFinite(Number(result?.fiyatKarYuzdesi)) ? n(result.fiyatKarYuzdesi) : profitPct(pos.yon, entry, exit);
  const capture = mfe > 0 ? clamp(exitPct / mfe * 100, 0, 100) : 0;
  const delay = Number.isFinite(activatedAtMs) && Number.isFinite(openedAtMs) ? Math.max(0, activatedAtMs - openedAtMs) : null;
  return {
    mfe, exitPct, capture, giveback: Math.max(0, mfe - exitPct),
    preTakeoverMfe: pre, postTakeoverMfe: post, activationDelayMs: delay,
    reason: String(result?.reason || 'UNKNOWN')
  };
}
function addMetric(m, rr) {
  const alpha = clamp(ayarlar.renkoCikisOnlineEmaAlpha, 0.05, 1) || 0.35;
  m.samples = n(m.samples) + 1;
  m.net = n(m.net) + rr.pct;
  if (rr.pct > 0) { m.tp = n(m.tp) + 1; m.grossProfit = n(m.grossProfit) + rr.pct; }
  else if (rr.pct < 0) { m.sl = n(m.sl) + 1; m.grossLoss = n(m.grossLoss) + Math.abs(rr.pct); }
  else m.be = n(m.be) + 1;
  m.mfeCaptureSum = n(m.mfeCaptureSum) + rr.capture;
  m.givebackSum = n(m.givebackSum) + rr.giveback;
  m.missedProfitSum = n(m.missedProfitSum) + rr.missedProfit;
  m.emaNet = m.samples === 1 ? rr.pct : n(m.emaNet) * (1 - alpha) + rr.pct * alpha;
  m.emaCapture = m.samples === 1 ? rr.capture : n(m.emaCapture) * (1 - alpha) + rr.capture * alpha;
  m.emaGiveback = m.samples === 1 ? rr.giveback : n(m.emaGiveback) * (1 - alpha) + rr.giveback * alpha;
}
function addAudit(a, x) {
  a.samples = n(a.samples) + 1;
  a.mfeSum = n(a.mfeSum) + x.mfe;
  a.exitPctSum = n(a.exitPctSum) + x.exitPct;
  a.captureSum = n(a.captureSum) + x.capture;
  a.givebackSum = n(a.givebackSum) + x.giveback;
  a.preTakeoverMfeSum = n(a.preTakeoverMfeSum) + x.preTakeoverMfe;
  a.postTakeoverMfeSum = n(a.postTakeoverMfeSum) + x.postTakeoverMfe;
  if (Number.isFinite(x.activationDelayMs)) {
    a.activationDelayMsSum = n(a.activationDelayMsSum) + x.activationDelayMs;
    a.activationDelaySamples = n(a.activationDelaySamples) + 1;
  }
  a.reasonCounts[x.reason] = (a.reasonCounts[x.reason] || 0) + 1;
}
function close(pos, result = {}) {
  const s = read(), id = closeId(pos, result);
  if (s.processedIds[id]) { s.health.duplicate++; write(s); return { accepted: false, reason: 'DUPLICATE' }; }
  if (result.restartGap) { s.health.restartGap++; write(s); return { accepted: false, reason: 'RESTART_GAP' }; }
  if (/MANUAL_EXTERNAL_CLOSE|MANUAL_OVERRIDE/i.test(String(result.reason || ''))) {
    s.health.manualExcluded++;
    s.processedIds[id] = { at: new Date().toISOString(), manual: true };
    write(s);
    return { accepted: false, reason: 'MANUAL_EXCLUDED' };
  }

  const ga = pos.girisAnalizi || {}, box = n(ga.renkoBoxSize || pos.renkoBoxSize);
  if (!(box > 0)) return { accepted: false, reason: 'BOX_SIZE_MISSING' };
  const k = key(pos.yon, ga.patternKodu);
  const p = s.profiles[k] || (s.profiles[k] = normalizeProfile({}, k));
  const pathRows = normalizePath(pos), entry = n(pos.girisFiyati);
  const finalPrice = n(result.exitPrice, n(pathRows.at(-1)?.price, entry));
  const observedTakeover = Math.max(0, n(pos?.renkoExitAssignment?.assignedTakeoverPct, n(pos?.korunanKarYuzdesi, DEFAULT_TAKEOVER())));

  for (const trail of CANDIDATES()) {
    const rr = replay(pathRows, pos.yon, entry, box, trail, observedTakeover, finalPrice);
    const m = p.candidates[trail] || (p.candidates[trail] = blankMetric());
    addMetric(m, rr);
  }
  for (const take of TAKEOVER_CANDIDATES()) {
    const rr = replay(pathRows, pos.yon, entry, box, n(p.activeTrail, DEFAULT_TRAIL()), take, finalPrice);
    const m = p.takeoverCandidates[take] || (p.takeoverCandidates[take] = blankMetric());
    addMetric(m, rr);
    for (const trail of CANDIDATES()) {
      const jr = replay(pathRows, pos.yon, entry, box, trail, take, finalPrice);
      const jk = `${take.toFixed(2)}|${trail.toFixed(2)}`;
      const jm = p.jointCandidates[jk] || (p.jointCandidates[jk] = { takeoverPct: take, trail, ...blankMetric() });
      addMetric(jm, jr);
    }
  }

  for (const take of TAKEOVER_CANDIDATES()) {
    for (const atrMultiplier of ATR_CANDIDATES()) {
      for (const captureRatio of CAPTURE_CANDIDATES()) {
        const rr = adaptiveReplay(pathRows, pos.yon, entry, take, atrMultiplier, captureRatio, finalPrice, DEFAULT_SAFE_FLOOR());
        const ck = candidateKey(take, atrMultiplier, captureRatio);
        const cm = p.onlineCandidates[ck] || (p.onlineCandidates[ck] = {
          takeoverPct: take, atrMultiplier, captureRatio, safeFloorPct: Math.min(DEFAULT_SAFE_FLOOR(), take), ...blankMetric()
        });
        addMetric(cm, rr);
      }
    }
  }

  const audit = actualAudit(pos, result, pathRows);
  addAudit(p.audit, audit);
  p.closed = n(p.closed) + 1;

  const legacyBest = chooseTrail(p);
  if (legacyBest) p.activeTrail = legacyBest.trail;
  const best = chooseOnline(p);
  if (best) {
    // İlk kapanıştan itibaren öğren; ancak tek örneğin aşırı uyumunu canlıya tam güçle verme.
    // Güven arttıkça güvenli başlangıç profilinden replay şampiyonuna kademeli yaklaş.
    const conf = confidence(best.samples);
    p.activeTakeoverPct = blend(DEFAULT_TAKEOVER(), best.takeoverPct, conf);
    p.activeAtrMultiplier = blend(DEFAULT_ATR(), best.atrMultiplier, conf);
    p.activeCaptureRatio = blend(DEFAULT_CAPTURE(), best.captureRatio, conf);
    p.activeSafeFloorPct = Math.min(n(best.safeFloorPct, DEFAULT_SAFE_FLOOR()), p.activeTakeoverPct);
    p.activeProfileUpdatedAt = new Date().toISOString();
    p.online = {
      status: 'ONLINE_AKTIF', samples: best.samples, confidence: conf,
      score: adaptiveScore(best),
      selectedTakeoverPct: best.takeoverPct,
      selectedAtrMultiplier: best.atrMultiplier,
      selectedCaptureRatio: best.captureRatio,
      takeoverPct: p.activeTakeoverPct,
      atrMultiplier: p.activeAtrMultiplier,
      captureRatio: p.activeCaptureRatio,
      safeFloorPct: p.activeSafeFloorPct, net: best.net, pf: best.pf,
      expectancy: best.expectancy, mfeCapture: best.mfeCapture,
      avgGiveback: best.avgGiveback, updatedAt: p.activeProfileUpdatedAt
    };
    p.promotion = { ...p.online, trail: p.activeTrail };
  }

  s.processedIds[id] = { at: new Date().toISOString(), patternKey: k, audit, online: p.online };
  write(s);
  fs.appendFileSync(LEDGER_FILE, JSON.stringify({
    type: 'RENKO_EXIT_CLOSE_V670', id, at: new Date().toISOString(), patternKey: k,
    result, audit, online: p.online
  }) + '\n');
  addTimeline(pos, 'EXIT', { stage: pos.renkoProtectionStage || 'K0', reason: result.reason || 'UNKNOWN', exitPrice: finalPrice });
  return {
    accepted: true, activeTrail: p.activeTrail, activeTakeoverPct: p.activeTakeoverPct,
    activeAtrMultiplier: p.activeAtrMultiplier, activeCaptureRatio: p.activeCaptureRatio,
    promotion: p.promotion, online: p.online, audit
  };
}
function summary(activePositions = []) {
  const s = read();
  const positions = Array.isArray(activePositions) ? activePositions : [];
  const assigned = positions.filter(p => p?.girisAnalizi?.entryStrategy === 'ST2_RENKO' && p?.renkoExitAssignment);
  const activated = assigned.filter(p => p?.renkoExitActivated === true);
  const gap = assigned.filter(p => p?.restartGap === true || p?.restartGapIslemi === true || p?.restartGapProtection === true);
  return {
    state: s,
    profiles: Object.values(s.profiles || {}).map(p => ({
      ...p, auditMetric: auditMetric(p.audit),
      activeMetric: metric(p.candidates?.[p.activeTrail] || blankMetric()),
      onlineMetric: p.online || {}, promotion: p.promotion || {}
    })),
    runtime: { activeRenko: assigned.length, assigned: assigned.length, activated: activated.length, waiting: assigned.length - activated.length, restartGap: gap.length }
  };
}
function telegram(activePositions = []) {
  const x = summary(activePositions);
  const totalClosed = x.profiles.reduce((a, p) => a + n(p.closed), 0);
  let t = '🏁 <b>ST2 ONLINE ATR + MFE CAPTURE / KÂR YAKALAMA</b>\n🏁 RENKO KÂR TAKİP STOPU EVRİMİ\n━━━━━━━━━━━━━━━━━━\n';
  t += `📊 Bilimsel kapanış: ${totalClosed} | İzlenen pattern: ${x.profiles.length}\n`;
  t += `🧱 Takip profili atanmış: ${x.runtime.assigned} | Stop kaynağı: gerçek kapanış + online replay\n`;
  t += `⚡ Bekleme kapısı: YOK | İlk kapanıştan itibaren yeni profile otomatik atama\n`;
  t += `🧱 Atanmış: ${x.runtime.assigned} | 🟢 Devrede: ${x.runtime.activated} | ⏳ Eşik bekleyen: ${x.runtime.waiting}\n`;
  t += `🛡️ Restart-GAP aktif: ${x.runtime.restartGap} | GAP ret: ${n(x.state.health?.restartGap)} | Duplicate: ${n(x.state.health?.duplicate)}\n`;
  t += `🔬 Devralma ${TAKEOVER_CANDIDATES().map(v => `%${v.toFixed(2)}`).join('/')} | ATR ${ATR_CANDIDATES().map(v => `${v.toFixed(2)}×`).join('/')} | Yakalama ${CAPTURE_CANDIDATES().map(v => `%${(v * 100).toFixed(0)}`).join('/')}\n`;
  for (const p of x.profiles) {
    const a = p.auditMetric, o = p.online || {};
    t += `\n🧩 ${p.patternKey} | N${n(p.closed)} | ${o.status || 'SAFE_DEFAULT'}\n`;
    t += `🎯 Devralma %${n(p.activeTakeoverPct, DEFAULT_TAKEOVER()).toFixed(2)} | ATR ${n(p.activeAtrMultiplier, DEFAULT_ATR()).toFixed(2)}× | MFE %${(n(p.activeCaptureRatio, DEFAULT_CAPTURE()) * 100).toFixed(0)} | Güven %${(n(o.confidence) * 100).toFixed(0)}\n`;
    t += `💰 Gerçek MFE %${a.avgMfe.toFixed(3)} | Kapanış %${a.avgExitPct.toFixed(3)} | Yakalama %${a.avgCapture.toFixed(1)} | Geri verme %${a.avgGiveback.toFixed(3)}\n`;
    if (o.status) t += `🧠 Replay Net ${n(o.net) >= 0 ? '+' : ''}${n(o.net).toFixed(4)} | PF ${n(o.pf).toFixed(2)} | Exp ${n(o.expectancy).toFixed(4)} | Replay yakalama %${n(o.mfeCapture).toFixed(1)}\n`;
  }
  if (!x.profiles.length) t += '\n🟢 Güvenli başlangıç profili aktif. İlk bilimsel kapanışla birlikte çevrimiçi atama başlayacak.\n';
  return t;
}

module.exports = {
  VERSION, STATE_FILE, BACKUP_FILE, LEDGER_FILE,
  CANDIDATES, TAKEOVER_CANDIDATES, ATR_CANDIDATES, CAPTURE_CANDIDATES,
  DEFAULT_TRAIL, DEFAULT_ATR, DEFAULT_CAPTURE,
  activeFor, activeProfileFor, assign, update, takeoverText, close, summary, telegram,
  firstProtectionReady, takeoverThresholdReady, addTimeline, peakProfitPct,
  mfeProtectionStop, atrProtectionStop, stopSource, sourceLabel,
  replay, adaptiveReplay, actualAudit, metric, auditMetric, chooseOnline, adaptiveScore, confidence, blend
};
