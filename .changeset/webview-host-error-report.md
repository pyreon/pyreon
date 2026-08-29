---
'@pyreon/charts': patch
'@pyreon/code': patch
'@pyreon/rich-text': patch
---

A WebView host page that cannot start now tells the host

All three host pages already detected the failure — engine missing or never
injected — set a `window.__pyreonXError` flag, and returned. That flag lives
inside the very frame nobody on the host can read from, so every target rendered
a blank box with the diagnosis stranded one origin away. On a device that is the
hardest possible failure to debug.

They now report it through the reverse bridge that was already there for
ordinary events, as `{ error: "…" }`. The report retries briefly, because the
host installs `pyreonPostMessage` on load and the page's own script runs first.
