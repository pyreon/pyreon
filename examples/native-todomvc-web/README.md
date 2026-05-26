# @pyreon/example-native-todomvc-web

> **PRIVATE / EXPERIMENTAL.** PMTC TodoMVC reference rendered on **WEB** via the `@pyreon/primitives` runtime. Sibling of:
>
> - [`examples/native-todomvc-ios/`](../native-todomvc-ios/) — SwiftUI target via PMTC compiler emit
> - [`examples/native-todomvc-android/`](../native-todomvc-android/) — Compose target via PMTC compiler emit
>
> Phase D of the PMTC multiplatform story — proves the canonical primitive vocabulary renders end-to-end on web.

## What this proves

`@pyreon/primitives`' 6 implemented web primitives (`Stack`, `Inline`, `Text`, `Button`, `Press`, `Field`) plus Pyreon's `<For>` / `<Show>` control flow render a non-trivial app (TodoMVC) end-to-end with reactive signals + persistent storage. The `verify-modes` cell `native-todomvc-web × spa` asserts the production build emits expected HTML content.

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
| `src/entry-client.tsx` | `@pyreon/runtime-dom` mount call. |
| `src/TodoApp.tsx` | TodoMVC implementation using canonical `@pyreon/primitives` JSX vocab + explicit imports. |
| `src/shims/Checkbox.tsx` | Transitional `<Checkbox>` shim (see below). |

## Why a separate `TodoApp.tsx` vs the literal same file as native?

The canonical primitive vocabulary (`<Stack>`, `<Inline>`, `<Field>`, `<Button>`, `<Press>`, `<Text>` from `@pyreon/primitives`) needs to be **in lexical scope** for the web TypeScript build — JSX bare references like `<Stack>` compile to `h(Stack, ...)` which requires the symbol resolvable. The native sources skip these imports because the PMTC compiler resolves bare JSX tags via its `canonical-primitives.ts` table at compile time and emits SwiftUI/Kotlin directly; the imports would be no-ops there (treated as type-only).

The native sources kept zero `@pyreon/primitives` imports to keep their surface minimal. The web sibling has near-identical TodoApp.tsx logic with explicit imports added at the top.

**The "literally same .tsx file across all three targets" claim is a Phase D2 follow-up** — it requires a `@pyreon/vite-plugin` JSX-auto-import pass that injects `import { Stack, ... } from '@pyreon/primitives'` for every bare canonical-tag reference. Until that ships, web has its own copy with the imports added. The logic is identical; the only delta is the import header.

## The `<Checkbox>` shim

`<Checkbox>` is the last legacy SwiftUI-flavored tag in the TodoMVC source. The canonical replacement (`<Toggle>`) is semantically split across platforms:

- Web: `<input type="checkbox">`
- SwiftUI: `Toggle`
- Compose: `Switch` (NOT `Toggle`)

So canonical `<Toggle>` needs its own per-target emit function in `@pyreon/compiler-native` — separate scope from Phase D. Until it ships, native TodoMVC uses the legacy `<Checkbox>` JSX tag (resolved by the native compiler to platform-native via its legacy emit), and this web sibling provides the matching DOM rendering via [`src/shims/Checkbox.tsx`](src/shims/Checkbox.tsx).

When canonical `<Toggle>` ships, all three siblings migrate together and the shim deletes.

## What's NOT in Phase D

- **Real-Chromium e2e gate** (Playwright spec asserting click → DOM updates). Verify-modes catches the build emits content; the runtime click contract is a follow-up.
- **JSX-auto-import vite plugin** that would let the web sibling share the literal same `.tsx` file as native. Documented above.
- **Canonical `<Toggle>` per-target emit** — separate arc covering Compose `Switch` vs SwiftUI `Toggle` semantic mapping.
- **Native counter-ios `<Press>` migration** — the existing native counter scaffold doesn't use canonical primitives yet.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
