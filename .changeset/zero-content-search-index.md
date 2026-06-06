---
'@pyreon/zero-content': patch
---

feat(zero-content): wire build-time search index emission

The plugin now writes `dist/search-index.json` (catalog) +
`dist/search-index-<collection>.json` (per-collection chunk) during the
build's `closeBundle` hook — closing the long-standing `// PR 5: search
index emission` TODO at the top of `src/plugin.ts`.

Per-collection entries are accumulated by `transform()` for every
`.md` / `.mdx` file under a collection's path. The body text is
extracted via the existing `stripMarkdown` helper (strips code fences,
HTML tags, link syntax, headings, emphasis); title comes from
frontmatter; headings from the markdown pipeline result. Searchable
collections (default for `type: 'pages'`) get an index entry; opt out
with `searchable: false` on the collection definition.

The runtime `<Search>` component from `@pyreon/zero-content/search`
already fetches `/search-index.json` lazily on first Cmd+K open — this
PR closes the build side so the fetch resolves instead of 404'ing.

Per-build state cleared in `buildStart` so dev → build doesn't leak
stale dev-mode entries; SSG sub-builds also skip (gated on
`resolvedConfig.command === 'build'`).
