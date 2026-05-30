# @pyreon/example-native-todomvc-web

> **PRIVATE / EXPERIMENTAL.** PMTC TodoMVC reference rendered on **WEB** via the `@pyreon/primitives` runtime. Sibling of:
>
> - [`examples/native-todomvc-ios/`](../native-todomvc-ios/) — SwiftUI target via PMTC compiler emit
> - [`examples/native-todomvc-android/`](../native-todomvc-android/) — Compose target via PMTC compiler emit
>
> Phase D of the PMTC multiplatform story — proves the canonical primitive vocabulary renders end-to-end on web.

## What this proves

`@pyreon/primitives`' 7 implemented web primitives (`Stack`, `Inline`, `Text`, `Button`, `Press`, `Field`, `Toggle`) plus Pyreon's `<For>` / `<Show>` control flow render a non-trivial app (TodoMVC) end-to-end with reactive signals + persistent storage. The `verify-modes` cell `native-todomvc-web × spa` asserts the production build emits expected HTML content.

## Build / dev

```bash
cd examples/native-todomvc-web
bun run dev      # vite dev server
bun run build    # vite production build → dist/
bun run preview  # serve dist/ via vite preview
```

## Source structure

| File | Purpose |
|---|---|
| `index.html` | Bootstrap shell — mounts `#app` + loads `entry-client.tsx`. |
| `src/entry-client.tsx` | `@pyreon/runtime-dom` mount call — `import { TodoApp } from '../../native-todomvc-ios/src/TodoApp'`. |

The canonical source lives at [`../native-todomvc-ios/src/TodoApp.tsx`](../native-todomvc-ios/src/TodoApp.tsx) — **the same file** Android reads via `scripts/build.sh` and iOS reads via xcodegen. Three targets, one `.tsx`. Web has no local copy; `entry-client.tsx` resolves it by relative-path import.

## Shared-source contract (Phase E3 — landed)

`src/entry-client.tsx` imports `TodoApp` from `../../native-todomvc-ios/src/TodoApp` — the SAME `.tsx` file Android compiles. This is "the literal same file across all three targets" the PMTC arc claims:

- **Web** — Vite + `@pyreon/runtime-dom` resolves the import + the canonical primitives (`<Stack>`, `<Field>`, etc.) auto-import from `@pyreon/primitives` (web runtimes).
- **iOS** — `pyreon-native build --target=ios` compiles the same `.tsx` to SwiftUI via PMTC's `canonical-primitives.ts` table (no `import` lines needed; the compiler resolves bare JSX tags).
- **Android** — same `.tsx`, same compile pass, `--target=android` emits to Compose.

Verified at `examples/native-todomvc-android/scripts/build.sh` (compiles `../../native-todomvc-ios/src/TodoApp.tsx`) + the verify-modes `native-todomvc-web × spa` cell (proves the web build emits expected HTML from the import).

## Canonical `<Toggle>` — semantic split across platforms

`<Toggle>` is the canonical binary-toggle primitive. The PMTC compiler emits the right native widget per target:

- Web: `<input type="checkbox">`
- iOS (SwiftUI): `Toggle("", isOn: ...)` — signal binding-projection OR custom `Binding(get:set:)` for parent-owns-state (the TodoRow pattern)
- Android (Compose): `Switch(checked = ..., onCheckedChange = ...)` (NOT `Toggle` — Compose uses `Switch` for the binary toggle)

The non-signal value path (PR #970) routes through SwiftUI's `Binding(get:set:)` so parent-owns-state shapes (TodoRow reading `props.todo.done` + calling `props.onToggle`) work without converting the parent state to a signal.

## What's NOT in Phase D

- **Real-Chromium e2e gate** (Playwright spec asserting click → DOM updates). Verify-modes catches the build emits content; the runtime click contract is a follow-up.
- **Native counter-ios `<Press>` migration** — the existing native counter scaffold doesn't use canonical primitives yet.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
