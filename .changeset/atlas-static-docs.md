---
'@pyreon/atlas': minor
---

`atlas build` — compile the workbench into a static, deployable docs site.

`atlas dev` needs a checkout and a running Node process; a design system needs a
URL. `atlas build` emits one as plain files for Pages / Netlify / Cloudflare /
S3, with no server component. `--out`, `--title`, and `--base` (for a
subdirectory deploy).

The part that is not just `vite build`: two of the workbench's panels — the Docs
source block and the Reactivity Lens — are answered by Node over the dev-server
RPC channel, because they read files and run the TypeScript compiler API. A
naive build produces a site that *looks* complete while both sit dark forever.
So the build precomputes those answers per component and ships them as data;
the Lens still reports real per-expression `live` / `static` verdicts on a fully
static page. An answer that genuinely cannot be computed bakes its REASON, so
the panel states what is wrong instead of surfacing a network error about a
request that was never going to work.

Also new in `atlas.config.ts`:

- `title` — names the site (browser tab + workbench chrome). `atlas dev` reads
  the same value, so the workbench and the deployed site cannot end up named
  differently; `--title` wins over both.
- `pages` — per-component presentation: `title` (display label), `group`,
  `order`, `summary`. Presentation only — the component's real `name` is never
  overridden, because that is what the usage snippet writes, what the
  source/Lens lookup keys on, and what an agent imports. `order` pins within a
  group and leaves everything unordered in discovery order, so one config line
  cannot reshuffle a sidebar.

Internal: the "which components belong in the catalog" filter now has one owner
shared by `atlas dev` and `atlas build`, rather than one implementation per
caller that could diverge.

Not included: building one site from several packages in a monorepo. The catalog
graph is keyed by component name alone, so two packages exporting a `Button`
would silently collapse into one; that needs a keyed graph, not a config flag.
