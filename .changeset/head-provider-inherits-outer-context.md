---
'@pyreon/head': patch
---

fix(head): `HeadProvider` now inherits an outer `HeadContext` instead of silently shadowing it

`HeadProvider`'s context resolution was `props.context ?? createHeadContext()` — it ALWAYS allocated a fresh ctx when no explicit prop was passed, even when an outer `HeadContext` was already in scope. That defeated the documented composition `renderWithHead(h(HeadProvider, null, h(App)))` AND, structurally, the entire `@pyreon/zero` SSG/SSR pipeline (whose `createApp` mounts `h(HeadProvider, null, …)` unconditionally). Every `useHead()` call in the subtree wrote tags into the inner ctx; `renderWithHead` resolved the outer ctx and produced an **empty `<head>` string**. Static SSG output shipped with no `<title>`/`<meta>`/JSON-LD/OG tags — social scrapers and non-JS crawlers saw nothing; client hydration eventually populated `document.head` so the bug stayed invisible to standard browser inspection.

Fix:

- Resolution order is now `props.context ?? useContext(HeadContext) ?? createHeadContext()` — explicit prop wins (documented SSR / opt-out-isolation pattern), otherwise the outer `HeadContext` in scope is inherited (the missing rule), otherwise a fresh ctx is auto-created (preserves CSR-root behavior).
- Documented JSDoc + manifest summary + `docs/docs/head.md` "Context resolution" section + CLAUDE.md bug-class note.
- `nativeCompat(HeadProvider)` unchanged — compat-mode marker still relevant.

Backward compatibility:

- Apps that always passed `context={someCtx}` explicitly are unaffected (explicit prop still wins).
- Apps that mounted ONE root `<HeadProvider>` are unaffected (no outer ctx → fresh ctx auto-create path).
- Apps that nested `<HeadProvider>` and **relied on the inner one being isolated** now share the outer registry by default; that was almost always the unintended pre-fix behavior (the inner shadowed and the outer's lookup returned empty). Apps that genuinely need isolation pass `context={createHeadContext()}` explicitly.

Regression test `packages/core/head/src/tests/provider-inherits-context.test.tsx` (5 specs): the zero-shape `renderWithHead(h(HeadProvider, null, h(App)))` renders with `useHead()`-registered tags in `head`; nested `<HeadProvider>` inherits outer ctx without shadowing; explicit `context` prop still wins for isolation; CSR root with no outer ctx still auto-creates a fresh one. Bisect-verified: reverting `useContext(HeadContext) ??` → 2/5 fail with `expected '' to contain '<title>Page Title</title>'` (zero-shape) and `expected '<title>Outer Title</title>' to contain 'name="inner"'` (nested-shadow). Restored → 5/5 pass.
