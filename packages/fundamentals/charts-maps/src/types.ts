// The shape every map module in this package default-exports. It is structurally the `MapDefinition` that
// `@pyreon/charts` accepts (`<MapChart map={worldMap} />`, `registerMap(name, worldMap)`); it is redeclared here so this
// package carries no dependency on the charts package.

/** A TopoJSON geometry object (collections of polygons and multipolygons). */
export interface TopoGeometry {
  type: string
  id?: string | number
  properties?: Record<string, unknown> | null
  arcs?: number[][] | number[][][]
  geometries?: TopoGeometry[]
}

/** A quantised TopoJSON topology. */
export interface Topology {
  type: 'Topology'
  transform: { scale: [number, number]; translate: [number, number] }
  arcs: number[][][]
  objects: Record<string, TopoGeometry>
}

/** A map ready for `<MapChart map={...}>`: its topology and the choices it was prepared for. */
export interface MapModule {
  /** The boundary data. */
  data: Topology
  /** The TopoJSON object to read. */
  object: string
  /** The projection the map is meant for (`equalEarth` for the world, `albersUsa` for the United States). */
  projection: 'equalEarth' | 'albersUsa' | 'naturalEarth1' | 'albers' | 'mercator' | 'equirectangular'
  /** The feature property that names a region. */
  nameProperty: string
  /** What `values` are joined on: `'id'` (the feature id: ISO 3166-1 alpha-3 for the world, the two-digit state FIPS code for the US). */
  idProperty: string
}
