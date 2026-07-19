# AGROS v4.5.10 — League Match Consistency

- UNRANKED DNA records now report `matchType: NONE`; they can no longer appear as `UNRANKED | EXACT`.
- A DNA that leaves the current ranked profile set is logged as `PROFILE_SET_EXIT: ... → UNRANKED`, not falsely as Historical.
- No entry, exit, league qualification, learning, accounting, or runtime-index rule changed.
- Existing learning history and the compact exit runtime index are preserved.
