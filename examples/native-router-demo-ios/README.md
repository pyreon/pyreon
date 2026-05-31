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

### Web (real-Chromium e2e via Playwright)

```bash
cd ../native-router-demo-web
bun run dev
# → http://localhost:5203
```

### iOS (Xcode + Simulator)

The full host shell is now wired (post-#1099-era follow-up). One-command setup:

```bash
brew install xcodegen   # one-time
cd examples/native-router-demo-ios
./scripts/xcode-setup.sh   # compile RouterApp.tsx → generated/*.swift + regenerate xcodeproj
open PyreonRouterDemo.xcodeproj
# ⌘+R to run in the iOS Simulator
```

Inside Xcode, the project's `preBuildScript` re-runs `build.sh` on every build — so edits to `src/RouterApp.tsx` are picked up automatically.

The host wraps `RouterApp()` (from `generated/RouterApp.swift`, produced by `pyreon-native build --target=ios`) inside a minimal SwiftUI `@main` app. Depends on `@pyreon/native-router-swift` (the runtime `PyreonRouter` + `RouterProvider` + `NavigationLink` helpers) — wired as a local SPM package in `project.yml`.

### Android

Not yet scaffolded. The shared `src/RouterApp.tsx` source compiles to typecheck-clean Kotlin/Compose today (verified by `@pyreon/native-compiler`'s `validate-kotlin` gate); only the host shell + Gradle wiring is missing. Same pattern as `examples/native-todomvc-android/` would apply.
