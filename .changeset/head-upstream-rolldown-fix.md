---
'@pyreon/head': patch
---

simplify: remove `HeadContext`-dedup workaround now that
`@vitus-labs/tools-rolldown >= 2.4.0` shares chunks across sub-entries

Root-bumped `@vitus-labs/tools-rolldown` from `^2.3.1` to `^2.4.0`. The
upstream tool now emits a shared chunk for modules used by multiple
sub-entries (`lib/_chunks/`), so `context.ts` is automatically hoisted
into the single `lib/context.js` chunk — every other sub-entry's bundle
imports `HeadContext` from it via relative-path `./context.js`,
`createContext(null)` runs exactly once at runtime, and the SSG-meta-
dropped bug is structurally impossible.

Removes the per-package workarounds added in #722:

- `packages/core/head/vl-tools.config.mjs` — deleted (no more
  `external: ['@pyreon/head/context']` rule needed)
- source self-package imports reverted to relative `./context` in
  `index.ts` / `provider.ts` / `use-head.ts` / `ssr.ts` (+ removed the
  rationale comment blocks)
- `vitest.shared.ts` `@pyreon/head/context` alias removed

Kept (legitimate, not workarounds):

- `./context` sub-export in `package.json` — public API surface; users
  can still `import { HeadContext } from '@pyreon/head/context'`
- bundle-level regression test, **rewritten** to assert the new (and
  stronger) invariant: NO file under `lib/` (including `_chunks/*.js`)
  outside `lib/context.js` calls `createContext()`. Locks the bug class
  against any future regression (e.g. downgrade of the build tool).

Verified empirically:
- `lib/context.js : createContext = 2` (THE source of truth)
- `lib/{index,provider,use-head,ssr}.js : createContext = 0` (each)
- `lib/_chunks/use-head-*.js : createContext = 0`
- regression test 6/6 pass on the rebuilt artifacts
