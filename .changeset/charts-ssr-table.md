---
'@pyreon/charts': patch
---

A server-rendered chart now carries its data. The hidden accessible table used to be built through the DOM on the client only, so SSR and SSG pages shipped an empty `<table>`: crawlers, no-JS readers and anyone before hydration got the chart's name and none of its numbers. The server now writes the caption, headers and rows as markup, hydration adopts them as they are, and the client keeps them up to date from there. This applies to every chart host.

Also fixes a test that timed out under parallel load: it made about 150,000 separate assertions (~10s), and now checks the same invariant in about 100ms.
