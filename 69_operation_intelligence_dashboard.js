/**
 * AGROS v5.3.5 — LIVE OPERATIONS + SELECTION INTELLIGENCE 2.0
 * Raporlama/karar-açıklama katmanıdır. Trade Engine kapılarını değiştirmez.
 */
const VERSION = 'v5.4.2-REPORT-CONSISTENCY-FIX';
const runtimeVersion = require('./versiyon.js');
const renkoEntryEvolution = require('./73_st2_renko_entry_evolution.js');
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v))}
function signed(v,d=2){const x=n(v);return `${x>=0?'+':''}${x.toFixed(d)}`}
function pf(v){return n(v)>=999?'∞':n(v).toFixed(2)}
function componentScore(candidate, lifeRow){
  const h=candidate?.historical||{}; const live=candidate?.liveMetrics||{};
  const hist=clamp(50+n(h.expectancy)*70+(n(h.profitFactor)-1)*18+Math.log10(Math.max(1,n(h.total)))*8);
  const recent=n(live.closed)>0?clamp(50+n(live.expectancy)*100+(n(live.profitFactor)-1)*20):50;
  const exit=candidate?.exitValidated?85:(candidate?.safeFallback?55:40);
  const stop=lifeRow?.stop?.recommendation?.best?clamp(55+n(lifeRow.stop.recommendation.best.expectancy)*80+(n(lifeRow.stop.recommendation.best.pf)-1)*15):50;
  const be=lifeRow?.be?.recommendation?.best?clamp(55+n(lifeRow.be.recommendation.best.expectancy)*80+(n(lifeRow.be.recommendation.best.pf)-1)*15):50;
  const stability=clamp(35+Math.min(30,n(h.total)*1.5)+(n(h.net)>0?20:-20));
  const score=clamp(hist*.32+recent*.22+exit*.16+stop*.10+be*.10+stability*.10);
  return {score:Number(score.toFixed(1)),historical:Number(hist.toFixed(1)),recent:Number(recent.toFixed(1)),exit,stop:Number(stop.toFixed(1)),be:Number(be.toFixed(1)),stability:Number(stability.toFixed(1))};
}
function formLabel(c){const m=c?.liveMetrics||{};if(!n(m.closed))return '🆕 KANIT BEKLİYOR';if(n(m.net)>0&&n(m.profitFactor)>1)return '📈 GÜÇLENİYOR';if(n(m.net)<0||n(m.profitFactor)<1)return '📉 ZAYIFLIYOR';return '➡️ DENGELİ'}
function build(activePositions=[]){
  const labPremier=require('./62_lab_premier_league.js');
  const lifecycle=require('./68_lab_lifecycle_evolution.js');
  const model=labPremier.summaryModel(activePositions);
  const life=lifecycle.read(); const lifeByLab=life.byLab||{};
  const premier=(model.league?.historicalPremier||[]).map(c=>({...c,selectionI2:componentScore(c,lifeByLab[c.labKey]),form:formLabel(c)})).sort((a,b)=>b.selectionI2.score-a.selectionI2.score);
  const reverse=(model.league?.reversePremier||[]).map(c=>({...c,selectionI2:componentScore(c,lifeByLab[c.labKey]),form:formLabel(c)}));
  const candidates=reverse.filter(x=>x.reversePremierCandidate).sort((a,b)=>n(b.liveMetrics?.expectancy)-n(a.liveMetrics?.expectancy));
  const lifeRows=Object.values(lifeByLab); const stopReady=lifeRows.filter(x=>x.stop?.recommendation?.ready).length; const beReady=lifeRows.filter(x=>x.be?.recommendation?.ready).length;
  const exitChanges=premier.filter(x=>x.pendingExitChange).length;
  const changes={strengthening:premier.filter(x=>x.form.includes('GÜÇLENİYOR')).length,weakening:premier.filter(x=>x.form.includes('ZAYIFLIYOR')).length,exitChanges,stopReady,beReady,reverseCandidates:candidates.length};
  return {version:VERSION,model,premier,reverse,candidates,changes,lifecycleRows:lifeRows};
}
function commentary(d){
  const lines=[]; const p=d.model.aggregate||{}; const r=d.model.trackMetrics?.reverse||{};
  if(n(p.closed)===0) lines.push('⏳ İlk Premier bilimsel kapanışları bekleniyor.');
  else lines.push(n(p.net)>0&&n(p.profitFactor)>1?'✅ Premier sonuç ekonomisi pozitif.':'⚠️ Premier sonuç ekonomisi henüz pozitif değil.');
  if(n(r.closed)>0) lines.push(n(r.net)>0&&n(r.profitFactor)>1?'✅ Negative League ters gölge pozitif ekonomi üretiyor.':'⚠️ Negative League ters gölge henüz pozitif değil.');
  if(d.changes.reverseCandidates)lines.push(`🔥 ${d.changes.reverseCandidates} Reverse Premier adayı kanıt kapısını geçti.`);
  if(d.changes.exitChanges)lines.push(`🎯 ${d.changes.exitChanges} Premier yeni işlemde güncel Exit alacak.`);
  if(d.changes.stopReady||d.changes.beReady)lines.push(`🧬 Yaşam kanıtı: Stop ${d.changes.stopReady} | BE ${d.changes.beReady} hazır.`);
  return lines.slice(0,5);
}
function telegram(activePositions=[], prebuilt=null){
  const d=prebuilt||build(activePositions); const m=d.model; const a=m.aggregate||{}; const r=m.trackMetrics?.reverse||{}; const l=m.league||{}; const ac=m.accounting||{};
  const displayVersion = runtimeVersion.botSurumu || runtimeVersion.kod || VERSION;
  const renko = renkoEntryEvolution.summary();
  const renkoPremierPatterns = (renko.profiles || []).filter(p => {
    const cur = (p.candidates || []).find(x => Math.abs(n(x.brick) - n(p.activeBrick)) < 1e-9) || {};
    return n(p.closed) >= 5 && n(cur.net) > 0 && n(cur.pf) > 1 && n(cur.expectancy) > 0;
  }).length;
  const livePremier = (activePositions||[]).filter(p=>p?.labPremierObservation?.upperLayerIncluded===true || p?.labPremierDecision?.upperLayerIncluded===true).length;
  let t=`🧠 <b>AGROS OPERASYON MERKEZİ — ${displayVersion}</b>\n`;
  t+=`🧬 Öğrenilmiş exact-context Premier ${renkoPremierPatterns} | 📦 Canlı Premier ${livePremier} | 📒 Kapanan Premier N${n(a.closed)}\n`;
  t+=`💰 Premier sonuçları: ✅${n(a.tp)} ❌${n(a.sl)} ⚖️${n(a.be)} | WR %${(n(a.tp)+n(a.sl))?((n(a.tp)/(n(a.tp)+n(a.sl)))*100).toFixed(1):'0.0'} | Net ${signed(a.net,4)} | PF ${pf(a.profitFactor)} | Exp ${signed(a.expectancy,4)}\n`;
  if(n(r.opened)||n(r.active)||n(r.closed)||d.candidates.length){
    t+=`☠️ Reverse: Açılan ${n(r.opened)} | Aktif ${n(r.active)} | N${n(r.closed)} | Net ${signed(r.net,4)} | PF ${pf(r.profitFactor)}\n`;
  }
  t+=`🏆 Ligler: Öğrenilmiş Premier ${renkoPremierPatterns} | Negative ${n(l.reversePremierCount)} | LAB ${n(l.labLeagueCount)} | Yakın ${n(l.nearProfitCount)}\n`;
  t+=`📦 Premier gözlem defteri: Bilimsel aktif ${n(ac.activeScientific)} | Premier GAP aktif ${n(ac.activeGap)}\n`;
  t+=`🧮 Premier mutabakatı: ${ac.equation || '—'} | Fark ${signed(ac.difference,0)} ${ac.reconciled?'✅':'⚠️'}\n`;
  const top=d.premier.slice(0,5);
  if(top.length){
    t+='\n🏆 <b>PREMIER KARAR VE FORM ÖZETİ</b>\n';
    t+=top.map(x=>`${x.labDnaLabel} | Skor ${x.selectionI2.score} | ${x.form} | Yeni N${n(x.liveMetrics?.closed)} Net${signed(x.liveMetrics?.net)}`).join('\n');
  }
  if(d.candidates.length){
    t+='\n\n☠️ <b>NEGATIVE LEAGUE / REVERSE ADAYLARI</b>\n';
    t+=d.candidates.slice(0,5).map(x=>`🔥 ${x.sourceLabDnaLabel||x.labDnaLabel} → ${x.reverseTargetLabDnaLabel||x.executionSide} | N${n(x.liveMetrics?.closed)} Net${signed(x.liveMetrics?.net)} PF${pf(x.liveMetrics?.profitFactor)}`).join('\n');
  }
  const changeTotal=Object.values(d.changes).reduce((sum,x)=>sum+n(x),0);
  if(changeTotal){
    t+='\n\n📈 <b>DEĞİŞENLER / ÖĞRENME</b>\n';
    t+=`📈 Güçlenen ${d.changes.strengthening} | 📉 Zayıflayan ${d.changes.weakening} | 🎯 Exit ${d.changes.exitChanges}\n`;
    t+=`🛡 Stop ${d.changes.stopReady} | 💰 BE ${d.changes.beReady} | 🔁 Reverse ${d.changes.reverseCandidates}\n`;
  }
  const yorum=commentary(d); if(yorum.length)t+='\n\n🧠 <b>AGROS YORUMU</b>\n'+yorum.join('\n');
  return t;
}
module.exports={VERSION,componentScore,build,commentary,telegram};
