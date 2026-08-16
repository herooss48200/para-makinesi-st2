'use strict';

// AGROS ST2 R26 CORE IDENTITY
// Yalnız N5/Premier kimliği: market snapshot -> Family/LAB/FULL -> N5 live review.
// Eski DNA League / dynamic exit / compatibility stages fiziksel olarak kaldırılmıştır.

const blackbox = require('./8_blackbox.js');
const hierarchy = require('./60_hierarchical_dna_identity_registry.js');
const labPremier = require('./62_n5_premier_economy.js');
const realOrderBridge = require('./50_real_order_readiness_bridge.js');

const VERSION = 'R26-CORE-N5-IDENTITY';
const ORDER = Object.freeze(['IDENTITY', 'PREMIER_N5', 'EXECUTION', 'TELEGRAM']);

function validLabel(label, prefix) {
    const text = String(label || '');
    return text.startsWith(`${prefix} #`) && !text.includes('#YOK');
}

async function prepare(pos, { realMode = false } = {}) {
    if (!pos) throw new Error('CORE_IDENTITY_POSITION_YOK');
    pos.blackboxAcilis = await blackbox.snapshotAl(pos.sym, pos.yon, 'ACILIS');
    if (!pos.blackboxAcilis?.strategySignature?.key) throw new Error('CORE_N5_SIGNATURE_YOK');

    const ids = hierarchy.decoratePosition(pos, { source: 'R26_CORE_N5' });
    if (!ids?.family?.id || !ids?.lab?.id || !ids?.full?.id) throw new Error('CORE_N5_IDENTITY_YOK');

    const labDecision = labPremier.evaluate(pos, { realMode });
    pos.labPremierDecision = labDecision;
    pos.labLeagueAtOpen = labDecision?.labLeague || 'DEVELOPMENT';
    pos.premierTrackAtOpen = labDecision?.premierTrack || 'SHADOW';
    pos.labProofLevelAtOpen = labDecision?.proofLevel || 'LEARNING';
    pos.realOrderReadiness = realOrderBridge.evaluate(pos, { realMode, scoreDecision: null });
    pos.executionExitAssignment = {
        ready: true, algorithmId: 'PERCENT_ECONOMY_CORE', label: 'Yüzdesel ekonomi', scope: 'R26_CORE',
        executionPolicy: 'SL_-2.5__ARM_+1.5__LOCK_+1.0__TRAIL_0.5', assignmentId: `R26|${ids.lab.label}|${Date.now()}`, immutable: true
    };
    pos.identityChainAudit = {
        version: VERSION, sequence: ORDER.join(' -> '), completed: ['IDENTITY','PREMIER_N5'], status: 'PREPARED', preparedAt: new Date().toISOString(),
        dnaId: pos.dnaId, dnaLabel: pos.dnaLabel, labDnaId: pos.labDnaId, labDnaLabel: pos.labDnaLabel, fullDnaId: pos.fullDnaId, fullDnaLabel: pos.fullDnaLabel
    };
    return pos;
}

function copyPrepared(target, source) {
    const scalar = ['dnaId','dnaLabel','dnaIdentityKey','labDnaId','labDnaLabel','labIdentityKey','fullDnaId','fullDnaLabel','fullIdentityKey','labLeagueAtOpen','premierTrackAtOpen','labProofLevelAtOpen'];
    for (const k of scalar) if (Object.prototype.hasOwnProperty.call(source || {}, k)) target[k] = source[k];
    for (const k of ['blackboxAcilis','labPremierDecision','realOrderReadiness','executionExitAssignment','renkoPremierDecision']) if (source?.[k]) target[k] = { ...source[k] };
    target.identityChainAudit = source?.identityChainAudit ? { ...source.identityChainAudit, completed:[...(source.identityChainAudit.completed || [])] } : null;
    return assertPrepared(target);
}

function assertPrepared(pos) {
    if (!validLabel(pos?.dnaLabel,'DNA') || !validLabel(pos?.labDnaLabel,'LAB') || !validLabel(pos?.fullDnaLabel,'FULL')) throw new Error('CORE_N5_IDENTITY_INCOMPLETE');
    if (!pos?.blackboxAcilis?.strategySignature?.key) throw new Error('CORE_N5_SIGNATURE_INCOMPLETE');
    return pos;
}

function markStage(pos, stage) {
    if (!pos?.identityChainAudit) return null;
    const s = String(stage || '').toUpperCase();
    if (!pos.identityChainAudit.completed.includes(s)) pos.identityChainAudit.completed.push(s);
    if (s === 'TELEGRAM') pos.identityChainAudit.status = 'COMPLETE';
    return pos.identityChainAudit;
}

module.exports = { VERSION, ORDER, prepare, copyPrepared, assertPrepared, markStage };
