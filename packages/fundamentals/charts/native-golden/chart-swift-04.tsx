// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { PlotChart, bars, line, waterfall } from '@pyreon/charts/engine'
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; d: number }
const mode = signal("log")
const ROWS: Row[] = [{ m: 'Jan', v: 10, d: 4 }, { m: 'Feb', v: 100, d: -2 }, { m: 'Mar', v: 1000, d: 7 }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { label: 'Value' }), line((d) => d.v)]} yScale={mode()} xTitle="Month" yTitle="Value" xLabels="rotate" height={220} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[waterfall((d) => d.d, { negativeColor: '#f43f5e', showValues: true })]} stackNormalize={false} yTime={false} height={200} />
    </Stack>
  )
}
