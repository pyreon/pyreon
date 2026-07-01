---
'@pyreon/router': minor
---

feat(router): typed route paths + automatic external-link handling for `<RouterLink>`

**Typed routes.** `<RouterLink>` is now generic over its `to` literal (`RouterLink<const T>` + `CheckHref<T>`). Augment the new `RegisteredRoutes` interface (a build step like `@pyreon/zero`'s `typedRoutes` can emit this) and `to` gains autocomplete + a real "did you mean …" type error on a mistyped internal path — while dynamic `string`s and external URLs are still accepted with no cast. Zero routes registered → `RoutePath` widens to `string` (the historical untyped behaviour, unchanged). This is a strict superset of `to: string`; nothing that compiled before stops compiling.

**External links.** `<RouterLink>` classifies `to` at runtime and only intercepts INTERNAL navigations. External `http(s)`/protocol-relative URLs render `<a target="_blank" rel="noopener noreferrer">` and full-navigate (no router intercept); `mailto:`/`tel:`/other schemes and `#hash` anchors render a plain `<a>` the browser owns; same-origin absolute URLs are treated as internal by default. Modifier/middle-clicks always fall through to the browser. Configure globally with `createRouter({ links: { sameOriginAbsolute, externalNewTab, externalRel } })` or override per link with the new `external` / `target` / `rel` props (explicit prop > config > auto-detect).

New public exports: `RegisteredRoutes`, `RoutePath`, `CheckHref`, `ExternalHref`, `LinkConfig` (types) + `classifyHref`, `toRouterPath` (runtime helpers).
