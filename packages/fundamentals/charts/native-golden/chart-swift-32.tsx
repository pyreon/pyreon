// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { TreemapChart } from '@pyreon/charts'
import { PieChart } from '@pyreon/charts/engine'
type N = { name: string; value: number }
const NODES: N[] = [{ name: 'a', value: 1 }]
type S = { label: string; v: number }
const SL: S[] = [{ label: 'x', v: 2 }]
// Two tooltip hosts in ONE struct (their `@State` names collide and the second host is renamed) — and a signal, so the component is a
// struct that can carry them (a stateless component lowers to a `@ViewBuilder func`, which cannot).
export function Both() {
  const n = signal(0)
  return (
    <Stack>
      <Text>{n()}</Text>
      <TreemapChart animate={false} data={NODES} showTitle title="T" showLegend tooltip height={200} />
      <PieChart data={SL} value={(d: S) => d.v} label={(d: S) => d.label} showLegend tooltip animate={false} height={200} />
    </Stack>
  )
}
