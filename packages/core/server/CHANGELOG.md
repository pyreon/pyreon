# @pyreon/server

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/head@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/router@0.24.4
  - @pyreon/runtime-dom@0.24.4
  - @pyreon/runtime-server@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/head@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/router@0.24.3
  - @pyreon/runtime-dom@0.24.3
  - @pyreon/runtime-server@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/head@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/router@0.24.2
  - @pyreon/runtime-dom@0.24.2
  - @pyreon/runtime-server@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/head@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/router@0.24.1
  - @pyreon/runtime-dom@0.24.1
  - @pyreon/runtime-server@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-server@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/head@0.24.0
  - @pyreon/router@0.24.0

## 0.23.0

### Minor Changes

- [#738](https://github.com/pyreon/pyreon/pull/738) [`e1939bd`](https://github.com/pyreon/pyreon/commit/e1939bd49d185c6522b61f06c5a27cf2b91392a4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(server): islands prop codec — Date / Map / Set / RegExp / BigInt now roundtrip losslessly; class instances fail loud

  Closes the silent data-loss footgun in SSR → client island-prop transit. The
  naïve `JSON.stringify` path through `<pyreon-island data-props="...">`
  silently:

  - coerced `Date` → ISO string (client received `string`, not `Date`)
  - collapsed `Map` / `Set` / `RegExp` → `{}` (lost entirely)
  - threw on `BigInt` → empty-props fallback with a generic dev message
  - dropped class instances to `{}` with NO warning (bug surfaced as a
    runtime crash on the hydrated component)

  New: `packages/core/server/src/island-codec.ts` — `encodeIslandProps` /
  `decodeIslandProps` / `IslandPropEncodeError`. Tags non-JSON-native
  types with an internal `__pyreon_t` marker the inverse decoder unwraps
  on hydrate. Plain objects without markers round-trip byte-identically
  (no behaviour change for existing JSON-shaped props). Objects whose
  OWN key is literally `__pyreon_t` get an `'e'`-escape wrap so users
  who happen to use that key string keep working.

  **Fail-loud where it was silent:** class instances, circular
  references, and >100-deep nesting now emit `IslandPropEncodeError` with
  a `$.foo.bar` prop-path + offender name. The caller (`serializeIslandProps`)
  catches the error and falls back to empty props as before, BUT the
  dev-mode `console.error` now NAMES the offender (`User`, `$.user`, etc.)
  instead of the prior generic "BigInt or circular reference" message.

  Forward-compatible decoder: unknown tag values pass through verbatim
  so an older `client.ts` doesn't crash on a future-encoded type.

  **Behaviour change for consumers**: code that received `Date` props as
  ISO strings and revived with `new Date(props.someDate)` still works
  (Date constructor accepts Date). Code doing `typeof props.someDate ===
'string'` on a Date-typed prop needs updating to `props.someDate
instanceof Date`. This is documented in the JSDoc on
  `serializeIslandProps` and CLAUDE.md.

  Tests: 21 codec roundtrip + escape + fail-loud + forward-compat specs
  (`tests/island-codec.test.ts`), plus 3 contract-update tests in
  `tests/server.test.ts`. Full server suite: 164 pass; typecheck + lint
  clean; build clean.

- [#740](https://github.com/pyreon/pyreon/pull/740) [`0036dfc`](https://github.com/pyreon/pyreon/commit/0036dfcb58a0ad33bce8118a3d927f1c09c63b27) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(server): `hydrate: 'interaction'` islands now replay form submits — not just clicks

  Closes the second click-replay gap my deep analysis flagged. The
  `interaction` strategy's pre-hydrate handler previously listened on
  `focus` / `click` / `pointerenter` / `touchstart` and only **replayed
  `click`** events. Submitting a form inside an interaction-strategy
  island fell through:

  - `submit` wasn't in the default event list → no preventDefault →
    **browser did a full-page POST/GET BEFORE the island ever hydrated**
  - Even with a custom `interaction(submit)` config, the post-hydrate
    replay only knew how to dispatch `MouseEvent('click')`, so the live
    submit handler never fired

  Now: `'submit'` is in `DEFAULT_INTERACTION_EVENTS`. When pre-hydrate,
  the captured handler calls `preventDefault()` + `stopImmediatePropagation()`
  on the submit event (blocking the browser's full-page nav) and stores
  a `{ type: 'submit', path }` capture. Post-hydrate, the live form is
  resolved via the same `data-testid` / tag+child-index path used for
  clicks, and a synthetic `SubmitEvent('submit', { bubbles: true,
cancelable: true })` is re-dispatched on it — so the live `onSubmit`
  reads current `FormData` with the user's actual input values.

  Discriminated union `CapturedInteraction = { type: 'click'; path } |
{ type: 'submit'; path }` keeps the replay-target wiring type-narrow.
  `SubmitEvent` is the standard global in real browsers and modern
  happy-dom; falls back to a plain `Event('submit')` if the constructor
  isn't available (older runtimes).

  Test: `interaction: form submit hydrates + prevents browser nav +
replays submit on live form` in `tests/client.test.ts`. Full server
  suite: 143 pass (was 142). Typecheck + lint clean.

  **Compat note**: user code that explicitly opts out via `interaction(click)`
  or any custom list NOT including `submit` keeps its prior behaviour
  (no submit interception). The change is additive on the default-events
  list only.

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

- [#749](https://github.com/pyreon/pyreon/pull/749) [`97b0e19`](https://github.com/pyreon/pyreon/commit/97b0e19533056e9cb3d9997401effc79b0f6760b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createHandler` (stream mode) now threads `req.signal` through to `renderToStream({ signal })` so an upstream `Request` abort (client disconnect, request timeout, parent AbortController) propagates end-to-end into the streaming render. Pending Suspense boundaries are cancelled, their post-resolve enqueues are skipped, and the response stream closes promptly — no wasted work after the consumer hangs up.

  `renderToStream` already accepted `{ signal }` (shipped earlier), but `createHandler` was the missing one-line wire to make the AbortSignal story actually reach SSR users.

  Bisect-verified: drop the signal forward → the new `threads request.signal through to renderToStream` test fails with both `'loaded-too-late'` and `__NS("pyreon-s-0",…)` present in the response HTML; restored → 1 pass × 5 stability runs, 167/167 server tests pass.

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

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a), [`1d825c2`](https://github.com/pyreon/pyreon/commit/1d825c2374a39833881c490887602354a7d590af), [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf), [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-server@0.23.0
  - @pyreon/head@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/router@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies [[`33ce726`](https://github.com/pyreon/pyreon/commit/33ce726710d776abc563f7a0fed6a8ac93c9213d)]:
  - @pyreon/head@0.22.0
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/router@0.22.0
  - @pyreon/runtime-dom@0.22.0
  - @pyreon/runtime-server@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`2b39231`](https://github.com/pyreon/pyreon/commit/2b3923112e6b06b5fd2cd3a3daa1425e7a6f755c)]:
  - @pyreon/head@0.21.0
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/router@0.21.0
  - @pyreon/runtime-dom@0.21.0
  - @pyreon/runtime-server@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/head@0.20.0
  - @pyreon/router@0.20.0
  - @pyreon/runtime-server@0.20.0

## 0.19.0

### Patch Changes

- [#612](https://github.com/pyreon/pyreon/pull/612) [`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security / memory-leak / correctness hardening sweep across core, fundamentals, and zero. 12 source-grounded defects fixed; every fix has a bisect-verified regression test (revert → fail → restore → pass).

  **Security (prototype pollution / XSS / DoS)**

  - `@pyreon/reactivity` `reconcile()` + `createStore` set trap — a documented "apply an untrusted API response into a store" path (`reconcile(JSON.parse(body), store)`) had no `__proto__`/`constructor`/`prototype` guard. Added on both the write and stale-key-removal passes + defense-in-depth in the proxy set trap.
  - `@pyreon/i18n` `addMessages` — `nestFlatKeys` (dotted-key expansion) ran BEFORE `deepMerge`, so deepMerge's own pollution filter never saw the dotted form; `__proto__.x` walked into `Object.prototype` and wrote onto it. Message JSON is routinely CDN/community-sourced. Guarded.
  - `@pyreon/document` HTML renderer — `language` was interpolated raw into `<html lang="…">` and `styleStr` emitted string values raw into `style="…"`; a CMS/author-supplied value containing `"><script>` broke out → stored XSS. `lang` is now charset-restricted + escaped; style values route through the renderer's existing `sanitizeCss`.
  - `@pyreon/zero` rate-limit — `MAX_STORE_SIZE` was a declared-but-unenforced constant; the cleanup only evicted EXPIRED entries, so a flood of unique keys within one window (spoofable `X-Forwarded-For`) grew the Map unbounded — an unauthenticated memory-exhaustion DoS. Added a hard cap with oldest-first eviction (mirrors the ISR cache's proven `set()`).
  - `@pyreon/zero` ISR — the cache stored ANY response and replayed it as a 200 for the whole revalidate window: a transient 5xx/3xx became a self-inflicted outage, and a `Set-Cookie` response was replayed cross-user. Now only 2xx, cookie-free responses are cached; everything else passes through verbatim with its original status (`x-isr-cache: BYPASS`).
  - `@pyreon/server` `prerender` + `@pyreon/zero` SSG plugin (3 sites) — the path-traversal guard used a bare `startsWith(resolve(outDir))` (string-prefix, not path containment): a `getStaticPaths` slug resolving to the SIBLING `dist-evil/` passed and wrote outside the output root. Now separator-terminated containment (`isInsideDist`).
  - `@pyreon/zero` API-route matcher — dangerous param names from the route pattern guarded (defense-in-depth; consistent with the reconcile / i18n guards).

  **Memory leaks**

  - `@pyreon/reactivity` `signal._d` — direct-updater disposal nulled an array slot but never compacted, so a long-lived signal (theme/locale/auth, or signals read in `<For>` rows) bound by churning components accumulated one permanent dead slot per ever-mounted binding — an app-lifetime leak that ALSO degraded the signal-write hot path (`notifyDirect` iterated O(total-ever), not O(live)). Switched to a `Set` (same as `_s`): O(1) disposal, O(live) iteration, bounded growth. Proven structurally — `_d.size` stays 0 after 10 000 register/dispose cycles.
  - `@pyreon/dnd` `useSortable` — `itemRef` pushed every pdnd registration onto a shared array and the unmount (`ref(null)`) branch was a no-op, so a churning `<For>` sortable (todo list / kanban — the documented usage) leaked every removed item's draggable/dropTarget registration until the whole sortable unmounted. Now per-key disposal on unmount and re-register.
  - `@pyreon/zero` ISR — a hung revalidation handler pinned its key in the in-flight set forever (`finally` never ran), so the entry could never recover from stale. Background revalidation is now timeout-bounded (`ISRConfig.revalidateTimeoutMs`, default 30 s).

  **Correctness / silent-failure**

  - `@pyreon/router` `stringifyLoaderData` — the cycle detector used an all-seen `WeakSet` that was never pruned, so a shared (DAG) reference — extremely common, e.g. `{ author: user, lastEditor: user }` from an ORM — falsely threw "circular reference" and 500'd the SSR response. Replaced with true ancestor-path detection (the original code's own comment anticipated exactly this remedy). **Behaviour change (bug fix, strictly more permissive):** payloads that previously 500'd now serialize; real cycles still throw.
  - `@pyreon/server` `processTemplate` — used `String.prototype.replace` with string replacements, so rendered HTML containing literal `$&` / `$$` / `` $` `` / `$'` (prices, code, math) was corrupted by regex-pattern substitution. Switched to function replacements.
  - `@pyreon/i18n` `interpolate` — a serialization failure (circular value, throwing `toString`) was swallowed silently, rendering `{{key}}` to end users with no signal. Now dev-warns (fallback behaviour unchanged).
  - `@pyreon/query` `useSSE` — the reactive effect unconditionally reset `intentionalClose = false`, so an explicit `close()` was silently overridden by any later reactive `url`/`enabled` change. Now respects `intentionalClose` (mirrors `useSubscription`); `reconnect()` is the explicit resume.

  **Disclosures (honest scope)**

  - **An attempted SWR-swallow fix (surface the empty `.catch` via `__DEV__` warn + `_onError`) was REVERTED from this PR.** Probing empirically proved `revalidateSwrLoaders` is invoked **0 times** even by the canonical `staleWhileRevalidate` nav pattern: `resolveRoute` returns fresh `RouteRecord` objects per resolution, so `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate is never true across navigations — the SWR branch is **dead code**, and the existing "revalidates in background" test's count actually comes from the blocking path running twice. Adding error-surfacing to provably-unreachable code is not hardening (and it dropped router coverage). **The real bug — `staleWhileRevalidate` is effectively non-functional for the nav-away/back case (record-identity-keyed gate)** — is a distinct, significant finding whose correct fix (key the gate by a stable path/loaderKey) is a non-trivial router behaviour change deserving its own focused, aligned PR. Documented in `router/src/tests/loader.test.ts` as a flagged follow-up; deliberately not bundled here (scope/risk).
  - One audit finding (`decodeKeyFromMarker`) was investigated and **dropped as a false positive** — `%2D` never appears in `encodeURIComponent` output, so the manual substitution is uniquely reversible.
  - Z5 (API-route param guard) is defense-in-depth: a string param value assigned to `__proto__` is a silent JS no-op (not exploitable); the guard prevents the real own-prop shadow for `constructor`/`prototype` and matches the repo-wide convention.

  Validation: lint 0 errors; typecheck clean (8 touched packages); gen-docs in sync; audit-types `--all --strict` 0 HIGH; bundle-budgets 54/54 within budget. Per-package suites all green (reactivity 294, router 520, server 78, i18n 155, document 269, dnd 111, query 151, zero 884).

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51), [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a), [`7150368`](https://github.com/pyreon/pyreon/commit/7150368f85daa783e55f05541d0c45356c13b00d), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`2ee82eb`](https://github.com/pyreon/pyreon/commit/2ee82eb340c515c16aaa7a652ffc5b0c97b59ed6), [`4f410b6`](https://github.com/pyreon/pyreon/commit/4f410b6403ce1c033f049aa6cd2700f64193b2d1), [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/router@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/head@0.19.0
  - @pyreon/runtime-server@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/head@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/router@0.18.0
  - @pyreon/runtime-server@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/head@0.17.0
  - @pyreon/router@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/runtime-server@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`321bac0`](https://github.com/pyreon/pyreon/commit/321bac062b68cabf66357f0362385384a96b5692), [`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02)]:
  - @pyreon/core@0.16.0
  - @pyreon/router@0.16.0
  - @pyreon/head@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0
  - @pyreon/runtime-server@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/runtime-server@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/head@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/router@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0), [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/router@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/head@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0
  - @pyreon/runtime-server@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/router@0.12.15
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/runtime-server@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/head@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#253](https://github.com/pyreon/pyreon/pull/253) [`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Storage / query / core-server anti-pattern cleanup + `no-window-in-ssr`
  typeof-guard-function recognition

  `@pyreon/storage` (10 errors → 0):

  - `indexed-db.ts`: added `typeof indexedDB === 'undefined'` early-return at
    `openDB` entry. SSR callers receive a rejected promise with a clear
    `[Pyreon] indexedDB is not available` error instead of crashing.

  `@pyreon/query` (5 errors → 0):

  - `use-subscription.ts`: added `typeof WebSocket === 'undefined'`
    early-return guards at the entry of `connect()`, `send()`, and `close()`.
  - `query-client.ts`: error prefix `[@pyreon/query]` → `[Pyreon]`.

  `@pyreon/server` / `@pyreon/core-server` (5 errors → 0):

  - `client.ts`: `typeof document === 'undefined' → throw` early-return on
    `startClient` entry. `hydrateIslands` and `scheduleHydration` /
    `observeVisibility` typeof guards.
  - `client.ts` / `html.ts`: error prefixes normalised to `[Pyreon]`.

  `@pyreon/lint` — `no-window-in-ssr` typeof-guard functions:

  - A function whose body is `return <typeof check>` (or AND-chain of typeof
    checks) now counts as a typeof guard at its call sites — e.g.
    `function isBrowser() { return typeof window !== 'undefined' }` makes
    `if (!isBrowser()) return` an early-return guard. Both
    `function decl` and `const fn = () => …` (arrow + function-expression)
    forms are recognised.
  - Conventional names `isBrowser` / `isClient` / `isServer` / `isSSR` are
    pre-seeded so cross-module imports (`import { isBrowser } from './utils'`)
    work without follow-the-import analysis. Same name-convention basis as
    `dev-guard-warnings` recognising `__DEV__`. The trade-off — a user-defined
    function with a matching name that does NOT actually check typeof would
    silence the rule — is documented as the cross-module convention contract.

  5 new bisect-verified regression tests for the typeof-guard-function
  recognition.

- Updated dependencies [[`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6)]:
  - @pyreon/router@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/head@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14
  - @pyreon/runtime-server@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/head@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/router@0.12.13
  - @pyreon/runtime-dom@0.12.13
  - @pyreon/runtime-server@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/head@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/router@0.12.12
  - @pyreon/runtime-dom@0.12.12
  - @pyreon/runtime-server@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/head@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/router@0.12.11
  - @pyreon/runtime-dom@0.12.11
  - @pyreon/runtime-server@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-dom@0.7.2
  - @pyreon/runtime-server@0.7.2
  - @pyreon/router@0.7.2
  - @pyreon/head@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-dom@0.7.1
  - @pyreon/runtime-server@0.7.1
  - @pyreon/router@0.7.1
  - @pyreon/head@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/head@0.7.0
  - @pyreon/router@0.7.0
  - @pyreon/runtime-dom@0.7.0
  - @pyreon/runtime-server@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/router@0.6.0
  - @pyreon/head@0.6.0
  - @pyreon/runtime-dom@0.6.0
  - @pyreon/runtime-server@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-dom@0.5.7
  - @pyreon/runtime-server@0.5.7
  - @pyreon/router@0.5.7
  - @pyreon/head@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-dom@0.5.6
  - @pyreon/runtime-server@0.5.6
  - @pyreon/reactivity@0.5.6
  - @pyreon/router@0.5.6
  - @pyreon/head@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-dom@0.5.4
  - @pyreon/runtime-server@0.5.4
  - @pyreon/router@0.5.4
  - @pyreon/head@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-dom@0.5.3
  - @pyreon/runtime-server@0.5.3
  - @pyreon/router@0.5.3
  - @pyreon/head@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-dom@0.5.2
  - @pyreon/runtime-server@0.5.2
  - @pyreon/router@0.5.2
  - @pyreon/head@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/head@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-dom@0.5.1
  - @pyreon/runtime-server@0.5.1
  - @pyreon/router@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/runtime-dom@0.5.0
  - @pyreon/head@0.5.0
  - @pyreon/router@0.5.0
  - @pyreon/runtime-server@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Minor Changes

- ### @pyreon/router

  - `go(n)` and `forward()` for history navigation
  - Named `replace()` — navigate by route name
  - Optional params (`:id?`) with compile-time type inference
  - `isReady()` promise for initial navigation
  - `onBeforeRouteLeave` / `onBeforeRouteUpdate` in-component guard composables
  - Route aliases — render same component from multiple paths
  - Base path support for sub-path deployments
  - Navigation blockers (`useBlocker`)
  - Relative navigation from current route
  - Trailing slash normalization (strip/add/ignore)
  - Typed search params (`useSearchParams`)
  - Stale-while-revalidate loaders

  ### @pyreon/head

  - Cached resolve with dirty flag (30M+ ops/sec cached path)
  - Single-pass HTML escaping (regex + lookup table)
  - DOM element tracking via Map (avoids querySelectorAll per sync)
  - 7-9.5x faster SSR serialization than Unhead (Vue/Nuxt)

  ### @pyreon/server

  - Pre-compiled template splits at handler creation (17x faster on real templates)
  - Pre-built client entry tag avoids per-request string construction
  - `buildScriptsFast` skips array allocation
  - Template validation moved to `createHandler` time
  - New exports: `compileTemplate`, `processCompiledTemplate`, `CompiledTemplate`

### Patch Changes

- Updated dependencies []:
  - @pyreon/router@0.4.0
  - @pyreon/head@0.4.0
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0
  - @pyreon/runtime-server@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-dom@0.3.1
  - @pyreon/router@0.3.1
  - @pyreon/runtime-server@0.3.1
  - @pyreon/head@0.3.1

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
  - @pyreon/runtime-dom@0.3.0
  - @pyreon/runtime-server@0.3.0
  - @pyreon/router@0.3.0
  - @pyreon/head@0.3.0

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
  - @pyreon/runtime-dom@0.2.1
  - @pyreon/runtime-server@0.2.1
  - @pyreon/router@0.2.1
  - @pyreon/head@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0
  - @pyreon/runtime-dom@0.2.0
  - @pyreon/runtime-server@0.2.0
  - @pyreon/router@0.2.0
  - @pyreon/head@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-dom@0.1.2
  - @pyreon/runtime-server@0.1.2
  - @pyreon/router@0.1.2
  - @pyreon/head@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/head@0.1.1
  - @pyreon/router@0.1.1
  - @pyreon/runtime-dom@0.1.1
  - @pyreon/runtime-server@0.1.1
