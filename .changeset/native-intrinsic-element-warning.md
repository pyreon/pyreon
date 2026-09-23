---
'@pyreon/native-compiler': patch
---

A raw DOM or SVG element such as `<div>` or `<span>` in shared source now warns on both targets. It used to be written as a `div(…)` call that exists on neither iOS nor Android, with no warning. The warning names the routes: `@pyreon/primitives`, a `<Web>` branch, or, for a `<Flow>` renderer built from DOM, CSS or SVG, `<FlowWebView>` from `@pyreon/flow/webview`. The arbitrary SVG path warning names that route too.
