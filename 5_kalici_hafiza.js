'use strict';

// AGROS ST2 R26 CORE RUNTIME STATE
// Açık gerçek pozisyonun kanonik kaynağı Binance + 85_st2_real_order_execution ledger'ıdır.
// Bu dosya yalnız günlük emir sayacı ve manuel kapanış kilitlerini saklar.

const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = process.env.AGROS_DATA_DIR ? path.resolve(process.env.AGROS_DATA_DIR) : path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'sanal-state.json');
function bugunAnahtari(){ return new Date().toISOString().slice(0,10); }
function klasorHazirla(){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); }
function kaydedilecekState(){ return { surum:'R26-CORE', kayitZamani:new Date().toISOString(), gunlukLimitTarihi:h.state.gunlukLimitTarihi||bugunAnahtari(), gunlukAcilanEmirSayisi:Number(h.state.gunlukAcilanEmirSayisi||0), manualCloseLocks:h.state.manualCloseLocks||{} }; }
function kaydet(sebep='core-state'){
  try { klasorHazirla(); fs.writeFileSync(STATE_FILE, JSON.stringify(kaydedilecekState(), null, 2)); if(ayarlar.kaliciHafizaLogAktif) console.log(`💾 [CORE STATE] ${sebep}`); }
  catch(err){ console.error(`❌ [CORE STATE] Kaydedilemedi: ${err.message}`); }
}
function yukle(){
  try {
    klasorHazirla(); if(!fs.existsSync(STATE_FILE)){ h.state.manualCloseLocks={}; h.state.gunlukLimitTarihi=bugunAnahtari(); h.state.gunlukAcilanEmirSayisi=0; return; }
    const v=JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));
    h.state.manualCloseLocks=v.manualCloseLocks&&typeof v.manualCloseLocks==='object'?{...v.manualCloseLocks}:{};
    h.state.gunlukLimitTarihi=v.gunlukLimitTarihi||bugunAnahtari(); h.state.gunlukAcilanEmirSayisi=Number(v.gunlukAcilanEmirSayisi||0);
    if(h.state.gunlukLimitTarihi!==bugunAnahtari()){ h.state.gunlukLimitTarihi=bugunAnahtari(); h.state.gunlukAcilanEmirSayisi=0; }
    // R26: yalnız gerçek Binance pozisyonları runtime'da aktiftir.
    h.state.aktifPozisyonlar=(h.state.aktifPozisyonlar||[]).filter(p=>p?.sanal===false);
    listeleriYenidenKur();
    console.log(`💾 [CORE STATE] Günlük gerçek emir ${h.state.gunlukAcilanEmirSayisi}/${ayarlar.gunlukMaxYeniEmir||'∞'} | Eski sanal state yüklenmez`);
  } catch(err){ console.error(`❌ [CORE STATE] Yüklenemedi: ${err.message}`); }
}
function listeleriYenidenKur(){ const rows=(h.state.aktifPozisyonlar||[]).filter(p=>p?.sanal===false); h.state.aktifPozisyonlar=rows; h.state.alinanlar=[...new Set(rows.filter(p=>p.yon==='LONG').map(p=>p.sym))]; h.state.aktifShortlar=[...new Set(rows.filter(p=>p.yon==='SHORT').map(p=>p.sym))]; }
function gunlukLimitSifirlaGerekiyorsa(){ const b=bugunAnahtari(); if(h.state.gunlukLimitTarihi!==b){ h.state.gunlukLimitTarihi=b; h.state.gunlukAcilanEmirSayisi=0; kaydet('gunluk-limit-sifirlama'); } }
function acikPozisyonVarMi(sym,yon=null){ return (h.state.aktifPozisyonlar||[]).some(p=>p?.sanal===false&&p.sym===sym&&(!yon||p.yon===yon)); }
function emirAcilabilirMi(sym,yon,options={}){ gunlukLimitSifirlaGerekiyorsa(); if(acikPozisyonVarMi(sym)) return {uygun:false,sebep:`${sym} için zaten aktif gerçek pozisyon var`}; const max=Number(options.maxPozisyonSayisi||ayarlar.gercekEmirMaxAktifPozisyon||20); if((h.state.aktifPozisyonlar||[]).filter(p=>p?.sanal===false).length>=max) return {uygun:false,sebep:`Gerçek slot dolu: ${max}`}; const gunluk=options.ignoreDailyLimit?0:Number(ayarlar.gunlukMaxYeniEmir||0); if(gunluk>0&&Number(h.state.gunlukAcilanEmirSayisi||0)>=gunluk) return {uygun:false,sebep:`Günlük emir limiti doldu: ${h.state.gunlukAcilanEmirSayisi}/${gunluk}`}; return {uygun:true,sebep:'uygun'}; }
function yeniEmirSay(){ gunlukLimitSifirlaGerekiyorsa(); h.state.gunlukAcilanEmirSayisi=Number(h.state.gunlukAcilanEmirSayisi||0)+1; kaydet('yeni-gercek-emir'); }
module.exports={STATE_FILE,kaydet,yukle,listeleriYenidenKur,acikPozisyonVarMi,emirAcilabilirMi,yeniEmirSay,gunlukLimitSifirlaGerekiyorsa};
