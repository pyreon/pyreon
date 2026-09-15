---
'@pyreon/charts': minor
---

`<ChartWebView group>` — connected groups across hosted charts. Hosts sharing a `group` mirror dataZoom, legend selection, highlight/downplay and the data-anchored tooltip, the same action classes `echarts.connect` shares. Every hosted chart is its own page, so the engine's own `connect()` can never reach a sibling host; the hosted page joins the `<WebView>` host group of the same name and relays those actions through it, identically on web, iOS and Android. Closes the last pending row of the hosted capability ledger.
