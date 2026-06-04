# @pyreon/zero-content

## 0.1.0

### Minor Changes

- [#1370](https://github.com/pyreon/pyreon/pull/1370) [`071eb58`](https://github.com/pyreon/pyreon/commit/071eb581908ffde132c52e5c20e6616fab7dafec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/zero-content` — PR 1 of the dogfood-Pyreon-docs plan.

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

- [#1370](https://github.com/pyreon/pyreon/pull/1370) [`071eb58`](https://github.com/pyreon/pyreon/commit/071eb581908ffde132c52e5c20e6616fab7dafec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - zero-content PR 2: Shiki syntax highlighting + custom markdown blocks (callout, code-group).

  Adds the pieces that turn the PR 1 markdown → Pyreon JSX foundation into production-quality content rendering:

  - **Shiki integration** — shared highlighter instance with `github-light` + `github-dark` dual theme baked into every code block. Default language set covers `typescript`/`tsx`/`javascript`/`jsx`/`json`/`bash`/`shell`/`html`/`css`/`scss`/`markdown`/`mdx`/`yaml`/`toml`/`diff`/`text`. Unknown languages fall back to `text` (no throw). Build-time cost only — the SSR output ships pre-rendered HTML.
  - **`:::tip` / `:::warning` / `:::note` / `:::danger` / `:::info`** container directives → `<Callout type="...">` JSX. Title attribute supported via `:::tip{title="..."}`; HTML-special characters in the title get entity-escaped. Body content renders through the full markdown pipeline.
  - **`:::code-group`** container with `[label]` meta on code fences → `<CodeGroup labels={[...]}>` tabbed JSX. SSR ships tab 0 visible; client-side tab switching is a single signal write (CSS class swap, no VNode reconciliation).
  - **New built-in components**: `<Callout>`, `<CodeGroup>`, `<CodeBlock>` exported from `@pyreon/zero-content`. Emit shapes locked by 28 new specs across `callout.test.ts` / `codegroup.test.ts` / `highlighter.test.ts`, all bisect-verified (revert the matching remark plugin / highlighter → each spec fails with the documented assertion).
  - **`compileMarkdown` is now async** — required for Shiki's async `codeToHtml`. `CompileOptions.highlight: false` opts out for tests / quick previews. The Vite plugin's `transform` hook is async.

  122/122 specs passing (75 PR 1 + 28 new + 19 PR 1 specs updated for async). Pipeline now: parse → frontmatter → gfm → directive → callout → codegroup → emit-jsx (with optional Shiki callback).

### Patch Changes

- Updated dependencies [[`7532eae`](https://github.com/pyreon/pyreon/commit/7532eaeff493327bb19f6c2adc94151638d61ceb)]:
  - @pyreon/zero@1.0.0
  - @pyreon/core@1.0.0
  - @pyreon/head@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/router@1.0.0
  - @pyreon/runtime-dom@1.0.0
