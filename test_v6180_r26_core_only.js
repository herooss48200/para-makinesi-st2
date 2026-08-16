'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const cp = require('child_process');

const ROOT = __dirname;
const requireRe = /require\(['"]\.\/([^'"]+)['"]\)/g;
function closure(entry='bot.js') {
  const seen = new Set(), stack=[entry];
  while (stack.length) {
    let f=stack.pop(); if (!f.endsWith('.js')) f += '.js';
    if (seen.has(f)) continue;
    const p=path.join(ROOT,f); assert.ok(fs.existsSync(p), `missing core dependency: ${f}`);
    seen.add(f);
    const src=fs.readFileSync(p,'utf8'); let m;
    while ((m=requireRe.exec(src))) { let d=m[1]; if(!d.endsWith('.js')) d += '.js'; stack.push(d); }
  }
  return [...seen].sort();
}
const core=closure();
const forbidden=[
  '87_st2_st1_entry_gate.js','88_st2_williams_cycle_shadow_lab.js','89_st2_renko_entry_confirmation_shadow_lab.js',
  '95_st2_post_close_price_path.js','96_st2_filtered_direct_shadow.js','97_st2_macd_shadow_intelligence.js',
  '79_st2_global_historical_runtime.js','46_dna_league_engine.js','47_dynamic_dna_exit_engine.js',
  '48_premier_observation_engine.js','49_adaptive_trading_league.js','51_sanal_dynamic_exit_executor.js',
  '61_lab_champion_engine.js','68_lab_lifecycle_evolution.js','69_operation_intelligence_dashboard.js',
  '74_st2_renko_exit_evolution.js','65_accounting_continuity.js','62_lab_premier_league.js'
];
for (const f of forbidden) assert.ok(!core.includes(f), `forbidden runtime dependency: ${f}`);
assert.ok(core.length <= 42, `core dependency closure too large: ${core.length}`);
for (const f of core) cp.execFileSync(process.execPath,['--check',path.join(ROOT,f)],{stdio:'pipe'});

const a=require('./ayarlar');
assert.equal(a.entryStrategyMode,'ST2_DUAL_REAL');
assert.equal(a.renkoGercekMaxAktifPozisyon,10);
assert.equal(a.heikinAshiGercekMaxAktifPozisyon,10);
assert.equal(a.heikinAshiFormasyonAktif,true);
assert.equal(a.heikinAshiFormasyonVetoAktif,true);
assert.equal(a.heikinAshiTetikPenceresiMum,1);
assert.equal(a.sanalEmirModu,false);
assert.equal(a.taranacakCoinSayisi,200);
assert.equal(a.calisilmakIstenenUsdtMiktar,4);
assert.equal(a.mevcutKaldirac,5);
assert.equal(a.gercekEmirMaxAktifPozisyon,20);
assert.equal(a.sabitStopYuzdesi,2.5);
assert.equal(a.confirmedYuzdeselEkonomiAktivasyonYuzde,1.5);
assert.equal(a.confirmedYuzdeselEkonomiIlkKilitYuzde,1.0);
assert.equal(a.confirmedYuzdeselEkonomiTakipMesafeYuzde,0.5);
assert.equal(a.confirmedYuzdeselEkonomiAdimYuzde,0.5);

const q=require('./83_st2_premier_quality_score');
const baseNo={selected:false,score:50,threshold:55,hardReasons:['PREMIER_SCORE_MIN_SAMPLE_N1/3'],reason:'LOW'};
const positive={complete:true,currentLeague:'PREMIER',metrics:{closed:5,net:1,profitFactor:2,expectancy:.2,winRate:80}};
const negative={complete:true,currentLeague:'SHADOW',metrics:{closed:5,net:-1,profitFactor:.5,expectancy:-.2,winRate:20}};
let r=q.resolveSelectionAuthority(baseNo,positive,{baseTrack:'SCORE_PREMIER',labKey:'LONG|BTC=0000|COIN=1000|BB=ORTA'});
assert.equal(r.selected,true); assert.equal(r.selectionAuthority.authority,'LAB_LIVE_N5_ECONOMY');
r=q.resolveSelectionAuthority({selected:true,score:80,threshold:55,hardReasons:[],reason:'OK'},negative,{baseTrack:'SCORE_PREMIER',labKey:'LONG|BTC=0000|COIN=0101|BB=ORTA'});
assert.equal(r.selected,false); assert.equal(r.reason,'LAB_LIVE_N5_NEGATIVE_ECONOMY_VETO');
r=q.resolveSelectionAuthority(baseNo,null,{baseTrack:'RENKO_PATTERN_PREMIER',labKey:'LONG|BTC=0000|COIN=0101|BB=ORTA'});
assert.equal(r.selected,true); assert.equal(r.reason,'RENKO_PATTERN_PREMIER_PRESERVED');
r=q.resolveSelectionAuthority({selected:true,score:80,threshold:55,hardReasons:[],reason:'OK'},null,{baseTrack:'SCORE_PREMIER',labKey:'LONG|BTC=0000|COIN=1000|BB=ORTA'});
assert.equal(r.selected,false); assert.ok(r.reason.includes('OOS_VETO'));

const readiness=require('./50_real_order_readiness_bridge').liveRiskProfile();
assert.equal(readiness.marginUsdt,4); assert.equal(readiness.leverage,5); assert.equal(readiness.notionalUsdt,20); assert.equal(readiness.maxActivePositions,20);
const motor=fs.readFileSync(path.join(ROOT,'motor.js'),'utf8');
assert.ok(motor.includes('premierSelectionFrozenAtOpen')); assert.ok(motor.includes('premierTrackAtOpen'));
const ev=require('./94_st2_15m_confirmed_evidence');
assert.equal(typeof ev.recordLiveClose,'function');
assert.equal(ev.ensureConfirmedShadowForPusu,undefined); assert.equal(ev.advanceConfirmedShadow,undefined);

const evo=require('./73_st2_renko_entry_evolution');
const replay=evo.replayCandidate({pozisyonDegeri:20},{exitPrice:101.4,commission:0},{yon:'LONG',referansSeviye:100,renkoBoxSize:1},0.5,[{t:1,p:100},{t:2,p:100.5},{t:3,p:102.1},{t:4,p:101.4}]);
assert.equal(replay.triggered,true); assert.equal(replay.exitReason,'CORE_PROFIT_STOP'); assert.ok(Math.abs(replay.pct-1.0)<1e-6);
const evoSrc=fs.readFileSync(path.join(ROOT,'73_st2_renko_entry_evolution.js'),'utf8');
for(const old of ['dynamicExitHit','exitPlanShadow','labLifecycleProfile','frozenExit','frozenRisk']) assert.ok(!evoSrc.includes(old),`old entry-evolution residue: ${old}`);
const pqSrc=fs.readFileSync(path.join(ROOT,'83_st2_premier_quality_score.js'),'utf8');
assert.ok(!pqSrc.includes('st2-renko-exit-evolution.json'),'Premier score still reads old exit state');

const report=require('./2_rapor');
for (const oldName of ['exitEvolutionDashboardGonder','analizRaporuGonder','championshipRaporuGonder']) assert.equal(report[oldName],undefined);
console.log(`✅ R26/R28.1 CORE passed | runtime closure ${core.length} files | Renko N5 preserved + HA real lane | 10+10 slots x 20USDT | no legacy Shadow/LAB runtime`);
