---
"@pyreon/primitives": minor
---

feat(native): `<WebView data={signal}>` live-data bridge

`<WebView>` gains a `data` prop — reactive data pushed into the hosted page as `window.__pyreonData` (a `pyreondata` event fires on change), so a chart/flow hosted in a WebView follows signals **without reloading**. On web the iframe's `contentWindow.__pyreonData` is set directly (same-origin / srcdoc); on native (via PMTC) the value is JSON-encoded and pushed via `evaluateJavaScript` / `evaluateJavascript`.
