// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { PlotChart, bollinger } from '@pyreon/charts/engine'
interface Row { label: string; value: number }
const ROWS: Row[] = [{ label: 'A', value: 1 }, { label: 'B', value: 9 }, { label: 'C', value: 2 }, { label: 'D', value: 7 }]
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.label} marks={[...bollinger((d) => d.value, 2)]} seriesLabels={['Range', 'Average']} maxPoints={3} />
}
