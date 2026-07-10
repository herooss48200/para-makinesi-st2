/**
 * AGROS v3.6.2 - RESTART GAP PROTECTION
 *
 * Bot kapalıyken fiyat yolu bilinmeyen aktif pozisyonları bilimsel öğrenmeden ayırır.
 * Muhasebe PNL/komisyon korunur; TP/SL başarı sayaçları, DNA/BlackBox,
 * Analiz Merkezi, Exit Optimizer ve Exit Replay bu işlemleri kullanmaz.
 */

const fs = require('fs');
const path = require('path');
const h = require('./1_hafiza.js');
const ayarlar = require('./ayarlar.js');

const DATA_DIR = path.join(__dirname, 'data');
const JSONL = path.join(DATA_DIR, 'restart-gap-trades.jsonl');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function tradeId(pos) {
  return String(pos?.tradeId || pos?.sanalOrderId || pos?.id || `${pos?.sym || 'SYM'}-${pos?.yon || 'YON'}-${pos?.acilisZamani || pos?.zaman || Date.now()}`);
}

function ozetEnsure() {
  h.state.restartGapOzet = h.state.restartGapOzet || {
    version: 'v3.6.2-RESTART-GAP-PROTECTION',
    quarantinedOnLoad: 0,
    closedQuarantined: 0,
    accountingNetUsdt: 0,
    accountingCommissionUsdt: 0,
    lastLoadAt: null,
    lastCloseAt: null
  };
  return h.state.restartGapOzet;
}

function markLoadedPositions(positions = []) {
  if (ayarlar.restartGapProtectionAktif === false) return 0;
  const loadedAt = nowIso();
  let count = 0;
  for (const pos of positions) {
    if (!pos || !pos.sym || !pos.yon) continue;
    pos.restartRecovered = true;
    pos.dataQuality = 'RESTART_GAP';
    pos.learningEligible = false;
    pos.exitReplayEligible = false;
    pos.dnaEligible = false;
    pos.restartGapLoadedAt = loadedAt;
    count += 1;
  }
  const o = ozetEnsure();
  o.quarantinedOnLoad += count;
  o.lastLoadAt = loadedAt;
  return count;
}

function isQuarantined(pos) {
  if (ayarlar.restartGapProtectionAktif === false) return false;
  return Boolean(
    pos?.restartRecovered === true ||
    pos?.dataQuality === 'RESTART_GAP' ||
    pos?.learningEligible === false
  );
}

function closeRecord(pos, sonuc = {}) {
  if (!isQuarantined(pos)) return null;
  try {
    ensureDir();
    const rec = {
      version: 'v3.6.2-RESTART-GAP-PROTECTION',
      zaman: nowIso(),
      tradeId: tradeId(pos),
      symbol: pos?.sym || '',
      yon: pos?.yon || '',
      dataQuality: 'RESTART_GAP',
      restartRecovered: true,
      learningEligible: false,
      exitReplayEligible: false,
      dnaEligible: false,
      restartGapLoadedAt: pos?.restartGapLoadedAt || null,
      acilisZamani: pos?.acilisZamani || pos?.zaman || null,
      sonuc: sonuc?.sonuc || '',
      kapanisSebebi: sonuc?.kapanisSebebi || '',
      girisFiyati: Number(pos?.girisFiyati || 0),
      kapanisFiyati: Number(sonuc?.kapanisFiyati || 0),
      netKarZarar: Number(sonuc?.netKarZarar || 0),
      komisyon: Number(sonuc?.komisyon || 0),
      note: 'Muhasebeye dahil; strateji/DNA/Exit öğrenmesine dahil değil.'
    };
    fs.appendFileSync(JSONL, JSON.stringify(rec) + '\n');
    const o = ozetEnsure();
    o.closedQuarantined += 1;
    o.accountingNetUsdt += rec.netKarZarar;
    o.accountingCommissionUsdt += rec.komisyon;
    o.lastCloseAt = rec.zaman;
    return rec;
  } catch (err) {
    console.error(`⚠️ [RESTART GAP] Karantina kaydı yazılamadı: ${err.message}`);
    return null;
  }
}

function telegramMetni(pos) {
  if (!isQuarantined(pos)) return '';
  return `\n\n⚠️ <b>RESTART GAP İŞLEMİ</b>\n` +
    `Bot kesintisi sırasında fiyat yolu izlenemedi.\n` +
    `✅ PNL ve komisyon muhasebeye dahil edildi.\n` +
    `🚫 TP/SL başarı, DNA, BlackBox, Exit Optimizer ve Exit Replay öğrenmesine dahil edilmedi.`;
}

module.exports = {
  JSONL,
  markLoadedPositions,
  isQuarantined,
  closeRecord,
  telegramMetni,
  ozetEnsure
};
