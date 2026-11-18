// A reversed value axis on native: yInverse / y2Inverse are literal ChartSpec fields.
import { Axis, Bar, Chart, Line } from '@pyreon/charts'

interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" />
      <Line<Row> y="b" axis="right" />
      <Axis y inverse />
      <Axis y2 inverse />
    </Chart>
  )
}
