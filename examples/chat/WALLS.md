# Chat audit — walls hit

Third user-shape audit (T4.3). Following hn-clone (PR #960, W1-W17) and
kanban (PR #982, W18-W23). Domain: real-time chat with live SSE stream

- virtualized message list — the streaming-primitive surface area no
  prior audit exercised.

This file covers **W24-W25**.

## Status

| Wall | Severity | Status in this PR                                                                         |
| ---- | -------- | ----------------------------------------------------------------------------------------- |
| W24  | medium   | **FIXED** — Zero plugin's dev `*/*` 404 handler narrowed to HTML-only Accept              |
| W25  | low      | **DOCUMENTED** — passing `computed<T>` to a child prop: pattern + type-correct call shape |

---

## W24 — Zero SPA dev 404 handler intercepts `/api/*` requests sent with `Accept: */*`

**Symptom.** A custom `configureServer` middleware registering
`GET /api/history/<channelId>` returned 404 from curl / fetch even
though the middleware logged "registered" at startup. Browser SSR-shell
requests (Accept: text/html) worked; XHR / fetch / curl (Accept: \*/\*)
did not.

**Cause.** `@pyreon/zero`'s vite-plugin registers a dev 404 handler at
`packages/zero/zero/src/vite-plugin.ts:364` that catches BOTH HTML
requests (`text/html`) AND wildcard requests (`*/*`):

```ts
if (!accept.includes('text/html') && !accept.includes('*/*')) return next()
```

`*/*` is the default `Accept` for `fetch()` and `curl`. So any plugin
registered AFTER Zero (the typical order — `plugins: [zero(...),
chatBackendPlugin()]`) has its `/api/*` handlers SHADOWED by Zero's
404 — Vite's middleware ordering is by registration time, and
`configureServer` hooks fire in plugin-array order.

The comment on Zero's 404 handler — "Accept HTML requests and
wildcard requests (fetch without explicit Accept header)" — explains
the intent (catch fetch / curl probes for unmatched routes) but
doesn't anticipate the legitimate dev API-route use case where user
plugins register their own `/api/*` middleware.

**Workaround (consumer-level).** Reorder the plugin array so the
custom backend plugin runs BEFORE `zero(...)`:

```ts
// vite.config.ts
plugins: [chatBackendPlugin(), pyreon(), zero({ mode: 'spa', ... })]
```

`enforce: 'pre'` does NOT help — that flag reorders `transform` /
`resolveId` hooks, but `configureServer` always fires in plugin-array
order.

**Fix shape.** Zero should NOT intercept `*/*` requests that look like
API calls. The simplest fix: narrow the dev 404 handler to skip when
the URL starts with `/api/`, matching the convention Zero already uses
elsewhere (the dev API-route dispatcher already special-cases
`/api/*` at line 277).

Alternative: skip the 404 handler entirely for `*/*` requests — keep
it HTML-only. The benefit of catching `*/*` (a fetch-style probe of an
unmatched URL) is debatable since `fetch()` callers already handle
404 themselves; the cost (silently shadowing user plugins) is real.

**Fix in this PR.** `vite-plugin.ts:364` — the 404 handler now skips
when the path starts with `/api/`. User plugins registering their own
`/api/*` middleware are no longer shadowed regardless of plugin order.

The legacy `*/*` catch is preserved (it still catches fetch probes for
unmatched HTML pages — that part of the original intent stands), just
gated to NOT cover `/api/*`.

**Bisect-verified.** Reverting the path skip → kanban-style chat
example's `/api/history/...` request returns 404 (the chat smoke fails
with `messages visible: 0`); restored → 200 + JSON history loads + 60
messages render.

---

## W25 — Passing `computed<T>()` to a child prop: type-system limitation

**Symptom.** Initial wiring of `<MessageList messages={visible} />`
where `const visible = computed<Message[]>(...)` produced the runtime
error `TypeError: props.messages is not a function` (from the
virtualizer's `props.messages.length` access). The child component
was typed `messages: () => Message[]` expecting an accessor.

**Cause.** Pyreon's compiler signal-auto-call rewrites bare
`computed`-variable references inside JSX (per CLAUDE.md "Auto Signal
Naming"): `<Comp prop={visible}>` becomes `<Comp prop={visible()}>`.
The compiler then wraps the resulting value-expression as
`_rp(() => visible())`. `makeReactiveProps` exposes it as a property
getter — `props.prop` returns the LIVE VALUE on each access, not an
accessor function.

So the canonical child contract for a Pyreon prop expression is the
VALUE TYPE, not an accessor. The child reads `props.messages` (no
call) inside a tracking scope to subscribe reactively. The
`messages: () => Message[]` typing was wrong at the language level.

**Companion type-system gap.** At the parent, TypeScript sees
`<MessageList messages={visible} />` where `visible: Computed<Message[]>`
but the child's prop type is `Message[]` — TS reports a mismatch even
though the compiler will unwrap correctly at runtime. The user must
either:

1. Pass `visible()` explicitly: `<MessageList messages={visible()} />`
   — TS-correct, and the compiler still wraps the resulting call as
   `_rp(() => visible())` so reactivity is preserved.
2. Cast: `<MessageList messages={visible as never} />` — works but
   ugly.

**Status: DOCUMENTED in this PR**. Adding a `CLAUDE.md` "Common
Issues & Fixes" entry covering both halves (child-type-is-value-type

- parent-passes-explicit-call). The TS-level unwrapping of `_rp` is
  out of scope for this audit — it would require a compiler-aware type
  transform.

**Workaround in the example**: pass `visible()` at the JSX call site,
type the child's prop as the value type. Reactivity is preserved end-
to-end.

---

## What this audit confirms

- Read-heavy feeds (hn-clone) didn't surface streaming-class walls — no
  long-lived dev API routes, no live data flow.
- Write-heavy CRUD (kanban) didn't surface them either — every mutation
  is client-side, the dev backend is unused.
- Live-data shape (chat) is the first place where the W24 plugin-order
  trap appears, because it's the first audit with a real custom
  `configureServer` API middleware AND `Accept: */*` fetch calls.

## What works after this PR

- Real `useSSE` connection to a dev backend (the dev plugin emits
  per-channel live messages every 2-4s).
- `@pyreon/query` `useQuery` + `useMutation` + `useSSE` composed in one
  channel route.
- Virtualized message list via `@pyreon/virtual` over a signal-backed
  message array (60+ history + appending live + auto-scroll-to-bottom).
- Channel switch reliably closes the prior SSE + opens new one
  (reactive URL on `useSSE`).
- URL-synced search filter narrows visible messages.
- Send → optimistic insert → SSE echo → reconcile by id (dedupe).
- Connection state toasts (`Reconnected` / `Connection lost`).
- Cross-tab persistence (last-visited channel restored on reload).

## Recommended next steps

1. ~~Fix W24~~ ✅ in this PR (Zero plugin path-skip on `/api/*`).
2. ~~Document W25~~ ✅ in CLAUDE.md "Common Issues & Fixes".
3. Add a lint rule for "passing `computed<T>()` to a JSX prop without
   explicit call" — would catch W25 at edit time. Deferred — needs
   compiler-aware AST analysis of declarations.
4. Audit `@pyreon/zero` dev SSR for similar `*/*`-shadowing patterns
   in non-SPA modes. Likely-impacted: the `mode: 'ssr'` SSR middleware
   at line 301 (same `accept.includes('*/*')` check) — but that one
   ALSO requires the path to NOT be a file, so the surface is smaller.
   Worth a follow-up.

Audit time: ~3-4h. Walls surfaced: 2 (W24, W25). Framework fixes: 1
(W24). Doc fixes: 1 (W25). The audit pattern is now 3-for-3.
