// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { TreemapChart } from '@pyreon/charts'
import type { ChartTheme } from '@pyreon/charts'
import type { TreeNode } from '@pyreon/charts'
const DATA: TreeNode[] = [{ name: 'src', children: [{ name: 'core', value: 50 }] }, { name: 'docs', value: 30 }]
const T: Partial<ChartTheme> = { text: '#ffffff' }
export function Files() { return <TreemapChart data={DATA} theme={T} showLegend height={200} /> }
