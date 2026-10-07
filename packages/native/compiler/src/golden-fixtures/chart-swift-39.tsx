// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, band } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ y: number; lo: number; hi: number }[]>([])
  return (<Stack><PlotChart data={rows()} marks={[band((d) => d.lo)]}  /></Stack>)
}
