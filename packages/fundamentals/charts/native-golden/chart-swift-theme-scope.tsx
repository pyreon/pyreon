// Golden-only: the compile-time colour-mode / chart-theme scopes the Swift chart hosts read through the facade
// (`<PyreonUI mode>`, `<ColorModeProvider mode>`, `<ChartThemeProvider mode theme>`), nested, with a sibling after each
// so a scope that leaks past its subtree changes the output. Recorded from the PRE-MOVE emitter.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PyreonUI } from '@pyreon/ui-core'
import { ColorModeProvider } from '@pyreon/core'
import { ChartThemeProvider, PieChart, FunnelChart, chartThemes } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }, { n: 'b', v: 2 }]
export function Scoped() {
  const n = signal(0)
  return (
    <Stack>
      <Text>{n()}</Text>
      <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} showLegend height={120} />
      <PyreonUI mode="dark">
        <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} showLegend height={120} />
        <ColorModeProvider mode="light">
          <FunnelChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={120} />
        </ColorModeProvider>
      </PyreonUI>
      <ChartThemeProvider theme={chartThemes.dark}>
        <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={120} />
        <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} theme={chartThemes.light} height={120} />
      </ChartThemeProvider>
      <FunnelChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={120} />
    </Stack>
  )
}
