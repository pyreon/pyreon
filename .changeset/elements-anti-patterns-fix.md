---
"@pyreon/elements": patch
"@pyreon/lint": patch
---

Elements anti-pattern cleanup + lint rule precision

`@pyreon/elements`:

- `utils.ts`: replaced `process.env.NODE_ENV !== 'production'` (dead code in
  real Vite browser bundles — `process` is not polyfilled) with the
  tree-shake-friendly `import.meta.env?.DEV` gate. Typed through a narrowing
  interface so downstream packages don't need `vite/client` in their
  tsconfigs to type-check elements transitively.
- `helpers/Wrapper/component.tsx`, `List/component.tsx`: replaced destructured
  props (`({ x, ...rest }) => …`) with `splitProps(props, OWN_KEYS)` to
  preserve reactive prop tracking.
- `Overlay/useOverlay.tsx`: added `typeof window === 'undefined'` early-return
  guards at the entry points of `calcDropdownVertical`/`Horizontal`,
  `calcModalPos`, `getAncestorOffset`, and `setupListeners`. Each function
  is only reachable from a mounted browser context (via event handlers
  registered inside `onMount`), but the rule can't AST-trace that; the
  explicit guard documents the SSR-safety contract at the callsite.
- `devWarn`: rewritten to use the shared `IS_DEVELOPMENT` flag (itself
  gated on `import.meta.env?.DEV`) so it tree-shakes in production.
- Added `packages/ui-system/elements/vitest.browser.config.ts` +
  `src/__tests__/elements.browser.test.tsx` — the package's first real
  Playwright Chromium smoke test. Verifies Element/Portal/Text render into
  real DOM, a reactive text child updates on signal change, and
  `typeof process === 'undefined'` / `import.meta.env.DEV === true` in the
  browser bundle (catching the `typeof process` dead-code class of bug).
- Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
  `@pyreon/reactivity`, `@pyreon/runtime-dom` added to elements.

`@pyreon/lint` — `no-window-in-ssr`:

- Logical-and guards with a typeof-derived const on either side now recognised
  (e.g. `IS_BROWSER && active() ? <Portal target={document.body} /> : null`).
  Short-circuit semantics mean the body only runs when the guard is truthy.

`@pyreon/lint` — `no-bare-signal-in-jsx`:

- Added `render` to the skip allowlist. `render()` from `@pyreon/ui-core` is
  a VNode-producing helper (takes ComponentFn/string/VNode, returns
  VNodeChild), not a signal read — its JSX call sites always produce a
  VNode and don't need `() =>` wrapping.

`@pyreon/lint` — `dev-guard-warnings`:

- Added conventional dev-flag name set (`__DEV__`, `IS_DEV`, `IS_DEVELOPMENT`,
  `isDev`) so imported dev gates (e.g. `import { IS_DEVELOPMENT } from '../utils'`)
  silence `console.warn` warnings inside their guarded branches. Same convention
  basis as the existing `__DEV__` identifier check — the rule can't follow
  cross-module imports to verify the binding resolves to `import.meta.env.DEV`,
  so the name is the contract.
- Also added `VariableDeclaration` tracking for locally-bound dev-flag consts
  (`const x = import.meta.env.DEV === true` or similar).

5 new bisect-verified regression tests for the rule precision improvements.
