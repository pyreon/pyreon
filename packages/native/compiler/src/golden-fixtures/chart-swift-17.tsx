// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { PlotChart, bars } from '@pyreon/charts/engine'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; lo: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 8 }]
export function App() {
  return (<Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { errorLow: (d) => d.lo })]} height={200} /></Stack>)
}
