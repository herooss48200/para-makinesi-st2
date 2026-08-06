'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');

const VERSION = 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT';
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
const CAPTURE_CANDIDATES = () => (ayarlar.renkoCikisMfeYakalamaAdaylari || [0.45, 0.50, 0.55, 0.60, 0.65, 0.70])
  .map(Number).filter(x => x >= MIN_CAPTURE() && x <= MAX_CAPTURE()).sort((a, b) => a - b);
const DEFAULT_TRAIL = () => Number(ayarlar.renkoCikisVarsayilanTugla || 1);
const DEFAULT_ATR = () => Number(ayarlar.renkoCikisVarsayilanAtrCarpani || 1.5);
const DEFAULT_CAPTURE = () => Number(ayarlar.renkoCikisVarsayilanMfeYakalamaOrani || ayarlar.renkoCikisMinMfeKorumaOrani || 0.60);
const DEFAULT_TAKEOVER = () => Number(ayarlar.renkoCikisMfeKorumaTetikYuzde || 0.40);
const DEFAULT_SAFE_FLOOR = () => Math.max(0, Number(ayarlar.renkoCikisGuvenliKarTabaniYuzde || 0.15));
const MIN_TAKEOVER = () => Math.max(0.05, Number(ayarlar.renkoCikisMinimumDevralmaYuzde || Math.min(...TAKEOVER_CANDIDATES()) || 0.25));
const MIN_ATR = () => Math.max(0.25, Number(ayarlar.renkoCikisMinimumAtrCarpani || Math.min(...ATR_CANDIDATES()) || 1.25));
const MIN_CAPTURE = () => clamp(Number(ayarlar.renkoCikisMinimumMfeYakalamaOrani ?? 0.40), 0.30, 0.70);
const MAX_CAPTURE = () => clamp(Number(ayarlar.renkoCikisMaksimumMfeYakalamaOrani ?? 0.70), MIN_CAPTURE(), 0.80);
const ROUND_TRIP_COMMISSION_PCT = () => Math.max(0, Number(ayarlar.sanalKomisyonOrani ?? 0.0005) * 2 * 100);
const MIN_NET_PROFIT_PCT = () => Math.max(0, Number(ayarlar.renkoCikisMinimumNetKarYuzde || 0.05));
const SAFE_FLOOR_MIN = () => Math.max(DEFAULT_SAFE_FLOOR(), ROUND_TRIP_COMMISSION_PCT() + MIN_NET_PROFIT_PCT());
const FLOOR_ARM_PROFIT_PCT = () => Math.max(SAFE_FLOOR_MIN() + 0.01, Number(ayarlar.renkoCikisKarTabaniAktivasyonYuzde || SAFE_FLOOR_MIN() + 0.10));
const LIVE_ACTIVATION_PROFIT_PCT = () => Math.max(FLOOR_ARM_PROFIT_PCT(), Number(ayarlar.renkoCikisCanliAktivasyonYuzde || FLOOR_ARM_PROFIT_PCT()));
const MFE_ARM_PROFIT_PCT = () => Math.max(LIVE_ACTIVATION_PROFIT_PCT(), Number(ayarlar.renkoCikisMfeKorumaAktivasyonYuzde || LIVE_ACTIVATION_PROFIT_PCT()));
const LIVE_MODE = () => String(ayarlar.renkoCikisCanliModu || 'SAFE_COMMISSION_BRICK_TRAIL').toUpperCase();
const BRICK_LIVE_MODE = () => LIVE_MODE() === 'SAFE_COMMISSION_BRICK_TRAIL';
const STOP_UPDATE_STEP_BRICKS = () => clamp(Number(ayarlar.renkoCikisStopGuncellemeAdimTugla ?? 1.00), 0.25, 2.00);

function n(v, d = 0) { v = Number(v); return Number.isFinite(v) ? v : d; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, n(v, min))); }
function takeoverOrNull(v) { const x = Number(v); return Number.isFinite(x) && x >= MIN_TAKEOVER() ? x : null; }
function atrOrNull(v) { const x = Number(v); return Number.isFinite(x) && x >= MIN_ATR() ? x : null; }
function captureOrNull(v) { const x = Number(v); return Number.isFinite(x) && x >= MIN_CAPTURE() && x <= MAX_CAPTURE() ? x : null; }
function validTakeover(v) { return takeoverOrNull(v) ?? Math.max(MIN_TAKEOVER(), DEFAULT_TAKEOVER()); }
function validAtr(v) { return atrOrNull(v) ?? Math.max(MIN_ATR(), DEFAULT_ATR()); }
function validCapture(v) { return captureOrNull(v) ?? clamp(DEFAULT_CAPTURE(), MIN_CAPTURE(), MAX_CAPTURE()); }
function safeFloorFor(takeoverPct, value) {
  const requested = Number(value);
  const floor = Number.isFinite(requested) && requested > 0 ? requested : SAFE_FLOOR_MIN();
  // Canlı Renko modunda ATR/MFE takeover yüzdesi yalnız gölge replay'dir;
  // güvenli kâr tabanını aşağı çekemez.
  if (BRICK_LIVE_MODE()) return Math.round(Math.max(SAFE_FLOOR_MIN(), floor) * 10000) / 10000;
  const takeover = validTakeover(takeoverPct);
  return Math.round(Math.min(takeover, Math.max(SAFE_FLOOR_MIN(), floor)) * 10000) / 10000;
}
function blend(from, to, weight) {
  const w = clamp(weight, 0, 1);
  return Math.round((n(from) + (n(to) - n(from)) * w) * 10000) / 10000;
}
function key(y, p) { return `${String(y || '').toUpperCase()}|${String(p || 'UNKNOWN').toUpperCase()}`; }
function activationProfitPctFor(pos = {}) {
  // Canlı Renko modu doğrudan ayarı kullanır. tpAdimYuzdesi × kademe bağı yoktur.
  if (BRICK_LIVE_MODE()) {
    return Math.round(LIVE_ACTIVATION_PROFIT_PCT() * 10000) / 10000;
  }
  const learned = Number(pos?.labBeTetikYuzde ?? pos?.labLifecycleProfile?.beTriggerPct);
  const direct = Number.isFinite(learned) && learned > 0 ? learned : n(ayarlar.breakevenTetikYuzde, 0.40);
  return Math.round(Math.max(SAFE_FLOOR_MIN(), direct) * 10000) / 10000;
}
function assignmentIdFor(pos, patternKey, trail, activationPct) {
  const identity = pos?.sanalOrderId || pos?.borsaOrderId || pos?.tradeId || pos?.id || `${pos?.sym || pos?.symbol || 'UNKNOWN'}-${pos?.acilisZamani || pos?.openedAt || Date.now()}`;
  return `RXT-${crypto.createHash('sha1').update([identity, pos?.yon, patternKey, trail, activationPct].join('|')).digest('hex').slice(0, 20).toUpperCase()}`;
}
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
    activeTakeoverPct: takeoverOrNull(p.activeTakeoverPct),
    activeAtrMultiplier: atrOrNull(p.activeAtrMultiplier),
    activeCaptureRatio: captureOrNull(p.activeCaptureRatio),
    activeSafeFloorPct: Number.isFinite(Number(p.activeSafeFloorPct)) && Number(p.activeSafeFloorPct) > 0 ? Number(p.activeSafeFloorPct) : null,
    activeProfileUpdatedAt: p.activeProfileUpdatedAt || null,
    candidates: p.candidates || {},
    brickNetCandidates: p.brickNetCandidates || {},
    takeoverCandidates: p.takeoverCandidates || {},
    jointCandidates: p.jointCandidates || {},
    onlineCandidates: p.onlineCandidates || {},
    audit: { ...blankAudit(), ...(p.audit || {}), reasonCounts: p.audit?.reasonCounts || {} },
    promotion: p.promotion || {},
    online: p.online || {},
    brickEconomy: p.brickEconomy || {}
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
  const samples = n(m?.samples), wins = n(m?.tp), losses = n(m?.sl), loss = n(m?.grossLoss);
  const avgWin = wins ? n(m?.grossProfit) / wins : 0;
  const avgLoss = losses ? loss / losses : 0;
  return {
    ...blankMetric(), ...(m || {}),
    wr: samples ? 100 * wins / samples : 0,
    pf: loss > 0 ? n(m?.grossProfit) / loss : (n(m?.grossProfit) > 0 ? 999 : 0),
    expectancy: samples ? n(m?.net) / samples : 0,
    avgWin,
    avgLoss,
    payoffRatio: avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 999 : 0),
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
function minN() { return Math.max(3, n(ayarlar.renkoCikisIlkAtamaKapanis, 5)); }
function confidence(samples) {
  const prior = Math.max(1, n(ayarlar.renkoCikisOnlineGuvenOnculN, 6));
  return n(samples) / (n(samples) + prior);
}
function adaptiveScore(row) {
  const m = metric(row);
  // Ekonomi önceliği: küçük MFE'yi yüksek oranda yakalamak yerine net expectancy,
  // ortalama kazanan ve payoff oranı ödüllendirilir. Capture/giveback yalnız ikincil ölçüttür.
  const recentNet = n(m.emaNet, m.expectancy);
  const payoff = Math.min(4, n(m.payoffRatio));
  const pf = Math.min(4, n(m.pf));
  const captureQuality = Math.min(0.70, Math.max(0, n(m.emaCapture, m.mfeCapture) / 100));
  return recentNet * 0.55
    + n(m.expectancy) * 0.35
    + n(m.avgWin) * 0.18
    + payoff * 0.035
    + pf * 0.025
    + captureQuality * 0.025
    - n(m.emaGiveback, m.avgGiveback) * 0.08;
}
function eligible(row) {
  const m = metric(row);
  return m.samples >= minN() && m.net > 0 && m.expectancy > 0 && m.pf >= 1;
}
function chooseTrail(p) {
  const rows = Object.entries(p.candidates || {}).map(([x, m]) => ({ trail: n(x), ...metric(m) })).filter(eligible);
  rows.sort((a, b) => b.net - a.net || b.pf - a.pf || b.expectancy - a.expectancy || b.mfeCapture - a.mfeCapture || a.trail - b.trail);
  return rows[0] || null;
}
function chooseBrickEconomy(p) {
  const rows = Object.entries(p.brickNetCandidates || {}).map(([x, m]) => ({ trail: n(x), ...metric(m) })).filter(eligible);
  rows.sort((a, b) => b.net - a.net || b.expectancy - a.expectancy || b.pf - a.pf || b.avgWin - a.avgWin || a.avgGiveback - b.avgGiveback || a.trail - b.trail);
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
    || b.expectancy - a.expectancy
    || b.net - a.net
    || b.avgWin - a.avgWin
    || b.payoffRatio - a.payoffRatio
    || b.atrMultiplier - a.atrMultiplier
    || a.captureRatio - b.captureRatio
    || a.avgGiveback - b.avgGiveback
    || b.takeoverPct - a.takeoverPct);
  return rows[0] || null;
}
function activeProfileFor(yon, pattern) {
  const s = read();
  const p = s.profiles[key(yon, pattern)];
  const learnedTakeover = takeoverOrNull(p?.activeTakeoverPct);
  const learnedAtr = atrOrNull(p?.activeAtrMultiplier);
  const learnedCapture = captureOrNull(p?.activeCaptureRatio);
  const economyEligible = p?.online?.economyEligible === true && n(p?.online?.samples) >= minN();
  const learned = Boolean(p && economyEligible && learnedTakeover != null && learnedAtr != null && learnedCapture != null);
  const takeoverPct = learned ? learnedTakeover : validTakeover(DEFAULT_TAKEOVER());
  const atrMultiplier = learned ? learnedAtr : validAtr(DEFAULT_ATR());
  const captureRatio = learned ? learnedCapture : validCapture(DEFAULT_CAPTURE());
  return {
    trail: n(p?.activeTrail, DEFAULT_TRAIL()),
    takeoverPct,
    atrMultiplier,
    captureRatio,
    safeFloorPct: safeFloorFor(takeoverPct, p?.activeSafeFloorPct),
    samples: BRICK_LIVE_MODE() ? n(p?.brickEconomy?.samples, p?.closed) : n(p?.online?.samples, p?.closed),
    confidence: confidence(BRICK_LIVE_MODE() ? n(p?.brickEconomy?.samples, p?.closed) : n(p?.online?.samples, p?.closed)),
    source: learned ? 'ONLINE_LEARNED_PROFILE' : (p ? 'SAFE_ECONOMY_FALLBACK' : 'SAFE_DEFAULT'),
    trailSource: p?.brickEconomy?.economyEligible === true ? 'NET_ECONOMY_LEARNED_BRICK_TRAIL' : (p ? 'PERSISTED_BRICK_TRAIL' : 'SAFE_DEFAULT_BRICK_TRAIL'),
    liveMode: LIVE_MODE(),
    sanitizedLegacyProfile: Boolean(p && !learned && [p.activeTakeoverPct, p.activeAtrMultiplier, p.activeCaptureRatio].some(v => v != null))
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
  const ga = pos.girisAnalizi || {};
  const patternKey = key(pos.yon, ga.patternKodu);
  const profile = activeProfileFor(pos.yon, ga.patternKodu);
  const activationPct = activationProfitPctFor(pos);
  const boxAtOpen = n(ga.renkoBoxSize || pos?.renkoBoxSize);
  const entryBrickAtOpen = n(ga.renkoEntryBrickDistance, 0.75);
  if (pos.renkoExitAssignment) {
    const current = pos.renkoExitAssignment;
    const trail = n(current.assignedTrailBricks, profile.trail);
    const waitingForActivation = pos.renkoExitActivated !== true;
    const previousSafeFloor = n(current.assignedSafeFloorPct, 0);
    const previousStepBricks = n(current.assignedStopUpdateStepBricks, STOP_UPDATE_STEP_BRICKS());
    current.assignedTrailBricks = CANDIDATES().includes(trail) ? trail : profile.trail;
    current.assignedActivationProfitPct = waitingForActivation && BRICK_LIVE_MODE()
      ? activationPct
      : n(current.assignedActivationProfitPct, activationPct);
    current.assignedFloorArmProfitPct = waitingForActivation && BRICK_LIVE_MODE()
      ? FLOOR_ARM_PROFIT_PCT()
      : n(current.assignedFloorArmProfitPct, FLOOR_ARM_PROFIT_PCT());
    const adaptiveUnsafe = !BRICK_LIVE_MODE() && (
      takeoverOrNull(current.assignedTakeoverPct) == null ||
      atrOrNull(current.assignedAtrMultiplier) == null ||
      captureOrNull(current.assignedCaptureRatio) == null
    );
    if (adaptiveUnsafe) {
      current.assignedTakeoverPct = profile.takeoverPct;
      current.assignedAtrMultiplier = profile.atrMultiplier;
      current.assignedCaptureRatio = profile.captureRatio;
      current.assignedSafeFloorPct = profile.safeFloorPct;
      current.economyRepairMigratedAt = new Date().toISOString();
      current.economyRepairReason = 'UNSAFE_TIGHT_PROFILE_SANITIZED';
    } else {
      current.assignedSafeFloorPct = waitingForActivation
        ? Math.max(SAFE_FLOOR_MIN(), n(current.assignedSafeFloorPct, profile.safeFloorPct))
        : n(current.assignedSafeFloorPct, profile.safeFloorPct);
      current.assignedTakeoverPct = validTakeover(current.assignedTakeoverPct ?? profile.takeoverPct);
      current.assignedAtrMultiplier = validAtr(current.assignedAtrMultiplier ?? profile.atrMultiplier);
      current.assignedCaptureRatio = validCapture(current.assignedCaptureRatio ?? profile.captureRatio);
    }
    current.patternKey = current.patternKey || patternKey;
    current.profileKeyAtOpen = current.profileKeyAtOpen || current.patternKey;
    current.entryBrickAtOpen = n(current.entryBrickAtOpen, entryBrickAtOpen);
    current.renkoBoxAtOpen = n(current.renkoBoxAtOpen, boxAtOpen);
    current.assignmentId = current.assignmentId || assignmentIdFor(pos, current.profileKeyAtOpen, current.assignedTrailBricks, current.assignedActivationProfitPct);
    current.positionSpecific = true;
    current.assignmentSchema = current.assignmentSchema || 'V6110_POSITION_FROZEN';
    // Güvenlik politikası, takeover başlamamış açık pozisyonda ileri taşınabilir;
    // öğrenilmiş trail mesafesi yine pozisyon boyunca dondurulmuş kalır. Aktif trail geriye dönük sıkılaştırılmaz.
    if (waitingForActivation) {
      current.assignedSafeFloorPct = Math.max(SAFE_FLOOR_MIN(), n(current.assignedSafeFloorPct, profile.safeFloorPct));
      current.assignedMinimumNetProfitPct = MIN_NET_PROFIT_PCT();
      current.assignedRoundTripCommissionPct = ROUND_TRIP_COMMISSION_PCT();
      current.assignedStopUpdateStepBricks = STOP_UPDATE_STEP_BRICKS();
      current.profitFloorPolicy = 'MIN_NET_PROFIT_THEN_FROZEN_BRICK_TRAIL';
      current.safetyPolicySchema = 'V6112_DIRECT_PROFIT_FLOOR';
      if (previousSafeFloor + 1e-9 < current.assignedSafeFloorPct || Math.abs(previousStepBricks - current.assignedStopUpdateStepBricks) > 1e-9) {
        current.safetyPolicyMigratedAt = new Date().toISOString();
        current.safetyPolicyMigrationReason = 'WAITING_POSITION_DIRECT_FLOOR_AND_ACTIVATION_UPGRADE';
      }
    } else {
      current.assignedStopUpdateStepBricks = previousStepBricks;
      current.assignedMinimumNetProfitPct = Math.max(0, n(current.assignedMinimumNetProfitPct, n(current.assignedSafeFloorPct) - ROUND_TRIP_COMMISSION_PCT()));
      current.assignedRoundTripCommissionPct = n(current.assignedRoundTripCommissionPct, ROUND_TRIP_COMMISSION_PCT());
      current.profitFloorPolicy = current.profitFloorPolicy || 'FROZEN_ACTIVE_POSITION_POLICY';
      current.safetyPolicySchema = current.safetyPolicySchema || current.assignmentSchema;
    }
    current.profileSamples = n(current.profileSamples, profile.samples);
    current.profileConfidence = n(current.profileConfidence, profile.confidence);
    current.takeoverSource = current.takeoverSource || profile.source;
    current.trailSource = current.trailSource || profile.trailSource;
    current.liveExitMode = LIVE_MODE();
    current.atrMfeExecution = BRICK_LIVE_MODE() ? 'SHADOW_REPLAY_ONLY' : 'LIVE_COMPATIBILITY_MODE';
    current.status = pos.renkoExitActivated ? 'ACTIVE' : (BRICK_LIVE_MODE() ? 'WAITING_COMMISSION_SAFE_PROTECTION' : 'WAITING_TAKEOVER');
    return current;
  }
  const trail = CANDIDATES().includes(n(profile.trail)) ? n(profile.trail) : DEFAULT_TRAIL();
  pos.renkoExitAssignment = {
    patternKey,
    profileKeyAtOpen: patternKey,
    assignedTrailBricks: trail,
    assignedActivationProfitPct: activationPct,
    assignedFloorArmProfitPct: FLOOR_ARM_PROFIT_PCT(),
    assignedTakeoverPct: profile.takeoverPct,
    assignedAtrMultiplier: profile.atrMultiplier,
    assignedCaptureRatio: profile.captureRatio,
    assignedSafeFloorPct: Math.max(SAFE_FLOOR_MIN(), profile.safeFloorPct),
    assignedMinimumNetProfitPct: MIN_NET_PROFIT_PCT(),
    assignedRoundTripCommissionPct: ROUND_TRIP_COMMISSION_PCT(),
    profitFloorPolicy: 'MIN_NET_PROFIT_THEN_FROZEN_BRICK_TRAIL',
    safetyPolicySchema: 'V6112_DIRECT_PROFIT_FLOOR',
    profileSamples: profile.samples,
    profileConfidence: profile.confidence,
    takeoverSource: profile.source,
    trailSource: profile.trailSource,
    entryBrickAtOpen,
    renkoBoxAtOpen: boxAtOpen,
    liveExitMode: LIVE_MODE(),
    atrMfeExecution: BRICK_LIVE_MODE() ? 'SHADOW_REPLAY_ONLY' : 'LIVE_COMPATIBILITY_MODE',
    assignedAt: new Date().toISOString(),
    activationMode: BRICK_LIVE_MODE() ? 'DIRECT_FLOOR_THEN_DIRECT_TRAIL_ACTIVATION' : 'SAFE_PROFIT_THEN_ATR_AND_MFE_CAPTURE',
    status: BRICK_LIVE_MODE() ? 'WAITING_COMMISSION_SAFE_PROTECTION' : 'WAITING_TAKEOVER',
    takeoverLearningMode: 'SCIENTIFIC_CLOSE_REPLAY_NEW_POSITIONS_ONLY',
    positionSpecific: true,
    assignmentSchema: 'V6111_POSITION_FROZEN',
    assignedStopUpdateStepBricks: STOP_UPDATE_STEP_BRICKS()
  };
  pos.renkoExitAssignment.assignmentId = assignmentIdFor(pos, patternKey, trail, activationPct);
  pos.renkoProtectionStage = 'K0';
  pos.renkoProtectionState = BRICK_LIVE_MODE() ? 'KOMISYON_GUVENLI_KORUMA_BEKLENIYOR' : 'TAKEOVER_BEKLIYOR';
  addTimeline(pos, 'ASSIGNMENT', {
    stage: 'K0', assignmentId: pos.renkoExitAssignment.assignmentId,
    activationPct, takeoverPct: profile.takeoverPct, trail,
    atrMultiplier: profile.atrMultiplier, captureRatio: profile.captureRatio,
    confidence: profile.confidence, source: BRICK_LIVE_MODE() ? profile.trailSource : profile.source,
    liveMode: LIVE_MODE()
  });
  return pos.renkoExitAssignment;
}
function firstProtectionReady(pos) {
  return pos?.breakevenAktif === true && n(pos?.korunanKarYuzdesi, n(pos?.labBeTamponYuzde, 0)) >= 0;
}
function commissionSafeReady(pos, price) {
  const entry = n(pos?.girisFiyati);
  const pnl = profitPct(pos?.yon, entry, n(price));
  const a = pos?.renkoExitAssignment || {};
  const frozenLegacyActive = pos?.renkoExitActivated === true && a.safetyPolicySchema !== 'V6112_DIRECT_PROFIT_FLOOR';
  const floorPct = frozenLegacyActive
    ? Math.max(0, n(a.assignedSafeFloorPct, DEFAULT_SAFE_FLOOR()))
    : Math.max(SAFE_FLOOR_MIN(), n(a.assignedSafeFloorPct, SAFE_FLOOR_MIN()));
  const floorArmPct = frozenLegacyActive
    ? floorPct
    : Math.max(floorPct + 0.01, n(a.assignedFloorArmProfitPct, FLOOR_ARM_PROFIT_PCT()));
  const activationPct = pos?.renkoExitActivated === true
    ? floorPct
    : Math.max(floorArmPct, n(a.assignedActivationProfitPct, LIVE_ACTIVATION_PROFIT_PCT()));
  const floorLocked = frozenLegacyActive || pos?.renkoProfitFloorLocked === true || Boolean(pos?.renkoProfitFloorLockedAt);
  return {
    ok: pos?.renkoExitActivated === true || pnl + 1e-9 >= activationPct,
    floorReady: floorLocked || pnl + 1e-9 >= floorArmPct,
    floorLocked,
    pnl,
    floorPct,
    floorArmPct,
    activationPct,
    reason: !floorLocked && pnl + 1e-9 < floorArmPct
      ? 'CURRENT_PRICE_BELOW_DIRECT_FLOOR_ARM_THRESHOLD'
      : (pos?.renkoExitActivated !== true && pnl + 1e-9 < activationPct
        ? 'DIRECT_PROFIT_FLOOR_LOCKED_TRAIL_ACTIVATION_WAITING'
        : 'READY')
  };
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
  return profitPct(pos?.yon, entry, n(price)) >= validTakeover(a?.assignedTakeoverPct);
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
  const pct = safeFloorFor(a?.assignedTakeoverPct, a?.assignedSafeFloorPct);
  return priceFromProfitPct(pos?.yon, entry, pct);
}
function mfeArmPeakPct() {
  return MFE_ARM_PROFIT_PCT();
}
function mfeProtectionStop(pos, peak) {
  const entry = n(pos?.girisFiyati);
  if (!(entry > 0) || !(peak > 0)) return null;
  const a = pos?.renkoExitAssignment || assign(pos);
  const trigger = validTakeover(a?.assignedTakeoverPct);
  const ratio = validCapture(a?.assignedCaptureRatio);
  const peakPct = peakProfitPct(pos, peak);
  // Güvenli taban takeover anında korunur; MFE yüzdesi trend henüz filizlenirken
  // stopu boğmasın. MFE koruması ancak hareket takeover'ın belirgin üzerine uzadığında arm edilir.
  if (peakPct < mfeArmPeakPct() || ratio <= 0) return null;
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

  // Takeover anında yalnız güvenli kâr tabanı devrededir. ATR/MFE dinamik takibi,
  // hareket bir "runner" olacak kadar genişlemeden stopu sıkılaştırmaz.
  const runnerArmPct = mfeArmPeakPct(a?.assignedTakeoverPct);
  if (peakPct < runnerArmPct) {
    return {
      stop: null, atrPct, source: 'PROFIT_RUNNER_ARM_WAIT', floorPct: null,
      rawFloorPct: null, runnerArmPct
    };
  }

  const multiplier = validAtr(a?.assignedAtrMultiplier);
  const rawFloorPct = peakPct - atrPct * multiplier;
  // ATR çok küçük olduğunda 1.05× gibi eski profiller zirvenin neredeyse tamamını
  // kilitliyordu. Dinamik stop, peak kârın MAX_CAPTURE oranından daha sıkı olamaz.
  const maxEconomyFloorPct = peakPct * MAX_CAPTURE();
  const floorPct = Math.min(rawFloorPct, maxEconomyFloorPct);
  return {
    stop: priceFromProfitPct(pos?.yon, entry, floorPct),
    atrPct, source: pos?.renkoExitPeakAtrSource || current.source, floorPct,
    rawFloorPct, maxEconomyFloorPct, runnerArmPct
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
    RENKO_TUGLA_TAKIP: 'Renko tuğla takip stopu', KOMISYON_GUVENLI_TABAN: 'Komisyon sonrası güvenli kâr tabanı',
    MFE_KORUMA: 'Öğrenilmiş MFE kâr koruma', BILINMIYOR: 'Bilinmiyor'
  })[src] || String(src || 'Bilinmiyor');
}
function updateAdaptive(pos, price) {
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
  const atrStopValue = Number(atr.stop);
  const mfeFloorValue = Number(mfeFloor);
  const atrStop = Number.isFinite(atrStopValue) && atrStopValue > 0
    ? atrStopValue : (pos.yon === 'LONG' ? 0 : Number.POSITIVE_INFINITY);
  const mfeStop = Number.isFinite(mfeFloorValue) && mfeFloorValue > 0
    ? mfeFloorValue : (pos.yon === 'LONG' ? 0 : Number.POSITIVE_INFINITY);
  if (!(old > 0) || !(safeFloor > 0)) {
    return { active: true, justActivated, changed: false, reason: 'INVALID_STOP_INPUT', old, safeFloor, atrStop, mfeFloor };
  }

  const effective = pos.yon === 'LONG'
    ? Math.max(old, safeFloor, atrStop, mfeStop)
    : Math.min(old, safeFloor, atrStop, mfeStop);
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
function updateBrick(pos, price) {
  assign(pos);
  const a = pos.renkoExitAssignment;
  const entry = n(pos?.girisFiyati);
  const currentPrice = n(price);
  const pnl = profitPct(pos?.yon, entry, currentPrice);
  const readiness = commissionSafeReady(pos, currentPrice);
  const old = n(pos.sl);
  const safeStop = priceFromProfitPct(pos.yon, entry, readiness.floorPct);
  if (!(old > 0) || !(safeStop > 0)) {
    return { active: false, changed: false, reason: 'INVALID_STOP_INPUT', old, safeStop };
  }

  // K0: Doğrudan ayarlanan kâr tabanı arm eşiğine kadar başlangıç stopu korunur.
  if (!readiness.floorReady) {
    pos.renkoProtectionStage = 'K0';
    pos.renkoProtectionState = 'DOGRUDAN_KAR_TABANI_ESIGI_BEKLENIYOR';
    a.status = 'WAITING_DIRECT_PROFIT_FLOOR';
    return {
      active: false, changed: false, reason: readiness.reason,
      currentProfitPct: pnl, safeFloorPct: readiness.floorPct,
      floorArmPct: readiness.floorArmPct, activationPct: readiness.activationPct,
      trail: n(a.assignedTrailBricks)
    };
  }

  // K1: +%0.50 gibi doğrudan arm eşiğinde brüt +%0.40 tabanı kilitlenir.
  // Bu aşama breakevenTetikKademe veya tpAdimYuzdesi ile çarpılmaz.
  let justFloorLocked = false;
  let floorChanged = false;
  if (!readiness.floorLocked) {
    justFloorLocked = true;
    pos.renkoProfitFloorLocked = true;
    pos.renkoProfitFloorLockedAt = new Date().toISOString();
    pos.renkoProfitFloorGrossPct = readiness.floorPct;
    pos.renkoProfitFloorMinimumNetPct = Math.max(0, n(a.assignedMinimumNetProfitPct, readiness.floorPct - ROUND_TRIP_COMMISSION_PCT()));
    pos.renkoExitFirstProtectionStop = pos.yon === 'LONG' ? Math.max(old, safeStop) : Math.min(old, safeStop);
    floorChanged = pos.yon === 'LONG'
      ? pos.renkoExitFirstProtectionStop > old
      : pos.renkoExitFirstProtectionStop < old;
    if (floorChanged) pos.sl = pos.renkoExitFirstProtectionStop;
    pos.renkoProtectionStage = 'K1';
    pos.renkoProtectionState = 'MINIMUM_NET_KAR_TABANI_KILITLI';
    a.status = 'PROFIT_FLOOR_LOCKED_WAITING_TRAIL';
    addTimeline(pos, 'PROFIT_FLOOR_LOCKED', {
      stage: 'K1', price: currentPrice, profitPct: pnl,
      floorArmPct: readiness.floorArmPct, grossSafeFloorPct: readiness.floorPct,
      minimumNetProfitPct: pos.renkoProfitFloorMinimumNetPct,
      oldStop: old, stop: pos.renkoExitFirstProtectionStop
    });
  }

  // K1 devamı: Taban kilitli fakat doğrudan canlı aktivasyon eşiği henüz görülmedi.
  if (!readiness.ok) {
    const effectiveFloor = n(pos.renkoExitFirstProtectionStop, safeStop);
    if (!floorChanged) {
      const shouldTighten = pos.yon === 'LONG' ? effectiveFloor > old : effectiveFloor < old;
      if (shouldTighten) {
        pos.sl = effectiveFloor;
        floorChanged = true;
      }
    }
    pos.renkoProtectionStage = 'K1';
    pos.renkoProtectionState = 'KAR_TABANI_KILITLI_RENKO_AKTIVASYON_BEKLENIYOR';
    a.status = 'PROFIT_FLOOR_LOCKED_WAITING_TRAIL';
    return {
      active: true, justFloorLocked, justActivated: false, changed: floorChanged,
      reason: readiness.reason, currentProfitPct: pnl,
      safeFloorPct: readiness.floorPct, floorArmPct: readiness.floorArmPct,
      activationPct: readiness.activationPct, effective: effectiveFloor,
      source: 'KOMISYON_GUVENLI_TABAN', trail: n(a.assignedTrailBricks)
    };
  }

  const box = n(a.renkoBoxAtOpen, n(pos?.girisAnalizi?.renkoBoxSize || pos?.renkoBoxSize));
  if (!(box > 0)) {
    return {
      active: true, justFloorLocked, justActivated: false, changed: floorChanged,
      reason: 'BOX_SIZE_MISSING', effective: n(pos.renkoExitFirstProtectionStop, safeStop)
    };
  }

  const stepBricks = clamp(n(a.assignedStopUpdateStepBricks, STOP_UPDATE_STEP_BRICKS()), 0.25, 2.00);
  const stepPrice = box * stepBricks;
  let justActivated = false;
  if (!pos.renkoExitActivated) {
    justActivated = true;
    pos.renkoExitActivated = true;
    pos.renkoExitActivatedAt = new Date().toISOString();
    pos.renkoExitActivationPrice = currentPrice;
    pos.renkoExitActivationProfitPct = pnl;
    pos.renkoExitPeak = currentPrice;
    pos.renkoExitTrailAnchor = currentPrice;
    pos.renkoExitTrailAdvancedBricks = 0;
    pos.renkoExitFirstProtectionStop = pos.yon === 'LONG'
      ? Math.max(n(pos.renkoExitFirstProtectionStop, old), safeStop)
      : Math.min(n(pos.renkoExitFirstProtectionStop, old), safeStop);
    a.status = 'ACTIVE';
    pos.renkoProtectionStage = 'K2';
    pos.renkoProtectionState = 'DOGRUDAN_AKTIVASYON_RENKO_TRAIL_AKTIF';
    addTimeline(pos, 'BRICK_TRAIL_ACTIVE', {
      stage: 'K2', price: currentPrice, assignmentId: a.assignmentId,
      activationPct: readiness.activationPct, trail: n(a.assignedTrailBricks),
      floorArmPct: readiness.floorArmPct,
      grossSafeFloorPct: readiness.floorPct,
      minimumNetProfitPct: Math.max(0, n(a.assignedMinimumNetProfitPct, MIN_NET_PROFIT_PCT())),
      profitPct: pnl, stopUpdateStepBricks: stepBricks
    });
  }

  // Ham zirve MFE/audit için her tickte korunur. Binance stop emri yalnız
  // doğrudan ayarlanmış tamamlanmış Renko adımı kadar ilerler.
  const previousPeak = n(pos.renkoExitPeak, currentPrice);
  pos.renkoExitPeak = pos.yon === 'LONG' ? Math.max(previousPeak, currentPrice) : Math.min(previousPeak, currentPrice);
  const peakPct = peakProfitPct(pos, pos.renkoExitPeak);

  let anchor = n(pos.renkoExitTrailAnchor, n(pos.renkoExitActivationPrice, currentPrice));
  const favorableMove = pos.yon === 'LONG' ? currentPrice - anchor : anchor - currentPrice;
  const completedSteps = favorableMove > 0
    ? Math.floor((favorableMove + Math.max(1e-12, stepPrice * 1e-10)) / stepPrice)
    : 0;
  let advancedBricks = 0;
  if (completedSteps > 0) {
    advancedBricks = completedSteps * stepBricks;
    anchor = pos.yon === 'LONG' ? anchor + completedSteps * stepPrice : anchor - completedSteps * stepPrice;
    pos.renkoExitTrailAnchor = anchor;
    pos.renkoExitTrailAdvancedBricks = n(pos.renkoExitTrailAdvancedBricks) + advancedBricks;
    addTimeline(pos, 'NEW_BRICK_PEAK', {
      stage: 'K2', rawPeak: pos.renkoExitPeak, trailAnchor: anchor,
      peakProfitPct: peakPct, advancedBricks, totalAdvancedBricks: pos.renkoExitTrailAdvancedBricks
    });
  }

  const currentStop = n(pos.sl, old);
  const trail = n(a.assignedTrailBricks, DEFAULT_TRAIL());
  const brickStop = pos.yon === 'LONG' ? anchor - box * trail : anchor + box * trail;
  const floor = n(pos.renkoExitFirstProtectionStop, safeStop);

  // v6.13.3: Geniş tuğla profillerinde (örn. 1.25T) brickStop uzun süre kâr
  // tabanının altında kalabiliyordu. Bu durumda %1.5+ MFE görülmesine rağmen
  // stop +%0.30 net tabanda kalıyor ve kazancın büyük kısmı geri veriliyordu.
  // Öğrenilmiş MFE capture profili runner arm eşiğinden sonra dördüncü monoton
  // stop adayıdır. Mevcut stopu veya güvenli tabanı asla aşağı çekemez.
  const captureRatio = validCapture(a.assignedCaptureRatio);
  const captureArmPct = Math.max(MFE_ARM_PROFIT_PCT(), validTakeover(a.assignedTakeoverPct));
  // MFE audit zirvesi her tickte büyür; fakat canlı stop yalnız tamamlanmış Renko
  // adımında yeniden fiyatlanır. Böylece sub-brick gürültü Binance stopunu oynatmaz.
  if (completedSteps > 0) {
    pos.renkoExitCommittedCapturePeakPct = Math.max(
      n(pos.renkoExitCommittedCapturePeakPct),
      peakPct
    );
  }
  const committedCapturePeakPct = n(pos.renkoExitCommittedCapturePeakPct);
  const captureStop = committedCapturePeakPct >= captureArmPct && captureRatio > 0
    ? priceFromProfitPct(pos.yon, entry, committedCapturePeakPct * captureRatio)
    : null;
  const captureStopValue = Number(captureStop);
  const captureCandidate = Number.isFinite(captureStopValue) && captureStopValue > 0
    ? captureStopValue
    : (pos.yon === 'LONG' ? 0 : Number.POSITIVE_INFINITY);

  const effective = pos.yon === 'LONG'
    ? Math.max(currentStop, floor, brickStop, captureCandidate)
    : Math.min(currentStop, floor, brickStop, captureCandidate);
  if (!(effective > 0) || !Number.isFinite(effective)) {
    return { active: true, justFloorLocked, justActivated, changed: floorChanged, reason: 'INVALID_EFFECTIVE_STOP', effective, brickStop, floor, captureStop };
  }
  const changed = pos.yon === 'LONG' ? effective > old : effective < old;
  const eps = Math.max(1e-12, Math.abs(effective) * 1e-10);
  const source = Math.abs(effective - floor) <= eps
    ? 'KOMISYON_GUVENLI_TABAN'
    : (Math.abs(effective - brickStop) <= eps
      ? 'RENKO_TUGLA_TAKIP'
      : (Number.isFinite(captureStopValue) && Math.abs(effective - captureStopValue) <= eps
        ? 'MFE_KORUMA'
        : 'MEVCUT_STOP'));
  if (changed) {
    pos.sl = effective;
    pos.renkoExitAppliedTrailBricks = trail;
    pos.renkoExitLastStopSource = source;
    pos.renkoExitLastStopSourceLabel = sourceLabel(source);
    pos.renkoExitLastStopUpdatedAt = new Date().toISOString();
    pos.renkoProtectionStage = 'K3';
    pos.renkoProtectionState = 'RENKO_STOP_GUNCELLENDI';
    addTimeline(pos, 'STOP_MOVED', {
      stage: 'K3', reason: source, reasonLabel: sourceLabel(source), oldStop: old, stop: effective,
      peakProfitPct: peakPct, trail, trailAnchor: anchor, advancedBricks, stopUpdateStepBricks: stepBricks
    });
  } else if (pos.renkoExitLastStopUpdatedAt || pos.renkoProtectionStage === 'K3') {
    pos.renkoProtectionStage = 'K3';
    pos.renkoProtectionState = 'RENKO_STOP_KORUNUYOR';
  } else {
    pos.renkoProtectionStage = 'K2';
    pos.renkoProtectionState = 'RENKO_TUGLA_TAKIP_AKTIF';
  }
  return {
    active: true, justFloorLocked, justActivated, changed, effective, brickStop, captureStop, safeFloor: floor,
    source, sourceLabel: sourceLabel(source), peakProfitPct: peakPct, committedCapturePeakPct, trail, captureRatio, captureArmPct,
    rawPeak: pos.renkoExitPeak, trailAnchor: anchor, advancedBricks,
    stopUpdateStepBricks: stepBricks, liveMode: LIVE_MODE(),
    floorArmPct: readiness.floorArmPct, activationPct: readiness.activationPct,
    grossSafeFloorPct: readiness.floorPct,
    minimumNetProfitPct: Math.max(0, n(a.assignedMinimumNetProfitPct, MIN_NET_PROFIT_PCT()))
  };
}

function update(pos, price) {
  return BRICK_LIVE_MODE() ? updateBrick(pos, price) : updateAdaptive(pos, price);
}
function takeoverText(pos) {
  const a = pos.renkoExitAssignment || assign(pos);
  if (BRICK_LIVE_MODE()) {
    return `🏁 <b>KOMİSYON GÜVENLİ RENKO KÂR TAKİBİ DEVREDE</b>\n\n` +
      `🔀 ${pos.sym} (${pos.yon})\n` +
      `🧩 Pattern: ${pos.girisAnalizi?.patternKodu || 'YOK'}\n` +
      `🛡️ Taban kilitleme eşiği: %${n(a.assignedFloorArmProfitPct, FLOOR_ARM_PROFIT_PCT()).toFixed(2)}\n` +
      `🔒 Brüt kâr tabanı: %${Math.max(SAFE_FLOOR_MIN(), n(a.assignedSafeFloorPct)).toFixed(2)}\n` +
      `👑 Hedef minimum net: %${Math.max(0, n(a.assignedMinimumNetProfitPct, MIN_NET_PROFIT_PCT())).toFixed(2)}\n` +
      `🚀 Doğrudan Renko aktivasyonu: %${n(a.assignedActivationProfitPct, LIVE_ACTIVATION_PROFIT_PCT()).toFixed(2)}\n` +
      `🧱 Taban sonrası zirveden takip: ${n(a.assignedTrailBricks).toFixed(2)} tuğla\n` +
      `🔁 Stop güncelleme adımı: ${n(a.assignedStopUpdateStepBricks, STOP_UPDATE_STEP_BRICKS()).toFixed(2)} tamamlanmış tuğla\n` +
      `🧠 Kaynak: ${a.trailSource || 'SAFE_DEFAULT_BRICK_TRAIL'} | N${n(a.profileSamples)}\n` +
      `🔬 ATR/MFE profilleri yalnız gölge replay; canlı stopu yönetmez.\n` +
      `🔐 Bu atama pozisyon kapanana kadar sabittir.`;
  }
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
function brickReplay(pathRows, yon, entry, box, trail, activationPct, safeFloorPct = SAFE_FLOOR_MIN(), finalPrice = entry, stopUpdateStepBricks = STOP_UPDATE_STEP_BRICKS()) {
  activationPct = Math.max(SAFE_FLOOR_MIN(), n(activationPct, SAFE_FLOOR_MIN()));
  safeFloorPct = Math.max(SAFE_FLOOR_MIN(), n(safeFloorPct, SAFE_FLOOR_MIN()));
  const stepBricks = clamp(n(stopUpdateStepBricks, STOP_UPDATE_STEP_BRICKS()), 0.25, 2.00);
  const stepPrice = box * stepBricks;
  let activated = false, activationIndex = -1, activationPrice = entry;
  let peak = entry, anchor = entry, exit = null, mfe = 0, effectiveStop = null, exitReason = 'ACTUAL_CLOSE';
  const safeStop = priceFromProfitPct(yon, entry, safeFloorPct);
  for (let i = 0; i < pathRows.length; i++) {
    const price = n(pathRows[i]?.price);
    if (!(price > 0)) continue;
    const pnl = pathRows[i]?.pnlPct != null && Number.isFinite(Number(pathRows[i].pnlPct))
      ? Number(pathRows[i].pnlPct)
      : profitPct(yon, entry, price);
    mfe = Math.max(mfe, pnl);
    if (!activated && pnl >= activationPct) {
      activated = true;
      activationIndex = i;
      activationPrice = price;
      peak = price;
      anchor = price;
    }
    if (!activated) continue;
    peak = yon === 'LONG' ? Math.max(peak, price) : Math.min(peak, price);
    const favorableMove = yon === 'LONG' ? price - anchor : anchor - price;
    const steps = favorableMove > 0 ? Math.floor((favorableMove + Math.max(1e-12, stepPrice * 1e-10)) / stepPrice) : 0;
    if (steps > 0) anchor = yon === 'LONG' ? anchor + steps * stepPrice : anchor - steps * stepPrice;
    const brickStop = yon === 'LONG' ? anchor - box * trail : anchor + box * trail;
    effectiveStop = yon === 'LONG' ? Math.max(safeStop, brickStop) : Math.min(safeStop, brickStop);
    if ((yon === 'LONG' && price <= effectiveStop) || (yon === 'SHORT' && price >= effectiveStop)) {
      exit = effectiveStop;
      exitReason = Math.abs(effectiveStop - safeStop) <= Math.max(1e-12, Math.abs(effectiveStop) * 1e-10)
        ? 'COMMISSION_SAFE_FLOOR'
        : 'RENKO_BRICK_TRAIL';
      break;
    }
  }
  if (exit == null) exit = n(finalPrice, n(pathRows.at(-1)?.price, activationPrice));
  const grossPct = profitPct(yon, entry, exit);
  const netPct = grossPct - ROUND_TRIP_COMMISSION_PCT();
  const capture = mfe > 0 ? clamp(grossPct / mfe * 100, 0, 100) : 0;
  return {
    pct: netPct, netPct, grossPct, commissionPct: ROUND_TRIP_COMMISSION_PCT(),
    mfe, capture, giveback: Math.max(0, mfe - grossPct), missedProfit: Math.max(0, mfe - Math.max(0, grossPct)),
    activated, activationIndex, activationPrice, activationPct, safeFloorPct,
    exitPrice: exit, exitReason, effectiveStop, trailAnchor: anchor, stopUpdateStepBricks: stepBricks
  };
}

function adaptiveReplay(pathRows, yon, entry, takeoverPct, atrMultiplier, captureRatio, finalPrice = entry, safeFloorPct = DEFAULT_SAFE_FLOOR()) {
  takeoverPct = validTakeover(takeoverPct);
  atrMultiplier = validAtr(atrMultiplier);
  captureRatio = validCapture(captureRatio);
  safeFloorPct = safeFloorFor(takeoverPct, safeFloorPct);
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
    const runnerArmed = peakPct >= mfeArmPeakPct(takeoverPct);
    const rawAtrFloor = runnerArmed && peakAtrPct > 0 ? peakPct - peakAtrPct * atrMultiplier : -Infinity;
    const atrFloor = Number.isFinite(rawAtrFloor) ? Math.min(rawAtrFloor, peakPct * MAX_CAPTURE()) : -Infinity;
    const captureFloor = runnerArmed ? peakPct * captureRatio : -Infinity;
    const effectiveFloor = Math.max(Math.min(safeFloorPct, takeoverPct), atrFloor, captureFloor);
    if (pnl <= effectiveFloor) {
      exitPct = effectiveFloor;
      exitReason = captureFloor >= atrFloor ? 'MFE_CAPTURE' : 'ATR_TRAIL';
      break;
    }
  }
  if (exitPct == null) exitPct = profitPct(yon, entry, n(finalPrice, n(pathRows.at(-1)?.price, entry)));
  const grossPct = exitPct;
  const netPct = grossPct - ROUND_TRIP_COMMISSION_PCT();
  const capture = mfe > 0 ? clamp(grossPct / mfe * 100, 0, 100) : 0;
  return {
    pct: netPct, grossPct, commissionPct: ROUND_TRIP_COMMISSION_PCT(), mfe, capture,
    giveback: Math.max(0, mfe - grossPct),
    missedProfit: Math.max(0, mfe - Math.max(0, grossPct)), activated,
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

  if (BRICK_LIVE_MODE() && pos?.renkoExitActivated !== true) {
    s.health.notActivated = n(s.health.notActivated) + 1;
    s.processedIds[id] = { at: new Date().toISOString(), excluded: 'NOT_ACTIVATED' };
    write(s);
    return { accepted: false, reason: 'NOT_ACTIVATED' };
  }

  const ga = pos.girisAnalizi || {}, box = n(ga.renkoBoxSize || pos.renkoBoxSize);
  if (!(box > 0)) return { accepted: false, reason: 'BOX_SIZE_MISSING' };
  const k = key(pos.yon, ga.patternKodu);
  const p = s.profiles[k] || (s.profiles[k] = normalizeProfile({}, k));
  const pathRows = normalizePath(pos), entry = n(pos.girisFiyati);
  const finalPrice = n(result.exitPrice, n(pathRows.at(-1)?.price, entry));
  const observedTakeover = validTakeover(pos?.renkoExitAssignment?.assignedTakeoverPct ?? pos?.korunanKarYuzdesi);
  const brickActivationPct = Math.max(
    SAFE_FLOOR_MIN(),
    n(pos?.renkoExitAssignment?.assignedActivationProfitPct, n(pos?.renkoExitActivationProfitPct, activationProfitPctFor(pos)))
  );
  const brickSafeFloorPct = Math.max(SAFE_FLOOR_MIN(), n(pos?.renkoExitAssignment?.assignedSafeFloorPct, SAFE_FLOOR_MIN()));

  for (const trail of CANDIDATES()) {
    const rr = brickReplay(pathRows, pos.yon, entry, box, trail, brickActivationPct, brickSafeFloorPct, finalPrice, STOP_UPDATE_STEP_BRICKS());
    const m = p.candidates[trail] || (p.candidates[trail] = blankMetric());
    addMetric(m, { ...rr, pct: rr.grossPct });
    const nm = p.brickNetCandidates[trail] || (p.brickNetCandidates[trail] = blankMetric());
    addMetric(nm, rr);
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
  const brickBest = chooseBrickEconomy(p);
  if (brickBest) {
    p.activeTrail = brickBest.trail;
    p.brickEconomy = {
      status: 'NET_ECONOMY_BRICK_TRAIL_ACTIVE', economyEligible: true, samples: brickBest.samples,
      trail: brickBest.trail, net: brickBest.net, pf: brickBest.pf, expectancy: brickBest.expectancy,
      avgWin: brickBest.avgWin, avgLoss: brickBest.avgLoss, avgGiveback: brickBest.avgGiveback,
      commissionPct: ROUND_TRIP_COMMISSION_PCT(), updatedAt: new Date().toISOString()
    };
  } else {
    if (!(n(p.activeTrail) > 0) && legacyBest) p.activeTrail = legacyBest.trail;
    p.brickEconomy = {
      status: 'NET_ECONOMY_N5_BEKLENIYOR', economyEligible: false,
      samples: Math.max(0, ...Object.values(p.brickNetCandidates || {}).map(x => n(x.samples))),
      minSamples: minN(), retainedTrail: n(p.activeTrail, DEFAULT_TRAIL()), updatedAt: new Date().toISOString()
    };
  }
  const best = chooseOnline(p);
  if (best) {
    // En az N5 ve pozitif net/expectancy/PF kanıtından sonra öğrenilmiş profili canlıya taşı.
    // Güven arttıkça güvenli başlangıç profilinden replay şampiyonuna kademeli yaklaş.
    const conf = confidence(best.samples);
    p.activeTakeoverPct = validTakeover(blend(DEFAULT_TAKEOVER(), best.takeoverPct, conf));
    p.activeAtrMultiplier = validAtr(blend(DEFAULT_ATR(), best.atrMultiplier, conf));
    p.activeCaptureRatio = validCapture(blend(DEFAULT_CAPTURE(), best.captureRatio, conf));
    p.activeSafeFloorPct = safeFloorFor(p.activeTakeoverPct, best.safeFloorPct);
    p.activeProfileUpdatedAt = new Date().toISOString();
    p.online = {
      status: 'ONLINE_AKTIF_EKONOMI_KANITLI', samples: best.samples, confidence: conf,
      economyEligible: true, score: adaptiveScore(best),
      selectedTakeoverPct: best.takeoverPct,
      selectedAtrMultiplier: best.atrMultiplier,
      selectedCaptureRatio: best.captureRatio,
      takeoverPct: p.activeTakeoverPct,
      atrMultiplier: p.activeAtrMultiplier,
      captureRatio: p.activeCaptureRatio,
      safeFloorPct: p.activeSafeFloorPct, net: best.net, pf: best.pf,
      expectancy: best.expectancy, avgWin: best.avgWin, avgLoss: best.avgLoss,
      payoffRatio: best.payoffRatio, mfeCapture: best.mfeCapture,
      avgGiveback: best.avgGiveback, updatedAt: p.activeProfileUpdatedAt
    };
    p.promotion = { ...p.online, trail: p.activeTrail };
  } else {
    // Yeterli ve pozitif ekonomik kanıt yoksa eski sıkı profil taşınmaz.
    p.activeTakeoverPct = null;
    p.activeAtrMultiplier = null;
    p.activeCaptureRatio = null;
    p.activeSafeFloorPct = null;
    p.activeProfileUpdatedAt = new Date().toISOString();
    p.online = {
      status: 'SAFE_DEFAULT_ECONOMY_GATE', economyEligible: false,
      samples: p.closed, minSamples: minN(), updatedAt: p.activeProfileUpdatedAt
    };
    p.promotion = { ...p.online, trail: p.activeTrail };
  }

  s.processedIds[id] = { at: new Date().toISOString(), patternKey: k, audit, online: p.online };
  write(s);
  fs.appendFileSync(LEDGER_FILE, JSON.stringify({
    type: 'RENKO_EXIT_CLOSE_V6109', id, at: new Date().toISOString(), patternKey: k,
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
  const state = read();
  const positions = Array.isArray(activePositions) ? activePositions : [];
  const renkoPositions = positions.filter(p => p?.girisAnalizi?.entryStrategy === 'ST2_RENKO');
  const assigned = renkoPositions.filter(p => Number(p?.renkoExitAssignment?.assignedTrailBricks) > 0);
  const activated = assigned.filter(p => p?.renkoExitActivated === true);
  const gap = assigned.filter(p => p?.restartGap === true || p?.restartGapIslemi === true || p?.restartGapProtection === true);
  const learned = assigned.filter(p => String(p?.renkoExitAssignment?.trailSource || '').includes('NET_ECONOMY_LEARNED'));
  const persisted = assigned.filter(p => String(p?.renkoExitAssignment?.trailSource || '').includes('PERSISTED'));
  const defaults = assigned.filter(p => String(p?.renkoExitAssignment?.trailSource || '').includes('DEFAULT'));
  const assignmentErrors = Math.max(0, renkoPositions.length - assigned.length);
  return {
    state,
    profiles: Object.values(state.profiles || {}).map(p => ({
      ...p, auditMetric: auditMetric(p.audit),
      activeMetric: metric(p.candidates?.[p.activeTrail] || blankMetric()),
      onlineMetric: p.online || {}, brickEconomy: p.brickEconomy || {}, promotion: p.promotion || {}
    })),
    runtime: {
      activeRenko: renkoPositions.length,
      assigned: assigned.length,
      activated: activated.length,
      waiting: assigned.length - activated.length,
      restartGap: gap.length,
      learned: learned.length,
      persisted: persisted.length,
      defaults: defaults.length,
      assignmentErrors
    }
  };
}
function telegram(activePositions = []) {
  const x = summary(activePositions);
  const totalClosed = x.profiles.reduce((a, p) => a + n(p.closed), 0);
  let t = BRICK_LIVE_MODE()
    ? '🏁 <b>ST2 KOMİSYON GÜVENLİ RENKO TUĞLA TAKİBİ</b>\n🏁 NET KÂR EKONOMİSİ / CANLI STOP\n━━━━━━━━━━━━━━━━━━\n'
    : '🏁 <b>ST2 ONLINE ATR + MFE CAPTURE / KÂR YAKALAMA</b>\n🏁 RENKO KÂR TAKİP STOPU EVRİMİ\n━━━━━━━━━━━━━━━━━━\n';
  t += `📊 Bilimsel kapanış: ${totalClosed} | İzlenen pattern: ${x.profiles.length}\n`;
  t += `🧱 Atanmış ${x.runtime.assigned}/${x.runtime.activeRenko} | 🟢 Devrede ${x.runtime.activated} | ⏳ Bekleyen ${x.runtime.waiting} | ❌ Atama hata ${x.runtime.assignmentErrors}\n`;
  t += `🛡️ Restart-GAP ${x.runtime.restartGap} | GAP ret ${n(x.state.health?.restartGap)} | Duplicate ${n(x.state.health?.duplicate)}\n`;
  if (BRICK_LIVE_MODE()) {
    t += `⚡ Canlı model: komisyon sonrası güvenli taban + pozisyona özel dondurulmuş tuğla mesafesi\n`;
    t += `🧠 Kaynak: Öğrenilmiş ${x.runtime.learned} | Kalıcı profil ${x.runtime.persisted} | Varsayılan ${x.runtime.defaults}\n`;
    t += `🔬 Aday tuğla: ${CANDIDATES().map(v => `${v.toFixed(2)}T`).join('/')} | N${minN()} yalnız yeni profil terfi kapısıdır\n`;
    t += `👻 ATR/MFE canlı stopu yönetmez; yalnız gölge karşılaştırma replay'idir.\n`;
  } else {
    t += `⚡ Ekonomi kapısı: N${minN()} + pozitif Net/Exp/PF | Kanıt yoksa güvenli profil\n`;
    t += `🔬 Devralma ${TAKEOVER_CANDIDATES().map(v => `%${v.toFixed(2)}`).join('/')} | ATR ${ATR_CANDIDATES().map(v => `${v.toFixed(2)}×`).join('/')} | Yakalama ${CAPTURE_CANDIDATES().map(v => `%${(v * 100).toFixed(0)}`).join('/')}\n`;
  }
  for (const p of x.profiles) {
    const a = p.auditMetric, o = p.online || {}, b = p.brickEconomy || {};
    const active = activeProfileFor(...String(p.patternKey || 'UNKNOWN|UNKNOWN').split('|'));
    t += `\n🧩 ${p.patternKey} | N${n(p.closed)} | ${BRICK_LIVE_MODE() ? (b.status || active.trailSource) : (o.status || 'SAFE_DEFAULT')}\n`;
    if (BRICK_LIVE_MODE()) {
      t += `🧱 Aktif ${n(active.trail).toFixed(2)}T | Kaynak ${active.trailSource} | Güven %${(n(active.confidence) * 100).toFixed(0)}\n`;
      t += `💰 Net ${n(b.net) >= 0 ? '+' : ''}${n(b.net).toFixed(4)} | PF ${n(b.pf).toFixed(2)} | Exp ${n(b.expectancy).toFixed(4)} | Giveback %${n(b.avgGiveback).toFixed(3)}\n`;
    } else {
      t += `🎯 Devralma %${active.takeoverPct.toFixed(2)} | ATR ${active.atrMultiplier.toFixed(2)}× | MFE %${(active.captureRatio * 100).toFixed(0)} | Güven %${(n(o.confidence) * 100).toFixed(0)}\n`;
      t += `💰 Gerçek MFE %${a.avgMfe.toFixed(3)} | Kapanış %${a.avgExitPct.toFixed(3)} | Yakalama %${a.avgCapture.toFixed(1)} | Geri verme %${a.avgGiveback.toFixed(3)}\n`;
      if (o.status) t += `🧠 Replay Net ${n(o.net) >= 0 ? '+' : ''}${n(o.net).toFixed(4)} | PF ${n(o.pf).toFixed(2)} | Exp ${n(o.expectancy).toFixed(4)}\n`;
    }
  }
  if (!x.profiles.length) t += `\n🟢 Profil yoksa ilk pozisyon 1.00T güvenli varsayılanla hemen takip edilir; N5 beklenmez.\n`;
  return t;
}

module.exports = {
  VERSION, STATE_FILE, BACKUP_FILE, LEDGER_FILE,
  CANDIDATES, TAKEOVER_CANDIDATES, ATR_CANDIDATES, CAPTURE_CANDIDATES,
  DEFAULT_TRAIL, DEFAULT_ATR, DEFAULT_CAPTURE, DEFAULT_TAKEOVER, DEFAULT_SAFE_FLOOR,
  MIN_TAKEOVER, MIN_ATR, MIN_CAPTURE, MAX_CAPTURE, LIVE_MODE, BRICK_LIVE_MODE,
  ROUND_TRIP_COMMISSION_PCT, MIN_NET_PROFIT_PCT, SAFE_FLOOR_MIN,
  FLOOR_ARM_PROFIT_PCT, LIVE_ACTIVATION_PROFIT_PCT, MFE_ARM_PROFIT_PCT,
  activeFor, activeProfileFor, assign, update, updateBrick, updateAdaptive, takeoverText, close, summary, telegram,
  activationProfitPctFor, assignmentIdFor, commissionSafeReady, brickReplay, STOP_UPDATE_STEP_BRICKS,
  firstProtectionReady, takeoverThresholdReady, addTimeline, peakProfitPct,
  mfeProtectionStop, atrProtectionStop, stopSource, sourceLabel,
  replay, adaptiveReplay, actualAudit, metric, auditMetric, chooseTrail, chooseBrickEconomy, chooseOnline, adaptiveScore, confidence, blend,
  takeoverOrNull, atrOrNull, captureOrNull, validTakeover, validAtr, validCapture, safeFloorFor,
  mfeArmPeakPct, eligible
};
