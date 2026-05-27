# @pyreon/example-native-router-demo-ios

> **PRIVATE / EXPERIMENTAL.** Canonical source for the Pyreon multiplatform **router** story. Sibling of [`../native-router-demo-web/`](../native-router-demo-web/) which imports from this path directly.

## What this proves

ONE `.tsx` source compiles to a **navigation-functional** app on all three targets via PMTC's Phase R1 stack:

- **R1.1** — Swift `<RouterView />` inside a routes-bearing `<RouterProvider>` emits the home component as NavigationStack body (closes the iOS blank-startup bug)
- **R1.2** — Kotlin route emit uses `when`-dispatch on `router.currentPath` (closes the NavHost state-disconnect + no-match-throw bugs)
- **C5.1-C5.4** — routes parsed from `createRouter({routes: [...]})`, emitted to platform-native navigation, with else-fallback for unmatched paths
- **PR #973** — `createRouter` / `useNavigate` / `useParams` recognised at decl level

## Source

[`src/RouterApp.tsx`](src/RouterApp.tsx) — 3 routes (`/`, `/about`, `/users/:id`), 3 page components, `<Link>` + `useNavigate()` based navigation. The web sibling's `entry-client.tsx` imports `RouterApp` from this path. The Android example (when scaffolded) reads from the same path via build script.

## Run

```bash
# Web (real-Chromium e2e via Playwright)
cd ../native-router-demo-web
bun run dev
# → http://localhost:5203
```

iOS / Android: PMTC compile validated via `@pyreon/native-compiler` test suite. Actual Xcode / Gradle scaffolds are follow-up work (deferred — TodoMVC-style scripts/build.sh + project.yml).
