// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { FunnelChart } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ v: number; n: string }[]>([])
  return (<Stack><FunnelChart value={(d) => d.v} label={(d) => d.n} /></Stack>)
}
