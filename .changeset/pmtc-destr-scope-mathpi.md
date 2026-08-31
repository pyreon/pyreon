---
'@pyreon/native-compiler': patch
---

PMTC: a helper-body destructure is no longer rewritten through a stale component-scope alias — the body walker's block-scoped locals now shadow (delete) any `hookFieldAliases` entry the component classifier registered for the same names, so later reads emit the real locals instead of referencing a container that was never declared ("cannot find '__pyDestrN' in scope" on both toolchains). Also lowers the `Math.PI` member read (`Double.pi` / `kotlin.math.PI`) — previously emitted verbatim and unresolvable on Swift.
