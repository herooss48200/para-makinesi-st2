# AGROS v4.4.0 – Adaptive League Recovery

- Existing learned DNA history is re-analyzed when league state is missing or empty.
- League transfer interval reduced to 5 closures for faster market adaptation.
- Dynamic worst 10 is selected from DNA with at least 5 recent outcomes, negative recent expectancy and PF below 1.
- Worst-10 signals run as shadow-only virtual positions: learning/replay/exit analysis continues, but main virtual cash, commission and TP/SL counters are not changed.
- A recovered DNA leaves the blocked group automatically when its rolling recent-5 performance improves or another DNA becomes worse.
- Premier and Championship remain the only real-order eligible leagues; real authorization remains fail-closed.
- Fixed duplicate declaration in league diagnostics.
- Adaptive Telegram report now shows recovery and worst-10 counts instead of claiming a fresh-start ledger.
