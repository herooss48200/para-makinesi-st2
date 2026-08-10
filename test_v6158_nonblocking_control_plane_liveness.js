'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v6158-'));
  process.env.AGROS_DATA_DIR = tmp;
  const symbols = Array.from({ length: 200 }, (_, i) => `R18${String(i).padStart(3,'0')}USDT`);
  const now = Date.now();
  const state = {
    semboller: [],
    aktifPozisyonlar: [{ sym:'XRPUSDT', yon:'SHORT', sanal:false, girisFiyati:1, sl:1.1, tp:0.9 }],
    startupMarketReady:false, startupMarketWarmup:{}, sembolVeriSagligi:{durum:'BEKLIYOR'},
    canliFiyatlar:{}, canliFiyatMeta:{}, cooldownBitis:0, st2Renko:{pusular:{}}, pusuListesi:{},
    sonTrendGuncellemeZamani:0, sonSniperGuncellemeZamani:0
  };
  let loopCb = null;
  let reconcileCalls = 0;
  let protectionCalls = 0;
  let scanCalls = 0;
  let priceCalls = 0;
  const logs=[];
  const never = new Promise(()=>{});

  const h = {
    state,
    async binanceTimeSync(){ return {healthy:true,offsetMs:0,lastRttMs:1}; },
    binanceTimeStartPeriodic(){},
    async telegramMesajGonderKritikTeslim(){ return [{sonuc:{ok:true}}]; },
    async telegramMesajGonder(){ return [{sonuc:{ok:true}}]; },
    telegramKuyrukOzeti(){ return {critical:0,panel:0,detail:0,transport:{}}; }
  };
  const p = {
    izSurmeyiGuncelle(options={}) {
      if (options.reconcileOnly) { reconcileCalls++; return never; }
      protectionCalls++; return Promise.resolve({exchangeOk:true});
    },
    async piyasayiTaraVePusuKur(){}, async pusulariDenetleVeIslemAc(){}, async pusuRaporuGonder(){}
  };
  const piyasa = {
    async sembolleriYukle(){ state.semboller=symbols.slice(); state.sembolVeriSagligi={durum:'HEALTHY'}; },
    async acikPozisyonlariBorsadanDevral(){ return {positions:state.aktifPozisyonlar,restored:1,adopted:0,blocked:false}; }
  };
  const revizyon = {
    async derinGecmisiInsaEt(){
      const t=Date.now();
      for(const sym of symbols){ state.canliFiyatlar[sym]=100; state.canliFiyatMeta[sym]={source:'STARTUP_CLOSED_1M',marketTime:t-10000,observedAt:t}; }
      state.startupMarketReady=true;
      state.startupMarketWarmup={durum:'READY',asama:'GOLDEN_RENKO_CORE_COMPLETE',islenen:200,toplam:200,pusuHazir:200,trendHazir:200};
      return {ready:true,pusuHazir:200,trendHazir:200,total:200};
    }
  };
  const ayarlar = {
    entryStrategyMode:'ST2_RENKO', sanalEmirModu:false, taranacakCoinSayisi:200,
    binanceAgEszamanlilik:3, binanceAgTimeoutMs:15000, binanceAgRetry:2, binanceAgRetryTabanMs:900,
    globalHistoricalStartupWarmupMs:600000, canliRaporAktif:true, canliRaporGuncellemeMs:30000,
    renkoKaynakPeriyodu:'15m', pusuPeriyodu:'15m', pingInterval:1000, startupMarketGuardLogAralikMs:60000,
    st2ExchangeReconcileIntervalMs:5000, st2ExchangeReconcileFreshMs:15000, futuresTickerTimeoutMs:6000, futuresTickerRetry:0
  };
  const rapor={raporTalepEt(){}};
  const versiyon={botSurumu:'6.13.5-R19-LIVE-CPU-ISOLATION-FINAL',kisaOzet(){return this.botSurumu;},telegramOzet(){return this.botSurumu;}};
  const kalici={yukle(){},kaydet(){}};
  const network={
    configure(){},
    async binanceFiyatlariCek(){ priceCalls++; return Object.fromEntries(symbols.map(s=>[s,'100'])); },
    durumOzeti(){return {active:0,queuedNow:0,inFlight:0,succeeded:1,failed:0,retried:0,deduped:0};}
  };
  const accounting={initializeMigration(){}};
  const historical={activate(){return {activation:'ACTIVE',warmupMs:600000,readyCoins:0,coins:0,signals:0,patterns:0,reconciliationOk:true};}};
  const scheduler={createSt2LivePanelScheduler(){return {start(){}};}};
  const renkoEntry={async taraVeDegerlendir(){scanCalls++; return {yeniPusu:2};}};
  const safeStartup={verifyOrThrow(){}};
  const dnaLeague={findPlayer(){return null;}};
  const dynamicExit={VERSION:'TEST',readModel(){return {version:'TEST',dnaBase:[]};},updateFromReplay(){return {totalBaseDna:0,version:'TEST',dnaBase:[]};}};
  const premierObservation={read(){return {closed:0};}};
  const adaptiveLeague={VERSION:'TEST'};
  const labPremier={VERSION:'TEST',build(){return {premierCount:0,forwardVerifiedCount:0};}};
  const blackbox={istatistikDakikaRaporGerekli(){return false;},telegramIstatistikRaporMetni(){return '';}};

  const originalLoad=Module._load;
  const originalSetInterval=global.setInterval;
  const originalLog=console.log, originalWarn=console.warn, originalError=console.error;
  global.setInterval=(cb,ms)=>{ if(Number(ms)===1000 && !loopCb) loopCb=cb; return {unref(){}}; };
  console.log=(...a)=>logs.push(a.join(' ')); console.warn=(...a)=>logs.push(a.join(' ')); console.error=(...a)=>logs.push(a.join(' '));
  Module._load=function(req,parent,isMain){
    const fromBot=parent?.filename?.endsWith(path.sep+'bot.js');
    if(fromBot){
      if(req==='dotenv') return {config(){}};
      if(req==='./1_hafiza.js') return h; if(req==='./4_pozisyon.js') return p; if(req==='./3_piyasa.js') return piyasa;
      if(req==='./revizyon.js') return revizyon; if(req==='./ayarlar.js') return ayarlar; if(req==='./2_rapor.js') return rapor;
      if(req==='./versiyon.js') return versiyon; if(req==='./5_kalici_hafiza.js') return kalici; if(req==='./64_binance_network_resilience.js') return network;
      if(req==='./65_accounting_continuity.js') return accounting; if(req==='./79_st2_global_historical_runtime.js') return historical;
      if(req==='./92_st2_live_panel_scheduler.js') return scheduler; if(req==='./74_st2_safe_startup.js') return safeStartup;
      if(req==='./46_dna_league_engine.js') return dnaLeague; if(req==='./47_dynamic_dna_exit_engine.js') return dynamicExit;
      if(req==='./48_premier_observation_engine.js') return premierObservation; if(req==='./49_adaptive_trading_league.js') return adaptiveLeague;
      if(req==='./62_lab_premier_league.js') return labPremier; if(req==='./72_st2_renko_entry.js') return renkoEntry; if(req==='./8_blackbox.js') return blackbox;
    }
    return originalLoad.apply(this,arguments);
  };

  try {
    delete require.cache[require.resolve('./bot.js')];
    require('./bot.js');
    const deadline=Date.now()+2000;
    while(Date.now()<deadline && !(state.startupMarketReady && typeof loopCb==='function')) await new Promise(r=>setTimeout(r,5));
    assert.strictEqual(state.startupMarketReady,true,'startup must be READY');
    assert.strictEqual(typeof loopCb,'function','main loop must register');
    await new Promise(r=>setTimeout(r,20)); // let background reconcile start and remain hung
    assert(reconcileCalls>=1,'background reconciliation must start');
    for(let i=0;i<3;i++) await loopCb();
    assert.strictEqual(scanCalls,3,'hung signed reconciliation must NOT stop Renko scans');
    assert.strictEqual(protectionCalls,2,'first-audit fallback defers protection; following network-verified loops protect without duplicate reconciliation');
    assert.strictEqual(state.st2FirstScanCompleted,true,'first scan must complete despite hung reconciliation');
    assert(!logs.some(x=>x.includes('Aşama EXCHANGE_RECONCILIATION')),'main loop must never enter blocking reconciliation stage');
    assert(priceCalls>=2,'ticker refresh continues after first-audit fallback');
  } finally {
    Module._load=originalLoad; global.setInterval=originalSetInterval;
    console.log=originalLog; console.warn=originalWarn; console.error=originalError;
    delete require.cache[require.resolve('./bot.js')];
  }

  const bot=fs.readFileSync('./bot.js','utf8');
  const motor=fs.readFileSync('./motor.js','utf8');
  const report=fs.readFileSync('./2_rapor.js','utf8');
  const hafiza=fs.readFileSync('./1_hafiza.js','utf8');
  assert(bot.includes('st2ExchangeReconcileBackground'),'background reconcile worker source missing');
  assert(bot.includes('Renko/pusu taraması DEVAM'),'fail-closed liveness marker missing');
  assert(motor.includes('ST2_CONTROL_PLANE_FAIL_CLOSED'),'real-order control-plane gate missing');
  assert(report.includes('Control Plane Mutabakat'),'panel control-plane observability missing');
  assert(hafiza.includes('TELEGRAM_HARD_TIMEOUT'),'Telegram native wall-clock deadline missing');
  console.log('✅ v6.13.5-R19 nonblocking control-plane liveness passed | hung reconciliation cannot stop Renko/pusu + real entry remains fail-closed + panel observability + Telegram hard deadline');
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
