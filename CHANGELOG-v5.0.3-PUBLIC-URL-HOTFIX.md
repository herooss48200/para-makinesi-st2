# AGROS v5.0.3 — PUBLIC URL HOTFIX

- Fixed the Futures ticker endpoint being passed as the literal string `${MARKET_DATA_BASE_URL}/...`.
- Added one validated URL builder for Binance public endpoints.
- Kline and ticker endpoints now use the same absolute URL construction path.
- Added a regression test that rejects uninterpolated template expressions and validates ticker/klines URLs.
- Trade Engine, DNA, League, Exit and persistent `data/` are unchanged.
