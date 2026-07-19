const fs = require('fs');
const assert = require('assert');

const motor = fs.readFileSync('motor.js', 'utf8');
const pos = fs.readFileSync('4_pozisyon.js', 'utf8');
const bb = fs.readFileSync('8_blackbox.js', 'utf8');

const pushAt = motor.indexOf('h.state.aktifPozisyonlar.push(yeniPozisyon);');
const labAt = motor.indexOf('labPremier.applyToPosition(yeniPozisyon)');
assert(pushAt >= 0 && labAt >= 0 && pushAt < labAt, 'Temel state kaydı LAB yardımcı katmanından önce olmalı');
assert(motor.includes("kaliciHafiza.kaydet('sanal-pozisyon-temel-kayit')"), 'Temel sanal state kalıcı kayda alınmalı');
assert(motor.includes('[ENTRY AUX] TELEGRAM_ERROR'), 'Telegram hatası yardımcı katman olarak yakalanmalı');
assert(motor.includes('[ENTRY_SUCCESS]'), 'Başarılı giriş terminal sonucu bulunmalı');
assert(pos.includes('[ENTRY_ABORT:POSITION_OPEN_RETURNED_FALSE]'), 'Başarısız giriş terminal sonucu bulunmalı');
assert(bb.includes('BLACKBOX_REQUEST_TIMEOUT_MS'), 'Blackbox istek timeout sabiti bulunmalı');
assert(bb.includes('BLACKBOX_SNAPSHOT_TIMEOUT_MS'), 'Blackbox snapshot timeout sabiti bulunmalı');
assert(bb.includes('BLACKBOX_CANDLE_TIMEOUT:'), 'Mum isteği timeout kodu bulunmalı');
assert(bb.includes('BLACKBOX_SNAPSHOT_TIMEOUT:'), 'Snapshot timeout kodu bulunmalı');
console.log('✅ v5.0.0 entry-chain reliability contract tests passed');
