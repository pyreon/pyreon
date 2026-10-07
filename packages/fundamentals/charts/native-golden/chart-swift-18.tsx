// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { Stack } from '@pyreon/primitives'
import { GanttChart } from '@pyreon/charts'
import type { GanttTask } from '@pyreon/charts'
const TASKS: GanttTask[] = [{ id: 'a', name: 'Design', start: '2024-03-01', end: '2024-03-10' }]
function chosen(i: number) {
  return i
}
export function Plan() {
  return (<Stack><GanttChart animate={false} tasks={TASKS} onSelectIndex={chosen} /></Stack>)
}
