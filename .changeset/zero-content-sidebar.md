---
'@pyreon/zero-content': minor
---

zero-content PR 6: layout components + frontmatter JSON Schema emission.

Sixth piece of the markdown-driven Pyreon docs story. Adds the two layout components every docs site needs + a frontmatter editor experience (autocomplete + validation in any `.md` file via the YAML extension).

Layers shipped:

- **`<Sidebar>`** (`src/components/Sidebar.tsx`) — reads `frontmatter.sidebar.order` + `frontmatter.sidebar.group` to build a grouped navigation tree. Items without a group fall under an empty bucket rendered first; named groups sort alphabetically. Active-link highlighting via a `currentPath` reactive accessor → router signal flips set `aria-current="page"` + `.pyreon-sidebar__link--active`. Optional `badge` field for "new" / "beta" annotations.
- **`<Toc>`** (`src/components/Toc.tsx`) — page table-of-contents with scroll-spy via `IntersectionObserver`. Renders a flat list of level-2/3 headings (configurable via `minLevel`/`maxLevel`); the currently-in-view heading flips its `aria-current="location"` and applies `.pyreon-toc__link--active`. SSR-safe — when `IntersectionObserver` is undefined, emits the heading list without scroll-spy state. Supports an external `activeSlug` accessor for consumers driving scroll-spy from a router signal.
- **Frontmatter JSON Schema emission** (`src/type-emit/frontmatter-schema.ts`) — writes one `<root>/.pyreon/schemas/<collection>.json` per `pages` collection (a permissive draft-07 schema requiring `title` + recognising `description` / `sidebar.{order,group}`). Wired into the plugin's `configResolved`/`configureServer` paths alongside `content-types.d.ts` emission.
- **`.vscode-settings` snippet** (`writeVscodeSnippetFile`) — produces a `<root>/.pyreon/vscode-settings.json` snippet mapping each generated schema to its content glob via the standard `yaml.schemas` setting. Users copy-paste into their real `.vscode/settings.json` (we never touch their actual settings file).

16 new specs in `src/tests/sidebar-toc.test.ts` (5 for `groupEntries`, 2 for `filterHeadings`, 3 for `defaultPermissiveSchema`, 2 for `renderVscodeSnippet`, 4 for `emitFrontmatterSchemas` + `writeVscodeSnippetFile`).

382/382 specs passing. 11/11 validate-fast gates. typecheck + lint clean. Bundle budget bumped accordingly (Sidebar+Toc+schema emitter adds ~1.3 KB gzipped — well under any caller's perf budget; the layout pieces tree-shake away when unused).

**Browser smoke tests for Sidebar+Toc deferred to PR 7** (docs-pyreon spike) — the spike will exercise both inside a real-Chromium environment so the component-render contract gets locked alongside the layout integration.
