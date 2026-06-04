---
'@pyreon/zero-content': minor
---

New package `@pyreon/zero-content` — PR 1 of the dogfood-Pyreon-docs plan.

Foundation only: package skeleton + the markdown-to-Pyreon-JSX pipeline foundation. Lets users start authoring `.md` files that compile to Pyreon components; later PRs add Shiki (PR 2), MDX components (PR 3), typed content collections (PR 4), search (PR 5), sidebar polish (PR 6).

**Shipped in PR 1:**

- **Package skeleton** mirroring `@pyreon/meta`/`@pyreon/zero` conventions (rolldown build, vitest config, manifest for `gen-docs`, MIT, README)
- **Config helpers**: `defineConfig`, `defineCollection`, `defineComponents`, `mergeComponents` — pass-through factories with type inference + brand-symbol validation. Dev-mode `defineComponents` throws `TypeError` on non-function values (catches `{ Foo: undefined }` typos with the offending key named).
- **Vite plugin** at `@pyreon/zero-content/plugin` (default export). Hooks `transform` on `.md`/`.mdx` files, returns Pyreon JSX. `enforce: 'pre'` so the user's `pyreon()` plugin processes the JSX after.
- **Markdown pipeline** via `unified` + `remark-parse` + `remark-frontmatter` + `gray-matter`:
  - Frontmatter extracted as a plain JS object (zod validation lands in PR 4)
  - mdast → Pyreon JSX string emitter covering heading, paragraph, text, strong, em, inlineCode, code (with `data-lang`), link, list (ul/ol), listItem, blockquote, thematicBreak, image, break, raw html
  - Headings level 2-3 captured into a `headings: Heading[]` export for the TOC rail (PR 6)
  - GFM-style slug generation (matches `markdown-it-anchor` output so existing internal anchors keep working when content ports in PR 7)
  - JSX-sensitive characters escaped (`<`, `>`, `{`, `}`, `&`) so Pyreon's compiler sees literal text, not embedded JSX or expressions
  - Compiled `.tsx` module exports `frontmatter`, `headings`, `slug`, `default` (the page component wrapped in `<article class="content">`)

**Tests + validation:** 75 specs across 4 files:

- `emit-jsx.test.ts` (43 specs) — per-node behavior, slug edge cases, escape edge cases
- `parse.test.ts` (12 specs) — end-to-end markdown → module shape, frontmatter parsing, heading capture, slug derivation incl. Windows paths
- `plugin.test.ts` (8 specs) — plugin contract, `transform` for `.md`/`.mdx`, pass-through for non-markdown
- `config.test.ts` (12 specs) — helper pass-through, `defineComponents` dev-mode validation, `mergeComponents` precedence

**Bisect-verified**: neutering `emitJsx` to return an empty body fails 29 of 75 tests (the markdown-shape assertions); helper-direct tests still pass (validates the slugify/escape/config helpers are independently covered). Restored → 75/75 pass.

**Gates green**: typecheck + lint + 11/11 `validate-fast` + `bundle-budgets` (new entry at 2048 bytes; actual gzipped main entry ~1.57 KB).

**Next**: PR 2 plugs in Shiki + Pyreon themes + `pyreon-remark-callout` / `pyreon-remark-codegroup` plugins, ports `<Callout>` / `<CodeGroup>` from `examples/docs-pyreon`.
