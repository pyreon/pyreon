// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { Stack } from '@pyreon/primitives'
import { RadarChart } from '@pyreon/charts'
import { PieChart } from '@pyreon/charts/engine'
import { PlotChart, bars, line } from '@pyreon/charts/engine'
import type { RadarAxis } from '@pyreon/charts'
interface Month { name: string; revenue: number; cost: number }
interface Team { name: string; scores: number[]; share: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8 }, { name: 'Feb', revenue: 15, cost: 9 }]
const TEAMS: Team[] = [{ name: 'A', scores: [3, 4, 5], share: 60 }, { name: 'B', scores: [5, 2, 4], share: 40 }]
const AXES: RadarAxis[] = [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }]
export function Chrome() {
  return (
    <Stack>
      <PlotChart animate={false} data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue, { label: 'Revenue' }), line((d) => d.cost, { label: 'Cost' })]} showLegend={true} showTitle={true} title="Revenue" subtitle="by month" legendMaxRows={2} height={220} onSelect={(i: number) => console.log(i)} />
      <PieChart data={TEAMS} value={(d) => d.share} label={(d) => d.name} showLegend={true} width={240} height={200} onSelect={(i: number) => console.log(i)} />
      <RadarChart data={TEAMS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} showLegend={true} height={240} />
    </Stack>
  )
}
