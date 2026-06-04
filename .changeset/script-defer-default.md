---
'@pyreon/head': minor
---

`useHead({ script: [...] })` — non-blocking by default.

Modern web-perf best practice (Lighthouse "Eliminate render-blocking resources" + Core Web Vitals): never emit a `<script src=...>` tag that blocks HTML parsing. Pyreon's `useHead` now adds `defer` to any script tag with `src` and no explicit load strategy.

```tsx
// Before — render-blocking by default:
useHead({ script: [{ src: '/analytics.js' }] })
// → <script src="/analytics.js"></script>  (blocks parser!)

// After — non-blocking by default:
useHead({ script: [{ src: '/analytics.js' }] })
// → <script src="/analytics.js" defer=""></script>
```

**Author overrides ALWAYS win** — no surprises:

| Author input | Result | Rationale |
|---|---|---|
| `{ src: '/x.js' }` | `<script src="/x.js" defer>` | Default — non-blocking |
| `{ src: '/x.js', async: '' }` | `<script src="/x.js" async>` | Preserved — author intent |
| `{ src: '/x.js', defer: '' }` | `<script src="/x.js" defer>` | No duplicate added |
| `{ src: '/x.js', type: 'module' }` | `<script src="/x.js" type="module">` | Modules defer per HTML spec — no extra `defer` needed |
| `{ src: '/imap.js', type: 'importmap' }` | `<script src="/imap.js" type="importmap">` | Importmaps MUST execute synchronously per spec |
| `{ children: 'console.log(1)' }` | `<script>console.log(1)</script>` | Inline scripts unchanged — synchronous by design |
| `useHead({ jsonLd: {...} })` | `<script type="application/ld+json">...` | JSON-LD has explicit type, unaffected |

**Why this is safe**: the default only adds `defer` when ALL three signals are absent (no `type`, no `async`, no `defer`). The four cases where the framework should NOT auto-defer are all author-intentional inputs that opt out by their nature:

1. **`type="module"`** — already deferred per HTML spec
2. **`type="importmap"`** — must execute synchronously
3. **`async`** — author explicitly chose parallel-load
4. **`defer`** — already deferred (no-op)

**Breaking change** for code that legitimately needs render-blocking script loads — vanishingly rare. The escape hatch: pass `type=""` (explicit empty string opts out of the default; the type attr serializes as empty), OR use `dangerouslySetInnerHTML` to write the raw tag.

**7 specs** lock the contract:
- External `src` defaults to `defer` (positive)
- `async` preserved without adding `defer` (override)
- `defer` preserved without duplication (idempotent)
- `type="module"` preserved without `defer` (spec)
- `type="importmap"` preserved without `defer` (spec)
- Inline script (no `src`) not touched (semantic)
- JSON-LD shorthand unaffected (semantic)

**Bisect-verified**: replacing the noLoadStrategy detection with `false` fails the load-bearing positive spec; 6 negative-control specs continue to pass.

23/23 verify-modes • 11/11 validate-fast • typecheck + lint clean.

**Expected production impact**: every Pyreon app that uses `useHead({ script: [...] })` without explicit `defer`/`async` shifts from render-blocking to non-blocking script loads. Lighthouse's "Eliminate render-blocking resources" score is the primary signal that benefits.
