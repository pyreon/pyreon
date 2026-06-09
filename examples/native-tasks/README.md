# native-tasks — Pyreon multiplatform real-app showcase

> **PRIVATE / EXPERIMENTAL.** Gap 5 scaffold from the 2026-06-05 native-readiness audit. Multi-feature real-app showcase exercising MULTIPLE Tier-1 features end-to-end — beyond the sample-code scope of `native-counter-ios` / `native-router-demo-ios` / `native-todomvc-ios`.

## What this proves

A SINGLE `.tsx` source compiling cleanly to BOTH Swift (SwiftUI) AND Kotlin (Jetpack Compose) via PMTC, exercising:

- **Routing with auth-gate** (Gap 2 via #1440) — `createRouter` with per-route `beforeEnter: () => isAuthenticated() || '/login'`. Web router gates and the native runtimes gate identically post #1440.
- **Reactive state machine** (Gap 4 PR-2 via #1445) — `createMachine` for `idle → loading → loaded | error` app state. Emits `PyreonMachine` on both natives via the Strategy-B port.
- **i18n translations** (Gap 4 PR-3 via #1447) — `createI18n` provides per-screen strings. Emits `PyreonI18n` on both natives via the v1 Strategy-B port.
- **Canonical primitives** — `<Stack>` / `<Inline>` / `<Field>` / `<Button>` / `<Text>` / `<For>` / `<Show>` resolve per-target via `canonical-primitives.ts`.
- **Signal + computed reactivity** — `signal(0)` + `computed(() => …)` for filtered views.

## What's intentionally NOT in this scaffold

The audit estimates ~3 weeks for the full showcase (PR-5.1 web app + PR-5.2 native ports + PR-5.3 CI wiring). This scaffold is the FIRST PR of that arc — it ships the **canonical source** that proves the cross-target contract; subsequent PRs add the host shells + real backend + e2e:

- **iOS XcodeGen host + Android Gradle host**: deferred. The source compiles via PMTC; real device host shells follow the proven template at `native-router-demo-ios/project.yml` + `native-todomvc-android/build.gradle.kts`.
- **Web Vite host**: deferred. The web sibling would import the canonical source the same way `native-router-demo-web/` does (cross-example import).
- **Real auth backend**: `login()` flips a signal — no fetch, no token storage. Real auth needs `useFetch` (Tier-1) + `useStorage` (Tier-1) wiring — straightforward but adds a backend dependency.
- **Task data from API**: `tasks` is a signal seeded with literal demos. `useFetch('/api/tasks')` is the Tier-1 hook.
- **`defineStore` for cross-screen state**: the `isAuthenticated` + `tasks` signals are module-level for v1. The proper shape uses `defineStore("auth", () => ({ isAuthenticated: signal(false) }))` — deferred per the audit's Gap 4 PR-4 queue.
- **Form validation**: deferred per Gap 4 validation-port queue.
- **XCUITest + Espresso e2e**: deferred to Gap 5 PR-5.3. The `data-testid` attrs on every interactive element are already there (compile to `.accessibilityIdentifier()` / `Modifier.testTag()` per target) so future e2e gates have stable selectors.

## File layout

```text
examples/native-tasks/
├── src/
│   └── TasksApp.tsx          # canonical source (single file, all 3 targets)
├── scripts/
│   ├── build-swift.sh        # PMTC → generated/swift/TasksApp.swift
│   └── build-kotlin.sh       # PMTC → generated/kotlin/TasksApp.kt
├── generated/                 # gitignored; populated by build scripts
│   ├── swift/
│   └── kotlin/
├── package.json
└── README.md
```

## Verify

```bash
cd examples/native-tasks
bun run build:swift       # emits generated/swift/TasksApp.swift
bun run build:kotlin      # emits generated/kotlin/TasksApp.kt

# Validate Swift parses cleanly against a real Swift toolchain:
swiftc -parse generated/swift/TasksApp.swift
# → exit 0; locked-in via the `validate-swift.test.ts` fixture loop
#   under `showcase-tasks.tsx`.
```

**Swift emit: locked via CI gate** — `showcase-tasks.tsx` is in the
`validate-swift.test.ts` fixture loop, so the same `swiftc -parse`
pass that protects the canonical primitives now protects this
showcase end-to-end.

**Kotlin emit: scaffold ships, full validation deferred** — the
showcase's emit is structurally sound (`bun run build:kotlin`
succeeds with zero PMTC warnings) but kotlinc against the framework
stubs surfaces 3 real PMTC limitations the audit follow-ups will
close:

  1. Synthetic data classes for prop-passed object shapes (e.g.
     `tasks: { id, title, done }[]`) are not emitted as
     `data class TasksListPageTask` declarations — kotlinc fails
     `unresolved reference 'TasksListPageTask'`.
  2. The router-kotlin stubs (`useNavigate`, `useParams`) are not in
     `kotlin-stubs.ts` yet — only `PyreonLink` is. Adding the hooks
     would unblock kotlinc resolution.
  3. `tasks.length` extension dispatch fails when T is uninferred
     from the prop type (above limitation cascades).

Each is a one-PR fix. The fixture's Kotlin row will land in
`validate-kotlin.test.ts` when those 3 issues close.

## Roadmap (Gap 5 follow-ups)

- **PR-5.2** — web sibling (`examples/native-tasks-web/`) + iOS host (`examples/native-tasks-ios/project.yml`) + Android host (`examples/native-tasks-android/build.gradle.kts`). All three import / build the canonical `src/TasksApp.tsx` from this directory.
- **PR-5.3** — XCUITest + Espresso e2e on `data-testid` selectors; wire into `native-device` CI gate; add to `verify-modes` matrix.
- **PR-5.4+** — real backend (`useFetch` + `useStorage`), `defineStore` migration (when Gap 4 PR-4 ships), form validation, more screens.

## Audit status

Closes the canonical-source scaffold of Gap 5 from `.claude/audits/native-readiness-2026-06-05.md`. The full Gap 5 closure requires PR-5.2 + PR-5.3 (host shells + e2e) — multi-week follow-up per the audit's effort estimate.
