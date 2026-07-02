---
'@pyreon/lint': minor
---

Two render-mode DX rules (Tier 2/3 of the zero-modes roadmap):

- `pyreon/missing-get-static-paths` is now renderMode-aware: a dynamic route declaring `export const renderMode = 'ssr' | 'isr' | 'spa'` (literal) is runtime-only/CSR by declaration, so the rule no longer fires on it — killing the false positive in hybrid and SSR apps. A declared `'ssg'` or a computed mode still fires.
- New `pyreon/island-import-from-client` (architecture, warn): flags `import { island } from '@pyreon/server'` — the barrel drags `node:*` + the server singleton into client bundles (duplicate-singleton throw + dual `@pyreon/core` context split at hydration). Fix is universally safe: import from `'@pyreon/server/client'` (or `'@pyreon/zero'`). Server-only files by naming convention (`entry-server.*`, `*.server.*`) are exempt.

Rule count 92 → 93.
