---
'@pyreon/native-compiler': patch
---

Importing a package's `/webview` bridge no longer warns that it is web-only

The blanket web-only warning normalises an import to its package ROOT, so
`import { buildChartHostHtml } from '@pyreon/charts/webview'` triggered it — and
the warning's own text then told the user to *"consume on native via the
`<WebView>` bridge subpath"*, which is exactly what they had just done.

A warning that fires on its own recommended fix trains people to ignore it. The
`/webview` subpath is the documented native bridge for a web-engine package
(ECharts, ProseMirror, CodeMirror, an elk/SVG layout), so importing it is
correct usage and is now exempt. Importing the package ROOT still warns.
