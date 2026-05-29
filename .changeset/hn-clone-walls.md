---
'@pyreon/create-zero': patch
'@pyreon/zero': patch
---

T4.2 — User-walls audit + three DX fixes shipped together.

## What

Built a Hacker News clone from scratch using `create-pyreon-app` to find real
DX friction. Documented 8 walls in `examples/hn-clone/WALLS.md` + fixed the
three highest-leverage ones in source:

### W4 (BLOCKER) — `_error.tsx` template now exposes the actual error in DEV

The scaffold's default error boundary route used to render a generic "Something
went wrong" page with **zero information** about what threw — no message in
the rendered output, no `console.error`, no stack trace. A misuse of any
framework API surfaced as a silent 500 page, undebuggable without bisecting.

**Fix** in `packages/zero/create-zero/templates/app/src/routes/_error.tsx`:

- Now accepts `error?: unknown` prop (the framework already passes it).
- Calls `console.error("[Pyreon] route error boundary caught:", err)` so the
  browser devtools / `page.on('pageerror')` listeners see the error.
- In `import.meta.env.DEV` mode, renders the error message + full stack trace
  inline in a styled `<details>` block. Production builds keep the generic
  message (no internal leakage) but still log to console.

This is the single biggest DX improvement in this PR. Cost me ~15 minutes
debugging a 3-character typo; would cost a non-fluent user hours.

### W1 (HIGH) — Scaffold no longer leaves dangling `app.store.X` refs

When scaffolding with `--features` excluding `store`, the layout template's
`useAppStore` import + `const app = useAppStore()` line were stripped but
the next two lines were left behind:

```ts
// scaffold output — broken
const sidebarOpen = app.store.sidebarOpen // app is undefined
const toggleSidebar = app.store.toggleSidebar // app is undefined
```

These threw `ReferenceError` at render time, the error was caught by the
framework's (then-silent) error boundary, and the dev server returned an
empty body. Combined with W4, this was completely undebuggable.

**Fix** in `packages/zero/create-zero/src/scaffold.ts`:

- Added two regexes that strip `const X = useAppStore()` AND
  `const X = app.store.X` lines from the body.
- Fixed the existing import-strip regex which only matched single-quoted
  paths (template uses double quotes).

### W6 — Internal `use-intersection-observer` no longer warns about itself

The framework's own `useIntersectionObserver` helper (used by
`<Link prefetch="viewport">`) registered `onUnmount(...)` INSIDE the
`onMount(...)` body, which trips the "onUnmount() called outside component
setup" dev warning. This warning fired on every page load — eroding the
warning system's signal-to-noise: real bugs hid behind the constant noise.

**Fix** in `packages/zero/zero/src/utils/use-intersection-observer.ts`:

- Switched from `onUnmount(cleanup)` inside `onMount` to `return cleanup`
  from `onMount`. Pyreon supports this cleanup-return shape and it stays
  synchronous w.r.t. the setup phase, so no warning.

## What also landed

`examples/hn-clone/` — a real HN clone built from scratch using the scaffold:

- 7 routes (top / new / ask / show / jobs / item / user) with the public
  HNPWA API
- 3 shared components (`StoryRow`, `FeedPage`, `CommentTree`)
- HN-style CSS, all server-side prerendered for the 5 static routes
- `WALLS.md` — 412-line live-narration of every friction point hit while
  building, with severity + fix suggestions for the 8 walls and 5
  architectural recommendations for the open-work plan

## Walls deliberately NOT fixed in this PR

5 of 8 walls remain — flagged for follow-up:

- **W2** (HIGH): `mode: 'ssg'` in dev produces client-only rendering with
  no warning. The dev startup banner labels routes "SSR" misleadingly.
- **W3** (LOW): file deletions under `src/routes/` need dev restart.
- **W5** (MEDIUM): `useTypedSearchParams` returns `[get, set]` tuple in a
  signal-first framework — inconsistent with other `use*` accessors.
- **W7** (MEDIUM): SSG build output duplicates `dist/client` into
  `dist/output/client` + prints confusing "Skipping SSG" log after success.
- **W8** (HIGH, architectural): SSG + `useQuery` = shell-only prerender.
  Content sites silently ship "Loading…" to crawlers. Needs either doctor
  check, scaffold update, or doc page on data-layer choice.

The three fixes in this PR are the immediately-fixable, high-leverage,
low-blast-radius ones. The other 5 need design / scope decisions before
implementation.

## Tests

- `@pyreon/zero` — 998 tests pass, 1 skipped (no regressions)
- `examples/hn-clone` — all 7 routes render correctly in real Chromium
- W4 verified: `/throw` test route surfaces "Intentional test error..."
  message + stack in the rendered body + `console.error`
- W1 verified: scaffold output of `create-pyreon-app w1-test-2 --features
query` has zero `app.store.` or `useAppStore` references
- W6 verified: `page.on('console')` warning capture returns empty on every
  page load (previously: one warning per page)
