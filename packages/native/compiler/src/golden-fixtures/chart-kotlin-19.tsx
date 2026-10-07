// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { ParallelChart } from '@pyreon/charts'
import type { ParallelAxis } from '@pyreon/charts'
const AXES: ParallelAxis[] = [{ name: 'Cyl', type: 'category', categories: ['4', '6', '8'] }, { name: 'MPG' }]
const axesOf = (): ParallelAxis[] => AXES
export function Cars() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <ParallelChart animate={false} axes={AXES} rows={[['4', 30], ['8', null], ['x', 22]]} gutter={30} rowColor={(r, i) => (i === 0 ? '#b42318' : '#0f766e')} height={260} onSelectIndex={(i: number) => picked.set(i)} />
    </Stack>
  )
}
