---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

Dev-mode diagnostics for three silent-failure shapes reported from a production app:

- **`_bindText` VNode-coercion warning (PZ-02)**: a VNode / NativeItem (or an array containing one) String()-coerced into a text binding — the `[object Object]` inline-JSX-helper shape (`<td>{props.getContent()}</td>`), which SSR renders correctly (so it's also a hydration mismatch) — now warns ONCE per binding in dev with extract-a-component guidance. Covers both `_bindText` paths (signal fast path + bare-callable fallback); compiler-emitted raw `__t0.data = expr` assignments are not hookable at runtime.
- **`_bindText` function-coercion warning (PZ-05)**: a raw FUNCTION about to be stringified to its source text in a text position (e.g. an accessor neutralized by an `as never` cast) now warns in dev. The check targets the RESULT value only — legitimate callable sources are untouched.
- **Setup-throw reactive-prop diagnosis (PZ-10)**: when a component setup throws `TypeError: X is not a function` AND `X` is a getter-backed (compiler-auto-unwrapped) reactive prop, the mount catch appends a dev diagnosis explaining that `props.X` is already the VALUE, with the explicit-arrow escape hatch. Printed to the console and the dev error overlay.
- **Diagnose catalog** (`@pyreon/compiler/diagnose`): the generic `"X is not a function"` entry now teaches BOTH causes (signal-not-called AND reactive-prop auto-unwrap — the old entry's "call it: X()" advice was actively wrong for the prop shape); new entry for `[object Object]`-in-text reports teaching the extract-a-component fix.

All warnings use the bare `process.env.NODE_ENV !== 'production'` gate and tree-shake to zero bytes in production bundles (locked by the bundle-level tree-shake gate). Zero prod-path allocations. Also fixes the stale `@pyreon/runtime-dom` manifest claim that a "raw-signal-as-child" warning exists (it never did) and that dev warnings use `import.meta.env.DEV` (they use the bundler-agnostic bare gate).
