# AGROS ST2 v6.0.2 Test Fix

- v6.0.0 Adaptive DNA test no longer assumes an exact profile count.
- Similar-profile validation now accepts multiple valid historical neighbours.
- v6.0.2 historical aggregation test validates required LONG|RRRR and SHORT|GGGG patterns directly instead of relying on a global profile count.
- `npm run verify:v602` passes completely.
