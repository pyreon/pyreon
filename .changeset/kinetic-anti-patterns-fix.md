---
"@pyreon/kinetic": patch
"@pyreon/lint": patch
---

Kinetic anti-pattern cleanup + lint rule precision

`@pyreon/kinetic`:

- `nextFrame` (utils.ts): added `typeof requestAnimationFrame === 'undefined'`
  early-return. SSR callers receive `0` instead of crashing — the rule
  recognises the guard and the safety contract becomes explicit.
- `TransitionItem`, `TransitionRenderer`: replaced destructured props
  (`({ show, enter, leave, … }) => …`) with `props.x` access to preserve
  reactive prop tracking. Defaults hoisted out (`const appear = props.appear
  ?? false`).
- Added `vitest.browser.config.ts` + `src/__tests__/kinetic.browser.test.tsx` —
  the package's first real Chromium smoke test. 5 tests covering Transition
  mount/child rendering, signal-driven show/hide, `nextFrame` scheduling,
  `mergeClassNames` filtering, and the `typeof process === 'undefined'` /
  `import.meta.env.DEV === true` checks that confirm the package works in
  a real browser bundle.
- Removed `packages/ui-system/kinetic/` from `PHASE_5_PENDING_PACKAGES` in
  `scripts/check-browser-smoke.ts` (stale now that the smoke test exists).
- Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
  `@pyreon/reactivity`, `@pyreon/runtime-dom` added.

`@pyreon/lint` — `no-bare-signal-in-jsx`:

- Skip allowlist extended to `h` and `cloneVNode` (VNode-producing helpers
  from `@pyreon/core`). Their JSX call sites always produce a VNode, not
  a signal value. Matches `render` (already in the list) from ui-core.

`@pyreon/lint` — `no-window-in-ssr`:

- Safe-context call set extended with `watch` (signal-driven watcher from
  `@pyreon/reactivity`) and `requestAnimationFrame`. Both run their
  callbacks post-mount in a browser, so browser-global reads inside them
  are safe.

4 new bisect-verified regression tests for the rule precision changes.
