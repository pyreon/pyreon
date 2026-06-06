---
'@pyreon/zero-content': patch
---

PR-A audit follow-ups — "fix-the-claims-and-silent-failures". Twelve items from the three-audit synthesis (architecture + perf/memory + DX). Bisect-verified at every layer.

**Correctness (critical):**

- **C4 — `defineComponents` brand is now runtime-enforced** (was type-only). The manifest promised the plugin refuses raw `{...}` objects with a clear build error; pre-fix no runtime check ever fired. `defineComponents` + `mergeComponents` stamp a non-enumerable `COMPONENTS_BRAND` symbol; `validateConfigShape` (called from `loadConfig`) rejects raw object literals on both top-level `components:` and per-collection `components:` fields with an actionable fix hint. Validation is no longer `__DEV__`-gated — a production-mode CI build no longer silently accepts `{ Foo: undefined }` typos.
- **C9 — unclosed `:::tip` fence heuristic.** When a callout body extends near the file end (within 3 lines) with many headings (≥2) or many children (≥30), `remark-callout` emits a non-fatal warning the Vite plugin pipes through `this.warn(...)`. Pre-fix `:::tip` without a matching `:::` silently consumed the rest of the file.
- **C10 — Shiki highlighter cache invalidates on `opts` change.** The first call's themes/langs used to be sticky for the process lifetime — a `theme: 'pyreon-dark'` edit in `content.config.ts` was ignored until full restart. Now the cached instance is keyed on a stable, order-independent JSON-string of `opts`; mismatched calls dispose the old instance and rebuild.

**Correctness (high):**

- **H5 — error path labels are Vite-root-relative.** `shortId` stripped to the last `/src/` segment, which broke click-to-open in monorepos with multiple `src/` directories. New `reportPath` emits `./packages/foo/src/content/docs/zero.md` (clickable in IDEs + terminals). Falls back to the legacy `shortId` when root isn't captured yet (config-load edge case).
- **H6 — `:::warn` typo gets a `did-you-mean…?` hint.** Ratio-bound Levenshtein (≤ 50% of the longer string) — catches `warn` → `warning` (3 / 7), `not` → `note` (1 / 4); rejects noise like `qux` → `tip` (3 / 3).

**Drift locks (low — single source of truth):**

- **L10 — built-in components list deduped** into `src/_shared/built-ins.ts` (frozen, alphabetical). Scanner + validator both import; can't drift on contents or order.
- **L11 — slug derivation deduped** into `src/_shared/derive-slug.ts`. `slugFromPath` is the shared primitive; `pipeline/parse.ts:deriveSlug` and the virtual-module's emitted `__zcSlug` both reduce to it via different prefix-stripping strategies (their contracts are different, but the index-collapse / extension-strip / Windows-normalise logic is one source).
- **L12 — MiniSearch options deduped** into `src/_shared/minisearch-options.ts`. Both build-time `index-builder` and runtime `search-runtime` consume the same `MINISEARCH_OPTIONS` so `loadJSON`'s field-ref + scoring contract stays consistent.

**Docs (low):**

- **C1 + L1 + L14** — README rewritten: drops the false `import { z }` claim (the package doesn't re-export zod; BYO Standard Schema validator), names the `private: true` install caveat, adds a Conventions table covering every path/filename the plugin treats specially.
- **L5** — PR-N tracking comments in `plugin.ts` replaced with a Responsibilities block.
- Manifest's `defineConfig` description + mistakes list rewritten to lead with "BYO validator".

**Tests (bisect-verified):**

- `_shared-drift-lock.test.ts` — 6 specs locking L10 + L11 + L12.
- `_callout-diagnostics.test.ts` — 13 specs locking C9 + H5 + H6.
- `_components-brand.test.ts` — 8 specs locking C4.
- 3 new C10 regression specs in `highlighter.test.ts`.

Total: 434 specs pass (was 404). Each new fix bisect-verified by stashing the corresponding shared module — the matching specs fail loudly, restored → all pass.
