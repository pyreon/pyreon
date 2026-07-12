---
"@pyreon/mcp": patch
---

Fix manifest↔shipped-API drift across 15 packages + ship a prevention gate.

Package manifests' `api[].example` / `signature` blocks render VERBATIM into the MCP `api-reference` (what AI coding assistants read) and into `llms-full.txt`, but are hand-maintained and had silently drifted from the shipped exports — teaching code that wouldn't typecheck. Corrected the drift and added a gate so it can't recur.

**Real drift fixed** (example/signature corrected to match the shipped export; the shipped runtime is the source of truth):

- **@pyreon/core** — `ErrorBoundary` (no `onCatch` prop; `fallback` is `(err, reset) => VNodeChild`, `err` is `unknown`); `cx` is SINGLE-arg (`cx(["a","b"])`, not `cx("a","b")`); `mapArray` takes THREE args (`source, getKey, map`); removed the bogus `untrack` entry (it's a `@pyreon/reactivity` export, not `@pyreon/core`).
- **@pyreon/head** — `renderWithHead` is imported from the `@pyreon/head/ssr` subpath (not the main entry); `htmlAttrs`/`bodyAttrs` are `Record<string,string>` (serialize them, don't interpolate raw); `createHeadContext()` returns a value with `resolve()`/`resolveHtmlAttrs()`/`resolveBodyAttrs()`, not a `{tags, htmlAttrs, bodyAttrs}` object.
- **@pyreon/runtime-dom** — `hydrateRoot(container, root)` takes the container FIRST (reverse of `mount(root, container)`); `<Transition>` uses a required `show` accessor and has NO `mode` prop; `<TransitionGroup>` drives the list via `items`/`keyFn`/`render` props (not `<For>` children).
- **@pyreon/router** — `useTypedSearchParams` returns a `[get, set]` TUPLE (not an object); `RouterLink to` is a string; `onBeforeRouteUpdate`/`onBeforeRouteLeave` return an unregister fn; per-route `middleware` lives on a `RouteRecord`, not `createRouter` options; a redirect route still needs `component`.
- **@pyreon/compiler** — audit-finding locations expose `.relPath`/`.path`, not `.file`.
- **@pyreon/reactivity** — `effect(...)` callbacks in examples return `void` (a value-returning body doesn't typecheck).
- **@pyreon/dnd** — `For` is imported from `@pyreon/core`, not `@pyreon/reactivity`.
- **@pyreon/zero** — env helpers import from `@pyreon/zero/env`; `expandRoutesForLocales` from `@pyreon/zero/i18n-routing`; `cspMiddleware` from `@pyreon/zero/csp` with camelCase directive keys; `aiPlugin(config)` requires a config; `SitemapConfig` requires `origin`.
- **@pyreon/unistyle** — `makeItResponsive` is a styled-interpolation factory; `styles` requires `css`; `alignContent`/direction use the real unions; `extendCss` is single-arg; `breakpoints` is a const object; `createMediaQueries` takes an object and returns tagged-template fns.
- **@pyreon/virtual** — virtualizer options are FUNCTION types (`useVirtualizer(() => ({ count, ... }))`).
- **@pyreon/state-tree** — `getType(instance): unknown`; instances have no `.store`; corrected the lifecycle example.
- **@pyreon/connector-document** / **@pyreon/document-primitives** — `DocHeading level` is a tag string (`"h1"`), not a number.
- **@pyreon/sync** — `FakeCrdtAdapter.createDoc()` returns the concrete fake doc for `connectFakeDocs`.
- **@pyreon/query** — `QueryErrorResetBoundary` takes a plain subtree; use `useQueryErrorResetBoundary()` inside the fallback (no render prop).

**Prevention gate** — `scripts/check-manifest-examples.ts` (wired into `validate-fast` + CI): for every package with a `src/manifest.ts`, it typechecks each `api[].example`/`longExample` against the LIVE shipped types (subpath-aware resolution, validated symbol injection, syntax-fragment-tolerant, synthetic missing-export detection). A drift fails the gate, naming the package + api entry + TS error. Harness-limited packages (untyped ambient example data, DOM-global name collisions, alt-JSX namespaces, strict-mode-only schema libs) sit in a `NON_ENFORCED` ratchet with a per-package rationale (report-only; can only shrink). No runtime code changed — the regenerated MCP `api-reference` + `llms-full` are the only shipped artifacts affected.
