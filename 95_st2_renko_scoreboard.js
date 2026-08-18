'use strict';

/**
 * R30.1 reporting-only RENKO scoreboard.
 *
 * The execution ledger is intentionally NOT reset or rewritten. The live panel
 * continues from the last authoritative R29.2 race snapshot and then adds only
 * verified RENKO opens/closes that happened after that snapshot.
 */
const realExecution = require('./85_st2_real_order_execution.js');

// Authoritative Telegram snapshot observed on 18.08.2026 10:38:34 Europe/Istanbul.
// At this exact reporting checkpoint the R29.2 live race panel showed:
// Aç 12 | Kap 9 | W/L/BE 8/1/0 | WR 88.9 | Net +1.3272 | Kom 0.0890
const BASELINE = Object.freeze({
  cutoffIso: '2026-08-18T07:38:34.000Z',
  cutoffMs: Date.parse('2026-08-18T07:38:34.000Z'),
  opened: 12,
  closed: 9,
  wins: 8,
  losses: 1,
  be: 0,
  netPnl: 1.3272,
  commission: 0.0890
});

function finite(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function upper(v) { return String(v || '').trim().toUpperCase(); }
function parseMs(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : NaN;
}
function recordOpenedMs(record = {}) {
  return parseMs(
    record?.openedAt ||
    record?.positionSnapshot?.gercekEmirYurutme?.openedAt ||
    record?.positionSnapshot?.acilisZamani ||
    record?.preparedSnapshot?.gercekEmirYurutme?.openedAt ||
    ''
  );
}
function recordClosedMs(record = {}) {
  return parseMs(record?.closedAt || record?.protectionClosedAt || '');
}
function actualOpened(record = {}) {
  return Number.isFinite(recordOpenedMs(record));
}
function isRenko(record = {}) {
  return typeof realExecution.isRenkoRecord === 'function'
    ? realExecution.isRenkoRecord(record)
    : true;
}

function currentScoreboard() {
  const state = realExecution.readState();
  const out = {
    opened: BASELINE.opened,
    closed: BASELINE.closed,
    wins: BASELINE.wins,
    losses: BASELINE.losses,
    be: BASELINE.be,
    netPnl: BASELINE.netPnl,
    commission: BASELINE.commission,
    wr: 0,
    baseline: BASELINE,
    postBaselineOpened: 0,
    postBaselineClosed: 0
  };

  for (const record of Object.values(state?.records || {})) {
    if (!isRenko(record)) continue;

    const openedMs = recordOpenedMs(record);
    if (actualOpened(record) && openedMs > BASELINE.cutoffMs) {
      out.opened++;
      out.postBaselineOpened++;
    }

    const closedMs = recordClosedMs(record);
    if (upper(record?.status) !== 'CLOSED' || !(closedMs > BASELINE.cutoffMs)) continue;

    out.closed++;
    out.postBaselineClosed++;
    const net = finite(record?.netPnl, finite(record?.accounting?.netPnl, 0));
    const commission = finite(record?.totalCommission, finite(record?.accounting?.commission, 0));
    out.netPnl += net;
    out.commission += commission;
    if (net > 1e-9) out.wins++;
    else if (net < -1e-9) out.losses++;
    else out.be++;
  }

  out.netPnl = Number(out.netPnl.toFixed(8));
  out.commission = Number(out.commission.toFixed(8));
  out.wr = out.wins + out.losses > 0
    ? Number((out.wins / (out.wins + out.losses) * 100).toFixed(2))
    : 0;
  return out;
}

module.exports = {
  BASELINE,
  currentScoreboard,
  _test: { finite, upper, parseMs, recordOpenedMs, recordClosedMs, actualOpened, isRenko }
};
