# @pyreon/atlas

## 0.53.0

### Minor Changes

- [#3797](https://github.com/pyreon/pyreon/pull/3797) [`d7408b7`](https://github.com/pyreon/pyreon/commit/d7408b7cf9cbb5c64be7490e97b27b3a0ae9b906) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/compiler`'s main entry is now TypeScript-free. Everything that parses with the TypeScript compiler API moved behind three new subpaths, so consumers that only need `transformJSX` (the Vite plugin's static graph, test harnesses, bundler integrations) no longer load `typescript`. **Breaking for direct importers — migrate the import path:**

  - `@pyreon/compiler/analyze`: `detectReactPatterns`, `hasReactPatterns`, `migrateReactCode`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `migratePyreonCode`, `AUTO_FIXABLE_PYREON_CODES`, `analyzeReactivity`, `formatReactivityLens`, `firesToCreationSiteFindings`, `mergeFireDataIntoFindings` (+ types)
  - `@pyreon/compiler/audits`: `auditTestEnvironment`, `auditIslands`, `auditSsg`, `auditNative`, `detectNativePatterns`, `auditContent` and the content-audit helpers, their `format*` helpers, `generateContext` (+ types)
  - `@pyreon/compiler/validate`: `analyzeValidate`, `emitSchemaSource`, `emitValidator`, `isEmittable` (+ types)

  The main entry keeps `transformJSX`, `transformJSX_JS`, `rocketstyleCollapseKey`, `scanCollapsibleSites`, `TPL_HOLE_ATTR`, `transformDeferInline`, the Plain Mode functions, the fs-route convention and island naming. `@pyreon/compiler/diagnose`, `/plain` and `/fs-route-convention` are unchanged.

  `transformClientDirectives` (`hydrate="…"` attribute lowering) is removed: nothing in the repo used it. `@pyreon/vite-plugin` now loads its validator rewriting, the islands doctor-lite and the `.pyreon/context.json` scanner lazily, only when those features run. `@pyreon/cli`, `@pyreon/mcp`, `@pyreon/lint` and `@pyreon/atlas` import from the new subpaths.

### Patch Changes

- [#3852](https://github.com/pyreon/pyreon/pull/3852) [`549bb99`](https://github.com/pyreon/pyreon/commit/549bb99175da8bde0cbfc79000a9110da66d2f3a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas verify-browser` now captures a scenario only once its preview holds still. A finite JavaScript canvas `requestAnimationFrame` animation was screenshotted one frame after the click-walk — mid-flight — because `animations: 'disabled'` does not stop it; the runner now waits until DOM, element geometry and canvas pixels are unchanged for `--settle-ms` (default 300; at most 100 for a preview with no canvas/video/image) bounded by `--settle-timeout` (default 5000). A preview that never settles (an endless loop) is not screenshotted and records no baseline: its snapshot check fails with a new `capture-unsettled` finding and the run exits non-zero. Fixes [#3837](https://github.com/pyreon/pyreon/issues/3837).

- [#3792](https://github.com/pyreon/pyreon/pull/3792) [`d0c6ff6`](https://github.com/pyreon/pyreon/commit/d0c6ff6ae03d775d5f6f29a8f600304df007983a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `atlas scan` mounting components against a different module graph than the one the config was loaded into. When `atlas.config.*` declares an explicit `alias`, the scan rebuilds its module loader for the components but kept the config (wrapper, theme, authored scenarios, `projects`, presets) from the loader it had just closed — so every local module shared between config and components (a context a wrapper provides, say) existed twice and the configured provider never reached the components. The config is now re-loaded through the replacement loader.

- [#3851](https://github.com/pyreon/pyreon/pull/3851) [`3b9de45`](https://github.com/pyreon/pyreon/commit/3b9de4521783a96b272bd063b734480d858f6cae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas dev` no longer loads a workspace-only `@pyreon/*` package (for example `@pyreon/store`, declared by a component package but not the root manifest) through both a raw and an optimized URL on a cold dependency cache. The Pyreon Vite plugin only excludes the packages the root manifest declares from the optimizer, so the first preview hit the singleton sentinel ("Multiple instances of @pyreon/store") and failed to load, while a warmed cache worked. The workbench now excludes and dedupes every `@pyreon/*` package any workspace package declares or links, derived from the workspace rather than a fixed list. Fixes [#3846](https://github.com/pyreon/pyreon/issues/3846).

- [#3855](https://github.com/pyreon/pyreon/pull/3855) [`f303205`](https://github.com/pyreon/pyreon/commit/f303205aacb1c9bd9dcdf3a5a76be5d56791a1f7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas verify-browser` no longer attributes a navigation that commits during the capture-settle wait to the NEXT scenario. A handler's queued `location.assign` can land after the click-walk returns on a loaded runner; the replaced-document check now runs after the settle wait (and the reloaded render is settled again), so `navigatedAway` names the scenario that actually left the workbench and never reports a second, phantom one.

- [#3807](https://github.com/pyreon/pyreon/pull/3807) [`47e9966`](https://github.com/pyreon/pyreon/commit/47e996644022fa5c9328603e5f69d69347dbfdee) Thanks [@vitbokisch](https://github.com/vitbokisch)! - SSR parity no longer reports `hydrated-dom-differs` when hydrated and client-mounted DOM differ only in attribute order. The comparison now serializes both trees with attributes in a canonical order (on detached clones); node, text, attribute-value (including `class`), child-order changes and renderer-reported mismatches still fail.

- [#3834](https://github.com/pyreon/pyreon/pull/3834) [`95af1cc`](https://github.com/pyreon/pyreon/commit/95af1cc5d12ae7b911e8989009871c3728b44138) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Scenario identity no longer depends on how the project was scanned ([#3823](https://github.com/pyreon/pyreon/issues/3823)). Same-named components in different directories were qualified from `source`, which is cwd-relative for `atlas scan` but absolute for the dev server `verify-browser` boots, so the Node and browser catalogs derived different scenario ids and no browser verdict merged (both scenarios silently landed in `notDriven`). Discovery now stamps a scan-root-relative POSIX `scanPath` and every qualifier is derived from it, so ids are identical across machines, checkouts, `--cwd` forms and Windows separators. Also loud now: a browser result matching no catalog scenario makes `verify-browser` exit non-zero (`unmatched` in the summary), and duplicate scenario ids fail the scan and the browser run. Only ids of same-named (colliding) components change — `src/one` becomes `one` — so baselines kept for those under the old ids need regenerating; the catalog version is unchanged (additive optional `scanPath` field).

- [#3810](https://github.com/pyreon/pyreon/pull/3810) [`28858d4`](https://github.com/pyreon/pyreon/commit/28858d43bbd93cebfe3554f353a6a08429731b96) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas verify-browser` now actually runs axe-core. Each scenario's live preview is audited in the page and the result is merged into the catalog's `a11y` verdict (violations fail it with `axe-violation` findings, axe's needs-a-human items surface as `axe-incomplete`, a run that cannot happen is a skip with its reason, never a pass; the scan's static name check is kept and re-runs replace prior axe findings). Previously the static a11y verifier told users to run `verify-browser` for axe coverage that the browser runner never performed. `--no-axe` opts out and `--axe-min-impact <level>` filters by impact; the CLI summary states whether axe ran. Violations do not change the exit code.

- [#3826](https://github.com/pyreon/pyreon/pull/3826) [`94de126`](https://github.com/pyreon/pyreon/commit/94de1260f6a345d26ba3ab4a25a6195c521410f7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas verify-browser` no longer aborts the whole catalog when a component's handler has a side effect that leaves the scenario document ([#3805](https://github.com/pyreon/pyreon/issues/3805)). A plain `<a href>` navigated the workbench away and killed the run with `Execution context was destroyed`. The click-walk now suppresses default actions in-page (anchor navigation, downloads, `mailto:`, form submit/reset, `form.submit()`, `window.open`, dialogs, `history.pushState`) while still running the handlers, and reports what it suppressed as an `interaction-side-effects-suppressed` finding. A navigation no guard can prevent (`location.assign`) is detected from outside: the scenario's coverage is a skip with a `navigated-away` finding naming the destination, the workbench is reloaded, axe and the snapshot still judge the un-interacted render, and the run continues. A crash in one scenario's measurement is isolated to that scenario.
- Updated dependencies [[`c933f92`](https://github.com/pyreon/pyreon/commit/c933f92e20104aba2807e229f03b9f0530135cb3), [`950303f`](https://github.com/pyreon/pyreon/commit/950303f0fa398fa96af02e4c22906e8aafaaf7e0), [`d7408b7`](https://github.com/pyreon/pyreon/commit/d7408b7cf9cbb5c64be7490e97b27b3a0ae9b906), [`078f0f2`](https://github.com/pyreon/pyreon/commit/078f0f29d77f08f576ddd4360e0919ba47a983f5), [`a7753fb`](https://github.com/pyreon/pyreon/commit/a7753fbab0452c2cccfd13dbc034539d87908424), [`514054a`](https://github.com/pyreon/pyreon/commit/514054a2fa3c946dd57ec5b894ccaf057f7714e4), [`54d95ea`](https://github.com/pyreon/pyreon/commit/54d95ea5b6cf3d2840dcfc0b809fe0c6e45486c5), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`2c98031`](https://github.com/pyreon/pyreon/commit/2c980310b388ecc18d7812a418d836dd20afc060), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944), [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae), [`54d95ea`](https://github.com/pyreon/pyreon/commit/54d95ea5b6cf3d2840dcfc0b809fe0c6e45486c5), [`3a99132`](https://github.com/pyreon/pyreon/commit/3a9913259128893d500874f47deae69687e5e9f5)]:
  - @pyreon/hooks@0.53.0
  - @pyreon/compiler@0.53.0
  - @pyreon/vite-plugin@0.53.0
  - @pyreon/runtime-dom@0.53.0
  - @pyreon/permissions@0.53.0
  - @pyreon/elements@0.53.0
  - @pyreon/feature@0.53.0
  - @pyreon/rocketstyle@0.53.0
  - @pyreon/store@0.53.0
  - @pyreon/core@0.53.0
  - @pyreon/reactivity@0.53.0
  - @pyreon/code@0.53.0
  - @pyreon/config@0.53.0
  - @pyreon/styler@0.53.0
  - @pyreon/ui-core@0.53.0
  - @pyreon/unistyle@0.53.0

## 0.52.0

### Minor Changes

- [#2731](https://github.com/pyreon/pyreon/pull/2731) [`879ff89`](https://github.com/pyreon/pyreon/commit/879ff898025eed1f516e1ccc792fa1e39a3b425f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `bundleCostPlugin` — what importing each component costs a consumer, minified + gzipped.

  **Opt-in, not in the recommended bundle.** Each measurement is a real bundler run: on a 108-component library that is 108 builds against a scan that is otherwise ~2s. A metric that multiplies scan time by an order of magnitude has to be asked for, not inflicted — and it reports a number rather than a bug, so paying for it on runs nobody reads buys nothing.

  **What the number means.** Workspace packages and bare dependencies are external, exactly as the repo-wide budget gate measures them, so this is "the bytes this component's own source contributes" — not the page weight of rendering it. A component rendering through half of `@pyreon/elements` measures small, because that cost belongs to elements and is counted there. Charging every component for the same shared runtime would make the numbers useless for the only thing they are good for: comparing components against each other.

  **A `decorate` hook, not a `verify` check.** There is no threshold at which a component's size is WRONG, so making it a check would force a pass/fail on a measurement and the only honest verdict would be a permanent `pass` — the false-green shape the verdict model exists to avoid.

  **Needs Bun.** `Bun.build` is the only bundler it uses, so `bun atlas scan` measures and `npx atlas scan` (node) does not. Rather than fail quietly it SAYS so, once per run, through `onUnavailable` — an opt-in capability that silently produces nothing is the same false-quiet as a gate that scans zero files and reports a clean pass. Adding esbuild as a dependency would fix it at the cost of real install weight on every Atlas user for a metric most never read; reusing the project's own Vite (already an optional peer, already loaded by the module loader) is the better door and belongs in its own change.

  Unmeasurable is ABSENT, never `0` — a zero would read as "free", the most misleading number available.

- [#3492](https://github.com/pyreon/pyreon/pull/3492) [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Seed every derived scenario with representative content. Discovery now reads the tag a rocketstyle component renders as and gives a text component its own name as an editable `children` control, an `<img>` a network-free placeholder `src` + `alt`, a field a `placeholder`, and a layout container (`Stack`, `Grid`, `Box`, `AspectRatio`, a `<ul>`/`<nav>`/`<table>` …) three placeholder blocks to arrange. The seed merges UNDER authored args, travels as JSON with the scenario, and is materialized by one `materializeContent` in the verify harness, the SSR-parity check and the generated workbench render — so the canvas shows what the scan verified. Before this every derived scenario mounted an empty element: the deployed `@pyreon/ui-components` workbench rendered 108 blank previews while reporting 1090/1090 verified.

  The canvas frame is now BARE at the fluid viewport — the component sits directly on the dotted stage, with the brand/mode/locale context line in the canvas bar — and becomes a framed device edge only when a viewport preset pins a width.

  Three more findings from the same audit are fixed alongside: the static a11y check now verifies a name-like prop the scenario SUPPLIES (a seeded `alt`, an authored `aria-label`), not only one the component requires — required-only skipped every rocketstyle library wholesale; the SSR-parity oracle canonicalizes the process-wide `createUniqueId` counter, which had failed every `Combobox`/`Tree`-style component on nothing but `pyreon-2` vs `pyreon-3`; and placeholder blocks respect the container's content model — `<li>` inside a list, none inside a `<table>`, where a `<div>` is foster-parented out by the parser and reads as a hydration mismatch.

- [#3504](https://github.com/pyreon/pyreon/pull/3504) [`9cb0e51`](https://github.com/pyreon/pyreon/commit/9cb0e51e7f6eece89da7bd4e3afa54217da5a947) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every component renders on the workbench, and the scan says so when one does not.

  - **Frame width**: the fluid canvas frame spans the stage. It was an inline-flex element with no width, so the preview surface measured 80px (its own padding) on the deployed site and every block-level component — `<hr>`, `<table>`, a slider track, a tree — collapsed to zero width.
  - **The canvas opens on a component's `Default` scenario, args included** — a `Tree`'s `data`, a `Combobox`'s `options`, a `Dialog`'s `open` — not on bare control defaults. Selecting a scenario applies EVERY arg, not only the ones with an editable control. A link carries only the edits.
  - **`empty-render` verify finding**: a scenario that mounts cleanly but produces no DOM (no element, no text, nothing portaled) now FAILS the interaction check — "mounts, clicks and unmounts without throwing" was true of an empty container, which is how 1,090 scenarios verified while 24 components rendered nothing. A manufactured `auto-edge` scenario reports it without failing.
  - **Base-aware content seeds**: a rocketstyle chain rendering through a base component (`el.config({ component: ModalBase })`) seeds `open: true` for modal-like bases (with an `open` control the overlay's `onClose` writes back) and `<option>` blocks for select-like ones; a `<select>` tag gets options instead of a string the parser drops.
  - **Variant scenarios fan one axis at a time** (`Σ|axis|`) instead of crossing every axis (`Π|axis|`): four layout components sharing `indent × gap × gapY` were 150 scenarios each — 28% of a 2.5 MB catalog. `matrix: 'full'` in `atlas.config.ts` opts back into the product. The all-defaults cell is named `Default`.
  - **Every component gets a `Default` scenario** unconditionally (the old rule depended on plugin order and left 95 of 108 components without one); edge cases target a CONTENT prop (`children`, `label`, …), never `src`.
  - **`parts` and `browserOnly` in `atlas.config.ts`**: a declared part (`{ TabPanel: 'Tabs' }`) reports `part-of` instead of failing, and the canvas renders it inside its parent's opening scenario; a `browserOnly` component (an overlay that returns `null` on the server — a Node scan evaluates `isServer` before any DOM exists) reports `browser-only`.
  - **Authored scenario args stay live**: a render-prop child or an `h()` tree written in `atlas.config.ts` reaches the canvas intact (the JSON catalog marks them), and an authored `Default` is the base every derived scenario is built on.
  - **The `--check` ratchet counts a REMOVED scenario as a regression** — losing scenarios makes the counts improve, and a whole-catalog collapse (discovery returning nothing) previously exited 0.
  - Number controls no longer fabricate `0`; the canvas shows a hint when a render leaves the surface empty.

- [#2746](https://github.com/pyreon/pyreon/pull/2746) [`ebeb330`](https://github.com/pyreon/pyreon/commit/ebeb330b6066f219644d266e1757717a691a843c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Verify findings are structured — catalog `version: 2`.**

  A finding was a prose sentence. An agent handed `"hydrateRoot threw: Cannot read properties of undefined"` could say what was wrong and never say what KIND of wrong it was — the only thing to branch on was a string free to be reworded in any release.

  Every finding is now `{ code, message, fix? }`:

  ```
  ✗ button--empty
      a11y [missing-accessible-name]: missing accessible name: "label" is empty
        → Give "label" a non-empty value, or an aria-label if the text is decorative.
  ```

  - **`code`** is a stable identifier for the CLASS of failure — `mount-threw`, `hydrate-threw`, `hydrated-dom-differs`, `reactive-nodes-retained`, `missing-accessible-name`, and one for every reason a check did not run (`browser-only`, `no-dom`, `no-gc-hook`, `no-ssr-renderer`, `not-run`, `nothing-to-check`). Permanent once shipped: a reworded message is a patch, a renamed code is a breaking change.
  - **`fix`** names the one concrete thing to change, and travels WITH the finding rather than in a lookup table a consumer has to know to consult — so the agent guide, the MCP tools and `atlas verify --json` all carry the actionable half without a second call. Absent when no single next step exists, rather than invented.

  **Fixes a silent drop the change exposed.** Both the catalog renderer and the MCP surface collected findings from a hand-written list of five check names. `ssrParity` was added as a sixth and neither list learned about it — so a hydration failure was recorded in the catalog, marked the scenario failed, and then vanished from the agent guide, the llms text and the MCP tools: the surfaces an AI assistant actually reads. Both now derive from the verdict itself, which cannot go stale. `CHECK_KEYS` moved from `plugins/registry` down to `core/types`, beside the type it enumerates, so `core` can use it without importing upward.

  **`@pyreon/mcp` refuses a stale catalog** rather than rendering blanks. At v1 findings were strings; reading one with v2 code yields `undefined` for every finding, so a component's failures display as empty — silently wrong, to a reader that cannot tell a blank is anomalous. The loader now checks the version and names the fix (`re-run atlas scan`).

- [#2730](https://github.com/pyreon/pyreon/pull/2730) [`d569b80`](https://github.com/pyreon/pyreon/commit/d569b8064a34399c7375bc68764c21640954c3c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Surface reactive-graph health in the Reactivity panel — orphan signals, accidental fan-out, deep derived chains.

  `describeReactiveGraph` already derives three behavioural smells from the live graph; nothing showed them. The panel now does, most-actionable first, with each row saying what the smell COSTS rather than what it is ("one write drives many subscribers — the accidental-repaint shape", not "high-fanout: many subscribers").

  Orphan signals sort first because they are the only kind that is usually a BUG rather than a cost: from the graph, state nothing reads is indistinguishable from a read that was SEVERED, and the severed case is the "UI silently never updates" class.

  **Scoped to the component, which is the whole correctness of it.** The workbench and the preview share one reactivity instance — that is why this can be a client-side panel at all — so an unscoped read describes Atlas's own chrome (sidebar signals, theme, search box) as the component's smells. That would be worse than showing nothing: confidently wrong, about someone else's code, with no way for the reader to tell. A baseline is taken before the component mounts and only later nodes count; edges need both ends in scope. Bisect-verified — unscoped, the fixture's "chrome" orphan is reported as the component's.

  Shown whenever a graph exists rather than gated on pressing Record: a smell is a property of the graph, not of a session, so requiring a recording to see an orphan would hide the one finding that is usually real.

  **Deliberately rows, not a diagram.** [#2517](https://github.com/pyreon/pyreon/issues/2517) §3 asked for the graph drawn via `@pyreon/flow`. The diagnostic value is the insights; a diagram of a healthy graph is a picture of nothing wrong at several times the cost, and on a real component the node count makes it unreadable exactly when it matters. The diagram stays a separate question rather than a hidden prerequisite.

- [#3638](https://github.com/pyreon/pyreon/pull/3638) [`a92fd69`](https://github.com/pyreon/pyreon/commit/a92fd69a81dde9b99ca8585e213454fbf399b7f5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Type the workbench and observatory theme through rocketstyle's `withTheme<Tokens>()` instead of casts.

  `rs` / `el` / `txt` from `@pyreon/atlas/ui` are now bound to Atlas's `ThemeTokens`, so a catalog built on them gets a typed, checked `t` in every `.theme()` and dimension callback. **Breaking:** the `dim` adapter is removed from `@pyreon/atlas/ui`; write `.states((t) => …)` directly, since `t` is now typed.

- [#2760](https://github.com/pyreon/pyreon/pull/2760) [`1676b6a`](https://github.com/pyreon/pyreon/commit/1676b6a5044aac476de34225f220edfd86ca5f4e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Atlas honours the target project's `resolve.alias`, and one broken component no longer takes down the workbench** ([#2744](https://github.com/pyreon/pyreon/issues/2744)).

  Atlas creates its Vite contexts with `configFile: false` — deliberately, since the project's config carries plugins Atlas must not double-apply (it already runs the real `@pyreon/vite-plugin`). But that also discarded `resolve.alias`, so an app whose components import through its own `~/components/…` alias failed to load every one of them.

  `resolve.alias` is now extracted from the project's vite config and applied to all three Vite contexts — the dev server, the static build, and **the scan's module loader**. The scan matters as much as the workbench: without it, an aliased component is silently absent from the catalog rather than visibly broken.

  Only `resolve.alias` is taken — never plugins, and deliberately not `resolve.conditions` (Atlas resolves workspace packages through the `bun` condition on purpose, and inheriting the app's would break every `@pyreon/*` import). A config that cannot be loaded warns and degrades to no aliases rather than refusing to start.

  `atlas.config.ts` gains an `alias` key as the explicit escape hatch. Entries declared there win — Vite matches in order and these are placed first.

  **Separately: a component that fails to load is now one broken card, not a dead workbench.** The generated catalog module used static `import * as __modN from '…'` per component; a static import cannot be caught, so a single unresolvable import failed the whole module and nothing rendered. Each component is now imported individually through a caught dynamic import, and the render path's existing error-card branch — previously unreachable for this failure — surfaces the module's own message (`Cannot find module '~/shared/tokens'`) instead of a generic "could not load".

- [#2746](https://github.com/pyreon/pyreon/pull/2746) [`ebeb330`](https://github.com/pyreon/pyreon/commit/ebeb330b6066f219644d266e1757717a691a843c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **`--check` — the ratchet. `atlas scan` and `atlas verify` can now answer "did I help?", not just "how is it now?".**

  Absolute counts (`14 verified, 1 failing`) answer the second question and cannot answer the first — which is the one anyone iterating actually has, and the only signal an agent can use to decide whether to keep a change or back it out. A single number is not a reward signal; a delta is.

  `--check` compares the run against the **committed** `atlas-catalog.json` and exits non-zero on a regression:

  ```
  atlas --check: REGRESSED — 2 check(s) started failing
    ✗ button--empty — now failing: interaction
  ```

  **A check that STOPS RUNNING counts as a regression.** This is the case absolute counts structurally cannot catch, because losing coverage makes the numbers improve. Delete a wrapper from `atlas.config.ts` and every mount-dependent check drops to `skip`:

  ```
  atlas: discovered 1 component(s), 2 scenario(s) — 0 verified, 0 failing, 2 unverified.
  atlas --check: REGRESSED — 4 check(s) stopped running
    ✗ button--empty — no longer checked: interaction, leak
      (coverage lost — the failure did not go away, the check did)
  ```

  `2 failing` became `0 failing` and the catalog reads as fixed. Losing coverage is the one way to "fix" a red catalog that must never read as green.

  Three deliberate behaviours: `--check` never writes the catalog (a ratchet that overwrites its own baseline compares a run against itself and can never report a regression again); a missing or unreadable baseline is exit 0 with a note, never a failure (making the first `--check` run red for everybody is how a ratchet gets disabled on day one); and a new or removed scenario is not a regression (adding a component with a failing edge case is new information, deleting one is a legitimate edit).

  The diff is per CHECK rather than per scenario — "still failing" and "failing for a different reason" are different events — and iterates `CHECK_KEYS`, so a seventh check is ratcheted the day it lands.

- [#2732](https://github.com/pyreon/pyreon/pull/2732) [`efa2fac`](https://github.com/pyreon/pyreon/commit/efa2fac0a729e5587f2a2b940a4459657bb9628b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `routerPlugin` — route state as a scenario axis for components that ask the router questions.

  **Sized honestly.** A component calling `useRouter()`/`useParams()` does not crash in the workbench today: Atlas already detects a missing provider and reports that the fix is an `atlas.config.ts` wrapper. So this removes hand-written boilerplate, and adds the thing a wrapper cannot give you — `/users/1` and `/users/999` as SEPARATE verified scenarios, each with its own verdict, snapshot and URL.

  The URL is carried as scenario METADATA, not as an arg. In `args` it would render as a control the component does not have and let a user "edit" something with no effect.

  `installRouter` builds the router from the module the loader resolved, never Atlas's own copy — `useRouter()` resolves against module-level state inside a particular copy of `@pyreon/router`, so a router made from the wrong one is invisible to the component and reports "no router" while one demonstrably exists. It clears the active router on dispose, because that state outlives the scan and would otherwise answer for whatever runs next, including a check meant to observe a component WITHOUT one.

  With no URLs configured the plugin is the identity function, so it costs nothing until it is given something to vary.

- [#2728](https://github.com/pyreon/pyreon/pull/2728) [`073b3ae`](https://github.com/pyreon/pyreon/commit/073b3aed6389ee23de5e555d7da640d94c88ccf8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the SSR-parity verify check — does each scenario survive `renderToString` + hydrate?

  A hydration mismatch is the framework's own first-class bug class: the SSR↔hydration differential fuzz found six shipped instances, every one a cursor misalignment where the server's HTML and the client's expectation disagreed about how many DOM nodes a construct occupies. None of Atlas's other checks could see it — `interaction` mounts on the client and never renders on a server, and `snapshot` photographs one render, so a build that is consistently wrong photographs consistently. Every scenario a catalog already has now becomes a parity test at zero authoring cost.

  **Two oracles, because one is not enough.** The runtime's own mismatch channel must report nothing, AND the hydrated DOM must equal a fresh client mount. The second exists because the first can agree on broken — an SSR pass and a hydrate pass reaching the same wrong DOM produce zero mismatches, and only an independently-built third instance reveals it.

  `VerifyVerdict` gains a sixth check, `ssrParity`. Consumers reading the catalog's verdict shape see one more field; `verify-browser` carries the node-side verdict through rather than recomputing it.

  **Honest limits, stated in the source rather than discovered later.** The check is BLIND to `typeof window` branching: both renders happen in one process with DOM globals installed so components can mount at all, so the "server" pass sees a browser too and the two sides agree. What it does catch is non-deterministic renders (`Math.random()`, `Date.now()`, per-render ids), components that throw only under `renderToString`, and the framework's own cursor-misalignment class. It skips with a reason when `@pyreon/runtime-server` is not installed, since a component library with no SSR story is a legitimate project.

  Verified end to end, not just unit-tested: against the 43-scenario workshop catalog it reports 43 passes, and perturbing a real component to render non-deterministically moves the scan to 39 verified / 4 failing with a source-anchored finding (`text at root > button > reactive: expected 12, DOM had 11`).

- [#2760](https://github.com/pyreon/pyreon/pull/2760) [`1676b6a`](https://github.com/pyreon/pyreon/commit/1676b6a5044aac476de34225f220edfd86ca5f4e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Store panel — the writes an interaction made, steppable** (Atlas roadmap §9, the last open item on [#2517](https://github.com/pyreon/pyreon/issues/2517)).

  `@pyreon/store` publishes a mutation stream: every write announces its store, whether it was a `patch` or a direct set, and the per-key old/new values. Storybook has no equivalent, because React state changes are private to the component that owns them — there is nothing to subscribe to.

  Press Record, interact with the preview, then step back through the writes. Stepping back shows the store **as it was**, not a recomputation. The panel also flags keys written more than once in a single interaction — a loop or a chain of dependent writes, worth seeing and not automatically wrong.

  Recording is explicit rather than always-on, matching the Perf panel: `addStorePlugin` attaches to every store created afterwards, so a session-long subscription would pay for every write whether anyone is looking or not.

  `@pyreon/store` is an **optional** peer — a project that uses no stores sees a panel that says so, not an error.

- [#2741](https://github.com/pyreon/pyreon/pull/2741) [`019d5d1`](https://github.com/pyreon/pyreon/commit/019d5d1118d172c333b885122bb5ad286c1bcb50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **`atlas verify <Component>` — the write → verify → fix loop, and a scan that says WHICH check failed.**

  A scan reported `41 verified, 2 failing`. That counts _scenarios_, and it withholds the finding: six checks run per scenario, and the one that failed is the whole content of the message. Answering "which check?" meant opening `atlas-catalog.json` and walking it by hand.

  - **Every run now prints a per-check tally** — `checks: a11y 18/20 ✗ · interaction 43/43 · ssrParity 43/43 · leak 43/43` — plus `not run:` lines naming the checks that were unavailable and why. This is not cosmetic: on a package where `@pyreon/runtime-server` does not resolve, the scan reports **1090 of 1090 scenarios verified** having run two of the six checks. True, and completely misleading without the tally.
  - **A failing scan now prints the failing CHECK and its findings**, not a bare list of scenario ids. Capped at 20 rows on a whole-catalog scan, and the cap reports itself.
  - **New `atlas verify [Component] [--cwd <dir>] [--json]`.** Discovery still walks the project — a component's file is not known until it does — but decoration and verification run only for the match. Measured on `@pyreon/ui-components` (108 components, 1090 scenarios): 1.35s full scan against 0.90s scoped to one component's 60 scenarios; the verify work drops ~18× while discovery dominates the residual, so it is a focus tool first and a speed tool second. Failing scenarios print uncapped. `--json` emits the report as data for an agent to branch on.

  Three refusals in `atlas verify` are deliberate. It **never writes `atlas-catalog.json`** — a one-component catalog would replace the real one and silently break the agent guide, the MCP tools and `atlas check` for everything else. An **unmatched name exits non-zero** with suggestions, because filtering to nothing otherwise reports "0 scenarios, 0 failing", which reads as a pass. And a run where **nothing could be verified exits non-zero** too: zero failures is not a pass when zero checks ran.

  **Load errors are classified instead of blanket-blamed.** `virtual:zero/routes` is a module a build plugin synthesises; the import is correct and unresolvable only because Atlas does not run that plugin. Every scan of every zero app printed "fix the import and re-run" for it. Those are now reported separately, as "nothing to fix" — while still stating that a component defined in such a file would be absent, which is the half that remains true. A genuinely broken import keeps the loud, actionable message.

  **Fixes a pre-existing arg-parsing bug**: `--cwd` was missing from the value-flag set, so any command reading a positional alongside it took the _path_ as that positional. `atlas check Button --cwd ./ui` parsed `./ui` as the component's args JSON and reported "could not parse the args" for a command line that is entirely correct.

  `CHECK_KEYS` and `CheckKey` are now exported from the plugin registry as the single owner of the check list, so a seventh check cannot be merged into verdicts while going uncounted in the report.

  `pyreon atlas --help` lists the new `verify` subcommand (`@pyreon/cli` passes every argument through, so the command itself already worked — the help text was the gap).

- [#3505](https://github.com/pyreon/pyreon/pull/3505) [`a0c7732`](https://github.com/pyreon/pyreon/commit/a0c7732c35be91fa90c9adecd7617cd1949107a2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Workbench UX and DX fixes from the 2026-09 audit.

  - **The sidebar has a persistent filter.** The tree used to be filtered by the ⌘K dialog's query, which every exit path clears — so a 108-component tree could never stay filtered. `filter` is its own signal with its own input; the dialog keeps its transient query.
  - **↑↓ browse the rows the sidebar shows** (filtered, parts under their parent, nothing inside a collapsed group) and scroll the selected row into view; the old walk over the flat catalog order selected components that were not on screen.
  - **Addon panel bodies are built on demand and rebuilt per component.** Every panel's body ran at mount (a reactive-graph baseline walk among them), and a panel's results — an axe run, a Lens verdict — outlived the component they were about.
  - **Parts nest under their parent in the sidebar** (`partOf`), and a long scenario list is capped at 8 with a "show all N" row.
  - **A link carries the view** (`?view=docs` — a Docs page was unlinkable), a forced pseudo state, the Data panel's query state and the Roles panel's role. Brand, appearance, panel widths and open flags persist in `localStorage`; a link still wins for what it names.
  - **`atlas dev` re-derives the catalog when a scanned file changes** — a component added, a prop renamed or a variant declared after boot was invisible until a restart. Debounced, serialised, and a failed rescan keeps the previous catalog and says so.
  - **Measure reports real pixels** — at 200% zoom a 100×40 button reported 200 × 80.
  - The a11y probe coalesces mutations into one frame and notifies only when a check changed (the hover highlight was re-running the analysis it fed).
  - Chrome a11y: the view segment and addon tabs are `tablist`/`tab` with `aria-selected`; the resize handles are focusable `separator`s movable with ←/→ (⇧ for 64px); the ⌘K dialog is a `dialog` that restores focus to its opener; the profile avatar states `aria-haspopup`/`aria-expanded`.
  - The usage snippet shows object/array props and has a Copy button; the search index is built once; the catalog graph's collision path is a lookup, not a scan (O(n²) on a 995-file icon package); both side panels start closed below 900px.

- [#3077](https://github.com/pyreon/pyreon/pull/3077) [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Make the Atlas story actually automated: previews, scenarios and a wrapper, all
  from the spec.

  The `atlas` plugin already emitted scenarios, but they were keyed by a native
  data component Atlas has no reason to scan, and varied RESPONSE fields rather
  than props. It produced a plausible-looking file that did nothing — the
  "generated but never wired" shape, and only running `atlas scan` against a real
  project surfaced it.

  Now:

  - **`components.tsx`** — one browsable preview per read operation. The variant
    axis is the DATA STATE (`loading` / `error` / `empty`), which is a real prop,
    so Atlas infers a control for it, and they are the three states a live
    request will not show you on demand.
  - **`atlas.wrapper.tsx`** — the `QueryClientProvider` the previews need, with
    the generated mocks installed, so every card renders with **no server**. Atlas
    names the missing provider precisely when there is none, so this is a step
    the generator can simply take.
  - **A transport seam on the generated client.** Endpoints bind at declaration
    time, so middleware cannot be added to `createHttp` afterwards — which a mock
    installed by a wrapper or a test never can be. One passthrough entry reserves
    the slot; `installMocks()` uses it.

  Measured on the bookshelf example: `atlas scan` discovers 2 components and 8
  scenarios, **8 verified, 0 failing** — and `atlas.config.ts` names no component,
  no scenario and no provider.

  **`@pyreon/atlas` gains `ignore`**, a list of path fragments added to the
  discovery defaults. A file can export a PascalCase component and still not
  belong in a catalog: generated code shaped for another compiler, an internal
  helper, an app entry point. Without it the only options were to browse it or
  rename it, and a card that throws on every scenario trains people to ignore the
  report.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#3624](https://github.com/pyreon/pyreon/pull/3624) [`0ea195a`](https://github.com/pyreon/pyreon/commit/0ea195a3b81cd611786d4a1ee515084a74fe7089) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas` refuses what it used to get wrong in silence, and `atlas build` ships a production site a fraction of the size.

  - `atlas build --out <dir>` no longer empties a directory it did not write. `--out .` deleted the project and `--out src` replaced the components with the site. The project, the source directory, and any non-empty directory without the `.atlas-build-output` marker are now refused before anything is touched.
  - `atlas build` output: each component's baked Docs source and Lens answer is a small JSON file under `_atlas/rpc/`, fetched on demand, instead of 1.4 MB of inline script copied into every page. On `ui-components` the site went from about 149 MB to 4.2 MB and each page from 1.4 MB to 4.5 KB. File paths in it are project-relative. The site is now a production build; it had inherited `NODE_ENV=development` from the scan, which shipped the dev build and a 266 ms boot task.
  - Unknown options are errors with a did-you-mean on every command; before, `atlas scan --json` printed text and a typo'd `--outt` built into the default location. `--dir` now works as documented, and surplus arguments (`atlas verify Button app`) are rejected with a pointer to `--cwd`.
  - `atlas scan --json` prints one JSON document. A component whose module fails to load makes `scan` exit non-zero instead of 0.
  - `atlas verify <Component> --check` compares against that component's slice of the baseline, so a catalog of two or more components no longer always reads as regressed; `--check --json` ratchets instead of silently skipping; a "REGRESSED" verdict names removed scenarios.
  - `atlas dev` falls back to the next free port unless `--port` is given, validates `--port`, and keeps its own Vite dependency cache, so it no longer makes the project's own dev server re-optimize.
  - Added `--version` and `atlas <command> --help`. `atlas init`'s template suggests `h()` instead of JSX, which a `.ts` config cannot parse. The help documents `--dir`, `--port`, `--cwd` and the real `verify` shape.

- [#3626](https://github.com/pyreon/pyreon/pull/3626) [`3e0241f`](https://github.com/pyreon/pyreon/commit/3e0241f7346f262206361745a3727573b92d7b8d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Correctness fixes across discovery, verification and the dev server:

  - `verify-browser` no longer turns a scan-time `ssrParity` failure into `ok: true`, counts a screenshot that threw as a visual failure, and writes the catalog atomically.
  - Props types written as `x?: 'a' | 'b' | undefined`, `boolean | undefined`, `'aria-label': string`, `interface P extends Base` and `type P = A & {…}` are read in full, and `export const A = …, B = …` catalogues both.
  - Same-named components in one package get distinct scenario ids, and `atlas verify` accepts the qualified key (`Card@src/b`) instead of silently picking the first `Card`. Collision-free catalogs are byte-identical.
  - Discovery's ignore patterns match relative to the scan root, so a project under e.g. `my.test.app/` is no longer empty.
  - `[Pyreon]` framework dev warnings emitted while a scenario mounts or hydrates are recorded as `framework-warning` findings on that scenario instead of printed mid-scan.
  - A check that did not run names its real cause — `load-failed` (with the import error) or `mount-disabled` (new `mountDisabledPlugin()`) — and the report no longer prints "not run" twice.
  - The scan's embedded Vite runs without HMR/WebSocket and without its own logging (`ATLAS_VITE_LOG=1` restores it), and a project that cannot resolve `@pyreon/core` / `runtime-dom` gets an install command.
  - `atlas dev` rescans in a child process (a second in-process scan was 7× slower with false failures and +420 MB), and rescans on saves in every `projects` directory and on `atlas.config.*` edits.

  The scan summary now shows these too: `--no-mount` reports its skipped checks as a choice rather than "no plugin claimed this check"; a project that cannot resolve `@pyreon/core` gets the install command instead of a per-file import error; and framework dev warnings raised while scenarios mounted are listed with the scenarios that raised them.

- [#3771](https://github.com/pyreon/pyreon/pull/3771) [`89f73eb`](https://github.com/pyreon/pyreon/commit/89f73eb4dd3a77aa647df2460075f3fd9e9ee0ea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Preserve distinct same-named rocketstyle components and their contracts during discovery. Deduplicate true runtime re-exports, and qualify static-scan claims by source file so an unrelated component sharing the name remains in the catalog.

- [#2765](https://github.com/pyreon/pyreon/pull/2765) [`443a646`](https://github.com/pyreon/pyreon/commit/443a646875093e1987fbf4be56ffac934ba60c17) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Diagnosability round from an upstream report. `atlas scan`'s dual-instance refusal now prints the TWO resolved framework copies (path + version, extracted from the caught sentinel error's own `A:`/`B:` lines) — the summary alone said "align the versions" while withholding where the second copy lives, sending the reader into node_modules archaeology for a fact the error already carried. A message shape with no `A:`/`B:` lines degrades to the summary standing alone. Plus: `@pyreon/validate` and `@pyreon/validation` READMEs each open with an explicit not-to-be-confused cross-reference (near-identical names, different jobs — validator-you-use vs stack-wide contract/adapters — a documented conflation trap).

- [#3455](https://github.com/pyreon/pyreon/pull/3455) [`edddc41`](https://github.com/pyreon/pyreon/commit/edddc4132f8c079833e39f63158a3307f4995163) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix an ambiguous component name resolving silently to one of its siblings.

  When several components share a name, the graph qualifies them by directory
  (then by filename, for the generated-icon case where the directory is
  identical). That escalation DELETES the shared bare key and re-inserts both
  sides qualified — which left the bare key vacant, so the next component with
  the same name found nothing there and claimed it.

  With an odd number of siblings one therefore kept an unqualified key: five
  `Glyph` components in one directory produced `Glyph`, `Glyph@A`, `Glyph@B`,
  `Glyph@C`, `Glyph@D`. Because `resolveComponent` matches an exact KEY before
  it considers ambiguity, `graph.get('Glyph')` then resolved silently to
  whichever sibling held the bare key instead of reporting the five candidates
  — the same "pick one and say nothing" the identity module exists to prevent,
  and which its docstring specifically calls out.

  A name that has split once is now tracked, so a later arrival is qualified
  against its siblings rather than taking the vacated key. An ambiguous bare
  name resolves to `undefined` with the candidates reported, as documented.

- [#3630](https://github.com/pyreon/pyreon/pull/3630) [`2f0170f`](https://github.com/pyreon/pyreon/commit/2f0170f69d72e7a8c9cd931ea226ffcac528ea65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Workbench shell polish. Below 900px the sidebar becomes an overlay drawer and the addon panel a bottom sheet (one-row top bar, icon-only search, keyboard hints hidden on touch). The sidebar opens on its first row, reveals and scrolls to the selected component (expanding collapsed folders), folds a folder named after a component into that component's row, marks the active scenario, and reports the matched count with an empty state while filtering. Addon tabs sit on one scrolling row with inapplicable panels dimmed; control widgets expose `aria-pressed`, `role="switch"` + `aria-checked` and label association. Links only carry non-default state. The ⌘K focus ring, the light-mode preview surface, the Contrast swatch and label casing are fixed, and web fonts load non-blocking with only the weights in use.

- [#3712](https://github.com/pyreon/pyreon/pull/3712) [`625c2f5`](https://github.com/pyreon/pyreon/commit/625c2f5877f2b0eb64f86a8509255d50a8a20219) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas verify-browser` no longer depends on `pngjs` or `pixelmatch`. Snapshot comparison runs on Atlas's own PNG decoder (the 8-bit truecolor / truecolor+alpha shapes Chromium screenshots use, with every chunk CRC and scanline filter checked) and its own perceptual diff (the same YIQ metric and anti-aliasing detector). Verdicts are unchanged: the diff is held byte-identical to pixelmatch 7.2.0 — count and diff image — by a differential corpus of real Chromium screenshot pairs plus 400 seeded synthetic pairs recorded before the dependencies were removed.

  A failing snapshot now also writes `<id>.diff.png` beside `<id>.actual.png`, marking the differing pixels in red. A baseline an image optimizer re-encoded (palette, 16-bit, sub-byte depths, interlaced) is refused with a message naming the cause instead of being decoded approximately — delete it and re-record with `--update-snapshots`.

- [#3632](https://github.com/pyreon/pyreon/pull/3632) [`5fdd4e2`](https://github.com/pyreon/pyreon/commit/5fdd4e298ecb2059f80e9ffca701c8d527b1e20b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Atlas workbench preview correctness:

  - Overlays a component portals to `document.body` (Modal, Dialog, Drawer) are adopted into the preview surface, which is their containing block — they render on the canvas in the kit's fonts instead of covering the whole workbench and swallowing the sidebar's clicks. The Docs block adopts them too.
  - A project `wrapper` now receives the render's appearance — `mode`, `dark`, `brand` accessors (`AtlasWrapperProps`) — per render, so a provider can follow the dark workbench and each Theme Lab tile. A wrapped catalog whose wrapper never reads `brand` gets one Lab tile per mode and a note saying why, instead of identical brand cards.
  - The Actions panel logs DOM interactions inside the preview (click, input, change, keydown, focus/blur) with the element they hit, so rocketstyle libraries — which declare no typed `onClick` — are no longer silent.
  - Docs: the props table rows share one grid, the Copy action is a real button, a verified scenario reads as a pass, and the Source block follows re-exports to the component's own module instead of printing the package barrel.
  - Props that `extend` a sibling workspace package's interface are read (Combobox had no controls); prop types resolve across the enclosing workspace when `atlas dev`/`build` is pointed at a package; an unreadable-type prop no longer gets a fabricated `''` default; structure-valued args show read-only in Controls.
  - A11y: the summary counts the structural checks and axe together, labels every stat, and a violation names its target selector and markup. Why?: nodes are labelled by name or creation site, with readable chips. The Data flags strip wraps. Choosing a scenario keeps typed content the scenario does not vary.

  `@pyreon/code`: the dark theme ships its own token colours — it relied on CodeMirror's light fallback highlight style, rendering keywords and strings near 2:1 against the dark background.

- [#3470](https://github.com/pyreon/pyreon/pull/3470) [`ac8d11a`](https://github.com/pyreon/pyreon/commit/ac8d11a15c690d05bd40417652019ff680f29d0f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Keep optional render props absent in generated catalogs instead of replacing them with action-log callbacks, preventing components such as Combobox from rendering an empty preview. Also keep Docs scenario navigation from being miscompiled into a chained call that throws instead of selecting the scenario.

- [#3488](https://github.com/pyreon/pyreon/pull/3488) [`76d6ae4`](https://github.com/pyreon/pyreon/commit/76d6ae4aad38d0d145edcd468a19d3b3907b87a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Resolve an undeclared package subpath that names a DIRECTORY to the index file inside it, not to the directory. The workspace resolver's fallback walk tested `<pkg>/<subpath>` with a bare `existsSync`, which a directory satisfies, so `@acme/core/utils` against a package shipping `utils/index.js` handed the loader the directory and the import failed as `UNLOADABLE_DEPENDENCY`. The walk now requires a file, matching the sibling resolver that already did.

- [#3687](https://github.com/pyreon/pyreon/pull/3687) [`181eac5`](https://github.com/pyreon/pyreon/commit/181eac590c765191c38838f93093fc19c5d08e92) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A prop whose type Atlas cannot classify (an object, a VNode, a union of shapes)
  now starts UNSET in the workbench instead of as an empty string. `''` is a value
  such a component never expects: a generated `@pyreon/lathe` preview read
  `data: ''` as "render this" and showed a record of dashes instead of requesting
  its data. String props still start empty; a content seed still wins.

- [#3165](https://github.com/pyreon/pyreon/pull/3165) [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Close the pre-release audit's long tail: a fail-open URL guard, an inert verification axis, an unnecessary supply-chain surface, and two overstated claims

  **`isSafeImageDataUri` failed OPEN on a malformed percent-escape.** The base64 branch returns "unsafe" when `atob` throws; the percent branch caught the `decodeURIComponent` failure, kept the raw still-encoded payload, and scanned that — but the scripted-SVG regex matches `<script` and ` on…=`, neither of which appears in `%3Cscript%3E`. So one trailing `%` took a payload from blocked to allowed. The function's own docstring already promised the base64 branch's behaviour for both, so the two branches disagreeing was the whole defect. Scoped to `src`/`srcset`/`poster` on image/video elements where a scripted SVG does not execute, so this is defence-in-depth — reported because a guard that fails open is worse than one that does not exist: it is relied on.

  **`@pyreon/atlas`'s route axis was inert.** `installRouter` had zero callers and `Scenario.route` had zero readers while `routerPlugin` was publicly exported, so a `routerPlugin({ urls })` config produced the expected doubled scenario count with names like `Profile @ /users/999` — and every one passed having mounted with no router installed. Two different URLs rendered byte-identically and both reported `pass`. The router is now installed around the scenario mount through a registration seam (the plugin publishes an installer; the plugin that owns mounting consumes it, so there is still ONE owner of the router's install/dispose), disposed in the same window so it cannot answer for the next scenario, and a route that CANNOT be applied is reported as a finding rather than passing silently.

  **`@pyreon/code`'s 15 `@codemirror/lang-*` packages move from `optionalDependencies` to optional peers.** `optionalDependencies` reads as optional and is not: every package manager installs them by default, so every consumer carried their install weight and CVE surface for grammars they never load. Each is reached through a lazy `import()`, which is exactly the shape `@pyreon/document` moved to `peerDependenciesMeta.optional` for the same reason.

  **The Vercel revalidate handler compares its secret in constant time.** It was `secret !== expected` under a comment calling it "constant-time-ish"; `!==` short-circuits at the first differing byte regardless of length, which is precisely the leak the phrase claimed to avoid. Length is compared separately because `timingSafeEqual` requires equal-length buffers — that leaks the secret's LENGTH, which is stated rather than hidden.

  **`serverIsland` documents that its props are client-controlled.** The fragment endpoint is public and unauthenticated; the island NAME is allowlisted, the props are not, so a fragment renders with attacker-chosen props inside a full request context. That is the intended design, but neither the JSDoc nor the manifest said so — an island that reads a `userId` prop and returns that user's data is an IDOR by construction. Now named as the first entry in the API's `mistakes`, so it reaches `llms.txt` and the MCP reference too.

- [#3174](https://github.com/pyreon/pyreon/pull/3174) [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update third-party dependencies to their latest compatible releases,
  extending [#3174](https://github.com/pyreon/pyreon/issues/3174)'s sweep to every package.json the first pass hadn't reached
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
  `.agents/guides/benchmarks/README.md` was measured against 0.1.46 and
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

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#3669](https://github.com/pyreon/pyreon/pull/3669) [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Docs/manifest accuracy pass over the ui-system and tools packages — no runtime changes.

  - `@pyreon/ui-core`: manifest grew from 6 to 18 `api[]` entries, now covering every real export — `init`, the descriptor-safe `get`/`set`/`merge`/`pick`/`omit`/`isEmpty`/`isEqual` utilities, `throttle`, `compose`, `resolveSlot`, `isPyreonComponent`, `render`, `useStableValue`, `HTML_TAGS`/`HTML_TEXT_TAGS`, the `getThemeEngine`/`setThemeEngine` theme-engine registration seam, and `resolveCssVariables`. The deprecated internal `Provider`/`context` are now called out in `gotchas`.
  - `@pyreon/unistyle`: manifest grew from 11 to 14 entries — added `values`, and the Custom-Property Style Extraction (CPSE) primitives (`cpseRewrite`/`cpseVarName`/`extractStyleVar`, `cpseStyled`) that were previously undocumented despite backing the `styleExtraction: true` opt-in.
  - `@pyreon/atlas`: added `atlas init`, `atlas check`, and `defineAtlas` manifest entries — three real CLI/API surfaces that had zero documentation on the manifest or the docs site. Corrected `defineAtlas`'s description: it types `createAtlas()`'s programmatic options, not the wider `atlas.config.ts` file convention (a real, easy-to-hit type mismatch if conflated).
  - `@pyreon/lathe`: added `resolveProjects`, `resolveTransform`, and `worstVerdict` manifest entries (referenced in existing examples but previously undocumented).
  - `@pyreon/lint`: added the `lintAsync` manifest entry (the worker-pool sibling of `lint()`, used by the CLI itself for large runs).
  - `@pyreon/loom`: added the `loom build` manifest entry — a real, shipped CLI command (static-site export of the observatory) that was missing from both the manifest and the docs site.

  Docs-site fixes:

  - `docs/elements.md`: documented the previously-unexplained `contentDirection`/`contentAlignX`/`contentAlignY` trio (governs a SIMPLE Element's layout, default `'rows'`) and the per-slot `beforeContentDirection`/`afterContentDirection` trio, and clarified that the existing `direction`/`alignX`/`alignY` props only apply once `beforeContent`/`afterContent` make an Element compound — passing `direction` alone on a simple Element was silently a no-op with no explanation anywhere in the docs.
  - `docs/ui-core.md`: added the theme-engine registration seam section (`getThemeEngine`/`setThemeEngine`) and fixed a broken internal anchor link.
  - `docs/atlas.md`: added `atlas init` and `atlas check` sections — both real, documented-in-`--help` commands with zero prior coverage; renamed the stale "The four commands" heading (five sub-sections were already documented, plus two more added here).
  - `docs/loom.md`: added the `loom build` section.
  - `docs/lathe.md`: added the `lathe pull` section and a full CLI flags reference (`--target`, `--base-url`, `--client`, `--validator`, `--strict-native`, `--fail-on-breaking`, `--watch`), none of which were previously documented on the docs site despite being real, shipped flags.

- [#3651](https://github.com/pyreon/pyreon/pull/3651) [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hardening pass across six fundamentals packages.

  **@pyreon/rx** — `groupBy` / `keyBy` / `countBy` / `mapValues` now build prototype-free records (`Object.create(null)`). A key named `constructor` made `groupBy` throw and `countBy` produce `'function Object() …1'`; a `__proto__` key was written as the result's prototype and vanished. Behaviour change: the results no longer inherit from `Object.prototype` (call `Object.hasOwn(result, k)`, not `result.hasOwnProperty(k)`). `search()` gains signal/plain overloads (a plain call is typed `T[]`, a signal call a computed) instead of `any`.

  **@pyreon/machine** — event and state names are looked up as OWN keys, so `send('toString')` is an unhandled event instead of moving the machine into an undefined state; an initial/target named after an `Object.prototype` member is rejected at creation. A throwing `onExit` / `onEnter` / `onTransition` / `onDone` listener is reported (`console.error`, `[Pyreon]` prefix) and no longer aborts the transition midway. Behaviour change: `send()` called from inside a listener is QUEUED and runs after the current macrostep completes (run-to-completion), instead of running nested in the middle of it; such a call returns the state as it is at that moment.

  **@pyreon/permissions** — behaviour change: `usePermissions([])` is a self-contained deny-all instance; it no longer falls back to the provider's instance (the mode is chosen by the presence of the argument, not its length). The native lowering makes the same choice. The resolve memo is re-enabled once `patch()` replaces the last predicate with a boolean. `can.all` / `can.any` accept an array plus a context (`can.all(['a', 'b'], post)`) so multi-checks reach context-dependent predicates; the rest-args form is unchanged.

  **@pyreon/i18n** — `<Trans>` no longer lets an interpolated value create markup: angle brackets in values are neutralised before tags are parsed, so `x</bold><link>…` renders as text instead of invoking the `link` component. Loader-returned namespaces get the same normalization as `messages` (flat dotted keys expanded, unsafe keys dropped, a store-owned deep copy). Behaviour change: locales resolve along the BCP 47 step-down chain (`en-US` → `en` → `fallbackLocale`, itself stepped down). Key paths, inline format names and custom plural rules are OWN-property lookups (`t('a.constructor.name')` no longer returns `'Object'`). `$t()` nesting no longer re-interpolates a nested result, so a value that looks like `{{x}}` is not substituted twice. The `Intl.PluralRules` cache and the per-instance resolution cache are LRU-bounded (the resolution cache used to stop caching entirely after 2000 keys).

  **@pyreon/url-state** — signals now follow navigations made through the registered router (`router.push('?page=2')`, `<RouterLink>`), including a router registered after the signal was created (`UrlRouter` gains an optional `currentRoute`, which `@pyreon/router` already provides). Behaviour changes: array params keep their element type, inferred from the default's first element (`[0]` → `number[]`), and a `,` inside an element round-trips; a lone custom `serialize` or `deserialize` is honoured (the other half is inferred), and with `arrayFormat: 'repeat'` a custom codec applies per element; `onChange` fires only when the value actually changed; an empty number param (`?page=`) and an unrecognised boolean fall back to the default, and booleans accept `1`/`0`. The native lowering decodes empty numbers and booleans the same way.

  **@pyreon/table** — `flexRenderCell` tracks the cell renderer itself (the lookup stays untracked), so a renderer reading table state such as `info.row.getIsSelected()` updates on that change; data edits still re-run only the edited row. `columnSignature` covers group columns' children and the `cell` / `header` / `footer` renderers (by source text, so an inline column literal stays stable), so a renderer swap re-renders the cells. Cleanup is registered on the owning `EffectScope` instead of `onUnmount`, so `useTable` in a store no longer warns.

  **@pyreon/atlas** — the permission-set recorder wraps the new array form of `can.all` / `can.any` too, so keys passed that way are seeded with the role's policy and recorded as consulted.

- [#2769](https://github.com/pyreon/pyreon/pull/2769) [`47ef812`](https://github.com/pyreon/pyreon/commit/47ef8126011c4985d4cd4957d1145ae221c5e1d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two new lint rules for validated upstream-shipped bug shapes (97 → 99 rules):

  - `pyreon/no-signal-read-in-attrs-callback` (styling, warn, dep-gated on `@pyreon/rocketstyle`): rocketstyle `.attrs()` callbacks run ONCE at setup, so a zero-arg call of a same-file signal/computed binding inside the callback captures a dead value that never updates (the ui-collapse-that-never-collapsed shape). Silent on `props.*`/`theme.*` reads, calls with args, the `.attrs({...})` object form, and handlers defined inside the callback; silent entirely in projects without `@pyreon/rocketstyle`.

  - `pyreon/no-guard-only-signal-reads-in-effect` (reactivity, info): flags an `effect()` whose EVERY reactive read (tracked signal call or `props.X` read) sits behind a conditional whose own test is provably non-reactive (`if (ref.current) { chart.setOption(props.option) }`, incl. the early-return spelling) — the first run can short-circuit before any read, so the effect subscribes to nothing and never re-runs. Zero-FP construction: any unconditional proven OR possible read (an unclassifiable zero-arg call like `chart.instance()`), a reactive guard test, both-branch reads, loop-body reads, nested-callback reads, and switch/catch shapes all suppress the report.

  `@pyreon/atlas`: the workbench preview's `dir`-applying effect now reads the `dir()` signal before the element guard — the previous shape subscribed only when the guard was truthy on the first run (it was in practice, since the effect is created after the element is captured, but the shape was fragile and is exactly what the new rule flags).

- [#2998](https://github.com/pyreon/pyreon/pull/2998) [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update third-party dependencies to their latest compatible releases.

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

- [#2752](https://github.com/pyreon/pyreon/pull/2752) [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Eight README examples are now typechecked in CI.

  `check-doc-examples` only ever looked at `docs/src/content/docs/**`; package READMEs carry ~550 `ts`/`tsx` blocks and nothing verified any of them. The gate now walks package READMEs too, and each of these packages has one verified-clean example opted in with the `// @check` marker.

  Each was compiled before being marked, not marked and then debugged. No content changed — the marker is a comment inside the fence.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- [#2958](https://github.com/pyreon/pyreon/pull/2958) [`7ead5f8`](https://github.com/pyreon/pyreon/commit/7ead5f8c0b10e9301f66cc0dd6a6f8f1d3ea3bdb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hydration now ADOPTS a reactive accessor's server-rendered subtree instead of rebuilding it, and `@pyreon/zero` resolves the matched route before hydrating so its pages actually hydrate in place.

  A function child's SSR output is bracketed by `<!--$-->…<!--/$-->`. Previously the general case (anything but a single text node) always deleted that range and re-mounted. `RouterView` renders its route through exactly such an accessor, so a zero app discarded its entire server-rendered page on every load — measured on the docs production build, 10 of 11,514 `<body>` nodes survived hydration (0.1%). Typed input, focus, scroll position and any listener attached by non-Pyreon code were destroyed on every page load, and the client rebuilt DOM the server had already produced.

  `hydrateReactiveChild` now hydrates the accessor's first render against that range, bounded by the end marker the same way the async-component path bounds its own. Anything the walk does not consume is swept, so a genuine divergence degrades to the previous behaviour rather than orphaning nodes.

  The SAME adoption applies to `hydrateSoleAccessorChild`, and for zero that is the load-bearing one. [#2935](https://github.com/pyreon/pyreon/issues/2935) elides the range markers when an accessor is an element's ONLY child (the tag boundary is the extent), and `RouterView` returns `h('div', …, child)` — so zero's route takes that path. Adopting in only the marked path leaves zero at 0.1%; measured, not inferred.

  That alone does not help a `lazy()` host: at hydration time the route component is not yet loaded, so the accessor's first render is the loading fallback (`null` for a route without a `loadingComponent`), which matches nothing. `startClient` therefore calls `router.preload(path, { skipLoaders: true })` before `hydrateRoot`, making the first render the real component. Loader data is unaffected — it was already seeded from `__PYREON_LOADER_DATA__`. The route chunks are `modulepreload`ed by the SSG/SSR build, so this normally resolves from cache, and the server's DOM stays visible while it does.

  Measured on the docs production build at this branch's tip, `/docs/router`: `<body>` retention 10/11,514 (0.1%) → 558/11,514 (4.8%). (An earlier cut of this branch measured 10.9%; the figure was re-measured after the later correctness commits and this is the honest current number.) The residual is NOT verifier strictness — instrumenting every adoption bail site shows zero shape/DOM-gate failures on this page. It is arming-protocol timing: compiled `_tpl` calls evaluated as h() arguments run before any DOM cursor exists, so they clone eagerly and the whole subtree below them is swapped instead of adopted. That is a separate lever — deferred `_tpl` arming — which this change makes reachable for the first time in a zero app.

  Also fixes a latent cleanup bug this exposed: `bindPolymorphicText` disposes its binding without removing the bound text node, so a NESTED accessor's adopted text survived its parent's re-emission. Invisible while every accessor re-mounted over a full range swap; caught by the SSR↔hydration parity fuzzer's post-flip oracle.

  `@pyreon/atlas`'s SSR-parity oracle now normalizes the `<input value>` attribute, which a server can only express as an ATTRIBUTE while the client sets it as a PROPERTY. A hydrated tree shows the server's attribute and a client-mounted tree shows nothing, while the live property — what the user sees, edits and submits — is identical. That check previously passed only BECAUSE hydration rebuilt every subtree, making "hydrated" and "client mount" the same code path; adoption surfaced the difference rather than causing it. Everything else the oracle compares is untouched. Scoped to `value` alone — the narrower the exemption the smaller the hole — and it should be deleted outright once [#2953](https://github.com/pyreon/pyreon/issues/2953) establishes `defaultValue` on a client mount, fixing the divergence at the source.

- Updated dependencies [[`bdd16e0`](https://github.com/pyreon/pyreon/commit/bdd16e0e3fb781e885a76c710981e1574ad24404), [`089064b`](https://github.com/pyreon/pyreon/commit/089064b8f9c98b297b2f7897a3721695be6cd1d2), [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`5fdd4e2`](https://github.com/pyreon/pyreon/commit/5fdd4e298ecb2059f80e9ffca701c8d527b1e20b), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`ed98e38`](https://github.com/pyreon/pyreon/commit/ed98e380716dacea266b65e25394b5157265a415), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`61e0482`](https://github.com/pyreon/pyreon/commit/61e0482b7fa532d439af670066b8928fe121a53c), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`f22774f`](https://github.com/pyreon/pyreon/commit/f22774ffe70af6d7be01313b27eefdbb97bd0a8f), [`4f197f4`](https://github.com/pyreon/pyreon/commit/4f197f40c814da7384df8334f2d535057e88b94c), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`890f785`](https://github.com/pyreon/pyreon/commit/890f785acfeaed76836d925a2ff61e5169b97789), [`a01e106`](https://github.com/pyreon/pyreon/commit/a01e106993cb2fde0d5ed6576fbff1c81b99c123), [`b6cda55`](https://github.com/pyreon/pyreon/commit/b6cda55a3af5bead39df51c2e4c3691c4c88f52d), [`8429598`](https://github.com/pyreon/pyreon/commit/8429598bb4a77cc4e5821191de6078002a5169bd), [`a8a7c86`](https://github.com/pyreon/pyreon/commit/a8a7c8616aa3a84cbfbaf6f74f4ec7803e3aa326), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`1517cce`](https://github.com/pyreon/pyreon/commit/1517cce174aa483890d34a93ca89a2b0ce58ea8d), [`79c1bf1`](https://github.com/pyreon/pyreon/commit/79c1bf13b1d8eb8fd65df9ff2d8fece58bed1aa0), [`c4c2d52`](https://github.com/pyreon/pyreon/commit/c4c2d5232856e31b733dbc992ea8cbb37201f53f), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`96426be`](https://github.com/pyreon/pyreon/commit/96426bef7ac3c86cf60ab898813dde449b1b0954), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`e00f2a5`](https://github.com/pyreon/pyreon/commit/e00f2a5d24336c7dba6aa9752f6fe4766d924a49), [`b7bd8e8`](https://github.com/pyreon/pyreon/commit/b7bd8e86a8eb9f5fbcd3e145f467e0789ab6c3d0), [`a6e97cb`](https://github.com/pyreon/pyreon/commit/a6e97cb4c0ee97dbc405900d4d9655f8fd81937a), [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112), [`fc0f445`](https://github.com/pyreon/pyreon/commit/fc0f445c4bf32e5b04355fa17ec5a938e9a05448), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`1f3d974`](https://github.com/pyreon/pyreon/commit/1f3d974dd15cbc1151dab8a3d31c112465bbbd81), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`26e1837`](https://github.com/pyreon/pyreon/commit/26e1837c562b35887a5b3866fc0251f086f32063), [`5ff6d4a`](https://github.com/pyreon/pyreon/commit/5ff6d4a1ea651d28b262a0b1250faaee71027c3c), [`54f6d97`](https://github.com/pyreon/pyreon/commit/54f6d97dfae80b03fbffdd7d8fade52def4c5623), [`475985d`](https://github.com/pyreon/pyreon/commit/475985dc116aaeaceadc074e5e1687cbb0305597), [`950f1c2`](https://github.com/pyreon/pyreon/commit/950f1c24e1421b6690d71255cc020b93d2d020ea), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`e9bbe3e`](https://github.com/pyreon/pyreon/commit/e9bbe3e97341b43213354ee345b6c8a18dc009da), [`1431b7b`](https://github.com/pyreon/pyreon/commit/1431b7bc0f5e3b984ba2884674c8b998b0131bb4), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`0667b0b`](https://github.com/pyreon/pyreon/commit/0667b0bdad937bd79a8a7d3fef3a2b11d7a3f7ff), [`fc0d636`](https://github.com/pyreon/pyreon/commit/fc0d636583d09a649c95d308d59b815a96a76a79), [`a156c40`](https://github.com/pyreon/pyreon/commit/a156c4069ad6882d9e402efa552566dd5714b94d), [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c), [`02cae6a`](https://github.com/pyreon/pyreon/commit/02cae6a420ef0d35f4300e907734415010493b9b), [`215768a`](https://github.com/pyreon/pyreon/commit/215768ae52a01c22d4c6a428b5e62c8a6e83a6eb), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`9b1b20a`](https://github.com/pyreon/pyreon/commit/9b1b20ad8b5deb842079927bba39068749757cc6), [`4b40ea0`](https://github.com/pyreon/pyreon/commit/4b40ea0a0b88b467c61c737f385a3253c946368f), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`43d769d`](https://github.com/pyreon/pyreon/commit/43d769d04237ece6e20b90a4499bed14c2b3b03e), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`1a7ca7e`](https://github.com/pyreon/pyreon/commit/1a7ca7ef1f982e43e2564e805a980d0a45385b73), [`c0e9e9c`](https://github.com/pyreon/pyreon/commit/c0e9e9cad5ac2cd077ca00fcd51648cee47d9fa5), [`18bc355`](https://github.com/pyreon/pyreon/commit/18bc355db06ba5f8e2eabcc6a5e68d82387d3b95), [`cb15c01`](https://github.com/pyreon/pyreon/commit/cb15c012632b66ea26b777087251aa906006a168), [`75a47dd`](https://github.com/pyreon/pyreon/commit/75a47dd93736933a941109d9a844099a54bdf58a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`bdee35d`](https://github.com/pyreon/pyreon/commit/bdee35d2915b34a31dbf3a7e184bccaf4a014a07), [`2b12889`](https://github.com/pyreon/pyreon/commit/2b12889546e64765a9c83c961e64c236f7b6dd76), [`80135d8`](https://github.com/pyreon/pyreon/commit/80135d80f82ea0f5f1c25da1f44512b8214529ea), [`71fbf23`](https://github.com/pyreon/pyreon/commit/71fbf23042b7ae852817dfa83ebecf1c9c85cca8), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`b976aa0`](https://github.com/pyreon/pyreon/commit/b976aa02bd47feceb8c3fe574edf676dc190ae37), [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832), [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`8aeffe0`](https://github.com/pyreon/pyreon/commit/8aeffe09bf62ea08af1278c45ecdaf26d1a04cb6), [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c), [`1275e17`](https://github.com/pyreon/pyreon/commit/1275e1726fed67b467377db956fda44827161589), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`9fe7be2`](https://github.com/pyreon/pyreon/commit/9fe7be2e14c2e42c79bd9267c410b9b4ebcc7676), [`fc0d636`](https://github.com/pyreon/pyreon/commit/fc0d636583d09a649c95d308d59b815a96a76a79), [`4821127`](https://github.com/pyreon/pyreon/commit/4821127fae2908e110346343b107c02b1f1b44a9), [`0764bf0`](https://github.com/pyreon/pyreon/commit/0764bf02cb3cc21881fbdebeabab9df35e13b7d7), [`d160664`](https://github.com/pyreon/pyreon/commit/d16066489fa4fb9bdb5ea4727816394a5d4477b2), [`b062eb6`](https://github.com/pyreon/pyreon/commit/b062eb6576e221bb0e02dce520a2b21f855e55fc), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`39db4ce`](https://github.com/pyreon/pyreon/commit/39db4ce30422821ac781e72d7cc27f43ac523e17), [`84e7444`](https://github.com/pyreon/pyreon/commit/84e7444cbde8b3f0259a1bdc91674d893d19d26c), [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`4be7791`](https://github.com/pyreon/pyreon/commit/4be7791afaf86864ce03a4548c30b295292e7833), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`290a386`](https://github.com/pyreon/pyreon/commit/290a38675f6363ac6f8f8d24cab47a70ca081af9), [`ddd9586`](https://github.com/pyreon/pyreon/commit/ddd95868e9a865face6c204559df037c2eadcf41), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`8a855d5`](https://github.com/pyreon/pyreon/commit/8a855d54a758f19d912152acc23beebb82c5ab14), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`1612ed1`](https://github.com/pyreon/pyreon/commit/1612ed15b80c220d049212b0f62dabccb45aa9e9), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`fd14415`](https://github.com/pyreon/pyreon/commit/fd1441504ea02a96acfcbfb3950a036cbbdae6c7), [`c9f3c6c`](https://github.com/pyreon/pyreon/commit/c9f3c6c832167f72aafe54daa2ba6b6c58f9d666), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`07f0ac8`](https://github.com/pyreon/pyreon/commit/07f0ac84535bec7386db08d4ffedf83e4de5e6a0), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`600f763`](https://github.com/pyreon/pyreon/commit/600f763fbd41493dd72812d875696a0ab3f2c623), [`1025315`](https://github.com/pyreon/pyreon/commit/1025315701d7eb0a2bea2958252c3a0efda34b29), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`b030408`](https://github.com/pyreon/pyreon/commit/b0304087973b540fa75fc0d627fd3a1dd120d1c1), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`ea63aa6`](https://github.com/pyreon/pyreon/commit/ea63aa659d52a1ebec8daf088b7a7d737658c9ad), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`0d4ebbf`](https://github.com/pyreon/pyreon/commit/0d4ebbf8a0c2ed015ee5fd29ff772cf66e7e0eb2), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`1e6c0f2`](https://github.com/pyreon/pyreon/commit/1e6c0f26e906bb3628f37a663456d572985ea61d), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a92fd69`](https://github.com/pyreon/pyreon/commit/a92fd69a81dde9b99ca8585e213454fbf399b7f5), [`db410a0`](https://github.com/pyreon/pyreon/commit/db410a0c599fde5df971c2d4ba3d95e18f7f62fb), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`f904416`](https://github.com/pyreon/pyreon/commit/f9044167f2716c658cc8b68fa2c1bde763ce328e), [`b047088`](https://github.com/pyreon/pyreon/commit/b047088bb852d53f740802a3dd388890b03cc7f9), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`7c0d3cb`](https://github.com/pyreon/pyreon/commit/7c0d3cb9c7f158a0ce308fea3da9a7b487635b9a), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`c5c44b8`](https://github.com/pyreon/pyreon/commit/c5c44b811a413688d34bd96ee7dda367d75d8b03), [`e5b71bd`](https://github.com/pyreon/pyreon/commit/e5b71bd064c94914001644f1bbafafc3c2b97559), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`6c9e618`](https://github.com/pyreon/pyreon/commit/6c9e6189660eee8d672825d6b6fc905155db2f9e), [`531d7a1`](https://github.com/pyreon/pyreon/commit/531d7a1c6294624c7e0ac63919d6bb4a70386c07), [`cfbb342`](https://github.com/pyreon/pyreon/commit/cfbb3426f12049b86f596bc3337245accf75be5b), [`08f4356`](https://github.com/pyreon/pyreon/commit/08f4356efd8fe17fb1b443d24af2a3ce834acdc5), [`2486982`](https://github.com/pyreon/pyreon/commit/2486982da2c663375b7825ff23bbd0c16a94684c), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5f59c0e`](https://github.com/pyreon/pyreon/commit/5f59c0e4e0efe5e122719276696f23b2e888d201), [`02905e4`](https://github.com/pyreon/pyreon/commit/02905e41eaaaf204e181abc7f8879093bb47dccf), [`b67df5e`](https://github.com/pyreon/pyreon/commit/b67df5ede1eed345022f3777968211f3526000c7), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`9dafed7`](https://github.com/pyreon/pyreon/commit/9dafed7a5238c057c44c00dcff3b56044f16dfa8), [`a370824`](https://github.com/pyreon/pyreon/commit/a370824dabd0af7a9543c6a986ecf0ef252eb7a5), [`05ad36a`](https://github.com/pyreon/pyreon/commit/05ad36acb9e3dfe6b4f9ee8b012fc9919f8cd219), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`adb5897`](https://github.com/pyreon/pyreon/commit/adb58970bc878291bfd892927ee15cb8a4ca87a9), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`0b2edfc`](https://github.com/pyreon/pyreon/commit/0b2edfc24f106f765bd356c2a572bcae0b75d8d0), [`57f0480`](https://github.com/pyreon/pyreon/commit/57f04800c4fc7bb5f2e4098e6b3399a0860ab6eb), [`e690309`](https://github.com/pyreon/pyreon/commit/e690309cc58c842fc8cb07869519b4288c667eb5), [`f84675f`](https://github.com/pyreon/pyreon/commit/f84675fb134fe96c7d76c1631f754954816183bd), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`e506bcf`](https://github.com/pyreon/pyreon/commit/e506bcf796a930094e5f5665b72e7efa4967a62c), [`f8ee02a`](https://github.com/pyreon/pyreon/commit/f8ee02aadb4c1fa2c223201f8f2480a143341e42), [`37902b5`](https://github.com/pyreon/pyreon/commit/37902b5117083680c958b9ecf37af8572a126223), [`b689ffd`](https://github.com/pyreon/pyreon/commit/b689ffd0b004a387591c912479f080442ffce49b), [`ec0a2cb`](https://github.com/pyreon/pyreon/commit/ec0a2cb240ae3f2f13508b44b00d4dafce4b1733), [`55699c3`](https://github.com/pyreon/pyreon/commit/55699c3ee3c0381679c65d9de087747e7f591f85), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`47dfb62`](https://github.com/pyreon/pyreon/commit/47dfb62f7ea49b523dfff216710e0ce6e1f5ec73), [`086ca67`](https://github.com/pyreon/pyreon/commit/086ca67dd5219a7e80111c2c62c301be4263f535), [`967f78b`](https://github.com/pyreon/pyreon/commit/967f78b1c1d87d1eac156b1d122d27e772734330), [`195a9dc`](https://github.com/pyreon/pyreon/commit/195a9dc6417f964eb3858772da449a3bc1f1d02a), [`29f1002`](https://github.com/pyreon/pyreon/commit/29f10026097e30e261dcc49ad25ea3928ab7e026), [`968781e`](https://github.com/pyreon/pyreon/commit/968781ea3156803fe79aef5ae11146fce1278986), [`5c175d4`](https://github.com/pyreon/pyreon/commit/5c175d42ddd614a6fd58c1832c36ea4f98898f5a), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`0cc9209`](https://github.com/pyreon/pyreon/commit/0cc9209a35e4ab9e73e849dd092ed654c2a56ed4), [`cf64ac7`](https://github.com/pyreon/pyreon/commit/cf64ac738115998ade80f3c8ed984a2d109cbc17), [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`0653ff0`](https://github.com/pyreon/pyreon/commit/0653ff0c23ae1303cb0854598d1137a424104b86), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`b735e04`](https://github.com/pyreon/pyreon/commit/b735e040674de13d31aa30913ff5a3896c2f8b90), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`09b8661`](https://github.com/pyreon/pyreon/commit/09b8661fd6df33d6314db04518ca524fba5d04dc), [`2cf6f2a`](https://github.com/pyreon/pyreon/commit/2cf6f2a15fe3d07ba78669b79f3a5385a60b6088), [`7ead5f8`](https://github.com/pyreon/pyreon/commit/7ead5f8c0b10e9301f66cc0dd6a6f8f1d3ea3bdb)]:
  - @pyreon/compiler@0.52.0
  - @pyreon/runtime-dom@0.52.0
  - @pyreon/feature@0.52.0
  - @pyreon/ui-core@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/unistyle@0.52.0
  - @pyreon/hooks@0.52.0
  - @pyreon/code@0.52.0
  - @pyreon/styler@0.52.0
  - @pyreon/vite-plugin@0.52.0
  - @pyreon/store@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/permissions@0.52.0
  - @pyreon/rocketstyle@0.52.0
  - @pyreon/elements@0.52.0
  - @pyreon/config@0.52.0

## 0.51.0

### Minor Changes

- `@pyreon/atlas` is now published: the AI-native component workbench. Derives a (e6ff11f)
  verified, machine-readable component catalog from your source (`atlas scan`),
  serves a zero-config workbench (`atlas dev`), and runs the browser half of
  verification — real reactive-coverage measurement plus visual snapshots — with
  `atlas verify-browser`.
- `pyreon.config.ts`, `atlas init`, and a detector that finds the components people actually write. (f7835ed)

  **One config for the ecosystem.** New `@pyreon/config` package: a single
  `pyreon.config.ts` with a typed section per package, instead of a file per tool.

  ```ts
  import { defineConfig } from '@pyreon/config'

  export default defineConfig({
    atlas: { title: 'Acme Design System' },
  })
  ```

  A key appears in the type ONLY when a package actually reads it — a config
  surface advertising options nothing consumes is the typed-but-unimplemented
  class `audit-types` gates against. `atlas` is wired; others land as they are.
  Per-tool files (`atlas.config.ts`) keep working and win where both exist, so a
  half-finished migration never has the general file silently override the
  specific one.

  **Render extensions.** A single `wrapper` could hold one provider — a second
  silently won, so two packages could not both contribute and no package could
  ship its own setup at all. `extensions: [{ name, wrap?, setup? }]` composes:
  `wrap` layers around every scenario (first listed outermost, the order the JSX
  would be written by hand), `setup` runs once at boot for document-level work a
  wrapper cannot reach — a font link, a global stylesheet. Each setup is isolated
  and reported by name on failure, rather than taking the workbench down before
  first paint. `wrapper` still works, composing as the innermost layer.

  **`atlas init`** reads the workspace's own `workspaces` / `pnpm-workspace.yaml`
  declaration, probes each package for components, and writes the config —
  refusing to overwrite an existing one without `--force`, because that file is
  hand-edited the moment it exists. It writes no story files and has no flag to:
  components, controls and scenarios are DERIVED from source.

  **Zero-config monorepos.** When nothing is configured AND the default root has
  no components — today a dead end that prints "no components found" — the
  workspace's packages are detected automatically, and the scan says so rather
  than producing a catalog from nowhere.

  **`atlas check` — the catalog as a guardrail.** Atlas already knew `state`
  accepts exactly three values; that knowledge could only be READ, and reading is
  not checking. The most common failure when an AI writes UI code is a plausible
  prop value that does not exist — `state="primry"` typechecks in a JS file,
  renders without throwing, and silently does nothing. `atlas check Button
'{"state":"primry"}'` catches it and suggests `primary`, plus unknown props,
  wrong types (including a non-function event handler) and missing required props.
  Exits non-zero, so it works in a hook or a CI step. Reads the catalog rather
  than rescanning, so it cannot disagree with the guide an agent was just handed.

  **The props table now documents the CONTRACT, not just the shape.** It showed
  NAME / TYPE / DEFAULT — so an enum read as the word `enum` and you had to open
  the control dropdown to learn what it accepts, and nothing said which props were
  required. Those are the two facts that decide whether a usage is correct, and
  exactly what `atlas check` validates against. Allowed values now render in place
  of the type (`solid | outline`), required props are marked, and a missing
  default renders as `—` rather than the literal text `undefined`.

  **Discovery is no longer silent.** A component the scanner does not recognise
  was pure absence — the catalog quietly one smaller, with nothing distinguishing
  "you have 12 components" from "you have 14 and I found 12". `atlas scan` now
  reports files that export something PascalCase and produced no component, with
  a reason where the shape is a known gap (a class, a re-export, a `styled()`
  call, a member-call chain). Framed as a list to look at, not a failure — a
  provider or a schema belongs there too. Silent on a healthy full scan of the
  workshop example: zero false positives.

  **Skips now say why.** A bare `skip` was three situations wearing one label:
  cannot run here, needs a different command, or nothing looked. `reactivityCoverage`
  and `snapshot` carry `browser-only — run atlas verify-browser`; the static a11y
  check explains that a component with no required name-like prop has nothing it
  can check statically. "2 of 5 skipped" read as a hole in the tool when it was a
  command the user had not run.

  **Imported prop types now resolve** — the largest remaining gap between
  "works" and "usable on a real design system". `import type { ButtonProps } from
'./types'` is what most projects do, and it produced ZERO controls: the
  component was found, its whole contract was not — no knobs, no variant axes, no
  scenarios past the edge cases. Relative imports are followed to the file,
  through barrel re-exports (`export type { X } from './y'`, `export *`) and
  aliased imports. Measured on a fixture: a component went from 0 controls / 2
  edge-case scenarios to a full contract with its variant axis and 6 scenarios.

  Not a type checker, deliberately: `node_modules` is not followed, because
  resolving it needs the real module-resolution algorithm and guessing produces
  confident wrong answers — worse than the honest `unknown` it replaces. Depth-
  bounded and cycle-guarded, so a barrel cycle cannot hang a scan.

  **Detector widened**, each of these previously a silent absence:

  - `export default function Button()`, and anonymous defaults (named after the file)
  - `const Button: ComponentFn<Props> = …` and `nativeCompat(…)` wrappers, plus
    parenthesised and cast forms
  - `.jsx` and `.ts` files — a rocketstyle component is a call chain with no JSX
    in it, so it legitimately lives in a `.ts` file the scanner never opened

  Caught while widening: the first cut unwrapped ANY call expression, which
  matched rocketstyle chains (`chipBase.theme((t) => …)`) and read the theme
  callback as the component's props — cataloguing fabricated props AND suppressing
  the rocketstyle pass that would have found the real axes. Measured on the
  workshop example: 43 scenarios silently became 29. Unwrapping is now restricted
  to bare-identifier callees, and the regression is locked by a test.

  Also fixed: `lazy(() => import('./Heavy'))` catalogued the lazy BOUNDARY as a
  propless component — a zero-parameter function is a component at the top level
  but a thunk when it is an argument.

  Also fixed: the workspace probe counted FILES, so once `.ts` joined the scanned
  extensions a package of `math.ts` utilities read as "has components" and earned
  an empty sidebar group. It parses now.

- Monorepo support — one site from several packages, and the silent collapse that blocked it. (4e1b580)

  ```ts
  export default {
    title: 'Acme Design System',
    projects: [
      { name: 'Core', dir: 'packages/core/src' },
      { name: 'Admin', dir: 'packages/admin/src' },
    ],
  }
  ```

  **The bug this had to fix first.** The catalog graph keyed components by NAME
  (`byName.set(ci.name, ci)`), so a workspace where two packages each export a
  `Button` kept ONE and dropped the other — no error, no warning, nothing in the
  output to notice. The same name fed `scenarioId`, so their scenarios collided in
  `atlas-catalog.json`, in their verify verdicts, and in their snapshot filenames.
  That is the silent-drop this tool exists to prevent, committed by the tool.

  So a component now has an IDENTITY (`componentKey`) — `project/Name` in a
  monorepo, bare `Name` otherwise — carried alongside its real `name`. The two
  answer different questions: identity answers "which component is this", the name
  answers "what do I type in my import". Both `Button`s survive, with distinct
  scenario ids (`core-button--…`, `admin-button--…`) and readable catalog ids.

  Where a bare name is now ambiguous, Atlas refuses and names the candidates
  rather than picking one:

  ```
  [Pyreon] atlas: "Button" matches 2 components across projects
  (Core/Button, Admin/Button). Ask for one of those keys.
  ```

  `pages` and authored `scenarios` accept either form: `'Core/Button'` targets one
  package, a bare `'Button'` applies wherever it is unambiguous — and to both when
  it is not, which is why the key form exists.

  Single-package projects set no `project`, so every derived key, id and group is
  byte-identical to before. This is a widening, not a migration.

  **Also fixed, found while testing this:** `atlas scan --no-mount` ignored
  `atlas.config.ts` **entirely**. The config was loaded only when scenarios were
  being mounted, on the reasoning that it is "only meaningful when mounting" —
  true of `wrapper` and `theme`, false of `projects`, `title`, `pages` and
  authored `scenarios`, all of which were silently discarded. A monorepo scan
  under `--no-mount` therefore found nothing and reported it as a project with no
  components. The config is now always loaded, and a config that exists but cannot
  be used (or has a malformed export) is REPORTED — `runScan` returns
  `configError`, and `atlas scan` / `dev` / `build` print it. It was previously
  computed and thrown away at every call site.

- Same-named components in different files no longer vanish. (b4d619a)

  Found by pointing Atlas at a real 78-package monorepo instead of a fixture.
  Discovery deduped by NAME alone within a scan root, so every same-named
  component after the first was silently dropped. Measured there: **343 of 1378
  components were reaching the catalog.** A per-page `MainFilter` existed in 15
  directories and the catalog showed one; `ChartsRow` in 6; a generated icon
  package had 995 files each exporting `Glyph`, of which one survived.

  This is the exact silent-drop class `project` fixed ACROSS packages — left in
  place WITHIN one, on the reasoning that a directory cannot hold two exports with
  the same identifier. True, and irrelevant: a scan root holds many directories.

  A component's identity now falls back through directory, then filename, and only
  when a name genuinely collides:

  - `MainFilter` → `MainFilter@…/RiskFindings` vs `MainFilter@…/ThreatFindings`
  - `Glyph` → `Glyph@write` vs `Glyph@azure-virtual-networks` (995 icons share one
    `generated/` directory, so the directory cannot tell them apart and the
    filename is their real identity)

  Filename is tried SECOND because `Button/index.tsx` and `Button.tsx` are the same
  component to a reader, and leading with it would split a component from itself.
  A project with one file per name keeps byte-identical keys.

  On that repo: **343 → 1378 components, 405 → 1451 scenarios, and the unmatched
  report fell from 1112 files to 69.**

  **Prop types imported from a SIBLING workspace package now resolve.**
  `import type { Props } from '@acme/ui-core'` is the dominant shape in a
  monorepo, and those components landed in the catalog found-but-contract-less.

  `node_modules` is still not followed — that needs the real module-resolution
  algorithm and guessing produces confident wrong answers. A workspace package is
  a different question with an exact answer: the workspace declares where its
  packages are, each declares its `name`, and matching the two is a lookup. Root
  imports and subpaths both resolve, longest-package-name-first so `@a/ui-grid` is
  never matched by a lookup for `@a/ui`.

  Also fixed, both surfaced by the same run:

  - The unmatched report printed all 1112 entries. A report that long is scrolled
    past, which makes it as useless as the silence it replaced. Now grouped by
    reason with counts, largest first, each group capped — "1034× no recognised
    component declaration" is the sentence a reader needs.
  - `DATASET_FINDINGS` counted as a candidate component, because `/^[A-Z]/` matches
    a screaming constant. Keyed on the underscore now, so `UI` and `API` — legal
    component names — are still reported.

  The test asserting the old behaviour ("dedupes components by name, first sorted
  file wins") encoded the bug. Rewritten to the corrected truth, keeping the
  invariant it genuinely protected: no component emitted twice from one file.

- `atlas build` — compile the workbench into a static, deployable docs site. (4e1b580)

  `atlas dev` needs a checkout and a running Node process; a design system needs a
  URL. `atlas build` emits one as plain files for Pages / Netlify / Cloudflare /
  S3, with no server component. `--out`, `--title`, and `--base` (for a
  subdirectory deploy).

  The part that is not just `vite build`: two of the workbench's panels — the Docs
  source block and the Reactivity Lens — are answered by Node over the dev-server
  RPC channel, because they read files and run the TypeScript compiler API. A
  naive build produces a site that _looks_ complete while both sit dark forever.
  So the build precomputes those answers per component and ships them as data;
  the Lens still reports real per-expression `live` / `static` verdicts on a fully
  static page. An answer that genuinely cannot be computed bakes its REASON, so
  the panel states what is wrong instead of surfacing a network error about a
  request that was never going to work.

  Also new in `atlas.config.ts`:

  - `title` — names the site (browser tab + workbench chrome). `atlas dev` reads
    the same value, so the workbench and the deployed site cannot end up named
    differently; `--title` wins over both.
  - `pages` — per-component presentation: `title` (display label), `group`,
    `order`, `summary`. Presentation only — the component's real `name` is never
    overridden, because that is what the usage snippet writes, what the
    source/Lens lookup keys on, and what an agent imports. `order` pins within a
    group and leaves everything unordered in discovery order, so one config line
    cannot reshuffle a sidebar.

  Internal: the "which components belong in the catalog" filter now has one owner
  shared by `atlas dev` and `atlas build`, rather than one implementation per
  caller that could diverge.

  Not included: building one site from several packages in a monorepo. The catalog
  graph is keyed by component name alone, so two packages exporting a `Button`
  would silently collapse into one; that needs a keyed graph, not a config flag.

### Patch Changes

- Syntax-highlighted code in the workbench docs — the Usage snippet and the Source block render through `@pyreon/code` (read-only) instead of a plain `<pre>`. (77eaf81)

  Read-only by construction (`editable: false` removes contenteditable entirely, so it is a display surface rather than an editor whose writes are swallowed); gutters, search and minimap are off so a docs block reads as prose. It follows the workbench's own dark/light, wraps long lines, and the Source variant caps its height so a long file scrolls inside CodeMirror's own scroller. The editor is lazily imported — the canvas, the view the workbench opens on, makes zero CodeMirror requests — and falls back to the plain `<pre>` if the chunk never lands.

  Also fixes a latent hang in the `atlas` bin: it only called `process.exit` for a NON-ZERO code, so a successful command's exit depended on every embedded subsystem releasing every handle. A command that embeds a dev server closes the browser and the server, and an embedded Vite dep-optimizer can still outlive both — leaving the process idle forever with its work done and its output printed. Success now sets `process.exitCode` (so piped stdout still flushes) with an `unref`ed fallback that force-exits if something is holding the loop open.

- Make `atlas build` and `atlas dev` work in an INSTALLED consumer workspace. (ae60021)

  Both were broken there, and neither the unit suite nor the in-repo e2e could see
  it: a tool running from the same workspace as its target never meets the layout
  an install produces. Found by packing Atlas and installing it into a separate
  monorepo with the framework from npm.

  - **`atlas build` could not link.** The generated entry lives in
    `node_modules/.atlas-build/`, so the bundler resolved its imports by walking up
    to the repo root — which declares none of the framework — and the build died
    with `Rolldown failed to resolve import "@pyreon/runtime-dom"`. No project
    package declares that one; Atlas does, so Atlas's own directory is now a
    resolution base.

  - **`atlas dev` served a shell that could not render.** The virtual catalog
    module failed with `Failed to resolve import "@pyreon/core"`, so the page
    returned HTTP 200 and displayed an error — a dev server that looks up and is
    not.

  - **An isolated install (bun, pnpm) links a dependency at a content-addressed
    store**, and that package's own dependencies sit as SIBLINGS inside the store.
    Returning the link meant transitive imports failed with `Cannot find module
'@pyreon/reactivity' imported from …/@pyreon/core/lib/index.js`. Resolution now
    returns the real path.

  - **`--port 5199` was silently ignored** — only `--port=5199` was read, while
    every other flag accepts both forms. A dropped flag is worse than a rejected
    one.

  The resolver is a FALLBACK (`enforce: 'post'`), and that is the load-bearing
  detail. An earlier cut ran it first, which wins even when ordinary resolution
  would have succeeded and hands back a symlinked path while Vite reaches the
  package's real location — two ids for one file, the framework loaded twice, and
  the workbench dead with `props.model.view.set(...) is not a function`. It also
  declines for project files: a component that cannot resolve an import has a real
  dependency bug, and resolving it from elsewhere would hide it.

- Visual polish for both workbenches. (20db838)

  atlas: the dev shell now loads its webfonts (Space Grotesk / Public Sans / JetBrains Mono — previously nothing loaded a font and the whole UI fell back to the browser serif) and the theme ships real `font.sans`/`font.display` stacks applied on the Shell. Fixed the needsFix-tag layout gap where a button's children stacked vertically ignoring the theme's row/gap (the flex-fix inner span is now `display: contents`), the status bar's column-stacked texts, and the addon tab strip clipping half its tabs (wraps instead of hidden overflow).

  loom: the layered graph now scales to a full workspace — ambient edges drop to a whisper (0.1 opacity), the selected fan no longer flares over its neighborhood, node labels get a background halo (`paint-order: stroke`) so 700 edges never strike through text, long package names truncate with a native tooltip, and version sublabels render only on the selected/focused neighborhood.

- Fix four bugs that made Atlas unusable on a real monorepo, and one that broke ordinary app builds. (e252318)

  Found by running `atlas scan` against a 78-package workspace rather than a fixture.

  **`@pyreon/vite-plugin` — JSX auto-import collided with destructured bindings.**
  The shadow check required the name immediately after the keyword, so
  `const { Form, Text } = createForm(schema)` was invisible to it and the pass
  injected `import { Text } from '@pyreon/primitives'` on top of it. The build
  died with `Identifier 'Text' has already been declared`, pointing at a line the
  author never wrote. A form factory returning named components is an entirely
  ordinary shape; this broke any app using one, independently of Atlas.

  **`@pyreon/atlas` — a root `atlas.config.ts` could not import anything.**
  A package manager links a dependency only into packages that declare it, and the
  repo root declares almost none — so the file that supplies `theme` (which makes
  rocketstyle chains discoverable) and `wrapper` (which lets theme-reading
  components mount) could import neither the project's own packages nor
  `@pyreon/core`. Config imports now resolve against the workspace: by name for a
  workspace package, and otherwise as a package that declares the dependency
  would. Components are deliberately excluded from the second tier — one that
  cannot resolve an import has a real dependency bug worth surfacing.

  **`@pyreon/atlas` — `entryFromExports` answered a loading question with a types
  answer.** Reading `types` first is right for prop-type resolution and wrong for
  loading, where it lands on `index.d.ts` and fails as if the file were missing.
  Callers now say which they want.

  **`@pyreon/atlas` — a flag's value was taken as the directory to scan.**
  `atlas build --out dist/atlas` scanned `dist/atlas`, then reported
  `no components found under dist/atlas/src`. All five commands shared the line.

  **`@pyreon/atlas` — "no atlas.config.ts" was printed when there was one.**
  Both a config that failed to load and one that simply sets no `projects` got the
  message, the first contradicting the error printed directly above it.

  Measured on that workspace, with a `theme` and `wrapper` configured: 1378 → 1419
  components, 1451 → 3356 scenarios, 1055 → 3127 verified.

- Report files the rocketstyle pass could not LOAD, instead of counting them as empty. (d6e475e)

  `discoverRocketstyle` caught every load failure and `continue`d, on the reasoning
  that "a module that will not load has nothing to introspect". But a file that
  throws and a file with no rocketstyle in it produce the same zero, and only one
  of them is a finding — so a broken import upstream made a whole package look
  like it simply had no components.

  Measured on `@pyreon/ui-components`: one unresolvable `exports` entry made all 77
  files throw on import, and the scan reported **7 components** for a 108-component
  package with no error anywhere. With the load errors surfaced, the same broken
  state now says `77 file(s) could not be LOADED` and names the cause; with the
  underlying `exports` fixed it reports 108 components, 1090 scenarios, 67 carrying
  real variant axes.

  Load errors are printed BEFORE the unmatched list and grouped by message — one
  broken import throws the identical error in every file that reaches it, so the
  distinct causes are the finding and the file count is the severity. They are
  reported separately from `unmatched` because the fix is different: an unmatched
  file needs a `theme` in the config, a file that threw needs its import fixed, and
  telling the second to try the first sends the reader after the wrong thing.

- `atlas scan` ~20x faster — the leak check was paying a full GC per scenario (9806e6c)

  A scan of a variant-heavy design system (108 components, 1090 scenarios) took
  41s, and 98.3% of it was one plugin hook. Two hypotheses about which part died
  to measurement first — the static scan is 35ms, and the settle loop exits
  immediately rather than burning its runway — so the attribution now comes off a
  profiling seam (`ATLAS_PROFILE=1`) rather than from reading the code. What it
  found: 2767 `Bun.gc(true)` calls at ~20ms each.

  A forced collection is now charged for a GROUP OF COMPONENTS, not for each
  scenario. One sweep answers the question for all of them, because a reactive
  graph that returns to its baseline after every scenario in the group has been
  mounted and disposed proves that none of them retained a node. Components are
  grouped until a group holds ~256 scenarios: **2767 collections become 8**, and a
  108-component / 1090-scenario scan goes from ~41s to ~2s. `atlas build` benefits
  identically.

  The collection count is the honest headline, because it does not move with the
  machine. The wall-clock ratio does, a lot, and always in the flattering
  direction: the old path is GC-dominated and therefore far more sensitive to load
  than the new one, so interleaved runs measured anywhere from 20x to 51x
  depending on what else the box was doing. ~20x is the conservative end and the
  number worth quoting.

  The bound costs nothing measurable — grouped and ungrouped medians are within
  noise of each other — and buys two things: peak memory that stays knowable at
  monorepo scale rather than extrapolated from a smaller one, and a blast radius
  of one group when something does leak, instead of the whole catalog.

  Nothing is guessed when a catalog is not clean. It is re-probed once — exercise
  everything again and require the count to keep CLIMBING, which separates
  one-time retention (a module-level store registry, a memoized theme) from a
  per-mount leak — then falls back to per-component and finally to per-scenario
  resolution, so a real leak is still attributed to the scenario that causes it.

  This also removes a pre-existing flaky FALSE POSITIVE. Requiring accumulation
  across two full catalog passes is a much stronger filter than across two mounts
  of one scenario, so a one-node engine straggler no longer reads as a leak:
  `stack--indent-large-gap-xxlarge-gapy-medium` failed 1 run in 5 before and is
  stable across 6 runs now.

  `VerifyContext` gains an optional `components` field — every decorated component
  in the run — so a plugin whose check has a large FIXED cost can pay it once for
  the catalog instead of once per component. `createAtlas` now decorates
  everything before verifying anything, which is what makes that set available.

  Identical output otherwise: same components, same scenarios, same interaction
  verdicts, same a11y verdicts, byte-identical agent guide. Bisect-verified at
  every decision point that gates leak detection — each one, disabled, makes the
  real end-to-end leak test fail.

  Alternatives measured and NOT taken, recorded in the source so they are not
  re-tried: a nursery GC (`Bun.gc(false)`) is 10x worse, because it does not run
  the FinalizationRegistry callbacks the registry drops nodes through; loading
  discovery's modules concurrently is slower, because Vite's `ssrLoadModule`
  serializes on the shared module graph; and extra yields after a sweep do not
  replace the second sweep.

  Adds `ATLAS_PROFILE=1`, which reports scan cost per plugin hook.

- Fix two defects that made `atlas build` unusable against any real package, and publish the workbench at pyreon.dev/atlas. (7f8d3bd)

  `atlas build` shipped in 0.50.0 but only worked against a project that happened to declare `@pyreon/atlas` as its own dependency — in this repo, exactly one example. Two bugs, both found by pointing it at a real 108-component library:

  - **`@pyreon/atlas` itself was unresolvable.** The generated entry lives in `<project>/node_modules/.atlas-build/` and imports `@pyreon/atlas/ui`. Resolution walks up looking for `node_modules/@pyreon/atlas`, and a package manager never links a package inside its own `node_modules` — so every framework package resolved and the workbench did not (`Rolldown failed to resolve import "@pyreon/atlas/ui"`). A component library never declares the workbench; you point the tool at it. Now resolved through the workspace's own package map, and only ever for Atlas's generated modules.
  - **A subpath resolved to a directory instead of a file.** `resolveWorkspaceSpecifier` probed the bare extension first and used an existence check, so a barrel `src/ui.ts` next to its `src/ui/` folder matched the folder (`UNLOADABLE_DEPENDENCY: Could not load .../src/ui`). `@pyreon/atlas/ui` is exactly that shape.

  Both are bisect-verified. Verified end to end against `@pyreon/ui-components`: 108 components build and render in real Chromium with zero console errors, and the baked RPC is real — 108/108 source entries, 108/108 Lens verdicts, 9 carrying findings, 0 bake failures.

  Also gives the built site real URLs. `atlas build` now emits a directory per component, so `/atlas/button/` is a page a plain file server answers at — pasteable into a chat, bookmarkable, linkable from a design doc — instead of `/atlas/?c=button`. The workbench reads its own path (base-agnostic: it matches the last segment against the catalog, so it works under any `--base`) and writes the path back on navigation, with the component removed from the query so the two can never disagree.

  Opt-in via a global the host sets, because writing a path is only safe where a page answers at it: `atlas build` sets it, `atlas dev` sets it (its middleware already serves the shell for any extensionless GET), and a workbench EMBEDDED in someone else's app sets nothing and keeps the query string — writing `/button/` there would 404 on reload. Skipped for a relative `--base`, which would resolve assets against the wrong directory, and it says so rather than emitting pages that cannot load their own JavaScript.

  Honest limit: these are real URLs, not prerendered pages. The HTML body is empty until JavaScript runs, so a crawler sees the title and nothing else — rendering the component into the HTML needs SSR, which is a different change.

- The workbench UI restructured for readability — zero behavior change: (1cbf4c7)
  one styled component per file under `components/<region>/`, views in
  region folders with the four built-in panels split out of the former
  `builtin-panels.tsx`, and a real token system (`ThemeScale`: font
  families, a named size scale, tracking, radii, motion, the hairline
  border) extracted from the exact values the chrome already used.
- Atlas reads the ecosystem-wide `pyreon.config.*` through `@pyreon/config`'s (1005cfc)
  `CONFIG_FILENAMES` and `sectionFrom` instead of its own copies of both.

  No behaviour change — the filename list and the named-vs-default section
  lookup were byte-identical, and all 13 loader specs pass unchanged. What
  changes is that there is now one definition rather than two. A second copy of
  "which filenames, and how to pull a tool's section out" drifts the day one
  list gains an entry the other does not, and the failure mode is a config file
  that is silently ignored — precisely what the shared file exists to prevent.

  `@pyreon/config` also gains its first consumer. It shipped exporting helpers
  nothing imported, which is the typed-but-unimplemented shape its own doc
  comment warns against.

- Element's typed `gap` prop now works on SIMPLE elements and the button/fieldset/legend flex-fix layer — it renders modern CSS `gap` on the flex container (previously it was wired only into the before/after slot margins, a typed-but-partial contract that pushed consumers into theme-level flex overrides). The compound path keeps its slot-margin machinery and never receives wrapper gap, so the two mechanisms cannot double up. (cd442ea)

  On the strength of that, both workbench UIs (atlas + loom) are now fully props-first: layout is expressed exclusively through Element's own props (`contentDirection`/`contentAlignX`/`contentAlignY`/`gap`/`block`) with `.theme()` reserved for visual CSS — no flex overrides anywhere, matching the documented ui-components architecture. The only theme-level layout left is the documented special-case trio: `flexWrap` (no Element prop), CSS grid components, and `display: block` for text truncation. The Element manifest's api notes + mistakes now teach the full contract (simple-path `content*` props, axis-fixed alignment, `block` for app roots, the gap history).

- `@pyreon/atlas` now declares the two optional runtime peers it already imports: `@pyreon/vite-plugin` and `happy-dom`. (ea58e22)

  Both were devDependencies only, and both are loaded with a dynamic `import()` behind a graceful fallback — which is exactly what an optional peer is. `vite` and `playwright-core` were already declared that way; `@pyreon/vite-plugin` is imported in the _same_ `try` block as `vite`, so a consumer who installed vite because the peer list asked them to still silently fell back to the runtime loader instead of the real compiler chain. `happy-dom`'s own failure message literally reads "install `happy-dom`", for a package nothing ever told the consumer to install. The declaration now matches the behaviour, so package managers surface it at install time.

  The `loom scan` gate over this repo runs `--strict`, so a NEW dependency-fabric warning is red rather than scrollback. The repo's 18 warnings are at zero: the real ones fixed, and three verified false positives suppressed in the root `loom` config, each with a written `reason` (loom requires one). A backlog that reaches zero and is not gated refills — the same argument behind the lint ratchet.

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

- Fulltext ⌘K search in both workbenches, with match-reason chips. (e2aec5b)

  atlas: the search index now covers keywords, not just names — control keys, enum OPTIONS (the state/variant axes: searching `soft` surfaces every component with a `variant: soft`), scenario names, group paths, and descriptions. Multi-token queries AND across fields; keyword hits carry the matched field as a chip (`variant · soft`, `scenario · Long content`) so a row explains why it surfaced.

  loom: the ⌘K dialog arrives (same docs-site shape as atlas — the header keeps the trigger; the query still drives the sidebar filter), fulltext over the fabric: package ids, versions, kind, license, FINDINGS (searching `unused-dep` lists every flagged package with a `finding · unused-dep` chip), and the dependency edges in both directions (`depends on · X` / `needed by · X`).

- Styling discipline pass over both workbench UIs: no inline styles and no attrs `css` strings — every layout now lives in rocketstyle `.theme()` structured keys (the raw-string idiom was the root of the whole column-stacking bug family), loom's matrix view renders through real styled components instead of ~15 inline-styled divs, and all spacing/radii snap to a 4/8px grid (radius scale: chip 4 · control 8 · card 12 · pill 20). Even the graph's SVG styling is class-based now (static font/cursor/animation rules live in injected global classes — SVG can't be a rocketstyle component); the only remaining inline values are theme-token paints as SVG attributes and truly data-driven geometry (per-node opacity, the measured min-width), documented at their sites. Device viewport presets (375/768) are deliberately exempt from the grid — they are real device widths. (cd442ea)
- atlas: the workbench owns its page now (global reset — the browser's default body margin framed the shell with a white gap); brand themes + appearance moved out of the top bar into a profile menu on the avatar (click-away + Escape to close); search became a docs-site-style ⌘K dialog (dim blurred backdrop, keyboard-driven results with ↑↓/Enter, the top bar keeps only the trigger); and the side panels are drag-resizable (pointer-captured handles, clamped 200–420 / 280–560) and collapsible (bar toggles + double-click on a handle), widths as live drag geometry. (7a47093)

  loom: the view-bar title block breathes (real gap between title and eyebrow, roomier padding) and detector findings render severity-TRUE — an INFO finding no longer borrows the danger card's red (info → neutral surface, warning → warn tint, error → danger tint).

- Updated dependencies:
  - @pyreon/config@0.51.0
  - @pyreon/vite-plugin@0.51.0
  - @pyreon/ui-core@0.51.0
  - @pyreon/rocketstyle@0.51.0
  - @pyreon/runtime-dom@0.51.0
  - @pyreon/reactivity@0.51.0
  - @pyreon/code@0.51.0
  - @pyreon/hooks@0.51.0
  - @pyreon/elements@0.51.0
  - @pyreon/feature@0.51.0
  - @pyreon/compiler@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/permissions@0.51.0
  - @pyreon/styler@0.51.0
  - @pyreon/unistyle@0.51.0
