// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { Stack } from '@pyreon/primitives'
import { compact, fixed, plain } from '@pyreon/charts'
import { CandlestickChart } from '@pyreon/charts/engine'
import { PlotChart, bubble, bars } from '@pyreon/charts/engine'
interface City { name: string; pop: number; area: number; growth: number }
interface Bar { day: string; o: number; h: number; l: number; c: number }
const CITIES: City[] = [{ name: 'A', pop: 8, area: 100, growth: 3 }, { name: 'B', pop: 3, area: 40, growth: -1 }]
const BARS: Bar[] = [{ day: 'Mon', o: 10, h: 12, l: 9, c: 11 }]
export function Props() {
  return (
    <Stack>
      <PlotChart animate={false} data={CITIES} x={(d) => d.name} marks={[bars((d) => d.pop, { label: 'Population' }), bubble((d) => d.growth, (d) => d.area, { label: 'Area', minRadius: 4, maxRadius: 20, axis: 'right' })]} theme={{ label: '#222222', fontSize: 12 }} format={compact} xFormat={fixed(1)} y2Format={(v) => plain(v) + '%'} height={200} />
      <CandlestickChart data={BARS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} theme={{ grid: '#eeeeee' }} height={160} />
    </Stack>
  )
}
