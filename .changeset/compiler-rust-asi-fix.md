---
"@pyreon/compiler": patch
---

Mirror the JS-fallback ASI fix from PR #420 into the Rust native backend. The Rust path's `_tpl(...)` callback body emission joined `bind_lines` with bare `\n` — same shape that broke the JS path before #420. JS's ASI doesn't insert `;` when the next line starts with `(`, so two emitted lines:

```js
const __e0 = __root.children[N]
((el) => { x = el })(__e0)
```

merged into one expression at parse time:

```js
const __e0 = __root.children[N]((el) => { x = el })(__e0)
```

— calling `children[N]` as a function with the arrow as argument and self-referencing `__e0` before assignment. Crashes at runtime with `TypeError: __root.children[N] is not a function`.

Fix: append `;` to every bind line in `format_template` (`packages/core/compiler/native/src/lib.rs`). Mirror of the JS fix at `packages/core/compiler/src/jsx.ts`.

Bisect-verified locally: rebuilt the Rust binary against this change and ran the cross-backend equivalence suite — 143 prior divergences resolved, leaving 6 pre-existing edge-case differences (whitespace handling, `<!>` placeholder emission) that were not caused by this fix and predate the JS-side fix in #420. Added a new equivalence test `block-arrow ref on child element with adjacent reactive prop` that runs the exact JSX shape that triggered the original crash through both backends and asserts identical output.

The Rust binary is not built in CI today, so this change has no consumer-facing impact until the binary ships with the package — but consumers that build the binary themselves (or any future CI step that does) get the same fix the JS path already had.
