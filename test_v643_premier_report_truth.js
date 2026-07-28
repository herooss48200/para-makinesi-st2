'use strict';
const fs = require('fs');
function must(cond, msg){ if(!cond) throw new Error(msg); }
const src = fs.readFileSync('69_operation_intelligence_dashboard.js','utf8');
const report = fs.readFileSync('2_rapor.js','utf8');
const ver = require('./versiyon.js');
must(['6.4.3-PREMIER-REPORT-TRUTH','6.5.0-MFE-CAPTURE-TAKEOVER-EVOLUTION','6.6.0-LEARNED-TAKEOVER-EXPLAINABLE-PROTECTION'].includes(ver.botSurumu), 'runtime version');
must(src.includes('const livePremier = n(ac.activeScientific);'), 'header must use accounting activeScientific');
must(!src.includes("filter(p=>p?.labPremierObservation?.upperLayerIncluded===true || p?.labPremierDecision?.upperLayerIncluded===true).length"), 'legacy position flag count must be removed');
must(report.includes('const aktifler = ayarlar.sanalEmirModu'), 'main report scientific active selection preserved');
must(report.includes('aktifDagilim.premierPositions.filter(anaPremierPozisyonuMu)'), 'main report premier filter preserved');
console.log('✅ v6.4.3 Premier report truth reconciliation passed');
