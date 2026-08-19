---
'@pyreon/runtime-dom': minor
'@pyreon/zero': minor
'@pyreon/atlas': patch
---

Hydration now ADOPTS a reactive accessor's server-rendered subtree instead of rebuilding it, and `@pyreon/zero` resolves the matched route before hydrating so its pages actually hydrate in place.

A function child's SSR output is bracketed by `<!--$-->…<!--/$-->`. Previously the general case (anything but a single text node) always deleted that range and re-mounted. `RouterView` renders its route through exactly such an accessor, so a zero app discarded its entire server-rendered page on every load — measured on the docs production build, 10 of 11,514 `<body>` nodes survived hydration (0.1%). Typed input, focus, scroll position and any listener attached by non-Pyreon code were destroyed on every page load, and the client rebuilt DOM the server had already produced.

`hydrateReactiveChild` now hydrates the accessor's first render against that range, bounded by the end marker the same way the async-component path bounds its own. Anything the walk does not consume is swept, so a genuine divergence degrades to the previous behaviour rather than orphaning nodes.

The SAME adoption applies to `hydrateSoleAccessorChild`, and for zero that is the load-bearing one. #2935 elides the range markers when an accessor is an element's ONLY child (the tag boundary is the extent), and `RouterView` returns `h('div', …, child)` — so zero's route takes that path. Adopting in only the marked path leaves zero at 0.1%; measured, not inferred.

That alone does not help a `lazy()` host: at hydration time the route component is not yet loaded, so the accessor's first render is the loading fallback (`null` for a route without a `loadingComponent`), which matches nothing. `startClient` therefore calls `router.preload(path, { skipLoaders: true })` before `hydrateRoot`, making the first render the real component. Loader data is unaffected — it was already seeded from `__PYREON_LOADER_DATA__`. The route chunks are `modulepreload`ed by the SSG/SSR build, so this normally resolves from cache, and the server's DOM stays visible while it does.

Measured on the docs production build, `/docs/router`: `<body>` retention 10/11,514 (0.1%) → 1,260/11,514 (10.9%). The residual is dominated by components whose compiled `_tpl` skeleton fails hydration adoption — a separate lever, which this change makes reachable for the first time in a zero app.

Also fixes a latent cleanup bug this exposed: `bindPolymorphicText` disposes its binding without removing the bound text node, so a NESTED accessor's adopted text survived its parent's re-emission. Invisible while every accessor re-mounted over a full range swap; caught by the SSR↔hydration parity fuzzer's post-flip oracle.

`@pyreon/atlas`'s SSR-parity oracle now normalizes the `<input value>` attribute, which a server can only express as an ATTRIBUTE while the client sets it as a PROPERTY. A hydrated tree shows the server's attribute and a client-mounted tree shows nothing, while the live property — what the user sees, edits and submits — is identical. That check previously passed only BECAUSE hydration rebuilt every subtree, making "hydrated" and "client mount" the same code path; adoption surfaced the difference rather than causing it. Everything else the oracle compares is untouched. Scoped to `value` alone — the narrower the exemption the smaller the hole — and it should be deleted outright once #2953 establishes `defaultValue` on a client mount, fixing the divergence at the source.
