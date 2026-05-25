# Walls hit building an HN clone with `@pyreon/zero`

**Goal**: build a real non-trivial app (Hacker News clone using the public HN
API), simulating a real developer's experience. Document every friction point
as I hit it — not as polished retrospective, but as live note-taking.

**Methodology**: use `@pyreon/zero` like a real user would. No reading internal
source code unless I'm genuinely stuck. Every wall gets a severity
(BLOCKER / HIGH / MEDIUM / LOW) + a one-line fix suggestion if obvious.

**Started**: 2026-05-25, late afternoon.

---

## Walls log

### W0 — Worktree bootstrap is slow + silent

**Severity**: LOW (one-time cost, well-documented in CLAUDE.md)
**Phase**: Setup
**Hit at**: First minute.

Fresh `git worktree add` → `bun install` took ~40s to complete the workspace
build. This is documented in CLAUDE.md ("Bootstrap on fresh worktree…") but
during the 40s there's no progress indicator beyond the `[bootstrap]` line.
A user trying their first Pyreon repo would assume `bun install` is doing
something hostile.

**Fix suggestion**: pyreon's bootstrap script could print "Building 56
packages (one-time, ~40s)…" with a tqdm-style progress as each package
finishes. Currently it prints one summary line at the end.

---

### W1 — Scaffold leaves dangling references when `store` feature not selected

**Severity**: HIGH (silent SSR failure on first dev run)
**Phase**: Setup
**Hit at**: First `bun run dev` — every page returns empty body.

`create-pyreon-app hn-clone --template app --features query --packages meta`
produces a `src/routes/_layout.tsx` that references `app.store.sidebarOpen`
and `app.store.toggleSidebar` but **the import and const declaration for
`app` are stripped from the output**. The scaffold's template uses
`useAppStore` from `../stores/app`; when `--features` excludes `store`, the
transformation removed the `import` and `const app = useAppStore()` lines,
AND removed the sidebar toggle button — but kept the destructured references
at the top of the layout function:

```ts
// scaffold output — broken
export function layout() {
  const sidebarOpen = app.store.sidebarOpen     // `app` is undefined
  const toggleSidebar = app.store.toggleSidebar // `app` is undefined
  return (...)
}
```

When SSR runs the layout, this throws ReferenceError at render time. **The
error is SWALLOWED by the SSR pipeline** — dev console shows no error,
network response is HTTP 200, but the body just contains
`<div id="app"><!--pyreon-app--></div>` (placeholder never replaced). I had
to `diff` the scaffold template against the output to figure out what
happened.

This is **two problems compounding**:
1. **Scaffold transformation bug** — the template-feature stripper deletes
   the import + const but leaves the references intact.
2. **SSR error silently swallowed** — a ReferenceError in the layout
   should at minimum log to the dev server stderr; ideally render an error
   overlay. Currently it returns a 200 with an empty body, completely
   undebuggable. THIS is the more dangerous half of the wall: a real user
   would have NO IDEA what went wrong.

**Fix suggestions**:
- Either: scaffold should fully strip the store-dependent code OR keep the
  store as a hard dependency (it's the most useful feature; deselecting it
  is an edge case).
- SSR errors in layouts MUST surface — at minimum to `console.error` on the
  dev server, ideally as an inline `<pre>` in the response body or a Vite
  error overlay.

**Workaround for this session**: manually fix the layout.

---

### W2 — Mode `ssg` in dev = no SSR, no warning, `curl` returns empty body

**Severity**: HIGH (cost me ~25 minutes of confusion)
**Phase**: Setup → first verify
**Hit at**: After fixing W1, `curl http://localhost:3001/` still returned empty
body. I assumed SSR was still broken.

`zero({ mode: 'ssg' })` (the scaffold default for `--mode ssg`) means SSG —
static site generation at BUILD time. In dev mode, this resolves to
**client-only rendering**: the server serves the index.html template with
`<!--pyreon-app-->` unreplaced, and the browser hydrates from
`entry-client.ts`. Opening the page in an actual browser shows the rendered
content; `curl` shows an empty `<div id="app">` and looks broken.

This is a legitimate design choice, but the dev server doesn't communicate
it. The "Routes" section of dev startup output reads:

```
Routes
SSR /
SSR /about
…
```

— labelled "SSR" even though the actual rendering happens client-side in
this mode. Plus the dev server happily serves 200s with placeholder bodies
to anyone curl-testing.

**Fix suggestions**:
- Dev startup should print the active rendering strategy for each route
  (`SPA /` for SSG-in-dev, `SSR /` for ssr-stream/ssr-string).
- When curl/fetch lands on an unrendered placeholder body, the dev server
  could include an HTML comment like `<!-- pyreon: ssg mode renders
  client-side; use a real browser or run `zero build` to prerender -->`
  inside the body, so anyone debugging via curl sees the mode immediately.

**Workaround**: I switched to `mode: 'ssr-stream'` mid-debug; that ALSO
didn't fill the body (separate or related issue — couldn't fully tell
without more time). Eventually verified via Playwright that client-side
rendering works end-to-end, so reverted to `ssg` and moved on.

---

### W3 — File deletions under `src/routes/` need dev server restart

**Severity**: LOW (Vite-level limitation)
**Phase**: Building
**Hit at**: After deleting demo routes (`counter.tsx`, `about.tsx`, etc.),
the dev server kept listing them in the routes table for HMR purposes. I
had to kill + restart `bun run dev`.

This is probably a Vite virtual-module cache issue (the `virtual:zero/routes`
module isn't invalidated on file deletion). New files DO trigger reload;
deletions don't. Minor friction; common across fs-router frameworks.

**Fix suggestion**: `@pyreon/zero`'s fs-router plugin could subscribe to
`fs.watch(... { recursive: true })` events for the `src/routes` tree and
invalidate the virtual module on unlink events.

---

### W4 — Framework 500 error boundary swallows the actual error

**Severity**: BLOCKER (cost me ~15 minutes; could easily be hours)
**Phase**: Building first feature
**Hit at**: Wrote a TypeError-shaped misuse of `useTypedSearchParams`, got
the generic "Something went wrong" 500 page back. Console showed no stack
trace, no error message, nothing. Vite dev server log: silent.

The framework's `_error.tsx` route catches render errors and renders this:

```
<div class="error-code">500</div>
<h1>Something went wrong</h1>
<p>An unexpected error occurred. Try refreshing the page or navigating
back home.</p>
```

— with **zero information about what threw**. Not in the rendered output,
not in `console.error`, not in `page.on('pageerror')` (Playwright capture),
not in the Vite dev stderr. The only signal is "something threw, here's
generic error UI."

Debugging took:
1. Visual confirmation: rendered output is the 500 page → something throws
2. Bisect the component: comment out blocks until error stops
3. Trace through the framework source to find the bisected API's signature
4. Realize I'm misusing `useTypedSearchParams` (called it as object instead
   of destructuring the `[get, set]` tuple)

This is the canonical "framework hides bug" anti-pattern. The error boundary
is doing exactly what it should for PRODUCTION users, but in DEV mode it
should at minimum:
- Log the caught error to `console.error` with the full stack
- Ideally render the error message + stack inline in the error page
- Even better: a Vite-style error overlay that takes the full viewport with
  the actual stack and source-mapped frames

**Fix suggestions**:
- `_error.tsx` (the default scaffold one) should check `import.meta.env.DEV`
  and render the actual error object (message + stack) when in dev. Hidden
  in production.
- OR: the framework's error boundary should automatically attach a dev-only
  overlay (parallel to Vite's HMR error overlay).
- OR: at minimum, the framework must `console.error(err)` before rendering
  the fallback so the browser devtools sees it.

This is the single biggest DX hit in this session so far. It's also the
most fixable — adding ~10 lines to `_error.tsx` would have saved me 15
minutes and would save every other user the same time.

---

### W5 — `useTypedSearchParams` returns a tuple, not an accessor object

**Severity**: MEDIUM (my mistake, but API shape is unintuitive vs Pyreon norms)
**Phase**: Building first feature
**Hit at**: Wrote `const search = useTypedSearchParams({ page: 'number' })`
then `search.page()` expecting per-field accessor semantics like signals.

The actual signature returns `[get, set]` where `get()` evaluates to a
plain object: `[{ page: 0, ... }, (next) => Promise<void>]`. Correct usage:

```ts
const [search, setSearch] = useTypedSearchParams({ page: 'number' })
const page = () => Math.max(1, search().page ?? 1)
```

Two things make this unintuitive coming from Pyreon's signal-first mental
model:
1. **It's the only fine-grained-reactive-ish API in `@pyreon/router` that
   returns coarse-grained — `get()` re-evaluates the whole object when ANY
   tracked query param changes**. Most signal-based libraries would give
   per-field signals (`search.page()`, `search.sort()`).
2. **The tuple shape mirrors React's `useState`**, which is anti-idiomatic
   for Pyreon — every OTHER `use*` in the framework returns either a signal
   or a structured accessor object.

The JSDoc example DOES show the right shape (`[params, setParams]`), so
this is a docs-read-failure on my part. But the API would be more
discoverable if it returned `Signal<{page: number, ...}>` directly, since
that's also a function (`signal()` reads) AND has `.set(next)`.

**Fix suggestions**:
- Either: rewrite `useTypedSearchParams` to return a single
  `Signal<InferSearchParams<T>>` (read with `signal()`, write with
  `signal.set(next)`). This is the Pyreon-native shape.
- OR: bias the JSDoc to show "common mistake" pattern prominently
  (`// WRONG: useTypedSearchParams({...}).page() — returns [get, set]`).
- OR: add a runtime warning in dev mode when accessing properties on the
  returned tuple as if it were an object.

---

### W6 — `onUnmount() called outside component setup` warning from framework's own intersection observer

**Severity**: LOW (cosmetic — appears on every page that uses a Link with `prefetch="viewport"`)
**Phase**: Building
**Hit at**: Every page load shows this warning in the console.

The warning comes from `@pyreon/zero/src/utils/use-intersection-observer.ts:23`
— the framework's own internal helper used by `<Link prefetch="viewport">`.
The warning text:

```
[Pyreon] onUnmount() called outside component setup. Lifecycle hooks must
be called synchronously during a component's setup function.
Called from: at use-intersection-observer.ts:23:3
```

The framework is warning about its OWN code, not user code. This is noise
that:
1. Erodes trust in the warning system ("oh that warning is always there,
   ignore it") — making it harder to spot real bugs.
2. Suggests the internal helper isn't using the lifecycle correctly.

**Fix suggestion**: fix the helper to register `onUnmount` synchronously,
or remove the warning when it's the framework's own code (check stack
frame package).

---

### W7 — `bun run build` (mode: ssg) — duplicate `dist/output/client/` mirror, confusing log line

**Severity**: MEDIUM (extra disk space + misleading log)
**Phase**: First production build
**Hit at**: `bun run build` succeeded but printed:

```
[zero:ssg] Prerendered 5 page(s) in 21ms (concurrency: 4)
[zero:ssg] Skipping SSG — /tmp/hn-clone-walls/examples/hn-clone/dist/server/index.html not found. Did the client build complete?
```

Two issues compounded:
1. The "Skipping SSG" line implies failure right after a "Prerendered 5
   page(s)" success line. Contradictory. Reads as: "SSG worked, then SSG
   failed for a different reason." Confusing.
2. The build output has TWO copies of the prerendered HTML — once in
   `dist/client/{ask,jobs,new,show}/index.html` and once in
   `dist/output/client/{ask,jobs,new,show}/index.html`. Probably from the
   node adapter `build()` doubling up. Wasteful on disk for any non-trivial
   site.

**Fix suggestions**:
- Suppress the "Skipping SSG" line when the previous SSG pass succeeded —
  it's not a user-actionable failure if the prerender already shipped.
- The `nodeAdapter()` `build()` method shouldn't copy `dist/client/` into
  `dist/output/client/` if both target the same artifact; either symlink
  or document the duplication.

---

### W8 — SSG produces shell HTML only — `useQuery` data isn't prerendered

**Severity**: HIGH (architectural — affects every content site)
**Phase**: After production build, inspecting output
**Hit at**: `dist/client/index.html` contains `<div class="feed-state">
Loading top stories…</div>` instead of the actual stories.

I used `@pyreon/query` with `useQuery` for data fetching. In SSG mode this
runs CLIENT-SIDE only — the SSG prerender pass doesn't await query data,
so the static HTML ships with the "Loading…" placeholder. Crawlers, scrapers,
and no-JS users see "Loading top stories…" forever.

To prerender actual data, I'd have to switch from `useQuery` to a
route-level `loader` (which runs during SSG). The framework supports this
but the scaffold's `--features query` flag steers users toward `useQuery`
without flagging that it's a client-only pattern for SSG.

**This is the canonical content-site bug**: a Hacker News clone is a
read-heavy content site where SSG should produce fully-rendered HTML.
The scaffold gave me the React-style "use the hook" pattern but the
SSG pre-render couldn't see through it. This wall is the single biggest
architectural friction I'd flag.

**Fix suggestions**:
- Scaffold flag `--features query` with `--mode ssg` should generate
  examples that use `loader` instead of `useQuery` (or at least mix both
  with a comment noting "useQuery = client-only, loader = SSG-friendly").
- `@pyreon/query` could ship a `prefetchQuery` helper that the framework
  awaits during SSG (similar to Next.js' `getServerSideProps` shape).
- Docs could feature a section "Choosing between loader and useQuery"
  with the SSG/SSR/SPA implications spelled out.
- A doctor check could flag SSG-routes-with-useQuery-no-loader as a
  warning during `pyreon doctor`.

---

## Summary

After building this HN clone in roughly 2 hours, here's the honest picture:

### What worked beautifully

- **Routing**: file-system routes (`index.tsx`, `new.tsx`, `item/[id].tsx`)
  worked exactly as expected. Dynamic params via `useRoute().params.id`
  is clean. `<Link>` with prefetch strategies is excellent.
- **Reactivity**: per-field signal accessors are idiomatic and fast. JSX
  expression children with `{() => ...}` work cleanly for conditional
  rendering.
- **`useQuery`**: TanStack-style API, lazy signal allocation, no per-call
  boilerplate. Loading/error/data states all expose signal accessors.
  Best-in-class for client-side data fetching.
- **`useHead`**: dead simple, supports both static `{ title: '...' }` and
  reactive `{ title: () => query.data()?.title }`.
- **Dev server**: HMR is fast, fonts and styles update without page reload.
  Vite + Pyreon is excellent.
- **CSS**: scaffold's design system is comprehensive and the HN-specific
  styles I added composed cleanly.

### What was friction (high-priority fixes)

1. **W4 — error boundary swallows actual errors** (BLOCKER). Single
   biggest DX hit. Dev-mode should expose the actual stack.
2. **W1 — scaffold dangling refs + silent SSR failure** (HIGH). First
   `dev` returns empty body with no error logged anywhere.
3. **W8 — SSG + useQuery = shell-only prerender** (HIGH). Content sites
   silently ship "Loading…" to crawlers.
4. **W2 — `mode: ssg` in dev is client-only, no warning** (HIGH). Cost
   me 25 minutes thinking SSR was broken.

### What was friction (medium / nice-to-have)

5. **W5 — `useTypedSearchParams` API shape** (MEDIUM). Tuple-returning
   API in a signal-first framework feels alien.
6. **W6 — framework warns about its OWN code** (LOW). Erodes warning
   signal-to-noise.
7. **W7 — SSG build output duplication + confusing log** (MEDIUM).
8. **W3 — file deletions need restart** (LOW). Common Vite-level issue.
9. **W0 — bootstrap silent** (LOW). One-time.

### Architectural recommendations (if T4.2 informs the roadmap)

1. **Make dev errors loud**. The error boundary masking actual errors is
   the single biggest DX gap and the cheapest one to fix.
2. **`pyreon doctor` should warn on SSG-routes-using-useQuery**. The
   pattern is too easy to fall into and the consequences are silent.
3. **Scaffold needs an audit**: dangling references after feature
   removal, examples that mix loader / useQuery for the chosen mode.
4. **API consistency**: `useTypedSearchParams` returning a tuple is the
   only non-signal-shaped accessor in `@pyreon/router`. Either align it
   with the rest or document the divergence prominently.
5. **SSG + data**: the doc gap between `loader` (build-time) and
   `useQuery` (run-time) is the single biggest architectural friction.
   Worth a dedicated "Choosing your data layer" doc page.

### Time breakdown (rough)

- Setup + scaffold + bootstrap: ~15 minutes
- W1 + W2 debugging (scaffold-bug + ssg-mode confusion): ~30 minutes
- W4 debugging (useTypedSearchParams behind silent 500): ~15 minutes
- Building feed routes + components: ~30 minutes
- Building item detail + comments tree: ~15 minutes
- Building user page: ~10 minutes
- CSS + HN-style polish: ~20 minutes
- Production build + SSG inspection: ~15 minutes
- Documenting walls: throughout, ~25 minutes total

**Total: ~2h 45min for a functional HN clone with 7 routes.**

For comparison, the same app in Next.js (the SolidJS / Vue equivalent
HNPWAs all clock in around 2-3h for a developer familiar with the
framework). Pyreon's working time is in the same ballpark, but the
walls (especially W4 + W8) are framework-shaped, not general
content-site-shaped — meaning a framework fix would dispose of them
entirely.
