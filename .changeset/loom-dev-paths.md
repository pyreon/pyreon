---
'@pyreon/loom': minor
---

`loom.devPaths` — the project declares which package-relative paths are **not
shipping source**.

Loom classifies imports by surface: shipping source drives `phantom-dep` and
`prod-import-of-dev-dep` (both statements about what a CONSUMER receives),
while the dev surface only proves a dependency is used. It infers that surface
from path shape — tests, configs, scripts — which covers the common cases and
cannot cover a repo's own build conventions.

Measured on this monorepo: every package's `src/manifest.ts` imports
`@pyreon/manifest` at runtime to feed gen-docs, and `scripts/publish.ts` calls
`stripSrcFromFiles`, so `src/` never reaches a tarball. Loom was right by its
own rules and wrong about the world — **55 of the repo's 60 non-example gating
warnings were that one convention**, which nothing in any manifest states.

```jsonc
// package.json
{ "loom": { "devPaths": ["src/manifest.ts", "**/*.gen.ts"] } }
```

Declaring it takes this repo from **73 gating warnings to 18**, with all 166
`unused-dep` findings byte-identically intact. That last number is the point:
`devPaths` extends the dev-surface classifier rather than dropping files from
the scan, so a declared path still counts as USED — it just stops counting as
shipped. Dropping the file instead would have manufactured a fresh
`unused-dep` for every dependency only a manifest touches.

Segment-wise globs, the same vocabulary as workspace globs: `*` within one
segment, `**` any depth including zero. A malformed value is a loud error, not
a silently-ignored config — the same rule `loom.ignore` follows.

Bisect-verified: revert the surface routing → 3 specs fail; break
`**`-matches-zero-segments → 2 fail; restored → 13/13, suite 101/101.
