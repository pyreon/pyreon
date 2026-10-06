// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { Bar, Chart } from '@pyreon/charts'
interface Row { id: string; v: number }
const ROWS: Row[] = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]
export function C() { return <Chart data={ROWS} x="id" by="id"><Bar y="v" /></Chart> }
