---
'@pyreon/compiler': minor
---

`@pyreon/compiler` extends the text-child binding fast paths with two additive auto-promotions:

## 1. Text-child selector ternary (companion to className path — PR #898)

```tsx
// Author writes the canonical text-child shape:
<td>{() => isSelected(row.id) ? '✓' : ''}</td>
```

Compiles to `isSelected.subscribe(row.id, (m) => { __t.data = (m ? '✓' : '') })` — the effect-free fast path. Identical bail catalog to the className auto-promotion (only fires when receiver is a known `createSelector()` result, exactly 1 argument, no reactive reads in key or branches).

## 2. Signal-method-call in text bindings

```tsx
// Currency / percentage / case-formatting patterns:
<span>{count().toFixed(2)}</span>
<h2>{title().toUpperCase()}</h2>
<code>{n().toString(16)}</code>
```

Compile to `_bindDirect(count, (v) => { __t.data = v.toFixed(2) })` — skipping the `withTracking` setup + signal lookup per fire. Same structural shape as `_bindText` for bare signal reads, extended to common formatting patterns.

The detector requires:
- Receiver is a zero-arg call to a known signal (tracked via `signalVars`)
- Method is in the pure-primitive safelist (Number / String / Boolean prototype methods proven side-effect-free: `toFixed`, `toExponential`, `toPrecision`, `toString`, `valueOf`, `toUpperCase`, `toLowerCase`, `trim*`, `slice`, `substring`, `substr`, `charAt`, `charCodeAt`, `codePointAt`, `padStart`, `padEnd`, `repeat`, `normalize`, `concat`, `startsWith`, `endsWith`, `includes`, `indexOf`, `lastIndexOf`, `at`)
- Method args contain no reactive reads (would otherwise miss subscriptions)
- Method callee is not computed (`sig()["toFixed"](2)` — too dynamic to prove safe)

## Per-binding alloc reduction

| | Old `_bind(() => …)` | New `.subscribe` / `_bindDirect` |
| --- | --- | --- |
| Allocations | full `renderEffect` machinery (~5) | direct subscription (~2) |
| Per-fire | `withTracking` + signal lookup + Object.is | direct call with pre-resolved value |

Structural — measured at the runtime layer in #897; not visible at `bench:fair` scale (below ~500µs noise floor) but real.

## Dual-backend parity

Both detectors implemented byte-for-byte in JS path (`packages/core/compiler/src/jsx.ts`) and Rust native (`packages/core/compiler/native/src/lib.rs`). 13 new cross-backend equivalence specs lock the parity.

## Test coverage

- 12 JS-path specs in `text-child-selector-promote.test.ts` (canonical shape + bail catalog + deep keys)
- 16 JS-path specs in `signal-method-promote.test.ts` (Number/String/Boolean methods + bail catalog + integration with other detectors)
- 13 cross-backend equivalence specs in `native-equivalence.test.ts` (4 selector + 9 method-call)
- Bisect-verified-with-restore at THREE layers (Rust selector branch, Rust method-call branch, JS path)
- Real-corpus scan: 417 example `.tsx` files, 0 false positives, 0 crashes, 0 byte-divergences (vs main) introduced

## Backwards-compatible

Pure compiler optimization. No runtime API change. Patterns not matched by either detector continue to compile to `_bind(...)` exactly as before.
