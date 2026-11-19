// Boundary data for `@pyreon/charts` maps. Import a map from its own subpath so an app bundles only the map it uses:
//
//   import world from '@pyreon/charts-maps/world-110m'
//   <MapChart map={world} values={{ DEU: 83, FRA: 68 }} />
//
// The root entry is the list of what is available and the shared types; it carries no boundary data.
export type { MapModule, TopoGeometry, Topology } from './types'

/** The maps this package ships: each subpath, what it draws, and what `values` are joined on. */
export const MAP_MODULES = {
  'world-110m': { description: 'The countries of the world, Natural Earth 1:110m', joinOn: 'ISO 3166-1 alpha-3 code (the feature id)', projection: 'equalEarth' },
  'us-states': { description: 'The 50 US states and DC, Census cartographic boundaries 1:20m', joinOn: 'two-digit state FIPS code (the feature id)', projection: 'albersUsa' },
} as const
