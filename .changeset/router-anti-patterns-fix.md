---
"@pyreon/router": patch
"@pyreon/lint": patch
---

Router anti-pattern cleanup + lint rule precision

`@pyreon/router`:

- `ScrollManager.save()` / `_applyResult()`: added `typeof window === 'undefined'`
  early-return guards so the SSR-safety contract is explicit at the method
  entry instead of relying on callers to pre-check.
- `useBlocker`: replaced bare `if (beforeUnloadHandler)` guards with
  `if (_isBrowser && beforeUnloadHandler)` — same runtime behaviour (the
  handler is non-null only when `_isBrowser` is true), but links the check
  back to the typeof-derived const so `no-window-in-ssr` can prove the
  body is browser-safe.
- `destroy()`: same pattern for `_popstateHandler` / `_hashchangeHandler`.
- Error prefix normalised: `[pyreon-router]` → `[Pyreon]` (matches the
  `no-error-without-prefix` rule + the rest of the framework).

`@pyreon/lint` — `no-window-in-ssr`:

- Parameter-shadowing: identifiers like `location`/`history`/`navigator`
  that are FUNCTION PARAMETERS (or destructured parameter patterns) no
  longer false-positive as browser-global references. E.g. `router.push`
  takes a `location` parameter — inside its body, every `location`
  references the parameter, not `window.location`.
- Typeof-derived `&&` chains in const bindings: `const useVT = _isBrowser
  && meta && typeof document.startViewTransition === 'function'` now
  registers `useVT` as typeof-bound, so `if (useVT) { document.X }` is
  recognised as guarded.

`@pyreon/lint` — `no-imperative-navigate-in-render`:

- Full rewrite of the safe-context detection. Previously only recognised
  `onMount`/`effect`/`onUnmount` call callbacks as safe — this false-fired
  on `router.push()` inside any locally-declared event handler
  (`const handleClick = (e) => router.push(...)`). Now tracks a
  `nestedFnDepth` counter across ALL nested functions inside a component
  body, so any nested ArrowFn/FunctionExpression is treated as deferred
  execution. Fires only on direct-in-render-body imperative navigation —
  which is the actual bug the rule is designed to catch.

`@pyreon/lint` — `no-dom-in-setup`:

- Extended safe-context set: now includes `onUnmount`, `onCleanup`,
  `renderEffect`, and `requestAnimationFrame`. `document.querySelector`
  inside a `requestAnimationFrame` callback is guaranteed to run in a
  browser frame post-setup, so it doesn't warrant the setup-phase warning.

9 new bisect-verified regression tests for the three rule precision
improvements.
