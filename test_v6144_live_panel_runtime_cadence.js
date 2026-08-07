'use strict';
const assert = require('assert');
const fs = require('fs');
const { createSt2LivePanelScheduler } = require('./92_st2_live_panel_scheduler.js');

let now = 0;
let ready = false;
let enabled = true;
let requests = 0;
let timerFn = null;
let timerMs = null;
const fakeTimer = { unref() {} };
const scheduler = createSt2LivePanelScheduler({
  enabled: () => enabled,
  ready: () => ready,
  intervalMs: () => 30000,
  request: () => { requests++; },
  now: () => now,
  setIntervalFn: (fn, ms) => { timerFn = fn; timerMs = ms; return fakeTimer; },
  clearIntervalFn: () => {}
});

scheduler.start();
assert.strictEqual(timerMs, 1000, 'scheduler readiness/cadence kontrolü hafif 1 sn olmalı');

// Startup gate kapalı: 30 sn geçmiş olsa dahi panel yok.
now = 30000; timerFn();
assert.strictEqual(requests, 0, 'Gate READY olmadan panel tetiklenmemeli');

// Gate READY: ilk panel ilk tam Renko taramasını beklemeden hemen talep edilir.
ready = true; now = 45000; timerFn();
assert.strictEqual(requests, 1, 'Gate READY olduğunda ilk panel hemen istenmeli');

// 29.999 sn: ikinci panel yok; tam 30 sn: var.
now = 74999; timerFn();
assert.strictEqual(requests, 1, '30 sn dolmadan yeni panel talebi olmamalı');
now = 75000; timerFn();
assert.strictEqual(requests, 2, '30 sn cadence gerçek runtime davranışı olmalı');

// Ağır Renko taramasının tamamlandığına dair hiçbir değişken scheduler sözleşmesinde yoktur.
now = 105000; timerFn();
assert.strictEqual(requests, 3, 'ilk/full Renko scan durumu panel cadence\'ini bloke etmemeli');

enabled = false; now = 135000; timerFn();
assert.strictEqual(requests, 3, 'canlı rapor kapalıysa scheduler sessiz olmalı');

const bot = fs.readFileSync('bot.js', 'utf8');
const report = fs.readFileSync('2_rapor.js', 'utf8');
const renko = fs.readFileSync('72_st2_renko_entry.js', 'utf8');
assert(!bot.includes('startupPanelPlanla(\'ILK_ST2_TARAMA\', 0)'), 'ST2 panel ilk scan callbackine bağlı olmamalı');
assert(!report.includes('await h.telegramCanliRaporGuncelle'), 'rapor mutex network teslimini beklememeli');
assert(renko.includes('await new Promise(resolve => setImmediate(resolve))'), 'Renko scan event-loop fairness yield eksik');
assert(renko.includes('renkoProofConsoleYaz(pusuKaniti)'), 'verbose proof normal console için kontrollü olmalı');

console.log('✅ v6.13.5-R13 live panel runtime cadence passed | READY -> immediate, then exact 30s requests independent of full Renko scan');
