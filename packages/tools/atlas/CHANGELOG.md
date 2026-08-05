# @pyreon/atlas

## 0.51.0

### Minor Changes

- [#2607](https://github.com/pyreon/pyreon/pull/2607) [`e6ff11f`](https://github.com/pyreon/pyreon/commit/e6ff11f6a539b60c5d6ddc634ff4940feedca8f8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/atlas` is now published: the AI-native component workbench. Derives a
  verified, machine-readable component catalog from your source (`atlas scan`),
  serves a zero-config workbench (`atlas dev`), and runs the browser half of
  verification — real reactive-coverage measurement plus visual snapshots — with
  `atlas verify-browser`.

- [#2648](https://github.com/pyreon/pyreon/pull/2648) [`f7835ed`](https://github.com/pyreon/pyreon/commit/f7835ed8e3027165c7a8eda93d624fc8ac0526ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon.config.ts`, `atlas init`, and a detector that finds the components people actually write.

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

- [#2646](https://github.com/pyreon/pyreon/pull/2646) [`4e1b580`](https://github.com/pyreon/pyreon/commit/4e1b58019c34d8feeca5db085ec4a93356abd3ac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Monorepo support — one site from several packages, and the silent collapse that blocked it.

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

- [#2654](https://github.com/pyreon/pyreon/pull/2654) [`b4d619a`](https://github.com/pyreon/pyreon/commit/b4d619ac1e67b6fbc354a10ee5620683133b7f05) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Same-named components in different files no longer vanish.

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

- [#2646](https://github.com/pyreon/pyreon/pull/2646) [`4e1b580`](https://github.com/pyreon/pyreon/commit/4e1b58019c34d8feeca5db085ec4a93356abd3ac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas build` — compile the workbench into a static, deployable docs site.

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

- [#2623](https://github.com/pyreon/pyreon/pull/2623) [`77eaf81`](https://github.com/pyreon/pyreon/commit/77eaf81469ad4a00ae55fcb328e83d67b508d157) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Syntax-highlighted code in the workbench docs — the Usage snippet and the Source block render through `@pyreon/code` (read-only) instead of a plain `<pre>`.

  Read-only by construction (`editable: false` removes contenteditable entirely, so it is a display surface rather than an editor whose writes are swallowed); gutters, search and minimap are off so a docs block reads as prose. It follows the workbench's own dark/light, wraps long lines, and the Source variant caps its height so a long file scrolls inside CodeMirror's own scroller. The editor is lazily imported — the canvas, the view the workbench opens on, makes zero CodeMirror requests — and falls back to the plain `<pre>` if the chunk never lands.

  Also fixes a latent hang in the `atlas` bin: it only called `process.exit` for a NON-ZERO code, so a successful command's exit depended on every embedded subsystem releasing every handle. A command that embeds a dev server closes the browser and the server, and an embedded Vite dep-optimizer can still outlive both — leaving the process idle forever with its work done and its output printed. Success now sets `process.exitCode` (so piped stdout still flushes) with an `unref`ed fallback that force-exits if something is holding the loop open.

- [#2666](https://github.com/pyreon/pyreon/pull/2666) [`ae60021`](https://github.com/pyreon/pyreon/commit/ae60021c7b6fc5ebd45f48d4b674f167d7700dad) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Make `atlas build` and `atlas dev` work in an INSTALLED consumer workspace.

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

- [#2615](https://github.com/pyreon/pyreon/pull/2615) [`20db838`](https://github.com/pyreon/pyreon/commit/20db838cbc59cf24d5e42137bab1495695b0636a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Visual polish for both workbenches.

  atlas: the dev shell now loads its webfonts (Space Grotesk / Public Sans / JetBrains Mono — previously nothing loaded a font and the whole UI fell back to the browser serif) and the theme ships real `font.sans`/`font.display` stacks applied on the Shell. Fixed the needsFix-tag layout gap where a button's children stacked vertically ignoring the theme's row/gap (the flex-fix inner span is now `display: contents`), the status bar's column-stacked texts, and the addon tab strip clipping half its tabs (wraps instead of hidden overflow).

  loom: the layered graph now scales to a full workspace — ambient edges drop to a whisper (0.1 opacity), the selected fan no longer flares over its neighborhood, node labels get a background halo (`paint-order: stroke`) so 700 edges never strike through text, long package names truncate with a native tooltip, and version sublabels render only on the selected/focused neighborhood.

- [#2660](https://github.com/pyreon/pyreon/pull/2660) [`e252318`](https://github.com/pyreon/pyreon/commit/e252318fdd68a07fbc292b0f012fe7bafaa54653) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix four bugs that made Atlas unusable on a real monorepo, and one that broke ordinary app builds.

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

- [#2672](https://github.com/pyreon/pyreon/pull/2672) [`d6e475e`](https://github.com/pyreon/pyreon/commit/d6e475e018b414d24bc7743e6e956734eb62ad37) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Report files the rocketstyle pass could not LOAD, instead of counting them as empty.

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

- [#2688](https://github.com/pyreon/pyreon/pull/2688) [`9806e6c`](https://github.com/pyreon/pyreon/commit/9806e6cbc8018ae4f07bc591557aea00a351b2cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `atlas scan` ~20x faster — the leak check was paying a full GC per scenario

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

- [#2707](https://github.com/pyreon/pyreon/pull/2707) [`7f8d3bd`](https://github.com/pyreon/pyreon/commit/7f8d3bdcb5afb8b5e3c8f73ccd1ddd95627b00d6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two defects that made `atlas build` unusable against any real package, and publish the workbench at pyreon.dev/atlas.

  `atlas build` shipped in 0.50.0 but only worked against a project that happened to declare `@pyreon/atlas` as its own dependency — in this repo, exactly one example. Two bugs, both found by pointing it at a real 108-component library:

  - **`@pyreon/atlas` itself was unresolvable.** The generated entry lives in `<project>/node_modules/.atlas-build/` and imports `@pyreon/atlas/ui`. Resolution walks up looking for `node_modules/@pyreon/atlas`, and a package manager never links a package inside its own `node_modules` — so every framework package resolved and the workbench did not (`Rolldown failed to resolve import "@pyreon/atlas/ui"`). A component library never declares the workbench; you point the tool at it. Now resolved through the workspace's own package map, and only ever for Atlas's generated modules.
  - **A subpath resolved to a directory instead of a file.** `resolveWorkspaceSpecifier` probed the bare extension first and used an existence check, so a barrel `src/ui.ts` next to its `src/ui/` folder matched the folder (`UNLOADABLE_DEPENDENCY: Could not load .../src/ui`). `@pyreon/atlas/ui` is exactly that shape.

  Both are bisect-verified. Verified end to end against `@pyreon/ui-components`: 108 components build and render in real Chromium with zero console errors, and the baked RPC is real — 108/108 source entries, 108/108 Lens verdicts, 9 carrying findings, 0 bake failures.

  Also gives the built site real URLs. `atlas build` now emits a directory per component, so `/atlas/button/` is a page a plain file server answers at — pasteable into a chat, bookmarkable, linkable from a design doc — instead of `/atlas/?c=button`. The workbench reads its own path (base-agnostic: it matches the last segment against the catalog, so it works under any `--base`) and writes the path back on navigation, with the component removed from the query so the two can never disagree.

  Opt-in via a global the host sets, because writing a path is only safe where a page answers at it: `atlas build` sets it, `atlas dev` sets it (its middleware already serves the shell for any extensionless GET), and a workbench EMBEDDED in someone else's app sets nothing and keeps the query string — writing `/button/` there would 404 on reload. Skipped for a relative `--base`, which would resolve assets against the wrong directory, and it says so rather than emitting pages that cannot load their own JavaScript.

  Honest limit: these are real URLs, not prerendered pages. The HTML body is empty until JavaScript runs, so a crawler sees the title and nothing else — rendering the component into the HTML needs SSR, which is a different change.

- [#2613](https://github.com/pyreon/pyreon/pull/2613) [`1cbf4c7`](https://github.com/pyreon/pyreon/commit/1cbf4c7c79c64cae31d1bde5905c3f3c5b0af0fa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The workbench UI restructured for readability — zero behavior change:
  one styled component per file under `components/<region>/`, views in
  region folders with the four built-in panels split out of the former
  `builtin-panels.tsx`, and a real token system (`ThemeScale`: font
  families, a named size scale, tracking, radii, motion, the hairline
  border) extracted from the exact values the chrome already used.

- [#2661](https://github.com/pyreon/pyreon/pull/2661) [`1005cfc`](https://github.com/pyreon/pyreon/commit/1005cfcf20f6fad21cd3ffa584c8ce640ecf421d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Atlas reads the ecosystem-wide `pyreon.config.*` through `@pyreon/config`'s
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

- [#2617](https://github.com/pyreon/pyreon/pull/2617) [`cd442ea`](https://github.com/pyreon/pyreon/commit/cd442eaf03af2a7c4b91481d5273d900a0f3478f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Element's typed `gap` prop now works on SIMPLE elements and the button/fieldset/legend flex-fix layer — it renders modern CSS `gap` on the flex container (previously it was wired only into the before/after slot margins, a typed-but-partial contract that pushed consumers into theme-level flex overrides). The compound path keeps its slot-margin machinery and never receives wrapper gap, so the two mechanisms cannot double up.

  On the strength of that, both workbench UIs (atlas + loom) are now fully props-first: layout is expressed exclusively through Element's own props (`contentDirection`/`contentAlignX`/`contentAlignY`/`gap`/`block`) with `.theme()` reserved for visual CSS — no flex overrides anywhere, matching the documented ui-components architecture. The only theme-level layout left is the documented special-case trio: `flexWrap` (no Element prop), CSS grid components, and `display: block` for text truncation. The Element manifest's api notes + mistakes now teach the full contract (simple-path `content*` props, axis-fixed alignment, `block` for app roots, the gap history).

- [#2701](https://github.com/pyreon/pyreon/pull/2701) [`ea58e22`](https://github.com/pyreon/pyreon/commit/ea58e22e74215dae50e3cee4ec8f4f5a3ac13daf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/atlas` now declares the two optional runtime peers it already imports: `@pyreon/vite-plugin` and `happy-dom`.

  Both were devDependencies only, and both are loaded with a dynamic `import()` behind a graceful fallback — which is exactly what an optional peer is. `vite` and `playwright-core` were already declared that way; `@pyreon/vite-plugin` is imported in the _same_ `try` block as `vite`, so a consumer who installed vite because the peer list asked them to still silently fell back to the runtime loader instead of the real compiler chain. `happy-dom`'s own failure message literally reads "install `happy-dom`", for a package nothing ever told the consumer to install. The declaration now matches the behaviour, so package managers surface it at install time.

  The `loom scan` gate over this repo runs `--strict`, so a NEW dependency-fabric warning is red rather than scrollback. The repo's 18 warnings are at zero: the real ones fixed, and three verified false positives suppressed in the root `loom` config, each with a written `reason` (loom requires one). A backlog that reaches zero and is not gated refills — the same argument behind the lint ratchet.

- [#2642](https://github.com/pyreon/pyreon/pull/2642) [`4e53471`](https://github.com/pyreon/pyreon/commit/4e53471d6f92266bbf6a84f35eea6cf58fb529e3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every package manifest now declares its MULTIPLATFORM story as data:
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

- [#2619](https://github.com/pyreon/pyreon/pull/2619) [`e2aec5b`](https://github.com/pyreon/pyreon/commit/e2aec5bce96779ab4224a816abfe1254f8eadf98) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fulltext ⌘K search in both workbenches, with match-reason chips.

  atlas: the search index now covers keywords, not just names — control keys, enum OPTIONS (the state/variant axes: searching `soft` surfaces every component with a `variant: soft`), scenario names, group paths, and descriptions. Multi-token queries AND across fields; keyword hits carry the matched field as a chip (`variant · soft`, `scenario · Long content`) so a row explains why it surfaced.

  loom: the ⌘K dialog arrives (same docs-site shape as atlas — the header keeps the trigger; the query still drives the sidebar filter), fulltext over the fabric: package ids, versions, kind, license, FINDINGS (searching `unused-dep` lists every flagged package with a `finding · unused-dep` chip), and the dependency edges in both directions (`depends on · X` / `needed by · X`).

- [#2617](https://github.com/pyreon/pyreon/pull/2617) [`cd442ea`](https://github.com/pyreon/pyreon/commit/cd442eaf03af2a7c4b91481d5273d900a0f3478f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Styling discipline pass over both workbench UIs: no inline styles and no attrs `css` strings — every layout now lives in rocketstyle `.theme()` structured keys (the raw-string idiom was the root of the whole column-stacking bug family), loom's matrix view renders through real styled components instead of ~15 inline-styled divs, and all spacing/radii snap to a 4/8px grid (radius scale: chip 4 · control 8 · card 12 · pill 20). Even the graph's SVG styling is class-based now (static font/cursor/animation rules live in injected global classes — SVG can't be a rocketstyle component); the only remaining inline values are theme-token paints as SVG attributes and truly data-driven geometry (per-node opacity, the measured min-width), documented at their sites. Device viewport presets (375/768) are deliberately exempt from the grid — they are real device widths.

- [#2618](https://github.com/pyreon/pyreon/pull/2618) [`7a47093`](https://github.com/pyreon/pyreon/commit/7a470934bf732086ca950cadd68356afa8cb4fcf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - atlas: the workbench owns its page now (global reset — the browser's default body margin framed the shell with a white gap); brand themes + appearance moved out of the top bar into a profile menu on the avatar (click-away + Escape to close); search became a docs-site-style ⌘K dialog (dim blurred backdrop, keyboard-driven results with ↑↓/Enter, the top bar keeps only the trigger); and the side panels are drag-resizable (pointer-captured handles, clamped 200–420 / 280–560) and collapsible (bar toggles + double-click on a handle), widths as live drag geometry.

  loom: the view-bar title block breathes (real gap between title and eyebrow, roomier padding) and detector findings render severity-TRUE — an INFO finding no longer borrows the danger card's red (info → neutral surface, warning → warn tint, error → danger tint).

- Updated dependencies [[`f7835ed`](https://github.com/pyreon/pyreon/commit/f7835ed8e3027165c7a8eda93d624fc8ac0526ff), [`e252318`](https://github.com/pyreon/pyreon/commit/e252318fdd68a07fbc292b0f012fe7bafaa54653), [`f07aa78`](https://github.com/pyreon/pyreon/commit/f07aa783dbb784398f9302046147bb3d05a1e746), [`9729e91`](https://github.com/pyreon/pyreon/commit/9729e91111b7d5c1414d7df5d7ed0080a904eee8), [`39610a7`](https://github.com/pyreon/pyreon/commit/39610a7457903d8fc8e05d4099173ce23d261203), [`77eaf81`](https://github.com/pyreon/pyreon/commit/77eaf81469ad4a00ae55fcb328e83d67b508d157), [`a0c0555`](https://github.com/pyreon/pyreon/commit/a0c05555d075d30605188a9d4c4afe2661ab796e), [`77eaf81`](https://github.com/pyreon/pyreon/commit/77eaf81469ad4a00ae55fcb328e83d67b508d157), [`7dc7403`](https://github.com/pyreon/pyreon/commit/7dc740350ea8768b2a1f7d01a7372c1b44265fc0), [`3c79989`](https://github.com/pyreon/pyreon/commit/3c79989c620e18651bfa82af7351eae60ab705a9), [`3017511`](https://github.com/pyreon/pyreon/commit/30175115cb150beeca64d94d2d62f5dae7c0b0a6), [`cd442ea`](https://github.com/pyreon/pyreon/commit/cd442eaf03af2a7c4b91481d5273d900a0f3478f), [`0b5ce4c`](https://github.com/pyreon/pyreon/commit/0b5ce4c53128389ebfda73f986c9dc1436f4c048), [`331c206`](https://github.com/pyreon/pyreon/commit/331c2069528bebfa806950cdcb48aef77aedd640), [`4b430ca`](https://github.com/pyreon/pyreon/commit/4b430cac51008cce48606203dd9f874b419e3db0), [`26ae1be`](https://github.com/pyreon/pyreon/commit/26ae1beecd112ef91dc840719bff8934d571e63b), [`6c05ef0`](https://github.com/pyreon/pyreon/commit/6c05ef0561747c7b75cd8f5123c8bfc5fe98234a), [`3b2893e`](https://github.com/pyreon/pyreon/commit/3b2893e2eb812e49c16e47fb42e433f6fb3a0d2c), [`5b3442e`](https://github.com/pyreon/pyreon/commit/5b3442e4262cca5f49fcbfc8d83e88861ce3d821), [`9729e91`](https://github.com/pyreon/pyreon/commit/9729e91111b7d5c1414d7df5d7ed0080a904eee8), [`e10f9fc`](https://github.com/pyreon/pyreon/commit/e10f9fc5143e119d02722951df721f3ee9389749), [`f35927f`](https://github.com/pyreon/pyreon/commit/f35927ff10041a65558daa97767a4ff4f771d1b8), [`19ee507`](https://github.com/pyreon/pyreon/commit/19ee507df579bcf719ab385b0b60ea64e587e731), [`4e53471`](https://github.com/pyreon/pyreon/commit/4e53471d6f92266bbf6a84f35eea6cf58fb529e3), [`25b5f5a`](https://github.com/pyreon/pyreon/commit/25b5f5a2374c3a9cecabb478a8b1c2cf62d1d23c), [`d82f233`](https://github.com/pyreon/pyreon/commit/d82f233f55fcc57b5d231d09a8b79fcb105c60b7), [`9415d31`](https://github.com/pyreon/pyreon/commit/9415d31a864be2cb66da4775baec8f9b059203de), [`83fc05a`](https://github.com/pyreon/pyreon/commit/83fc05ab940a01f69f21ed5fad1aa4b5fcfde7ce), [`8c7d231`](https://github.com/pyreon/pyreon/commit/8c7d2313d713f7aa46a37ce827852339f71180ad), [`cfd2e8c`](https://github.com/pyreon/pyreon/commit/cfd2e8cdad8a0025c79b3638ab829d490a7f675d), [`9729e91`](https://github.com/pyreon/pyreon/commit/9729e91111b7d5c1414d7df5d7ed0080a904eee8), [`9590027`](https://github.com/pyreon/pyreon/commit/9590027d8358321a0509b9cbb87d7f30858db442), [`f498ee6`](https://github.com/pyreon/pyreon/commit/f498ee6604f0d4be0756caef5f07b30e9c1c6de9), [`a4a1766`](https://github.com/pyreon/pyreon/commit/a4a1766e341a4f8b3557c4d55885b183aab2d62b), [`9729e91`](https://github.com/pyreon/pyreon/commit/9729e91111b7d5c1414d7df5d7ed0080a904eee8), [`85ad5bf`](https://github.com/pyreon/pyreon/commit/85ad5bf91a6e822afbc109721b51b1cbb1422274), [`9154c8a`](https://github.com/pyreon/pyreon/commit/9154c8aca81ce858ef99b213564af870c378f37f), [`175a232`](https://github.com/pyreon/pyreon/commit/175a2322a14818730f3a32ad7a4a68e34b5a7a2c), [`9729e91`](https://github.com/pyreon/pyreon/commit/9729e91111b7d5c1414d7df5d7ed0080a904eee8), [`abd71ef`](https://github.com/pyreon/pyreon/commit/abd71efb3b21a1b86b2aabd625ea2198cc9354c9), [`2334088`](https://github.com/pyreon/pyreon/commit/2334088c71d296cce45f02c88b53606e49e69c19), [`e610e59`](https://github.com/pyreon/pyreon/commit/e610e59d56031687cd7dccad653019b441983b4b), [`f7541e0`](https://github.com/pyreon/pyreon/commit/f7541e01455a56fb2ef8bf23d17909199ecc5c5a), [`834523b`](https://github.com/pyreon/pyreon/commit/834523bddd6ce81e852360bc339805a6b095c419)]:
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
