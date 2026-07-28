'use strict';

/**
 * AGROS ST2 canonical historical training pool.
 * Tek kaynak: readiness, reconciliation ve Premier kapısı aynı listeyi kullanır.
 */
const VERSION = 'v6.3.7-CANONICAL-HISTORICAL-POOL';
const COINS = Object.freeze([
  'BTC','ETH','BNB','SOL','XRP','DOGE','ADA','LINK','LTC','AVAX',
  'DOT','BCH','TRX','ATOM','ETC','NEAR','APT','SUI','ARB','OP',
  'FIL','INJ','SEI','TON','UNI','AAVE','FET','WIF','HBAR'
]);
const SYMBOLS = Object.freeze(COINS.map(x => `${x}USDT`));

module.exports = { VERSION, COINS, SYMBOLS };
