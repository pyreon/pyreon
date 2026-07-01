---
'@pyreon/zero': minor
---

feat(zero): typed `<Link href>` + automatic external-link handling

`<Link>` / `useLink` / `createLink` gain the same upgrades landed for `@pyreon/router`'s `<RouterLink>`, applied to the `href` API zero apps actually use.

**Typed `href` (typo-rejection).** `<Link>` is now generic (`Link<const T>`), with `href: CheckHref<T, RoutePath>` bound to zero's own route registry. Once `typedRoutes` codegen has run, a mistyped internal path is a compile error, concrete paths validate against `:param` patterns (`/posts/42` matches `/posts/:id`), and dynamic `string`s + external URLs are always accepted. This replaces the old `href: RouteHref = RoutePath | (string & {})`, which silently accepted every typo — the "typed routes reject typos" claim is now actually enforced. Strict superset of the old `string`-accepting behaviour.

**Automatic external-link detection.** `<Link>` classifies `href` at runtime (`classifyHref` from `@pyreon/router`) and only intercepts INTERNAL navigations. External `http(s)` / protocol-relative URLs now auto-render `<a target="_blank" rel="noopener noreferrer">` and full-navigate (**previously** `<Link href="https://x.com">` called `router.push("https://x.com")` unless you manually added `external` — a broken-navigation footgun); `mailto:`/`tel:`/`#hash` are left to the browser; same-origin absolute URLs are internal by default (stripped to their path). New per-link `target` / `rel` overrides join the existing `external`; a per-router `createApp({ links: { sameOriginAbsolute, externalNewTab, externalRel } })` config tunes the defaults (explicit prop > config > auto-detect).
