'use strict';

// AGROS ST2 R26 CORE REAL-ORDER AUTHORITY
// Eski DNA league / dynamic exit / preparation katmanları kaldırıldı.

const ayarlar = require('./ayarlar.js');
const binanceEndpointAuthority = require('./86_st2_binance_endpoint_authority.js');

const VERSION = 'R26-CORE-REAL-ORDER-AUTHORITY';
const EXECUTION_ACK_EXPECTED = 'V610_REVIEWED';

function liveRiskProfile() {
    const marginRaw = Number(ayarlar.calisilmakIstenenUsdtMiktar);
    const leverageRaw = Number(ayarlar.mevcutKaldirac);
    const maxActiveRaw = Number(ayarlar.gercekEmirMaxAktifPozisyon);
    const marginUsdt = Number.isFinite(marginRaw) ? marginRaw : NaN;
    const leverage = Number.isFinite(leverageRaw) ? Math.floor(leverageRaw) : NaN;
    return {
        marginUsdt,
        notionalUsdt: Number.isFinite(marginUsdt) && Number.isFinite(leverage) ? Number((marginUsdt * leverage).toFixed(8)) : NaN,
        leverage,
        marginType: typeof ayarlar.gercekEmirMarjinTipi === 'string' ? ayarlar.gercekEmirMarjinTipi.trim().toUpperCase() : '',
        maxActivePositions: Number.isFinite(maxActiveRaw) ? Math.floor(maxActiveRaw) : NaN,
        protectionRequired: ayarlar.gercekEmirKorumaEmirleriZorunlu !== false
    };
}

function realAuthorization() {
    const enabled = ayarlar.gercekEmirYetkilendirmeAktif === true;
    const expected = String(ayarlar.gercekEmirOnayKodu || '').trim();
    const supplied = String(process.env.AGROS_REAL_ORDER_ARM || '').trim();
    const environment = String(process.env.AGROS_REAL_ORDER_ENV || '').trim().toUpperCase();
    const executionAck = String(process.env.AGROS_REAL_ORDER_EXECUTION_ACK || '').trim().toUpperCase();
    const endpoint = binanceEndpointAuthority.resolve();
    const environmentValid = !ayarlar.gercekEmirAnaAgZorunlu
        ? endpoint.known && endpoint.environmentMatches
        : binanceEndpointAuthority.realTradingEndpointValid(endpoint);
    const executionAckValid = executionAck === EXECUTION_ACK_EXPECTED;
    return {
        enabled,
        armValid: enabled && Boolean(expected) && supplied === expected,
        executionAckValid,
        environment,
        baseUrl: endpoint.httpFutures,
        endpointKnown: endpoint.known,
        endpointEnvironmentMatches: endpoint.environmentMatches,
        testnet: endpoint.testnet,
        mainnet: endpoint.mainnet,
        environmentValid,
        valid: enabled && Boolean(expected) && supplied === expected && environmentValid && executionAckValid
    };
}

function evaluate(pos, { realMode = false, scoreDecision = null } = {}) {
    const auth = realAuthorization();
    const risk = liveRiskProfile();
    const scoreSelected = scoreDecision?.selected === true;
    const calibrated = String(scoreDecision?.policySource || '').toUpperCase() === 'CALIBRATED';
    const reasons = [];
    if (realMode && !scoreSelected) reasons.push('PREMIER_SCORE_NOT_SELECTED');
    if (realMode && !calibrated) reasons.push('PREMIER_SCORE_MODEL_NOT_CALIBRATED');
    if (realMode && !auth.valid) reasons.push('GERCEK_EMIR_YETKISI_YOK');
    if (realMode && !(risk.notionalUsdt > 0)) reasons.push('GERCEK_EMIR_NOTIONAL_GECERSIZ');
    if (realMode && !(Number.isInteger(risk.maxActivePositions) && risk.maxActivePositions > 0)) reasons.push('GERCEK_EMIR_AKTIF_POZISYON_LIMITI_GECERSIZ');
    const key = pos?.blackboxAcilis?.strategySignature?.key || 'SIGNATURE_YOK';
    const decision = {
        version: VERSION, mode: realMode ? 'REAL' : 'VIRTUAL', symbol: pos?.sym || '', side: pos?.yon || '',
        key, dnaLabel: pos?.dnaLabel || pos?.blackboxAcilis?.strategySignature?.dnaLabel || 'DNA #YOK',
        allowed: realMode ? reasons.length === 0 : true, reasons,
        realTier: scoreSelected ? 'PREMIER' : null, sizeMultiplier: scoreSelected ? 1 : 0,
        premierScore: scoreDecision || null, authorization: realMode ? auth : undefined, liveRisk: realMode ? risk : undefined,
        exit: { ready:true, algorithmId:'PERCENT_ECONOMY_CORE', label:'Yüzdesel ekonomi', scope:'R26_CORE', executionPolicy:'SL_-2.5__ARM_+1.5__LOCK_+1.0__TRAIL_0.5', activeForPosition:true }
    };
    if (pos) pos.realOrderReadiness = decision;
    return decision;
}

module.exports = { VERSION, realAuthorization, liveRiskProfile, evaluate };
