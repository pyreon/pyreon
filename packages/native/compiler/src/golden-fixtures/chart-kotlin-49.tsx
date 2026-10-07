// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { SankeyChart } from '@pyreon/charts'
export function App(props: { orient: 'horizontal' | 'vertical' }) {
  return <SankeyChart nodes={[{ name: 'a' }]} links={[]} orient={props.orient} />
}
