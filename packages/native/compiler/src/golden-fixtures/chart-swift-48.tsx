// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.

import { MapChart, visualMap } from '@pyreon/charts'
const SHAPES = [{ name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] }]
export function App() {
  return <MapChart animate={false} map={SHAPES} values={{ A: 40 }} visualMap={visualMap({ domain: [0, 100], calculable: true, range: [20, 80], stops: ['#eeeeee', '#aa0000'] })} height={200} />
}
