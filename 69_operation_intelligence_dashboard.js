/**
 * AGROS v5.3.5 — LIVE OPERATIONS + SELECTION INTELLIGENCE 2.0
 * Raporlama/karar-açıklama katmanıdır. Trade Engine kapılarını değiştirmez.
 */
const VERSION = 'v6.8.2-OPERATION-AND-LIFECYCLE-TRANSPARENCY';
const runtimeVersion = require('./versiyon.js');
const renkoEntryEvolution = require('./73_st2_renko_entry_evolution.js');
const adaptiveDnaEntry = require('./76_st2_adaptive_dna_entry.js');
const globalReconciliation = require('./78_st2_global_historical_reconciliation.js');
const winningIntelligence = require('./75_st2_winning_intelligence.js');
function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,v))}
function signed(v,d=2){const x=n(v);return `${x>=0?'+':''}${x.toFixed(d)}`}
function pf(v){return n(v)>=999?'∞':n(v).toFixed(2)}
function directionRows(label,summary){
  const by=summary?.byDirection||{};
  return ['LONG','SHORT'].map(yon=>{
    const x=by[yon]||{};
    return `${label} ${yon}: N${n(x.n)} | ✅${n(x.tp)} ❌${n(x.sl)} ⚖️${n(x.be)} | WR %${n(x.wr).toFixed(1)} | Net ${signed(x.net,4)} | PF ${pf(x.pf)}`;
  });
}
function scientificOutcome(row){
  const explicit=String(row?.result?.outcome||row?.result?.sonuc||'').toUpperCase();
  if(['TP','SL','BE'].includes(explicit)) return explicit;
  const net=winningIntelligence.actualNet(row);
  return net>1e-9?'TP':(net<-1e-9?'SL':'BE');
}
function scientificPremierRow(row){
  const pos=row?.pos||{};
  const frozen=pos?.labPremierDecision||{};
  const observation=pos?.labPremierObservation||pos?.premierObservation||{};
  const track=String(frozen?.premierTrack||observation?.premierTrack||pos?.premierTrackAtOpen||'').toUpperCase();
  const shadowOnly=pos?.leagueShadowOnly===true||frozen?.virtualShadowOnly===true
    ||['REVERSE_PREMIER','REVERSE_SHADOW','BOTTOM_PREMIER_LONG','BOTTOM_PREMIER_SHORT'].includes(track);
  const upper=frozen?.upperLayerIncluded===true||observation?.upperLayerIncluded===true
    ||pos?.renkoPremierDecision?.premier===true;
  return upper&&!shadowOnly;
}
function scientificDirection(row){
  const yon=String(row?.pos?.yon||row?.pos?.side||row?.result?.yon||row?.result?.side||row?.yon||'').toUpperCase();
  return yon==='LONG'||yon==='SHORT'?yon:'UNKNOWN';
}
function summarizeScientificRowsBase(rows=[]){
  const out={n:0,tp:0,sl:0,be:0,net:0,grossProfit:0,grossLoss:0};
  for(const row of rows){
    const net=winningIntelligence.actualNet(row);
    const outcome=scientificOutcome(row);
    out.n++; out.net+=n(net);
    if(net>1e-9) out.grossProfit+=net;
    else if(net<-1e-9) out.grossLoss+=Math.abs(net);
    if(outcome==='TP') out.tp++;
    else if(outcome==='BE') out.be++;
    else out.sl++;
  }
  out.wr=(out.tp+out.sl)?out.tp/(out.tp+out.sl)*100:0;
  out.pf=out.grossLoss>0?out.grossProfit/out.grossLoss:(out.grossProfit>0?999:0);
  out.expectancy=out.n?out.net/out.n:0;
  out.reconciled=out.n===out.tp+out.sl+out.be;
  return out;
}
function summarizeScientificRows(rows=[]){
  const out=summarizeScientificRowsBase(rows);
  const groups={LONG:[],SHORT:[],UNKNOWN:[]};
  for(const row of rows) groups[scientificDirection(row)].push(row);
  out.byDirection={
    LONG:summarizeScientificRowsBase(groups.LONG),
    SHORT:summarizeScientificRowsBase(groups.SHORT),
    UNKNOWN:summarizeScientificRowsBase(groups.UNKNOWN)
  };
  out.directionalReconciled=out.n===out.byDirection.LONG.n+out.byDirection.SHORT.n+out.byDirection.UNKNOWN.n;
  return out;
}
function scientificLedgerPartitions(rows=null){
  const scientificRows=Array.isArray(rows)
    ? rows
    : globalReconciliation.readJsonl(globalReconciliation.LIVE_LEDGER,'SCIENTIFIC_CLOSE');
  const premierRows=[]; const shadowRows=[]; const realPremierRows=[]; const virtualPremierRows=[];
  for(const row of scientificRows){
    if(scientificPremierRow(row)){
      premierRows.push(row);
      const isReal = row?.pos?.sanal === false || row?.result?.sanal === false || row?.execution?.real === true;
      if(isReal) realPremierRows.push(row); else virtualPremierRows.push(row);
    } else shadowRows.push(row);
  }
  return {
    total:summarizeScientificRows(scientificRows),
    premier:summarizeScientificRows(premierRows),
    realPremier:summarizeScientificRows(realPremierRows),
    virtualPremier:summarizeScientificRows(virtualPremierRows),
    shadow:summarizeScientificRows(shadowRows)
  };
}
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
  const premier=(model.league?.premier||[]).map(c=>({...c,selectionI2:componentScore(c,lifeByLab[c.labKey]),form:formLabel(c)})).sort((a,b)=>b.selectionI2.score-a.selectionI2.score);
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
  const adaptiveSummary = adaptiveDnaEntry.summary();
  const renkoPremierPatterns = n(adaptiveSummary.health?.historicalPremierProfiles);
  const renkoShadowDnas = Math.max(0,n(adaptiveSummary.health?.historicalProfiles)-renkoPremierPatterns);
  // Tek doğruluk kaynağı: accounting continuity tarafından üretilen bilimsel aktif Premier sayısı.
  // Restart-GAP veya eski upperLayerIncluded işaretleri üst başlığa sızamaz.
  const livePremier = n(ac.activeScientific);
  let t=`🧠 <b>AGROS OPERASYON MERKEZİ — ${displayVersion}</b>\n`;
  t+=`🧬 Tarihsel exact Premier ${renkoPremierPatterns} | 👻 Tarihsel Shadow/izleme ${renkoShadowDnas} | 📦 Canlı Premier ${livePremier} | 📒 Kapanan Premier N${n(a.closed)}\n`;
  t+=`💰 Premier sonuçları: ✅${n(a.tp)} ❌${n(a.sl)} ⚖️${n(a.be)} | WR %${(n(a.tp)+n(a.sl))?((n(a.tp)/(n(a.tp)+n(a.sl)))*100).toFixed(1):'0.0'} | Net ${signed(a.net,4)} | PF ${pf(a.profitFactor)} | Exp ${signed(a.expectancy,4)}\n`;
  // v6.8.1: Shadow sonucu doğrudan bilimsel ledger'ın Shadow satırlarından üretilir.
  // Eski yöntem, toplam ekonomide net işaretine göre sayılan wins/losses değerlerinden
  // Premier'in açık TP/SL/BE sayaçlarını çıkarıyordu. Pozitif netli BE kayıtlarında
  // bu iki sınıflandırma çakışıyor ve N104 yanında 67+39+0=106 gibi sonuç doğuruyordu.
  const scientificPartitions=scientificLedgerPartitions();
  const premierDirectional=scientificPartitions.premier;
  const realPremierDirectional=scientificPartitions.realPremier;
  const shadow=scientificPartitions.shadow;
  t+=`👻 Shadow sonuçları: N${shadow.n} | ✅${shadow.tp} ❌${shadow.sl} ⚖️${shadow.be} | WR %${shadow.wr.toFixed(1)} | Net ${signed(shadow.net,4)} | PF ${pf(shadow.pf)} | Exp ${signed(shadow.expectancy,4)} ${shadow.reconciled?'✅':'⚠️'}\n`;
  t+=`\n🧭 <b>YÖNSEL SONUÇLAR</b>\n`;
  t+=directionRows('💰 Bilimsel Premier',premierDirectional).join('\n')+'\n';
  t+=directionRows('💳 Gerçek Premier',realPremierDirectional).join('\n')+'\n';
  t+=directionRows('👻 Shadow',shadow).join('\n')+'\n';
  if(n(r.opened)||n(r.active)||n(r.closed)||d.candidates.length){
    t+=`☠️ Reverse: Açılan ${n(r.opened)} | Aktif ${n(r.active)} | N${n(r.closed)} | Net ${signed(r.net,4)} | PF ${pf(r.profitFactor)}\n`;
  }
  t+=`🏆 Ligler: Exact Premier ${renkoPremierPatterns} | Exact Shadow ${renkoShadowDnas} | Bu oturum terfi ${n(l.livePromotedCount)} | Bu oturum düşüş ${n(l.liveDemotedCount)} | Canlı koşul Premier ${n(l.liveConditionPremierCount)} | Canlı koşul Shadow ${n(l.liveConditionShadowCount)}\n`;
  t+=`🧪 Diğer ligler: Negative ${n(l.reversePremierCount)} | LAB ${n(l.labLeagueCount)} | Yakın ${n(l.nearProfitCount)}\n`;
  const transitionRows=[...(l.sessionPromotions||[]),...(l.sessionDemotions||[])].sort((a,b)=>Date.parse(b.at||0)-Date.parse(a.at||0)).slice(0,5);
  if(transitionRows.length){
    t+='🔄 <b>GERÇEK LİG HAREKETLERİ</b>\n';
    t+=transitionRows.map(x=>`${x.type==='SHADOW_TO_PREMIER'?'⬆️':'⬇️'} ${x.labKey||'LAB'} | ${x.previousLeague} → ${x.newLeague} | N${n(x.metrics?.closed)} Net${signed(x.metrics?.net)} PF${pf(x.metrics?.profitFactor)} | ${x.reason}`).join('\n')+'\n';
  }
  t+=`📦 Premier gözlem defteri: Canlı bilimsel ${n(ac.activeScientific)} | Restart-GAP ${n(ac.activeGap)} | GAP kapanan ${n(ac.closedGap)}\n`;
  t+=`🧮 Premier mutabakatı: ${ac.equation || '—'} | Fark ${signed(ac.difference,0)} ${ac.reconciled?'✅':'⚠️'}\n`;
  const top=d.premier.slice(0,5);
  if(top.length){
    t+='\n🏆 <b>PREMIER KARAR VE FORM ÖZETİ</b>\n';
    t+=top.map(x=>{const review=x.liveLeagueReview||{};const min=n(review.thresholds?.minClosed,5);const decision=review.complete?`Canlı lig: ${review.currentLeague}`:`Canlı lig: N${n(review.metrics?.closed)}/${min} — karar bekliyor`;return `${x.labDnaLabel} | Skor ${x.selectionI2.score} | Form ${x.form} | ${decision} | Net${signed(review.metrics?.net??x.liveMetrics?.net)}`}).join('\n');
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
module.exports={VERSION,componentScore,build,commentary,telegram,scientificOutcome,scientificDirection,scientificPremierRow,summarizeScientificRows,summarizeScientificRowsBase,scientificLedgerPartitions};
