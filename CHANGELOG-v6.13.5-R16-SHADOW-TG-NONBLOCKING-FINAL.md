# AGROS ST2 v6.13.5-R16 — SHADOW TG NONBLOCKING FINAL

- Root cause: `izSurmeyiGuncelle()` processed Renko Entry Confirmation shadow lifecycle Telegram messages with `await` before the zero-active-position fast return and before the Renko scan.
- Impact: when Telegram transport was slow/unavailable, shadow-only messages could delay the first Renko scan for many timeout windows even though startup and market readiness were healthy.
- Fix: shadow-only Renko Entry Confirmation Telegram delivery is now scheduled in the background and never blocks position protection or the Renko scan path.
- The same nonblocking rule applies to shadow lifecycle messages emitted while active positions are protected.
- No change to Entry Evolution, DIRECT/CONFIRMED selection math, real-order authority, stop/profit-floor/exit math, or shadow evidence generation.
- Regression test `test_v6152_shadow_telegram_nonblocking_protection.js` proves 200 never-resolving Telegram sends do not block the caller and source contracts contain no awaited shadow Telegram in the critical protection path.
