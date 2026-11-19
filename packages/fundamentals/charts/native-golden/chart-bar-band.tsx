// Bars on a numeric x axis on native: barSpan is a literal ChartSpec field; the slots are the generated engine's.
import { Bar, Chart } from '@pyreon/charts'

interface Row { t: number; a: number }
const ROWS: Row[] = [{ t: 1, a: 3 }, { t: 2, a: 4 }, { t: 5, a: 2 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} xValue="t" barSpan={0.5} height={200}>
      <Bar<Row> y="a" />
    </Chart>
  )
}
