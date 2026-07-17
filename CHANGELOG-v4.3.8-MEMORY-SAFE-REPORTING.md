# v4.3.8 Memory-Safe Reporting

- DNA exit shadow validation JSONL is now aggregated in fixed-size chunks instead of `readFileSync().split().map(JSON.parse)`.
- Adaptive League transfer history now reads only a bounded tail from disk.
- Oversized `dna-story.json` is archived without deletion and replaced by a compact live story index.
- Report-chain RAM trace logs were added before and after each heavy report module.
- Trade engine, entry rules, active exits, accounting, and persisted position data are unchanged.
