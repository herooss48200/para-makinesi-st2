'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v672-'));
process.env.AGROS_DATA_DIR = tmp;

const evo = require('./74_st2_renko_exit_evolution.js');
assert.strictEqual(evo.VERSION, 'v6.7.2-SAFE-ADAPTIVE-ATR-CAPTURE');
assert(evo.DEFAULT_TAKEOVER() >= 0.25, 'varsayılan takeover sıfır olamaz');
assert(evo.DEFAULT_ATR() >= 1.0, 'varsayılan ATR çarpanı sıfır olamaz');
assert(evo.SAFE_FLOOR_MIN() >= 0.15, 'güvenli taban komisyon + net kâr tamponunu karşılamalı');

// Eski/bozuk state içindeki null veya 0 profil yeni pozisyona sıfır takeover/ATR atayamaz.
fs.writeFileSync(evo.STATE_FILE, JSON.stringify({
  version: 'OLD', processedIds: {}, health: {},
  profiles: {
    'SHORT|GGGG': {
      closed: 1, activeTrail: 1,
      activeTakeoverPct: 0, activeAtrMultiplier: 0,
      activeCaptureRatio: 0, activeSafeFloorPct: 0,
      online: { samples: 1 }
    }
  }
}, null, 2));
const profile = evo.activeProfileFor('SHORT', 'GGGG');
assert.strictEqual(profile.source, 'SAFE_DEFAULT');
assert(profile.takeoverPct >= 0.25);
assert(profile.atrMultiplier >= 1.0);
assert(profile.captureRatio >= 0.40);
assert(profile.safeFloorPct >= 0.15);

const pos = {
  sym: 'SAFEUSDT', yon: 'SHORT', girisFiyati: 100, sl: 101,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGG', renkoBoxSize: 0.20 }
};
const assignment = evo.assign(pos);
assert(assignment.assignedTakeoverPct >= 0.25);
assert(assignment.assignedAtrMultiplier >= 1.0);
assert(assignment.assignedSafeFloorPct >= 0.15);
const atEntry = evo.update(pos, 100);
assert.strictEqual(atEntry.active, false, 'takeover giriş fiyatında anında devreye girmemeli');
assert.strictEqual(atEntry.reason, 'TAKEOVER_THRESHOLD_NOT_REACHED');

// Güvenli eşiğe ulaşıldığında stop girişe değil, komisyon sonrası pozitif tabana taşınır.
const activatePrice = 100 * (1 - assignment.assignedTakeoverPct / 100);
pos.execution = { pricePath: [{ price: activatePrice, pnlPct: assignment.assignedTakeoverPct, atrPct: 0.20, ts: Date.now() }] };
const activated = evo.update(pos, activatePrice);
assert.strictEqual(activated.active, true);
assert.strictEqual(activated.justActivated, true);
const protectedGrossPct = (100 - pos.sl) / 100 * 100;
assert(protectedGrossPct >= 0.149, `korunan brüt kâr tabanı yetersiz: ${protectedGrossPct}`);
assert(pos.sl < 100, 'SHORT stop girişin altında, kâr bölgesinde olmalı');

// Çetele kapanışta gerçekten uygulanan öğrenen ATR metoduna taşınmalı.
const scoreboard = require('./52_exit_method_scoreboard.js');
const scorePos = { sym: 'METHODUSDT', yon: 'LONG' };
scoreboard.open(scorePos);
scorePos.renkoExitActivated = true;
scorePos.renkoExitLastStopSourceLabel = 'Öğrenilmiş MFE kâr koruma';
const score = scoreboard.close(scorePos, { outcome: 'TP', net: 1, commission: 0.1 });
assert.strictEqual(score.id, 'RENKO_ADAPTIVE_ATR_MFE');
assert.strictEqual(score.label, 'Öğrenen ATR + MFE Kâr Takibi');
assert.strictEqual(score.opened, 1, 'açılan sayaç uygulanan metoda taşınmalı');
assert.strictEqual(score.closed, 1);

// Canlı Premier aktif sayısı observation.active kalıntısından değil mevcut pozisyon partition'ından gelir.
const h = require('./1_hafiza.js');
h.state.accountingContinuity = {
  current: {
    opened: 71, closed: 68,
    openedPremier: 71, closedPremier: 34,
    openedShadow: 0, closedShadow: 0,
    openedReal: 0, closedReal: 0,
    closedScientific: 34, closedRestartGap: 34
  },
  legacy: {}, recentClosedIds: []
};
const gapPositions = [1,2,3].map(i => ({
  sym: `GAP${i}USDT`, yon: 'LONG', sanal: true,
  accountingContinuityTracked: true,
  accountingContinuityClosed: false,
  accountingContinuityTrack: 'LAB_PREMIER',
  restartRecovered: true,
  labPremierDecision: { upperLayerIncluded: true }
}));
const league = require('./62_lab_premier_league.js');
const accounting = league.premierAccounting(gapPositions, { opened: 71, active: 37, closed: 34 });
assert.strictEqual(accounting.activeScientific, 0);
assert.strictEqual(accounting.activeGap, 3);
assert.strictEqual(accounting.closedGap, 34);
assert.strictEqual(accounting.reconciled, true);

const bot = fs.readFileSync('./bot.js', 'utf8');
const entry = fs.readFileSync('./72_st2_renko_entry.js', 'utf8');
const operation = fs.readFileSync('./69_operation_intelligence_dashboard.js', 'utf8');
const globalReport = fs.readFileSync('./78_st2_global_historical_reconciliation.js', 'utf8');
assert(bot.includes('Tekil kritik teslim doğrulandı'), 'startup Telegram başarı kanıtı eksik');
assert(bot.includes("startupPanelPlanla('ILK_ST2_TARAMA', 0)"), 'canlı panel ilk ST2 taramasından sonra başlamalı');
assert(entry.includes('await h.telegramMesajGonderTekil(mesaj'), 'açılış pusu özeti tekil kritik hattan gönderilmeli');
assert(entry.includes('AYNI BOOTTA TEKRAR YOK'), 'belirsiz açılış teslimi aynı bootta tekrarlanmamalı');
assert(entry.includes('st2-yeni-pusu:${bildirimAnahtari}'), 'yeni pusu coalesce anahtarı eksik');
assert(operation.includes('📦 Canlı Premier'), 'üst rapor gerçek canlı Premier adını göstermeli');
assert(!operation.includes('Bilimsel Premier aktif'), 'yanıltıcı aktif etiketi kalmamalı');
assert(globalReport.includes('Runtime ${runtimeVersion.botSurumu'), 'Global rapor runtime sürümünü göstermeli');
assert(!globalReport.includes('RECONCILIATION — v6.6.1'), 'eski sabit sürüm başlığı kalmamalı');
assert(globalReport.includes("PF etkisi ${pfEtki}"), 'sonsuz PF farkı açıklanabilir gösterilmeli');

const hafiza = fs.readFileSync('./1_hafiza.js', 'utf8');
assert(hafiza.includes('async function telegramMesajGonderTekil'), 'tekil Telegram fonksiyonu eksik');
assert(hafiza.includes('preferCurl: true'), 'tekil Telegram curl-first olmalı');
assert(hafiza.includes('atMostOnce: true'), 'tekil Telegram at-most-once olmalı');
assert(hafiza.includes('options.atMostOnce !== true'), 'HTML fallback tekil hatta kapalı olmalı');
assert(bot.includes('h.telegramMesajGonderTekil(baslangicMesaji'), 'startup tekil teslim hattını kullanmalı');
console.log('✅ v6.7.2 single-delivery Telegram + safe adaptive exit + report truth passed');
