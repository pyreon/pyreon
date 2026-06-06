---
'@pyreon/zero-content': minor
---

PR-K — extended built-in components (audit H2 + H14)

Ships the six previously-claimed-but-missing built-in components so
the markdown pipeline auto-imports them without per-file `import`
statements:

- **`<Playground>`** — minimal sandboxed editor + iframe preview.
  Supports HTML / CSS / JS sources, signal-driven srcdoc rebuild,
  configurable height. Uses a fresh `<iframe sandbox="allow-scripts">`
  (no `allow-same-origin`) so user code can't reach the host page.

- **`<PackageBadge>`** — npm package install card. Renders name,
  version, optional description, and per-manager install commands
  (bun/npm/pnpm/yarn/deno). `renderInstallRows` is exported as a
  pure helper.

- **`<Tabs>`** — generic tab strip. Supports two render shapes
  (labels + children OR `items: [{label, content}]`). Reactive
  active-tab signal; arrow-keyboard navigation via natural focus.

- **`<APICard>`** — API signature card. Heading + signature + summary
  + optional stability badge + `since` version + deep-link anchor.
  `deriveApiId` exported as a pure helper.

- **`<PropTable>`** — props reference table. One row per
  `{ name, type, default, required, description }`. Configurable
  column labels.

- **`<CompatMatrix>`** — feature/platform compatibility matrix.
  Maps features (rows) to platforms (columns) with normalized status
  cells: `true` → ✓, `false` → ✗, `'partial'` → 🚧, `'planned'` → ⏳,
  custom strings pass through. `renderCompatCell` exported.

All six added to `BUILT_IN_COMPONENTS` (now 9 entries, alphabetically
sorted). Scanner / validator tests updated to lock in the canonical
list.

32 new specs cover the six components; H2 bisect-verified by dropping
the new entries from the catalogue.
