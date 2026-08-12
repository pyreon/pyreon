---
"@pyreon/styler": patch
---

fix(styler): preserve reactive props through `filterProps`, and never lose the streaming-SSR `@layer` ordering statement

Two correctness fixes surfaced by a styler audit:

- **`filterProps` value-copied** (`filtered[key] = props[key]`), firing a getter-shaped reactive `_rp` prop (what the compiler emits for `<X title={sig()} />`) at copy time and freezing it — silently killing reactivity for any consumer using this public helper to forward props. It now descriptor-copies (mirrors the internal `buildProps.copyDescriptor`), which is also what the manifest documents it as doing. Static props are unaffected.

- **Streaming SSR `@layer` ordering** (`flushSSRPending`) emitted the `@layer elements, rocketstyle;` order statement only on the FIRST flush of a stream. A stream whose opening Suspense boundary flushed only keyframes/global CSS (neither is a layered rule) emitted it nowhere, and if a later boundary carried the first layered rule its cascade fell to stream first-appearance order — risking an `elements`-beats-`rocketstyle` inversion. The statement is now deferred (via a persistent per-stream flag) to the first flush that actually carries a layered rule, so it precedes that rule. A configured custom `layer` still decides upfront (unchanged).

Both bisect-verified; full `@pyreon/styler` suite (607) green.
