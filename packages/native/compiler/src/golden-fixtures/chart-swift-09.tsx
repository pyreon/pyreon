// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { BoxplotChart } from '@pyreon/charts'
export function C() {
  const rows = signal<{ x: string; y: number; lo: number; hi: number; vals: number[] }[]>([])
  const axes = signal<string[]>(['a', 'b'])
  const shadow = 1
  const dyn = signal<number>(6)
  return (<Stack><BoxplotChart values={(d) => d.vals} /></Stack>)
}
