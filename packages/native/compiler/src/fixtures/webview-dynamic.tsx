// Dynamic (signal-derived) <WebView> — the reactive-reload bridge slice.
// A computed builds the chart HTML from a signal; the WebView reloads
// when it changes. Locks the dynamic-html emit through the swiftc/kotlinc
// gates (PyreonWebView(html: chartHtml) must compile).
import { Stack, WebView } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function ChartView() {
  const points = signal('1,2,3')
  const chartHtml = computed(() => '<svg><text>' + points() + '</text></svg>')
  return (
    <Stack>
      <WebView html={chartHtml()} />
    </Stack>
  )
}
