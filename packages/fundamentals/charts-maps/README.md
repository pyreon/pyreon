# @pyreon/charts-maps

> **Status: Experimental.** Outside the semver promise: the API may change in a minor release. See the [stability policy](https://pyreon.dev/docs/stability-and-direction).

Boundary data for [`@pyreon/charts`](../charts) maps: the countries of the world and the US states, as TopoJSON, one
module per map so an app bundles only the map it imports.

```tsx
import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'
import usStates from '@pyreon/charts-maps/us-states'

// values join on the feature id: ISO 3166-1 alpha-3 for the world, the two-digit FIPS code for US states
<MapChart map={world} values={{ DEU: 83, FRA: 68, BRA: 215 }} />
<MapChart map={usStates} values={{ '06': 39, '48': 30 }} />
```

Each module default-exports a `MapModule`: the topology plus the projection it was prepared for (`equalEarth` for the
world, `albersUsa` for the US), the property that names a region and the key values join on. An explicit
`options.projection` on the chart overrides the map's own. For lazy loading, `import('@pyreon/charts-maps/world-110m')`.

| Subpath | Draws | Join on | Size (built, raw / gzip) |
| --- | --- | --- | --- |
| `world-110m` | 177 countries, Natural Earth 1:110m | ISO alpha-3 (`id`) | about 161 KB / 33 KB |
| `us-states` | 50 states and DC, Census 1:20m | state FIPS (`id`) | about 150 KB / 34 KB |

The root entry has the shared types and the list of what is available, and no boundary data.

Sources, licences (both public domain) and the exact conversion steps are in [SOURCES.md](./SOURCES.md);
`bun run build:data` regenerates the two modules from the pinned, checksummed sources. Nothing is downloaded when the
package is installed or used. This package has no runtime API beyond the data.
