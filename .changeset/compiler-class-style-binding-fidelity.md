---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

Fix reactive `class` and `style` bindings in the compiled template fast path.

The template setter assigned the raw value to `className` / `style.cssText`, so several documented forms were silently broken — only correct through the slower `h()`/`applyProp` path:

- `class={['a', cond() && 'b']}` rendered `class="a,b"` (comma-joined) instead of `"a b"` — the array was never passed through `cx()`.
- `class={{ active: a() }}` rendered `class="[object Object]"`.
- `style={() => ({ color: theme() })}` (the form the docs use) emitted `style.cssText = <object>` → `"[object Object]"` → **no inline styles at all**.
- `style={{ color: theme() }}` applied once via a one-shot `Object.assign` and never updated on signal change; object styles also skipped number→px and stale-key removal.

The compiled paths now match the runtime `applyProp` value-normalization exactly:

- **class** → `typeof v === "string" ? v : _cx(v)` (string passthrough; array/object → `cx`). The injected `cx` import is aliased (`import { cx as _cx }`) so it can't collide with a hand-written component that already imports the public `cx`.
- **style** → delegates to a new `_setStyle` runtime helper (`@pyreon/runtime-dom`, = `applyStyleProp`): string → `cssText`; object → per-property `setProperty` with kebab-casing, number→px, and stale-key removal; dynamic bindings wrapped in a reactive `_bind`.

Fixed byte-identically in both backends (JS + Rust native; locked by the cross-backend equivalence suite) and verified end-to-end with runtime DOM mount specs + a real docs-site build. String class/style emit is behaviourally unchanged. Bisect-verified.
