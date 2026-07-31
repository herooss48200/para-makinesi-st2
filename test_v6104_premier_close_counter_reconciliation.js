'use strict';
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './versiyon.js') return { botSurumu: 'TEST' };
  if (request === './73_st2_renko_entry_evolution.js') return { summary: () => ({}) };
  if (request === './76_st2_adaptive_dna_entry.js') return { summary: () => ({ health: {} }) };
  if (request === './78_st2_global_historical_reconciliation.js') return { LIVE_LEDGER: 'x', readJsonl: () => [] };
  if (request === './75_st2_winning_intelligence.js') return { actualNet: row => Number(row?.result?.net || 0) };
  return originalLoad(request, parent, isMain);
};
const op = require('./69_operation_intelligence_dashboard');
Module._load = originalLoad;

const realWin = { pos:{ sanal:false, renkoPremierDecision:{premier:true}, sym:'SAHARAUSDT' }, result:{ net:0.0387, outcome:'TP' } };
const virtualWin = { pos:{ sanal:true, renkoPremierDecision:{premier:true}, sym:'INJUSDT' }, result:{ net:0.0201, outcome:'TP' } };
const shadowLoss = { pos:{ sanal:true, leagueShadowOnly:true, sym:'ZILUSDT' }, result:{ net:-0.01, outcome:'SL' } };
const parts = op.scientificLedgerPartitions([realWin,virtualWin,shadowLoss]);
assert.deepStrictEqual([parts.premier.n,parts.premier.tp,parts.premier.sl],[2,2,0]);
assert.deepStrictEqual([parts.realPremier.n,parts.realPremier.tp,parts.realPremier.sl],[1,1,0]);
assert.deepStrictEqual([parts.virtualPremier.n,parts.virtualPremier.tp],[1,1]);
assert.deepStrictEqual([parts.shadow.n,parts.shadow.sl],[1,1]);

const reportSource = fs.readFileSync('./2_rapor.js','utf8');
assert(reportSource.includes('Bilimsel Premier N${Number(premierScientific.n || 0)}'));
assert(reportSource.includes('Gerçek Premier N${Number(realPremier.n || 0)}'));
const leagueSource = fs.readFileSync('./62_lab_premier_league.js','utf8');
assert(leagueSource.includes('if (entrySamples > 0 || entryAssignment.proven === true || entryAssignment.learned === true) d.entryProven = true;'));
console.log('✅ v6.10.4 real Score-Premier close counters + real/virtual split + Entry/Exit wording reconciliation passed');
