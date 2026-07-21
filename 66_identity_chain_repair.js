'use strict';

/**
 * AGROS v5.0.6 — IDENTITY CHAIN REPAIR
 *
 * Tek giriş zinciri sözleşmesi:
 * RAW MARKET SNAPSHOT (ön koşul) -> IDENTITY -> LEAGUE -> EXIT -> BLACKBOX -> TELEGRAM
 *
 * Bu modül karar kurallarını değiştirmez. Mevcut kimlik, League ve Exit
 * motorlarını yalnızca sabit sırayla çağırır; eksik kimlikli pozisyonun state'e
 * girmesini engelleyen bütünlük denetimini sağlar.
 */
const blackbox = require('./8_blackbox.js');
const dnaHierarchy = require('./60_hierarchical_dna_identity_registry.js');
const dnaLeague = require('./46_dna_league_engine.js');
const dnaExitSelector = require('./43_dna_exit_selector.js');
const realOrderBridge = require('./50_real_order_readiness_bridge.js');
const labPremier = require('./62_lab_premier_league.js');

const VERSION = 'v5.1.0-DYNAMIC-LAB-IDENTITY-CHAIN';
const ORDER = Object.freeze(['IDENTITY', 'LEAGUE', 'EXIT', 'BLACKBOX', 'TELEGRAM']);

function chainError(code, detail = '') {
  const err = new Error(`${code}${detail ? `:${detail}` : ''}`);
  err.code = code;
  return err;
}

function validLabel(label, prefix) {
  const text = String(label || '');
  return text.startsWith(`${prefix} #`) && !text.endsWith('#YOK') && !text.includes('#YOK');
}

function snapshotDogrula(snap) {
  const sig = snap?.strategySignature;
  if (!snap) throw chainError('IDENTITY_CHAIN_SNAPSHOT_YOK');
  if (!sig?.key) throw chainError('IDENTITY_CHAIN_SIGNATURE_YOK');
  if (!validLabel(sig.dnaLabel, 'DNA')) throw chainError('IDENTITY_CHAIN_DNA_YOK');
  if (!validLabel(sig.labDnaLabel, 'LAB')) throw chainError('IDENTITY_CHAIN_LAB_YOK');
  return snap;
}

function kimlikDogrula(pos, identities) {
  if (!identities?.family?.id || !validLabel(identities.family.label, 'DNA')) {
    throw chainError('IDENTITY_CHAIN_DNA_YOK');
  }
  if (!identities?.lab?.id || !validLabel(identities.lab.label, 'LAB')) {
    throw chainError('IDENTITY_CHAIN_LAB_YOK');
  }
  if (!identities?.full?.id || !validLabel(identities.full.label, 'FULL')) {
    throw chainError('IDENTITY_CHAIN_FULL_YOK');
  }
  if (!pos?.dnaIdentityKey || !pos?.labIdentityKey || !pos?.fullIdentityKey) {
    throw chainError('IDENTITY_CHAIN_KEY_YOK');
  }
}

function kararDogrula(pos) {
  const readiness = pos?.realOrderReadiness;
  const labDecision = pos?.labPremierDecision;
  const exit = pos?.executionExitAssignment;
  if (!readiness || readiness.key === 'SIGNATURE_YOK' || !validLabel(readiness.dnaLabel, 'DNA')) {
    throw chainError('IDENTITY_CHAIN_LEAGUE_YOK');
  }
  if (!labDecision || !validLabel(labDecision.labDnaLabel, 'LAB') || !validLabel(labDecision.fullDnaLabel, 'FULL')) {
    throw chainError('IDENTITY_CHAIN_LAB_LEAGUE_YOK');
  }
  if (!exit?.label || !exit?.assignmentId) {
    throw chainError('IDENTITY_CHAIN_EXIT_YOK');
  }
  if (readiness.dnaLabel !== pos.dnaLabel || labDecision.labDnaLabel !== pos.labDnaLabel || labDecision.fullDnaLabel !== pos.fullDnaLabel) {
    throw chainError('IDENTITY_CHAIN_LABEL_MISMATCH');
  }
}

function auditOlustur(pos) {
  pos.identityChainAudit = {
    version: VERSION,
    sequence: ORDER.join(' -> '),
    completed: ['IDENTITY', 'LEAGUE', 'EXIT'],
    status: 'PREPARED',
    preparedAt: new Date().toISOString(),
    dnaId: pos.dnaId,
    dnaLabel: pos.dnaLabel,
    labDnaId: pos.labDnaId,
    labDnaLabel: pos.labDnaLabel,
    fullDnaId: pos.fullDnaId,
    fullDnaLabel: pos.fullDnaLabel,
    league: pos.labPremierDecision?.labLeague || pos.realOrderReadiness?.league || 'DEVELOPMENT',
    exitAlgorithmId: pos.executionExitAssignment?.algorithmId || 'ACTUAL',
    exitLabel: pos.executionExitAssignment?.label || 'Mevcut Kademe Sistemi'
  };
  return pos.identityChainAudit;
}

function createCoordinator(deps = {}) {
  const d = {
    blackbox: deps.blackbox || blackbox,
    dnaHierarchy: deps.dnaHierarchy || dnaHierarchy,
    dnaLeague: deps.dnaLeague || dnaLeague,
    dnaExitSelector: deps.dnaExitSelector || dnaExitSelector,
    realOrderBridge: deps.realOrderBridge || realOrderBridge,
    labPremier: deps.labPremier || labPremier
  };

  function uyumFromSignature(sig = {}) {
    const btc = String(sig.btcBits || '').split('').filter(x => x === '1').length;
    const coin = String(sig.coinBits || '').split('').filter(x => x === '1').length;
    return {
      btc: { uygun: btc, toplam: 4, metin: `${btc}/4` },
      coin: { uygun: coin, toplam: 4, metin: `${coin}/4` },
      toplam: { uygun: btc + coin, toplam: 8, metin: `${btc + coin}/8` }
    };
  }

  async function prepare(pos, { realMode = false } = {}) {
    if (!pos) throw chainError('IDENTITY_CHAIN_POSITION_YOK');

    // Ağdan ham veri alma yalnız kimliğin ön koşuludur; kalıcı zincirin ilk
    // aşaması snapshot içinden üretilen değişmez kimliktir.
    pos.blackboxAcilis = snapshotDogrula(await d.blackbox.snapshotAl(pos.sym, pos.yon, 'ACILIS'));

    // 1) IDENTITY
    let identities = d.dnaHierarchy.decoratePosition(pos, { source: 'V510_IDENTITY_CHAIN' });
    kimlikDogrula(pos, identities);

    // 2) LEAGUE — önce sinyalin kendi LAB kimliği değerlendirilir.
    pos.dnaLeagueProfile = d.dnaLeague.attachToPosition(pos);
    let labDecision = d.labPremier.evaluate(pos, { realMode });

    // Sistematik kaybeden LAB yalnız sanal modda aynı sinyalin ters yönüne çevrilir.
    // İkinci pozisyon açılmaz; mevcut hazırlanmakta olan tek pozisyonun yönü ve kimliği yeniden bağlanır.
    if (!realMode && labDecision?.reverseExecution) {
      const sourceSnapshot = pos.blackboxAcilis;
      pos.reversePremierSource = {
        sourceSignalSide: pos.yon, sourceLabDnaId: identities.lab?.id || null,
        sourceLabDnaLabel: identities.lab?.label || 'LAB #YOK', sourceLabKey: identities.lab?.key || '',
        sourceStrategySignature: sourceSnapshot?.strategySignature ? { ...sourceSnapshot.strategySignature } : null
      };
      pos.originalSignalSide = pos.yon;
      pos.yon = labDecision.executionSide;
      sourceSnapshot.originalSignalSide = pos.originalSignalSide;
      sourceSnapshot.reverseExecution = true;
      sourceSnapshot.reverseSourceLabDnaLabel = labDecision.sourceLabDnaLabel;
      sourceSnapshot.reverseSourceLabKey = labDecision.sourceLabKey;
      sourceSnapshot.yon = pos.yon;
      sourceSnapshot.strategySignature = d.blackbox.strategySignatureOlustur(pos.sym, pos.yon, sourceSnapshot.btc, sourceSnapshot.coin);
      sourceSnapshot.uyum = uyumFromSignature(sourceSnapshot.strategySignature);

      identities = d.dnaHierarchy.decoratePosition(pos, { source: 'V510_REVERSE_PREMIER_REBIND' });
      kimlikDogrula(pos, identities);
      pos.dnaLeagueProfile = d.dnaLeague.attachToPosition(pos);
      labDecision = d.labPremier.bindReverseExecution(pos, labDecision);
    }

    // 3) EXIT — ters işlem dahil gerçek yürütme LAB kimliğinin güncel Exit'i seçilir.
    pos.exitPlanShadow = d.dnaExitSelector.attachToPosition(pos);
    d.realOrderBridge.evaluate(pos, { realMode });
    d.labPremier.applyToPosition(pos, labDecision);

    kararDogrula(pos);
    auditOlustur(pos);
    return pos;
  }

  function copyPrepared(target, source) {
    if (!target || !source) throw chainError('IDENTITY_CHAIN_COPY_SOURCE_YOK');
    const scalarFields = [
      'dnaId', 'dnaLabel', 'dnaIdentityKey',
      'labDnaId', 'labDnaLabel', 'labIdentityKey',
      'fullDnaId', 'fullDnaLabel', 'fullIdentityKey',
      'leagueShadowOnly', 'virtualAccountIncluded', 'labLeagueAtOpen',
      'labProofLevelAtOpen', 'premierTrackAtOpen', 'exitPlanActiveForVirtual',
      'originalSignalSide'
    ];
    for (const field of scalarFields) {
      if (Object.prototype.hasOwnProperty.call(source, field)) target[field] = source[field];
    }
    const objectFields = [
      'blackboxAcilis', 'dnaLeagueProfile', 'exitPlanShadow',
      'realOrderReadiness', 'executionExitAssignment', 'labPremierDecision',
      'reversePremierSource'
    ];
    for (const field of objectFields) {
      if (source[field]) target[field] = { ...source[field] };
    }
    if (target.executionExitAssignment) target.executionExitAssignment.immutable = true;
    target.identityChainAudit = source.identityChainAudit
      ? { ...source.identityChainAudit, completed: [...(source.identityChainAudit.completed || [])] }
      : null;
    assertPrepared(target);
    return target;
  }

  function assertPrepared(pos) {
    snapshotDogrula(pos?.blackboxAcilis);
    kimlikDogrula(pos, {
      family: { id: pos.dnaId, label: pos.dnaLabel },
      lab: { id: pos.labDnaId, label: pos.labDnaLabel },
      full: { id: pos.fullDnaId, label: pos.fullDnaLabel }
    });
    kararDogrula(pos);
    if (!pos.identityChainAudit || pos.identityChainAudit.status !== 'PREPARED') {
      throw chainError('IDENTITY_CHAIN_AUDIT_YOK');
    }
    return true;
  }

  function markStage(pos, stage) {
    assertPrepared(pos);
    const wanted = String(stage || '').toUpperCase();
    if (!ORDER.includes(wanted)) throw chainError('IDENTITY_CHAIN_STAGE_INVALID', wanted);
    const completed = pos.identityChainAudit.completed || [];
    if (completed.includes(wanted)) return pos.identityChainAudit;
    const expected = ORDER[completed.length];
    if (wanted !== expected) throw chainError('IDENTITY_CHAIN_STAGE_ORDER', `${wanted}_BEKLENEN_${expected}`);
    completed.push(wanted);
    pos.identityChainAudit.completed = completed;
    pos.identityChainAudit.status = wanted === 'TELEGRAM' ? 'COMPLETE' : 'PREPARED';
    pos.identityChainAudit[`${wanted.toLowerCase()}At`] = new Date().toISOString();
    return pos.identityChainAudit;
  }

  return { prepare, copyPrepared, assertPrepared, markStage };
}

const coordinator = createCoordinator();
module.exports = { VERSION, ORDER, createCoordinator, ...coordinator };
