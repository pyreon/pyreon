---
title: Dev-mode warnings
summary: Use import.meta.env?.DEV to gate warnings. Never typeof process.
seeAlso: [ssr-safe-hooks]
---

# Dev-mode warnings

## The pattern

Gate every dev-only warning, validation, or introspection on `import.meta.env?.DEV === true`:

```ts
if (import.meta.env?.DEV === true) {
  console.warn('[pyreon] something sketchy happened')
}
```

For code that runs inside a hot path (a render function, a mount-time hook), pair with a module-level const so the entire branch tree-shakes in production:

```ts
const __DEV__ = import.meta.env?.DEV === true

function mount() {
  if (__DEV__) {
    console.warn('[pyreon] mount warning')
  }
}
```

## Why

Vite (Pyreon's bundler) literal-replaces `import.meta.env.DEV` at build time — `true` in dev, `false` in prod — then its tree-shaker removes the dead branch. **The warning string, the `console.warn` call, and the entire guarded block are deleted from the production bundle**, which is exactly what you want: rich diagnostics during development, zero overhead in prod.

Vitest (the test runner) sets `import.meta.env.DEV` to `true` automatically, so unit tests can still observe the warnings if they want to.

## Anti-pattern

```ts
// BROKEN — dead code in browser bundles
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn('[pyreon] something sketchy happened')
}
```

Vite does NOT polyfill `process`. In a real browser bundle, `typeof process` evaluates to `'undefined'`, so the gate always fails and the warning never fires. Unit tests pass (vitest has `process` defined in its Node environment), production users get nothing. This is the exact failure mode PR #200 fixed across 12 files.

## Related

- Detector: `process-dev-gate` — the MCP `validate` tool flags this automatically
- Lint rule: `pyreon/no-process-dev-gate` (auto-fixable)
- Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`
- Anti-pattern: `typeof process !== 'undefined'` for dev-mode warnings
