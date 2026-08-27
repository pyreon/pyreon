---
'@pyreon/primitives': minor
---

`<WebView>` installs the reverse message bridge BEFORE it pushes the first `data`.

A hosted page commonly reacts to its very first `pyreondata` by sending something
back — an echo, a ready signal, a rendered-size report. Pushing before
`window.pyreonPostMessage` exists dropped that first response silently.

The old order happened to work with `html` (`srcdoc`), where the page's own script
runs before the host's load handler at all. It broke the moment a page was loaded
from a bundled file via `src`, where the load is asynchronous and the page's first
`send()` lands between the push and the injection. Both native runtimes install
their message handler at WebView construction, so this also stops the web from
being the odd target out.
