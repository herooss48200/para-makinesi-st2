'use strict';

/**
 * AGROS ST2 v6.10.7 — Close Lifecycle Commit Barrier
 *
 * Gerçek kapanışın kritik kısmını (slot boşaltma + manuel kilit + kalıcı kayıt)
 * Telegram/rapor işinden ayırır. Rapor hattı gecikse veya hata verse bile gerçek
 * emir motoru kapanmış pozisyon nedeniyle bloke olmaz.
 */
const VERSION = 'v6.10.7-CLOSE-LIFECYCLE-COMMIT-BARRIER';

function n(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function removePosition(activePositions, pos, indexHint = -1) {
    if (!Array.isArray(activePositions)) return false;
    const hinted = Number(indexHint);
    if (Number.isInteger(hinted) && hinted >= 0 && activePositions[hinted] === pos) {
        activePositions.splice(hinted, 1);
        return true;
    }
    const index = activePositions.indexOf(pos);
    if (index >= 0) {
        activePositions.splice(index, 1);
        return true;
    }
    return false;
}

function commitRealClose(options = {}) {
    const {
        state,
        pos,
        indexHint = -1,
        reconciliation = {},
        livePrice = 0,
        manualLockMs = 3_600_000,
        removeAuxiliary = () => {},
        persist = () => {},
        now = Date.now(),
        logger = console
    } = options;

    if (!state || !pos) throw new Error('CLOSE_LIFECYCLE_INPUT_INVALID');
    if (pos.closeLifecycleCommittedAt) {
        return {
            ok: true,
            alreadyCommitted: true,
            manual: pos.manualExternalClose === true,
            closePrice: n(pos?.realizedExecution?.exitPrice, n(livePrice)),
            reason: pos?.realizedExecution?.reason || reconciliation?.reason || 'EXCHANGE_POSITION_CLOSED'
        };
    }

    const manual = reconciliation?.manual === true || pos.scientificLearningExcluded === true;
    const closePrice = n(reconciliation?.exitPrice, n(livePrice));
    const reason = reconciliation?.reason || (manual ? 'MANUAL_EXTERNAL_CLOSE' : 'EXCHANGE_POSITION_CLOSED');

    pos.realizedExecution = reconciliation;
    pos.manualExternalClose = manual;
    pos.closeLifecycleCommittedAt = now;
    pos.closeLifecycleReason = reason;

    if (manual) {
        const lockUntil = now + Math.max(0, n(manualLockMs, 3_600_000));
        pos.manualCloseLockUntil = lockUntil;
        state.manualCloseLocks = state.manualCloseLocks || {};
        state.manualCloseLocks[`${pos.sym}|${pos.yon}`] = lockUntil;
    }

    const removed = removePosition(state.aktifPozisyonlar, pos, indexHint);
    try {
        removeAuxiliary(pos);
    } catch (err) {
        logger.error?.(`⚠️ [CLOSE LIFECYCLE AUX CLEANUP] ${pos.sym} ${pos.yon} | ${err.message}`);
    }

    let persistenceError = null;
    try {
        persist(manual ? 'manuel-external-close-critical-commit' : 'gercek-close-critical-commit');
        pos.closeLifecyclePersistedAt = Date.now();
    } catch (err) {
        persistenceError = err;
        logger.error?.(`❌ [CLOSE LIFECYCLE PERSIST] ${pos.sym} ${pos.yon} | ${err.message}`);
    }

    return {
        ok: true,
        alreadyCommitted: false,
        removed,
        manual,
        closePrice,
        reason,
        persistenceError
    };
}

function scheduleCloseReport(options = {}) {
    const {
        pos,
        closePrice,
        reason,
        reportClose,
        sendPanel,
        persist = () => {},
        scheduler = setImmediate,
        logger = console
    } = options;

    if (!pos || typeof reportClose !== 'function') throw new Error('CLOSE_REPORT_INPUT_INVALID');
    if (pos.closeLifecycleReportScheduledAt) return { scheduled: false, duplicate: true };

    pos.closeLifecycleReportScheduledAt = Date.now();
    const task = async () => {
        let reportOk = false;
        try {
            await reportClose(pos, closePrice, reason);
            reportOk = true;
            pos.closeLifecycleReportedAt = Date.now();
        } catch (err) {
            pos.closeLifecycleReportError = String(err?.message || err || 'UNKNOWN').slice(0, 300);
            logger.error?.(`❌ [KAPANIŞ RAPOR ARKA PLAN HATASI] ${pos.sym} ${pos.yon} | ${pos.closeLifecycleReportError}`);
        }

        try {
            persist(reportOk ? 'gercek-close-report-complete' : 'gercek-close-report-failed');
        } catch (err) {
            logger.error?.(`⚠️ [KAPANIŞ RAPOR STATE HATASI] ${pos.sym} ${pos.yon} | ${err.message}`);
        }

        if (typeof sendPanel === 'function') {
            try {
                await sendPanel(true);
            } catch (err) {
                logger.error?.(`⚠️ [KAPANIŞ PANEL ARKA PLAN HATASI] ${pos.sym} ${pos.yon} | ${err.message}`);
            }
        }
        return { reportOk };
    };

    scheduler(() => {
        Promise.resolve(task()).catch(err => {
            logger.error?.(`❌ [KAPANIŞ ARKA PLAN FATAL] ${pos.sym} ${pos.yon} | ${err.message}`);
        });
    });
    return { scheduled: true, duplicate: false, task };
}

module.exports = {
    VERSION,
    commitRealClose,
    scheduleCloseReport,
    _removePosition: removePosition
};
