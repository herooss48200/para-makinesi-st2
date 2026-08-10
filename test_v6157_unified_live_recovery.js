'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');

async function testGhostPositionWithoutLivePrice() {
  const state = {
    aktifPozisyonlar: [{ sym:'GHOSTUSDT', yon:'LONG', sanal:false, girisFiyati:100, sl:98, tp:105 }],
    canliFiyatlar: {}, basamaklar: {}, alinanlar:[], aktifShortlar:[], manualCloseLocks:{}
  };
  const h = {
    state,
    client: { futuresPositionRisk: async()=>[{ symbol:'GHOSTUSDT', positionAmt:'0' }] },
    telegramMesajGonder: async()=>[],
  };
  const ayarlar = { sanalEmirModu:false, gercekPozisyonMutabakatTimeoutMs:2500, manuelKapanisYenidenGirisKilidiMs:3600000 };
  const realExecution = {
    finalizeExchangeClose: async()=>({ exitPrice:101, netPnl:1.0, reason:'MANUAL_EXTERNAL_CLOSE / BINANCE FILL', manual:true }),
    persistPosition(){}
  };
  const closeLifecycle = {
    commitRealClose({state,pos,reconciliation}) {
      const i=state.aktifPozisyonlar.indexOf(pos); if(i>=0) state.aktifPozisyonlar.splice(i,1);
      return { ok:true, reason:reconciliation.reason, closePrice:reconciliation.exitPrice };
    },
    scheduleCloseReport(){}
  };
  const noops = new Proxy({}, { get:()=>()=>({}) });
  const mocks = new Map([
    ['./1_hafiza.js',h], ['./ayarlar.js',ayarlar], ['./85_st2_real_order_execution.js',realExecution], ['./86_st2_close_lifecycle.js',closeLifecycle],
    ['./motor.js',{ fiyatKlip:(_,x)=>x }], ['./2_rapor.js',{raporGonder:async()=>{}}], ['./5_kalici_hafiza.js',{kaydet(){}}],
    ['./68_lab_lifecycle_evolution.js',noops], ['./73_st2_renko_entry_evolution.js',noops], ['./88_st2_williams_cycle_shadow_lab.js',noops],
    ['./89_st2_renko_entry_confirmation_shadow_lab.js',{tickAll:()=>({telegramMessages:[]}),update:()=>({emitted:[]}),lifecycleTelegramText:()=>''}],
    ['./74_st2_renko_exit_evolution.js',noops], ['./15_exit_optimizer_foundation.js',noops], ['./22_exit_replay_engine.js',noops],
    ['./23_restart_gap_protection.js',noops], ['./6_pusu_kalite_motoru.js',noops], ['./7_analiz_merkezi.js',noops], ['./8_blackbox.js',noops],
    ['./48_premier_observation_engine.js',noops], ['./61_lab_champion_engine.js',noops], ['./62_lab_premier_league.js',noops], ['./51_sanal_dynamic_exit_executor.js',noops],
    ['./52_exit_method_scoreboard.js',noops], ['./60_hierarchical_dna_identity_registry.js',noops], ['./65_accounting_continuity.js',noops], ['./82_st2_operation_transparency.js',noops]
  ]);
  const orig=Module._load;
  Module._load=function(request,parent,isMain){
    if(parent && path.basename(parent.filename)==='4_pozisyon.js' && mocks.has(request)) return mocks.get(request);
    return orig.apply(this,arguments);
  };
  const modPath=require.resolve('./4_pozisyon.js'); delete require.cache[modPath];
  try {
    const p=require('./4_pozisyon.js');
    const result=await p.izSurmeyiGuncelle({reconcileOnly:true});
    assert.strictEqual(result.exchangeOk,true);
    assert.strictEqual(result.closed,1);
    assert.strictEqual(state.aktifPozisyonlar.length,0,'ghost real position must be removed even when live price is missing');
  } finally { Module._load=orig; delete require.cache[modPath]; }
}

function testTelegramCircuitProbe() {
  const fs=require('fs');
  const src=fs.readFileSync('./1_hafiza.js','utf8');
  assert(src.includes('function telegramPanelCircuitProbeUygun'), 'panel circuit recovery helper missing');
  assert(src.includes("priority === 'panel'"), 'panel must be the only bulk lane allowed to recovery-probe');
  assert(src.includes('allowCircuitProbe: true'), 'dual-circuit panel job must opt into native recovery probe');
  assert(src.includes('telegramNativeProbeIzinli(priority, options, now)'), 'native probe decision must use recovery-aware helper');
}


(async()=>{
  await testGhostPositionWithoutLivePrice();
  testTelegramCircuitProbe();
  const fs=require('fs');
  const bot=fs.readFileSync('./bot.js','utf8');
  assert(bot.includes("donguAsama = 'EXCHANGE_RECONCILIATION'"));
  assert(bot.includes('marketPriceRuntime.refreshForMainLoop'));
  const rev=fs.readFileSync('./revizyon.js','utf8');
  assert(rev.includes("seedClosed1m(h.state, sym, sniper, 'STARTUP_CLOSED_1M')"));
  console.log('✅ v6.13.5-R17 unified live recovery passed | ghost exchange close without price + price fallback wiring + Telegram circuit recovery probe');
})().catch(e=>{ console.error(e.stack||e); process.exit(1); });
