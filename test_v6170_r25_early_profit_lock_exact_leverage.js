'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const ayarlar = require('./ayarlar.js');

function loadPositionModuleForEconomy() {
  const noops = new Proxy({}, { get:()=>()=>({}) });
  const h = { state:{basamaklar:{TESTUSDT:{tickSize:0.001,pricePrecision:3}},canliFiyatlar:{},aktifPozisyonlar:[]}, telegramMesajGonder:async()=>[] };
  const mocks = new Map([
    ['./1_hafiza.js',h], ['./ayarlar.js',ayarlar], ['./motor.js',{fiyatKlip:(_,x)=>x}],
    ['./68_lab_lifecycle_evolution.js',noops], ['./73_st2_renko_entry_evolution.js',noops], ['./88_st2_williams_cycle_shadow_lab.js',noops],
    ['./89_st2_renko_entry_confirmation_shadow_lab.js',{tickAll:()=>({telegramMessages:[]}),update:()=>({emitted:[]}),lifecycleTelegramText:()=>'',telegramText:()=>''}],
    ['./94_st2_15m_confirmed_evidence.js',noops], ['./74_st2_renko_exit_evolution.js',noops], ['./2_rapor.js',{raporGonder:async()=>{}}],
    ['./5_kalici_hafiza.js',{kaydet(){}}], ['./15_exit_optimizer_foundation.js',noops], ['./22_exit_replay_engine.js',noops], ['./23_restart_gap_protection.js',noops],
    ['./6_pusu_kalite_motoru.js',noops], ['./7_analiz_merkezi.js',noops], ['./8_blackbox.js',noops], ['./48_premier_observation_engine.js',noops],
    ['./61_lab_champion_engine.js',noops], ['./62_lab_premier_league.js',noops], ['./51_sanal_dynamic_exit_executor.js',noops], ['./52_exit_method_scoreboard.js',noops],
    ['./60_hierarchical_dna_identity_registry.js',noops], ['./65_accounting_continuity.js',noops], ['./82_st2_operation_transparency.js',noops],
    ['./85_st2_real_order_execution.js',{persistPosition(){}}], ['./86_st2_close_lifecycle.js',noops], ['./95_st2_post_close_price_path.js',noops],
    ['./96_st2_live_cohort_economy.js',noops], ['./97_st2_macd_shadow_intelligence.js',{updatePosition:()=>({}),close:()=>null,telegramText:()=>''}]
  ]);
  const orig = Module._load;
  Module._load = function(request,parent,isMain){
    if(parent && path.basename(parent.filename)==='4_pozisyon.js' && mocks.has(request)) return mocks.get(request);
    return orig.apply(this,arguments);
  };
  const modPath=require.resolve('./4_pozisyon.js'); delete require.cache[modPath];
  try { return {mod:require('./4_pozisyon.js'), restore:()=>{Module._load=orig; delete require.cache[modPath];}}; }
  catch(e){ Module._load=orig; throw e; }
}

(async()=>{
  assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAktivasyonYuzde,1.50);
  assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiIlkKilitYuzde,1.00);
  assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiTakipMesafeYuzde,0.50);
  assert.strictEqual(ayarlar.confirmedYuzdeselEkonomiAdimYuzde,0.50);
  assert.strictEqual(ayarlar.mevcutKaldirac,5);
  assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar,4);
  assert.strictEqual(ayarlar.calisilmakIstenenUsdtMiktar*ayarlar.mevcutKaldirac,20);
  assert.strictEqual(ayarlar.gercekEmirKaldiracFallbackAktif,false);

  const {mod,restore}=loadPositionModuleForEconomy();
  try {
    const f=mod._yuzdeselEkonomiHesapla;
    assert.strictEqual(typeof f,'function');
    const L={sym:'TESTUSDT',yon:'LONG',girisFiyati:100,sl:97.5};
    assert.strictEqual(f(L,101.49),false); assert(Math.abs(L.sl-97.5)<1e-9);
    assert.strictEqual(f(L,101.50),true);  assert(Math.abs(L.sl-101.0)<1e-9,'+1.50 => +1.00');
    assert.strictEqual(f(L,101.99),false); assert(Math.abs(L.sl-101.0)<1e-9);
    assert.strictEqual(f(L,102.00),true);  assert(Math.abs(L.sl-101.5)<1e-9,'+2.00 => +1.50');
    assert.strictEqual(f(L,102.50),true);  assert(Math.abs(L.sl-102.0)<1e-9,'+2.50 => +2.00');
    assert.strictEqual(f(L,103.00),true);  assert(Math.abs(L.sl-102.5)<1e-9,'+3.00 => +2.50');
    assert.strictEqual(f(L,101.70),false); assert(Math.abs(L.sl-102.5)<1e-9,'LONG stop must never loosen');

    const S={sym:'TESTUSDT',yon:'SHORT',girisFiyati:100,sl:102.5};
    assert.strictEqual(f(S,98.50),true); assert(Math.abs(S.sl-99.0)<1e-9,'SHORT +1.50 => +1.00');
    assert.strictEqual(f(S,98.00),true); assert(Math.abs(S.sl-98.5)<1e-9,'SHORT +2.00 => +1.50');
    assert.strictEqual(f(S,97.50),true); assert(Math.abs(S.sl-98.0)<1e-9,'SHORT +2.50 => +2.00');
    assert.strictEqual(f(S,98.30),false); assert(Math.abs(S.sl-98.0)<1e-9,'SHORT stop must never loosen');
  } finally { restore(); }

  const policy=require('./91_st2_symbol_leverage_policy.js');
  const strictCalls=[];
  await assert.rejects(
    policy.negotiate({symbol:'STRICTUSDT',requestedLeverage:5,allowFallback:false,client:{async futuresLeverage({leverage}){strictCalls.push(leverage); throw new Error(`Leverage ${leverage} is not valid`);}}}),
    /SEMBOL_KALDIRAC_DOGRULANAMADI:STRICTUSDT:5x/
  );
  assert.deepStrictEqual(strictCalls,[5],'strict live leverage must never silently try 1x');

  const fallbackCalls=[];
  const fallback=await policy.negotiate({symbol:'LABUSDT',requestedLeverage:5,allowFallback:true,client:{async futuresLeverage({leverage}){fallbackCalls.push(leverage); if(leverage===5) throw new Error('Leverage 5 is not valid'); return {leverage};}}});
  assert.strictEqual(fallback.effective,4); assert.deepStrictEqual(fallbackCalls,[5,4]);

  const motor=fs.readFileSync('./motor.js','utf8');
  assert(motor.includes('allowFallback: ayarlar.gercekEmirKaldiracFallbackAktif === true'));
  console.log('✅ R25.1 early profit lock + exact leverage passed | +1.50=>+1.00 | +2.00=>+1.50 | +2.50=>+2.00 | monotonic LONG/SHORT | live exact 5x no silent fallback | 4 USDT margin x 5 = 20 USDT');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
