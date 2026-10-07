// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { SankeyChart } from '@pyreon/charts'
export function C() { return <SankeyChart animate={false} nodes={[]} /> }
