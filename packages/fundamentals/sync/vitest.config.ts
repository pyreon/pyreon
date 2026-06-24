import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
  // Run this package's test FILES serially, not in parallel.
  //
  // `@pyreon/sync` ships several REAL-resource integration files that each
  // stand up a `ws` relay server + drive live loopback WebSocket round-trips
  // (`ws-relay`, `ws-protocol`, `awareness`). With file parallelism ON, two or
  // three of these run at the SAME time, and on a 2-4 core CI runner already
  // oversubscribed by the parallel test cell (`bun run --filter … test` runs
  // packages concurrently), the competing servers + clients starve each other's
  // event loop — a loopback frame that takes <1ms locally arrives tens of
  // seconds late, blowing past even the 30s + 2-retry budget the specs already
  // carry (the recurring "flaky, re-runnable" red). No timeout can bound an
  // unbounded-under-contention delay; the fix is to remove the contention.
  // Serializing files guarantees only ONE server-spinning file runs at a time
  // AND drops this package to a single active worker (less cross-package
  // starvation too). The whole suite is ~140 fast tests, so serial wall-clock
  // is only a few seconds slower — a reliability win that costs almost nothing.
  // The per-test tick-counted deadlines stay as the belt-and-braces backstop.
  // See `src/tests/ws-relay.test.ts` header for the flake history.
  overrides: { test: { fileParallelism: false } },
})
