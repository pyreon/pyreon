// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PlotChart, bars } from '@pyreon/charts/engine'
const ROWS = [{ a: 1 }]
const kind = Math.random() > 0.5 ? 'rect' : 'lineX'
export function App() {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} brushType={kind} toolbox={{ brush: ['lasso'] }} />
}
