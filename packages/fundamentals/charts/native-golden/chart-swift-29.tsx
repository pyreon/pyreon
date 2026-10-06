// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ x: string; y: number }[]>([])
  return (<Stack><PlotChart data={rows()} marks={[bars((d) => d.y, { pattern: { kind: 'symbol', color: '#000', spacing: 4, width: 1, angle: 45, symbol: 'star', spacingY: 3, image: 'a.png', repeat: 'x', shape: [{ x: 1 }, { x: 2, y: 3 }], shapeRings: [1, 2] } })]} /></Stack>)
}
