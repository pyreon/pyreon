---
'@pyreon/runtime-server': minor
'@pyreon/server': minor
---

`renderToStream` and `createHandler` (stream mode) now accept a configurable per-boundary Suspense timeout: `suspenseTimeoutMs?: number`. Defaults to `30_000` ms (unchanged from prior hard-coded behavior), so unset is byte-identical. Pass a smaller number (e.g. `5_000`–`10_000`) for tight-SLA user-facing deploys where the fallback is preferable to a delayed render, or pass `Infinity` to disable the timeout entirely for renders that legitimately need long async work (exports, reports, scheduled jobs). Values ≤0 or `NaN` fall back to the default — invalid input from a config layer can't accidentally drop every boundary.

This completes the streaming control surface alongside the AbortSignal wire (`signal?: AbortSignal`, shipped in #745 + #749).

**`@pyreon/runtime-server`**: `RenderToStreamOptions` gains `suspenseTimeoutMs?: number`. Threaded into the internal `StreamCtx` and consumed by `streamSuspenseBoundary`. The `Infinity` case skips the `Promise.race` entirely (no setTimeout, no clearTimeout) — only the AbortSignal can stop a boundary in that mode.

**`@pyreon/server`**: `HandlerOptions` gains `suspenseTimeoutMs?: number`, forwarded through `renderStreamResponse` → `renderToStream` only when defined (so unconfigured deploys land on `renderToStream`'s defaults byte-identically).

**Tests**: 4 new specs in `runtime-server/src/tests/ssr.test.ts` (`renderToStream — suspenseTimeoutMs config`) covering explicit short timeout, default preservation, invalid-value fallback, and `Infinity` opt-out. 1 new integration spec in `server/src/tests/server.test.ts` proving the handler's option threads end-to-end.

**Bisect-verified**:
- Revert the `ctx.suspenseTimeoutMs` read to the hard-coded `30_000` → "explicit short timeout drops post-resolve content" spec fails (100ms boundary completes against the still-30s timeout); restored → passes.
- Revert the createHandler forward (drop `suspenseTimeoutMs` from `renderStreamResponse` call) → "stream mode forwards suspenseTimeoutMs" spec fails the same way; restored → passes.
- Both restored: runtime-server **150/150** + server **168/168 × 5 stability runs**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants. `gen-docs --check` clean.

Manifest + MCP `api-reference` + `llms-full.txt` updated to document the new option and the `signal` option (the latter shipped in #749 but the manifest entry hadn't been updated). The "30s timeout" foot-gun in `mistakes[]` now mentions the configurability and the `Infinity` opt-out.
