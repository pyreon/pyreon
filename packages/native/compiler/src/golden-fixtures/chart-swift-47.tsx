// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/engine'
import type { TooltipContent } from '@pyreon/charts/engine'
interface Month { name: string; revenue: number; cost: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8 }, { name: 'Feb', revenue: 15, cost: 9 }]
function describe(c: TooltipContent): string {
  return c.title
}
export function Revenue() {
  return (<Stack><PlotChart data={MONTHS} x={(d) => d.name} marks={[bars((d) => d.revenue)]} tooltip tooltipFormatter={describe} height={200} /></Stack>)
}
