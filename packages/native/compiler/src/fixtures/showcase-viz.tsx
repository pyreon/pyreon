// @ts-nocheck — PMTC handles typing; mirror of `examples/native-viz/src/VizApp.tsx`.
//
// The webview-host archetype: the four packages that cannot be reimplemented as
// native views (charts / code / flow / rich-text) cross by HOSTING their web
// engine in a native <WebView>, driven by a `data` payload. This fixture locks
// the two payload shapes that used to break, through the real swiftc/kotlinc
// gate rather than a warning count.
//
//   1. An ECharts option object — heterogeneous nesting, empty objects, arrays
//      of differently-shaped records. No struct can be synthesized for it, and
//      the tuple fallback is invalid Kotlin (`encode` is `inline fun <reified
//      T>`) and a non-Codable Swift value. It lowers as JSON now, because a
//      literal in `data=` position IS json.
//
//   2. A ProseMirror document — a heterogeneous TREE, where the branch node
//      carries `content` and the leaf carries `text`. The `PMNode` annotation
//      is load-bearing: without a type to unify the two shapes there is no
//      single struct, and the emit built one per level and could not put a leaf
//      inside a branch's array.
//
// The example itself did not build on Android at all until both were fixed.
import { signal } from '@pyreon/reactivity'
import { Stack, Text, WebView } from '@pyreon/primitives'

/** A ProseMirror node: a branch has `content`, a leaf has `text`. */
type PMNode = { type: string; content?: PMNode[]; text?: string }

export function VizScreen() {
  const revenue = signal([120, 200, 150, 80, 70])
  const source = signal('const a = 1')
  const picked = signal('none')
  const doc = signal<PMNode>({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit me.' }] }],
  })

  return (
    <Stack>
      <Text>{picked()}</Text>

      <WebView
        html="<!doctype html><html><body></body></html>"
        data={{
          xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
          yAxis: {},
          series: [{ type: 'bar', data: revenue() }],
        }}
        onMessage={(m) => picked.set(m)}
      />

      <WebView
        html="<!doctype html><html><body></body></html>"
        data={{ nodes: [{ id: 'a', label: 'A', x: 20, y: 20 }], edges: [] }}
        onMessage={(m) => picked.set(m)}
      />

      <WebView
        html="<!doctype html><html><body></body></html>"
        data={{ doc: source(), language: 'typescript', readOnly: false }}
        onMessage={(m) => picked.set(m)}
      />

      <WebView
        html="<!doctype html><html><body></body></html>"
        data={{ content: doc() }}
        onMessage={(m) => picked.set(m)}
      />
    </Stack>
  )
}
