// A reversed x axis on native: xInverse is a literal ChartSpec field; the rows reach the engine reversed through the keep map.
import { Axis, Bar, Chart } from '@pyreon/charts'

interface Row { m: string; a: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 4 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" />
      <Axis x inverse />
    </Chart>
  )
}
