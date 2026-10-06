// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PolarChart } from '@pyreon/charts'
import type { PolarSeries } from '@pyreon/charts'
import type { PolarAxes } from '@pyreon/charts/engine'
const AXES: PolarAxes = { categories: ['x', 'y'] }
const SERIES: PolarSeries[] = [{ name: 'a', kind: 'bar', values: [3.5, 4.5] }]
export function Rose() {
  return <PolarChart axes={AXES} series={SERIES} showLegend tooltip height={240} />
}
