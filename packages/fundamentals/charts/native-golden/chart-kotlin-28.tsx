// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { RadarChart } from '@pyreon/charts'
interface S { name: string; vals: number[]; tint: string }
const SS: S[] = [{ name: 'a', vals: [1, 2, 3], tint: '#f00' }]
const AX: string[] = ['x', 'y', 'z']
const mk = () => (d: S) => d.vals
export function C() { const w = signal(300); return <Stack><RadarChart data={SS} axes={AX} values={(d) => d.vals} height={() => 300} width={w()} /></Stack> }
