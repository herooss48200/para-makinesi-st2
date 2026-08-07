'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agros-v672-'));
process.env.AGROS_DATA_DIR = tmp;

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'binance-api-node') return { default: () => ({}) };
  if (request === 'axios') return { create: () => ({}), get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
  if (request === 'technicalindicators') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const evo = require('./74_st2_renko_exit_evolution.js');
assert.strictEqual(evo.VERSION, 'v6.11.2-DIRECT-PROFIT-FLOOR-TWO-SLOT');
assert.strictEqual(evo.BRICK_LIVE_MODE(), true, 'canlı model komisyon güvenli Renko tuğla takibi olmalı');
assert(evo.DEFAULT_TAKEOVER() >= 0.25, 'varsayılan takeover sıfır olamaz');
assert(evo.DEFAULT_ATR() >= 1.0, 'varsayılan ATR çarpanı sıfır olamaz');
assert(evo.SAFE_FLOOR_MIN() >= 0.40, 'güvenli taban komisyon + net kâr tamponunu karşılamalı');

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
assert(['SAFE_DEFAULT', 'SAFE_ECONOMY_FALLBACK'].includes(profile.source));
assert(['SAFE_DEFAULT_BRICK_TRAIL','PERSISTED_BRICK_TRAIL','NET_ECONOMY_LEARNED_BRICK_TRAIL'].includes(profile.trailSource));
assert(profile.takeoverPct >= 0.25);
assert(profile.atrMultiplier >= 1.0);
assert(profile.captureRatio >= 0.40);
assert(profile.safeFloorPct >= 0.40);

const pos = {
  sym: 'SAFEUSDT', yon: 'SHORT', girisFiyati: 100, sl: 101,
  girisAnalizi: { entryStrategy: 'ST2_RENKO', patternKodu: 'GGGG', renkoBoxSize: 0.20 }
};
const assignment = evo.assign(pos);
assert(assignment.assignedTakeoverPct >= 0.25);
assert(assignment.assignedAtrMultiplier >= 1.0);
assert(assignment.assignedSafeFloorPct >= 0.40);
const atEntry = evo.update(pos, 100);
assert.strictEqual(atEntry.active, false, 'güvenli kâr koruması oluşmadan Renko takip devreye girmemeli');
assert.strictEqual(atEntry.reason, 'CURRENT_PRICE_BELOW_DIRECT_FLOOR_ARM_THRESHOLD');

// Doğrudan canlı aktivasyon görüldüğünde stop girişe değil, komisyon sonrası pozitif tabana taşınır.
// Eski BE kademe alanları artık canlı Renko aktivasyonunu belirlemez.
pos.breakevenAktif = false;
pos.korunanKarYuzdesi = 0;
const activatePrice = 99.20;
pos.execution = { pricePath: [{ price: activatePrice, pnlPct: 0.80, atrPct: 0.20, ts: Date.now() }] };
const activated = evo.update(pos, activatePrice);
assert.strictEqual(activated.active, true);
assert.strictEqual(activated.justActivated, true);
const protectedGrossPct = (100 - pos.sl) / 100 * 100;
assert(protectedGrossPct >= 0.399, `korunan brüt kâr tabanı yetersiz: ${protectedGrossPct}`);
assert(pos.sl < 100, 'SHORT stop girişin altında, kâr bölgesinde olmalı');

// Çetele kapanışta gerçekten uygulanan öğrenen ATR metoduna taşınmalı.
const scoreboard = require('./52_exit_method_scoreboard.js');
const scorePos = { sym: 'METHODUSDT', yon: 'LONG', renkoExitAssignment: { assignedTakeoverPct: 0.28, assignedAtrMultiplier: 1.09, assignedCaptureRatio: 0.85 } };
scoreboard.open(scorePos);
scorePos.renkoExitActivated = true;
scorePos.renkoExitLastStopSourceLabel = 'Öğrenilmiş MFE kâr koruma';
const score = scoreboard.close(scorePos, { outcome: 'TP', net: 1, commission: 0.1 });
assert.strictEqual(score.method.id, 'RENKO_ADAPTIVE_ATR_MFE');
assert.strictEqual(score.method.label, 'Öğrenen ATR + MFE Kâr Takibi');
assert.strictEqual(score.method.opened, 1, 'açılan sayaç uygulanan metoda taşınmalı');
assert.strictEqual(score.method.closed, 1);
assert.strictEqual(score.assignment.closed, 1, 'atanan bütün işlemler atama evreninde kapanmalı');
assert.strictEqual(score.assignment.postTakeoverProfit, 1, 'takeover sonrası kârlı kapanış ayrılmalı');
assert.strictEqual(score.assignment.reconciled, true, 'atama çetelesi tüm kapanışlarla mutabık olmalı');

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
assert(bot.includes('createSt2LivePanelScheduler') && bot.includes('ready: () => h.state.startupMarketReady === true'), 'canlı panel Gate READY sonrası bağımsız scheduler ile başlamalı');
assert(entry.includes('await h.telegramMesajGonderTekil(mesaj'), 'açılış pusu özeti tekil kritik hattan gönderilmeli');
assert(entry.includes('AYNI BOOTTA TEKRAR YOK'), 'belirsiz açılış teslimi aynı bootta tekrarlanmamalı');
assert(entry.includes('st2-yeni-pusu:${bildirimAnahtari}'), 'yeni pusu coalesce anahtarı eksik');
assert(operation.includes('📦 Canlı Premier'), 'üst rapor gerçek canlı Premier adını göstermeli');
assert(!operation.includes('Bilimsel Premier aktif'), 'yanıltıcı aktif etiketi kalmamalı');
assert(globalReport.includes('Runtime ${runtimeVersion.botSurumu'), 'Global rapor runtime sürümünü göstermeli');
assert(!globalReport.includes('RECONCILIATION — v6.6.1'), 'eski sabit sürüm başlığı kalmamalı');
assert(globalReport.includes('TETİKLENEN AYNI İŞLEMLER'), 'replay aynı işlem evreniyle karşılaştırılmalı');
assert(globalReport.includes('TEORİK TOPLAM'), 'tam evren teorik toplamı açık gösterilmeli');
assert(!globalReport.includes('optimized.all.net-actual.all.net'), 'N6 replay ile N165 baz ekonomi doğrudan çıkarılmamalı');

const hafiza = fs.readFileSync('./1_hafiza.js', 'utf8');
assert(hafiza.includes('async function telegramMesajGonderTekil'), 'tekil Telegram fonksiyonu eksik');
assert(hafiza.includes('freshConnection: true'), 'tekil Telegram taze Native bağlantı kullanmalı');
assert(!hafiza.includes('preferCurl: true'), 'tekil Telegram curl-first olmamalı');
assert(hafiza.includes('atMostOnce: true'), 'tekil Telegram at-most-once olmalı');
assert(hafiza.includes('options.atMostOnce !== true'), 'HTML fallback tekil hatta kapalı olmalı');
assert(bot.includes('h.telegramMesajGonderTekil(baslangicMesaji'), 'startup tekil teslim hattını kullanmalı');
console.log('✅ v6.11.1 single-delivery Native Telegram + safe runner exit + report truth passed');
