// Per-axis grid and minor lines on native: yGrid / xGrid / yMinor are literal ChartSpec fields.
import { Axis, Bar, Chart } from '@pyreon/charts'

interface Row { m: string; a: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 4 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" />
      <Axis y grid={false} minor={4} />
      <Axis x grid />
    </Chart>
  )
}
