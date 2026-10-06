// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { GaugeChart } from '@pyreon/charts'
import { FunnelChart, PieChart } from '@pyreon/charts/engine'
interface Stage { name: string; total: number; tint: string }
const STAGES: Stage[] = [{ name: 'Visit', total: 120, tint: '#111111' }, { name: 'Sign up', total: 48, tint: '#222222' }]
export function Sales() {
  const picked = signal(-1)
  const load = signal(42)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <FunnelChart animate={false} data={STAGES} value={(d) => d.total} label={(d, i) => d.name} height={200} onSelect={(i: number) => picked.set(i)} />
      <PieChart data={STAGES} value={(d) => d.total} label={(d) => d.name} color={(d) => d.tint} innerRadius={0.4} width={200} height={200} />
      <GaugeChart value={load()} min={0} max={100} thickness={18} valueColor="#b45309" height={120} data-testid="gauge" />
    </Stack>
  )
}
