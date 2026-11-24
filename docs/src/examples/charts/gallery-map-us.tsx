import { MapChart, mapRamp, visualMap } from '@pyreon/charts'
import usStates from '@pyreon/charts-maps/us-states'

/**
 * Gallery — US states from `@pyreon/charts-maps`, in Albers USA (Alaska and Hawaii in their insets), joined on the
 * state FIPS code (a two-character string: "06" is California). Puerto Rico is not in the data: the composite has no inset
 * for it.
 */
const VALUES: Record<string, number> = { '06': 39, '48': 30, '12': 22, '36': 19, '42': 13, '17': 12, '39': 12, '13': 11, '37': 11, '26': 10, '53': 8, '04': 7, '25': 7, '51': 9, '47': 7 }

export default function GalleryMapUs() {
  return (
    <MapChart
      map={usStates}
      values={VALUES}
      height={380}
      tooltip
      selectedMode="multiple"
      visualMap={visualMap({ domain: [7, 39], orient: 'horizontal', itemLength: 180, stops: mapRamp('light'), text: ['most', 'least'] })}
      title="Population, millions (states without a value are hatched)"
      showTitle
    />
  )
}
