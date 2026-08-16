'use strict';
const assert = require('assert');
const fs = require('fs');

const rev = fs.readFileSync('./revizyon.js', 'utf8');
const bot = fs.readFileSync('./bot.js', 'utf8');
const settings = require('./ayarlar.js');
const version = require('./versiyon.js');

assert.strictEqual(version.botSurumu, '6.13.5-R25.4-STARTUP-CORE-LIVENESS-N5-20SLOT-20USDT');
assert.ok(rev.includes('superTrendHesapla(false, {') && rev.includes('skipTrend: true') && rev.includes("priority: 'LOW'"),
  'core periodic refresh must update 1m Renko ST without ST1 shadow');
assert.ok(!rev.includes("superTrendHesapla(true, {\n                concurrency: ayarlar.binanceAgEszamanlilik"),
  'startup must not immediately launch the old 200-symbol ST1 shadow warmup');
assert.ok(rev.includes('function st1ShadowTazelemeyiBaslat()'), 'deferred ST1 shadow scheduler missing');
assert.ok(bot.includes("if (typeof revizyon.st1ShadowTazelemeyiBaslat === 'function') revizyon.st1ShadowTazelemeyiBaslat();"),
  'ST1 shadow must start only after first Golden Renko scan');

const firstAudit = bot.indexOf("console.log(`✅ [ST2 İLK TARAMA TAMAMLANDI]");
const shadowStart = bot.indexOf("revizyon.st1ShadowTazelemeyiBaslat()");
assert.ok(firstAudit >= 0 && shadowStart > firstAudit, 'shadow scheduler must be armed after first audit');

assert.ok(bot.includes("[ST2 MAIN LOOP WATCHDOG]"), 'main-loop watchdog evidence missing');
assert.ok(bot.includes("donguAsama = 'FUTURES_PRICES'"), 'price-stage watchdog marker missing');
assert.ok(bot.includes("donguAsama = 'POSITION_PROTECTION'"), 'protection-stage watchdog marker missing');
assert.ok(bot.includes("donguAsama = 'RENKO_SCAN'"), 'Renko-stage watchdog marker missing');
assert.strictEqual(settings.st1ShadowPeriyodikAktif, true);
assert.ok(Number(settings.st1ShadowIlkTaramaGecikmeMs) >= 30000);
assert.strictEqual(Number(settings.st1ShadowIstekRetry), 0);

console.log('✅ v6.13.5-R16 core loop liveness + ST1 shadow isolation passed | first Renko audit before shadow network load + watchdog truth');
