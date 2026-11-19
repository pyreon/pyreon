import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/charts-maps',
  title: 'Chart Maps (boundary data)',
  tagline: 'Boundary data for @pyreon/charts maps — world countries and US states as TopoJSON, one lazy module per map',
  description:
    'Boundary data for `<MapChart>`: `@pyreon/charts-maps/world-110m` (the countries of the world, Natural Earth 1:110m, joined on ISO alpha-3) and `@pyreon/charts-maps/us-states` (the 50 states and DC, Census 1:20m, joined on FIPS). Each subpath default-exports a `MapModule` — the topology plus the projection it was prepared for (Equal Earth for the world, Albers USA for the US), the name property and the join key — so `<MapChart map={world} values={...}>` just works and an app bundles only the maps it imports. Public-domain sources, pinned and checksummed; the data is committed and nothing is fetched at install or run time.',
  category: 'browser',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'it is DATA: TopoJSON modules a web `<MapChart>` decodes at load. A native map takes a precomputed `GeoShape[]` const (a world boundary constant that compiles within the Swift and Kotlin limits is under investigation), so these modules are not lowered to iOS or Android yet.',
  },
  peerDeps: [],
  longExample: `import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'
import usStates from '@pyreon/charts-maps/us-states'

// Values join on the feature id: ISO 3166-1 alpha-3 for the world, the two-digit state FIPS code for the US.
<MapChart map={world} values={{ DEU: 83, FRA: 68, BRA: 215 }} height={360} />
<MapChart map={usStates} values={{ '06': 39, '48': 30 }} height={400} />

// An explicit option still wins over the map's own default projection:
<MapChart map={world} options={{ projection: 'naturalEarth1' }} values={{ DEU: 83 }} />

// Lazy: the map is fetched when it is first needed.
const { default: lazyWorld } = await import('@pyreon/charts-maps/world-110m')`,
  features: [
    'world-110m: 177 countries, Natural Earth 1:110m (public domain), joined on ISO 3166-1 alpha-3',
    'us-states: 50 states + DC, Census cartographic boundary 1:20m (public domain), joined on state FIPS',
    'One module per map with lazy subpath exports — an app bundles only the maps it imports (about 33 KB gzip each)',
    'Each module carries its default projection (Equal Earth / Albers USA), name property and join key; chart options override',
    'Pinned, checksummed sources and a regeneration script (`bun run build:data`); SOURCES.md records URLs, dates, licences and the conversion',
  ],
  api: [
    {
      name: 'world-110m',
      kind: 'function',
      signature: "import world from '@pyreon/charts-maps/world-110m'  // MapModule",
      summary:
        'The countries of the world as a `MapModule` for `<MapChart map>`: Natural Earth 1:110m TopoJSON (object `countries`), joined on the ISO 3166-1 alpha-3 feature id, named by `properties.name`, prepared for the Equal Earth projection. About 33 KB gzip.',
      example: `import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'

<MapChart map={world} values={{ DEU: 83, FRA: 68 }} />`,
      mistakes: [
        'Joining values on the country NAME — the key is the ISO alpha-3 id (`DEU`), not `Germany`; the display name is only the label',
        'Importing from the package root for the data — the root is types and a list; each map is its own subpath (`@pyreon/charts-maps/world-110m`) so it bundles only when imported',
        'Expecting a disputed border to match your convention — Natural Earth draws de facto lines; this package takes no position on them',
      ],
      seeAlso: ['us-states'],
    },
    {
      name: 'us-states',
      kind: 'function',
      signature: "import usStates from '@pyreon/charts-maps/us-states'  // MapModule",
      summary:
        'The 50 US states and DC as a `MapModule`: Census cartographic boundary 1:20m TopoJSON (object `states`), joined on the two-digit state FIPS feature id (`"06"`), named by `properties.name`, prepared for Albers USA (Alaska and Hawaii in insets). About 34 KB gzip.',
      example: `import { MapChart } from '@pyreon/charts'
import usStates from '@pyreon/charts-maps/us-states'

<MapChart map={usStates} values={{ '06': 39, '48': 30 }} />`,
      mistakes: [
        'Writing FIPS codes as numbers — the id is a TWO-CHARACTER STRING (`"06"`, not `6`), so a numeric key never matches',
        'Expecting counties — this is states only; the larger county file was measured (about 229 KB gzip) and left out',
      ],
      seeAlso: ['world-110m'],
    },
  ],
  gotchas: [
    {
      label: 'Per-map defaults, explicit options win',
      note: 'A `MapModule` carries `projection`, `nameProperty` and `idProperty`; `<MapChart map={module}>` uses them, and any value you pass in `options` overrides the matching default.',
    },
  ],
})
