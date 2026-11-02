---
'@pyreon/native-compiler': minor
---

Inline global router guards now lower to iOS and Android. `beforeEach: [(to) => to.path !== '/admin']` (the most common way to write one) used to be dropped with a warning, leaving that navigation ungated natively. It now becomes a synthesized helper referenced like a named guard. The web guard shape maps too: `to.path` reads the target path and an unused `from` is dropped, for named and inline guards alike. A guard that cannot lower (one reading `to.params`, `to.query` or `from`, returning a redirect, async, or capturing a component local) is warned by name and dropped whole. The Swift and Kotlin validation stubs now declare `beforeEachGuards` / `afterEachHooks`, so guard emits are compiled in the gates rather than only string-matched.

A route table the compiler cannot read no longer fails silently. One unreadable route costs the router its whole dispatch, since the compiler never emits a partial table, and that used to happen with zero warnings, rendering only the home page on both targets. The common trigger was `path: SOME_CONST`. A module-level string constant now resolves for `path` and `redirect`, and every remaining bail names the route and the reason.
