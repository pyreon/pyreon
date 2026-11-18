// Per-datum fill on native: fillBy / shadeBy over literal fields lower to itemColors / shades; the emit names what stays web-only.
import { Bar, Chart, fillBy, shadeBy } from '@pyreon/charts'

interface Row { m: string; a: number; t: number; tone: string }
const ROWS: Row[] = [{ m: 'Jan', a: 3, t: 5, tone: '#ff0000' }, { m: 'Feb', a: 4, t: 1, tone: '#00ff00' }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" label="A" fill={fillBy<Row>('tone')} />
      <Bar<Row> y="t" label="T" fill={shadeBy<Row>('t', { ramp: ['#fde68a', '#b45309'], domain: { min: 0, max: 10 } })} />
    </Chart>
  )
}
