// Bar thickness on native: barWidth / barGap / barCategoryGap are literal ChartSpec fields, vertical grouped and horizontal plain.
import { Bar, Chart } from '@pyreon/charts'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Stack>
      <Chart data={ROWS} x="m" height={200} barWidth={14} barGap={0.5} barCategoryGap={0.4}>
        <Bar y="a" group />
        <Bar y="b" group />
      </Chart>
      <Chart data={ROWS} x="m" height={160} horizontal barWidth={9}>
        <Bar y="a" />
      </Chart>
    </Stack>
  )
}
