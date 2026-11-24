import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'

/**
 * Gallery — a bubble map: point marks sized by value, with a size key (nested circles of nice values) so a bubble can be
 * read. The sphere outline sits behind the land.
 */
const CITIES = [
  { name: 'Tokyo', lon: 139.7, lat: 35.7, value: 37_000_000 },
  { name: 'Delhi', lon: 77.2, lat: 28.6, value: 32_000_000 },
  { name: 'Shanghai', lon: 121.5, lat: 31.2, value: 28_000_000 },
  { name: 'Sao Paulo', lon: -46.6, lat: -23.5, value: 22_000_000 },
  { name: 'Mexico City', lon: -99.1, lat: 19.4, value: 22_000_000 },
  { name: 'Cairo', lon: 31.2, lat: 30.0, value: 21_000_000 },
  { name: 'New York', lon: -74, lat: 40.7, value: 18_800_000 },
  { name: 'Lagos', lon: 3.4, lat: 6.5, value: 15_000_000 },
  { name: 'London', lon: -0.1, lat: 51.5, value: 9_500_000 },
  { name: 'Sydney', lon: 151.2, lat: -33.9, value: 5_300_000 },
]

export default function GalleryMapBubbles() {
  return <MapChart map={world} values={{}} height={380} tooltip points={CITIES} overlayOptions={{ radius: 9, color: '#2563eb' }} sizeLegend={{ title: 'inhabitants' }} options={{ sphere: true }} />
}
