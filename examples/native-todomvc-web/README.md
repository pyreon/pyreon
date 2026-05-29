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

| File                   | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `index.html`           | Bootstrap shell — mounts `#app` + loads `entry-client.tsx`.                               |
| `src/entry-client.tsx` | `@pyreon/runtime-dom` mount call.                                                         |
| `src/TodoApp.tsx`      | TodoMVC implementation using canonical `@pyreon/primitives` JSX vocab + explicit imports. |

## Why a separate `TodoApp.tsx` vs the literal same file as native?

The canonical primitive vocabulary (`<Stack>`, `<Inline>`, `<Field>`, `<Button>`, `<Press>`, `<Text>` from `@pyreon/primitives`) needs to be **in lexical scope** for the web TypeScript build — JSX bare references like `<Stack>` compile to `h(Stack, ...)` which requires the symbol resolvable. The native sources skip these imports because the PMTC compiler resolves bare JSX tags via its `canonical-primitives.ts` table at compile time and emits SwiftUI/Kotlin directly; the imports would be no-ops there (treated as type-only).

The native sources kept zero `@pyreon/primitives` imports to keep their surface minimal. The web sibling has near-identical TodoApp.tsx logic with explicit imports added at the top.

**The "literally same .tsx file across all three targets" claim is a Phase D2 follow-up** — it requires a `@pyreon/vite-plugin` JSX-auto-import pass that injects `import { Stack, ... } from '@pyreon/primitives'` for every bare canonical-tag reference. Until that ships, web has its own copy with the imports added. The logic is identical; the only delta is the import header.

## Canonical `<Toggle>` — semantic split across platforms

`<Toggle>` is the canonical binary-toggle primitive. The PMTC compiler emits the right native widget per target:

- Web: `<input type="checkbox">`
- iOS (SwiftUI): `Toggle("", isOn: ...)` — signal binding-projection OR custom `Binding(get:set:)` for parent-owns-state (the TodoRow pattern)
- Android (Compose): `Switch(checked = ..., onCheckedChange = ...)` (NOT `Toggle` — Compose uses `Switch` for the binary toggle)

The non-signal value path (PR #970) routes through SwiftUI's `Binding(get:set:)` so parent-owns-state shapes (TodoRow reading `props.todo.done` + calling `props.onToggle`) work without converting the parent state to a signal.

## What's NOT in Phase D

- **Real-Chromium e2e gate** (Playwright spec asserting click → DOM updates). Verify-modes catches the build emits content; the runtime click contract is a follow-up.
- **JSX-auto-import vite plugin** that would let the web sibling share the literal same `.tsx` file as native. Documented above.
- **Native counter-ios `<Press>` migration** — the existing native counter scaffold doesn't use canonical primitives yet.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
