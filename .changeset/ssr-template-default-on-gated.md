---
"@pyreon/vite-plugin": minor
---

feat(vite-plugin): `ssrTemplate` compile-to-string SSR fast path — default-on with a resolvability safety net

The compile-to-string SSR fast path (`ssrTemplate`) — which lowers eligible
static-skeleton JSX to a single `_ssr(["<li>…","</li>"], hole0, …)` string
template (card ~9× Solid, list-50 clear lead) — is now **default-on** via
`@pyreon/vite-plugin`, so every SSR app gets it automatically.

Safe by construction: the emit injects `import { _ssr, … } from
"@pyreon/runtime-server"` into app source, and `_ssr` returns an
`instanceof`-branded `RawHtml` the app's OWN `renderToString` must recognize.
So the plugin's new `ssrTemplate` option defaults to **AUTO** — it probes (once,
via Vite's own resolver) whether `@pyreon/runtime-server` resolves from the app,
enables `_ssr` when it does, and **gracefully falls back to the h() SSR path
(never a build/500 crash) + warns once in dev** when it doesn't. This closes the
class where a default-on transform 500s an app that can't resolve
`@pyreon/runtime-server` (e.g. a strict/isolated dep layout where it's only a
transitive dep). `pyreon({ ssrTemplate: true })` forces it on (you accept the
dep requirement); `false` forces the h() path.

The `@pyreon/compiler` primitive default stays **opt-in** (a bare
`transformJSX({ ssr: true })` must not silently inject a hard dep) — the
vite-plugin owns the default-on policy.

Validated end-to-end: islands-showcase (server-based, runtime-server
unresolvable → degrades to h(), 9/9 e2e green, no crash) vs ssr-showcase /
ssr-node (zero-based, resolvable → `_ssr` fast path, 22/22 + 12/12 e2e green,
`_ssr(` in the built server). Gate logic bisect-verified in
`ssr-template-gate.test.ts`.
