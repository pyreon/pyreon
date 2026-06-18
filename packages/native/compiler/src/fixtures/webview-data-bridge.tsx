// <WebView> bridges — locks BOTH directions through the swiftc + kotlinc
// validate gates: the forward `data` push (PyreonJSON.encode /
// PyreonJson.encode of a @Serializable/Codable struct) AND the reverse
// `onMessage` handler (the page's window.pyreonPostMessage(...) → native).
import { Stack, Text, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Point = { x: number; y: number }
export function ChartView() {
  const points = signal<Point[]>([{ x: 1, y: 2 }, { x: 3, y: 4 }])
  const selected = signal('')
  return (
    <Stack>
      <WebView src="chart.html" data={points()} onMessage={(m) => selected.set(m)} />
      <Text>{selected()}</Text>
    </Stack>
  )
}
