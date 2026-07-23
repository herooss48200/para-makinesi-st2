# v5.5.0 ST2 Renko Entry

- Derived in a separate ST2 tree from certified ST1 v5.4.2.
- Added ATR(14) Renko OHLC generation from closed 15m candles.
- Added Renko Bollinger and Renko SuperTrend decision path.
- Added LONG/SHORT Renko ambush state machine.
- First opposite-color brick confirms reversal but does not trigger an order.
- Live price must cross the buffered reference level.
- Price trigger and Renko SuperTrend approval are order-independent and remembered per ambush.
- Ambush lifetime is three subsequent closed Renko bricks; the third brick is evaluated before cancellation.
- Reused existing `proximityYuzdesi` and `motor.pusuSenaryosuTespit`; no new Bollinger tolerance was added.
- Added mandatory `entryStrategy: ST1 | ST2_RENKO` propagation.
- Did not change post-entry Trade Engine, sizing, stop, BE, exit, Premier, DNA, accounting or commission logic.
