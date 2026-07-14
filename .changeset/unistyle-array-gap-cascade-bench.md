---
"@pyreon/unistyle": patch
---

fix(unistyle): mobile-first array gaps now inherit the previous breakpoint (skip), not the last element

- **A `null`/`undefined` slot in a mobile-first array is a SKIP** — it now inherits the PREVIOUS breakpoint's value (mobile-first `min-width` cascade), matching a breakpoint object with a missing key and styled-system / theme-ui. The prior `handleArrayCb` did `arr[i] ?? arr[arr.length - 1]`, which filled EVERY gap with the LAST array element:
  - `color: ['red', null, 'blue']` turned blue at `sm` instead of `md` — one breakpoint too early (a user-visible wrong-color bug), and
  - `[a, null, b, null, null]` (trailing element `null`) dropped interior gaps to `null`.

  Arrays and breakpoint objects of the same shape now normalize identically. The trailing-fill contract (an array shorter than the breakpoint list fills the remaining breakpoints with its last element — `[8, 12]` → `md`/`lg`/`xl` all `12`) is unchanged, and `0` / `false` are preserved as real values (never treated as gaps).

- **Docs accuracy**: the `value()` API doc was flatly wrong (signature claimed a `fallback` second param + a `{ value, unit }` return; examples claimed `value(16)` → `'16px'` / a "small→rem, large→px" convention). `value()` divides a unitless number by `rootSize` and emits `rem` (`value(16)` → `'1rem'`); `px` strings convert to rem; other-unit and non-numeric strings (`calc()`/`var()`) pass through verbatim. Corrected across the manifest (MCP/llms), the docs-site `value()` section, and `stripUnit`'s tuple form.

No public API changes. Adds an internal responsive-resolution throughput benchmark at `scripts/bench/core/unistyle.ts` (`styles()` flat / cold scalar·array·object resolve / render-cache hit / delta pass) with a correctness gate and median + 95% CI; the render-cache verbatim-return hit measures ~60× the cold breakpoint-object resolve.
