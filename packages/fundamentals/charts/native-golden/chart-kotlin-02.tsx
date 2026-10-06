// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { PlotChart, bars, line } from '@pyreon/charts/engine'
const ROWS = [{ a: 1, b: 3 }, { a: 2, b: 2 }, { a: 3, b: 1 }]
export function App() {
  const picked = signal(0)
  return <PlotChart data={ROWS} marks={[bars((d) => d.a), line((d) => d.b)]} height={240} brushType="lineX" brushMode="multiple" outOfBrushOpacity={0.2} brushSeriesIndex={[0]} toolbox={{ brush: ['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear'], dataZoom: true, restore: true }} onBrushSelected={(s) => picked.set(s[0].dataIndex.length)} />
}
