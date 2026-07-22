---
'@pyreon/charts': minor
---

New `@pyreon/charts/webview` subpath — host real ECharts inside a native `<WebView>` (WKWebView on iOS, Android WebView) so full charting works on every target from one source. `buildChartHostHtml({ echartsScript? })` builds a self-contained host page (inlines your bundled ECharts for an offline, App-Store-safe page; CDN fallback for dev) that reads the pushed ECharts `option` from the `<WebView>` data bridge (`window.__pyreonData` + `pyreondata`), re-renders in place with no reload, forwards chart taps via `window.pyreonPostMessage`, and resizes via ResizeObserver (device rotation / late layout). `<ChartWebView option onSelect>` is the web-side ergonomic wrapper (emits `<WebView>`); native apps use `<WebView html={buildChartHostHtml(...)} data={option} onMessage={…}>` directly. Real-ECharts-in-a-real-iframe bridge proof in the browser suite (forward push → canvas render → in-place update; reverse tap → onSelect).
