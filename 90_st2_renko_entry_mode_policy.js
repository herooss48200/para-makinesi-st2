'use strict';

/**
 * AGROS ST2 v6.13.5-R22.1 — Unified Renko Entry Mode Policy
 *
 * Gerçek giriş aileleri:
 * - DIRECT: Entry Evolution referansından seçilmiş offset.
 * - CONFIRMED: pusu SONRASI kapanmış 15m Renko dönüşü + 15m offset.
 *
 * R22 kanıt sözleşmesi:
 * - Gerçek CONFIRMED seçimini LEGACY 1m shadow N artık yapamaz.
 * - Mode selection, ayrı offline bootstrap worker'ın ürettiği 15m kanıt + gerçek canlı kapanış +
 *   DIRECT dönemlerinde counterfactual 15m-CONFIRMED shadow live evidence ile beslenir.
 * - Bootstrap DIRECT ve CONFIRMED aynı standardize tarihsel exit modeliyle
 *   karşılaştırılır; böylece mode kararı elma-elma olur.
 * - 1m Renko ST gerçek girişte yine zorunlu son sniper teyididir.
 * - Legacy 1m lifecycle yalnız teşhis/hafıza olarak raporlanır.
 */
const ayarlar = require('./ayarlar.js');
const entryEvolution = require('./73_st2_renko_entry_evolution.js');
const confirmationLab = require('./89_st2_renko_entry_confirmation_shadow_lab.js');
const evidence15m = require('./94_st2_15m_confirmed_evidence.js');

const VERSION = 'v6.13.5-R22.1-15M-CONFIRMED-SHADOW-LIVE-LEARNING';
const MODES = Object.freeze({ DIRECT: 'DIRECT', CONFIRMED: 'CONFIRMED' });

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function colorOf(brick) {
    const raw = String(brick?.color || brick?.renk || '').toUpperCase();
    if (raw === 'GREEN' || raw === 'G') return 'GREEN';
    if (raw === 'RED' || raw === 'R') return 'RED';
    const open = n(brick?.open, NaN);
    const close = n(brick?.close, NaN);
    if (Number.isFinite(open) && Number.isFinite(close)) return close >= open ? 'GREEN' : 'RED';
    return 'UNKNOWN';
}
function closedBricks(bricks, at = Date.now()) {
    return (Array.isArray(bricks) ? bricks : []).filter(x => {
        const close = n(x?.close, NaN);
        const closeTime = n(x?.closeTime, 0);
        return Number.isFinite(close) && (closeTime <= 0 || closeTime <= at);
    });
}
function signalCloseTime(pusu = {}) {
    return Math.max(
        0,
        n(pusu?.sonKapaliTuglaZamani, 0),
        n(pusu?.kaynakSonKapaliMumZamani, 0),
        n(pusu?.referansTuglaCloseTime, 0)
    );
}
function findLatest15mReversalAfterSignal(bricks, yon, pusu = {}, at = Date.now()) {
    const direction = String(yon || '').toUpperCase();
    const expectedA = direction === 'LONG' ? 'RED' : 'GREEN';
    const expectedB = direction === 'LONG' ? 'GREEN' : 'RED';
    const signalAt = signalCloseTime(pusu);
    const source = closedBricks(bricks, at);

    for (let i = source.length - 1; i >= 1; i--) {
        const previous = source[i - 1];
        const confirmation = source[i];
        if (colorOf(previous) !== expectedA || colorOf(confirmation) !== expectedB) continue;
        const previousAt = n(previous?.closeTime, 0);
        const confirmationAt = n(confirmation?.closeTime, 0);
        if (signalAt > 0) {
            if (!(confirmationAt > signalAt)) continue;
            if (previousAt > 0 && previousAt < signalAt) continue;
        }
        return {
            found: true,
            timeframe: '15m',
            direction,
            pair: `${expectedA}->${expectedB}`,
            signalCloseTime: signalAt,
            previous: {
                id: previous?.id ?? null,
                color: colorOf(previous),
                open: n(previous?.open), high: n(previous?.high), low: n(previous?.low), close: n(previous?.close),
                closeTime: previousAt
            },
            confirmation: {
                id: confirmation?.id ?? null,
                color: colorOf(confirmation),
                open: n(confirmation?.open), high: n(confirmation?.high), low: n(confirmation?.low), close: n(confirmation?.close),
                closeTime: confirmationAt
            }
        };
    }
    return {
        found: false,
        timeframe: '15m',
        direction,
        pair: `${expectedA}->${expectedB}`,
        signalCloseTime: signalAt
    };
}
function metricScore(m = {}) {
    const samples = n(m.triggered, n(m.samples, n(m.n)));
    const pf = Math.min(5, Math.max(0, n(m.pf)));
    const exp = n(m.expectancy);
    const net = n(m.net);
    const wr = Math.max(0, Math.min(100, n(m.wr)));
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
    return { mode: MODES.DIRECT, offsetT: brick, profileKey: key, evidenceTimeframe: 'LIVE_ENTRY_EVOLUTION', raw: candidate, ...metricScore(candidate) };
}
function confirmedEvidence(yon, patternCode = 'UNKNOWN', minSamplesOverride = null) {
    const minSamples = Math.max(1, n(minSamplesOverride, n(ayarlar.renkoGirisModuMinTeyitOrnek, 15)));
    const row = evidence15m.evidence(MODES.CONFIRMED, yon, patternCode, {
        minSamples,
        bootstrapCap: n(ayarlar.renkoGiris15mBootstrapMaksAgirlik, 30),
        shadowCap: n(ayarlar.renkoGiris15mShadowMaksAgirlik, 60)
    });
    return {
        ...row,
        mode: MODES.CONFIRMED,
        profileKey: `${String(yon).toUpperCase()}|${String(patternCode || 'UNKNOWN').toUpperCase()}|${Number(row.offsetT || ayarlar.renkoGirisTeyitVarsayilanTugla || 0.25).toFixed(2)}T`,
        evidenceTimeframe: '15M_CLOSED_RENKO_REVERSAL',
        evidenceSource: n(row.live?.samples) > 0 && n(row.shadow?.samples) > 0 ? '15M_BOOTSTRAP_PLUS_ACTUAL_PLUS_SHADOW_LIVE' : (n(row.shadow?.samples) > 0 ? '15M_BOOTSTRAP_PLUS_SHADOW_LIVE' : (n(row.live?.samples) > 0 ? '15M_BOOTSTRAP_PLUS_ACTUAL_LIVE' : (n(row.bootstrap?.samples) > 0 ? '15M_BOOTSTRAP_PRIOR' : 'NO_DATA')))
    };
}
function comparableDirectEvidence(yon, patternCode = 'UNKNOWN', minSamplesOverride = null) {
    const minSamples = Math.max(1, n(minSamplesOverride, n(ayarlar.renkoGirisModuMinTeyitOrnek, 15)));
    const row = evidence15m.evidence(MODES.DIRECT, yon, patternCode, {
        minSamples,
        bootstrapCap: n(ayarlar.renkoGiris15mBootstrapMaksAgirlik, 30),
        shadowCap: n(ayarlar.renkoGiris15mShadowMaksAgirlik, 60)
    });
    return { ...row, mode: MODES.DIRECT, evidenceTimeframe: '15M_STANDARDIZED_BOOTSTRAP_AND_LIVE' };
}
function legacyConfirmedHint(yon, patternCode = 'UNKNOWN', minSamplesOverride = null) {
    const summary = confirmationLab.summary();
    const direction = String(yon).toUpperCase();
    const pattern = String(patternCode || 'UNKNOWN').toUpperCase();
    const minSamples = Math.max(1, n(minSamplesOverride, n(ayarlar.renkoGirisModuMinTeyitOrnek, 15)));
    const all = (summary.lifecycle?.profiles || [])
        .map(x => ({ ...x, parts: String(x.key || '').split('|') }))
        .filter(x => x.parts[0] === direction)
        .map(x => ({ ...x, offsetT: n(x.parts.at(-1).replace('T', '')) }))
        .filter(x => x.offsetT > 0);
    const scoreRows = (rows, scope) => rows.map(x => ({ ...x, scored: metricScore(x), evidenceScope: scope, evidenceTimeframe: 'LEGACY_1M_SHADOW' }));
    const exactRows = scoreRows(all.filter(x => x.parts.length >= 3 && x.parts[1] === pattern), 'EXACT_PATTERN');
    const legacyRows = scoreRows(all.filter(x => x.parts.length === 2), 'DIRECTION_FALLBACK');
    const matureExact = exactRows.filter(x => x.scored.samples >= minSamples);
    const matureLegacy = legacyRows.filter(x => x.scored.samples >= minSamples);
    const sourceRows = matureExact.length ? matureExact : matureLegacy.length ? matureLegacy : exactRows.length ? exactRows : legacyRows;
    const rows = sourceRows.sort((a, b) => b.scored.wr - a.scored.wr || b.scored.samples - a.scored.samples || b.scored.pf - a.scored.pf || a.offsetT - b.offsetT);
    const best = rows[0] || null;
    return best
        ? { mode: MODES.CONFIRMED, offsetT: best.offsetT, profileKey: best.key, evidenceScope: best.evidenceScope, evidenceTimeframe: 'LEGACY_1M_SHADOW', raw: best, ...best.scored }
        : { mode: MODES.CONFIRMED, offsetT: n(ayarlar.renkoGirisTeyitVarsayilanTugla, 0.25), profileKey: `${yon}|NO_DATA`, evidenceTimeframe: 'LEGACY_1M_SHADOW', ...metricScore({}) };
}
function select(pusu = {}) {
    const yon = String(pusu.yon || '').toUpperCase();
    const patternCode = String(pusu.patternKodu || pusu.patternCode || 'UNKNOWN').toUpperCase();
    const direct = directEvidence(yon, patternCode);
    const armed = ayarlar.renkoGirisModuOtomatikAktif === true;
    const minConfirmed = Math.max(1, n(ayarlar.renkoGirisModuMinTeyitOrnek, 15));
    const minSuccess = Math.max(0, Math.min(100, n(ayarlar.renkoGirisModuMinBasariYuzde, 75)));
    const minWrAdvantage = n(ayarlar.renkoGirisModuMinWrAvantaj, 2);
    const minExpAdvantage = n(ayarlar.renkoGirisModuMinExpAvantaj, 0);
    const confirmed = confirmedEvidence(yon, patternCode, minConfirmed);
    const directComparable = comparableDirectEvidence(yon, patternCode, minConfirmed);
    const legacy1mShadowHint = legacyConfirmedHint(yon, patternCode, minConfirmed);

    const confirmedHealthy = confirmed.samples >= minConfirmed && confirmed.wr >= minSuccess && confirmed.pf > 1 && confirmed.expectancy > 0 && confirmed.net > 0;
    const comparableMature = directComparable.samples >= minConfirmed;
    const wrAdvantage = confirmed.wr - directComparable.wr;
    const expAdvantage = confirmed.expectancy - directComparable.expectancy;
    const comparativeHealthy = !comparableMature || (wrAdvantage >= minWrAdvantage && expAdvantage >= minExpAdvantage);
    const useConfirmed = armed && confirmedHealthy && comparativeHealthy;
    const selected = useConfirmed ? confirmed : direct;

    let fallbackReason = null;
    if (!armed) fallbackReason = 'CONFIRMED_REAL_NOT_ARMED';
    else if (!(confirmed.samples >= minConfirmed)) fallbackReason = `15M_CONFIRMED_N_YETERSIZ:${confirmed.samples.toFixed ? confirmed.samples.toFixed(1) : confirmed.samples}<${minConfirmed}`;
    else if (!(confirmed.wr >= minSuccess && confirmed.pf > 1 && confirmed.expectancy > 0 && confirmed.net > 0)) fallbackReason = `15M_CONFIRMED_EKONOMI_YETERSIZ:WR${confirmed.wr.toFixed(1)}|PF${confirmed.pf.toFixed(2)}|EXP${confirmed.expectancy.toFixed(4)}`;
    else if (!comparativeHealthy) fallbackReason = `15M_CONFIRMED_DIRECT_AVANTAJ_YOK:WR_DELTA${wrAdvantage.toFixed(1)}|EXP_DELTA${expAdvantage.toFixed(4)}`;

    return {
        version: VERSION,
        selectedMode: selected.mode,
        selectedOffsetT: selected.offsetT,
        decisionSource: useConfirmed ? '15M_CONFIRMED_BOOTSTRAP_LIVE_EVIDENCE' : (armed ? 'DIRECT_15M_COMPARATIVE_GUARD' : 'DIRECT_SAFE_DEFAULT'),
        timingAuthority: useConfirmed ? 'CLOSED_15M_RENKO_REVERSAL_PLUS_OFFSET' : 'DIRECT_RENKO_EVOLUTION',
        reason: useConfirmed
            ? `CONFIRMED: 15m kanıt N${confirmed.samples.toFixed(1)} WR %${confirmed.wr.toFixed(1)} PF ${confirmed.pf.toFixed(2)} Exp ${confirmed.expectancy >= 0 ? '+' : ''}${confirmed.expectancy.toFixed(4)} | DIRECT karşılaştırma WR Δ${wrAdvantage.toFixed(1)} Exp Δ${expAdvantage.toFixed(4)} | 1m ST gerçek girişte zorunlu`
            : fallbackReason,
        armed,
        frozenAt: new Date().toISOString(),
        wrAdvantage,
        expAdvantage,
        direct,
        directComparable,
        confirmed,
        legacy1mShadowHint
    };
}
function confirmationTarget(pusu, bricks15m, boxSize15m, at = Date.now()) {
    const decision = pusu?.entryModeDecisionAtSignal || select(pusu);
    if (decision.selectedMode !== MODES.CONFIRMED) return { ready: false, reason: 'MODE_NOT_CONFIRMED', decision, timeframe: '15m' };
    const reversal = findLatest15mReversalAfterSignal(bricks15m, pusu?.yon, pusu, at);
    if (!reversal?.found) return { ready: false, reason: 'CLOSED_15M_REVERSAL_NOT_FOUND', decision, reversal, timeframe: '15m' };
    const base = n(reversal?.confirmation?.close);
    const box = n(boxSize15m);
    if (!(base > 0 && box > 0)) return { ready: false, reason: 'CONFIRMATION_15M_REFERENCE_INVALID', decision, reversal, timeframe: '15m' };
    const offsetT = n(decision.selectedOffsetT, 0.25);
    const targetPrice = String(pusu?.yon).toUpperCase() === 'SHORT' ? base - offsetT * box : base + offsetT * box;
    return {
        ready: targetPrice > 0,
        reason: targetPrice > 0 ? 'READY_15M_CLOSED_REVERSAL' : 'TARGET_INVALID',
        decision,
        reversal,
        timeframe: '15m',
        basePrice: base,
        boxSize: box,
        offsetT,
        targetPrice
    };
}
function summary() {
    const ev = evidence15m.summary();
    return {
        version: VERSION,
        armed: ayarlar.renkoGirisModuOtomatikAktif === true,
        policy: {
            minConfirmedSamples: n(ayarlar.renkoGirisModuMinTeyitOrnek, 15),
            minSuccessRate: n(ayarlar.renkoGirisModuMinBasariYuzde, 75),
            minWrAdvantage: n(ayarlar.renkoGirisModuMinWrAvantaj, 2),
            minExpAdvantage: n(ayarlar.renkoGirisModuMinExpAvantaj, 0),
            bootstrapMaxWeight: n(ayarlar.renkoGiris15mBootstrapMaksAgirlik, 30),
            shadowLiveMaxWeight: n(ayarlar.renkoGiris15mShadowMaksAgirlik, 60),
            objective: '15M_COMPARATIVE_BOOTSTRAP_PLUS_ACTUAL_AND_COUNTERFACTUAL_SHADOW_LIVE_EVIDENCE',
            confirmedTimingAuthority: '15M_CLOSED_RENKO_REVERSAL_PLUS_OFFSET',
            finalSniperAuthority: '1M_RENKO_SUPERTREND',
            legacy1mShadowAuthority: false
        },
        evidence: ev
    };
}
module.exports = {
    VERSION, MODES, select, directEvidence, confirmedEvidence, comparableDirectEvidence, legacyConfirmedHint, confirmationTarget, summary,
    findLatest15mReversalAfterSignal,
    _metricScore: metricScore,
    _signalCloseTime: signalCloseTime
};
