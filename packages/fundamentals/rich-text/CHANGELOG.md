# @pyreon/rich-text

## 0.52.0

### Patch Changes

- Update third-party dependencies to their latest compatible releases, (ea669a1)
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
  `@tanstack/react-query`, `motion`, and `mobx-state-tree` 7.4.0 → 8.0.0 — a
  real major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`,
  which matches what this repo already declares (`^7.0.3`); the OLD pin was
  the one silently out of range.

  `happy-dom` deduped to ONE resolved version repo-wide — three stale copies
  (20.11.6/20.12.0/20.13.2) were co-installed before this pass across the ~17
  packages that each pin it independently. The unification target is
  **20.11.6, not the newest 20.13.2** — bumping past 20.11.6 breaks
  `@pyreon/styler`'s `memory-growth.test.ts` deterministically (5/5 local
  runs, plus a CI failure on `test (fundamentals+ui-system+zero)`), a pure
  `environment: 'happy-dom'` test whose eviction-cycle counting depends on
  CSSOM/`cssRules` behavior that changed somewhere between those versions —
  confirmed by isolating the version with an exact pin, not by assumption; 3/3
  clean at 20.11.6, 5/5 failing at 20.13.2. Verified pre-existing on `main`
  (3/3 passes there, at 20.11.6) so this is the same "routine bump, unvetted
  runtime behavior change" shape as the `@tanstack/virtual-core` finding
  below, just caught before push instead of by CI. The one other consumer
  pinning past 20.11.6 — `@happy-dom/global-registrator` in
  `examples/benchmark`, whose own 20.13.2 release requires `happy-dom
^20.13.2` as a peer — is reverted to `^20.11.6` alongside it, so the whole
  graph resolves to one version again.

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

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- Ship the MIT LICENSE file in the package tarball (8aeffe0)

  These eight published packages were missing a `LICENSE` file. The repo's
  own rule has always been that every package carries one ("Every package
  MUST have `LICENSE` (MIT) and `README.md` — no exceptions"), but nothing
  enforced it, so the gap went unnoticed.

  No runtime change. It matters anyway: consumers, vendoring tools and
  licence scanners read the file from the tarball, and its absence makes an
  MIT-licensed package look unlicensed at the point where that question is
  actually asked. A gate now keeps every workspace covered.

- Update third-party dependencies to their latest compatible releases. (5867cca)

  Runtime dependencies that reach consumers: `oxc-parser` / `oxc-transform`
  0.144 → 0.147 (`@pyreon/compiler`, `@pyreon/native-compiler`), the CodeMirror 6
  family (`@pyreon/code`), TipTap 3.29 → 3.30 (`@pyreon/rich-text`), TanStack
  Query 5.101 → 5.102 (`@pyreon/query`), the
  pragmatic-drag-and-drop auto-scroll/hitbox companions (`@pyreon/dnd`),
  `y-protocols` (`@pyreon/sync`), `oxlint` 1.78 → 1.80 (`@pyreon/lint`), and the
  shiki / remark / unist chain (`@pyreon/zero-content`).

  No API surface changes. Held deliberately, each for a stated reason: TypeScript
  stays capped `<7.0.0` (TS7 removed the classic Compiler API), and
  `@changesets/cli` v3, `@atlaskit/pragmatic-drag-and-drop` v3, and `ky` v2 are
  majors that need their own PRs.

- perf(rich-text): skip the redundant per-keystroke document re-serialization in `bindRichTextToSignal` (443ce7c)

  A two-way `bindRichTextToSignal` (the common draft-persistence / CMS-builder
  shape) previously paid **two full `JSON.stringify` of the entire document on
  every keystroke**: each edit flows editor → signal → back to the
  `signalToEditor` effect, which structurally compared the incoming value against
  `editor.json.peek()` only to discover it was the value it had just emitted. The
  `applyingFrom*` flags cannot catch this — Pyreon defers the cross-effect re-run
  past the synchronous block, so the flag is already `false` by the time the echo
  arrives (the code's own comment documents exactly this for the sibling guard).

  `bindRichTextToSignal` now records the exact reference it last pushed to the
  signal and short-circuits the echo re-run by identity — an O(1) test, since
  `editor.json()` / `editor.html()` return a fresh value each change. A genuine
  external write is a different reference and still falls through to the
  structural compare, so loop-prevention and external-sync behaviour are
  unchanged. Cost scales with document size, so the win grows with the document.

  Bisect-verified: reverting the guard makes the echo run two `JSON.stringify`
  per keystroke (test asserts 0); the external-write path still runs the compare.

- perf(rich-text): derive the three document counters from a single walk (0d90fb2)

  `characterCount`, `wordCount` and `isEmpty` each ran an independent full
  depth-first walk of the ProseMirror JSON on every keystroke — `isEmpty` re-ran
  the character walk a _third_ time just to test `=== 0`. A live word/char status
  bar therefore paid two-to-three full document walks (plus their per-walk string
  allocations) per keystroke, scaling with document size.

  They now derive from one `computeStats` pass. It reuses `collectBlockTexts`, so
  the word semantics are byte-identical (marks joined without a separator; block
  boundaries never merge words); `chars` is the sum of the block-string lengths —
  exactly the old `countChars`, because every text node's parent is a textblock,
  so summing per block equals summing every text node. Each counter keeps its own
  value gate, so a change that moves only `words` still re-fires only
  `wordCount`'s consumers.

  Adds a 500-document differential fuzz locking the single pass byte-identical to
  the three original formulas (nested containers, mark-split blocks,
  whitespace-only / empty text, headings). Bisect-verified: a no-separator block
  merge (the classic single-pass hazard) fails it (`words seed=3: expected 17 to
be 21`).

- A WebView host page that cannot start now tells the host (a0c4cd7)

  All three host pages already detected the failure — engine missing or never
  injected — set a `window.__pyreonXError` flag, and returned. That flag lives
  inside the very frame nobody on the host can read from, so every target rendered
  a blank box with the diagnosis stranded one origin away. On a device that is the
  hardest possible failure to debug.

  They now report it through the reverse bridge that was already there for
  ordinary events, as `{ error: "…" }`. The report retries briefly, because the
  host installs `pyreonPostMessage` on load and the page's own script runs first.

- Close two escapes in the WebView host page that could not do what they claimed (0653ff0)

  The host-page builders wrote a `background` value into a `<style>` body with `&quot;` escaping and an inlined engine bundle into a `<script>` body with a `</` → `<\/` replacement. Both are the wrong escape for their context.

  `<style>` is a RAW-TEXT element: character references are never decoded inside it, so `&quot;` was inert and a `</style>` in the value closed the element and put everything after it into the document. A real CSS colour or gradient never contains `<`, `>`, or a quote, so those are dropped now — lossless for every valid value, and `background: '#0b0d12'` and `rgb(11 13 18 / 80%)` still reach the sheet verbatim.

  For the script body, `</` → `<\/` stops the element being CLOSED but not the tokenizer entering the script-data-DOUBLE-escaped state, which it does on `<!--` followed by `<script`. In that state the page's own literal `</script>` no longer ends the element and the rest of the document becomes script content. `<!--` is broken too now. Both replacements are identity escapes in the string and regex contexts a bundle actually contains these bytes in (`\/` is `/`, `\-` is `-`), so the JS is unchanged; the one shape they alter is an Annex-B `<!--` HTML-like comment in code position, which no bundler emits.

  A `<script src>` URL is now escaped for its attribute context (`&` first, then `"` and `<`) rather than `"` alone.

  These are developer-supplied options rather than request data, so this is defence-in-depth — but a PR earlier in this cycle hardened these exact functions for the JS-string context and left both of these, and an app deriving a theme colour from content would have been exposed. `@pyreon/charts` has the same two shapes and is deliberately left alone here — it is under active change.

- Updated dependencies:
  - @pyreon/core@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/primitives@0.52.0
  - @pyreon/runtime-dom@0.52.0

## 0.51.0

### Minor Changes

- New `@pyreon/rich-text/webview` subpath — host a real TipTap WYSIWYG editor inside a native `<WebView>` (WKWebView on iOS, Android WebView) so the full editor works on every target from one source, driven by the same content/editable signals as `createRichTextEditor`. `buildRichTextHostHtml({ tiptapScript? | tiptapSrc? })` builds a self-contained host page that WAITS for a `window.TT` factory (`{ createEditor(el, { content, editable, onUpdate }) => { setContent, setEditable, destroy } }` — a ~10-line factory the app bundles with its own `@tiptap/*` + chosen extensions, since TipTap is modular ESM with no single UMD), applies `{ content, editable? }` from the `<WebView>` data bridge (replacing the document only when it changed — no reload), and posts the new TipTap JSON via `window.pyreonPostMessage` on user edits (loop-guarded against the echo of content we pushed, via the factory's `emitUpdate:false`). `<RichTextWebView state onChange>` is the web-side ergonomic wrapper (emits `<WebView>`); native apps use `<WebView html={buildRichTextHostHtml(...)} data={{ content }} onMessage={…}>` directly. Real-TipTap-in-a-real-iframe bridge proof in the browser suite (forward content push → editor renders → in-place replace; reverse edit → onChange; loop guard suppresses the pushed-content echo; editable:false → read-only). (a0c0555)

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/runtime-dom@0.51.0
  - @pyreon/reactivity@0.51.0
  - @pyreon/primitives@0.51.0
  - @pyreon/core@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/runtime-dom@0.50.0
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`f5f94ef`](https://github.com/pyreon/pyreon/commit/f5f94ef21e58b2e0430cee67a509630936d7ee73), [`db6319e`](https://github.com/pyreon/pyreon/commit/db6319edb0fc993b6319ece9b8f258b9da5e7a4d), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/runtime-dom@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`5890567`](https://github.com/pyreon/pyreon/commit/5890567189a4a46e30387ae1f87811b8735cb768), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/runtime-dom@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- [#2333](https://github.com/pyreon/pyreon/pull/2333) [`30e0b0e`](https://github.com/pyreon/pyreon/commit/30e0b0e7bad325bd12cacb2331a93f1968657a57) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external runtime dependencies to latest (safe batch): @tiptap/\* 3.28.0, ws 8.21.1, shiki 4.3.1, @clack/prompts 1.7.0. No API changes. (vite stays held at 8.0.16 tree-wide — 8.1.x breaks the zero-content compiled-JSX test pipeline; see PR for the bisect.)

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`34d68e1`](https://github.com/pyreon/pyreon/commit/34d68e1e00088c589b8362468144951d648527f2)]:
  - @pyreon/core@0.47.0
  - @pyreon/runtime-dom@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- [#2226](https://github.com/pyreon/pyreon/pull/2226) [`c986860`](https://github.com/pyreon/pyreon/commit/c9868607cc737696c39127b3565587ce8b1234db) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Content computeds are now selection-immune, character/word counts are document-derived, and `characterCount` counts visible characters.

  - **Selection moves no longer re-run content computeds.** The editor's single transaction counter was bumped by both content (`onUpdate`) and selection (`onSelectionUpdate`) events, so a pure cursor move re-ran every content computed (`text`/`html`/`characterCount`/`wordCount`/`canUndo`/`canRedo`) — a live word-counter effect re-fired on every arrow-key. The counter is now split (`docVersion` for content, `selectionVersion` for selection); content computeds subscribe to content only, while `isActive` still tracks the selection.
  - **`characterCount`/`wordCount`/`isEmpty` derive from the document JSON**, so they report accurately before the (lazy) engine mounts — a stored-ProseMirror-JSON draft has a real count without loading an editor — and after dispose.
  - **`characterCount` counts visible characters**, excluding the `\n\n` block separators `getText()` inserts between blocks (two paragraphs of `aaa`/`bbb` is 6, not 8).

  No API changes. Pre-mount count/text/isEmpty semantics for stored-JSON content are the only behavior change (previously 0/""/true).

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`5cf5387`](https://github.com/pyreon/pyreon/commit/5cf5387fb214108c694e3678a76a113b4d198fa4)]:
  - @pyreon/runtime-dom@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/runtime-dom@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/runtime-dom@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/runtime-dom@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`b15b4b5`](https://github.com/pyreon/pyreon/commit/b15b4b5b823c85babc07b9250bc4fa39a4b22d31), [`a0c82c3`](https://github.com/pyreon/pyreon/commit/a0c82c3270a8e89e69d88046b590f04588f6802f), [`16f2ad1`](https://github.com/pyreon/pyreon/commit/16f2ad130f7ba1fd0e821bf28bc59fe49787790b), [`9562f24`](https://github.com/pyreon/pyreon/commit/9562f2489e1d7176dd41b1ec52fe0fb39568b100), [`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/runtime-dom@0.39.0
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Minor Changes

- [#1866](https://github.com/pyreon/pyreon/pull/1866) [`b8b7a8a`](https://github.com/pyreon/pyreon/commit/b8b7a8a99c26a137d438abe4e13ed4cc8e9eae7d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `@pyreon/rich-text` — a reactive WYSIWYG rich-text editor built as a thin
  signal-backed layer over TipTap (MIT, framework-agnostic, ProseMirror-based),
  the same adapter shape as `@pyreon/code` (CodeMirror) and `@pyreon/charts`
  (ECharts).

  - `createRichTextEditor(config?)` — reactive instance; `editor.json` is a
    writable `Signal<JSONContent>`, with computed `html` / `text` / `isEmpty` /
    `characterCount` / `canUndo` / `canRedo`.
  - `<RichText instance={editor} />` — mount component; lazy-loads `@tiptap/*` on
    first render so the engine stays out of the initial bundle. The content area
    is a labeled `role="textbox"` multiline region (configurable `ariaLabel`).
  - `bindRichTextToSignal({ editor, signal, format })` — two-way binding (`json`
    or `html`) with built-in loop prevention, mirroring
    `@pyreon/code`'s `bindEditorToSignal`.

  MIT throughout (TipTap + ProseMirror). Real-time collaboration composes with
  `@pyreon/sync` (bind to the same `Y.Doc` XML fragment) — no paid cloud.

- [#1871](https://github.com/pyreon/pyreon/pull/1871) [`fb4d884`](https://github.com/pyreon/pyreon/commit/fb4d8847a7c41536cb1b42861fb4d8f8f2f89320) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/rich-text`: toolbar-completeness API + exhaustive docs & demo.

  - `editor.isActive(name, attrs?)` — reactive toolbar primitive for active-state
    highlighting (`isActive('bold')`, `isActive('heading', { level: 2 })`).
  - `editor.editable` — writable `Signal<boolean>` for a runtime read-only toggle.
  - `editor.wordCount` computed; `editor.undo()` / `editor.redo()` / `editor.blur()`
    helpers alongside the existing `chain()` escape hatch.
  - Exhaustive conceptual guide at `docs/rich-text` (editor API, toolbars,
    read-only, counts, two-way binding, extensions, a11y, collaboration via
    `@pyreon/sync`, SSR note) + a full-featured `fundamentals-playground` demo.

### Patch Changes

- [#1914](https://github.com/pyreon/pyreon/pull/1914) [`fe58eb6`](https://github.com/pyreon/pyreon/commit/fe58eb6ddc5aa2f087496eb0dc36021962a59677) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Harden the `@pyreon/rich-text` async-mount lifecycle — three correctness fixes in `createRichTextEditor`'s `_mount`/`dispose`, all confirmed in a real browser:

  - **Dispose-during-pending-mount no longer leaks.** `_mount` lazy-imports `@tiptap/*`, so a `dispose()` (e.g. a fast navigate-away while the chunk loads) used to land while `view` was still `null` — `dispose()` no-op'd and the resolving import then created a live ProseMirror view + contenteditable DOM that nothing tore down. A `mountToken` generation counter (bumped by `dispose()` and any newer `_mount`) now aborts the in-flight mount cleanly.
  - **Mount failures surface instead of crashing silently.** A broken extension set (e.g. `starterKit: false` with no schema-providing extension), a throwing extension, or a failed import used to become an unhandled promise rejection while the editor silently never mounted. The new `RichTextConfig.onError?: (error: Error) => void` receives the error; without it, a `[Pyreon]`-prefixed message is logged in development.
  - **Re-mounting the same instance preserves edits.** Disposing then re-mounting (the documented user-owned lifecycle) used to reset the editor to the config-time `content`, dropping every edit. A re-mount now seeds from the current document.

  No breaking changes — `onError` is additive and every existing behavior is unchanged. Regression-locked by three new real-Chromium specs (bisect-verified).

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/runtime-dom@0.38.0
  - @pyreon/core@0.38.0
