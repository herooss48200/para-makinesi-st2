'use strict';
const assert = require('assert');
const version = require('./versiyon.js');

assert.strictEqual(typeof version, 'object', 'versiyon.js object API must be preserved');
assert.strictEqual(typeof version.kisaOzet, 'function', 'kisaOzet runtime function missing');
assert.strictEqual(typeof version.telegramOzet, 'function', 'telegramOzet runtime function missing');
assert.strictEqual(typeof version.detayliOzet, 'function', 'detayliOzet runtime function missing');
assert.ok(/^6\.(3\.[2-9]|4\.[01])-/.test(version.botSurumu), `Beklenmeyen ileri sürüm: ${version.botSurumu}`);
assert.ok(version.kisaOzet().includes(version.botSurumu));
assert.ok(version.telegramOzet().includes('/ SANAL'));
assert.strictEqual(version.detayliOzet().botSurumu, version.botSurumu);
console.log('✅ v6.3.1 runtime version contract recovery passed');
