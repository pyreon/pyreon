// @ts-nocheck — PMTC handles typing; tsc multi-child JSX limitations are
// noisy (same `@ts-nocheck` rationale as native-tasks/src/TasksApp.tsx).
//
// PMTC Analytics Showcase — SINGLE source for web, iOS, Android.
//
// The canonical "build a multiplatform analytical app" proof. It is the
// heavy-viz architecture end-to-end from ONE `.tsx`:
//
// - **Heavy data table** — `<For>` over metric rows rendered with the
//   canonical primitives (`<Stack>` / `<Inline>` / `<Text>`); compiles to
//   real SwiftUI `VStack`/`HStack`/`Text` + Compose `Column`/`Row`/`Text`.
//   No WebView needed — tables ARE native. Keyed by region (`by=`).
// - **Aggregation** — `reduce` for the column totals + the average.
//   Lowers correctly per target (Swift `reduce(init, cb)`, Kotlin
//   `fold(init, cb)`).
// - **Heavy viz via the WebView host** — the chart is web-only-rich
//   (`@pyreon/charts` / `@pyreon/flow` can't compile to native), so the
//   escape-hatch primitives select per platform: `<Web>` renders an
//   inline chart, `<NativeIOS>` / `<NativeAndroid>` host the SAME web
//   chart in a `<WebView>` (WKWebView / Android WebView). The chart
//   markup is a module `const` — const-ref resolution inlines it into
//   the native `PyreonWebView(html:)` call.
//
// One source, three targets, the full analytical surface.
// Run it through PMTC with `bun run build` (emits generated/swift +
// generated/kotlin).
//
// ## Numeric types — full fractional fidelity
//
// `revenue`/`deals` are integers → `Int`; `growth` is a FRACTIONAL
// percent (12.5) → the struct field refines to `Double` from its literal
// initializer, and `growth.toFixed(1)` formats correctly on both targets.
// REDUCING the Double column now works too: the summary row's total
// `growth` reduces with a Double-aware seed (`reduce(0.0, …)` Swift /
// `fold(0.0, …)` Kotlin) — the seed flips to Double AUTOMATICALLY because
// the accumulation (`s + m.growth`) infers fractional. Integer columns
// keep their `Int` seed (`reduce(0, …)`). Full fractional analytical
// fidelity across the per-row display AND the aggregation.

import {
  Stack,
  Inline,
  Text,
  Heading,
  Field,
  For,
  Web,
  NativeIOS,
  NativeAndroid,
  WebView,
} from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

const TITLE = 'Quarterly Analytics'

// LIVE-DATA bar chart — a bundled HTML page hosted natively in a WebView.
// It reads `window.__pyreonData` (the metrics array PMTC JSON-encodes +
// pushes via the `data={metrics()}` bridge) and re-renders on the
// `pyreondata` event — so the chart follows the native `metrics` signal
// IN PLACE (no reload). A module `const` so const-ref resolution inlines
// it into the native `PyreonWebView(html:)` / `(html =)` call.
const CHART_HTML =
  "<!doctype html><html><body style='margin:0;font-family:-apple-system,sans-serif'>" +
  "<svg id='c' viewBox='0 0 240 120' style='width:100%;height:160px'></svg>" +
  "<p style='text-align:center;color:#475569'>Revenue by region</p>" +
  "<script>function render(){var d=window.__pyreonData||[];" +
  "var max=Math.max.apply(null,[1].concat(d.map(function(m){return m.revenue})));" +
  "var svg=document.getElementById('c');svg.innerHTML='';" +
  "d.forEach(function(m,i){var h=Math.round((m.revenue/max)*100);" +
  "var r=document.createElementNS('http://www.w3.org/2000/svg','rect');" +
  "r.setAttribute('x',12+i*56);r.setAttribute('y',110-h);r.setAttribute('width',44);" +
  "r.setAttribute('height',h);r.setAttribute('fill','#2563eb');svg.appendChild(r);});}" +
  "window.addEventListener('pyreondata',render);render();</script></body></html>"

type Metric = { region: string; revenue: number; deals: number; growth: number }

export function AnalyticsApp() {
  // revenue (whole $k) + deals (count) are integers → Int; growth is a
  // FRACTIONAL percent (12.5) → the struct field refines to Double from
  // the literal initializer, so `growth.toFixed(1)` formats correctly on
  // both targets. The column totals are reduced INLINE in the summary row
  // rather than via intermediate `computed`s — PMTC infers a computed's
  // return type as `Any`, and `String(Any)` isn't valid on Swift; the
  // inline `reduce` lowers cleanly per column. The growth total reduces a
  // DOUBLE column — its seed flips to `0.0` automatically (the
  // accumulation `s + m.growth` infers fractional), so
  // `reduce(0.0, …).toFixed(1)` typechecks; the Int columns keep their
  // `0` seed.
  const metrics = signal<Metric[]>([
    { region: 'EMEA', revenue: 1240, deals: 38, growth: 12.5 },
    { region: 'APAC', revenue: 980, deals: 27, growth: 8.3 },
    { region: 'AMER', revenue: 1530, deals: 51, growth: 15.1 },
    { region: 'LATAM', revenue: 610, deals: 19, growth: 9.7 },
  ])
  const filter = signal('')

  return (
    <Stack gap="md" padding={4}>
      <Heading level={1}>{TITLE}</Heading>
      <Field label="Filter region" value={filter} />

      <Inline gap="md">
        <Text>Region</Text>
        <Text>Revenue</Text>
        <Text>Deals</Text>
        <Text>Growth %</Text>
      </Inline>

      <For each={metrics()} by={(m) => m.region}>
        {(m) => (
          <Inline gap="md">
            <Text>{m.region}</Text>
            <Text>{String(m.revenue)}</Text>
            <Text>{String(m.deals)}</Text>
            <Text>{m.growth.toFixed(1)}</Text>
          </Inline>
        )}
      </For>

      <Inline gap="md">
        <Text>Total</Text>
        <Text>{String(metrics().reduce((s, m) => s + m.revenue, 0))}</Text>
        <Text>{String(metrics().reduce((s, m) => s + m.deals, 0))}</Text>
        <Text>{metrics().reduce((s, m) => s + m.growth, 0).toFixed(1)}</Text>
      </Inline>

      <Web>
        <Text>Chart renders inline on web (e.g. @pyreon/charts).</Text>
      </Web>
      <NativeIOS>
        <WebView html={CHART_HTML} data={metrics()} />
      </NativeIOS>
      <NativeAndroid>
        <WebView html={CHART_HTML} data={metrics()} />
      </NativeAndroid>
    </Stack>
  )
}
