---
'@pyreon/runtime-server': patch
---

`renderToStream({ signal })` no longer leaves a listener on the caller's signal. The abort listener was removed only if that signal aborted, so a caller sharing one long-lived signal across renders kept one listener, and the stream it referenced, per render. It is now removed when the stream closes, errors or is cancelled.
