// <WebView data={signal}> live-data bridge — locks the data-arg emit
// (PyreonJSON.encode / PyreonJson.encode of a @Serializable/Codable
// struct) through the swiftc + kotlinc validate gates.
import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Point = { x: number; y: number }
export function ChartView() {
  const points = signal<Point[]>([{ x: 1, y: 2 }, { x: 3, y: 4 }])
  return (
    <Stack>
      <WebView src="chart.html" data={points()} />
    </Stack>
  )
}
