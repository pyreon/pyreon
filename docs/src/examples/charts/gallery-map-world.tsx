import { MapChart, mapRamp, visualMap } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — a world choropleth from `@pyreon/charts-maps`. The map carries its own projection (Equal Earth, which keeps
 * areas true) and joins values on the ISO alpha-3 code; the sphere outline and a graticule sit behind the land, a country
 * with no value is hatched and named in the legend, and "Zoom to" fits the view to a country (click a country to zoom to
 * it, click the sea to come back).
 */
const VALUES: Record<string, number> = { USA: 331, CAN: 38, MEX: 128, BRA: 213, ARG: 45, GBR: 67, FRA: 68, DEU: 83, ESP: 47, ITA: 59, RUS: 146, CHN: 1412, IND: 1408, JPN: 125, AUS: 26, ZAF: 60, NGA: 213, EGY: 104, TUR: 85, IDN: 276 }

export default function GalleryMapWorld() {
  const focus = signal<string | undefined>(undefined)
  return (
    <div class="example-col">
      <div class="example-row">
        {['World', 'Brazil', 'India', 'Australia'].map((name) => (
          <button type="button" onClick={() => focus.set(name === 'World' ? undefined : name)}>
            {name}
          </button>
        ))}
      </div>
      <MapChart
        map={world}
        values={VALUES}
        height={360}
        tooltip
        zoomOnClick
        fitTo={focus()}
        options={{ sphere: true, graticule: 30 }}
        visualMap={visualMap({ domain: [20, 1412], orient: 'horizontal', itemLength: 200, stops: mapRamp('light'), text: ['most', 'least'] })}
        title="Population, millions (countries without a value are hatched)"
        showTitle
      />
    </div>
  )
}
