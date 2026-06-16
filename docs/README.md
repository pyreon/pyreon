# @pyreon/docs

Pyreon's documentation site, built on top of `@pyreon/zero` +
`@pyreon/zero-content`. **Dogfoods the framework end-to-end** — the
docs site itself runs on Pyreon's signal-based reactivity, fs-router,
SSG, and content pipeline. Deployed at https://pyreon.dev.

Replaces the legacy VitePress site that previously lived here. The
cutover (delete VitePress, promote the side-by-side preview to
production) landed in the cutover PR.

## Layout

| Path                        | What it holds                                          |
| --------------------------- | ------------------------------------------------------ |
| `src/content/docs/`         | 95+ markdown pages — one per package + patterns       |
| `src/mdx/`                  | Convention-scanned components (PascalCase, used inline in `.md`) |
| `src/components/`           | Layout shells used by `[...slug].tsx`                  |
| `src/routes/`               | fs-router pages — index + catch-all `[...slug].tsx`    |
| `src/styles/`               | docs.css + syntax themes                               |
| `src/examples/`             | Real `.tsx` example components mounted via `<Example>` |
| `content.config.ts`         | `defineCollection({ schema })` declarations            |
| `vite.config.ts`            | Vite + zero + zero-content + last-updated plugin wire  |
| `vite-plugins/`             | `last-updated` (per-page git mtime injection)          |

## Run

```bash
# Dev (localhost)
bun run dev

# Build (writes to dist/, base path default `/`)
bun run build

# Build for production deploy (GitHub Pages at /pyreon/)
bunx vite build --base=/pyreon/

# Preview the build
bun run preview
```

## Authoring

- **New page**: drop a `.md` file under `src/content/docs/<slug>.md`
  with frontmatter (`title`, optional `description`, `since`, etc.).
  The catch-all route `[...slug].tsx` picks it up automatically; the
  sidebar config governs ordering + grouping.
- **Live example**: `<Example file="./examples/<topic>/<slug>" />` in
  any `.md`. The component file lives at
  `src/examples/<topic>/<slug>.tsx` and is a real default-exported
  Pyreon component. Two calls with the same `share="key"` receive the
  SAME `Signal<unknown>` — proving cross-mount reactivity.
- **Code blocks**: every fence is highlighted by Shiki at build time
  using both light + dark themes inlined as a single `<span>` tree —
  the page's `data-theme` swap flips the visible variant via CSS, zero
  JS cost.
- **Callouts**: `:::tip` / `:::warning` / `:::note` / `:::danger` /
  `:::info` container directives → `<Callout type="…">`.
- **Code groups**: `:::code-group` with each child fence carrying
  `[label]` after the language tag.
- **MDX components**: drop a PascalCase `.tsx` file under `src/mdx/`
  and use it in any `.md` by name — zero imports needed (convention
  scan).

## Deploy

GitHub Actions workflow `.github/workflows/docs.yml` builds the site
with `--base=/pyreon/` and uploads the `dist/` to GitHub Pages on
every push to main that touches `docs/**` or any of the framework
packages the docs build transitively depends on.

## Related

- `@pyreon/zero-content` — the markdown → JSX content pipeline
- `@pyreon/zero` — the meta-framework (fs-router + SSG)
- `@pyreon/vite-plugin` — Pyreon's Vite plugin (JSX transform + HMR)
