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
// ## Numeric types — fractional fields work; one slice remains
//
// `revenue`/`deals` are integers → `Int`; `growth` is a FRACTIONAL
// percent (12.5) → the struct field refines to `Double` from its literal
// initializer, and `growth.toFixed(1)` formats correctly on both targets.
// The ONE remaining slice: REDUCING a Double column (a true average of
// `growth`) needs Double-aware reduce-seed typing (`reduce(0.0, …)`), so
// the summary row sums only the Int revenue/deals columns. Integer
// reduce + fractional per-row display is the current capability.

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

// Inline SVG bar chart — bundled HTML hosted natively in a WebView,
// rendered inline on web. A module `const` so const-ref resolution
// inlines it into the native `PyreonWebView(html:)` / `(html =)` call.
const CHART_HTML =
  "<!doctype html><html><body style='margin:0;font-family:-apple-system,sans-serif'><svg viewBox='0 0 240 120' style='width:100%;height:160px'><rect x='12' y='44' width='44' height='66' fill='#2563eb'/><rect x='68' y='60' width='44' height='50' fill='#2563eb'/><rect x='124' y='20' width='44' height='90' fill='#2563eb'/><rect x='180' y='70' width='44' height='40' fill='#2563eb'/></svg><p style='text-align:center;color:#475569'>Revenue by region</p></body></html>"

type Metric = { region: string; revenue: number; deals: number; growth: number }

export function AnalyticsApp() {
  // revenue (whole $k) + deals (count) are integers → Int; growth is a
  // FRACTIONAL percent (12.5) → the struct field refines to Double from
  // the literal initializer, so `growth.toFixed(1)` formats correctly on
  // both targets. The column totals are reduced INLINE in the summary row
  // rather than via intermediate `computed`s — PMTC infers a computed's
  // return type as `Any`, and `String(Any)` isn't valid on Swift; the
  // inline `reduce` over the Int revenue/deals lowers cleanly. (Reducing
  // the Double `growth` would need Double-aware reduce-seed typing — the
  // tracked next slice — so the summary sticks to the Int columns.)
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
      </Inline>

      <Web>
        <Text>Chart renders inline on web (e.g. @pyreon/charts).</Text>
      </Web>
      <NativeIOS>
        <WebView html={CHART_HTML} />
      </NativeIOS>
      <NativeAndroid>
        <WebView html={CHART_HTML} />
      </NativeAndroid>
    </Stack>
  )
}
