# @pyreon/code

## 0.52.0

### Patch Changes

- Close the pre-release audit's long tail: a fail-open URL guard, an inert verification axis, an unnecessary supply-chain surface, and two overstated claims (8563e97)

  **`isSafeImageDataUri` failed OPEN on a malformed percent-escape.** The base64 branch returns "unsafe" when `atob` throws; the percent branch caught the `decodeURIComponent` failure, kept the raw still-encoded payload, and scanned that — but the scripted-SVG regex matches `<script` and ` on…=`, neither of which appears in `%3Cscript%3E`. So one trailing `%` took a payload from blocked to allowed. The function's own docstring already promised the base64 branch's behaviour for both, so the two branches disagreeing was the whole defect. Scoped to `src`/`srcset`/`poster` on image/video elements where a scripted SVG does not execute, so this is defence-in-depth — reported because a guard that fails open is worse than one that does not exist: it is relied on.

  **`@pyreon/atlas`'s route axis was inert.** `installRouter` had zero callers and `Scenario.route` had zero readers while `routerPlugin` was publicly exported, so a `routerPlugin({ urls })` config produced the expected doubled scenario count with names like `Profile @ /users/999` — and every one passed having mounted with no router installed. Two different URLs rendered byte-identically and both reported `pass`. The router is now installed around the scenario mount through a registration seam (the plugin publishes an installer; the plugin that owns mounting consumes it, so there is still ONE owner of the router's install/dispose), disposed in the same window so it cannot answer for the next scenario, and a route that CANNOT be applied is reported as a finding rather than passing silently.

  **`@pyreon/code`'s 15 `@codemirror/lang-*` packages move from `optionalDependencies` to optional peers.** `optionalDependencies` reads as optional and is not: every package manager installs them by default, so every consumer carried their install weight and CVE surface for grammars they never load. Each is reached through a lazy `import()`, which is exactly the shape `@pyreon/document` moved to `peerDependenciesMeta.optional` for the same reason.

  **The Vercel revalidate handler compares its secret in constant time.** It was `secret !== expected` under a comment calling it "constant-time-ish"; `!==` short-circuits at the first differing byte regardless of length, which is precisely the leak the phrase claimed to avoid. Length is compared separately because `timingSafeEqual` requires equal-length buffers — that leaks the secret's LENGTH, which is stated rather than hidden.

  **`serverIsland` documents that its props are client-controlled.** The fragment endpoint is public and unauthenticated; the island NAME is allowlisted, the props are not, so a fragment renders with attacker-chosen props inside a full request context. That is the intended design, but neither the JSDoc nor the manifest said so — an island that reads a `userId` prop and returns that user's data is an IDOR by construction. Now named as the first entry in the API's `mistakes`, so it reaches `llms.txt` and the MCP reference too.

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

- Every rule now runs on this monorepo, and every rule is proven to fire. (ec0aff6)

  Three silent holes, each the same shape — a capability that worked for a
  hand-maintained subset, where being outside the subset was indistinguishable
  from being inside it.

  **Two rules could never fire.** `pyreon doctor`'s lint gate scans each
  package's shipped `src/**` minus tests, fixtures and `.d.ts`. Two rules'
  subject is exactly what that removes: `no-query-selector-cast-in-test` and
  `vitest-config-uses-shared`. Both were configured `error`; 2,159 test files
  and 115 vitest configs existed and **none were in scope**. A rule now declares
  its surface via `RuleMeta.scanTarget` (`'source'` | `'test'` |
  `'packageConfig'`) and the gate collects what the enabled rules need, each
  extra target as its own pass with every other rule off — running the full set
  over tests would reintroduce the fixture noise the exclusions exist to prevent.

  Turning them on found **280 `querySelector(…) as HTMLX` sites across 92
  files** — the exact class `no-query-selector-cast-in-test` exists to prevent,
  re-accumulated since PR #963 eliminated 122 of them. They are routed to the
  advisory ratchet at a seeded baseline of 280, which can only shrink. That is
  strictly more enforcement than the zero they had, and the burn-down is a
  follow-up.

  **`exemptPaths` was honoured per rule** — a rule had to call `isPathExempt`
  itself and **55 of 101 did not**, so an exemption configured for one of those
  parsed, validated, and did nothing. It is now applied centrally in the runner,
  before `rule.create()`, so it means the same thing for every rule by
  construction.

  Because it is now a runner-level option rather than a per-rule one, option
  validation recognises it on every rule — configuring it on a rule whose schema
  omits it used to warn `unknown option "exemptPaths"` about an exemption that
  demonstrably works. The 46 per-rule `isPathExempt` bails are deleted: the
  central skip runs before `rule.create()`, so they were unreachable.

  **A config key naming nothing was silently ignored.** This repo shipped
  `pyreon/dangerously-set-inner-html` — with an `exemptPaths` list — for a rule
  that has never existed. Unknown `rules` / `groups` keys are now config
  diagnostics with a did-you-mean.

  **Verification:** a new fires-invariant asserts all 101 rules produce their
  diagnostic on a defect fixture and stay silent on the corrected one, with only
  that rule enabled, and asserts the fixture map is total over the registry.
  Building it found 13 fixtures wrong and **zero broken rules** — and it then caught the new rule below before it had a fixture, which is the case it exists for.

  **New rule — `pyreon/no-unsanitized-inner-html`** (opt-in, `warn`). Pyreon
  assigns `dangerouslySetInnerHTML`'s `__html` **raw** by design — React parity,
  the developer owns sanitization, and unlike the sibling `innerHTML` prop no
  sanitizer applies. That is the most direct XSS vector a Pyreon app has, and it
  was caught by nothing. The gap was recorded but not closed: the ghost config
  entry above was `pyreon/dangerously-set-inner-html`, complete with an exemption
  for the one file that legitimately uses it.

  It stays quiet on everything it cannot prove — a string literal, a
  substitution-free template literal, a sanitizer call, and one hop through a
  same-file `const`, so the idiomatic `const clean = DOMPurify.sanitize(dirty)`
  is recognised. Opt-in because it is a judgement call about a prop that is
  legitimately used with your own sanitizer.

  It found **4 raw sinks** in this repo, ratcheted alongside the others. One is
  worth a look on its own: `<Icon svg={…}>` renders caller-supplied markup raw,
  so an app passing untrusted SVG through it has an XSS hole. The other three
  are library output (mermaid, katex) and an `aria-hidden` gutter built from
  line numbers.

  **Also fixed:** the code editor's gutter line numbers failed WCAG AA — 2.45:1
  (light) and 2.63:1 (dark) against a 4.5:1 requirement. Now 4.55:1 and 4.75:1,
  one palette step each.

  The repo's config runs all 101 rules: non-opt-in at `error`, opt-in at
  advisory severity so the ratchet locks them at zero. Four rules stay off with
  stated reasons — `no-ternary-conditional` and `no-and-conditional` are style
  preferences whose own docstrings say they are not correctness rules, and
  gating CI on them would fail correct code.

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

- **Breaking (pre-1.0):** grammars now load from a REGISTRY, and the core registers only the JavaScript family (js/ts/jsx/tsx — one package) plus JSON. Every other built-in grammar moves behind a new `@pyreon/code/languages-all` entry: (77eaf81)

  ```ts
  import "@pyreon/code/languages-all"; // css, python, markdown, html, rust, sql, xml, yaml, cpp, java, go, php, ruby, shell
  ```

  Why: a dynamic `import()` is lazy at RUNTIME but not to a bundler's dependency scanner, which follows the specifier at build / dev-server-start time. The old single map naming eighteen `@codemirror/lang-*` packages therefore pulled the whole language ecosystem into every consumer's pre-bundle step, even one that only ever shows TSX — measured taking a dev-server-backed command from ~27s to over five minutes. The map's "only the requested language is imported" comment held for the shipped bundle and quietly failed for the dep graph.

  New API: `registerLanguage(id, loader)` (plus the `LanguageLoader` type) registers a grammar the package does not ship, or replaces one that it does.

  Also: an unregistered or failed grammar still mounts the editor unhighlighted — as before — but now WARNS in dev naming the fix, instead of returning an empty extension silently. "The editor renders but nothing is coloured, and nothing says why" was close to undiagnosable.

  And the package's headline feature finally has tests: real-Chromium specs assert CodeMirror emits highlight spans, including in the read-only/no-gutter/wrapped shape a docs surface uses.

- New `@pyreon/code/webview` subpath — host a real CodeMirror 6 editor inside a native `<WebView>` (WKWebView on iOS, Android WebView) so the full editor works on every target from one source, driven by the same value/language/read-only signals as `createEditor`. `buildCodeHostHtml({ codemirrorScript? | codemirrorSrc? })` builds a self-contained host page that WAITS for a `window.CM` namespace (`{ EditorView, EditorState, Compartment, basicSetup, languageFor? }` — the app bundles its own `@codemirror/*`, exactly like `buildChartHostHtml({ echartsScript })`, since CodeMirror 6 is modular ESM with no single UMD), applies `{ value, language?, readOnly? }` from the `<WebView>` data bridge (cursor-preserving doc replacement + Compartment reconfigure — no reload), and posts new text via `window.pyreonPostMessage` on user edits (loop-guarded against the echo of a value we pushed). `<CodeWebView state onChange>` is the web-side ergonomic wrapper (emits `<WebView>`); native apps use `<WebView html={buildCodeHostHtml(...)} data={{ value, language }} onMessage={…}>` directly. Real-CodeMirror-in-a-real-iframe bridge proof in the browser suite (forward value push → editor renders → in-place doc replace; reverse edit → onChange; loop guard suppresses the pushed-value echo; readOnly applies). (a0c0555)

### Patch Changes

- Pin `@codemirror/language` to a single version. It hosts both the `Language` facet and `syntaxHighlighting`, so two resolved copies mean the highlighter never recognises the parser's tree — the editor mounts, the text renders, and nothing is coloured, with no error anywhere. The lockfile carried 6.12.3 alongside 6.12.4, which only bit on a clean install (a warm local tree that happened to dedupe never showed it). Its siblings `@codemirror/state` and `@codemirror/view` were already pinned in the root `overrides` for exactly this reason; `@codemirror/language` simply was not. A browser spec now asserts the single-instance invariant directly, so a future dependency-graph regression fails by name instead of as unexplained missing highlighting. (77eaf81)
- `@pyreon/loom`: the phantom detector now recognizes the DefinitelyTyped (19ee507)
  pattern (a declared `@types/x` twin satisfies a type-only import of `x`,
  scoped names included), the lexical scanner requires the import KEYWORD to
  sit in code (a `from '…'` inside a string — rule messages, fix catalogs,
  generated examples — never scans as an import), subtrees with their own
  package.json are separate units, and a root `loom.ignore` (reason
  REQUIRED) downgrades findings to info with the reason attached — never a
  silent drop.

  The other packages: devDependency range alignment only (same-major sync
  surfaced by `loom scan`); no runtime change.

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

### Minor Changes

- [#2453](https://github.com/pyreon/pyreon/pull/2453) [`f32ab89`](https://github.com/pyreon/pyreon/commit/f32ab893072f747ad83d0a29426c994f2afe56bb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the audited `@pyreon/code` gaps — two typed-but-unimplemented config surfaces implemented, one missing config axis added, and the stale doc claims corrected:

  - **`<DiffEditor inline>` is now implemented** (was typed-but-unimplemented — the prop existed on `DiffEditorProps` but the component never read it). `inline: true` renders a UNIFIED diff via `@codemirror/merge`'s `unifiedMergeView`: one editor showing the modified document with the original as deleted-chunk widgets; per-chunk accept/reject controls appear when `readOnly` is `false`. Signal-valued `original`/`modified` props stay reactive (the original updates through the merge package's `originalDocChangeEffect`), and the existing dispose-during-async-load leak guard covers the unified path too.
  - **`search: false` now actually disables search** (the flag was destructured and never read — `searchKeymap` shipped unconditionally). `false` omits the Mod-F find/replace keymap and selection-match highlighting. New programmatic escape hatch: `openSearchPanel(editor)` opens the panel on the live view regardless of the flag (pre-mount it dev-warns + returns `false`).
  - **New `editable` config + live `editor.editable` signal** — sets `EditorView.editable` via a Compartment (like `readOnly`). `editable: false` removes `contenteditable` entirely (pure display surface, no cursor/focus), distinct from `readOnly: true` which keeps the cursor but blocks user-input transactions. `DiffEditor` already had both axes; the main editor now matches.
  - **Docs corrected**: `<CodeEditor>` does NOT auto-dispose the instance on unmount (lifecycle is user-owned — call `editor.dispose()`; auto-dispose would break remount/TabbedEditor); the stale "~250KB vs Monaco ~2.5MB" bundle claim is replaced with the measured ~138 KB gz core vs Monaco's ~940 KB gz ESM core (~7× smaller gzipped); documented that any `@uiw/codemirror-theme-*` package is a plain CM6 `Extension` that drops into `theme:` directly (verified against a real theme package in the browser suite).

### Patch Changes

- [#2468](https://github.com/pyreon/pyreon/pull/2468) [`149dc85`](https://github.com/pyreon/pyreon/commit/149dc859b3a914d14d1b08ba1344296d1024952c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Runtime wrapper bench vs @uiw/react-codemirror (`bench:runtime`, real Chromium): controlled-value keystroke round-trip (deterministic count: 1 owner render vs ~110 React commits for 110 keystrokes), external write → DOM (~0.4ms vs ~84ms quiet / ~530ms inside @uiw's typing latch), mount, dispose — honest-limits disclosed (same engine, wrapper-only claim, uncontrolled mode exempt). No runtime changes.

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

- [#2335](https://github.com/pyreon/pyreon/pull/2335) [`a5163c8`](https://github.com/pyreon/pyreon/commit/a5163c8f2cedd56fe37a4fce0b1f87fe7f4061ec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update parser/editor runtime dependencies: oxc-parser + @oxc-project/types 0.138.0 → 0.140.0 (compiler dual-backend equivalence + differential fuzz green), @codemirror/state 6.6.0 → 6.7.1 / @codemirror/view 6.43.0 → 6.43.6 / @codemirror/lang-markdown 6.5.1 (tree-wide coherence overrides bumped in lockstep; real-Chromium editor suite green). No API changes.

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`34d68e1`](https://github.com/pyreon/pyreon/commit/34d68e1e00088c589b8362468144951d648527f2)]:
  - @pyreon/core@0.47.0
  - @pyreon/runtime-dom@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- [#2278](https://github.com/pyreon/pyreon/pull/2278) [`e667b43`](https://github.com/pyreon/pyreon/commit/e667b43196a4377e2677161d37ba09b8a70dc991) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(code): document the 5 missing editor-helper exports in the manifest — `useEditorSignal`, `getAvailableLanguages`, and the theme trio (`darkTheme`/`lightTheme`/`resolveTheme`). Source-verified: `useEditorSignal` wraps `bindEditorToSignal` with `onUnmount` auto-cleanup and returns `void` (use `bindEditorToSignal` for a manual `{ dispose }` lifecycle); `getAvailableLanguages` lists loadable grammar ids (lazy, incl. `'plain'`); `darkTheme` carries the `{ dark: true }` facet that CodeMirror's dark-aware features and the minimap key on (not a CSS class); `resolveTheme` maps `'light'`/`'dark'` and passes a custom `Extension` through. Regenerates the MCP api-reference + docs-site reference page.

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Minor Changes

- [#2213](https://github.com/pyreon/pyreon/pull/2213) [`bb84599`](https://github.com/pyreon/pyreon/commit/bb84599e98f303cbe860c44e0b2bdebc2cf94d3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two browser-only bugs, add real ruby/shell grammars, and an objective bundle-size benchmark.

  - **fix: `editor.foldAll()` / `unfoldAll()` crashed in the browser** — they used `require('@codemirror/language')`, which throws `require is not defined` in this ESM (`type: module`) package. Now statically imported. (Invisible to node/happy-dom tests; the no-view unit path never reached the `require`.)
  - **fix: the minimap always rendered a light background** — dark-mode detection read a `cm-dark` DOM class that CodeMirror 6 never adds (it uses hashed style-mod classes). Now reads `view.state.facet(EditorView.darkTheme)`, and repaints on a theme swap.
  - **feat: `ruby` and `shell` now ship real grammars** via `@codemirror/legacy-modes` (a new optionalDependency). Previously both resolved to an empty extension (plain text) despite being advertised — 19 of the 20 language identifiers now highlight; only `plain` is intentionally empty.
  - **docs: corrected bundle-size claims with measured numbers** — the core editor is ~138 KB gzipped (~416 KB minified), at parity with `@uiw/react-codemirror`, and ~7x smaller than Monaco's ~940 KB gz core. Added a reproducible `bun run --filter=@pyreon/code bench`.
  - **docs: fixed several README/manifest inaccuracies** — the `<TabbedEditor>` example (takes `instance`, not `tabs`/`label`), the `useEditorSignal` description, the `onParseError` signature, and a non-existent `keybindings` config field.

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

### Patch Changes

- [#1916](https://github.com/pyreon/pyreon/pull/1916) [`217157b`](https://github.com/pyreon/pyreon/commit/217157bbee6806b0f1309e5f36ef76abef422dd6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Harden the `@pyreon/code` async-mount lifecycle — two correctness fixes confirmed in a real browser, mirroring the `@pyreon/rich-text` fix:

  - **Dispose-during-pending-mount no longer leaks.** `createEditor`'s `mount()` lazy-loads the language grammar, so a `dispose()` (e.g. a fast navigate-away while the grammar loads) used to land while `view` was still `null` — `dispose()` no-op'd and the resolving import then created a live CodeMirror view + DOM that nothing tore down. A `mountToken` generation counter (bumped by `dispose()`) now aborts the in-flight mount. The same shape in `<DiffEditor>` (unmount during the async grammar load left a leaked `MergeView`) is fixed with an `unmounted` guard.
  - **Mount failures surface instead of crashing silently.** A throwing extension or a failed grammar import used to become an unhandled promise rejection while the editor silently never mounted. The new `EditorConfig.onError?: (error: Error) => void` (and `DiffEditorProps.onError`) receives the error; without it, a `[Pyreon]`-prefixed message is logged in development.

  No breaking changes — `onError` is additive and existing behavior is unchanged. Regression-locked by three new real-Chromium specs (createEditor leak + onError, DiffEditor leak), each bisect-verified.

- [#1908](https://github.com/pyreon/pyreon/pull/1908) [`4f21060`](https://github.com/pyreon/pyreon/commit/4f2106031cb5011d72942664a7a740795e7e28ec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Export `createTabbedEditor` from the package root + correct the `@pyreon/code` API docs.

  - **Packaging fix**: `<TabbedEditor>` requires a `TabbedEditorInstance` (its `instance` prop), which is built by `createTabbedEditor` — but the factory was never re-exported from `@pyreon/code` (only the component + its types were). It's now importable: `import { createTabbedEditor } from '@pyreon/code'`.
  - **Docs accuracy** (manifest feeding `llms.txt` / MCP `get_api`): `<TabbedEditor>` takes an `instance` prop (not `tabs`), each `Tab` uses `name` (not `label`), and `loadLanguage` returns `Promise<Extension>` (not `Promise<void>`), caches per language, and resolves to `[]` for uninstalled grammars. Added `createTabbedEditor` and `TabbedEditor` API-reference entries.

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/runtime-dom@0.38.0
  - @pyreon/core@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/runtime-dom@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/runtime-dom@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Minor Changes

- [#1834](https://github.com/pyreon/pyreon/pull/1834) [`a134b7b`](https://github.com/pyreon/pyreon/commit/a134b7b044db7d3749e7b831f260c5f7696cc4e9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createEditor` now accepts an `ariaLabel` option. CodeMirror's content area is a `role="textbox"` but has no accessible name unless one is supplied — a screen reader otherwise announces just "edit text, multiline" with no indication it's a code editor. The editor now sets `aria-label` on its content DOM (via `EditorView.contentAttributes`), defaulting to `"Code editor"` and overridable (e.g. `ariaLabel: "TypeScript source"`). A consumer-supplied `contentAttributes` via `extensions` still wins (it's applied after). No behavior change beyond the added accessible name.

- [#1676](https://github.com/pyreon/pyreon/pull/1676) [`dd98e9f`](https://github.com/pyreon/pyreon/commit/dd98e9ff0e2d7da70f7b7a6a79721b2553da945d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(code): honor the `lint` config flag + drop the dead duplicate `indentGuides` field.

  - `EditorConfig.lint` (documented "Enable lint/diagnostics", default false) was declared but never read — `lintKeymap` was added unconditionally and there was no lint gutter. Now `lint: true` installs `lintGutter()` so diagnostics set via `setDiagnostics()` render gutter markers, and the lint navigation keymap is gated on the same flag. (The diagnostic underlines already self-install through `cmSetDiagnostics` regardless; the flag controls the gutter affordance + keymap.)
  - `EditorConfig.indentGuides` was a dead duplicate of `highlightIndentGuides` (the implemented field, which draws guides via a theme) — never destructured, never read. Removed so the type stops promising a no-op. Use `highlightIndentGuides`.

### Patch Changes

- Updated dependencies [[`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0)]:
  - @pyreon/runtime-dom@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/runtime-dom@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0

## 0.32.0

### Patch Changes

- [#1499](https://github.com/pyreon/pyreon/pull/1499) [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Core + fundamentals deep-audit fixes. `@pyreon/validate`: corrected the outdated "Pyreon does NOT ship its own validator runtime / ~1-2KB gz" claim across the entry docstring, README, manifest, and docs page — since v1 the package ships Pyreon's own `s` validator runtime; the accurate, measured contract is tree-shaking (DX-helpers-only import ≈0.5KB gz; the runtime ≈3.9KB gz pulled in only when `s`/primitives are imported). `@pyreon/code`: minimap's canvas click listener is now stored and explicitly removed in the plugin's `destroy()` — completes the destroy contract (the listener was element-scoped so it normally died with the canvas, but explicit removal protects against any external retention of the canvas). `@pyreon/runtime-dom`: fixed a misleading dev-gate comment in template.ts (claimed `import.meta.env.DEV`; the code correctly uses the bundler-agnostic `process.env.NODE_ENV !== 'production'` gate).

- [#1531](https://github.com/pyreon/pyreon/pull/1531) [`324c1f7`](https://github.com/pyreon/pyreon/commit/324c1f70caa1187b165d4f86e6179a5f68025c91) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `editor.insert(...)` / `editor.replaceSelection(...)` now emit a dev-mode warning instead of silently dropping the call when the editor view doesn't exist yet.

  These are cursor-relative document mutations — they act on `view.state.selection`, so they require a live `EditorView`. The view is created by `mount()` _after_ an async grammar load, so calling them before the editor mounts (or on a cold-mounting editor whose view isn't ready) has no cursor to act on and the call was dropped with no signal — losing the text the caller meant to add.

  The production behavior is unchanged (you genuinely cannot insert-at-cursor with no cursor), but a dev build now warns and points at the view-independent API: `editor.value.set(...)` feeds the value signal, which seeds the document whenever the view is created — the correct way to set content before/regardless of mount timing. Documented the cursor-relative contract in the code editor reference.

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63)]:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`d65d779`](https://github.com/pyreon/pyreon/commit/d65d77982284b3ce8ec871fd536069b5cd36f770), [`34872f9`](https://github.com/pyreon/pyreon/commit/34872f9832564fce87e408411d5f416785c6b484), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0

## 0.28.1

### Patch Changes

- [#1272](https://github.com/pyreon/pyreon/pull/1272) [`3e8feab`](https://github.com/pyreon/pyreon/commit/3e8feab464dc67ac3a15dc304a449e87bc2ad180) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 73.87% → 100% via two changes:

  - Extract the `tab.id ?? tab.name` fallback in `tabbed-editor.ts` into a single `_tabKey(tab)` helper. V8 was reporting the right side as a separate uncovered branch per call site (17+ occurrences); the helper concentrates the fallback into one place that's covered by two direct tests.
  - Add 5 targeted tests covering parser-error-without-callback, multi-tab rename/setModified non-match branches, closeAll with all non-closable, openTab cache-restore.
  - `/* v8 ignore */` 6 defensive paths that are structurally unreachable (DOM-driven onChange handler, `cached ?? tab.value` when cache is always populated, `if (nextTab)` after `remaining.length > 0`).

  Bump thresholds: branches 70 → 95, lines 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/runtime-dom@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/runtime-dom@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/runtime-dom@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/runtime-dom@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/runtime-dom@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/runtime-dom@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/runtime-dom@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/runtime-dom@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- [#261](https://github.com/pyreon/pyreon/pull/261) [`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Triaged safe changes from architecture review PR [#260](https://github.com/pyreon/pyreon/issues/260):

  - **hotkeys**: detach global `keydown` listener when last hotkey unregisters (prevents listener accumulation across component remounts)
  - **code**: new `useEditorSignal()` hook — wraps `bindEditorToSignal` with `onUnmount` auto-cleanup (eliminates manual `dispose()` calls)
  - **form**: `ValidateFn` accepts optional `AbortSignal`; `useForm` creates per-cycle `AbortController` cancelled on unmount (prevents orphaned async validators)
  - **validation**: `zodSchema()` / `valibotSchema()` / `arktypeSchema()` return `TypedSchemaAdapter<TValues>` with `.validator` and phantom `_infer` type for compile-time field name validation. `useForm({ schema })` accepts both the new adapter and plain `SchemaValidateFn` (backward compatible).

  Dropped from the original PR: onCleanup LIFO ordering change (breaking behavioral change), circular effect detection (redundant with batch), SSR streaming backpressure (architecturally wrong implementation).

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#247](https://github.com/pyreon/pyreon/pull/247) [`d199b67`](https://github.com/pyreon/pyreon/commit/d199b67edb4f2efa87721caa9708915278337513) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Code editor anti-pattern cleanup + lint rule precision

  `@pyreon/code`:

  - `editor.ts` `CustomGutterMarker.toDOM()`: added `typeof document === 'undefined'`
    early-return — the method is only invoked by CodeMirror at render time
    in a mounted browser, but the explicit guard documents the SSR-safety
    contract at the callsite.
  - `minimap.ts` `createMinimapCanvas` / plugin `update()` / `destroy()`: same
    pattern — typeof guards at function entry. The class-method paths only
    fire from the CodeMirror plugin lifecycle (browser-only) but the rule
    can't AST-trace that.
  - `bind-signal.ts` + 4 `editor.ts` computed/effect blocks: added inline
    `// pyreon-lint-disable-next-line pyreon/no-peek-in-tracked` suppressions
    for the canonical loop-prevention and imperative-ref-access uses of
    `.peek()`. These are intentional and correct — `.peek()` is THE official
    way to read a signal without subscribing.

  `@pyreon/lint`:

  - `no-window-in-ssr`: import-name shadowing — `import { history } from
'@codemirror/commands'` makes every later `history` identifier in the
    file refer to the import, not `window.history`. Same for default
    (`import history from …`) and namespace (`import * as history from …`)
    imports.
  - Runner suppression-comment alias: the `// pyreon-lint-disable-next-line
<rule-id>` syntax is now a recognised alias of the existing
    `// pyreon-lint-ignore <rule-id>` syntax. Several rule docstrings already
    documented `disable-next-line` — closing the docs / runtime gap.

  6 new bisect-verified regression tests for the rule + suppression changes.

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-dom@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-dom@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-dom@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages
