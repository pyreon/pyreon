---
'@pyreon/core': patch
'@pyreon/sync': patch
'@pyreon/router': patch
'@pyreon/hooks': patch
'@pyreon/table': patch
'@pyreon/cli': patch
'@pyreon/mcp': patch
---

Documentation-only: closes five README/manifest gaps against shipped 0.52-cycle APIs, found by auditing every package README against its real exports.

- **`@pyreon/core`** — `<Async>`, `use()` (already in the manifest but undocumented in the README) and `elementRef()` (missing from BOTH the README and the manifest) are now documented. `elementRef` gets a new manifest `api[]` entry with a real `mistakes` catalog, and the package `longExample` now demonstrates all three primitives so they surface in `llms-full.txt` / the MCP `api-reference` (the manifest's `longExample`, not `api[].example`, is what drives that section).
- **`@pyreon/sync`** — the multiplatform pure-TS CRDT engine (`pyreonAdapter`, `PyreonCrdtAdapter`, `PyreonCrdtDoc`, `createActorId`, `connectPyreonSync`, `webSocketChannel`, `createNativeSyncHost`) shipped via #2824/#3207 and was undocumented everywhere — the README's own roadmap table still implied only the Yjs engine had landed. Adds a "Multiplatform engine" README section, 7 new manifest `api[]` entries, and a roadmap row.
- **`@pyreon/table`** — `createTableState` (the dependency-free, PMTC-lowerable table-state core) was documented in the manifest but absent from the README, which reads as TanStack-only. Adds a full section + a comparison table + a gotcha distinguishing it from `useTable`.
- **`@pyreon/router`** — `safeRedirectLocation` / `classifyRedirectTarget` (public open-redirect-guard exports) get a short "Redirect-target security" subsection under `notFound() / redirect()`.
- **`@pyreon/hooks`** — the README's "full surface" table-count line said "55 hooks across 7 categories" against a real 65 (the prose line three lines above it was correct and already guarded by `check-doc-claims`; this second, unguarded restatement of the same number silently drifted on its own). The table itself listed three hooks that do not exist (`useRootSize`, `useSpacing`, `useThemeValue`) and was missing 19 real ones across Interaction/Data (`useBluetooth`, `useSafeArea`, `useScreenOrientation`, `useDeviceMotion`, `useSpeech`, `useDeviceInfo`, `useCamera`, `useAudioRecorder`, `useWakeLock`, `useAppState`, `useCrashReporter`, `useAuth`, `useDatabase`, `useGeolocation`, `useMap`, `useWebSocket`, `useSecureStorage`, `usePush`, `usePayments`). The table is now a verified 1:1 match against `src/index.ts`'s real exports (programmatically diffed).
- **`@pyreon/cli`** — `check-doc-claims` gains a guarded claim site for the hooks README's table-count line, closing the exact gap that let it drift silently: `packages/tools/cli/src/doctor/gates/doc-claims.ts`'s `hook export count` check previously only watched the prose line in that file, not this second restatement a few lines below it. Bisect-verified: reverting the new claim spec makes the new regression test fail with `expected +0 to be 1` (drift undetected); restored, it passes.
- **`@pyreon/mcp`** — `api-reference.ts` regenerated (`bun run gen-docs`) from the `@pyreon/core` / `@pyreon/sync` manifest edits above; no hand edits.

No runtime behavior changes in any package.
