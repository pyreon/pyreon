---
'@pyreon/native-router-swift': minor
'@pyreon/native-router-kotlin': minor
---

Add inbound deep links — the path an app is opened at, and the paths it is sent while already running.

`useLinking()` was outbound only (`openUrl`), so nothing carried a URL the other way and an app could not be opened at a route. That rules out universal links, app links, notification taps and share targets — the ordinary reasons a URL reaches an app.

Both routers already accepted an `initialPath`; the only missing piece was a channel from the platform's URL callback to the router. `PyreonDeepLink` is that channel, and the integration is **runtime-only**: `PyreonRouter.init` consumes it through a *default argument*, so no compiler change and no change to emitted code is needed. A host forwards one line (`onOpenURL` on iOS, the launch intent plus `onNewIntent` on Android) and deep links work.

Both arrival shapes are handled, because they take different paths through the runtime: a **cold** launch (no router exists yet, so the path is held and consumed by the first router constructed) and a **warm** hand-off (a router exists, so the link is delivered straight to it).

The listener is a single slot rather than a list — deliberately. An append-only listener list on a global is the classic unbounded-growth shape, where every screen that ever built a router leaks a closure and stale routers keep navigating. One slot encodes "the newest live router owns inbound links", which is also the correct semantic.
