# Sources, licences and how the data was made

The two data modules here are generated, committed files (`src/world-110m.ts`, `src/us-states.ts`). Nothing is fetched
when this package is installed or built, and nothing is fetched by an app that uses it. `bun run build:data` (the script
`scripts/build-data.ts`) regenerates both from the sources below; it refuses to run on a source whose SHA-256 differs
from the one recorded here.

## `world-110m`

- **Source:** Natural Earth, "Admin 0 - Countries", scale 1:110m, version 5.1.2, as GeoJSON from the
  `nvkelso/natural-earth-vector` repository at tag `v5.1.2`.
- **URL:** https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson
- **Downloaded:** 2026-11-19. **SHA-256:** `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f` (838,726 bytes).
- **Licence:** public domain (Natural Earth: "All versions of Natural Earth raster + vector map data found on this
  website are in the public domain", https://www.naturalearthdata.com/about/terms-of-use/). No attribution is required;
  it is given here anyway.
- **Properties kept:** `name` (`NAME`), `iso3` (`ISO_A3_EH`, falling back to `ADM0_A3`), `iso2` (`ISO_A2_EH`),
  `continent`. The feature `id` is the alpha-3 code, which is the join key (`idProperty: 'id'`). `ISO_A3_EH` is used
  because Natural Earth's plain `ISO_A3` is `-99` for France, Norway and a few others.
- **Boundaries:** Natural Earth's de facto lines, as shipped. Disputed borders are drawn as Natural Earth draws them; this
  package takes no position on them.

## `us-states`

- **Source:** US Census Bureau cartographic boundary file, 2023, states, 1:20,000,000 (`cb_2023_us_state_20m`).
- **URL:** https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_20m.zip
- **Downloaded:** 2026-11-19. **SHA-256:** `0fd2d6562708ff8182c00d5d25b5556d049ecf2794d97b89ed2dac4d5e9e2c8d` (186,432 bytes).
- **Licence:** US federal government work, public domain (17 U.S.C. 105). The Census Bureau asks that the product be
  credited as "US Census Bureau, cartographic boundary files".
- **Properties kept:** `name` (`NAME`), `abbr` (`STUSPS`), `fips` (`STATEFP`). The feature `id` is the two-digit state
  FIPS code, which is the join key.
- **Coverage:** the 50 states and the District of Columbia (51 features). The source also has Puerto Rico (FIPS 72); it is filtered out because the Albers USA composite has no inset for it, so it would be projected far off the map and shrink everything else to make room.

## The conversion (both maps)

1. Download the source and verify its SHA-256.
2. World: parse the GeoJSON. US: unzip and read the shapefile with `shapefile` (v0.6).
3. Keep only the properties listed above and set the feature `id`.
4. Build the topology with `topojson-server` (v3): shared borders become shared arcs, and positions are quantised to a
   grid of **10,000** steps across each axis for the world and **100,000** for the US states (a step is about 4 km at
   the equator for the world and 0.4 km for the US).
5. **Simplification: none beyond the source's own.** Both files are already the generalised cartographic scales
   (Natural Earth 1:110m and Census 1:20,000,000); no further Douglas-Peucker or Visvalingam pass is applied, so the
   tolerance is the source's own generalisation.
6. Write a TypeScript module that default-exports a `MapModule` (the topology, the TopoJSON object name, the projection
   the map is meant for, and the name and join properties).

## Sizes

| Module | Source file | Module source (raw) | Built `lib` (raw / gzip) |
| --- | --- | --- | --- |
| `world-110m` | 838,726 B GeoJSON | 99,117 B | about 161 KB / 33 KB |
| `us-states` | 186,432 B zip | 94,456 B | about 150 KB / 34 KB |

## Not included

The larger scales were measured and left out: `world-50m` (Natural Earth 1:50m, tag v5.1.2) comes to about 747 KB raw /
231 KB gzip as TopoJSON, and `us-counties` (Census 2023 1:20m, 3,222 counties) to about 788 KB / 229 KB gzip. They fit the
same one-file-per-map layout; they are left out of this release for size.
