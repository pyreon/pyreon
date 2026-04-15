---
"@pyreon/zero": patch
"@pyreon/lint": patch
---

Zero meta-framework anti-pattern cleanup + lint rule precision

`@pyreon/zero`:

- `link.tsx` `doPrefetch`: added `typeof document === 'undefined'` early-return.
  Prefetch only fires from browser-mounted Link interactions but the explicit
  guard documents the SSR-safety contract.
- `client.ts` `startClient`: added `typeof document === 'undefined' → throw`
  early-return. Browser entry point hard-fails in SSR with a clearer error
  than `document is not defined`.
- `script.tsx` `loadScript`: typeof-document early-return at function entry
  (the function is only invoked from `onMount` but the rule can't
  AST-trace the indirect call).
- Error prefix normalisation: `[zero]` / `[zero:adapter]` / `[zero:image]` /
  etc. → `[Pyreon]` across 9 source files. Test assertions updated.
- `font.ts`: added `[Pyreon] ` prefix to two `Failed to fetch / download`
  errors.

`@pyreon/lint`:

- `no-window-in-ssr` and `no-dom-in-setup`: early-return-guard heuristic
  now recognises `throw` as a function-terminating statement (in addition
  to `return`). Common in entry-point functions like `startClient` that
  hard-fail in SSR rather than silently no-op.
- `no-dom-in-setup`: added the same early-return-on-typeof-document/window
  guard tracking that `no-window-in-ssr` already had — `if (typeof document
  === 'undefined') return …` at function head implicitly guards the rest
  of the body for both rules now.
- `BROWSER_GLOBALS`: removed `fetch`. It's a universal global in Node 18+,
  Bun, Deno, browsers, and edge runtimes. Code using `fetch` isn't
  browser-specific. (`XMLHttpRequest` and `WebSocket` remain DOM-only.)

5 new bisect-verified regression tests for the rule changes.
