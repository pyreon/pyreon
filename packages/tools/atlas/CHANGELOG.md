# @pyreon/atlas

## 0.52.0

### Minor Changes

- Add `bundleCostPlugin` — what importing each component costs a consumer, minified + gzipped. (879ff89)

  **Opt-in, not in the recommended bundle.** Each measurement is a real bundler run: on a 108-component library that is 108 builds against a scan that is otherwise ~2s. A metric that multiplies scan time by an order of magnitude has to be asked for, not inflicted — and it reports a number rather than a bug, so paying for it on runs nobody reads buys nothing.

  **What the number means.** Workspace packages and bare dependencies are external, exactly as the repo-wide budget gate measures them, so this is "the bytes this component's own source contributes" — not the page weight of rendering it. A component rendering through half of `@pyreon/elements` measures small, because that cost belongs to elements and is counted there. Charging every component for the same shared runtime would make the numbers useless for the only thing they are good for: comparing components against each other.

  **A `decorate` hook, not a `verify` check.** There is no threshold at which a component's size is WRONG, so making it a check would force a pass/fail on a measurement and the only honest verdict would be a permanent `pass` — the false-green shape the verdict model exists to avoid.

  **Needs Bun.** `Bun.build` is the only bundler it uses, so `bun atlas scan` measures and `npx atlas scan` (node) does not. Rather than fail quietly it SAYS so, once per run, through `onUnavailable` — an opt-in capability that silently produces nothing is the same false-quiet as a gate that scans zero files and reports a clean pass. Adding esbuild as a dependency would fix it at the cost of real install weight on every Atlas user for a metric most never read; reusing the project's own Vite (already an optional peer, already loaded by the module loader) is the better door and belongs in its own change.

  Unmeasurable is ABSENT, never `0` — a zero would read as "free", the most misleading number available.

- **Verify findings are structured — catalog `version: 2`.** (ebeb330)

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

- Surface reactive-graph health in the Reactivity panel — orphan signals, accidental fan-out, deep derived chains. (d569b80)

  `describeReactiveGraph` already derives three behavioural smells from the live graph; nothing showed them. The panel now does, most-actionable first, with each row saying what the smell COSTS rather than what it is ("one write drives many subscribers — the accidental-repaint shape", not "high-fanout: many subscribers").

  Orphan signals sort first because they are the only kind that is usually a BUG rather than a cost: from the graph, state nothing reads is indistinguishable from a read that was SEVERED, and the severed case is the "UI silently never updates" class.

  **Scoped to the component, which is the whole correctness of it.** The workbench and the preview share one reactivity instance — that is why this can be a client-side panel at all — so an unscoped read describes Atlas's own chrome (sidebar signals, theme, search box) as the component's smells. That would be worse than showing nothing: confidently wrong, about someone else's code, with no way for the reader to tell. A baseline is taken before the component mounts and only later nodes count; edges need both ends in scope. Bisect-verified — unscoped, the fixture's "chrome" orphan is reported as the component's.

  Shown whenever a graph exists rather than gated on pressing Record: a smell is a property of the graph, not of a session, so requiring a recording to see an orphan would hide the one finding that is usually real.

  **Deliberately rows, not a diagram.** #2517 §3 asked for the graph drawn via `@pyreon/flow`. The diagnostic value is the insights; a diagram of a healthy graph is a picture of nothing wrong at several times the cost, and on a real component the node count makes it unreadable exactly when it matters. The diagram stays a separate question rather than a hidden prerequisite.

- **Atlas honours the target project's `resolve.alias`, and one broken component no longer takes down the workbench** (#2744). (1676b6a)

  Atlas creates its Vite contexts with `configFile: false` — deliberately, since the project's config carries plugins Atlas must not double-apply (it already runs the real `@pyreon/vite-plugin`). But that also discarded `resolve.alias`, so an app whose components import through its own `~/components/…` alias failed to load every one of them.

  `resolve.alias` is now extracted from the project's vite config and applied to all three Vite contexts — the dev server, the static build, and **the scan's module loader**. The scan matters as much as the workbench: without it, an aliased component is silently absent from the catalog rather than visibly broken.

  Only `resolve.alias` is taken — never plugins, and deliberately not `resolve.conditions` (Atlas resolves workspace packages through the `bun` condition on purpose, and inheriting the app's would break every `@pyreon/*` import). A config that cannot be loaded warns and degrades to no aliases rather than refusing to start.

  `atlas.config.ts` gains an `alias` key as the explicit escape hatch. Entries declared there win — Vite matches in order and these are placed first.

  **Separately: a component that fails to load is now one broken card, not a dead workbench.** The generated catalog module used static `import * as __modN from '…'` per component; a static import cannot be caught, so a single unresolvable import failed the whole module and nothing rendered. Each component is now imported individually through a caught dynamic import, and the render path's existing error-card branch — previously unreachable for this failure — surfaces the module's own message (`Cannot find module '~/shared/tokens'`) instead of a generic "could not load".

- **`--check` — the ratchet. `atlas scan` and `atlas verify` can now answer "did I help?", not just "how is it now?".** (ebeb330)

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

- Add `routerPlugin` — route state as a scenario axis for components that ask the router questions. (efa2fac)

  **Sized honestly.** A component calling `useRouter()`/`useParams()` does not crash in the workbench today: Atlas already detects a missing provider and reports that the fix is an `atlas.config.ts` wrapper. So this removes hand-written boilerplate, and adds the thing a wrapper cannot give you — `/users/1` and `/users/999` as SEPARATE verified scenarios, each with its own verdict, snapshot and URL.

  The URL is carried as scenario METADATA, not as an arg. In `args` it would render as a control the component does not have and let a user "edit" something with no effect.

  `installRouter` builds the router from the module the loader resolved, never Atlas's own copy — `useRouter()` resolves against module-level state inside a particular copy of `@pyreon/router`, so a router made from the wrong one is invisible to the component and reports "no router" while one demonstrably exists. It clears the active router on dispose, because that state outlives the scan and would otherwise answer for whatever runs next, including a check meant to observe a component WITHOUT one.

  With no URLs configured the plugin is the identity function, so it costs nothing until it is given something to vary.

- Add the SSR-parity verify check — does each scenario survive `renderToString` + hydrate? (073b3ae)

  A hydration mismatch is the framework's own first-class bug class: the SSR↔hydration differential fuzz found six shipped instances, every one a cursor misalignment where the server's HTML and the client's expectation disagreed about how many DOM nodes a construct occupies. None of Atlas's other checks could see it — `interaction` mounts on the client and never renders on a server, and `snapshot` photographs one render, so a build that is consistently wrong photographs consistently. Every scenario a catalog already has now becomes a parity test at zero authoring cost.

  **Two oracles, because one is not enough.** The runtime's own mismatch channel must report nothing, AND the hydrated DOM must equal a fresh client mount. The second exists because the first can agree on broken — an SSR pass and a hydrate pass reaching the same wrong DOM produce zero mismatches, and only an independently-built third instance reveals it.

  `VerifyVerdict` gains a sixth check, `ssrParity`. Consumers reading the catalog's verdict shape see one more field; `verify-browser` carries the node-side verdict through rather than recomputing it.

  **Honest limits, stated in the source rather than discovered later.** The check is BLIND to `typeof window` branching: both renders happen in one process with DOM globals installed so components can mount at all, so the "server" pass sees a browser too and the two sides agree. What it does catch is non-deterministic renders (`Math.random()`, `Date.now()`, per-render ids), components that throw only under `renderToString`, and the framework's own cursor-misalignment class. It skips with a reason when `@pyreon/runtime-server` is not installed, since a component library with no SSR story is a legitimate project.

  Verified end to end, not just unit-tested: against the 43-scenario workshop catalog it reports 43 passes, and perturbing a real component to render non-deterministically moves the scan to 39 verified / 4 failing with a source-anchored finding (`text at root > button > reactive: expected 12, DOM had 11`).

- **Store panel — the writes an interaction made, steppable** (Atlas roadmap §9, the last open item on #2517). (1676b6a)

  `@pyreon/store` publishes a mutation stream: every write announces its store, whether it was a `patch` or a direct set, and the per-key old/new values. Storybook has no equivalent, because React state changes are private to the component that owns them — there is nothing to subscribe to.

  Press Record, interact with the preview, then step back through the writes. Stepping back shows the store **as it was**, not a recomputation. The panel also flags keys written more than once in a single interaction — a loop or a chain of dependent writes, worth seeing and not automatically wrong.

  Recording is explicit rather than always-on, matching the Perf panel: `addStorePlugin` attaches to every store created afterwards, so a session-long subscription would pay for every write whether anyone is looking or not.

  `@pyreon/store` is an **optional** peer — a project that uses no stores sees a panel that says so, not an error.

- **`atlas verify <Component>` — the write → verify → fix loop, and a scan that says WHICH check failed.** (019d5d1)

  A scan reported `41 verified, 2 failing`. That counts _scenarios_, and it withholds the finding: six checks run per scenario, and the one that failed is the whole content of the message. Answering "which check?" meant opening `atlas-catalog.json` and walking it by hand.

  - **Every run now prints a per-check tally** — `checks: a11y 18/20 ✗ · interaction 43/43 · ssrParity 43/43 · leak 43/43` — plus `not run:` lines naming the checks that were unavailable and why. This is not cosmetic: on a package where `@pyreon/runtime-server` does not resolve, the scan reports **1090 of 1090 scenarios verified** having run two of the six checks. True, and completely misleading without the tally.
  - **A failing scan now prints the failing CHECK and its findings**, not a bare list of scenario ids. Capped at 20 rows on a whole-catalog scan, and the cap reports itself.
  - **New `atlas verify [Component] [--cwd <dir>] [--json]`.** Discovery still walks the project — a component's file is not known until it does — but decoration and verification run only for the match. Measured on `@pyreon/ui-components` (108 components, 1090 scenarios): 1.35s full scan against 0.90s scoped to one component's 60 scenarios; the verify work drops ~18× while discovery dominates the residual, so it is a focus tool first and a speed tool second. Failing scenarios print uncapped. `--json` emits the report as data for an agent to branch on.

  Three refusals in `atlas verify` are deliberate. It **never writes `atlas-catalog.json`** — a one-component catalog would replace the real one and silently break the agent guide, the MCP tools and `atlas check` for everything else. An **unmatched name exits non-zero** with suggestions, because filtering to nothing otherwise reports "0 scenarios, 0 failing", which reads as a pass. And a run where **nothing could be verified exits non-zero** too: zero failures is not a pass when zero checks ran.

  **Load errors are classified instead of blanket-blamed.** `virtual:zero/routes` is a module a build plugin synthesises; the import is correct and unresolvable only because Atlas does not run that plugin. Every scan of every zero app printed "fix the import and re-run" for it. Those are now reported separately, as "nothing to fix" — while still stating that a component defined in such a file would be absent, which is the half that remains true. A genuinely broken import keeps the loud, actionable message.

  **Fixes a pre-existing arg-parsing bug**: `--cwd` was missing from the value-flag set, so any command reading a positional alongside it took the _path_ as that positional. `atlas check Button --cwd ./ui` parsed `./ui` as the component's args JSON and reported "could not parse the args" for a command line that is entirely correct.

  `CHECK_KEYS` and `CheckKey` are now exported from the plugin registry as the single owner of the check list, so a seventh check cannot be merged into verdicts while going uncounted in the report.

  `pyreon atlas --help` lists the new `verify` subcommand (`@pyreon/cli` passes every argument through, so the command itself already worked — the help text was the gap).

- Make the Atlas story actually automated: previews, scenarios and a wrapper, all (69c191f)
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

- Diagnosability round from an upstream report. `atlas scan`'s dual-instance refusal now prints the TWO resolved framework copies (path + version, extracted from the caught sentinel error's own `A:`/`B:` lines) — the summary alone said "align the versions" while withholding where the second copy lives, sending the reader into node_modules archaeology for a fact the error already carried. A message shape with no `A:`/`B:` lines degrades to the summary standing alone. Plus: `@pyreon/validate` and `@pyreon/validation` READMEs each open with an explicit not-to-be-confused cross-reference (near-identical names, different jobs — validator-you-use vs stack-wide contract/adapters — a documented conflation trap). (443a646)
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
- Two new lint rules for validated upstream-shipped bug shapes (97 → 99 rules): (47ef812)

  - `pyreon/no-signal-read-in-attrs-callback` (styling, warn, dep-gated on `@pyreon/rocketstyle`): rocketstyle `.attrs()` callbacks run ONCE at setup, so a zero-arg call of a same-file signal/computed binding inside the callback captures a dead value that never updates (the ui-collapse-that-never-collapsed shape). Silent on `props.*`/`theme.*` reads, calls with args, the `.attrs({...})` object form, and handlers defined inside the callback; silent entirely in projects without `@pyreon/rocketstyle`.

  - `pyreon/no-guard-only-signal-reads-in-effect` (reactivity, info): flags an `effect()` whose EVERY reactive read (tracked signal call or `props.X` read) sits behind a conditional whose own test is provably non-reactive (`if (ref.current) { chart.setOption(props.option) }`, incl. the early-return spelling) — the first run can short-circuit before any read, so the effect subscribes to nothing and never re-runs. Zero-FP construction: any unconditional proven OR possible read (an unclassifiable zero-arg call like `chart.instance()`), a reactive guard test, both-branch reads, loop-body reads, nested-callback reads, and switch/catch shapes all suppress the report.

  `@pyreon/atlas`: the workbench preview's `dir`-applying effect now reads the `dir()` signal before the element guard — the previous shape subscribed only when the guard was truthy on the first run (it was in practice, since the effect is created after the element is captured, but the shape was fragile and is exactly what the new rule flags).

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

- Eight README examples are now typechecked in CI. (e0e0dc0)

  `check-doc-examples` only ever looked at `docs/src/content/docs/**`; package READMEs carry ~550 `ts`/`tsx` blocks and nothing verified any of them. The gate now walks package READMEs too, and each of these packages has one verified-clean example opted in with the `// @check` marker.

  Each was compiled before being marked, not marked and then debugged. No content changed — the marker is a comment inside the fence.

- Hydration now ADOPTS a reactive accessor's server-rendered subtree instead of rebuilding it, and `@pyreon/zero` resolves the matched route before hydrating so its pages actually hydrate in place. (7ead5f8)

  A function child's SSR output is bracketed by `<!--$-->…<!--/$-->`. Previously the general case (anything but a single text node) always deleted that range and re-mounted. `RouterView` renders its route through exactly such an accessor, so a zero app discarded its entire server-rendered page on every load — measured on the docs production build, 10 of 11,514 `<body>` nodes survived hydration (0.1%). Typed input, focus, scroll position and any listener attached by non-Pyreon code were destroyed on every page load, and the client rebuilt DOM the server had already produced.

  `hydrateReactiveChild` now hydrates the accessor's first render against that range, bounded by the end marker the same way the async-component path bounds its own. Anything the walk does not consume is swept, so a genuine divergence degrades to the previous behaviour rather than orphaning nodes.

  The SAME adoption applies to `hydrateSoleAccessorChild`, and for zero that is the load-bearing one. #2935 elides the range markers when an accessor is an element's ONLY child (the tag boundary is the extent), and `RouterView` returns `h('div', …, child)` — so zero's route takes that path. Adopting in only the marked path leaves zero at 0.1%; measured, not inferred.

  That alone does not help a `lazy()` host: at hydration time the route component is not yet loaded, so the accessor's first render is the loading fallback (`null` for a route without a `loadingComponent`), which matches nothing. `startClient` therefore calls `router.preload(path, { skipLoaders: true })` before `hydrateRoot`, making the first render the real component. Loader data is unaffected — it was already seeded from `__PYREON_LOADER_DATA__`. The route chunks are `modulepreload`ed by the SSG/SSR build, so this normally resolves from cache, and the server's DOM stays visible while it does.

  Measured on the docs production build at this branch's tip, `/docs/router`: `<body>` retention 10/11,514 (0.1%) → 558/11,514 (4.8%). (An earlier cut of this branch measured 10.9%; the figure was re-measured after the later correctness commits and this is the honest current number.) The residual is NOT verifier strictness — instrumenting every adoption bail site shows zero shape/DOM-gate failures on this page. It is arming-protocol timing: compiled `_tpl` calls evaluated as h() arguments run before any DOM cursor exists, so they clone eagerly and the whole subtree below them is swapped instead of adopted. That is a separate lever — deferred `_tpl` arming — which this change makes reachable for the first time in a zero app.

  Also fixes a latent cleanup bug this exposed: `bindPolymorphicText` disposes its binding without removing the bound text node, so a NESTED accessor's adopted text survived its parent's re-emission. Invisible while every accessor re-mounted over a full range swap; caught by the SSR↔hydration parity fuzzer's post-flip oracle.

  `@pyreon/atlas`'s SSR-parity oracle now normalizes the `<input value>` attribute, which a server can only express as an ATTRIBUTE while the client sets it as a PROPERTY. A hydrated tree shows the server's attribute and a client-mounted tree shows nothing, while the live property — what the user sees, edits and submits — is identical. That check previously passed only BECAUSE hydration rebuilt every subtree, making "hydrated" and "client mount" the same code path; adoption surfaced the difference rather than causing it. Everything else the oracle compares is untouched. Scoped to `value` alone — the narrower the exemption the smaller the hole — and it should be deleted outright once #2953 establishes `defaultValue` on a client mount, fixing the divergence at the source.

- Updated dependencies:
  - @pyreon/compiler@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/hooks@0.52.0
  - @pyreon/code@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/unistyle@0.52.0
  - @pyreon/runtime-dom@0.52.0
  - @pyreon/feature@0.52.0
  - @pyreon/permissions@0.52.0
  - @pyreon/store@0.52.0
  - @pyreon/vite-plugin@0.52.0
  - @pyreon/elements@0.52.0
  - @pyreon/config@0.52.0
  - @pyreon/rocketstyle@0.52.0
  - @pyreon/ui-core@0.52.0
  - @pyreon/styler@0.52.0

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
  import { defineConfig } from "@pyreon/config";

  export default defineConfig({
    atlas: { title: "Acme Design System" },
  });
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
    title: "Acme Design System",
    projects: [
      { name: "Core", dir: "packages/core/src" },
      { name: "Admin", dir: "packages/admin/src" },
    ],
  };
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
