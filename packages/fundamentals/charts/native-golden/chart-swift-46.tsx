// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.

import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1, b: 4 }, { a: 2, b: 3 }, { a: 3, b: 2 }, { a: 4, b: 1 }]
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a), bars((d) => d.b)]} height={240} toolbox={{ dataZoom: true, dataView: true, magicType: ['line', 'bar', 'stack', 'tiled'], restore: true, saveAsImage: true }} />
}
