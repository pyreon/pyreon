# @pyreon/charts-maps

## 0.54.0

### Minor Changes

- [#4738](https://github.com/pyreon/pyreon/pull/4738) [`e8fedbe`](https://github.com/pyreon/pyreon/commit/e8fedbe3ad940127ec9337b73ec9be1d2a3c9a04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package: boundary data for `@pyreon/charts` maps. `@pyreon/charts-maps/world-110m` (the countries of the world, Natural Earth 1:110m, joined on ISO 3166-1 alpha-3, prepared for Equal Earth) and `@pyreon/charts-maps/us-states` (the 50 states and DC, Census cartographic boundary 1:20m, joined on the state FIPS code, prepared for Albers USA), one lazy TopoJSON module per map so an app bundles only the maps it imports (about 30 KB gzip each). `<MapChart map={world} values={{ DEU: 83 }} />` just works. Public-domain sources are pinned and checksummed in `SOURCES.md`; `bun run build:data` regenerates the modules; nothing is fetched at install or run time.
