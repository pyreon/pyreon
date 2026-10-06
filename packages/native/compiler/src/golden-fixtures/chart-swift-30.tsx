// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { Stack, Text } from '@pyreon/primitives'
import { Chart, Arc, Bar, Tooltip, Legend, Axis, Zoom, Stage } from '@pyreon/charts'
interface Row { name: string; v: number; w: number; lo: number; hi: number; r: number }
const ROWS: Row[] = [{ name: 'a', v: 1, w: 2, lo: 0, hi: 3, r: 1 }]
export function App() {
  return (<Stack><Chart data={ROWS}><Arc value="v" /><Stage value="v" /></Chart></Stack>)
}
