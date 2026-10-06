---
"@pyreon/atlas": patch
---

`atlas verify-browser` no longer aborts the whole catalog when a component's handler has a side effect that leaves the scenario document (#3805). A plain `<a href>` navigated the workbench away and killed the run with `Execution context was destroyed`. The click-walk now suppresses default actions in-page (anchor navigation, downloads, `mailto:`, form submit/reset, `form.submit()`, `window.open`, dialogs, `history.pushState`) while still running the handlers, and reports what it suppressed as an `interaction-side-effects-suppressed` finding. A navigation no guard can prevent (`location.assign`) is detected from outside: the scenario's coverage is a skip with a `navigated-away` finding naming the destination, the workbench is reloaded, axe and the snapshot still judge the un-interacted render, and the run continues. A crash in one scenario's measurement is isolated to that scenario.
