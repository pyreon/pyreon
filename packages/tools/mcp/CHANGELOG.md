# @pyreon/mcp

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450), [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1), [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1)]:
  - @pyreon/compiler@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`eea2972`](https://github.com/pyreon/pyreon/commit/eea29723e36088ec32d3e817e0f5f61606c9b949)]:
  - @pyreon/compiler@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0

## 0.19.0

### Minor Changes

- [#600](https://github.com/pyreon/pyreon/pull/600) [`81553e2`](https://github.com/pyreon/pyreon/commit/81553e210d64f8ea6639fd9fe08c5b0ba1411dbe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `diagnose` MCP tool v2 — structured-context enrichment (backward-compatible).

  The original `diagnose` took only an error string and matched it against a fixed regex table. That's the "known error message → canned fix" tier — it can't reason about _why_ the app reached the bad state because it never sees the component or the reactive run-up.

  v2 keeps the string-only path **byte-identical** (verified — every existing `diagnose` test passes unchanged) and adds optional structured context:

  - **`componentSource`** → runs `detectPyreonPatterns` over it and maps each hit to the documented `.claude/rules/anti-patterns.md` entry via the `AntiPatternEntry.detectorCodes` bridge. The agent gets "here's the static foot-gun in this component + its catalog explanation," not just the raw error.
  - **`reactiveTrace`** → the causal sequence of signal writes leading to the crash (`ErrorContext.reactiveTrace` from `@pyreon/core`, shipped [#598](https://github.com/pyreon/pyreon/issues/598)). Formatted as a chronological run-up.
  - `filename` / `phase` — optional hints.

  Architecture: the tool is **deterministic and embeds no LLM**. An MCP tool's job is to assemble the richest structured failure context; the agent calling it does the reasoning. This removes model/prompt risk from the framework entirely and keeps the enrichment unit-testable. The pure `enrichDiagnosis(input, deps)` function takes injected dependencies (detector + parsed anti-patterns) so it has no filesystem/server coupling.

  Backward compatibility is a hard contract, not a hope: when no structured context is supplied, `contextLevel` is `'string-only'` and `formatEnrichedDiagnosis` returns exactly the v1 block (the "Could not identify…" fallback or the `**Cause:** / **Fix:** / **Code:** / **Related:**` block). The enrichment sections are appended _only_ when `componentSource` / `reactiveTrace` are present.

  When structured context is supplied but yields nothing (clean component, empty trace) the tool says so explicitly ("no additional findings") rather than implying the base diagnosis is enriched — honest about its own confidence.

  Bisect-verified: forcing `hasStructuredContext = false` made all 7 v2 tests fail while all 14 v1/string-only tests still passed (proving backward-compat is structural, not coincidental); restored → 21/21 pass, no remnant.

  Pairs with [#598](https://github.com/pyreon/pyreon/issues/598) — `reactiveTrace` is the input that makes causal diagnosis possible; this is the consumer of that substrate, sequenced as a separate PR (same [#585](https://github.com/pyreon/pyreon/issues/585)→[#587](https://github.com/pyreon/pyreon/issues/587) layering).

- [#599](https://github.com/pyreon/pyreon/pull/599) [`872f083`](https://github.com/pyreon/pyreon/commit/872f083c6036aa34974abbe425c90d9e0cbbdb66) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New `explain_error` MCP tool — assembles a structured failure dossier from a full Pyreon error report.

  The rich-context sibling of `diagnose`. `diagnose` matches an error _string_ against known footguns; `explain_error` takes a full `ErrorContext`-shaped report — crucially the **`reactiveTrace`** (the causal sequence of signal writes from `@pyreon/core`'s error reports) — and assembles:

  - The **reactive run-up** (the write sequence, oldest → newest)
  - **Heuristic findings** over that sequence: `empty-trace` (crash is NOT state-driven — don't chase a reactive bug), `last-write-correlation` (the write whose signal name is in the error message), `nullish-then-crash` (a signal set null/undefined that the error references), `write-storm` (same signal written past a loop threshold), `type-flip` (value shape changed: `Array(3)` → `null`)
  - Optional **static detection** (`detectPyreonPatterns` / `detectReactPatterns`) when the component source is supplied
  - **Correlated anti-pattern catalogue** entries (matched via the finding → detector-code mapping, reusing the `get_anti_patterns` loader)

  ```ts
  explain_error({ report: JSON.stringify(errorContext) });
  // errorContext captured via registerErrorHandler(ctx => …) in dev
  ```

  **Architecture (deliberate):** the server only _assembles_ + applies cheap heuristics — it does not call an LLM, hold API keys, or mutate anything. The consuming agent reasons over the dossier; a human gates any patch _by construction_ (the tool returns text only, no write capability). This is the sound, distinctive core of "AI-native self-healing" — self-_explaining_, not autonomous-repairing. The rejected idea (autonomous in-production repair) is structurally impossible here.

  **Why Pyreon can do this and incumbents can't:** the dossier's highest-signal section is the reactive write sequence — _how_ the app reached the failing state, which a stack trace alone can't show. That input only exists because of `@pyreon/core`'s `reactiveTrace` (companion PR [#598](https://github.com/pyreon/pyreon/issues/598)). `explain_error` does not import [#598](https://github.com/pyreon/pyreon/issues/598) — it parses the serialized shape structurally, so it works standalone and gets more useful once apps capture real reactive traces.

  Bisect-verified: disabling the `last-write-correlation` heuristic fails the `explain-error-server.test.ts > assembles a dossier` round-trip; restored → 24 tests pass (19 unit + 5 JSON-RPC). No `TEMP BISECT` remnant. Full `@pyreon/mcp` suite: 473 pass. Manifest-driven — `mcp_overview` + `api-reference.ts` + `llms-full.txt` + `docs/docs/mcp.md` regenerate from the new manifest entry; `gen-docs --check` clean; manifest-snapshot key list updated.

- [#604](https://github.com/pyreon/pyreon/pull/604) [`364d2bd`](https://github.com/pyreon/pyreon/commit/364d2bd49aa3a1a82002408c1eb100c620999249) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Cut MCP consumer token cost — `get_anti_patterns` default ≈76% smaller, plus a per-session-tax trim and a regression gate.

  **Measured** (≈4 chars/token; reproducible via `src/tests/token-budget.test.ts`):

  | surface                                              |  before |  after |    delta |
  | ---------------------------------------------------- | ------: | -----: | -------: |
  | `get_anti_patterns({})` (the common orient call)     |  13,976 |  3,292 | **−76%** |
  | `tools/list` (paid by every consumer, every session) |   1,228 |  1,097 |     −11% |
  | `diagnose` schema (in `tools/list`)                  |     280 |    212 |     −24% |
  | blended working session\*                            | ~17,440 | ~6,620 | **−62%** |

  \* tools/list + mcp_overview + 2×get_api + one `get_anti_patterns({})`.

  **`get_anti_patterns` is now token-frugal by default:**

  - **no args → a COMPACT INDEX** — one line per entry (title + `[detector: <code>]` tag + one-sentence hook). Keeps the per-category `## <Heading>` markers so an agent still discovers categories in one call; only the prose body is elided.
  - `{ name }` → the single matching entry's full body (cheapest drill-in).
  - `{ category }` → that category's full bodies — **unchanged contract** (the existing filtered tests pass untouched).
  - `{ full: true }` → the entire catalog (≈14K), explicit expensive opt-in.

  The old behaviour (no-arg = full dump) was the bloat: an agent calling `get_anti_patterns()` to orient itself ate ~14K tokens to read every full body when it needed the map plus one or two entries. That call is now ~3.3K and the full bodies are one deliberate call away.

  **Per-session tax trim:** schema `.describe()` strings ship in `tools/list` to every consumer on every connection whether or not the tool is ever called. The verbose prose (including the `diagnose` describes I over-wrote in [#600](https://github.com/pyreon/pyreon/issues/600)) is trimmed to terse one-liners; the full param semantics live in the manifest, served on demand via `get_api` / `mcp_overview`. Honest note: this lever is smaller than I estimated — the JSON-Schema _structure_ (param names, types, the nested `reactiveTrace` shape) dominates `tools/list`, not description text — so it's −11%, not the ~40% I projected.

  **Regression gate:** `src/tests/token-budget.test.ts` stands up the real client↔server (in-memory JSON-RPC, the MCP e2e shape) and pins `tools/list` < 1,300 tokens, `get_anti_patterns({})` < 5,000, the index ≥60% smaller than `full`, and `{ name }` cheaper than the index. Bisect-verified: reverting the default to the old full dump fails 4 of these; restored → all pass, no remnant. Budgets sit above the post-PR numbers with head-room so normal catalog growth doesn't trip them — it's a ratchet against re-bloat, not a snapshot.

  No capability lost: every full body is still reachable, just behind an explicit, intentional call instead of being the default firehose. `@pyreon/mcp` suite: 473 tests pass (7 new: 4 token-budget + 3 drill-in paths). gen-docs in sync (manifest entry rewritten, api-reference regenerated).

### Patch Changes

- [#622](https://github.com/pyreon/pyreon/pull/622) [`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/compiler` onto the manifest-driven docs pipeline.

  `@pyreon/compiler` was the last core-layer package with NO `src/manifest.ts` — its `llms.txt` / `llms-full.txt` / MCP `api-reference.ts` surfaces did not exist at all (it was simply absent from every generated doc, and `get_api(compiler, …)` 404'd for the entire public surface including the Reactivity-Lens). This is the cause-level fix behind the "Lens docs enrichment" follow-up: the Lens couldn't be documented because the package it lives in wasn't on the pipeline.

  **Added** `packages/core/compiler/src/manifest.ts` via `defineManifest()` — 18 `api[]` entries (the full public surface from `src/index.ts`): `transformJSX`, `transformJSX_JS`, `analyzeReactivity`, `formatReactivityLens`, `detectReactPatterns`, `migrateReactCode`, `hasReactPatterns`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `auditTestEnvironment`, `formatTestAudit`, `auditIslands`, `formatIslandAudit`, `auditSsg`, `formatSsgAudit`, `transformDeferInline`, `generateContext`. Every entry carries an accurate `signature` + dense `summary`; the real foot-guns get `mistakes[]` (the dual-backend invisibility trap, the SSR-needs-`h()`-not-`_tpl()` trap, `knownSignals` cross-module seeding, the Lens asymmetric-precision contract, the enforced `fixable: false` invariant); `analyzeReactivity` / `formatReactivityLens` are flagged `stability: 'experimental'`; 3 package-level `gotchas` (dual backend, Lens is editor-only, detectors are not codemods).

  **Wiring:** added `@pyreon/manifest` as a `workspace:*` devDependency on `@pyreon/compiler` (matches the `@pyreon/lint` convention — `manifest.ts` is gen-docs-only, never imported by `src/index.ts`, so it's tree-shaken from the published `lib/`). Added the `// <gen-docs:api-reference:start/end @pyreon/compiler>` marker pair to `packages/tools/mcp/src/api-reference.ts` (core-layer slot, between `@pyreon/core` and `@pyreon/router`). `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/compiler` section, and the 18-entry MCP api-reference region; updated the hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc-pipeline metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (compiler + mcp); compiler 1053 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (compiler enters at port-grade density and is intentionally NOT added to `LOCKED` — it's the visible migration backlog, not yet at flagship density). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the experimental-flag and foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

- [#629](https://github.com/pyreon/pyreon/pull/629) [`29788dc`](https://github.com/pyreon/pyreon/commit/29788dc7ae5a52daab204b6205fe39f56703d980) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/elements` onto the manifest-driven docs pipeline.

  `@pyreon/elements` is the structural layer every styled / rocketstyle component renders through (`Element` / `Text` / `List` / `Overlay` / `useOverlay` / `Portal` / `Iterator`), but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region** — `get_api(elements, Element|Overlay|useOverlay|…)` 404'd. PR D of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server; PR C = styler [#628](https://github.com/pyreon/pyreon/issues/628) — all merged; this branch rebased onto post-[#628](https://github.com/pyreon/pyreon/issues/628) `origin/main`).

  **Added** `packages/ui-system/elements/src/manifest.ts` via `defineManifest()` — **10 `api[]` entries** (`Element`, `Text`, `List`, `Overlay`, `useOverlay`, `OverlayProvider`, `Portal`, `Iterator`, `Util`, `Provider`) with accurate signatures + dense summaries + the real elements foot-guns in `mistakes[]`: `direction="row"` is invalid (`inline` / `rows` / `reverseInline` / `reverseRows`); layout props are primitive ATTRS not styler `.theme()` CSS; the 2026-Q2 simple-path fast path moves the tag to `props.as` and layout under `props.$element.*`; void-tag children are dropped; `Overlay`'s positioning/flip/ESC/click-outside/scroll/hover-delay all live in `useOverlay` (never reimplement); `Portal` nests a per-instance wrapper inside the DOMLocation (DOM assertions traverse one level deeper); `Iterator`'s four-overload Simple/Object/Children/Loose type system. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` / `@pyreon/styler` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (after `@pyreon/styler`, before `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — elements already had one), the `llms-full.txt` `## @pyreon/elements` section, and the 10-entry MCP region.

  **`@pyreon/mcp` bundle budget — no bump needed in this PR.** The 10-entry api-reference region is bundled into `@pyreon/mcp`'s main entry, but the focused single-package bump PR [#627](https://github.com/pyreon/pyreon/issues/627) (`chore(ci): bump @pyreon/mcp bundle budget — RED on main`) already raised the budget to `142848` on `main`. This branch's measured `@pyreon/mcp` gzipped main entry is `122629` bytes — comfortably under `142848` — so the elements region fits within [#627](https://github.com/pyreon/pyreon/issues/627)'s headroom and no further `scripts/bundle-budgets.json` change is required here. (An earlier revision of this branch carried its own `153344` bump; rebasing onto post-[#627](https://github.com/pyreon/pyreon/issues/627) `main` made it redundant and it was dropped in favour of [#627](https://github.com/pyreon/pyreon/issues/627)'s value.)

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (elements + mcp); elements 461 tests, mcp 497 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the layout-in-attrs and Portal-wrapper foot-gun assertions locally; `check-manifest-depth` passes (elements enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  The `renderStringLiteral` backslash hazard documented by [#628](https://github.com/pyreon/pyreon/issues/628) in `.claude/rules/anti-patterns.md` was applied from the start here — manifest prose is backslash-free (plain single-backtick code spans, no nested backtick escapes), so no serializer-escape parse error and no further anti-patterns.md change was required for this PR.

- [#643](https://github.com/pyreon/pyreon/pull/643) [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useHead({ speculationRules })` — declarative Speculation Rules support (E12).

  **Origin: the Qwik architecture analysis.** A deep Pyreon-vs-Qwik review concluded the famous "resumability / zero-JS-for-free" thesis was already measured-and-shelved here (the Tier-2 spike: ~28% ceiling, depth-invariant, demo-vs-prod 38× variance — see `SPIKE.md` on `spike/tier2-resumability`). Decomposing Qwik into its separable ideas, **exactly one** cleared the "worth implementing" bar: native speculative loading (Q4) — and `@pyreon/head` already emits `<script>` tags with a body, so it collapses to a thin, idiomatic helper that mirrors the existing `jsonLd` convenience line-for-line. The resumability spike itself was NOT re-run (it would contradict its own measured verdict); the dead bytes thesis was NOT touched.

  **What this adds.** A new opt-in `speculationRules?: SpeculationRules` field on `UseHeadInput` (plus exported `SpeculationRules` / `SpeculationRule` / `SpeculationEagerness` types). It auto-wraps the object as a single `<script type="speculationrules">` tag — supported browsers prefetch or fully prerender the next document(s) for near-instant navigation; unsupported browsers ignore it (no polyfill). Both `source: 'list'` (explicit URLs) and `source: 'document'` (CSS-selector predicate — the Qwik "prefetch by intent" shape) are typed. **Zero runtime JS, opt-in (nothing emitted unless called), SSR + client for free** (rides the existing head pipeline, including its `</script>`-breakout escaper), deduplicated by a single key. No default behavior change.

  **Run as a bounded spike with kill-criteria fixed first** (the codebase's own Tier-2 methodology), shipped only because both load-bearing criteria passed:

  1. **Correctness & SSR-safety — ✅ 0 defects.** 7 unit specs: SSR single-block emission + valid-JSON round-trip, CSR `document.head` sync, key dedup (innermost wins, never two blocks), reactive regen on signal change, `document`-source predicate round-trip, opt-in absence, and XSS-safety (`/x</script><b>pwn` URL → escaped, JSON still parses back to the original).
  2. **Real-Chromium browser acceptance — ✅.** A `*.browser.test.tsx` spec asserts in real Chromium: the script lands in `<head>`, `HTMLScriptElement.type === 'speculationrules'`, the body is valid JSON that round-trips, and Chromium raises **zero** speculation-rules parse errors. (Whether Chromium then prefetches/prerenders is browser-discretionary + headless-flag-dependent and is **intentionally not asserted** — the framework's contract is "emit a correct, valid declarative hint", same as `<link rel=prefetch>`. The docs + manifest mistakes state this explicitly; no measured-TTI claim is made.)
  3. **Net value over existing prefetch — qualitatively yes, honestly framed.** `RouterLink prefetch=intent` warms loader _data_ for in-app client-side nav; Speculation Rules warm the _document_ at the platform level for full navigations — a strictly additional, complementary capability the framework didn't expose. Not overclaimed as a guaranteed perf win.

  **Validation.** `@pyreon/head`: 107 unit + 10 real-Chromium browser tests pass (+7/+1 new). Typecheck clean (head + mcp). `bun run lint` 0 errors. `gen-docs --check` in sync (manifest feature + mistakes added; `api-reference.ts` head region regenerated → the `@pyreon/mcp` patch). `@pyreon/mcp` 497 tests pass. Docs surfaces updated in-PR: `manifest.ts`, `docs/docs/head.md` (intro + `UseHeadInput` interface + a new `## Speculation Rules` section with the honest hint-not-guarantee framing), `index.ts` type exports. No new anti-pattern or lint rule discovered (the hint-not-guarantee caveat is documented as a manifest `mistakes[]` entry).

  No bug fixed → the bisect-verify mandate (revert fix → assert failure) does not apply; this is a new additive capability, stated plainly rather than fabricating a regression.

- [#615](https://github.com/pyreon/pyreon/pull/615) [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: reconcile manifest doc-metadata with source

  `useTransition()` / `useMiddlewareData()` manifest entries documented the
  wrong shape (`{ isTransitioning }` / `<T>(): T`); source returns reactive
  accessors (`() => boolean`, `() => Record<string, unknown>`). The mcp
  `get_pattern` summary said "Eight foundational patterns" — actually 16.
  Manifest-only / regenerated-api-reference; no runtime behavior change.

- [#606](https://github.com/pyreon/pyreon/pull/606) [`fde0f41`](https://github.com/pyreon/pyreon/commit/fde0f41ad6312ad0ee45d8e70ece965d7c4fec41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the biggest MCP `get_api` quality gap: enrich + correct the two thinnest fundamentals manifests, and add a ratchet so density can't silently erode.

  **The gap (measured, via the authoritative `findManifests` loader — the same one `get_api` uses):**

  - `@pyreon/rx`: **3** `api[]` entries for 37 functions. `get_api(rx, sortBy)` / `(rx, debounce)` / `(rx, search)` / `(rx, groupBy)` all **404'd** — agents got nothing for the most-used transforms.
  - `@pyreon/store`: `StoreApi` referenced **3× in `seeAlso`** with no `api[]` entry — `get_api(store, StoreApi)` 404'd despite being the central return type.

  **Plus four real inaccuracies in the existing rx manifest** that were actively _misleading_ AI agents (found by grounding every claim in source, not assuming):

  1. "signals detected by checking for a `.subscribe` method" — false; detection is purely `typeof source === "function"` (`rx/src/types.ts`).
  2. "pass `items` not `() => items()`" — backwards; an accessor wrapper _is_ a function and works. The real mistake is passing a resolved `items()` (static path, never updates).
  3. `groupBy` documented as returning `Computed<Map<…>>` — it returns `Record<string, T[]>` (keys `String()`-coerced).
  4. `search` documented as `{ keys: [...] }` options + "fuzzy" — it's a positional `keys` array and plain case-insensitive `String.includes` (not fuzzy).

  **Fixed (delta, authoritative counts):**

  - `@pyreon/store`: 5 → **6** entries, 2 → **6** with `mistakes[]` (added `StoreApi` entry; added grounded foot-gun catalogs to `addStorePlugin` / `resetStore` / `resetAllStores`; expanded `defineStore`). Every foot-gun traced to real source behaviour (plugin-runs-once-at-creation, silent `patch({typoKey})` no-op, `__proto__` guard, registry-detach semantics, `store.pluginRun` O(stores×plugins)).
  - `@pyreon/rx`: 3 → **9** entries, 2 → **9** with `mistakes[]` (added `map`/`sortBy`/`groupBy`/`search`/`debounce`/`throttle`; beefed `filter`/`pipe`/`rx`) **and the 4 inaccuracies corrected** across summary, longExample, gotchas, and per-entry notes.

  **Proven end-to-end:** a real MCP client↔server round-trip confirms `get_api(rx, sortBy|debounce|search|groupBy)` and `get_api(store, StoreApi)` now resolve with `Common mistakes` sections (were 404), and `get_api(rx, groupBy)` returns `Record`, not `Map`, through the live tool.

  **Structural fix so this can't recur:** new `scripts/check-manifest-depth.ts` ratchet + required `Check Manifest Depth` CI job. `LOCKED` records each migrated package's _achieved_ `{ minEntries, minWithMistakes }` (store 6/6, rx 9/9, query 16/11, form 7/7 — counted via `findManifests`). The gate fails if a locked package erodes; not-yet-migrated packages are intentionally absent (the visible backlog) so it never flag-days CI. Bisect-verified: removing the `StoreApi` entry fails the gate on `@pyreon/store`; restored → passes.

  Per-package `manifest-snapshot` tests updated (regenerated inline snapshots now capture the _corrected_ content; regression-guard assertions added so the 4 inaccuracies can't reappear). `gen-docs` regenerated `llms.txt` / `llms-full.txt` / `api-reference.ts` — in sync.

- [#624](https://github.com/pyreon/pyreon/pull/624) [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/runtime-server` onto the manifest-driven docs pipeline.

  `@pyreon/runtime-server` is the SSR/SSG renderer (`renderToString` / `renderToStream` / `runWithRequestContext` / `configureStoreIsolation` / `decodeKeyFromMarker`) — a real server API surface AI agents query — but it had NO `src/manifest.ts`, no api-reference markers, and was entirely absent from `llms.txt` / `llms-full.txt` / MCP `api-reference.ts`. `get_api(runtime-server, …)` 404'd for the whole surface. PR B of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction, [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler).

  **Added** `packages/core/runtime-server/src/manifest.ts` via `defineManifest()` — all 5 public exports as `api[]` entries with accurate signatures + dense `summary` + the real SSR foot-guns in `mistakes[]`: SSR is one-shot (no server reactivity; signals snapshot at render time), Suspense streams out-of-order with a 30s-timeout-keeps-fallback contract, `runWithRequestContext` must wrap the whole `prefetch + render` sequence or loader data is lost, `configureStoreIsolation` MUST be called once at startup or concurrent requests share one global store registry (cross-user SSR state bleed), `<head>` flushes before Suspense resolves. 3 package gotchas (no server reactivity / usually consumed via `@pyreon/server` / the server `typeof process` dev-gate convention).

  **Wiring:** `@pyreon/manifest` added as a `workspace:*` devDependency (the `@pyreon/lint` / `@pyreon/compiler` convention — `manifest.ts` is gen-docs-only, tree-shaken from published `lib/`). Surgical 3-line bun.lock add; `bun install --frozen-lockfile` verified (unrelated fresh-worktree version-field churn reverted to base). api-reference marker pair added between the `@pyreon/runtime-dom` and `@pyreon/store` regions; `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/runtime-server` section, and the 5-entry MCP region; hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (runtime-server + mcp); runtime-server 143 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (runtime-server enters at port-grade density and is intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

- [#628](https://github.com/pyreon/pyreon/pull/628) [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/styler` onto the manifest-driven docs pipeline.

  `@pyreon/styler` is the CSS-in-JS engine (`styled` / `css` / `keyframes` / `createGlobalStyle` / `useCSS` / theming / `StyleSheet`) — one of the most-queried real-API surfaces in the ui-system, but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region**. `get_api(styler, styled|css|useTheme|…)` 404'd. PR C of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server — all merged).

  **Added** `packages/ui-system/styler/src/manifest.ts` via `defineManifest()` — **19 `api[]` entries** covering the consumer-facing surface (`styled`, `css`, `keyframes`, `createGlobalStyle`, `useCSS`, `useTheme`, `useThemeAccessor`, `ThemeProvider`, `ThemeContext`, `createSheet`, `StyleSheet`, `sheet`, `resolve`, `normalizeCSS`, `resolveValue`, `clearNormCache`, `buildProps`, `filterProps`, `isDynamic`) with accurate signatures + dense summaries + the real CSS-in-JS foot-guns in `mistakes[]`: `$`-transient props are not forwarded to the DOM; `css`/`keyframes`/`createGlobalStyle` return lazy/name/component values (not strings, not side-effecting); `useTheme()` snapshots vs `useThemeAccessor()` tracks; `buildProps`/`filterProps` copy DESCRIPTORS not values to preserve the `_rp` reactive-prop contract; singleton-sheet-vs-`createSheet` isolation. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (between `@pyreon/unistyle` and `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — styler already had one), the `llms-full.txt` `## @pyreon/styler` section, and the 19-entry MCP region.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (styler + mcp); styler 410 tests, manifest 135 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + foot-gun-catalog assertions locally; `check-manifest-depth` passes (styler enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  **Authoring note for the next ui-system migration**: `@pyreon/manifest`'s `renderStringLiteral` serializer escapes backtick + `${` when emitting MCP entries into `api-reference.ts`, but does NOT escape literal backslashes. A `summary`/`mistakes` string whose RESOLVED value contains a literal `\` (e.g. from over-escaped nested `` \`…\``` code spans) emits `\\\ `` → the raw backtick prematurely closes the generated template literal → `api-reference.ts` parse error. Keep manifest prose backslash-free: use plain single-backtick code spans for identifiers, never nested backtick-in-backtick escapes; `${`-in-prose is fine (serializer-escaped, round-trips). Documented in `.claude/rules/anti-patterns.md`.

- Updated dependencies [[`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/compiler@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/compiler@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/compiler@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.16.0

## 0.14.0

### Minor Changes

- [#311](https://github.com/pyreon/pyreon/pull/311) [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR [#197](https://github.com/pyreon/pyreon/issues/197) bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

  Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

  - **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
  - **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.

- [#310](https://github.com/pyreon/pyreon/pull/310) [`94c63f9`](https://github.com/pyreon/pyreon/commit/94c63f9426ef0ce64ad8883dd571fd87b0401f88) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New MCP `get_changelog` tool (T2.5.8). AI agents can fetch recent release notes for any `@pyreon/*` package without scraping `git log` or reading raw markdown. Parses changesets-populated `CHANGELOG.md` files, filters out ceremonial version bumps (pure dependency-update releases), and returns the N most recent substantive versions. Accepts the short slug (`"query"`) or the fully-qualified name (`"@pyreon/query"`). Options: `limit` (default 5), `includeDependencyUpdates` (default false), and `since` (filter to versions strictly newer than a floor — useful when an agent knows the version it was trained against and wants just the delta). Complements the existing `get_pattern` + `get_anti_patterns` proactive-docs trio — `get_changelog` answers "what changed recently" while `get_api` answers "what is it now".

- [#309](https://github.com/pyreon/pyreon/pull/309) [`7313617`](https://github.com/pyreon/pyreon/commit/731361719e4ab6fb29bd13265802b36382149a7c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two new MCP tools for AI coding assistants (T2.5.3 + T2.5.4). `get_pattern({ name })` fetches a "how do I do X in Pyreon" pattern body from `docs/patterns/<name>.md` — 8 foundational patterns ship today (dev-warnings, controllable-state, ssr-safe-hooks, signal-writes, keyed-lists, reactive-context, event-listeners, form-fields). `get_anti_patterns({ category? })` parses `.claude/rules/anti-patterns.md` and returns per-category listings with detector tags surfaced inline. Complements the reactive `validate` tool from T2.5.2: patterns + anti-patterns are proactive (called BEFORE writing code), `validate` is reactive (called AFTER). Both tools walk up from `process.cwd()` to locate the source files so they work across worktrees and monorepo layouts; a helpful miss message prints when running outside the Pyreon repo.

- [#307](https://github.com/pyreon/pyreon/pull/307) [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pyreon-specific anti-pattern detector for the MCP `validate` tool (T2.5.2). `@pyreon/compiler` exports a new `detectPyreonPatterns(code, filename)` AST walker catching 9 "using Pyreon wrong" mistakes — `for-missing-by` / `for-with-key` on `<For>`, `props-destructured` at component signatures, `process-dev-gate` (dead code in Vite browser bundles), `empty-theme` no-op chains, `raw-add-event-listener` / `raw-remove-event-listener`, `date-math-random-id` ID schemes, and `on-click-undefined`. `@pyreon/mcp`'s `validate` tool now merges these diagnostics with the existing React detector output, sorted by source line. Every detected pattern is grounded in `.claude/rules/anti-patterns.md` — each bullet there carries a `[detector: <code>]` tag so contributors see what runs statically vs what remains doc-only.

### Patch Changes

- Updated dependencies [[`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d), [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/compiler@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/compiler@0.5.1

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.0
