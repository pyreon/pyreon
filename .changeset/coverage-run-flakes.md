---
'@pyreon/unistyle': patch
---

Skip the ReDoS growth-ratio spec under coverage instrumentation

The spec times the same attack at N and 4N and asserts the ratio stays
linear-ish. V8 coverage adds a per-basic-block cost plus GC pressure that is
NOT proportional to input size, so under `--coverage` the ratio describes the
instrumenter rather than the scan — it read 11.9x on main while green in the
Test cells and green locally under coverage in isolation.

It now skips when `scripts/check-coverage.ts` sets `PYREON_COVERAGE_RUN`, and
still gates on every PR through the ordinary Test cell.
