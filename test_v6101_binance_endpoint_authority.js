'use strict';

const assert = require('assert');
const fs = require('fs');
const Module = require('module');

function setEnv(values) {
  const keys = [
    'AGROS_REAL_ORDER_ENV',
    'BINANCE_BASE_URL',
    'BINANCE_FUTURES_BASE_URL',
    'BINANCE_FUTURES_HTTP_BASE',
    'BINANCE_API_KEY',
    'BINANCE_API_SECRET'
  ];
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values || {});
}

function freshAuthority() {
  const target = require.resolve('./86_st2_binance_endpoint_authority.js');
  delete require.cache[target];
  return require(target);
}

(function endpointResolution() {
  setEnv({ AGROS_REAL_ORDER_ENV: 'MAINNET' });
  let authority = freshAuthority();
  let endpoint = authority.resolve();
  assert.strictEqual(endpoint.httpFutures, authority.MAINNET_HTTP);
  assert.strictEqual(endpoint.mainnet, true);
  assert.strictEqual(endpoint.explicit, false);
  assert.strictEqual(authority.realTradingEndpointValid(endpoint), false, 'Açık URL olmadan gerçek emir endpoint yetkisi açıldı');

  setEnv({ AGROS_REAL_ORDER_ENV: 'MAINNET', BINANCE_BASE_URL: 'https://fapi.binance.com/' });
  authority = freshAuthority();
  endpoint = authority.resolve();
  assert.strictEqual(endpoint.httpFutures, authority.MAINNET_HTTP);
  assert.strictEqual(endpoint.environmentMatches, true);
  assert.strictEqual(authority.realTradingEndpointValid(endpoint), true);
  assert.strictEqual(authority.clientOptions('K', 'S').httpFutures, authority.MAINNET_HTTP);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(authority.clientOptions('K', 'S'), 'baseURL'), false);

  setEnv({ AGROS_REAL_ORDER_ENV: 'MAINNET', BINANCE_BASE_URL: 'https://testnet.binancefuture.com' });
  authority = freshAuthority();
  endpoint = authority.resolve();
  assert.strictEqual(endpoint.testnet, true);
  assert.strictEqual(endpoint.environmentMatches, false);
  assert.strictEqual(authority.realTradingEndpointValid(endpoint), false);

  setEnv({ AGROS_REAL_ORDER_ENV: 'TESTNET', BINANCE_FUTURES_HTTP_BASE: 'https://testnet.binancefuture.com/' });
  authority = freshAuthority();
  endpoint = authority.resolve();
  assert.strictEqual(endpoint.testnet, true);
  assert.strictEqual(endpoint.environmentMatches, true);
  assert.strictEqual(authority.realTradingEndpointValid(endpoint), false, 'Testnet gerçek mainnet yetkisi aldı');

  setEnv({ AGROS_REAL_ORDER_ENV: 'MAINNET', BINANCE_FUTURES_HTTP_BASE: 'https://evil.example' });
  authority = freshAuthority();
  endpoint = authority.resolve();
  assert.strictEqual(endpoint.known, false);
  assert.strictEqual(authority.realTradingEndpointValid(endpoint), false);
})();

(function clientReceivesHttpFutures() {
  setEnv({
    AGROS_REAL_ORDER_ENV: 'MAINNET',
    BINANCE_BASE_URL: 'https://fapi.binance.com',
    BINANCE_API_KEY: 'KEY',
    BINANCE_API_SECRET: 'SECRET'
  });

  const originalLoad = Module._load;
  let captured = null;
  Module._load = function(request, parent, isMain) {
    if (request === 'binance-api-node') {
      return { default: options => { captured = options; return {}; } };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve('./1_hafiza.js')];
    delete require.cache[require.resolve('./86_st2_binance_endpoint_authority.js')];
    const h = require('./1_hafiza.js');
    assert.ok(captured, 'Binance istemci ayarları yakalanamadı');
    assert.strictEqual(captured.httpFutures, 'https://fapi.binance.com');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(captured, 'baseURL'), false, 'Desteklenmeyen baseURL istemciye gönderildi');
    assert.strictEqual(h.binanceEndpoint.label, 'MAINNET');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('./1_hafiza.js')];
  }
})();

(function sourceGuards() {
  const memory = fs.readFileSync('1_hafiza.js', 'utf8');
  const market = fs.readFileSync('3_piyasa.js', 'utf8');
  const bridge = fs.readFileSync('50_real_order_readiness_bridge.js', 'utf8');
  const execution = fs.readFileSync('85_st2_real_order_execution.js', 'utf8');
  assert.ok(memory.includes('clientOptions('));
  assert.ok(!/\bbaseURL\s*:/.test(memory));
  assert.ok(market.includes('Binance Futures ${endpoint.label}'));
  assert.ok(bridge.includes('realTradingEndpointValid(endpoint)'));
  assert.ok(execution.includes('BINANCE_ENDPOINT.httpFutures'));
})();

console.log('✅ v6.10.1 Binance Futures endpoint authority tests passed');
