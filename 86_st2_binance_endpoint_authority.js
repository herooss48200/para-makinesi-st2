'use strict';

/**
 * AGROS ST2 v6.10.1 — BINANCE FUTURES ENDPOINT AUTHORITY
 *
 * binance-api-node v0.13.x Futures endpoint anahtarı `httpFutures`'tır.
 * Eski `baseURL` alanı istemci tarafından güvenilir şekilde kullanılmaz.
 * Bu modül istemci, gerçek emir kapısı, process lock ve logların aynı endpoint
 * gerçeğini kullanmasını sağlar.
 */

const MAINNET_HTTP = 'https://fapi.binance.com';
const TESTNET_HTTP = 'https://testnet.binancefuture.com';

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function configuredRaw() {
  return String(
    process.env.BINANCE_FUTURES_HTTP_BASE ||
    process.env.BINANCE_FUTURES_BASE_URL ||
    process.env.BINANCE_BASE_URL ||
    ''
  ).trim();
}

function resolve() {
  const requestedEnvironment = String(process.env.AGROS_REAL_ORDER_ENV || '').trim().toUpperCase();
  const raw = configuredRaw();
  const explicit = Boolean(raw);
  const fallback = requestedEnvironment === 'MAINNET' ? MAINNET_HTTP : TESTNET_HTTP;
  const httpFutures = normalizeUrl(raw || fallback);
  const mainnet = httpFutures === MAINNET_HTTP;
  const testnet = httpFutures === TESTNET_HTTP;
  const known = mainnet || testnet;
  const inferredEnvironment = mainnet ? 'MAINNET' : (testnet ? 'TESTNET' : 'UNKNOWN');
  const environmentMatches = requestedEnvironment
    ? requestedEnvironment === inferredEnvironment
    : known;

  return Object.freeze({
    requestedEnvironment,
    inferredEnvironment,
    httpFutures,
    explicit,
    mainnet,
    testnet,
    known,
    environmentMatches,
    label: mainnet ? 'MAINNET' : (testnet ? 'TESTNET' : 'UNKNOWN')
  });
}

function clientOptions(apiKey, apiSecret) {
  const endpoint = resolve();
  return {
    apiKey,
    apiSecret,
    // binance-api-node 0.13.x için doğru USDⓈ-M Futures endpoint anahtarı.
    httpFutures: endpoint.httpFutures
  };
}

function realTradingEndpointValid(endpoint = resolve()) {
  // Gerçek emir açmak için endpoint açıkça tanımlanmış, tam mainnet URL'si
  // olmalı ve AGROS_REAL_ORDER_ENV=MAINNET ile birebir uyuşmalıdır.
  return endpoint.explicit && endpoint.mainnet && endpoint.requestedEnvironment === 'MAINNET' && endpoint.environmentMatches;
}

module.exports = {
  VERSION: 'v6.10.1-BINANCE-FUTURES-ENDPOINT-AUTHORITY',
  MAINNET_HTTP,
  TESTNET_HTTP,
  normalizeUrl,
  configuredRaw,
  resolve,
  clientOptions,
  realTradingEndpointValid
};
