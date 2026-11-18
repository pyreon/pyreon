// connectNulls on native: a literal Series field read by the generated engine's line and area branches.
import { Chart, Line, Area } from '@pyreon/charts'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Line<Row> y="a" connectNulls />
      <Area<Row> y="b" connectNulls />
    </Chart>
  )
}
