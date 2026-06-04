---
'@pyreon/zero-content': minor
---

zero-content PR 2: Shiki syntax highlighting + custom markdown blocks (callout, code-group).

Adds the pieces that turn the PR 1 markdown → Pyreon JSX foundation into production-quality content rendering:

- **Shiki integration** — shared highlighter instance with `github-light` + `github-dark` dual theme baked into every code block. Default language set covers `typescript`/`tsx`/`javascript`/`jsx`/`json`/`bash`/`shell`/`html`/`css`/`scss`/`markdown`/`mdx`/`yaml`/`toml`/`diff`/`text`. Unknown languages fall back to `text` (no throw). Build-time cost only — the SSR output ships pre-rendered HTML.
- **`:::tip` / `:::warning` / `:::note` / `:::danger` / `:::info`** container directives → `<Callout type="...">` JSX. Title attribute supported via `:::tip{title="..."}`; HTML-special characters in the title get entity-escaped. Body content renders through the full markdown pipeline.
- **`:::code-group`** container with `[label]` meta on code fences → `<CodeGroup labels={[...]}>` tabbed JSX. SSR ships tab 0 visible; client-side tab switching is a single signal write (CSS class swap, no VNode reconciliation).
- **New built-in components**: `<Callout>`, `<CodeGroup>`, `<CodeBlock>` exported from `@pyreon/zero-content`. Emit shapes locked by 28 new specs across `callout.test.ts` / `codegroup.test.ts` / `highlighter.test.ts`, all bisect-verified (revert the matching remark plugin / highlighter → each spec fails with the documented assertion).
- **`compileMarkdown` is now async** — required for Shiki's async `codeToHtml`. `CompileOptions.highlight: false` opts out for tests / quick previews. The Vite plugin's `transform` hook is async.

122/122 specs passing (75 PR 1 + 28 new + 19 PR 1 specs updated for async). Pipeline now: parse → frontmatter → gfm → directive → callout → codegroup → emit-jsx (with optional Shiki callback).
