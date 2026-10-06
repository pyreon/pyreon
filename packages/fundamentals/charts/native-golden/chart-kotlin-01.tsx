// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { Stack } from '@pyreon/primitives'
import { TreemapChart, ParallelChart, MapChart } from '@pyreon/charts'
import type { TreeNode, ParallelAxis } from '@pyreon/charts'
import type { TreemapCell } from '@pyreon/charts/engine'
const DATA: TreeNode[] = [{ name: 'root', value: 10 }]
const AXES: ParallelAxis[] = [{ name: 'a' }, { name: 'b' }]
export function Rich() {
  return (
    <Stack>
      <TreemapChart animate={false} data={DATA} height={200} onSelect={(c: TreemapCell | null) => console.log(c)} />
      <ParallelChart animate={false} axes={AXES} rows={[[1, 2], [3, 4]]} height={200} tooltip />
      <MapChart map="world" values={{}} height={200} />
    </Stack>
  )
}
