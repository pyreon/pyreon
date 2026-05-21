# @pyreon/runtime-server

## 0.24.0

### Patch Changes

- [#768](https://github.com/pyreon/pyreon/pull/768) [`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `captureContextStack()` now deduplicates: only the topmost frame per context-id is retained in the captured snapshot. Closes the residual snapshot-amplification leak that the `restoreContextStack` reference-identity fix (0.23.0) didn't reach.

  ## Background

  Heap snapshots from 0.21.x showed 1.22 MB / 321k-entry arrays retained by effect closures under deeply-nested reactive boundaries — the live context stack accumulating frames across reactive remounts. The 0.23.0 `restoreContextStack` fix (changing position-based truncation to reference-identity splice) cleaned the LIVE stack, dropping the headline metrics 7-16×.

  But the residual remained — heap snapshots still showed **20 arrays at 157 KB each (~40k entries)** retained by effect closures. Root cause: `captureContextStack()` was `[...getStack()]` — a verbatim copy of the live stack at the moment of capture. When that capture landed inside a nested `restoreContextStack` window (the live stack temporarily holds the same context-id pushed by multiple nested effects), the snapshot baked those duplicates in. Each effect's closure then retained them for its lifetime.

  ## The fix

  `captureContextStack()` now walks the stack top-to-bottom keeping only the topmost frame for each context-id. **Semantically equivalent to the verbatim copy** because `useContext()` walks the stack in reverse and stops at the first matching frame — any shadowed frame is unreachable by definition.

  ```ts
  // Before
  return [...getStack()]; // 40k entries under deep nesting

  // After
  // Walk top-to-bottom, keep topmost-per-id frames
  const seen = new Set<symbol>();
  const reversed: Map<symbol, unknown>[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    let unique = false;
    for (const id of frame.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        unique = true;
      }
    }
    if (unique) reversed.push(frame);
  }
  reversed.reverse();
  return reversed;
  // → ~N entries where N = distinct context ids in scope (typically 2-10)
  ```

  ## Safety: why this preserves all existing behavior

  The naïve "just dedup the array" version would have silently broken SSR. `@pyreon/runtime-server` was using `captureContextStack().length` as a stack-position marker for cleanup (4 call sites) — relying on `snapshot.length === live stack length`. Dedup makes the snapshot shorter, which would have caused SSR cleanup to pop fewer frames than it pushed.

  **Pre-requisite fix (also in this PR)**: introduce `getContextStackLength()` — a non-allocating helper that reads the LIVE stack length directly. Migrate the 4 SSR call sites to use it instead of `captureContextStack().length`. After this migration, dedup at capture time has zero observable effect on SSR length bookkeeping.

  `restoreContextStack` already removes snapshot frames by **reference identity** (not by position or count) — the cleanup logic works identically against a deduped snapshot.

  `@pyreon/runtime-dom`'s `mountReactive` uses the snapshot for restoration only, not for length. Safe to dedup.

  The reactivity layer's `setSnapshotCapture` DI hook (used by `_bind`, `renderEffect`, `effect`) passes the snapshot back unchanged into `restore` — no length dependency. Safe to dedup.

  ## Tests

  18 new specs in `context.test.ts`:

  - **Dedup behavior** (8 specs): empty stack → empty snapshot; single frame → identical; no duplicates → verbatim; duplicate ids collapse to topmost; deep duplicate-heavy stack collapses correctly; multi-key frames kept if any id is un-shadowed; multi-key frames dropped if all ids are shadowed; useContext returns same value pre/post dedup for arbitrary read patterns.
  - **restoreContextStack with deduped snapshots** (2 specs): restoration semantically equivalent; 40-duplicate stack only pushes/pops 1 frame post-dedup.
  - **getContextStackLength** (3 specs): returns LIVE stack length not snapshot length; zero on empty stack; matches array length through push/pop cycles.
  - **Leak audit regression locks** (2 specs):
    - 1000 snapshots of a 100-frame duplicate-heavy stack retain **1000 total frame references**, not 100,000.
    - 100 snapshots of a 500-frame mixed stack with 50 distinct ids retain **5000 frame references**, not 50,000.

  ## Bisect-verified

  - Revert `captureContextStack` to `[...getStack()]` → **6 dedup-behavior specs + 2 leak-audit specs fail**; 29 pre-existing specs still pass (semantic equivalence preserved).
  - Restored → 37/37 context tests, 523/523 `@pyreon/core`, 150/150 `@pyreon/runtime-server`, 681/681 `@pyreon/runtime-dom`, 521/521 `@pyreon/router` — total **1875 tests across affected packages**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants.

  ## Impact

  - **Per-snapshot retention drops from O(stack-depth) to O(distinct-ids-in-scope)** — typically 100× reduction on deep trees, the same shape as the bug-report's 800× extrapolation.
  - The leak-audit unit tests are permanent regression locks — re-introducing the bug shape fails CI deterministically (no heap snapshot needed).

  ## Honest scope note

  This PR closes the per-snapshot allocation amplification. The orthogonal "snapshots themselves accumulate in proportion to effect count" concern (raised in the analysis) is NOT addressed here — that's an inherent property of the effect-per-component architecture, not a leak. A possible future Map-interning pass could deduplicate identical snapshot ARRAYS via WeakMap, sharing one allocation across multiple effects whose contexts match. Filed as separate work if numbers warrant.

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Minor Changes

- [#745](https://github.com/pyreon/pyreon/pull/745) [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: close the three deferred SSR/ISR gaps from the deep-analysis pass

  Three independent fixes that close gaps explicitly deferred in earlier
  PRs ([#738](https://github.com/pyreon/pyreon/issues/738)/[#740](https://github.com/pyreon/pyreon/issues/740)/[#742](https://github.com/pyreon/pyreon/issues/742)/[#744](https://github.com/pyreon/pyreon/issues/744)) but called out as required by the goal-hook.

  ### 1. `renderToStream(root, { signal })` — AbortSignal threading

  `renderToStream` now accepts `{ signal?: AbortSignal }`. The internal
  controller forwards client-disconnect (`ReadableStream.cancel()`) AND
  upstream aborts to a shared signal; the drain loop races each pending
  Suspense batch against the abort-promise so the stream closes promptly
  when the consumer hangs up. Per-boundary resolvers check
  `ctx.signal.aborted` before enqueueing post-resolve HTML.

  Before: a client navigating mid-stream left in-flight Suspense work
  awaited server-side until its 30s timeout. Wasted CPU per dropped
  connection.

  After: cancellation propagates within ms; pending boundaries skip the
  swap. Tests (`tests/integration.test.ts`): upstream-abort skips
  post-resolve enqueue, pre-aborted signal still emits sync portion,
  `ReadableStream.cancel()` closes the stream within 100ms (well under
  the 200ms test boundary's pending work).

  ### 2. `ISRConfig.revalidateRequest` — auth-gated revalidation hook

  New optional `(req: Request) => Request | null`. Lets auth-gated
  `cacheKey` setups scope revalidation explicitly:

  - Return a custom `Request` (e.g. stripped cookies for anonymous
    revalidation) — used in place of the original.
  - Return `null` — SKIP revalidation entirely for this entry (stale
    stays stale until next live request).

  Closes the footgun where the default behaviour re-uses the original
  user's cookies for the background revalidation — if the session has
  expired since cache-write, the new render may misbehave or embed
  stale auth data. Tests: 2 specs covering null=skip and custom-request
  scrubbing cookies.

  ### 3. Cloudflare `_worker.js` runtime-contract gate

  New regression assertion in `adapters.test.ts` cloudflare suite: the
  emitted `_worker.js` MUST contain none of `node:` imports / `fs` /
  `path` / `__dirname` / `__filename` / `fileURLToPath` / `Buffer` /
  `process.env`. Locks the Web-standard runtime contract — any future
  template change that accidentally grows a Node API fails CI here
  instead of 500ing in production on Cloudflare Workers (which doesn't
  expose those APIs without the `nodejs_compat` flag).

  The `node:fs/promises` / `node:path` USE inside cloudflare.ts itself
  is build-time-only (runs in Node during `vite build`) and is
  unaffected — this check covers the EMITTED file.

  ### Net diff

  +220 / -10 lines (impl + 5 new tests + JSDoc + changeset). All
  existing suites pass unchanged: runtime-server 35+ tests, zero ISR
  15/15, adapters 37/37, typecheck + lint + build clean across both
  packages, gen-docs + check-doc-claims green.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

- [#757](https://github.com/pyreon/pyreon/pull/757) [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `renderToStream` and `createHandler` (stream mode) now accept a configurable per-boundary Suspense timeout: `suspenseTimeoutMs?: number`. Defaults to `30_000` ms (unchanged from prior hard-coded behavior), so unset is byte-identical. Pass a smaller number (e.g. `5_000`–`10_000`) for tight-SLA user-facing deploys where the fallback is preferable to a delayed render, or pass `Infinity` to disable the timeout entirely for renders that legitimately need long async work (exports, reports, scheduled jobs). Values ≤0 or `NaN` fall back to the default — invalid input from a config layer can't accidentally drop every boundary.

  This completes the streaming control surface alongside the AbortSignal wire (`signal?: AbortSignal`, shipped in [#745](https://github.com/pyreon/pyreon/issues/745) + [#749](https://github.com/pyreon/pyreon/issues/749)).

  **`@pyreon/runtime-server`**: `RenderToStreamOptions` gains `suspenseTimeoutMs?: number`. Threaded into the internal `StreamCtx` and consumed by `streamSuspenseBoundary`. The `Infinity` case skips the `Promise.race` entirely (no setTimeout, no clearTimeout) — only the AbortSignal can stop a boundary in that mode.

  **`@pyreon/server`**: `HandlerOptions` gains `suspenseTimeoutMs?: number`, forwarded through `renderStreamResponse` → `renderToStream` only when defined (so unconfigured deploys land on `renderToStream`'s defaults byte-identically).

  **Tests**: 4 new specs in `runtime-server/src/tests/ssr.test.ts` (`renderToStream — suspenseTimeoutMs config`) covering explicit short timeout, default preservation, invalid-value fallback, and `Infinity` opt-out. 1 new integration spec in `server/src/tests/server.test.ts` proving the handler's option threads end-to-end.

  **Bisect-verified**:

  - Revert the `ctx.suspenseTimeoutMs` read to the hard-coded `30_000` → "explicit short timeout drops post-resolve content" spec fails (100ms boundary completes against the still-30s timeout); restored → passes.
  - Revert the createHandler forward (drop `suspenseTimeoutMs` from `renderStreamResponse` call) → "stream mode forwards suspenseTimeoutMs" spec fails the same way; restored → passes.
  - Both restored: runtime-server **150/150** + server **168/168 × 5 stability runs**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants. `gen-docs --check` clean.

  Manifest + MCP `api-reference` + `llms-full.txt` updated to document the new option and the `signal` option (the latter shipped in [#749](https://github.com/pyreon/pyreon/issues/749) but the manifest entry hadn't been updated). The "30s timeout" foot-gun in `mistakes[]` now mentions the configurability and the `Infinity` opt-out.

### Patch Changes

- [#748](https://github.com/pyreon/pyreon/pull/748) [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(server, runtime-server): Class I orphaned timer in prerender + Suspense streaming (audit-leak-classes discoveries)

  Two real Class I instances surfaced by the new `audit-leak-classes`
  script's `promise-race-no-clear` detector — bugs the lint rule
  `pyreon/promise-race-needs-cleartimeout` would have caught at edit
  time but pre-dated the rule.

  ### `@pyreon/server` `ssg.ts:prerender` — orphaned 30s setTimeout

  `renderPage`'s `Promise.race([handler(req), setTimeout-reject])`
  left the timer pinned for 30s when `handler` won. Same shape as
  [#734](https://github.com/pyreon/pyreon/issues/734)'s `@pyreon/zero` `isr.ts revalidate()` fix. Under high-RPS
  prerender batches (e.g. a large SSG build), hundreds of timer
  closures pile up before they self-clear.

  Fix: capture the timer id outside `Promise.race`, `clearTimeout`
  in `finally`.

  ### `@pyreon/runtime-server` `streamSuspense` — orphaned 30s setTimeout

  The Suspense streaming boundary races children against a 30s
  timeout. The setTimeout _resolves_ (rather than rejects) with
  `'timeout'` — but the orphaned-timer shape is identical: on
  success the timer stays pinned for 30s, holding the resolve
  callback + closure. Every Suspense boundary in a long-running
  SSR server accumulates one pending timer per rendered request
  until it fires.

  Fix: same `let timeoutId` + `try { … } finally { clearTimeout }`
  pattern.

  ### Validation

  - `@pyreon/server` 166/166 tests pass
  - `@pyreon/runtime-server` 143/143 tests pass
  - `@pyreon/test-utils` 90/90 tests pass (+15 new for the audit script)
  - Lint + typecheck clean
  - No public-API surface change

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- [#624](https://github.com/pyreon/pyreon/pull/624) [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/runtime-server` onto the manifest-driven docs pipeline.

  `@pyreon/runtime-server` is the SSR/SSG renderer (`renderToString` / `renderToStream` / `runWithRequestContext` / `configureStoreIsolation` / `decodeKeyFromMarker`) — a real server API surface AI agents query — but it had NO `src/manifest.ts`, no api-reference markers, and was entirely absent from `llms.txt` / `llms-full.txt` / MCP `api-reference.ts`. `get_api(runtime-server, …)` 404'd for the whole surface. PR B of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction, [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler).

  **Added** `packages/core/runtime-server/src/manifest.ts` via `defineManifest()` — all 5 public exports as `api[]` entries with accurate signatures + dense `summary` + the real SSR foot-guns in `mistakes[]`: SSR is one-shot (no server reactivity; signals snapshot at render time), Suspense streams out-of-order with a 30s-timeout-keeps-fallback contract, `runWithRequestContext` must wrap the whole `prefetch + render` sequence or loader data is lost, `configureStoreIsolation` MUST be called once at startup or concurrent requests share one global store registry (cross-user SSR state bleed), `<head>` flushes before Suspense resolves. 3 package gotchas (no server reactivity / usually consumed via `@pyreon/server` / the server `typeof process` dev-gate convention).

  **Wiring:** `@pyreon/manifest` added as a `workspace:*` devDependency (the `@pyreon/lint` / `@pyreon/compiler` convention — `manifest.ts` is gen-docs-only, tree-shaken from published `lib/`). Surgical 3-line bun.lock add; `bun install --frozen-lockfile` verified (unrelated fresh-worktree version-field churn reverted to base). api-reference marker pair added between the `@pyreon/runtime-dom` and `@pyreon/store` regions; `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/runtime-server` section, and the 5-entry MCP region; hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (runtime-server + mcp); runtime-server 143 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (runtime-server enters at port-grade density and is intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- [#314](https://github.com/pyreon/pyreon/pull/314) [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Close the two perf-harness instrumentation blind spots. Adds 7 dev-mode SSR counters (`runtime-server.render`, `.stream`, `.component`, `.escape`, `.suspense.boundary`, `.suspense.fallback`, `.for.keyMarker`) to `@pyreon/runtime-server` and the `runtime.tpl` counter (cloneNode fast-path invocation count) to `@pyreon/runtime-dom`. All gated on the appropriate dev check so zero production cost — measured overhead on a 1k-row SSR render is ~5% in dev with a sink installed, within noise without. The SSR emit contract is verified by 10 probe tests covering shape (exact counts), scaling (1k and 10k rows, no quadratic emits), escape density, and server-side runtime gating. The `runtime.tpl` counter is verified by 2 probe tests plus the existing Vite tree-shake regression guard.

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-server): render `innerHTML` / `dangerouslySetInnerHTML` as inner content, not as attributes

  `innerHTML` was emitted as a literal HTML attribute on the open tag
  (`<span innerHTML="&lt;svg&gt;…">`) instead of as the element's inner
  content. Wasted bytes, hydration mismatch, and — combined with the
  client-side `innerHTML` bug in the same PR — the literal closure text
  was visible on-screen before hydration replaced it with the real SVG.

  Fix:

  - `renderPropSkipped` now skips `innerHTML` and `dangerouslySetInnerHTML`
    so neither shows up in the open-tag attribute list.
  - `streamElementNode` (streaming) and `renderElement` (non-streaming)
    both write them as inner content — unwrapping function-typed values
    emitted by the JSX compiler for signal-derived expressions.

  5 new regression tests (`renderToString — innerHTML / dangerouslySetInnerHTML inner-content rendering`).

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7

## 0.5.6

### Patch Changes

- feat(dx): comprehensive `__DEV__` warnings across core and runtime-dom

  feat(style): auto-append `px` to numeric style values (e.g. `{ height: 100 }` → `"100px"`), with shared `CSS_UNITLESS` set for hydration consistency

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1

## 0.3.0

### Minor Changes

- ### Performance

  - **2x faster signal creation** — removed `Object.defineProperty` that forced V8 dictionary mode
  - **Event delegation** — `el.__ev_click` instead of `addEventListener` for compiled templates
  - **`_bindText`** — direct signal→TextNode subscription with zero effect overhead
  - **`_bindDirect`** — single-signal attribute bindings bypass effect tracking entirely
  - **`signal.direct()`** — flat-array updater registration for compiler-emitted DOM bindings
  - **Batch Set pooling** — snapshot-free subscriber notification eliminates array allocations
  - **`createSelector` snapshot-free** — O(1) selection without copying subscriber maps
  - **`renderEffect` fast path** — lighter than full `effect()` for DOM bindings
  - **SSR `renderToString` micro-optimizations** — sequential loops, `for...in`, `escapeHtml` fast path
  - **Hydration optimizations** — reduced overhead during island hydration
  - **Nested `_tpl` support** — compiler emits nested `cloneNode(true)` templates

  ### Features

  - **True React compatibility** — `useState`, `useEffect`, `useMemo` with re-render model matching React semantics
  - **True Preact compatibility** — hooks with re-render model matching Preact semantics
  - **True Vue compatibility** — `ref`, `reactive`, `watch`, `computed` with re-render model matching Vue semantics
  - **True SolidJS compatibility** — signals with re-render model matching Solid semantics, children helper fixes

  ### Benchmark Results (Chromium)

  Pyreon (compiled) is fastest framework on 6 of 7 tests:

  - Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
  - Replace all rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
  - Partial update: 5ms (1.00x) vs Solid 6ms, Vue 7ms, React 6ms
  - Select row: 5ms (1.00x) — tied with all signal frameworks
  - Create 10,000 rows: 103ms (1.00x) vs Solid 122ms, Vue 136ms, React 540ms

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.0
  - @pyreon/core@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1
  - @pyreon/core@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
