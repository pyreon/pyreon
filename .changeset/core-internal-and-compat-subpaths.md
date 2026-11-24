---
'@pyreon/core': minor
'@pyreon/reactivity': minor
'@pyreon/runtime-dom': minor
'@pyreon/runtime-server': minor
'@pyreon/server': minor
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
'@pyreon/vue-compat': patch
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
'@pyreon/elements': patch
'@pyreon/rocketstyle': patch
'@pyreon/styler': patch
'@pyreon/kinetic': patch
'@pyreon/atlas': patch
---

BREAKING: the core packages' `_`-prefixed internals and `@pyreon/core`'s compat-layer plumbing are no longer exported from the public entries. They moved to subpaths that carry no semver promise (see "What counts as public API" on the stability page). The compiler-emitted helpers (`_rp`, `_pp`, `_tpl`, `_bind`, `_ssr*`, …) are the compiler ABI and stay where they were.

- `@pyreon/core` → `@pyreon/core/internal`: `_IslandIds`, `_childText`, `_copyProp`, `_devMarkOwnerAlias`, `_isStructuralChild`, `_isVNodeLike`, `_mergePropsExcept`, `_mergePropsOmit`, `_nextIslandIdPrefix`, `_pickProps`, `_requestIdFrame`, `_resetAsyncWarning`, `_resetIdCounter`, `_runHooked`, `_setSuspenseHydrating`, `_takeHooks`, and the non-`_` internals `dispatchToErrorBoundary`, `propagateError`, `runWithHooks`, `setContextStackProvider`, `getContextStackLength`, `removeContextFrame`, `REACTIVE_PROP`, `isSafeImageDataUri` (no codemod rewrites these; move the import by hand). `pushContext` / `popContext` stay public: the core and runtime-server docs present them as the SSR / test escape hatch for seeding context outside component setup.
- `@pyreon/core` → `@pyreon/core/compat` (new subpath for the compat layers): `isNativeCompat`, `NATIVE_COMPAT_MARKER`, `mapCompatDomProps`, `shallowEqualProps`, `_compatProps`. `nativeCompat()` stays public on `@pyreon/core`.
- `@pyreon/reactivity` → `@pyreon/reactivity/internal`: `__resetReactiveDevtoolsForTesting`, `_abortOwnerFrame`, `_captureRun`, `_claimContextOwner`, `_closeOwnerFrame`, `_currentScope`, `_devOwner`, `_enterCleanupFrame`, `_exitCleanupFrame`, `_frameReads`, `_hasSubscribers`, `_noopDispose`, `_openOwnerFrame`, `_rdCloseBindingFrame`, `_rdDropBinding`, `_rdLabelBinding`, `_rdLabelDirect`, `_rdLabelSubscribers`, `_rdNodeId`, `_rdNoteTarget`, `_rdOpenBindingFrame`, `_rdPreview`, `_rdRegistrySize`, `_rdScopeNodes`, `_releaseRun`, `_renderBind`, `_replayReads`, `_resetSentinel`, `_resumeSoleSubscriber`, `_resumeSubscriber`, `_sampleReads`, `_setRequestOwnerReader`, `_suspendSoleSubscriber`, `_suspendSubscriber`, `_swapPendingOwner` (the `CleanupFrameToken`, `RunCapture` and `SoleSubscriberToken` types are also exported there)
- `@pyreon/runtime-dom` → `@pyreon/runtime-dom/internal`: `_declareRootDecoration`
- `@pyreon/runtime-server` → `@pyreon/runtime-server/internal`: `_setStreamFlushBytes`
- `@pyreon/server` → `@pyreon/server/internal`: `_resetServerIslands`

The compat layers, `@pyreon/elements`, `@pyreon/rocketstyle`, `@pyreon/styler`, `@pyreon/kinetic` and `@pyreon/atlas` now import these from the new subpaths; their own APIs are unchanged.

Upgrade: codemod internal-exports-subpath
