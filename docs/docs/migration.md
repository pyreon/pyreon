# Migration Guide

## Pyreon v0.X+ — Singleton enforcement for `@pyreon/*` packages

### What changed

Every `@pyreon/*` package with module-level state now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. If the same package gets loaded TWICE in the same JS heap from two different resolved paths, the second registration throws:

```
[Pyreon] Multiple instances of @pyreon/router detected.

This breaks the framework's contracts (reactivity, lifecycle hooks, context).
Two distinct module instances of the same package were loaded in this heap:

  Instance A: file:///app/node_modules/@pyreon/router/lib/index.js (version 0.24.0)
  Instance B: file:///app/node_modules/zero/node_modules/@pyreon/router/lib/index.js (version 0.22.0)

Likely causes:
  1. Sub-dependency pinned an older @pyreon/* version → npm/bun hoisted two copies.
  2. Your bundler's resolver loaded the package via two different paths (Vite's [bare] vs [package entry] resolvers).
  3. A workspace + npm-published mix (monorepo importing both).

Fix:
  Vite:    @pyreon/vite-plugin injects resolve.dedupe automatically. If you have a custom Vite config, ensure resolve.dedupe includes ['@pyreon/*'].
  Webpack: Use resolve.alias to force a single resolution path.
  Diagnostic: Run 'pyreon doctor --check-dedup' to identify duplicates in your lockfile.
  npm:     Check 'npm ls @pyreon/*' for version conflicts.
  bun:     Check 'bun pm ls' for version conflicts.

Set PYREON_SINGLE_INSTANCE=warn to demote this to a warning (NOT recommended — your app's reactivity will be broken).
Set PYREON_SINGLE_INSTANCE=silent to disable detection entirely (only for browser extensions / micro-frontends where dual loading is intentional).
```

### Why this change

Apps with silently-tolerated `@pyreon/*` duplicates today HAVE A BUG TODAY — their reactivity is silently broken in some code paths even if the app appears to work. The old γ approach (`defineCrossModuleState`) papered over the bug by sharing state via `globalThis`. The new architecture eliminates the bug class instead:

| Layer | Mechanism | Effect |
| --- | --- | --- |
| **Bundler prevention** | `@pyreon/vite-plugin` `resolve.dedupe` (default-on, walks `node_modules/@pyreon` for the full transitive set) | Most consumers never see the sentinel because Vite resolves every `@pyreon/*` import to one copy automatically |
| **Runtime detection** | `registerSingleton` in every `@pyreon/*` package | Anything dedupe misses (non-Vite bundler, intentional dual-load) throws fail-loud at startup |
| **Static analysis** | `pyreon doctor --check-dedup` | CI gate that surfaces duplicate lockfile entries before they reach production |
| **Escape hatches** | `PYREON_SINGLE_INSTANCE={warn,silent}` | Documented mitigation for production apps mid-migration; legitimate dual-load (browser extensions, micro-frontends) opts out explicitly |

### Immediate mitigation (production-safe)

If your app surprise-throws after upgrading and you need it back online RIGHT NOW:

```bash
# Node / SSR / Bun
export PYREON_SINGLE_INSTANCE=warn

# Browser (set BEFORE any @pyreon/* import — e.g. in your entry HTML)
<script>window.process = { env: { PYREON_SINGLE_INSTANCE: 'warn' } }</script>
```

`warn` demotes the throw to a `console.error`. The app loads. Your reactivity IS still broken in some code paths — fix the underlying duplicate ASAP, then unset the env var.

### Diagnose the duplicate

```bash
# Best — uses the same lockfile parser the CI gate uses
pyreon doctor --check-dedup

# Bun
bun pm ls | grep @pyreon

# npm
npm ls @pyreon/*

# pnpm
pnpm ls @pyreon/* --depth 99
```

For any `@pyreon/*` listed with more than one version, identify which dep pinned the older version and bump it.

### Fix the duplicate

#### Bun / pnpm

```jsonc
// package.json
{
  "overrides": {
    "@pyreon/router": "^0.24.0"
  }
}
```

Then `bun install` (or `pnpm install`) — the override forces every transitive consumer to use the pinned version.

#### npm

```jsonc
// package.json
{
  "overrides": {
    "@pyreon/router": "^0.24.0"
  }
}
```

Then `npm install`.

#### Yarn 3+

```jsonc
// package.json
{
  "resolutions": {
    "@pyreon/router": "^0.24.0"
  }
}
```

Then `yarn install`.

#### Workspace projects

Ensure every internal consumer uses `workspace:^` (or `workspace:*`) for `@pyreon/*` deps — never a literal version. Workspace resolutions never duplicate.

### Non-Vite bundlers

`@pyreon/vite-plugin` injects `resolve.dedupe` automatically — Vite users are covered. For other bundlers you need the equivalent config manually:

**Webpack / Next.js**:
```js
// next.config.js or webpack.config.js
module.exports = {
  resolve: {
    alias: {
      '@pyreon/router': require.resolve('@pyreon/router'),
      '@pyreon/core':   require.resolve('@pyreon/core'),
      // ... one alias per @pyreon/* you use
    },
  },
}
```

**Rollup** (`@rollup/plugin-node-resolve`):
```js
import resolve from '@rollup/plugin-node-resolve'

export default {
  plugins: [
    resolve({
      dedupe: ['@pyreon/router', '@pyreon/core', /* ... */],
    }),
  ],
}
```

**esbuild**: no native dedupe — use a plugin or rely on symlinks.

### Legitimate dual-load scenarios

Some scenarios MUST dual-load `@pyreon/*` packages and that's correct:

- **Browser extensions**: content script + service worker each load their own copy.
- **Micro-frontends**: multiple apps share a parent page in iframes (each iframe is its own heap, but parent-injected modules can cross).
- **Nested Vite SSR**: tools like `rocketstyle-collapse` spin a child SSR server bound to the consumer's `vite.config`.

For these cases, scope `PYREON_SINGLE_INSTANCE=silent` to the narrowest async window possible. The reference implementation in `packages/tools/vite-plugin/src/rocketstyle-collapse.ts:load()` shows the pattern:

```ts
const prevEnv = process.env.PYREON_SINGLE_INSTANCE
process.env.PYREON_SINGLE_INSTANCE = 'silent'
try {
  return (await server.ssrLoadModule(spec)) as Record<string, unknown>
} finally {
  if (prevEnv === undefined) delete process.env.PYREON_SINGLE_INSTANCE
  else process.env.PYREON_SINGLE_INSTANCE = prevEnv
}
```

Setting the env var globally (process-wide, not scoped) silences the sentinel for ALL `@pyreon/*` loads in the process — including unintended duplicates that should still throw.

### `defineCrossModuleState` helper status

`defineCrossModuleState(key, init)` from `@pyreon/reactivity` STAYS exported and re-exported from `@pyreon/core` — but it is **no longer the framework contract**. It is repositioned as an opt-in escape hatch for **HMR state survival** (state that needs to persist across module re-evaluation in dev, like a long-running game's score or a wizard's step). It is NOT the right tool for framework module-level state — use plain `let _foo = …` for that and let the sentinel + dedupe enforce uniqueness.

### Rollback safety

The architecture is fully revertable per the plan (`.claude/plans/jaunty-herding-kazoo.md`):

- **Sentinel false positives in canary** → `PYREON_SINGLE_INSTANCE=warn` mitigates immediately (no code release).
- **Dedupe breaks a consumer app** → `PYREON_DISABLE_DEDUPE=1` mitigates immediately.
- **Code rollback** → each PR (A, B, D, E, F) is independently revertable.

### References

- Plan: `.claude/plans/jaunty-herding-kazoo.md`
- Sentinel implementation: `packages/core/reactivity/src/singleton-sentinel.ts`
- Sentinel contract tests: `packages/core/reactivity/src/tests/singleton-sentinel.test.ts`
- Dedupe injection: `packages/tools/vite-plugin/src/index.ts`
- Doctor gate: `packages/tools/cli/src/doctor/gates/check-dedup.ts`
