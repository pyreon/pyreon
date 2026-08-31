---
'@pyreon/zero-content': patch
---

`<Example>` reports a failed chunk load instead of showing its skeleton forever

`beginLoad` had no rejection handler, so an import failure left the example in its loading skeleton permanently — no error state, no console output a reader would connect to the blank box, and an unhandled rejection as the only trace. The two resolution failures (unregistered path, missing default export) already set the error state; the LOAD failure had no path to it, which is the one case that cannot be diagnosed from the page.
