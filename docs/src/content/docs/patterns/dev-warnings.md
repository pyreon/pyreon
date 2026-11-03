---
title: "Dev-mode warnings"
summary: "Gate warnings on bare process.env.NODE_ENV !== 'production', inline. Never typeof process, never import.meta.env.DEV."
seeAlso: [ssr-safe-hooks]
---

# Dev-mode warnings

## The pattern

Gate every dev-only warning, validation, or introspection on a bare `process.env.NODE_ENV !== 'production'` check, written inline at the call site:

```ts
if (process.env.NODE_ENV !== 'production') {
  console.warn('[Pyreon] something sketchy happened')
}
```

Write the check at every site. Do not assign it to a module-level constant (`const __DEV__ = process.env.NODE_ENV !== 'production'`) — see the anti-patterns below.

## Why

Every modern bundler — Vite, Rolldown, Webpack (Next.js), esbuild, Rollup, Parcel, Bun — replaces `process.env.NODE_ENV` with a string literal when it builds for production. The condition becomes `'production' !== 'production'`, i.e. `false`, and the minifier removes the branch. **The warning string, the `console.warn` call, and the whole guarded block are deleted from the production bundle**: rich diagnostics during development, zero overhead in prod.

This is the same convention React, Vue, Preact, Solid, MobX and Redux use, and it works whichever bundler the code is eventually built with — which matters for a library published to npm.

## Anti-patterns

```ts
// BROKEN — dead code in browser bundles
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn('[Pyreon] something sketchy happened')
}
```

Vite does NOT polyfill `process`. In a real browser bundle, `typeof process` evaluates to `'undefined'`, so the gate always fails and the warning never fires. Unit tests pass (vitest has `process` defined in its Node environment), production users get nothing.

```ts
// BROKEN outside Vite — bundler-coupled
if (import.meta.env?.DEV === true) {
  console.warn('[Pyreon] something sketchy happened')
}
```

`import.meta.env.DEV` is a Vite/Rolldown feature. Built with Webpack, esbuild, Rollup, Parcel or Bun, `import.meta.env` is `undefined` and the warning never fires — not even in development.

```ts
// WORSE BUNDLES — the alias defeats tree-shaking in some bundlers
const __DEV__ = process.env.NODE_ENV !== 'production'
if (__DEV__) console.warn('[Pyreon] mount warning')
```

Bun.build and several esbuild configurations do not fold the constant through the alias, so the dev-only strings ship in the production bundle. The inline check folds reliably.

## Related

- Detector: `process-dev-gate` — the MCP `validate` tool flags this automatically
- Lint rule: `pyreon/no-process-dev-gate` (auto-fixes both broken gates to the bare form)
- Reference implementation: `packages/fundamentals/flow/src/layout.ts:warnIgnoredOptions`
