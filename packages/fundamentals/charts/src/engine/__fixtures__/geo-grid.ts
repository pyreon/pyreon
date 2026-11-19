// A lon/lat grid as GeoJSON: every cell a region, so a golden shows a projection's distortion (meridians that converge,
// parallels that curve, the inset boxes of Albers USA) without depending on any boundary data.
import type { GeoJson } from '../geo-web'

export function gridGeo(lon0: number, lon1: number, lat0: number, lat1: number, step: number): GeoJson {
  const features: GeoJson['features'] = []
  for (let lat = lat0; lat < lat1; lat += step) {
    for (let lon = lon0; lon < lon1; lon += step) {
      features.push({
        type: 'Feature',
        properties: { name: `${lon},${lat}` },
        geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + step, lat], [lon + step, lat + step], [lon, lat + step], [lon, lat]]] },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

/** Values that rise with latitude, so the colour shows which way is north. */
export function gridValues(geo: GeoJson): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of geo.features) out[String(f.properties?.name)] = Number(String(f.properties?.name).split(',')[1]) + 90

  return out
}

/** The three pieces of a US-shaped composite: a lower-48 box, an Alaska box and a Hawaii box (cells, not coastlines). */
export function usGrid(): GeoJson {
  const lower = gridGeo(-124, -68, 26, 48, 4)
  const alaska = gridGeo(-168, -140, 56, 70, 4)
  const hawaii = gridGeo(-160, -154, 19, 22, 1)

  return { type: 'FeatureCollection', features: [...lower.features, ...alaska.features, ...hawaii.features] }
}

/** The US composite with the Aleutian chain: cells on BOTH sides of the antimeridian (172E..180 and 180..166W), which a plain projection throws across the map. */
export function usGridAleutians(): GeoJson {
  const base = usGrid()
  const east = gridGeo(172, 180, 51, 55, 4)
  const west = gridGeo(-180, -168, 51, 55, 4)

  return { type: 'FeatureCollection', features: [...base.features, ...east.features.map((f) => ({ ...f, properties: { name: `ale-e ${String(f.properties?.name)}` } })), ...west.features.map((f) => ({ ...f, properties: { name: `ale-w ${String(f.properties?.name)}` } }))] }
}
