---
'@pyreon/head': minor
---

fix(head): `HeadContext` is now one shared Symbol across all sub-entries — fixes `useHead()` tags silently missing from SSG output

**Bug.** `@pyreon/head@0.21.0` shipped four sub-entries (`lib/index.js`, `lib/provider.js`, `lib/use-head.js`, `lib/ssr.js`) AND the shared `@vitus-labs/tools-rolldown` build invokes rolldown ONCE PER SUB-ENTRY (no cross-entry shared chunks). Result: every sub-bundle independently inlined `context.ts` and ran its own `createContext(null)` at module init — each call minted a unique `Symbol.for(...).id`, so a `useContext(HeadContext)` lookup in one bundle (the app's `useHead` from `lib/use-head.js`) silently MISSED a `provide(HeadContext)` from another (e.g. `renderWithHead` from `lib/ssr.js`).

**Real-world symptom (reported):** after bumping to `@pyreon/*@0.21.0`, every `<Meta>`-emitted tag (title, og:*, twitter:*, JSON-LD, robots, canonical) silently vanished from SSG'd HTML on every prerendered page (`dist/index.html`, `dist/resume/index.html`, `dist/404.html`). The styler `<style>` tag from the same `renderWithHead` pipeline still made it through, the baked-in template's static meta still made it through — only `useHead`-registered tags were dropped. Dev was fine because Vite's `bun` condition resolves to a single shared `src/context.ts` (ESM single-evaluation guarantee); the bug only fires against the built `lib/` artifacts.

**Why dev / source-mode tests didn't catch it:** every existing test ran under the `bun` condition where ESM gives us one `HeadContext` for free. The bug is structurally invisible until you load `lib/*.js`. The new `tests/context-identity.test.ts` is the bundle-level gate that locks the contract going forward — see below.

**Fix.** Three coordinated changes:

1. **New `./context` sub-export in `package.json`** — gives `HeadContext` a stable runtime address (`lib/context.js`) every sub-bundle can resolve to.

2. **New `vl-tools.config.mjs`** with `build.external: ['@pyreon/head/context']` — tells rolldown to NOT inline the specifier in any sub-entry's bundle; emit `import { HeadContext } from "@pyreon/head/context"` verbatim instead. At runtime, every importer (every `lib/*.js`) resolves to the same `lib/context.js` module instance → one Symbol → cross-bundle `useContext` lookups work.

3. **Source change — runtime VALUE imports of `HeadContext` / `createHeadContext` now go through the self-package path** `'@pyreon/head/context'` (in `index.ts`, `provider.ts`, `use-head.ts`, `ssr.ts`). Type-only imports keep relative `./context` paths — types erase at build, externalization doesn't apply.

Companion vitest alias in `vitest.shared.ts` so the self-package import resolves to `src/context.ts` under the `bun` condition during dev / test (same pattern as the other 14 sub-path aliases there).

**Coverage.** New `tests/context-identity.test.ts` — 11 structural assertions on the built `lib/`:
- `lib/context.js` is the SINGLE bundle that calls `createContext()` (the source of truth for the Symbol)
- `lib/index.js`, `lib/provider.js`, `lib/use-head.js`, `lib/ssr.js` each have ZERO `createContext` references (it.each, 4 specs)
- All 4 non-context sub-bundles emit `from "@pyreon/head/context"` external imports (it.each, 4 specs)
- `package.json` declares the `./context` sub-export with the right wiring
- `vl-tools.config.mjs` externalizes `@pyreon/head/context`

**Bisect-verified.** Reverting `vl-tools.config.mjs` to empty `external: []` and rebuilding fails 8 of the 11 specs with the exact bug-shape errors (`expected 2 to be +0` — each sub-bundle gets its own `createContext` calls again; `expected false to be true` — no external import). Restored → 6 files / 123 vitest tests + typecheck clean; `@pyreon/server` downstream tests (142/142) unaffected.

**No breaking change** — `./context` is a new sub-export; existing `./`, `./provider`, `./use-head`, `./ssr` paths keep working with identical public APIs. The fix is purely internal bundle reorganization.
