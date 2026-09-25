---
title: "Component Workbench — API Reference"
description: "AI-native component workbench — derives, verifies, and serves a machine-readable component catalog"
---

# @pyreon/atlas — API Reference

> **Generated** from `atlas`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [atlas](/docs/atlas).

Atlas inverts Storybook’s authoring-first model: your components and their TypeScript types are the source of truth, and Atlas DERIVES the catalog — controls inferred from props, scenarios generated from variant axes (rocketstyle dimensions included), and a five-check verify verdict per scenario (a11y, interaction, leak, reactivity coverage, snapshot). `atlas scan` writes `atlas-catalog.json` + `atlas-agent-guide.md` (the machine-readable surface an AI assistant consumes), `atlas dev` serves a zero-config workbench over the real Vite compiler, and `atlas verify-browser` runs the browser half of verification in real Chromium. Authoring is opt-in, not required: an `atlas.config.ts` can add a theme, a wrapper, presets (viewports / locales / roles), and authored scenarios with `play` interaction scripts.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

the component workbench — dev tooling that runs in a browser, not app runtime

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- Derived catalog: controls inferred from prop types, scenarios generated from variant axes (rocketstyle dimensions resolved through the project theme)
- Five-check verify verdict per scenario — a11y, interaction (play scripts or auto click-walk), REAL leak check (reactive-graph accumulation past GC), reactivity coverage, visual snapshot
- Machine-readable output: atlas-catalog.json + atlas-agent-guide.md, written for AI assistants as first-class consumers
- Zero-config workbench (`atlas dev`): real Vite + the real Pyreon compiler, live control editors, canvas addons (viewport/background/zoom/measure/pseudo-states), axe-core a11y panel, autodocs, Actions log, Reactivity Lens
- Browser verification (`atlas verify-browser`): reactive coverage measured on the page’s own devtools bridge + pixelmatch snapshot baselines, merged into the catalog
- Authoring opt-in via atlas.config.ts: theme, wrapper, presets (viewports/locales/roles), authored scenarios with step-labelled `play` functions (args stay live — a render-prop child or an h() tree reaches the canvas intact, and an authored Default is the base of every derived scenario), `matrix` (axis fan by default, full cross-product opt-in), `parts` (a part renders inside its parent) and `browserOnly` (an overlay that returns null where isServer is true)
- A scenario that mounts NO DOM fails the interaction check with `empty-render` — "mounts, clicks and unmounts without throwing" is true of an empty container, and this is the check that is not
- Honest verdicts by construction: three states (verified/failing/unverified), red scan = red exit, partial browser coverage named per scenario

## Complete example

A full, end-to-end usage of the package:

```tsx
// atlas.config.ts — ALL of this is optional; scan/dev work with none of it.
// Named exports, plain values, no JSX (the scan imports this file under
// whatever runtime it runs — see the workshop's atlas.config.ts).
export const presets = {
  viewports: [
    { id: 'full', label: 'Full', width: null },
    { id: 'kiosk', label: 'Kiosk', width: 900 },
  ],
  locales: [
    { id: 'en', label: 'English' },
    { id: 'ar', label: 'Arabic', dir: 'rtl' as const },
  ],
  roles: [
    { id: 'anonymous', label: 'Anonymous', hint: 'nothing granted' },
    { id: 'ops', label: 'Ops', grants: ['posts.delete'] },
  ],
}

export const scenarios = {
  Button: [
    {
      name: 'Triple click',
      args: { label: 'Storm target' },
      play: async ({ root, step }: { root: Element; step: (n: string, r: () => void | Promise<void>) => Promise<void> }) => {
        await step('find the button', () => {
          if (!root.querySelector('button')) throw new Error('no button')
        })
        await step('click it three times', () => {
          const target = root.querySelector<HTMLButtonElement>('button')!
          for (let i = 0; i < 3; i += 1) target.click()
        })
      },
    },
  ],
}

// A project can also export `theme` (resolves rocketstyle dimension axes)
// and `wrapper` (the providers your components genuinely need to mount).

// Then:
//   bunx atlas scan .            → atlas-catalog.json + atlas-agent-guide.md
//   bunx atlas verify Button     → re-check ONE component; says WHICH check failed
//   bunx atlas dev .             → the workbench at localhost:5210
//   bunx atlas verify-browser .  → coverage + snapshot verdicts in Chromium
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`atlas scan`](#atlas-scan) | function | Discover components (static TS scan + rocketstyle runtime detection), derive controls and variant scenarios, MOUNT each  |
| [`atlas check`](#atlas-check) | function | Validates a PROPOSED usage against the catalog's already-derived contract — catches the value that typechecks in JS but  |
| [`atlas verify`](#atlas-verify) | function | Re-check ONE component and report WHICH check failed and why — the write → verify → fix loop, for a person or an agent i |
| [`VerifyFinding`](#verifyfinding) | type | One thing a verify check found — catalog `version: 2`. |
| [`atlas dev`](#atlas-dev) | function | Boot the workbench: real Vite + the real Pyreon compiler over your source, a derived catalog in the sidebar (nested by d |
| [`atlas build`](#atlas-build) | function | Compile the workbench into a STATIC, deployable site — the same derived catalog `atlas dev` serves, as plain files for P |
| [`atlas verify-browser`](#atlas-verify-browser) | function | The browser half of verification, in real Chromium (playwright-core is an OPTIONAL peer — scan/dev work without it). |
| [`createAtlas`](#createatlas) | function | The programmatic pipeline factory behind the CLI: `discover → decorate → verify → graph`, plugin-driven. |
| [`defineAtlas`](#defineatlas) | function | Identity helper for a typed `createAtlas(...)` options object — returns its argument unchanged, purely for editor DX (au |
| [`atlas init`](#atlas-init) | function | Writes the config the workspace already implies — the ONE file you author by hand. |
| [`AtlasConfig.projects (monorepo — one site, several packages)`](#atlasconfig-projects-monorepo-one-site-several-packages) | type | Scan several packages into ONE catalog, each filed under its own `name` (the sidebar reads `Core/Forms/Button`). |
| [`AtlasConfig.scenarios (authored scenarios + play)`](#atlasconfig-scenarios-authored-scenarios-play) | function | Authored scenarios in `atlas.config.ts`, keyed by component name. |

## API

### atlas scan `function`

```ts
atlas scan [dir] [--no-mount] [--check]
```

Discover components (static TS scan + rocketstyle runtime detection), derive controls and variant scenarios, MOUNT each scenario (real module load through a Vite-powered loader) and run the node half of the verify pipeline — a11y (static), interaction (mount + play/click-walk), a REAL leak check (reactive-graph accumulation across repeated mounts, past GC), and SSR-PARITY (`renderToString` + hydrate, asserting the runtime reported no mismatch AND the hydrated DOM equals a fresh client mount — two oracles because SSR and hydrate can agree on the same wrong DOM). Parity skips with a reason when `@pyreon/runtime-server` is absent, and is blind to `typeof window` branching because both renders share one process. Writes `atlas-catalog.json` (every component, control, scenario, and verdict) and `atlas-agent-guide.md` (the AI-consumable summary). Exits non-zero when any scenario FAILS — wiring the scan into CI gates the catalog. `--no-mount` keeps the scan purely static (no project code executes). `--check` turns the scan into a RATCHET: it compares against the COMMITTED `atlas-catalog.json` instead of rewriting it (a ratchet that overwrites its own baseline compares a run to itself and can never report a regression again) and exits non-zero on a REGRESSION. A check that STOPPED RUNNING counts as one — that is the case absolute counts cannot catch, because losing coverage makes the numbers improve: delete a wrapper and every mount-dependent check drops to skip, so `2 failing` becomes `0 failing` and a broken catalog reads as fixed. A missing or unreadable baseline is exit 0 with a note, never a failure — making the first `--check` run red for everybody is how a ratchet gets disabled on day one.

**Example**

```tsx
$ atlas scan .
atlas: discovered 10 component(s), 44 scenario(s) — 42 verified, 2 failing, 0 unverified.
  checks: a11y 18/20 ✗ · interaction 43/43 · ssrParity 43/43 · leak 43/43
  not run: reactivityCoverage, snapshot — browser-only — run `atlas verify-browser`
  → atlas-catalog.json
  → atlas-agent-guide.md
atlas: 2 failing scenario(s):
  ✗ button--empty
      a11y: missing accessible name: "label" is empty
```

**Common mistakes**

- Treating "verified" as a default — a scenario is verified only when a check actually RAN and passed; `checked: 0` renders as unverified, never smoothed into a pass
- Reading `N verified` as "everything was checked" — it is a scenario count, not a check count. The `checks:` line is the one that says which of the six ran, and a package without `@pyreon/runtime-server` resolvable reports 1090/1090 verified having run only two of them
- Running the scan without the project theme in `atlas.config.ts` for rocketstyle components — dimension axes resolve empty and the variant scenarios collapse to defaults
- Expecting the leak check under plain `node` — it needs a GC hook (`bun`, or `node --expose-gc`); without one it reports skip, not pass
- Expecting reactivityCoverage/snapshot verdicts from the scan — those are browser-only claims; run `atlas verify-browser` to earn them
- Reading a `--check` run that reports FEWER failures as an improvement without looking at the ratchet line — fewer failures is exactly what losing a check produces, and only the diff distinguishes "fixed" from "no longer measured"

**See also:** `atlas verify` · `atlas verify-browser` · `createAtlas`

---

### atlas check `function`

```ts
atlas check <Component> ['{"prop":"value"}'] [--cwd <dir>]
```

Validates a PROPOSED usage against the catalog's already-derived contract — catches the value that typechecks in JS but renders silently wrong (`state="primry"` against a select-kind prop whose real options are `primary`/`secondary`/`danger`), an unknown prop name, or a value of the wrong TYPE. Reads the COMMITTED `atlas-catalog.json` rather than re-scanning, deliberately: a check must be instant and must agree with the exact answer the workbench and agent guide already gave — a rescan here could silently disagree with the catalog an agent was handed moments earlier. Every unresolved prop / unmatched value gets a `did you mean` suggestion (edit-distance nearest match) for the same reason a typo'd component name does. Missing required props are reported when the args object omits them, even with no args at all. Exits non-zero on any finding, so it is safe to wire into a pre-commit hook or a CI step gating a generated-usage PR.

**Example**

```tsx
$ atlas check Button '{"state":"primry"}'
Button: 1 problem(s):
  · `state` must be one of `primary`, `secondary`, `danger` — got `primry` — did you mean `primary`?

$ atlas check Input
Input: 1 problem(s):
  · `label` is required and was not supplied  # omitted args → missing-required findings only
```

**Common mistakes**

- Running `atlas check` before ever running `atlas scan` — there is no catalog to check against, so it fails with "Run atlas scan first" rather than a usage verdict
- Expecting `atlas check` to catch a REGRESSION since the last scan — it validates the ARGS you pass against the LAST-WRITTEN catalog; it does not itself re-derive anything, so a source change needs a fresh `atlas scan` before checking against it means anything

**See also:** `atlas scan` · `atlas verify`

---

### atlas verify `function`

```ts
atlas verify [Component] [--cwd <dir>] [--json] [--check]
```

Re-check ONE component and report WHICH check failed and why — the write → verify → fix loop, for a person or an agent iterating on a single component. Discovery still walks the whole project (a component’s file is not known until it does), but decoration and verification — mounting, exercising, hydrating and GC-probing every scenario — run only for the match, so this is a question about one component rather than a whole-catalog scan with the answer filtered out at the end. Measured on `@pyreon/ui-components` (108 components, 1090 scenarios): 1.35s for a full scan against 0.90s scoped to one component’s 60 scenarios; the verify work drops ~18× but discovery dominates the residual, so treat this as a focus tool first and a speed tool second. Prints a per-check tally, the checks that did NOT run and why, and every failing scenario UNCAPPED with its findings. `--json` emits the same report as data for an agent to branch on. Never writes `atlas-catalog.json`: a scoped run holds one component, and writing that would replace the whole catalog. Exits non-zero on any failing check, on a name that matched nothing, and on a run where nothing could be verified at all.

**Example**

```tsx
$ atlas verify Button
atlas verify Button: 1 component(s), 15 scenario(s)
  checks: a11y 14/15 ✗ · interaction 15/15 · ssrParity 15/15 · leak 15/15
  not run: reactivityCoverage, snapshot — browser-only — run `atlas verify-browser`

✗ button--empty
    a11y [missing-accessible-name]: missing accessible name: "label" is empty
      → Give "label" a non-empty value, or an aria-label if the text is decorative.

1 failing · 14 verified · 0 unverified
```

**Common mistakes**

- Reading exit 0 as "checked and clean" without the `checks:` line — a run where nothing could be examined exits NON-zero for exactly this reason, but a run where only two of six checks were available exits 0 and the tally is what says so
- Expecting a scoped run to refresh `atlas-catalog.json` — it deliberately never writes; a one-component catalog would replace the real one and silently break the agent guide, the MCP tools and `atlas check` for every other component until the next full scan
- Passing a directory as the first positional — the first positional is the COMPONENT (matching `atlas check`); the directory is `--cwd`
- Assuming a typo degrades gracefully — an unmatched name is a non-zero exit with suggestions, precisely because filtering to nothing otherwise reports "0 scenarios, 0 failing", which reads as a pass
- Pattern-matching a finding's MESSAGE instead of its `code` — the message is prose and free to be reworded between releases; the code is the stable contract, and each finding also carries a `fix` naming the one thing to change
- Expecting an ambiguous bare name to pick one — a name matching several components across projects REFUSES and names the candidate keys, the same rule the graph and the MCP tools apply

**See also:** `atlas scan` · `atlas verify-browser` · `VerifyFinding`

---

### VerifyFinding `type`

```ts
interface VerifyFinding { code: FindingCode; message: string; fix?: string }
```

One thing a verify check found — catalog `version: 2`. `code` is a STABLE identifier for the CLASS of failure (`hydrate-threw`, `missing-accessible-name`, `reactive-nodes-retained`, `ssr-render-threw`, `reactive-nodes-retained`, plus codes for every reason a check did not run: `browser-only`, `no-dom`, `no-gc-hook`, `no-ssr-renderer`, `not-run`, `nothing-to-check`); `message` is prose; `fix` names the ONE concrete thing to change, and is present only when there is one — a finding that cannot name a single next step omits it rather than inventing one. The fix travels WITH the finding rather than living in a lookup table a consumer has to know to consult, so the agent guide, the MCP tools and `atlas verify --json` all carry the actionable half without a second call. Codes are permanent once shipped: a reworded message is a patch, a renamed code is a breaking change. Findings were plain strings at catalog `version: 1`, which meant an agent could only pattern-match a sentence — the MCP server now refuses a v1 catalog by version rather than rendering blanks for every finding.

**Example**

```tsx
{
  code: 'missing-accessible-name',
  message: 'missing accessible name: "label" is empty',
  fix: 'Give "label" a non-empty value, or an aria-label if the text is decorative.',
}
```

**Common mistakes**

- Branching on `message` — it is prose, and rewording it is a patch-level change; branch on `code`
- Expecting every finding to carry a `fix` — one is present only when a single concrete next step exists, because a confident wrong instruction costs more than none
- Reading a `version: 1` catalog with code that expects objects — every finding renders blank rather than erroring, which is why the loader refuses by version

**See also:** `atlas verify` · `atlas scan`

---

### atlas dev `function`

```ts
atlas dev [dir] [--port=5210]
```

Boot the workbench: real Vite + the real Pyreon compiler over your source, a derived catalog in the sidebar (nested by directory), live controls (bool/string/number/color editors), canvas addons (viewport / background / zoom / measure overlay / pseudo-state force), an A11y panel with on-demand axe-core, autodocs pages, an Actions log, and the Reactivity Lens. Components in files that import `@pyreon/atlas` are treated as workbench HOSTS and excluded from the nav (import-specifier match, never substrings).

**Example**

```tsx
$ atlas dev . --port=5210
atlas dev: 10 component(s) → http://localhost:5210/
```

**Common mistakes**

- Expecting authored `play` functions to run on DERIVED catalogs in the workbench — play crosses no JSON boundary; the ▶ button appears for hand catalogs, and derived play scripts run in `atlas scan` / the verify pipeline
- Styling per-instance frames with inline styles — the workbench styles through the Element `css` prop channel (hashed classes); custom viewport widths ship zero inline styles

**See also:** `atlas scan`

---

### atlas build `function`

```ts
atlas build [dir] [--out <dir>] [--title <text>] [--base <path>]
```

Compile the workbench into a STATIC, deployable site — the same derived catalog `atlas dev` serves, as plain files for Pages / Netlify / Cloudflare / S3, with no server component. Crucially it BAKES the two node-answered panels: the Docs source block and the Reactivity Lens read files and run the TypeScript compiler API, neither of which can run in a page, so the build precomputes them per component and ships the answers as data — the Lens still reports real per-expression live/static verdicts on a fully static page. An answer that genuinely cannot be computed bakes its REASON, so the panel says what is wrong instead of surfacing a network error about a request that was never going to work. `--out` defaults to `atlas-dist` and a RELATIVE `--out` resolves against the scanned project, not your shell — `atlas build packages/ui --out site` writes `packages/ui/site`, the same base Vite uses for `outDir` and the same place `atlas scan` writes its catalog. Pass an absolute path when you want it elsewhere; the resolved directory is always printed. Emits a DIRECTORY PER COMPONENT, so `/button/` is a real page on a plain file server — pasteable, bookmarkable, and readable back by the workbench from its own path (the component leaves the query string, so the two can never disagree). Real URLs, not prerendered pages: the body is empty until JS runs. Skipped for a relative `--base`, whose assets would resolve against the wrong directory. `--base` is for a subdirectory deploy (`--base /my-repo/` for a GitHub Pages project site); `--title` wins over `atlas.config.ts`’s `title`. Fails loudly when discovery finds nothing rather than deploying an empty site.

**Example**

```tsx
$ atlas build . --out docs/components --title "Acme DS"
atlas build: 10 component(s) → /repo/docs/components
  title: Acme DS
```

**Common mistakes**

- Assuming a plain `vite build` of the workbench is equivalent — it produces a site that LOOKS complete while the Docs source block and the Reactivity Lens are permanently dark, because nothing baked their node-only answers
- Deploying to a subdirectory without `--base` — assets are requested from the domain root and every one 404s, leaving a blank page with no error on the page itself
- Expecting `pages.<name>.title` to rename the component — it is a DISPLAY label only; the usage snippet, the source/Lens lookup and an agent’s import all use the real `name`, which is exactly why the two are separate fields
- Expecting `pages.<name>.order` to sort across groups — it pins a component within its OWN group; a cross-group sort would scramble the tree from a single config line
- Expecting `--dir` to apply when `atlas.config.ts` declares `projects` — the declared roots win, because a monorepo that listed its packages meant it and silently scanning `src` instead would emit an empty site

**See also:** `atlas dev` · `atlas scan`

---

### atlas verify-browser `function`

```ts
atlas verify-browser [dir] [--update-snapshots]
```

The browser half of verification, in real Chromium (playwright-core is an OPTIONAL peer — scan/dev work without it). Boots the workbench, drives every derived scenario through the workbench model, measures reactive coverage on the page’s own devtools bridge (the components’ actual reactivity instance — a NEW-NODE diff so workbench chrome never pollutes the numbers), screenshots the preview against per-scenario pixelmatch baselines under `atlas-snapshots/`, and merges both verdicts back into `atlas-catalog.json`. Coverage is a MEASUREMENT, not a threshold gate: pass means measured, and the findings carry the numbers. First run creates baselines (flagged as recorded-not-yet-compared); later runs compare within tolerance and write `<id>.actual.png` on a diff. Exits non-zero on visual diffs.

**Example**

```tsx
$ atlas verify-browser .
atlas verify-browser: 26 scenario(s) — coverage measured on 26, 0 baseline(s) created, 0 visual diff(s).
  → atlas-catalog.json
```

**Common mistakes**

- Committing `atlas-snapshots/` across machines — baselines are machine-specific (font antialiasing); gitignore them and let each environment create its own on first run
- Reading "100% of 0 reactive nodes" as broken — a genuinely static scenario creates no reactive nodes and the finding says so explicitly
- Treating not-drivable scenarios as failures — components living in workbench-host files can’t be driven through the dev nav; the summary names them and their browser verdicts stay skip

**See also:** `atlas scan`

---

### createAtlas `function`

```ts
(options?: { plugins?: AtlasPlugin[]; preset?: "recommended" | "none" }) => Atlas
```

The programmatic pipeline factory behind the CLI: `discover → decorate → verify → graph`, plugin-driven. The recommended preset bundles the built-in plugins (controls inference, variant matrix, mount/interaction/leak verification). Pass `preset: "none"` when you assemble the plugin list yourself — appending the recommended bundle on top of an explicit list runs duplicate plugins whose default verdicts can overwrite real ones.

**Example**

```tsx
import { createAtlas } from '@pyreon/atlas'

const atlas = createAtlas()            // recommended preset
const graph = await atlas.build()      // discover → decorate → verify → graph
graph.search('button')                 // Catalog Graph queries
```

**Common mistakes**

- Passing an explicit plugin list WITHOUT `preset: "none"` — the recommended bundle is appended a second time and a duplicate mount plugin’s empty-graph default verdict can overwrite the real one

**See also:** `atlas scan`

---

### defineAtlas `function`

```ts
defineAtlas(config: AtlasConfig): AtlasConfig
```

Identity helper for a typed `createAtlas(...)` options object — returns its argument unchanged, purely for editor DX (autocomplete + type-checking on `plugins` / `preset` / `baseArgs` / `matrix` / `cwd` / `focus`) when the object is built up in its own module instead of inlined at the `createAtlas()` call site.

**Example**

```tsx
import { defineAtlas, createAtlas } from '@pyreon/atlas'

const options = defineAtlas({ preset: 'recommended', matrix: 'axes' })
const graph = await createAtlas(options).build()
```

**Common mistakes**

- Reaching for this to type `atlas.config.ts` / the `pyreon.config.ts` `atlas:` section — that file-level convention (`title`, `projects`, `pages`, `scenarios`, `wrapper`, `presets`, `theme`, `parts`, `browserOnly`, `ignore`) is a WIDER, separate shape the CLI loads dynamically; `defineAtlas`'s `AtlasConfig` is specifically the `createAtlas()` programmatic-API options bag and does not carry those fields

**See also:** `createAtlas` · `AtlasConfig.projects (monorepo — one site, several packages)`

---

### atlas init `function`

```ts
atlas init [dir] [--force] [--dry-run] [--title <text>]
```

Writes the config the workspace already implies — the ONE file you author by hand. Atlas works with zero config for a plain single-package library (`atlas scan` and `atlas dev` need nothing), but the first thing anyone wants to do after that is adjust a guess: rename a monorepo project group, drop an internal package, pin an order. `atlas init` detects the workspace's packages (populating `AtlasConfig.projects` for a monorepo), guesses a site `title` from the root `package.json` name, and writes `pyreon.config.ts` with every OTHER optional field present but commented out — `wrapper`, `pages`, `scenarios`, `matrix`, `parts`, `browserOnly` — so the file is self-documenting. Nothing regenerates it after; it is yours to edit. It writes no story files by design — components, controls and scenarios stay derived from source.

**Example**

```tsx
$ atlas init
atlas init: wrote pyreon.config.ts (2 project(s) detected)

$ atlas init --dry-run   # print instead of writing
$ atlas init --force     # overwrite an existing config
```

**Common mistakes**

- Expecting `atlas init` to be required — it is a convenience for adjusting the auto-detected project list and documenting the optional fields; `atlas scan`/`atlas dev` work with no config file at all
- Running it a second time expecting an incremental update — `--force` OVERWRITES the whole file; hand edits are lost unless you diff first

**See also:** `createAtlas` · `AtlasConfig.projects (monorepo — one site, several packages)`

---

### AtlasConfig.projects (monorepo — one site, several packages) `type`

```ts
projects?: { name: string; dir: string }[]
```

Scan several packages into ONE catalog, each filed under its own `name` (the sidebar reads `Core/Forms/Button`). `atlas dev`, `atlas scan` and `atlas build` all follow it, and `--dir` is ignored when it is set. The case it exists for: two packages may both export a `Button`. A component’s IDENTITY becomes `project/Name` (`componentKey`), so both survive — in the catalog, in the sidebar, and in their scenario ids (`core-button--…` vs `admin-button--…`, which otherwise collide in atlas-catalog.json, in the verify verdicts, and in the snapshot filenames). Its `name` is untouched, because `Button` is what you import in both packages and the machine surface an agent reads must say so. Where a bare name becomes ambiguous, Atlas REFUSES and names the candidates rather than picking one. `pages` and authored `scenarios` accept either form — `'Core/Button'` targets one package, a bare `'Button'` applies wherever it is unambiguous (and to BOTH when it is not). A single-package project sets no `project`, so every derived key, id and group is byte-identical to a scan without this.

**Example**

```tsx
export default {
  title: 'Acme Design System',
  projects: [
    { name: 'Core', dir: 'packages/core/src' },
    { name: 'Admin', dir: 'packages/admin/src' },
  ],
  pages: { 'Admin/Button': { title: 'Button (admin shell)' } },
}
```

**Common mistakes**

- Expecting `graph.get("Button")` to return something in a workspace where two packages export one — an ambiguous bare name resolves to `undefined` ON PURPOSE; ask for `Core/Button`. Returning the first match is how the original silent-collapse stayed invisible
- Giving two projects the same `name` — their components would key identically, reintroducing the exact collapse `project` prevents (rejected at config load)
- Putting a `/` in a project `name` — it is the key separator, so the resulting `A/B/Name` is ambiguous to read and nests a group level the author did not mean (rejected at config load)
- Keying `pages` or `scenarios` by a bare shared name and expecting it to hit one package — it applies to EVERY component with that name; use the `project/Name` form to target one
- Assuming `--dir` still narrows the scan — declared `projects` replace it entirely

**See also:** `atlas build` · `atlas dev`

---

### AtlasConfig.scenarios (authored scenarios + play) `function`

```ts
Record<string, { name: string; args?: Record<string, unknown>; play?: PlayFn }[]>
```

Authored scenarios in `atlas.config.ts`, keyed by component name. Authored entries are prepended and WIN over generated scenarios with the same id. A `play` function receives `{ root, step }` — `root` is the mounted scenario’s container, `step(name, run)` labels each phase; a throw fails the interaction check naming the exact step. Validated at load: unknown fields error with the correct field name.

**Example**

```tsx
scenarios: {
  Button: [{
    name: 'Submit flow',
    args: { label: 'Save' },
    play: async ({ root, step }) => {
      await step('click', () => root.querySelector('button')!.click())
    },
  }],
}
```

**Common mistakes**

- Expecting `play` to serialize into `atlas-catalog.json` — functions never cross the JSON boundary; the catalog records the verdict the play run produced, not the script

**See also:** `atlas scan` · `atlas dev`

---
