# native-analytics — the multiplatform analytical-app proof

PRIVATE / EXPERIMENTAL. A **single `.tsx` source** that PMTC compiles to
web + iOS (SwiftUI) + Android (Compose): a data dashboard with a heavy
table and a chart hosted natively. The canonical "build a multiplatform
analytical app" example.

```bash
bun run build        # emits generated/swift/ + generated/kotlin/
bun run build:swift  # iOS only
bun run build:kotlin # Android only
```

## What it exercises (all compile clean on real swiftc + kotlinc)

- **Heavy data table from canonical primitives** — `<For each by>` over
  metric rows rendered with `<Stack>` / `<Inline>` / `<Text>`. Compiles
  to SwiftUI `VStack`/`HStack`/`Text` + Compose `Column`/`Row`/`Text`,
  keyed by `region`. **Tables are native** — no WebView needed.
- **Aggregation** — inline `reduce` column totals (`reduce(0, …)` →
  Swift `reduce(init, cb)` / Kotlin `fold(init, cb)`).
- **Numeric → string** — `String(n)` in every cell (Swift `String(n)` /
  Kotlin `(n).toString()`).
- **Heavy viz via the WebView host** — the chart is web-only-rich
  (`@pyreon/charts` / `@pyreon/flow` can't compile to native), so the
  escape-hatch primitives select per platform: `<Web>` renders an inline
  chart; `<NativeIOS>` / `<NativeAndroid>` host the SAME web chart in a
  `<WebView>` (WKWebView / Android WebView). The chart markup is a module
  `const` that const-ref resolution inlines into `PyreonWebView(html:)`.

The emitted Swift and Kotlin are locked in CI by the
`showcase-analytics.tsx` fixture in `@pyreon/native-compiler`'s
`validate-swift` / `validate-kotlin` gates (real `swiftc` + `kotlinc`).

## Architecture: heavy viz everywhere from one source

```
Native shell (primitives)  ── table, filters, totals, nav ── compiles to SwiftUI/Compose
        +
Heavy viz (charts/flow)    ── <Web> inline  |  <Native*> → <WebView> host ── policy-safe hybrid
```

Charts/flow/code/document are browser-runtime libraries; they cannot
compile to native. The WebView host runs the SAME web chart inside a
substantial native shell — a hybrid that satisfies App Store / Play
policy (not a thin web wrapper; local-bundled assets). See
`docs/src/content/docs/multiplatform.md` and the heavy-viz plan.

## Known limitation — fractional numbers (next foundational fix)

PMTC models a single `number` type that emits as `Int` on both targets;
there is no Double/Float numeric type yet. So this example uses
**integer** metrics (whole-unit revenue, deal counts, integer growth %).
Fractional values (12.5 %, currency decimals, true averages) and
`toFixed` formatting on them need the Double-numeric-type support that is
the tracked next step. An integer KPI dashboard is a real analytical
shape; fractional fidelity lifts it from "integer dashboard" to "full
analytical." (Also tracked: a `computed`'s return type infers as `Any`,
so the totals are reduced inline rather than via intermediate computeds.)
