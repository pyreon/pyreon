# @pyreon/charts-maps

## 0.55.0

### Patch Changes

- [#4858](https://github.com/pyreon/pyreon/pull/4858) [`aee634a`](https://github.com/pyreon/pyreon/commit/aee634aac159f80ead617e32fe105b34b1b8cc9d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every published package declares the supported Node.js floor: `"engines": { "node": ">=22" }`. 73 packages declared no `engines`, 13 said `>= 22` and the seven `@pyreon/compiler-*` binaries still said `>=18`. Node.js 22 is the floor of the support matrix (Node.js 22+, Bun 1.3+, browsers at Baseline 2024, iOS 17+, Android minSdk 26+), now stated on the stability page and in SECURITY.md; the new `check-support-matrix` gate keeps every package, the native platform floors and both documents in agreement, so a new package cannot ship without the field.

  Upgrade: manual — run on Node.js 22 or later (or Bun 1.3 or later); npm warns on an older Node.js

## 0.54.0

### Minor Changes

- [#4738](https://github.com/pyreon/pyreon/pull/4738) [`e8fedbe`](https://github.com/pyreon/pyreon/commit/e8fedbe3ad940127ec9337b73ec9be1d2a3c9a04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package: boundary data for `@pyreon/charts` maps. `@pyreon/charts-maps/world-110m` (the countries of the world, Natural Earth 1:110m, joined on ISO 3166-1 alpha-3, prepared for Equal Earth) and `@pyreon/charts-maps/us-states` (the 50 states and DC, Census cartographic boundary 1:20m, joined on the state FIPS code, prepared for Albers USA), one lazy TopoJSON module per map so an app bundles only the maps it imports (about 30 KB gzip each). `<MapChart map={world} values={{ DEU: 83 }} />` just works. Public-domain sources are pinned and checksummed in `SOURCES.md`; `bun run build:data` regenerates the modules; nothing is fetched at install or run time.
