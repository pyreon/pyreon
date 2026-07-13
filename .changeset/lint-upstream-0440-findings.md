---
"@pyreon/lint": patch
"@pyreon/code": patch
"@pyreon/flow": patch
"@pyreon/rich-text": patch
---

Harden `@pyreon/lint` from the upstream 0.44.0 findings — three detection
bugs and five rule-precision fixes:

**Detection correctness**

- **`no-props-destructure` (LT-2)** now also catches the BODY form
  (`function C(props) { const { a } = props }`), not just the signature form —
  the exact reactivity bug the rule exists to prevent. Ports the compiler's
  `detectPropsDestructuredBody` (conservative: only a bare `= props` at the
  component top scope; never descends into nested handlers/effects).
- **`no-unbatched-updates` (LT-3)** no longer (A) sums `.set()` across `await`
  boundaries (`batch()` can't span an `await`, so those are separate microtask
  segments) nor (B) counts non-signal `.set()` on a `Map`/`URLSearchParams`/etc.
- **`no-window-in-ssr` (LT-4)** no longer (2) fires on a same-expression
  `typeof window !== 'undefined' && window.x` guard, nor (3) flags a local
  `const history = …` as `window.history` (it now tracks the shadow).

**Rule precision** — style/precision preferences that fired (or gated, under
`strict`/`lib`) on correct code are now opt-in and reworded:

- **`no-and-conditional` / `no-ternary-conditional` (LR-2)** — the compiler
  lowers `&&`/ternary and `<Show>` to the same reactive `_mountSlot` accessor,
  so they mount/swap/unmount identically; dropped the false "more efficient"
  claim and made them `optIn`.
- **`no-bare-signal-in-jsx` (LR-1)** — `optIn` (matches its "Opt-in."
  description; it can't tell a signal from a pure formatter).
- **`prefer-show-over-display` (LR-4)** — message now acknowledges `display`
  toggling is a legitimate SSR-safe (stable-tree) technique; `optIn`.
- **`no-theme-outside-provider` (LR-9)** — `optIn`; cross-file context is the
  point of `useTheme()`.
- **`overlay-a11y` (LR-10)** — accepts `<Overlay type="dialog|…">` as
  satisfying a11y (the component derives ARIA from `type`).

**Framework consistency** — the new `no-props-destructure` body-form check
surfaced 7 body-destructures in `@pyreon/code`/`@pyreon/flow`/`@pyreon/rich-text`
static components; converted them to plain `const x = props.x` reads (the
compiler reactively inlines these at JSX use sites — behavior-preserving, and
the framework now follows its own rule).
