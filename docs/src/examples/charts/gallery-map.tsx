import { MapChart } from '@pyreon/charts'
import type { GeoJson } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — a map. The "country" has a lake and an enclave cut out of it (inner
 * rings), the enclave is a region of its own, values join on the feature id, and the
 * tooltip reads the feature's own properties. Hover outlines a region; click (or
 * Enter / Space on the keyboard-focused region) selects it; `selectedMode` is
 * "multiple", so a second click on a selected region deselects it.
 */
const box = (x0: number, y0: number, x1: number, y1: number): number[][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]

const GEO: GeoJson = {
  type: 'FeatureCollection',
  features: [
    // A land with a lake and an enclave cut out of it.
    { type: 'Feature', id: 'la', properties: { name: 'Landia', capital: 'Port Ash', pop: 12 }, geometry: { type: 'Polygon', coordinates: [box(0, 0, 20, 14), box(4, 4, 8, 8), box(12, 3, 15, 6)] } },
    // The enclave, filling its hole.
    { type: 'Feature', id: 'en', properties: { name: 'Enclavia', capital: 'Little Ash', pop: 1 }, geometry: { type: 'Polygon', coordinates: [box(12, 3, 15, 6)] } },
    { type: 'Feature', id: 'nb', properties: { name: 'Northby', capital: 'Cold Quay', pop: 7 }, geometry: { type: 'Polygon', coordinates: [box(20, 0, 30, 14)] } },
  ],
}

export default function GalleryMap() {
  const picked = signal<number[]>([])
  return (
    <div class="example-col">
      <div class="example-row">
        <span>selected regions: {() => (picked().length === 0 ? 'none' : picked().join(', '))}</span>
      </div>
      <MapChart
        map={GEO}
        values={{ la: 40, en: 90, nb: 65 }}
        options={{ idProperty: 'id', showLabels: true }}
        height={260}
        tooltip
        selectedMode="multiple"
        onSelectionChange={(indices) => picked.set(indices)}
        tooltipFormatter={(r) => [`${r.label} (${String(r.properties?.capital)})`, `value ${r.value}`, `population ${String(r.properties?.pop)} M`]}
      />
    </div>
  )
}
