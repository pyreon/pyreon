# docs-zero — production cut-over plan

This document spells out the EXACT sequence to flip
`https://pyreon.github.io/pyreon/` from the VitePress build (`docs/`)
to the docs-zero build (`examples/docs-zero/`).

## State going into cut-over

- ✅ PR #1391 — content + components + visual parity (91 pages,
  9 Vue components ported, visual identity matched)
- ✅ PR #1392 — landing page + 404 page
- ✅ PR #1393 (this PR) — side-by-side preview deploy + e2e gate +
  Lighthouse comparison + cut-over workflow

## The side-by-side bake (THIS PR's workflow)

`.github/workflows/docs-zero-preview.yml` ships in this PR and is
**already running** on every `main` push that touches
`examples/docs-zero/**` or `packages/zero/zero-content/**`.

- Production VitePress site keeps serving at
  `https://pyreon.github.io/pyreon/`
- The new docs-zero build is deployed alongside it at
  `https://pyreon.github.io/pyreon/preview/`
- Both run for **at least 7 days** before cut-over so analytics +
  user reports surface any regressions

## Cut-over PR

When the bake period is complete and the gates below are green, ship
a small follow-up PR that:

### 1. Renames `docs/` → `docs.vitepress.bak/`

Keep the old site source on git for a release cycle in case rollback
is needed. The `docs.vitepress.bak/` directory is gitignored from any
build hooks (the path filter changes too).

### 2. Replaces `.github/workflows/docs.yml`

```yaml
# OLD path filter:
on:
  push:
    branches: [main]
    paths:
      - 'docs/**'

# NEW path filter:
on:
  push:
    branches: [main]
    paths:
      - 'examples/docs-zero/**'
      - 'packages/zero/zero-content/**'

# OLD build step:
- run: cd docs && bun install --frozen-lockfile
- run: cd docs && bun run build
- uses: actions/upload-pages-artifact@...
  with:
    path: docs/.vitepress/dist

# NEW build step:
- run: bun install --frozen-lockfile
- run: cd examples/docs-zero && bunx vite build --base=/pyreon/
- uses: actions/upload-pages-artifact@...
  with:
    path: examples/docs-zero/dist
```

### 3. Deletes `.github/workflows/docs-zero-preview.yml`

The side-by-side deploy is no longer needed; `docs.yml` now builds
docs-zero directly.

### 4. Updates the README links

Anywhere `docs/...` was referenced as the docs source, point at
`examples/docs-zero/...`.

## Gates that must pass before cut-over

### 1. Lighthouse comparison (build-time)

`bun run lighthouse-compare.ts` runs Lighthouse against 5
representative pages on both sites:
- `/docs/` (landing)
- `/docs/getting-started`
- `/docs/router` (heavy APICard usage)
- `/docs/reactivity` (Playground-heavy)
- `/docs/mcp` (representative reference page)

Target: docs-zero must score within 5 points on each of
Performance / Accessibility / Best Practices / SEO. If the new build
regresses on any metric, fix it before flipping.

### 2. Real-Chromium e2e

`bun run test:e2e:docs-zero` runs Playwright against the
docs-zero dev server and exercises:
- Landing page renders (hero counter ticks)
- Sidebar nav from getting-started to router and back
- Toc scroll-spy on a long page (`reactivity.md`)
- 404 page renders for an unknown URL
- Theme toggle (no flash on first paint)

### 3. Visual diff (manual review)

The team manually compares the same 5 pages on the legacy site vs
the preview site. Acceptable differences are documented in this PR;
unacceptable differences block the cut-over.

### 4. Analytics check (after 7 days)

Search Console + GA tell us if any pages dropped traffic on the
preview-only routes (some users may bookmark `/preview/`). If a
significant pattern emerges, address before cut-over.

## Rollback plan

If something breaks post-cut-over:

1. Revert the cut-over PR (single-commit revert)
2. Re-introduce `.github/workflows/docs.yml`'s VitePress build step
3. Production site goes back to VitePress in the next deploy window

The `docs.vitepress.bak/` directory remains accessible for one full
release cycle after the cut-over so the revert is a trivial path
flip, not a full git archaeology.
