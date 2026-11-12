---
'@pyreon/compiler': patch
---

`diagnoseError` (and the MCP `diagnose` / `explain_error` tools) now explain "does not provide an export named 'jsxDEV'" from a compat package's `jsx-runtime` and "'TransitionGroup' is not exported by" `@pyreon/runtime-dom/transition`, both symptoms of the 0.53.0 packaging collision: upgrade past 0.53.0, or on 0.53.0 import `TransitionGroup` from the `@pyreon/runtime-dom` root.
