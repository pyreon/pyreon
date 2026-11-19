// sqrt / symlog / log scale descriptors on native: built into the engine's ScaleView from their compile-time literals.
import { Axis, Bar, Chart, Line, Scale, log, sqrt, symlog } from '@pyreon/charts'

interface Row { m: string; a: number }
interface Pt { x: number; y: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 40 }]
const PTS: Pt[] = [{ x: 2, y: 3 }, { x: 300, y: 5 }]
export function App() {
  return (
    <>
      <Chart<Row> data={ROWS} x="m" height={200}>
        <Bar<Row> y="a" />
        <Axis y scale={sqrt()} />
      </Chart>
      <Chart<Pt> data={PTS} xValue="x" height={200}>
        <Line<Pt> y="y" />
        <Scale x={log()} y={symlog({ constant: 10 })} />
      </Chart>
    </>
  )
}
