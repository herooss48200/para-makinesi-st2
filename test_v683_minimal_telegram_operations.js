'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

const read = file => fs.readFileSync(file, 'utf8');
const hafizaSource = read('1_hafiza.js');
const raporSource = read('2_rapor.js');
const pozisyonSource = read('4_pozisyon.js');
const pusuSource = read('72_st2_renko_entry.js');
const ayarlarSource = read('ayarlar.js');
const exitReplaySource = read('22_exit_replay_engine.js');
const versionSource = read('versiyon.js');

assert(ayarlarSource.includes('telegramMinimalOperasyonModu: true'), 'minimal Telegram modu varsayılan aktif olmalı');
assert(ayarlarSource.includes('telegramMesajMaxKarakter: 3400'), 'tek mesaj güvenli limiti 3400 olmalı');
assert(ayarlarSource.includes('telegramDetayRaporlariAktif: false'), 'ağır Telegram detay raporları kapalı olmalı');
assert(ayarlarSource.includes('telegramCanliRaporMaxPozisyon: 5'), 'canlı panel pozisyon satırı sınırlı olmalı');
assert(ayarlarSource.includes('telegramAcilisPusuMaxSatir: 6'), 'açılış pusu özeti sınırlı olmalı');

assert(hafizaSource.includes('function telegramMetniTekMesajaIndir'), 'merkezi tek-mesaj kısaltıcı eksik');
assert(hafizaSource.includes('telegramMinimalModuAktif() ? [hazir.text]'), 'minimal mod birden fazla Telegram parçası üretmemeli');
assert(hafizaSource.includes('const guvenliMesaj = hazir.text'), 'canlı panel merkezi güvenli metni kullanmalı');
assert(hafizaSource.includes('state.sonCanliRaporMetni = guvenliMesaj'), 'panel karşılaştırması gönderilen güvenli metinle yapılmalı');

assert(raporSource.includes('function minimalCanliRaporMetniOlustur'), 'minimal operasyon paneli eksik');
assert(raporSource.includes('if (ayarlar.telegramMinimalOperasyonModu === true) return minimalCanliRaporMetniOlustur()'), 'canlı rapor minimal moda yönlenmiyor');
assert(raporSource.includes('Ayrıntılı replay, DNA, BB/OHLC ve bilimsel tablolar yalnız log/state/ledger'), 'Telegram dışına taşınan ayrıntılar açıklanmalı');
assert(raporSource.includes("telegramDetayRaporlariAktif === false"), 'ağır Entry/Exit detay raporları bastırılmalı');

assert(pozisyonSource.includes('ayarlar.telegramMinimalOperasyonModu !== true'), 'bilimsel kapanış Telegram bastırma kapısı eksik');
assert(pozisyonSource.includes('bilimsel kapanış ayrıntısı log/state/ledger içinde tutuldu'), 'bilimsel kayıtların kaybolmadığı loglanmalı');
assert(pusuSource.includes('telegramAcilisPusuMaxSatir'), 'açılış pusu Telegram özeti sınırlanmıyor');

assert(!exitReplaySource.includes('kapanisMetni,telegramOzetMetni,periyodikRaporGerekli'), 'tanımsız telegramOzetMetni export hotfixi korunmamış');
assert(versionSource.includes('6.8.3-MINIMAL-TELEGRAM-OPERATIONS'), 'v6.8.3 sürüm etiketi eksik');

// Runtime guard: merkezi kısaltıcı gerçekten tek, düz ve güvenli boyutta mesaj üretmeli.
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
    if (request === 'binance-api-node') return { default: () => ({}) };
    return originalLoad.call(this, request, parent, isMain);
};
try {
    delete require.cache[require.resolve('./1_hafiza.js')];
    const h = require('./1_hafiza.js');
    const longMessage = '<b>BAŞLIK</b>\n' + Array.from({ length: 400 }, (_, i) => `SATIR ${i} ${'x'.repeat(30)}`).join('\n');
    const compact = h.telegramMetniTekMesajaIndir(longMessage);
    assert(compact.length <= 3400, `mesaj limiti aşıldı: ${compact.length}`);
    assert(!compact.includes('<b>'), 'minimal mesaj HTML etiketi içermemeli');
    assert(compact.includes('Ayrıntılı bilimsel kayıt loglarda tutuluyor'), 'kısaltma dipnotu eksik');
    assert.strictEqual(h.telegramMinimalModuAktif(), true, 'runtime minimal mod aktif değil');
} finally {
    Module._load = originalLoad;
}

console.log('✅ AGROS ST2 v6.8.3 minimal Telegram operations + one-message hard limit + runtime export guard passed');
