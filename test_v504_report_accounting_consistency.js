'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ledger = require('./65_accounting_continuity.js');

const old = {
  summary: h.state.basariOzeti,
  gap: h.state.restartGapOzet,
  active: h.state.aktifPozisyonlar,
  continuity: h.state.accountingContinuity
};

try {
  h.state.basariOzeti = {
    tp: 1000,
    sl: 1000,
    be: 105,
    toplamAcilanEmir: 2702,
    toplamKomisyon: 0,
    netKarZarar: 0
  };
  h.state.restartGapOzet = { closedQuarantined: 44 };
  h.state.aktifPozisyonlar = [];
  h.state.accountingContinuity = null;

  const migrated = ledger.initializeMigration();
  assert.strictEqual(migrated.legacy.openedCounter, 2702);
  assert.strictEqual(migrated.legacy.scientificClosed, 2105);
  assert.strictEqual(migrated.legacy.restartGapClosed, 44);
  assert.strictEqual(migrated.legacy.classifiedDifference, 553, '597 farkın 44 Gap sonrası kalan 553 bölümü tarihsel fark olarak sınıflanmalı');

  const premier = { sym: 'AAAUSDT', yon: 'LONG', sanal: true, sanalOrderId: 'A1', labPremierDecision: { upperLayerIncluded: true } };
  const shadow = { sym: 'BBBUSDT', yon: 'SHORT', sanal: true, sanalOrderId: 'B1', labPremierDecision: { upperLayerIncluded: false, virtualShadowOnly: true } };
  assert.strictEqual(ledger.trackAtOpen(premier), true);
  assert.strictEqual(ledger.trackAtOpen(shadow), true);
  assert.strictEqual(ledger.trackAtOpen(shadow), false, 'aynı açılış iki kez sayılmamalı');
  assert.strictEqual(ledger.trackAtClose(premier, { scientific: true }), true);
  assert.strictEqual(ledger.trackAtClose(premier, { scientific: true }), false, 'aynı kapanış iki kez sayılmamalı');

  h.state.aktifPozisyonlar = [shadow];
  const snap = ledger.snapshot(h.state.aktifPozisyonlar);
  assert.strictEqual(snap.current.opened, 2);
  assert.strictEqual(snap.current.closed, 1);
  assert.strictEqual(snap.trackedActive, 1);
  assert.strictEqual(snap.difference, 0);
  assert.strictEqual(snap.reconciled, true);


  const closeModule = require('./4_pozisyon.js');
  const commonIdentity = {
    sanal: true,
    dnaLabel: 'DNA #32',
    labDnaLabel: 'LAB #67',
    fullDnaLabel: 'FULL #10',
    realOrderReadiness: { key: 'YON=LONG|BTC=0011|COIN=0010' }
  };
  assert.strictEqual(closeModule._kapanisRaporKimligi({ ...commonIdentity, labPremierDecision: { upperLayerIncluded: true, labLeague: 'PREMIER', proofLevel: 'FORWARD' } }, false).title, '[LAB PREMIER SANAL POZİSYON KAPANDI]');
  assert.strictEqual(closeModule._kapanisRaporKimligi({ ...commonIdentity, leagueShadowOnly: true, labPremierDecision: { upperLayerIncluded: false, virtualShadowOnly: true, labLeague: 'DEVELOPMENT', proofLevel: 'LEARNING' } }, false).title, '[LAB GÖLGE ÖĞRENME KAPANDI]');
  assert.strictEqual(closeModule._kapanisRaporKimligi({ ...commonIdentity }, true).title, '[RESTART GAP SANAL POZİSYON KAPANDI]');

  const reportSource = fs.readFileSync(path.join(__dirname, '2_rapor.js'), 'utf8');
  assert.ok(reportSource.includes('Geçmiş sayaç: Açılış'));
  assert.ok(reportSource.includes('Tarihsel sayaç farkı'));
  assert.ok(reportSource.includes('v5.0.4 kesin defter'));
  assert.ok(!reportSource.includes('📦 Açılan ${opened}'), 'eski belirsiz Açılan/Kapanan satırı kaldırılmalı');

  const closeSource = fs.readFileSync(path.join(__dirname, '4_pozisyon.js'), 'utf8');
  assert.ok(closeSource.includes('[RESTART GAP SANAL POZİSYON KAPANDI]'));
  assert.ok(closeSource.includes('[LAB GÖLGE ÖĞRENME KAPANDI]'));
  assert.ok(closeSource.includes('[LAB PREMIER SANAL POZİSYON KAPANDI]'));
  assert.ok(closeSource.includes('Açılıştaki LAB Lig'));
  assert.ok(closeSource.includes('DNA: ESKİ KAYIT / ANAHTAR YOK'));
  assert.ok(closeSource.includes("source: 'CLOSE_REPORT_IDENTITY_RECOVERY'"));

  console.log('✅ v5.0.4 report + accounting consistency passed | 597 classified as 44 Gap + 553 legacy difference; forward ledger reconciles');
} finally {
  h.state.basariOzeti = old.summary;
  h.state.restartGapOzet = old.gap;
  h.state.aktifPozisyonlar = old.active;
  h.state.accountingContinuity = old.continuity;
}
