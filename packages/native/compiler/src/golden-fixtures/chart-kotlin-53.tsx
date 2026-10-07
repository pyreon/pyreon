// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PlotChart, bars } from '@pyreon/charts/engine'
export function App(props: { rows: { v: number }[]; zoom: boolean; morph: boolean }) {
  return <PlotChart data={props.rows} marks={[bars((d) => d.v)]} universalTransition={props.morph} />
}
