# AGROS v3.6.1 — Exit Replay Engine Foundation

- Added `22_exit_replay_engine.js`.
- Replays every closed trade against Fixed TP, MFE Capture benchmark, and recorded profit-floor scenarios.
- Writes JSONL, CSV, and aggregate DNA/algorithm model outputs.
- Adds a Telegram close summary without changing Trade Engine decisions.
- Persists `exitReplayOzet` in `sanal-state.json`.
- Adds explicit data-honesty labels for executable scenarios versus oracle benchmarks.
- Updates package/version metadata and syntax-check coverage.
