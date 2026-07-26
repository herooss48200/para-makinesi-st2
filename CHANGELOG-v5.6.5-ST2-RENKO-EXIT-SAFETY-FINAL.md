# AGROS ST2 v5.6.5 — Renko Exit Safety Final

- Scientific-notation tick sizes such as `1e-7` now retain the correct decimal precision.
- Zero, negative, NaN and infinite stop candidates are rejected before state mutation.
- LONG stops can only improve upward; SHORT stops can only improve downward.
- Same-value/no-op stop updates no longer write state or produce repeated logs/Telegram messages.
- Renko Exit Evolution validates old, first-protection and candidate stops before takeover updates.
- Premier counters remain evidence-based; genuine zero-sample values are not fabricated.
