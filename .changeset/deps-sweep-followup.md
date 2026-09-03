---
'@pyreon/compiler': patch
'@pyreon/primitives': patch
'@pyreon/router': patch
'@pyreon/runtime-dom': patch
'@pyreon/charts': patch
'@pyreon/code': patch
'@pyreon/dnd': patch
'@pyreon/form': patch
'@pyreon/hotkeys': patch
'@pyreon/http': patch
'@pyreon/i18n': patch
'@pyreon/machine': patch
'@pyreon/query': patch
'@pyreon/rich-text': patch
'@pyreon/state-tree': patch
'@pyreon/table': patch
'@pyreon/url-state': patch
'@pyreon/validate': patch
'@pyreon/virtual': patch
'@pyreon/native-compiler': patch
'@pyreon/atlas': patch
'@pyreon/lint': patch
'@pyreon/preact-compat': patch
'@pyreon/react-compat': patch
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
'@pyreon/vue-compat': patch
'@pyreon/kinetic': patch
---

Update third-party dependencies to their latest compatible releases,
extending #3174's sweep to every package.json the first pass hadn't reached
(that pass touched only the root manifest, so nothing there tripped the
Changeset gate — this one edits per-package manifests directly and does).

Runtime dependencies that reach consumers: `oxc-parser`/`oxc-transform`
0.147 → 0.148 (`@pyreon/compiler`, `@pyreon/native-compiler`, `@pyreon/lint`
— `@oxc-project/types` alongside it), `magic-string` 1.2.2 → 1.2.3
(`@pyreon/compiler`), the CodeMirror 6 family — `@codemirror/search` and
`@codemirror/state` 6.7.1 → 6.7.2, `@codemirror/legacy-modes` 6.5.3 → 6.5.4
(`@pyreon/code`), TipTap 3.30.3 → 3.31.2 (`@pyreon/rich-text`), TanStack Query
5.102.2 → 5.102.8 across `@tanstack/query-core` and its persist/devtools
companions (`@pyreon/query`, and the shared root override so `@pyreon/http`
agrees), `@tanstack/table-core` 9.1.2 → 9.2.4 (`@pyreon/table`), the
pragmatic-drag-and-drop family (`@pyreon/dnd`) — core 3.0.0 → 3.1.0,
auto-scroll 3.1.0 → 3.2.0, hitbox 2.1.0 → 2.2.0, all in-range within the
v3 major this repo already adopted.

Dev-only comparison/tooling bumps across the touched packages: `rolldown`,
`react-hook-form`, `hotkeys-js`, `axios`, `ky`, `i18next`, `xstate`, `joi`,
`typia`, `nuqs`, `@tanstack/react-virtual`, `@tanstack/react-table`,
`@tanstack/react-query`, `motion`, `happy-dom` (deduped to one resolved
version across every package that pins it — three stale copies were
co-installed before this pass), and `mobx-state-tree` 7.4.0 → 8.0.0 — a real
major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`, which
matches what this repo already declares (`^7.0.3`); the OLD pin was the one
silently out of range.

`examples/benchmark`'s framework competitors were refreshed too so the
"fastest framework" comparisons stay honest against current releases: Vue +
`@vue/server-renderer` + `@vue/compiler-dom` 3.5.41 → 3.5.42, Svelte 5.56.10
→ 5.57.0, and Octane 0.1.46 → 0.2.2 (its peer `@octanejs/vite-plugin`
0.1.46 → 0.1.52 alongside it) — a real minor jump, verified with a clean
production build before committing to it. Octane 0.2.2 replaces the
`forBlock` fast-path flag the row-list bench's own doc comment describes
un-handicapping with a new `fastKeyedForBlock` path; the bench impl still
reaches it (confirmed by compiling `octane.tsrx` through `octane/compiler`
0.2.2 and reading the emitted flags), so the comparison stays fair, but
every previously-published Pyreon-vs-Octane number in
`.claude/skills/pyreon-benchmarks/SKILL.md` was measured against 0.1.46 and
needs re-verification against 0.2.2 before being cited again — flagged
there, not restated as fact here.

Held deliberately, each for a stated reason found by actually reading the
dependency rather than assuming: TypeScript stays capped `<7.0.0` (removes
the classic Compiler API `@pyreon/compiler`/`@pyreon/mcp`/`@pyreon/cli` are
built on). `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/
`@vitest/coverage-v8` stay on 4.1.11 as one locked unit (5.0.0 just went GA
and changes `clearMocks` to default `true`, tightens `coverage.include`/
`exclude` matching, and removes several import entrypoints — exactly the
class of change this repo's `Coverage (Full)` gate has already rotted on
three times; a real migration, not a version bump). `@changesets/cli`
2.31.1 → 3.0.1 and `@changesets/changelog-github` 0.7.0 → 1.0.0 stay put:
1.0.0 ships `"type": "module"` with no CJS export, and this repo's own
`.changeset/resilient-changelog.cjs` does `require('@changesets/changelog-
github')` — bumping it would break `changeset version` at release time with
`ERR_REQUIRE_ESM`, verified by reading the published package's `exports`
map, not assumed. The root `uuid` override stays at `11.1.1` for the same
reason, one level removed: it force-pins a transitive dep of `exceljs`
(`^8.3.0`, itself already outside its own declared range on purpose), and
`uuid` 12.0.0 dropped CommonJS support entirely — `exceljs`'s own bundled
code does `require('uuid')`, verified directly in its installed `dist/`, so
the same ESM-only trap applies one hop further down the graph.

One more found by actually running the browser test tier, not just typecheck
and the node/happy-dom suite: `@tanstack/virtual-core` was bumped 3.17.4 →
3.17.8 in this branch's first pass (a routine-looking override edit, not
vetted as carefully as the deps above), and it broke
`@pyreon/virtual`'s real-Chromium `repositions a STAYING row below when row 0
is remeasured taller` test deterministically (3/3 local runs, plus 3/3 CI
retries) — bisected down to virtual-core's own 3.17.7 "synchronous
notification for scroll compensation" change, not to anything else in this
branch (ruled out `@tanstack/react-virtual`, unrelated — not imported by this
code path at all; ruled out the `oxc-parser`/`magic-string`/`rolldown`
bumps too, by reverting each in isolation and rebuilding). Reverted back to
3.17.4, matching what's currently on `main`, and NOT bumped further.

This surfaced something that predates this PR: `@pyreon/virtual`'s own
`package.json` has declared `@tanstack/virtual-core: "^3.17.7"` since an
earlier fix (commit 973c4e323, "the root overrides pinned
@tanstack/virtual-core to 3.17.4 while three packages declared ^3.17.7, so
the installed version did not satisfy its own consumers' declared range")
— but the root override was only ever bumped to 3.17.4 there, not to
3.17.7+, so the exact mismatch that fix describes is still live on `main`
today: the declared floor and the resolved version disagree, silently,
because the currently-resolved 3.17.4 happens to still pass. Bumping the
override to actually satisfy the package's own declared range (3.17.7,
confirmed — not just 3.17.8) is what surfaces the real compatibility break
in `use-virtualizer.ts`'s remeasurement handling. Left as-is here rather
than fixed, because closing it needs either updating the wrapper for
virtual-core's new synchronous-notification timing or re-adjudicating the
test's assumptions against it — real source-level work, not a version
bump. Tracked as a known gap, not silently left broken: someone picking
this up should treat `bun run test:browser` in `@pyreon/virtual` as the
regression gate, not just `bun run test`, which does not exercise this
path at all (confirmed: the full node/happy-dom suite passes 1805/1805
regardless of which virtual-core version is resolved).
