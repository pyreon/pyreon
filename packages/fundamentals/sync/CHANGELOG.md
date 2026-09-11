# @pyreon/sync

## 0.52.0

### Minor Changes

- CRDT: a map handle on both native runtimes, so the ordinary `doc.getMap(name)` shape lowers (78b3423)

  The web `CrdtDoc` hands you a `CrdtMap` you hold and call — `doc.getMap('room').set('title', v)`.
  Both native runtimes only had the flat form, where the map name is a first argument
  (`doc.set('room', 'title', v)`), and PMTC lowers these calls verbatim: shared source written
  against the documented web API emitted a call to a `getMap` that did not exist, with **no
  warning**, so the failure surfaced as a swiftc/kotlinc error inside a generated file rather
  than as a diagnostic naming the call.

  `PyreonCrdtMap` now exists on both runtimes with the full web surface — `get`, `set`, `has`,
  `keys`, `observe` — plus `set` overloads for the scalar types, because `PyreonScalar` is a
  sealed/enum type and requiring the wrapper at every call site would put platform constructors
  into files that must also compile as TypeScript.

  The validation stubs were a **subset** of the runtime they claim to mirror, which is the
  inverse defect and just as costly: a narrower stub rejects correct emit. The Swift stub was
  missing `has`/`keys`/`applyOps`/`encodeState`/`encodeMessage`/`applyMessage`/`onLocalOps`, and
  the Kotlin stub was additionally missing `PyreonScalar.Null` — while its own comment already
  claimed to mirror the surface. Both now do.

  `CrdtDoc.transact` and `CrdtDoc.destroy` are still absent on native — but they no longer
  fail silently. PMTC now WARNS by name when shared source calls a `CrdtDoc`/`CrdtMap` member
  that has no native counterpart, saying what will happen (the call is reproduced verbatim, so
  the native build fails on a method you never wrote in that language) and what to do instead.

  The classification behind that warning is TOTAL over the web contract rather than a
  hand-maintained list: a test parses `CrdtDoc`/`CrdtMap` out of `@pyreon/sync`'s own
  `crdt/types.ts` and fails if any member is unclassified. A list checked in one direction rots
  the moment the interface grows a member, and the rot is invisible — an unclassified member
  simply never warns.

  Also: `PyreonCrdtDoc.applyOps`'s `origin` parameter now defaults to `REMOTE_ORIGIN`, which its
  own docblock has always claimed. It was required, so the documented call shape did not compile
  — and that mattered beyond tidiness, because the native runtimes take `applyOps(ops)` with one
  argument, so shared multiplatform source could not write a call valid on both platforms. Every
  existing caller already passes the origin explicitly, so the default is purely additive.

- Native `PyreonSyncedSignal` (iOS + Android) now writes create-if-missing seeds into a separate `"<map>:defaults"` map, mirroring web #2519. Reads resolve real map → defaults map → `initial`, so a fresh peer's default can never clobber real data on an actor tie-break. Residual (same as web): two fresh peers seeding an empty room with different defaults still tie-break, but among defaults only — peers converge (harmless), they never diverge and a real value is never lost. (f882cba)
- Add a native sync transport (`PyreonSyncTransport` on iOS + Android) — the native equivalent of the web `connectPyreonSync(doc, channel)`, wiring a `PyreonCrdtDoc` to a peer over a string-duplex `PyreonSyncChannel` for real-time cross-device collaboration. (f882cba)
- Add real WebSocket channels for native cross-device CRDT sync: `PyreonSyncWebSocketChannel` (Swift, URLSessionWebSocketTask) and its Android OkHttp twin, both implementing `PyreonSyncChannel` so `PyreonSyncTransport` can converge two devices over a live socket relay. (6d09d13)
- Lower `@pyreon/sync`'s `syncedSignal` to native (iOS + Android). (7ee508e)

  `const doc = new PyreonCrdtDoc()` + `const title = syncedSignal({ doc, key, initial })`
  in shared `.tsx` now compile to a native `PyreonSyncedSignal` over a shared
  `PyreonCrdtDoc` — scalar `string`/`number`/`boolean`, `title()` read + `title.set(v)`
  write flowing 1:1 to the facade.

  - **Swift**: the doc + signals are typed `@State` seeded in a GENERATED component
    `init()` (`_title = State(initialValue: PyreonSyncedSignal(doc: doc, …))`),
    because a synced signal's `@State` initializer references the doc and one
    `@State` cannot reference another at property init. Props thread through the
    init as parameters, so a component can still take props.
  - **Kotlin**: sequential `remember { }` blocks (no init needed).

  `@pyreon/sync` leaves `WEB_ONLY_PACKAGES` and declares a `nativeFrontend` (the
  Yjs engine + IndexedDB/WebSocket transports stay web; cross-device transport is
  tracked). Verified end-to-end: the emit type-checks against the real SwiftUI SDK

  - the real facade on macOS, and against the Swift/Kotlin validate stubs.

- Ship `@pyreon/sync`'s native ports, and add the `PyreonSyncedSignal` facade. (2e12add)

  Two things:

  - **Fix: the native CRDT port was built but never published.** Every other
    co-located package lists `native/swift` + `native/kotlin` in its `files`
    array; `@pyreon/sync` did not, so its `PyreonCrdt` port (the LWW-CRDT engine)
    shipped to npm missing — a native app installing `@pyreon/sync` could not
    find it. Added the two entries so the ports actually reach a scaffolded
    iOS/Android app (the `pyreon.native` field was already declared).

  - **New: `PyreonSyncedSignal`** — the native `Signal<T>` facade over a shared
    `PyreonCrdtDoc`, the iOS/Android counterpart to `syncedSignal({ doc, key,
initial })`. Scalar values (`String` / `Double` / `Bool`), local-first
    create-if-missing, and CRDT-backed reactivity: a remote op applied to the doc
    updates the signal's value through the doc observer (so a remote edit repaints
    the UI with no diff). Behaviourally byte-aligned across web/iOS/Android and
    verified by the co-source gate (compiled + run).

  The compiler lowering that emits this from a plain `syncedSignal()` call in
  shared `.tsx`, and the cross-device WebSocket transport bridge, are the tracked
  follow-ups.

- feat(sync): multiplatform LWW CRDT — dependency-free JS engine + transport + native iOS/Android ports (wire-compatible, converging) (83ec20c)

  The foundation for 1:1 multiplatform sync. A pure last-writer-wins CRDT engine implementing the engine-neutral `CrdtAdapter` seam, with **no `yjs`** — shipped as THREE wire-compatible engines that converge with each other:

  - **Web/JS** (`pyreonAdapter`) + a pure-JS client transport (`connectPyreonSync`, JSON ops over any string duplex) + a `NativeSyncHost` bridge contract. `syncedSignal` runs over it end-to-end.
  - **iOS** (`PyreonCrdt.swift`) and **Android** (`PyreonCrdt.kt`) native ports — same `{ ops: [{ map, key, value, clock, actor }] }` wire format, same deterministic LWW merge (higher Lamport clock wins; equal clock → higher actor id), hand-written JSON codec (compiles against the minimal native stubs).

  All three converge: concurrent-offline writes resolve to the same winner on every peer, higher-clock-wins, order/duplicate-insensitive, no echo. Verified end to end — JS suite (bisect-covered specs) + the native co-source gate compiles and RUNS the Swift + Kotlin convergence tests (including decoding a web-format message). Scope matches the v1 seam: flat key → scalar registers; rich `Y.Text`/`Y.Array` stay on `@pyreon/sync/yjs`.

  PMTC compiles UI + signals, not engine logic, so a CRDT engine can't cross by source compilation — hence real native ports behind the seam (the `PyreonWebSocket`/`PyreonHttp` pattern), giving an iOS/Android/web peer 1:1 convergence over one protocol. Remaining: the reactive UI binding (`@Observable`/`mutableStateOf`) + `PyreonWebSocket` transport wiring + a device convergence test.

- refactor(sync): `ws` is now an OPTIONAL peer dependency — the client path is dependency-free (d9c0267)

  `ws` was a hard runtime dependency, but it is used ONLY by the server-only relay (`@pyreon/sync/server`, `WebSocketServer`). The **client** sync transport (`connectViaWebSocket`) already uses `globalThis.WebSocket` (browsers + Node 21+) with an injectable `WebSocketImpl`, and `useWebSocket` already lowers to the native `PyreonWebSocket` on iOS/Android — so a client consumer never needs `ws`. Making it an optional peer means the client (and native) dependency graph is `@pyreon/*` + platform WebSocket only, with no external `ws` install.

  **Action for `@pyreon/sync/server` (relay) users**: add `ws` to your own dependencies. Client-only / native users need no change. (`ws` remains in `@pyreon/sync`'s devDependencies for its own relay tests.)

### Patch Changes

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- Update third-party dependencies to their latest compatible releases. (5867cca)

  Runtime dependencies that reach consumers: `oxc-parser` / `oxc-transform`
  0.144 → 0.147 (`@pyreon/compiler`, `@pyreon/native-compiler`), the CodeMirror 6
  family (`@pyreon/code`), TipTap 3.29 → 3.30 (`@pyreon/rich-text`), TanStack
  Query 5.101 → 5.102 (`@pyreon/query`), the
  pragmatic-drag-and-drop auto-scroll/hitbox companions (`@pyreon/dnd`),
  `y-protocols` (`@pyreon/sync`), `oxlint` 1.78 → 1.80 (`@pyreon/lint`), and the
  shiki / remark / unist chain (`@pyreon/zero-content`).

  No API surface changes. Held deliberately, each for a stated reason: TypeScript
  stays capped `<7.0.0` (TS7 removed the classic Compiler API), and
  `@changesets/cli` v3, `@atlaskit/pragmatic-drag-and-drop` v3, and `ky` v2 are
  majors that need their own PRs.

- Three reactivity/correctness fixes found by running `pyreon doctor` against the (02cae6a)
  framework itself, plus the rule-option support that made the remaining reports
  resolvable.

  - **`useChart` published a torn frame.** `instance.set(chart)`, `loading.set(false)`
    and `error.set(null)` ran unbatched, so a subscriber reading two of them saw
    the chart instance published while `loading` was still `true` — the "chart is
    ready but still showing a spinner" flicker. Batched into one notify cycle; the
    batch flushes before `onInit`, so the documented "fully configured before
    `onInit` fires" invariant is unchanged.

  - **Flow's `handlePointerUp` fired one notify cycle per selected node.** Its
    three branches (rubber-band / drag-end / connection-drop) are sequential and
    can co-occur, and the rubber-band branch calls `clearSelection()` plus
    `selectNode()` once per hit node — so a band over 100 nodes fired 100+ cycles
    and re-rendered the canvas each time. One pointerup is now one transition.

  - **`createActorId`'s fallback could collide.** The doc comment states two live
    peers must not share an id, but the non-`crypto.randomUUID` path was
    `Date.now()` + `Math.random()`, which repeats within a millisecond and is a
    birthday risk besides. It now prefers `crypto.getRandomValues` (far more widely
    available than `randomUUID`, which requires a secure context) and its last
    resort mixes in a per-process monotonic counter, so two ids from one process
    can never collide by construction and the random field only has to separate
    processes.

  - **`exemptPaths` on six rules that documented the convention but never read it.**
    `toast-a11y`, `no-href-navigation`, `no-inline-style-object`,
    `prefer-use-is-active`, `no-effect-in-mount` and `prefer-field-array` all
    inspect a call site, so the file that _implements_ the thing being recommended
    reports against itself — `link.tsx` renders the `<a href>` that `<Link>`
    wraps, and the toast row computes `role` from severity in its definition
    rather than at the `<ToastItem>` call site. Resolving that in-rule needs the
    parent chain, which oxc's visitor does not provide, so these now honour the
    documented `exemptPaths` option instead. Each still fires normally everywhere
    else.

- perf: single-observer fast path in the CRDT adapter's commit/op notify (bde583a)

  `PyreonCrdtDoc`'s `_notify` (fired per transaction commit) and its op-listener
  broadcast both snapshotted their subscriber set with `[...set]` before iterating.
  The keyed dispatcher installs exactly ONE observer per map, so that snapshot was
  a throwaway array on every commit; one op-listener is likewise the common case.

  Fast-path `set.size === 1`: capture the sole subscriber and fire it (matching the
  snapshot's "subscribers present at notify start" semantics) without the array allocation.
  The `[...set]` snapshot is kept for the multi-subscriber case. Completes the
  subscriber-snapshot class fixed in the CRDT dispatcher (#3087).

  Bisect-verified: no-op'ing the fast path fails a single-observer fire spec
  (`expected +0 to be 1`); the multi-observer snapshot path still fires everyone.

  Stated precisely, because the obvious reading is wrong: this is not
  zero-allocation. Reading the sole entry via `values().next()` still allocates a
  Set iterator plus its result object, and V8 does not escape-analyze those away
  (measured in #2973). One allocation of three is removed, not three of three.

- Two hot-path optimizations, each locked by new bench cells in `scripts/bench/core/sync.ts`: (43304b6)

  - `syncedText.set` no longer re-materializes the whole document (`ytext.toString()`, an O(docLen) tree walk + allocation) to compute `prev` on every keystroke — it reads the base signal's mirror (`base.peek()`), which the Y.Text observer already materialized at the last transaction end. Guarded: falls back to `toString()` inside an outer `doc.transact` (observers deferred), during the observer/cleanup phase (a sibling observer may run before ours), and after `dispose()` (observer detached) — the three windows where the mirror premise does not hold, each locked by a premise test.
  - The WebSocket transport's inbound handler now decodes + applies already-binary frames (ArrayBuffer / Node Buffer — every frame in practice, since the transport sets `binaryType = 'arraybuffer'`) synchronously via the new `toBytesSync` fast path, removing a promise allocation + microtask hop per remote op; Blob / fragmented frames keep the async normalization.

- perf: skip the snapshot-array allocation in the single-handler CRDT dispatch path (2c38a13)

  `observeMapKey`'s dispatch loop snapshotted each changed key's handler set with
  `[...set]` before invoking. That runs once per committed CRDT transaction (every
  synced-field write, local and remote) — the hottest per-update path in sync — and
  the dominant shape is exactly one handler per key (one `syncedSignal` bound to a
  key), where there is no sibling to protect and the array is pure garbage.

  Fast-path `set.size === 1`: capture the sole handler and fire it, preserving the
  snapshot's exact "handlers present at dispatch start" semantics (fires once even
  if the handler disposes or re-registers itself mid-dispatch) without allocating.
  The `[...set]` snapshot is kept for the multi-handler case, where it protects
  against a handler disposing a SIBLING mid-iteration.

  Bisect-verified: a naive bare `for (const h of set) h()` fast path fires a sibling
  re-registered mid-dispatch and fails the parity spec; the capture does not.

- `syncedSignal` / `syncedStore` now share ONE engine observer per (doc, map) instead of attaching two raw observers per field. A 20-field `syncedStore` previously installed 40 `Y.Map` observers (one on the data map and one on the defaults map per field), every committed transaction invoking all of them just to filter `changedKeys.has(key)`; the new per-(doc, map) dispatcher (`crdt/map-dispatch.ts`) installs 2 and routes each transaction's changed keys to the affected field handlers by key-indexed lookup — O(changed keys) instead of O(fields) per write. (ce8832f)

  The native host (`createNativeSyncHost().observe`) — the same per-key filtering pattern — routes through the dispatcher too, so N native signals over one map also share one engine observer.

  Behavior is unchanged: handlers still fire synchronously at transaction commit for local and remote origins alike (the dispatcher never inspects origin — loop prevention stays in the transport plus the base signal's `Object.is` echo no-op), disposal is refcounted so two stores over one doc share an observer and disposing one never unhooks the other, and a `syncedSignal` created after a store routes through the existing dispatcher.

  Measured (20-field store on the real Yjs engine, ratios over absolutes — machine under load, adjacent A/B arms, two samples each): ~1.47× faster per write (−32%, ~2.3µs → ~1.6µs) for both local sets and remote-origin applies, engine observers 40 → 2. An honest note on scale: the per-write win is O(N)-proportional — at a handful of fields it is small; the structural win (constant observer count per map) is the durable part.

- Updated dependencies:
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- A create-if-missing default can no longer destroy real data. (cfd2e8c)

  Seeding `initial` into the same CRDT map as real data made a default able to BEAT that data: two fresh peers in an empty room both seed on first sync, so one peer's seed is causally CONCURRENT with the other's real write, and `Y.Map` resolves concurrency by clientId — which Yjs assigns randomly. Roughly half the time the default won and the value was permanently lost (the "two devices open, one types, the other's default wipes it" report).

  Defaults now live in a companion `<map>:defaults` key space. Reads prefer the data map, so a default can never outrank a real value no matter how the tie falls; concurrent defaults still tie among themselves, which is harmless (peers converge on one default instead of diverging). Backward compatible: docs persisted with their default in the data map keep reading it.

- Updated dependencies:
  - @pyreon/reactivity@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Minor Changes

- [#2385](https://github.com/pyreon/pyreon/pull/2385) [`19418d3`](https://github.com/pyreon/pyreon/commit/19418d300bd6e30f421d86fcc314554932809b50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Defer `syncedSignal`'s create-if-missing seed until first sync when a transport is attached — a fresh peer's default no longer clobbers a peer's real value on Yjs's random-clientId `Y.Map` tie-break (issue [#2380](https://github.com/pyreon/pyreon/issues/2380)). The seed still shows `initial` optimistically but only WRITES the CRDT once sync confirms the key is still absent (empty room); it seeds immediately when alone / no-transport / already-synced, and is canceled on dispose. `WebSocketTransport` gains a reactive `synced` signal + `whenSynced()` (the y-websocket convention). Residual: two fresh peers seeding an empty room with different defaults for the same key still tie-break — gate app-level defaults behind `await transport.whenSynced()`.

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0

## 0.47.0

### Patch Changes

- [#2333](https://github.com/pyreon/pyreon/pull/2333) [`30e0b0e`](https://github.com/pyreon/pyreon/commit/30e0b0e7bad325bd12cacb2331a93f1968657a57) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external runtime dependencies to latest (safe batch): @tiptap/\* 3.28.0, ws 8.21.1, shiki 4.3.1, @clack/prompts 1.7.0. No API changes. (vite stays held at 8.0.16 tree-wide — 8.1.x breaks the zero-content compiled-JSX test pipeline; see PR for the bisect.)

- Updated dependencies []:
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5)]:
  - @pyreon/reactivity@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/reactivity@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Minor Changes

- [#1519](https://github.com/pyreon/pyreon/pull/1519) [`3cc32a4`](https://github.com/pyreon/pyreon/commit/3cc32a441fd92d45407b6894d19c74ea64933f42) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `syncedAwareness` — ephemeral presence + live cursors over the Yjs awareness protocol (exported from `@pyreon/sync/yjs`). It is a separate, never-persisted channel from the document CRDT: reactive `local` / `others` / `states` signals plus `setLocal` / `setLocalField` to publish your own presence (`PeerState<T> = { clientId, state, isLocal }`).

  Awareness rides both transports (`connectViaWebSocket` + `connectViaBroadcastChannel`) on a new `MSG_AWARENESS` frame, applied under the shared `REMOTE_ORIGIN` so a received presence is never re-broadcast by a sibling transport (cross-transport loop guard). The relay (`createSyncServer`) is now awareness-stateful: a joining client sees existing peers instantly, and a crashed client's presence is purged on socket close. Create `syncedAwareness` before connecting a transport; apps that never use presence pay zero awareness overhead.

- [#1511](https://github.com/pyreon/pyreon/pull/1511) [`981eb71`](https://github.com/pyreon/pyreon/commit/981eb712c88f489fb3a61d05ec5a853437629e3f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **`@pyreon/sync` is now public.** The local-first / CRDT-backed sync layer ships as a published package after the engine + transport + relay story is complete and hardened.

  A synced value is a normal `Signal` (built via `wrapSignal`), so a remote change becomes one `signal.set` → one fine-grained DOM update — never a re-render. Three entry points:

  - `@pyreon/sync` — the engine-neutral reactive bridge: `syncedSignal`, `syncedStore`, the `CrdtAdapter` / `CrdtDoc` / `CrdtMap` seam, the `LOCAL_ORIGIN` / `REMOTE_ORIGIN` tags, and an in-memory `FakeCrdtAdapter` + `connectFakeDocs` for dependency-free tests. Depends only on `@pyreon/reactivity`.
  - `@pyreon/sync/yjs` — the real Yjs engine (`createYjsDoc`), IndexedDB persistence (`persistViaIndexedDB`), same-origin cross-tab (`connectViaBroadcastChannel`) and cross-device WebSocket (`connectViaWebSocket`) transport, and collaborative text + lists (`syncedText` / `syncedList`). Keeps `yjs` out of the core entry.
  - `@pyreon/sync/server` — a Node/Bun relay (`createSyncServer`) with a per-room/per-doc `authorize` gate. Server-only.

  v1 syncs scalar map fields plus collaborative `Y.Text` / `Y.Array`. CRDTs prevent lost updates, not semantic conflicts; a synced app adds ~60KB+ gz (`yjs` + `y-indexeddb` + WS client) off the core hot path; the relay's authorization gate is required in production.

### Patch Changes

- [#1529](https://github.com/pyreon/pyreon/pull/1529) [`eac3bbf`](https://github.com/pyreon/pyreon/commit/eac3bbf1530173ab9fced6ff87ae96bfdf2abb28) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `syncedAwareness` lifecycle: a view's `dispose()` now detaches only its own observer instead of destroying the doc-shared `Awareness`.

  Previously `syncedAwareness(doc).dispose()` ran `aw.destroy()` + `removeAwarenessStates` + a WeakMap delete on the **doc-shared** awareness instance. Because the awareness is one-per-`Y.Doc` (shared by every transport and every presence view), and `dispose` is auto-called via `onCleanup` on component unmount, a single component unmounting — or disposing one of several presence views — silently destroyed presence for the whole doc: the transports and any sibling view were stranded.

  The awareness lifecycle is now **doc-owned**: `dispose()` is listener-detach only, and `YjsCrdtDoc.destroy()` performs the teardown (new `destroyDocAwareness` helper — announce departure + `aw.destroy()` + WeakMap-delete). Departure on disconnect remains the transport's job, and the relay's socket-close purge is the real ghost-cursor guarantee. Bisect-locked by new multi-view + `doc.destroy()` specs.

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/reactivity@0.33.0
