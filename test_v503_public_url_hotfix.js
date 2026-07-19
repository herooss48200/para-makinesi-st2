'use strict';
const assert = require('assert');
const fs = require('fs');
const ag = require('./64_binance_network_resilience.js');

const ticker = ag._publicUrlOlustur('/fapi/v1/ticker/price');
const tickerUrl = new URL(ticker);
assert.strictEqual(tickerUrl.protocol, 'https:');
assert.strictEqual(tickerUrl.hostname, 'fapi.binance.com');
assert.strictEqual(tickerUrl.pathname, '/fapi/v1/ticker/price');
assert(!ticker.includes('${'), 'ticker URL contains an uninterpolated template expression');

const klines = new URL(ag._publicUrlOlustur('/fapi/v1/klines', {
  symbol: 'BTCUSDT', interval: '15m', limit: 25
}));
assert.strictEqual(klines.pathname, '/fapi/v1/klines');
assert.strictEqual(klines.searchParams.get('symbol'), 'BTCUSDT');
assert.strictEqual(klines.searchParams.get('interval'), '15m');
assert.strictEqual(klines.searchParams.get('limit'), '25');
assert.throws(() => ag._publicUrlOlustur(''), /PATH_EMPTY/);

const networkSource = fs.readFileSync(require.resolve('./64_binance_network_resilience.js'), 'utf8');
assert(!networkSource.includes("httpsJson('\${MARKET_DATA_BASE_URL}"), 'ticker endpoint regressed to a literal template string');

console.log('✅ v5.0.3 public URL hotfix passed | ticker + klines absolute URL contract');
