'use strict';

/**
 * AGROS ST2 Final Scientific Certification
 * Read-only scientific readiness report. It never changes Trade Engine decisions.
 */
const os = require('os');
const ayarlar = require('./ayarlar.js');
const labPremier = require('./62_lab_premier_league.js');
const exitAudit = require('./57_exit_victory_audit.js');
const lifecycle = require('./68_lab_lifecycle_evolution.js');
const accounting = require('./65_accounting_continuity.js');

function n(v, d = 0) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function signed(v, digits = 4) { const x = n(v); return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`; }
function pf(v) { const x = n(v); return x >= 999 ? '∞' : x.toFixed(2); }
function mark(ok, waiting = false) { return ok ? '✅' : (waiting ? '🟡' : '❌'); }

function lifecycleStats() {
  try {
    const state = lifecycle.read();
    const rows = Object.values(state?.byLab || {}).filter(x => x && !x.migratedToProfileKey);
    const min = Math.max(1, n(ayarlar.labLifecycleMinKapanis, 5));
    const ready = rows.filter(x => n(x.closed) >= min);
    const stopChanged = rows.filter(x => Array.isArray(x.stop?.history) && x.stop.history.length > 0);
    const beChanged = rows.filter(x => Array.isArray(x.be?.history) && x.be.history.length > 0);
    return { rows, ready, stopChanged, beChanged, min };
  } catch (_) {
    return { rows: [], ready: [], stopChanged: [], beChanged: [], min: Math.max(1, n(ayarlar.labLifecycleMinKapanis, 5)) };
  }
}

function build(activePositions = []) {
  const premier = labPremier.summaryModel(activePositions, { force: true });
  const audit = exitAudit.build(activePositions);
  const continuity = accounting.snapshot(activePositions);
  const life = lifecycleStats();
  const tracks = premier.trackMetrics || {};
  const reversePipeline = premier.reversePipeline || {};
  const cf = premier.bottomCounterfactual || {};
  const assignment = audit.assignmentStats || {};

  const checks = [
    { key: 'premier', label: 'Premier kasa izolasyonu', ok: Boolean(premier.accounting?.reconciled), detail: `Fark ${n(premier.accounting?.difference)}` },
    { key: 'bottom', label: 'Bottom LONG/SHORT ligleri', ok: n(premier.league?.bottomLongCount) > 0 && n(premier.league?.bottomShortCount) > 0, waiting: true, detail: `L${n(premier.league?.bottomLongCount)} / S${n(premier.league?.bottomShortCount)}` },
    { key: 'bottomLedger', label: 'Bottom ayrı performans defteri', ok: tracks.bottomLong !== undefined && tracks.bottomShort !== undefined, detail: `N${n(tracks.bottomLong?.closed) + n(tracks.bottomShort?.closed)}` },
    { key: 'reverse', label: 'Reverse kimlik ve açılış zinciri', ok: n(reversePipeline.opened) > 0, waiting: n(premier.league?.reversePremierCount) > 0, detail: `Aday ${n(premier.league?.reversePremierCount)} / Açılan ${n(reversePipeline.opened)}` },
    { key: 'counterfactual', label: 'Karşı-olgusal denetim', ok: Boolean(cf.baseline && cf.withoutBottom), detail: `Δ ${signed(n(cf.withoutBottom?.net) - n(cf.baseline?.net))}` },
    { key: 'exit', label: 'Exit executor ve atama zinciri', ok: n(audit.health?.unsupported) === 0 && n(assignment.mismatch) === 0, waiting: n(assignment.ready) === 0, detail: `Hazır ${n(assignment.ready)} / Uyuşmazlık ${n(assignment.mismatch)}` },
    { key: 'stop', label: `Stop öğrenmesi N${life.min}`, ok: life.stopChanged.length > 0, waiting: true, detail: `Hazır profil ${life.ready.length} / Değişen ${life.stopChanged.length}` },
    { key: 'be', label: `BE öğrenmesi N${life.min}`, ok: life.beChanged.length > 0, waiting: true, detail: `Hazır profil ${life.ready.length} / Değişen ${life.beChanged.length}` },
    { key: 'gap', label: 'GAP karantinası ve kanonik mutabakat', ok: Boolean(continuity.reconciled), waiting: !continuity.migrationBatchReconciled, detail: `Kanonik fark ${n(continuity.difference)} | Eski sayaç audit ${n(continuity.rawLedgerDifference)}` },
    { key: 'mode', label: 'Gerçek emir fail-closed', ok: ayarlar.sanalEmirModu === true, detail: ayarlar.sanalEmirModu === true ? 'SANAL' : 'GERÇEK' }
  ];

  const passed = checks.filter(x => x.ok).length;
  const score = Math.round((passed / checks.length) * 1000) / 10;
  const blockers = checks.filter(x => !x.ok && !x.waiting).map(x => x.label);
  const evidenceWaiting = checks.filter(x => !x.ok && x.waiting).map(x => x.label);

  return {
    version: '5.4.1', score, passed, total: checks.length, blockers, evidenceWaiting, checks,
    premier, audit, continuity, lifecycle: life,
    runtime: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), load1m: n(os.loadavg?.()[0]) },
    certified: blockers.length === 0 && evidenceWaiting.length === 0,
    status: blockers.length ? 'BLOKE' : (evidenceWaiting.length ? 'CANLI KANIT BEKLENİYOR' : 'ST2 BİLİMSEL OLARAK TAMAM')
  };
}

function topLine(row) {
  const h = row?.historical || {};
  return `${row?.labDnaLabel || 'LAB #?'} ${row?.executionSide || row?.side || ''} | N${n(h.total)} Net ${signed(h.net)} PF ${pf(h.profitFactor)} Exp ${signed(h.expectancy)}`;
}

function telegram(model = null) {
  const m = model || build([]);
  const p = m.premier;
  const tracks = p.trackMetrics || {};
  const cf = p.bottomCounterfactual || {};
  const rp = p.reversePipeline || {};
  const assignment = m.audit.assignmentStats || {};
  let t = `🧾 <b>ST2 FİNAL BİLİMSEL DENETİM — v6.1.2</b>\n`;
  t += `🎓 Hazırlık ${m.score.toFixed(1)}% | ${m.passed}/${m.total} | ${m.status}\n`;
  t += `🔒 Trade Engine değişmedi | Emir modu ${ayarlar.sanalEmirModu ? 'SANAL / FAIL-CLOSED' : 'GERÇEK'}\n\n`;

  t += `💰 <b>BAĞIMSIZ KASALAR</b>\n`;
  t += `🏆 Premier N${n(tracks.historical?.closed)} Net ${signed(tracks.historical?.net)} PF ${pf(tracks.historical?.profitFactor)} Exp ${signed(tracks.historical?.expectancy)}\n`;
  t += `🔴 Bottom LONG N${n(tracks.bottomLong?.closed)} Net ${signed(tracks.bottomLong?.net)} PF ${pf(tracks.bottomLong?.profitFactor)} Exp ${signed(tracks.bottomLong?.expectancy)}\n`;
  t += `🔴 Bottom SHORT N${n(tracks.bottomShort?.closed)} Net ${signed(tracks.bottomShort?.net)} PF ${pf(tracks.bottomShort?.profitFactor)} Exp ${signed(tracks.bottomShort?.expectancy)}\n`;
  t += `🔁 Reverse N${n(tracks.reverse?.closed)} Net ${signed(tracks.reverse?.net)} PF ${pf(tracks.reverse?.profitFactor)} Exp ${signed(tracks.reverse?.expectancy)}\n`;

  t += `\n🧮 <b>KARŞI-OLGUSAL</b>\n`;
  t += `Baz N${n(cf.baseline?.closed)} Net ${signed(cf.baseline?.net)} PF ${pf(cf.baseline?.profitFactor)}\n`;
  t += `Bottom çıkarılırsa N${n(cf.withoutBottom?.closed)} Net ${signed(cf.withoutBottom?.net)} PF ${pf(cf.withoutBottom?.profitFactor)} | Δ ${signed(n(cf.withoutBottom?.net) - n(cf.baseline?.net))}\n`;

  t += `\n🔁 <b>REVERSE ZİNCİRİ</b>\n`;
  t += `Aday ${n(p.league?.reversePremierCount)} → Değerlendirildi ${n(rp.evaluated)} → Kimlik bağlandı ${n(rp.bound)} → Açıldı ${n(rp.opened)} | Hata ${n(rp.identityMismatch)}\n`;

  const bl = p.league?.bottomLong || [];
  const bs = p.league?.bottomShort || [];
  if (bl.length || bs.length) {
    t += `\n📉 <b>BOTTOM İLK KAYITLAR</b>\n`;
    bl.slice(0, 2).forEach(x => { t += `L: ${topLine(x)}\n`; });
    bs.slice(0, 2).forEach(x => { t += `S: ${topLine(x)}\n`; });
  }

  t += `\n🎯 <b>EXIT / STOP / BE KANITI</b>\n`;
  t += `Exit hazır ${n(assignment.ready)} | Fallback ${n(assignment.fallback)} | Uyuşmazlık ${n(assignment.mismatch)}\n`;
  t += `Stop: Profil N${m.lifecycle.rows.length} | N${m.lifecycle.min} hazır ${m.lifecycle.ready.length} | Değişen ${m.lifecycle.stopChanged.length}\n`;
  t += `BE: Profil N${m.lifecycle.rows.length} | N${m.lifecycle.min} hazır ${m.lifecycle.ready.length} | Değişen ${m.lifecycle.beChanged.length}\n`;

  t += `\n🧪 <b>KABUL KONTROLLERİ</b>\n`;
  for (const c of m.checks) t += `${mark(c.ok, c.waiting)} ${c.label} — ${c.detail}\n`;
  t += `\n🧠 Runtime RSS ${m.runtime.rssMb} MB | Heap ${m.runtime.heapMb} MB\n`;
  t += `🔐 Bottom/Reverse ana Premier kasasına ve GAP öğrenmesine karışmaz.`;
  return t;
}

module.exports = { build, telegram, lifecycleStats };
