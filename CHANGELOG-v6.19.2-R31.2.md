# AGROS ST2 v6.19.2-R31.2

- Onur Final Direction Guard is now symmetric.
- Strong BTC+ETH UP with both EMA50/EMA200 gaps >= 1.00% => SHORT hard veto.
- Strong BTC+ETH DOWN with both gaps >= 1.00% => LONG hard veto.
- Sideways/mixed direction does not veto.
- Missing BTC/ETH trend data remains fail-open.
- Both vetoes execute before SUBMITTED / Binance MARKET order.
- Panel exposes SHORT veto/keep and LONG veto/keep separately.
