---
'@pyreon/flow': minor
---

New `@pyreon/flow/webview` subpath — host a flow diagram inside a native `<WebView>` (WKWebView / Android WebView) so a graph renders on every target from one source, driven by the same `{ nodes, edges }` model as `<Flow>`. `buildFlowHostHtml()` builds a FULLY self-contained SVG diagram renderer (no external bundle): nodes as labeled rounded rects, edges via flow's real `getBezierPath` geometry, pan + wheel/pinch zoom, fit-on-load, re-render on the forward bridge, node-tap → `window.pyreonPostMessage`. `<FlowWebView graph onSelect>` is the web-side wrapper; native apps use `<WebView html={buildFlowHostHtml()} data={graph} onMessage={…}>`. For the full interactive editor (custom-JSX nodes / connection dragging), pass a bundled `@pyreon/flow` web app as the host via the `html` escape hatch. Real SVG-render + bridge proof in the browser suite (forward push → nodes + bezier edges; real node-tap → onSelect).

Performance-tuned: rapid graph pushes / resize storms coalesce to one SVG rebuild per frame — verified by a real-Chromium perf test (coalescing, a 100-node/99-edge graph, graceful malformed-graph handling).
