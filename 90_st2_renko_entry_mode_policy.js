'use strict';

/**
 * AGROS ST2 v6.13.0 — Unified Renko Entry Mode Policy
 *
 * Tek gerçek giriş kapısı için iki ayrı zamanlama ailesini karşılaştırır:
 * - DIRECT: son ters renkli Golden Renko referansından öğrenilmiş offset.
 * - CONFIRMED: kapanmış 1m Renko dönüş çifti sonrasındaki offset.
 *
 * Geçmiş DIRECT state ve CONFIRMED Full Lifecycle state silinmez.
 * Canlı kapanışlar kendi mevcut ledger/state dosyalarına eklenmeye devam eder.
 */
const ayarlar = require('./ayarlar.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');
const confirmationLab = require('./89_st2_renko_entry_confirmation_shadow_lab.js');

const VERSION = 'v6.13.0-UNIFIED-RENKO-ENTRY-MODE-POLICY';
const MODES = Object.freeze({ DIRECT: 'DIRECT', CONFIRMED: 'CONFIRMED' });

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function metricScore(m = {}) {
    const samples = n(m.triggered, n(m.samples, n(m.n)));
    const pf = Math.min(5, Math.max(0, n(m.pf)));
    const exp = n(m.expectancy);
    const net = n(m.net);
    const wr = Math.max(0, Math.min(100, n(m.wr)));
    // Mutlak para büyüklüğünden çok kalite ve örnek güveni kullanılır.
    const confidence = Math.min(1, samples / Math.max(1, n(ayarlar.renkoGirisModuMinOrnek, 20)));
    const quality = (pf * 20) + (Math.tanh(exp * 10) * 25) + (Math.tanh(net / Math.max(1, samples)) * 15) + (wr * 0.20);
    return { score: quality * confidence, samples, confidence, pf, expectancy: exp, net, wr };
}
function directEvidence(yon, patternCode) {
    const summary = entryEvolution.summary();
    const key = entryEvolution.profileKey(yon, patternCode);
    const profile = (summary.profiles || []).find(x => x.key === key);
    const brick = n(profile?.activeBrick, entryEvolution.DEFAULT_BRICK());
    const candidate = (profile?.candidates || []).find(x => Math.abs(n(x.brick) - brick) < 1e-9) || {};
    return { mode: MODES.DIRECT, offsetT: brick, profileKey: key, raw: candidate, ...metricScore(candidate) };
}
function confirmedEvidence(yon) {
    const summary = confirmationLab.summary();
    const rows = (summary.lifecycle?.profiles || [])
        .filter(x => String(x.key || '').startsWith(`${String(yon).toUpperCase()}|`))
        .map(x => ({ ...x, offsetT: n(String(x.key).split('|').at(-1).replace('T', '')) }))
        .filter(x => x.offsetT > 0)
        .map(x => ({ ...x, scored: metricScore(x) }))
        .sort((a, b) => b.scored.score - a.scored.score || b.scored.samples - a.scored.samples || a.offsetT - b.offsetT);
    const best = rows[0] || null;
    return best
        ? { mode: MODES.CONFIRMED, offsetT: best.offsetT, profileKey: best.key, raw: best, ...best.scored }
        : { mode: MODES.CONFIRMED, offsetT: n(ayarlar.renkoGirisTeyitVarsayilanTugla, 0.25), profileKey: `${yon}|NO_DATA`, ...metricScore({}) };
}
function select(pusu = {}) {
    const yon = String(pusu.yon || '').toUpperCase();
    const patternCode = String(pusu.patternKodu || pusu.patternCode || 'UNKNOWN').toUpperCase();
    const direct = directEvidence(yon, patternCode);
    const confirmed = confirmedEvidence(yon);
    const armed = ayarlar.renkoGirisModuOtomatikAktif === true;
    const minConfirmed = Math.max(1, n(ayarlar.renkoGirisModuMinTeyitOrnek, 20));
    const minAdvantage = Math.max(0, n(ayarlar.renkoGirisModuMinSkorFarki, 8));
    const confirmedHealthy = confirmed.samples >= minConfirmed && confirmed.pf > 1 && confirmed.expectancy > 0 && confirmed.net > 0;
    const advantage = confirmed.score - direct.score;
    const useConfirmed = armed && confirmedHealthy && advantage >= minAdvantage;
    const selected = useConfirmed ? confirmed : direct;
    return {
        version: VERSION,
        selectedMode: selected.mode,
        selectedOffsetT: selected.offsetT,
        decisionSource: useConfirmed ? 'HISTORICAL_PLUS_LIVE_CONFIRMATION_LIFECYCLE' : (armed ? 'DIRECT_CHAMPION_GUARD' : 'DIRECT_SAFE_DEFAULT'),
        reason: useConfirmed
            ? `CONFIRMED üstün: fark ${advantage.toFixed(2)} / min ${minAdvantage.toFixed(2)}`
            : (!armed ? 'CONFIRMED_REAL_NOT_ARMED' : !confirmedHealthy ? 'CONFIRMED_EVIDENCE_NOT_MATURE' : `CONFIRMED_ADVANTAGE_INSUFFICIENT:${advantage.toFixed(2)}`),
        armed,
        frozenAt: new Date().toISOString(),
        direct,
        confirmed
    };
}
function confirmationTarget(pusu, bricks, boxSize, at = Date.now()) {
    const decision = pusu?.entryModeDecisionAtSignal || select(pusu);
    if (decision.selectedMode !== MODES.CONFIRMED) return { ready: false, reason: 'MODE_NOT_CONFIRMED', decision };
    const reversal = confirmationLab.findLatestReversal(bricks, pusu?.yon, at);
    const base = n(reversal?.confirmation?.close);
    const box = n(boxSize);
    if (!reversal?.found) return { ready: false, reason: 'CLOSED_REVERSAL_NOT_FOUND', decision, reversal };
    const signalAt = n(pusu?.olusumZamani, n(pusu?.createdAtMs, 0));
    const confirmationAt = n(reversal?.confirmation?.closeTime, 0);
    if (signalAt > 0 && confirmationAt > 0 && confirmationAt < signalAt) {
        return { ready: false, reason: 'REVERSAL_PREDATES_SIGNAL', decision, reversal, signalAt, confirmationAt };
    }
    if (!(base > 0 && box > 0)) return { ready: false, reason: 'CONFIRMATION_REFERENCE_INVALID', decision, reversal };
    const offsetT = n(decision.selectedOffsetT, 0.25);
    const targetPrice = String(pusu?.yon).toUpperCase() === 'SHORT' ? base - offsetT * box : base + offsetT * box;
    return { ready: targetPrice > 0, reason: targetPrice > 0 ? 'READY' : 'TARGET_INVALID', decision, reversal, basePrice: base, boxSize: box, offsetT, targetPrice };
}
function summary() {
    return { version: VERSION, armed: ayarlar.renkoGirisModuOtomatikAktif === true, policy: { minConfirmedSamples: n(ayarlar.renkoGirisModuMinTeyitOrnek, 20), minScoreAdvantage: n(ayarlar.renkoGirisModuMinSkorFarki, 8) } };
}
module.exports = { VERSION, MODES, select, directEvidence, confirmedEvidence, confirmationTarget, summary, _metricScore: metricScore };
