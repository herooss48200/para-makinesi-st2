'use strict';
const fs = require('fs');
const assert = require('assert');
const ayarlar = require('./ayarlar.js');
const versiyon = require('./versiyon.js');

assert.strictEqual(Number(ayarlar.gercekPozisyonMutabakatTimeoutMs), 20000, 'positionRisk deadline must be 20s');
assert.strictEqual(Number(ayarlar.st2ExchangeReconcileIntervalMs), 30000, 'reconcile cadence must be 30s');
assert.strictEqual(Number(ayarlar.st2ExchangeReconcileFreshMs), 180000, 'reconcile freshness must remain 180s');
assert(/R31\.(3|4)/.test(String(versiyon.botSurumu)), 'version must preserve R31.3 reconciliation contract or newer');

const pos = fs.readFileSync(require.resolve('./4_pozisyon.js'), 'utf8');
assert(pos.includes('positionRiskSingleFlight'), 'positionRisk single-flight authority missing');
assert(pos.includes('positionRiskSingleFlightRead('), 'reconcile must call single-flight read');
assert(pos.includes("single-flight ${positionRiskSingleFlight ? 'KORUNUYOR' : 'BOSTA'}"), 'timeout log must expose single-flight state');
assert(!pos.includes("h.client.futuresPositionRisk(),\n                ayarlar.gercekPozisyonMutabakatTimeoutMs || 8000"), 'old direct 8s reconcile read must be removed');


const hafizaSource = fs.readFileSync(require.resolve('./1_hafiza.js'), 'utf8');
assert(hafizaSource.includes("priority === 'panel'"), 'panel must have its own timeout branch');
assert(hafizaSource.includes('? Math.min(6000, requestedTimeout)'), 'panel native timeout must allow configured 6s');

const guardSource = fs.readFileSync(require.resolve('./98_st2_final_direction_guard.js'), 'utf8');
assert(guardSource.includes("strong BTC+ETH UP => SHORT hard-veto"));
assert(guardSource.includes("strong BTC+ETH DOWN => LONG hard-veto"));

console.log('✅ R31.3 reconcile single-flight passed | positionRisk 20s | cadence 30s | freshness 180s | no timeout request pile-up | symmetric Onur preserved');
