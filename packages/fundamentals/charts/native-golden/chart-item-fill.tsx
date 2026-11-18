// Per-datum fill is web-only: the emit warns by name and the bars draw in the series colour.
import { Bar, Chart, shadeBy } from '@pyreon/charts'
interface Row { m: string; a: number; t: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, t: 5 }, { m: 'Feb', a: 4, t: 1 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" fill={shadeBy<Row>('t')} />
    </Chart>
  )
}
