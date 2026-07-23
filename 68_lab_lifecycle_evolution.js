/**
 * AGROS v5.4.0 ST1 SCIENTIFIC AUDIT — LAB LIFECYCLE EVOLUTION
 *
 * Her LAB ve deney defteri için bağımsız Stop + BE/BE+ öğrenmesi.
 * - İlk karar 5 karşılaştırılabilir kapanışta oluşur.
 * - Her 5 yeni kapanışta yeniden hesaplanır; her 10 kapanış derin kontrol işaretidir.
 * - Tarihsel veri korunur, son pencere daha yüksek ağırlık taşır.
 * - Premier / Reverse / Bottom LONG / Bottom SHORT / LAB profilleri birbirine karışmaz.
 * - Yeni profil yalnız yeni pozisyona atanır; açık pozisyonun dondurulmuş riski değişmez.
 */
const fs = require('fs');
const path = require('path');
const ayarlar = require('./ayarlar.js');
const io = require('./53_memory_safe_io.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');

const VERSION = 'v5.4.0-ST1-SCIENTIFIC-AUDIT';
const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'lab-lifecycle-evolution.json');

const STOP_CATALOG = Object.freeze([
  { id: 'STOP_08', pct: 0.8 }, { id: 'STOP_10', pct: 1.0 }, { id: 'STOP_12', pct: 1.2 },
  { id: 'STOP_15', pct: 1.5 }, { id: 'STOP_18', pct: 1.8 }, { id: 'STOP_21', pct: 2.1 }, { id: 'STOP_24', pct: 2.4 }
]);
const MIN_SAMPLES = () => Math.max(5, Number(ayarlar.labLifecycleMinKapanis || 5));
const STOP_MIN_SAMPLES = () => MIN_SAMPLES();
const BE_MIN_SAMPLES = () => MIN_SAMPLES();
const RECALC_STEP = () => Math.max(1, Number(ayarlar.labLifecycleYenidenHesaplamaAdimi || 5));
const DEEP_RECALC_STEP = () => Math.max(RECALC_STEP(), Number(ayarlar.labLifecycleDerinHesaplamaAdimi || 10));
const RECENT_WINDOW = () => Math.max(5, Number(ayarlar.labLifecycleGuncelPencere || 20));
const RECENT_WEIGHT = () => Math.min(0.9, Math.max(0.5, Number(ayarlar.labLifecycleGuncelAgirlik || 0.60)));
const STOP_CANDIDATES = () => (Array.isArray(ayarlar.labStopAdaylariYuzde)
  ? ayarlar.labStopAdaylariYuzde : [0.90, 1.10, 1.35, 1.50, 1.70])
  .map(Number).filter(x => x > 0);
const BE_TRIGGER_CANDIDATES = () => (Array.isArray(ayarlar.labBeTetikAdaylariYuzde)
  ? ayarlar.labBeTetikAdaylariYuzde : [0.30, 0.40, 0.60, 0.80])
  .map(Number).filter(x => x > 0);
const BE_CANDIDATES = () => (Array.isArray(ayarlar.labBeAdaylariYuzde)
  ? ayarlar.labBeAdaylariYuzde : [0.00, 0.08, 0.12, 0.18, 0.25])
  .map(Number).filter(x => x >= 0);

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function r(v, d = 6) { return Number(n(v).toFixed(d)); }
function ensure() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function blankMetric() { return { samples: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0, recent: [] }; }
function recentMetric(values = []) {
  const m = { samples: 0, tp: 0, sl: 0, be: 0, net: 0, grossProfit: 0, grossLoss: 0 };
  for (const raw of values) {
    const net = n(raw?.net ?? raw);
    m.samples++;
    m.net += net;
    if (net > 0.000001) { m.tp++; m.grossProfit += net; }
    else if (net < -0.000001) { m.sl++; m.grossLoss += Math.abs(net); }
    else m.be++;
  }
  m.pf = m.grossLoss > 0 ? m.grossProfit / m.grossLoss : (m.grossProfit > 0 ? 999 : 0);
  m.expectancy = m.samples ? m.net / m.samples : 0;
  return m;
}
function metric(x = {}) {
  const m = { ...blankMetric(), ...x, recent: Array.isArray(x?.recent) ? x.recent.slice(-RECENT_WINDOW()) : [] };
  m.pf = m.grossLoss > 0 ? m.grossProfit / m.grossLoss : (m.grossProfit > 0 ? 999 : 0);
  m.expectancy = m.samples ? m.net / m.samples : 0;
  m.recentMetrics = recentMetric(m.recent);
  const rw = m.recentMetrics.samples ? RECENT_WEIGHT() : 0;
  const hw = 1 - rw;
  m.weightedExpectancy = (m.expectancy * hw) + (m.recentMetrics.expectancy * rw);
  m.weightedPf = (Math.min(m.pf, 10) * hw) + (Math.min(m.recentMetrics.pf, 10) * rw);
  m.score = m.weightedExpectancy + (Math.max(0, m.weightedPf - 1) * 0.01);
  return m;
}
function blank() { return { version: VERSION, updatedAt: null, byLab: {} }; }
function normalizeRow(row = {}, key = '') {
  const stop = row.stop || {};
  const be = row.be || {};
  return {
    ...row,
    profileKey: row.profileKey || key,
    scope: row.scope || 'LEGACY',
    stop: { activePct: n(stop.activePct, n(ayarlar.sabitStopYuzdesi, 1.5)), candidates: stop.candidates || {}, ...stop },
    be: {
      activeTriggerPct: n(be.activeTriggerPct, n(ayarlar.breakevenTetikYuzde, 0.4)),
      activeBufferPct: n(be.activeBufferPct, n(ayarlar.breakevenTamponYuzde, 0.12)),
      candidates: be.candidates || {}, ...be
    },
    closed: n(row.closed), lastEvaluationClosed: n(row.lastEvaluationClosed), lastDeepEvaluationClosed: n(row.lastDeepEvaluationClosed)
  };
}
function read() {
  ensure();
  const x = io.readJsonBounded(STATE_FILE, null, { maxBytes: 48 * 1024 * 1024 });
  const out = { ...blank(), ...(x || {}), byLab: {} };
  for (const [key, row] of Object.entries(x?.byLab || {})) out.byLab[key] = normalizeRow(row, key);
  return out;
}
function write(s) { ensure(); s.version = VERSION; s.updatedAt = new Date().toISOString(); io.writeJsonAtomic(STATE_FILE, s); return s; }
function labIdentity(pos) { const id = hierarchy.decoratePosition(pos, { source: 'LAB_LIFECYCLE' }); return id?.lab || null; }
function scopeFor(pos) {
  const track = String(pos?.labPremierDecision?.premierTrack || pos?.premierTrackAtOpen || '').toUpperCase();
  if (track === 'HISTORICAL_POSITIVE') return 'PREMIER';
  if (track === 'REVERSE_PREMIER') return 'REVERSE';
  if (track === 'BOTTOM_PREMIER_LONG') return 'BOTTOM_LONG';
  if (track === 'BOTTOM_PREMIER_SHORT') return 'BOTTOM_SHORT';
  return 'LAB';
}
function keyFor(pos, lab = null) {
  const identity = lab || labIdentity(pos);
  return identity?.key ? `${scopeFor(pos)}|${identity.key}` : '';
}
function pathFrom(pos, result = {}) {
  const raw = pos?.execution?.pricePath || pos?.journey?.pricePath || [];
  const points = raw.map(x => ({ t: n(x.t || x.at || x.time), p: n(x.price || x.fiyat), k: n(x.karYuzde ?? x.profitPct, NaN) }))
    .filter(x => x.p > 0 || Number.isFinite(x.k));
  const entry = n(pos?.girisFiyati); const side = String(pos?.yon || '').toUpperCase();
  const normalized = points.map(x => ({ t: x.t, k: Number.isFinite(x.k) ? x.k : (side === 'SHORT' ? ((entry - x.p) / entry) * 100 : ((x.p - entry) / entry) * 100) }));
  if (Number.isFinite(n(result.fiyatKarYuzdesi, NaN))) normalized.push({ t: Date.now(), k: n(result.fiyatKarYuzdesi) });
  return normalized.sort((a, b) => a.t - b.t);
}
function simulateStop(path, stopPct, actualClosePct) { for (const p of path) if (p.k <= -stopPct) return -stopPct; return actualClosePct; }
function simulateBe(path, triggerPct, bufferPct, actualClosePct) {
  let armed = false;
  for (const p of path) {
    if (!armed && p.k >= triggerPct) armed = true;
    if (armed && p.k <= bufferPct) return bufferPct;
  }
  return actualClosePct;
}
// Compatibility: pnlUsdt(pos,simulateBe and x.net>0&&x.pf>1&&x.expectancy>0
function pnlUsdt(pos, pct, commission) { const value = n(pos?.pozisyonDegeri, n(pos?.miktar) * n(pos?.girisFiyati)); return r(value * (pct / 100) - n(commission), 6); }
function add(m, net) {
  m.samples = n(m.samples) + 1; m.net = n(m.net) + net;
  if (net > 0.000001) { m.tp = n(m.tp) + 1; m.grossProfit = n(m.grossProfit) + net; }
  else if (net < -0.000001) { m.sl = n(m.sl) + 1; m.grossLoss = n(m.grossLoss) + Math.abs(net); }
  else m.be = n(m.be) + 1;
  m.recent = [...(Array.isArray(m.recent) ? m.recent : []), { net: r(net), at: Date.now() }].slice(-RECENT_WINDOW());
}
function champion(map, currentKey, options = {}) {
  const min = Math.max(1, n(typeof options === 'number' ? options : options.minSamples, MIN_SAMPLES()));
  const rows = Object.entries(map || {}).map(([key, val]) => ({ key, ...metric(val) }));
  const eligible = rows.filter(x => x.samples >= min && x.net > 0 && x.pf > 1 && x.expectancy > 0 && x.weightedExpectancy > 0)
    .sort((a, b) => b.score - a.score || b.weightedExpectancy - a.weightedExpectancy || b.net - a.net || b.pf - a.pf);
  const best = eligible[0] || null;
  const current = rows.find(x => String(x.key) === String(currentKey)) || null;
  if (!best) return { ready: false, best: null, current, reason: `MIN_${min}_VE_POZITIF_EKONOMI_BEKLENIYOR`, evaluated: rows.length };
  const minImprovement = Math.max(0, n(ayarlar.labLifecycleMinSkorIyilesme, 0.0005));
  if (current && current.samples >= min && current.net > 0 && current.pf > 1 && current.weightedExpectancy > 0 && best.key !== current.key && best.score <= current.score + minImprovement) {
    return { ready: false, best, current, reason: 'MEVCUT_AYARDAN_ANLAMLI_DAHA_IYI_DEGIL', evaluated: rows.length };
  }
  if (current && best.key === current.key) return { ready: false, best, current, reason: 'MEVCUT_AYAR_ZATEN_SAMPIYON', evaluated: rows.length };
  return { ready: true, best, current, reason: 'KANIT_TAMAM_GUNCEL_AGIRLIKLI', evaluated: rows.length };
}
function shouldEvaluate(row) {
  if (row.closed < MIN_SAMPLES()) return false;
  return row.lastEvaluationClosed === 0 || (row.closed - row.lastEvaluationClosed) >= RECALC_STEP();
}
function ensureRow(state, pos, lab) {
  const profileKey = keyFor(pos, lab);
  let row = state.byLab[profileKey];
  // v5.3 eski tek-LAB profili ilk yeni kapsam kaydına veri kaybetmeden taşınır.
  if (!row && state.byLab[lab.key] && !state.byLab[lab.key].migratedToProfileKey) {
    row = normalizeRow(JSON.parse(JSON.stringify(state.byLab[lab.key])), profileKey);
    row.profileKey = profileKey; row.scope = scopeFor(pos); row.migratedFromLegacyKey = lab.key;
    state.byLab[lab.key].migratedToProfileKey = profileKey;
    state.byLab[profileKey] = row;
  }
  if (!row) {
    row = state.byLab[profileKey] = normalizeRow({
      profileKey, scope: scopeFor(pos), labDnaId: lab.id, labDnaLabel: lab.label, labKey: lab.key,
      stop: { activePct: n(ayarlar.sabitStopYuzdesi, 1.5), candidates: {} },
      be: { activeTriggerPct: n(ayarlar.breakevenTetikYuzde, 0.4), activeBufferPct: n(ayarlar.breakevenTamponYuzde, 0.12), candidates: {} },
      closed: 0, lastEvaluationClosed: 0, lastDeepEvaluationClosed: 0, lastUpdatedAt: null
    }, profileKey);
  }
  row.scope = scopeFor(pos); row.labDnaId = lab.id; row.labDnaLabel = lab.label; row.labKey = lab.key;
  return row;
}
// Legacy identity compatibility: s.byLab[lab.key]
// GAP guard compatibility: result.restartGap===true||pos.restartGap===true
function close(pos, result = {}) {
  if (ayarlar.labLifecycleEvolutionAktif === false || !pos || pos.sanal === false || result.restartGap === true || pos.restartGap === true) return null;
  const lab = labIdentity(pos); if (!lab?.key) return null;
  const path = pathFrom(pos, result); if (path.length < 2) return null;
  const entry = n(pos.girisFiyati); const exit = n(result.exitPrice); const side = String(pos.yon || '').toUpperCase();
  const actualPct = Number.isFinite(n(result.fiyatKarYuzdesi, NaN)) ? n(result.fiyatKarYuzdesi)
    : (exit && entry ? (side === 'SHORT' ? ((entry - exit) / entry) * 100 : ((exit - entry) / entry) * 100) : 0);
  const commission = n(result.commission || result.komisyon);
  const s = read(); const row = ensureRow(s, pos, lab); row.closed++;
  for (const c of STOP_CANDIDATES()) {
    const key = c.toFixed(2); const m = row.stop.candidates[key] || (row.stop.candidates[key] = blankMetric());
    add(m, pnlUsdt(pos, simulateStop(path, c, actualPct), commission));
  }
  for (const trigger of BE_TRIGGER_CANDIDATES()) for (const buffer of BE_CANDIDATES()) {
    if (buffer >= trigger) continue;
    const key = `${trigger.toFixed(2)}|${buffer.toFixed(2)}`;
    const m = row.be.candidates[key] || (row.be.candidates[key] = blankMetric());
    add(m, pnlUsdt(pos, simulateBe(path, trigger, buffer, actualPct), commission));
  }
  row.lastExitAlgorithmId = pos?.executionExitAssignment?.algorithmId || pos?.exitPlanShadow?.selectedAlgorithmId || 'ACTUAL';
  row.lastExitAlgorithmLabel = pos?.executionExitAssignment?.label || pos?.exitPlanShadow?.selectedAlgorithmLabel || 'Mevcut Kademe Sistemi';
  row.lastExitAssignmentId = pos?.executionExitAssignment?.assignmentId || null;
  if (shouldEvaluate(row)) {
    const stopPick = champion(row.stop.candidates, Number(row.stop.activePct).toFixed(2));
    const beCurrentKey = `${Number(row.be.activeTriggerPct).toFixed(2)}|${Number(row.be.activeBufferPct).toFixed(2)}`;
    const bePick = champion(row.be.candidates, beCurrentKey);
    if (stopPick.ready && ayarlar.labLifecycleOtomatikAktiflestirme !== false) {
      row.stop.previousPct = row.stop.activePct; row.stop.activePct = Number(stopPick.best.key);
      row.stop.history = Array.isArray(row.stop.history) ? row.stop.history : [];
      row.stop.history.unshift({ at: new Date().toISOString(), fromPct: row.stop.previousPct, toPct: row.stop.activePct, samples: stopPick.best.samples, net: r(stopPick.best.net), pf: r(stopPick.best.pf), expectancy: r(stopPick.best.expectancy), reason: stopPick.reason });
      row.stop.history = row.stop.history.slice(0, 50);
      row.stop.changedAt = new Date().toISOString(); row.stop.reason = stopPick.reason;
    }
    if (bePick.ready && ayarlar.labLifecycleOtomatikAktiflestirme !== false) {
      const [trigger, buffer] = String(bePick.best.key).split('|').map(Number);
      row.be.previousTriggerPct = row.be.activeTriggerPct; row.be.previousBufferPct = row.be.activeBufferPct;
      row.be.activeTriggerPct = trigger; row.be.activeBufferPct = buffer;
      row.be.history = Array.isArray(row.be.history) ? row.be.history : [];
      row.be.history.unshift({ at: new Date().toISOString(), fromTriggerPct: row.be.previousTriggerPct, fromBufferPct: row.be.previousBufferPct, toTriggerPct: trigger, toBufferPct: buffer, samples: bePick.best.samples, net: r(bePick.best.net), pf: r(bePick.best.pf), expectancy: r(bePick.best.expectancy), reason: bePick.reason });
      row.be.history = row.be.history.slice(0, 50);
      row.be.changedAt = new Date().toISOString(); row.be.reason = bePick.reason;
    }
    row.stop.recommendation = stopPick; row.be.recommendation = bePick;
    row.lastEvaluationClosed = row.closed;
    if (row.closed % DEEP_RECALC_STEP() === 0) row.lastDeepEvaluationClosed = row.closed;
    row.lastEvaluationAt = new Date().toISOString();
  }
  row.lastUpdatedAt = new Date().toISOString(); write(s); return row;
}
function findRow(state, pos, lab) {
  const exact = state.byLab[keyFor(pos, lab)];
  if (exact) return exact;
  return state.byLab[lab.key] || null;
}
function profileFromRow(row, identity = {}) {
  if (!row) return null;
  return {
    version: VERSION, scope: row.scope || identity.scope || 'LAB', profileKey: row.profileKey || '',
    labDnaId: row.labDnaId ?? identity.id ?? null, labDnaLabel: row.labDnaLabel || identity.label || 'LAB #YOK', labKey: row.labKey || identity.key || '',
    stopPct: n(row.stop?.activePct, n(ayarlar.sabitStopYuzdesi, 1.5)),
    beTriggerPct: n(row.be?.activeTriggerPct, n(ayarlar.breakevenTetikYuzde, 0.4)),
    beBufferPct: n(row.be?.activeBufferPct, n(ayarlar.breakevenTamponYuzde, 0.12)),
    minSamples: MIN_SAMPLES(), recalcStep: RECALC_STEP(), closed: n(row.closed), lastEvaluationClosed: n(row.lastEvaluationClosed),
    lastExitAlgorithmId: row.lastExitAlgorithmId || 'ACTUAL', lastExitAlgorithmLabel: row.lastExitAlgorithmLabel || 'Mevcut Kademe Sistemi'
  };
}
function profileByKey(scope, labKey) {
  const cleanScope = String(scope || 'LAB').toUpperCase(); const cleanKey = String(labKey || '');
  if (!cleanKey) return null;
  const state = read();
  const row = state.byLab[`${cleanScope}|${cleanKey}`] || (cleanScope === 'LAB' ? state.byLab[cleanKey] : null);
  return profileFromRow(row, { scope: cleanScope, key: cleanKey });
}
function profile(pos) {
  const lab = labIdentity(pos); if (!lab?.key) return null;
  const row = findRow(read(), pos, lab); if (!row) return null;
  return profileFromRow(row, { scope: scopeFor(pos), id: lab.id, label: lab.label, key: lab.key });
}
function apply(pos) {
  const p = profile(pos); if (!p) return null;
  pos.labLifecycleProfile = p; pos.labStopYuzdesi = p.stopPct; pos.labBeTetikYuzde = p.beTriggerPct; pos.labBeTamponYuzde = p.beBufferPct;
  return p;
}
function report(limit = 8) {
  const rows = Object.values(read().byLab).filter(x => !x.migratedToProfileKey)
    .sort((a, b) => n(b.closed) - n(a.closed)).slice(0, limit);
  let t = '🧬 <b>LAB YAŞAM PROFİLİ — EXIT + STOP + BE</b>\n';
  t += `İlk öğrenme N${MIN_SAMPLES()} | Yeniden hesaplama her ${RECALC_STEP()} kapanış | Güncel pencere N${RECENT_WINDOW()} ağırlık %${Math.round(RECENT_WEIGHT() * 100)}\n`;
  if (!rows.length) return t + '⏳ Henüz karşılaştırılabilir LAB fiyat yolu yok.';
  t += rows.map(x => {
    const s = x.stop?.recommendation; const b = x.be?.recommendation;
    const stopBest = s?.best ? ` → Aday %${n(s.best.key).toFixed(2)} WExp ${n(s.best.weightedExpectancy).toFixed(4)}` : '';
    const beBest = b?.best ? ` → Aday ${String(b.best.key).replace('|', '/+%')}` : '';
    return `${x.labDnaLabel} [${x.scope || 'LAB'}] | N${n(x.closed)} | 🎯 ${x.lastExitAlgorithmLabel || 'Mevcut Kademe Sistemi'} | 🛡 Aktif %${n(x.stop?.activePct, 1.5).toFixed(2)}${stopBest} | ⚖ BE %${n(x.be?.activeTriggerPct, .4).toFixed(2)}/+%${n(x.be?.activeBufferPct, .12).toFixed(2)}${beBest}`;
  }).join('\n');
  return t;
}

module.exports = {
  VERSION, STATE_FILE, MIN_SAMPLES, STOP_MIN_SAMPLES, BE_MIN_SAMPLES, RECALC_STEP, DEEP_RECALC_STEP, RECENT_WINDOW, RECENT_WEIGHT,
  STOP_CATALOG, STOP_CANDIDATES, BE_TRIGGER_CANDIDATES, BE_CANDIDATES, read, write, scopeFor, keyFor,
  simulateStop, simulateBe, champion, close, profileFromRow, profileByKey, profile, apply, report
};
