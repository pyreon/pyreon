---
'@pyreon/cli': minor
---

cli: add `pyreon upgrade` — align every `@pyreon/*` dependency to one version

The fix for the skew `pyreon info` detects. `pyreon upgrade` rewrites every
`@pyreon/*` range in `package.json` to a single target — by default the highest
version present (aligning laggards up), or an explicit `--to <version>`.

```bash
pyreon upgrade              # dry-run: print the alignment plan
pyreon upgrade --write      # apply (rewrite package.json), then install
pyreon upgrade --to 0.37.0  # target a specific version
pyreon upgrade --exact      # pin without the caret
```

Dry-run by default (applies nothing until `--write`). `workspace:` / `link:` /
`file:` / git specifiers and non-`@pyreon` deps are left untouched. The pure
core (`resolveTarget` / `computeUpgradePlan` / `rewriteDeps`) is exported for
programmatic use. Lazy-loaded in the CLI dispatch (no main-entry bundle growth).
