---
"@pyreon/zero": minor
---

`startClient` marks the container `data-pyreon-hydrated` once handlers are attached

Visible and interactive are not the same thing, and until now nothing let a
caller tell them apart. `startClient` now sets `data-pyreon-hydrated` on the
container AFTER mount/hydrate returns, so its presence means event handlers are
attached — not merely that markup arrived.

This exists because the difference is currently masked by an accident.
`RouterView` renders its route through a reactive accessor and every fs-router
route is `lazy()`, so the accessor's first render deletes the server range: the
page blanks and refills when the chunk lands. Nothing clickable exists in
between, so anything a test could match was necessarily already hydrated.

That accident disappears the moment hydration ADOPTS the server DOM instead of
rebuilding it — the direction the framework is moving. A caller then sees a
fully-rendered, visible, DEAD control and interacts with it before any handler
exists. Measured on that shape: a ~48ms window locally, unbounded on a cold
transform or a slow network.
