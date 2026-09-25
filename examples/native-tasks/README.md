# native-tasks — Pyreon multiplatform real-app showcase

> **PRIVATE / EXPERIMENTAL.** Gap 5 scaffold from the 2026-06-05 native-readiness audit. Multi-feature real-app showcase exercising MULTIPLE Tier-1 features end-to-end — beyond the sample-code scope of `native-counter-ios` / `native-router-demo-ios` / `native-todomvc-ios`.

## What this proves

A SINGLE `.tsx` source compiling cleanly to BOTH Swift (SwiftUI) AND Kotlin (Jetpack Compose) via PMTC, exercising:

- **Routing with auth-gate** (Gap 2 via #1440) — `createRouter` with per-route `beforeEnter: () => isAuthenticated() || '/login'`. Web router gates and the native runtimes gate identically post #1440.
- **Reactive state machine** (Gap 4 PR-2 via #1445) — `createMachine` for `idle → loading → loaded | error` app state. Emits `PyreonMachine` on both natives via the Strategy-B port.
- **i18n translations** (Gap 4 PR-3 via #1447) — `createI18n` provides per-screen strings. Emits `PyreonI18n` on both natives via the v1 Strategy-B port.
- **Canonical primitives** — `<Stack>` / `<Inline>` / `<Field>` / `<Button>` / `<Text>` / `<For>` / `<Show>` resolve per-target via `canonical-primitives.ts`.
- **Signal + computed reactivity** — `signal(0)` + `computed(() => …)` for filtered views.

## Sibling hosts (landed)

The original ~3-week arc (PR-5.1 web app + PR-5.2 native ports + PR-5.3 CI
wiring) has landed in full: [`native-tasks-web`](../native-tasks-web),
[`native-tasks-ios`](../native-tasks-ios), and
[`native-tasks-android`](../native-tasks-android) each host this directory's
`src/TasksApp.tsx`, and `.github/workflows/native-device.yml` runs the iOS
XCUITest + Android Espresso suites in CI. See each sibling's own README for
its current state.

## What's still not in this scaffold

- **Real auth backend**: `login()` flips a signal — no fetch, no token storage. Real auth needs `useFetch` (Tier-1) + `useStorage` (Tier-1) wiring — straightforward but adds a backend dependency.
- **Task data from API**: `tasks` is a signal seeded with literal demos. `useFetch('/api/tasks')` is the Tier-1 hook.
- **`defineStore` for cross-screen state**: the `isAuthenticated` + `tasks` signals are module-level for v1. The proper shape uses `defineStore("auth", () => ({ isAuthenticated: signal(false) }))` — deferred per the audit's Gap 4 PR-4 queue.
- **Form validation**: deferred per Gap 4 validation-port queue.

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

**Kotlin emit: also locked via CI gate.** `showcase-tasks.tsx` is now in the
`validate-kotlin.test.ts` fixture loop too, matching the Swift side above —
the 3 limitations that originally blocked it (missing synthetic data classes
for prop-passed object shapes, missing router-kotlin stubs for
`useNavigate`/`useParams`, and the resulting `tasks.length` dispatch failure)
have all closed.

## Roadmap

PR-5.2 (web + iOS + Android hosts) and PR-5.3 (XCUITest + Espresso e2e, wired
into `native-device` CI) are both done — see "Sibling hosts" above. Remaining:

- **PR-5.4+** — real backend (`useFetch` + `useStorage`), `defineStore` migration (when Gap 4 PR-4 ships), form validation, more screens.
