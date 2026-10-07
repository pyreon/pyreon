import { Stack, Button } from '@pyreon/primitives'
import { createChartHandle } from '@pyreon/charts'
import { PlotChart, bars, line } from '@pyreon/charts/engine'

const ROWS = [{ a: 1, b: 3 }, { a: 2, b: 2 }, { a: 3, b: 1 }]

export function BoundHandle() {
  const chart = createChartHandle()
  return (
    <Stack>
      <PlotChart data={ROWS} marks={[bars((d) => d.a), line((d) => d.b)]} height={200} handle={chart} showLegend selectedMode="multiple" />
      <Button onPress={() => chart.dispatch({ type: 'select', index: 1 })}>Pin</Button>
      <Button onPress={() => chart.dispatch({ type: 'dataZoom', start: 0, end: 0.5 })}>Zoom</Button>
      <Button onPress={() => chart.dispatch({ type: 'legendInverseSelect' })}>Invert</Button>
      <Button onPress={() => chart.dispatch({ type: 'takeGlobalCursor', brushType: 'lineX' })}>Brush</Button>
      <Button onPress={() => chart.dispatch({ type: 'brush', areas: [] })}>Clear</Button>
      <Button onPress={() => chart.dispatch({ type: 'restore' })}>Reset</Button>
    </Stack>
  )
}

export function UnboundHandle(props: { act: any }) {
  const chart = createChartHandle()
  return (
    <Stack>
      <Button onPress={() => chart.dispatch(props.act)}>Non-literal action</Button>
      <Button onPress={() => chart.dispatch({ type: 'restore' })}>Reset</Button>
    </Stack>
  )
}

export function NotAHandle(props: { h: any }) {
  return <PlotChart data={ROWS} marks={[bars((d) => d.a)]} height={200} handle={props.h} />
}
