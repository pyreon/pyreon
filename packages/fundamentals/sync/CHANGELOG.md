# @pyreon/sync

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
