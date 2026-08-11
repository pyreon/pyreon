---
title: Atlas
description: The AI-native component workbench — derives, verifies, and serves a machine-readable component catalog from your source.
---

`@pyreon/atlas` is a component workbench that inverts Storybook's model: **you don't author stories — Atlas derives them.** Your components and their TypeScript types are the source of truth. Atlas infers controls from prop types, generates scenarios from variant axes (rocketstyle dimensions included), verifies every scenario with a five-check pipeline, and writes the result as a machine-readable catalog that both humans (the workbench) and AI assistants (the agent guide) consume.

<PackageBadge name="@pyreon/atlas" href="/docs/atlas" />

## Installation

```bash
pyreon add @pyreon/atlas
```

Or run it through the CLI front door with zero setup — `pyreon atlas <cmd>` delegates to the project-local install.

## The four commands

### `atlas scan` — derive + verify the catalog

```bash
pyreon atlas scan .
# atlas: discovered 9 component(s), 43 scenario(s) — 41 verified, 2 failing, 0 unverified.
#   checks: a11y 18/20 ✗ · interaction 43/43 · ssrParity 43/43 · leak 43/43
#   not run: reactivityCoverage, snapshot — browser-only — run `atlas verify-browser`
#   → atlas-catalog.json
#   → atlas-agent-guide.md
# atlas: 2 failing scenario(s):
#   ✗ button--empty
#       a11y: missing accessible name: "label" is empty
```

The **`checks:` line is the one to read**. `41 verified` counts *scenarios*, not checks — a package where `@pyreon/runtime-server` does not resolve can report every scenario verified having run only two of the six. The tally says which ran, which failed, and the `not run:` lines say why the rest did not.

The scan discovers components (static TypeScript scan + rocketstyle runtime detection), derives controls and scenarios, **mounts every scenario** through a real module loader, and runs the node half of the verify pipeline. It writes two artifacts:

- **`atlas-catalog.json`** — every component, control, scenario, and verdict as data.
- **`atlas-agent-guide.md`** — the compact, prescriptive summary an AI assistant reads to know what exists, what's verified, and what's broken.

A failing scenario is a **red exit** — wire `atlas scan` into CI and the catalog gates itself. `--no-mount` keeps the scan purely static (no project code executes).

### `atlas verify` — re-check one component

```bash
pyreon atlas verify Button
# atlas verify Button: 1 component(s), 15 scenario(s)
#   checks: a11y 14/15 ✗ · interaction 15/15 · ssrParity 15/15 · leak 15/15
#
# ✗ button--empty
#     a11y: missing accessible name: "label" is empty
#
# 1 failing · 14 verified · 0 unverified
```

The **write → verify → fix loop**. Discovery still walks the project — a component's file is not known until it does — but mounting, exercising, hydrating and GC-probing run only for the match. On `@pyreon/ui-components` (108 components, 1090 scenarios) that is 1.35s for a full scan against 0.90s scoped to one component's 60; the verify work drops ~18× while discovery dominates the residual, so it is a **focus** tool first and a speed tool second.

Failing scenarios print **uncapped** here, unlike a whole-catalog scan — this is a question about one component, and truncating its answer would defeat the command.

`--json` emits the same report as data, which is what an agent branches on:

```jsonc
{
  "ok": false,
  "component": "Button",
  "verified": 14, "failed": 1, "unverified": 0,
  "tallies": [{ "key": "a11y", "pass": 14, "fail": 1, "skip": 0 }, /* … */],
  "failures": [{
    "id": "button--empty",
    "checks": [{
      "key": "a11y",
      "findings": [{
        "code": "missing-accessible-name",
        "message": "missing accessible name: \"label\" is empty",
        "fix": "Give \"label\" a non-empty value, or an aria-label if the text is genuinely decorative."
      }]
    }]
  }]
}
```

### Findings are structured

Every finding carries three things:

| field | what it is |
|---|---|
| `code` | A **stable** identifier for the class of failure — `hydrate-threw`, `missing-accessible-name`, `reactive-nodes-retained`. This is what you grep, quote in an issue, or branch on. Codes are permanent once shipped: a reworded message is a patch, a renamed code is a breaking change. |
| `message` | What happened, in prose. Free to be reworded. |
| `fix` | The one concrete thing to change — present only when there **is** one. A finding that cannot name a single next step omits it rather than inventing one. |

The `fix` travels **with** the finding rather than living in a lookup table a consumer has to know to consult, so an agent reading the agent guide, the MCP tools, or `--json` gets the actionable half without a second call.

This is catalog **`version: 2`**. A v1 catalog had plain-string findings; reading one with v2 code would render blanks for every finding, so the MCP server refuses it by version and tells you to re-run `atlas scan` rather than showing you a component with no failures.

Three things it deliberately refuses to do:

- **It never writes `atlas-catalog.json`.** A scoped run holds one component; writing it would replace the whole catalog and silently break the agent guide, the MCP tools and `atlas check` for everything else until the next full scan.
- **An unmatched name is a non-zero exit**, with suggestions — filtering to nothing otherwise reports "0 scenarios, 0 failing", which reads as a pass.
- **A run where nothing could be verified is a non-zero exit.** Zero failures is not a pass when zero checks ran.

The first positional is the **component** (matching `atlas check`); the directory is `--cwd`.

### `--check` — the ratchet

Both `atlas scan` and `atlas verify` take `--check`, which compares the run against the **committed** `atlas-catalog.json` instead of rewriting it:

```bash
pyreon atlas scan . --check
# atlas --check: REGRESSED — 2 check(s) started failing
#   ✗ button--empty — now failing: interaction
```

Absolute counts answer *"how is it now"*. They cannot answer *"did I help"*, which is the question anyone iterating actually has — and the only signal an agent can use to decide whether to keep a change or back it out.

**A check that stops running counts as a regression.** This is the case counts structurally cannot catch, because losing coverage makes the numbers *improve*:

```bash
# baseline: 2 failing
pyreon atlas scan . --check --no-mount
# atlas: discovered 1 component(s), 2 scenario(s) — 0 verified, 0 failing, 2 unverified.
#                                                              ^^^^^^^^^ looks fixed
# atlas --check: REGRESSED — 4 check(s) stopped running
#   ✗ button--empty — no longer checked: interaction, leak
#     (coverage lost — the failure did not go away, the check did)
```

Delete a wrapper from `atlas.config.ts` and every mount-dependent check drops to `skip`: the failures vanish, the counts improve, and the catalog looks better than it did. Losing coverage is the one way to "fix" a red catalog that must never read as green.

Three deliberate behaviours:

- **`--check` never writes the catalog.** A ratchet that overwrites its own baseline compares a run against itself and can never report a regression again.
- **A missing baseline is exit 0**, with a note. Making the very first `--check` run red for everybody is how a ratchet gets disabled on day one.
- **A new or removed scenario is not a regression.** Adding a component with a failing edge case is new information, and deleting one is a legitimate edit; flagging either would make the ratchet fire on ordinary refactors until people stopped believing it.

### Path aliases

Atlas reads `resolve.alias` out of your project's **own vite config** — so a component importing through `~/components/…` resolves without any Atlas configuration.

Only `resolve.alias` is taken, never your plugins: Atlas already runs the real `@pyreon/vite-plugin`, and a second copy would compile every component's JSX twice. `resolve.conditions` is deliberately not inherited either — Atlas resolves workspace packages through the `bun` condition on purpose.

If your vite config can't be loaded (it imports a plugin this command doesn't install, or reads env the workbench doesn't set), Atlas says so and you can declare aliases explicitly:

```ts
// atlas.config.ts
export const alias = { '~': './src' }
```

Explicit entries win — Vite matches in order, and these are placed first.

**A component that fails to load no longer takes down the workbench.** Each component is imported individually and non-fatally, so a broken import degrades that component's canvas to an error card naming the real cause (`Cannot find module '~/shared/tokens'`) while every other component still renders.

### `atlas dev` — the workbench

```bash
pyreon atlas dev . --port=5210
```

Real Vite + the real Pyreon compiler over your source. The workbench ships:

- **Sidebar** — the derived catalog, nested by directory, with per-scenario verdict dots (ok / fail / unverified — three states, never smoothed).
- **Controls** — editors inferred from prop types: booleans, strings, selects, numbers, colors.
- **Canvas addons** — viewport presets, backgrounds, zoom, a **measure overlay** (hover any element for its real layout box), and pseudo-state forcing (`:hover` / `:focus` / `:active`).
- **A11y panel** — static checks plus **axe-core on demand**, scoped to the preview, with findings that highlight the offending element on hover.
- **Docs view** — an autodocs page per component: description, live preview, props table, usage, scenarios (each one a link that opens the canvas in exactly that state), and lazy-loaded source.
- **Actions log** — every event handler fired, with arguments.
- **Reactivity Lens** — which signals drive what, live.

Components living in files that import `@pyreon/atlas` are treated as workbench *hosts* and excluded from the nav (matched on import specifiers, never on file content).

### `atlas verify-browser` — the browser half of verification

```bash
pyreon atlas verify-browser .
# atlas verify-browser: 26 scenario(s) — coverage measured on 26, 0 baseline(s) created, 0 visual diff(s).
```

Two of the five checks are claims only a real browser can make. This command boots the workbench headlessly (playwright-core is an **optional** peer — `scan`/`dev` work without it), drives every scenario through the workbench model, and:

- measures **reactive coverage** on the page's own devtools bridge — the same reactivity instance your components run on — reporting how many reactive nodes the scenario created and which never re-fired;
- captures a **visual snapshot** of the preview and compares it against a per-scenario baseline (pixelmatch, tolerance-based). First run creates baselines; later runs fail on real diffs and write an `.actual.png` beside the baseline. `--update-snapshots` re-baselines.

Both verdicts merge back into `atlas-catalog.json`. Baselines are machine-specific (font antialiasing) — keep `atlas-snapshots/` gitignored and let each environment create its own.

## The five-check verify verdict

Every scenario carries a `verify` verdict with three honest states — a check either **passed**, **failed**, or was **skipped** (never counted as verified):

| Check | What it claims | Where it runs |
|---|---|---|
| `a11y` | static accessibility rules (empty labels, missing names) | `atlas scan` |
| `interaction` | mounted + interacted without throwing — your `play` script, or an automatic click-walk | `atlas scan` |
| `leak` | repeated mounts don't accumulate reactive-graph nodes past GC | `atlas scan` (needs a GC hook: `bun`, or `node --expose-gc`) |
| `reactivityCoverage` | reactive nodes measured in real Chromium; findings carry the numbers | `atlas verify-browser` |
| `snapshot` | the preview matches its visual baseline | `atlas verify-browser` |

`ok` means *at least one check ran and none failed*. A scenario with zero checks run reports **unverified** — Atlas never claims what it didn't measure.

## Configuration (`atlas.config.ts`)

Everything is optional — scan and dev work with no config at all. A config adds what derivation can't know:

```ts
// atlas.config.ts — named exports, plain values, no JSX
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
```

- **`theme`** — your design tokens. This is what resolves rocketstyle `variant` / `size` axes: those chains are call expressions the static scanner can't see, so Atlas loads them and reads the dimensions — which requires the theme their callbacks dereference. Without it, rocketstyle components are still discovered but lose their axes.
- **`wrapper`** — the providers your components genuinely need to mount (`PyreonUI`, a `PermissionsProvider`, …). Without it, provider-dependent scenarios honestly **fail** with `threw while mounted` — they are not quietly skipped.
- **`presets`** — per-project viewports, locales (RTL supported), and permission roles for the canvas toolbars. Each family replaces the shipped defaults; omitted families keep them.
- **`scenarios`** — authored scenarios with `play` scripts (below). Authored entries win over generated ones with the same id.

## Play functions — authored interaction scripts

Derivation can't know that clicking a button three times is the state worth verifying. You can:

```ts
export const scenarios = {
  Button: [
    {
      name: 'Triple click',
      args: { label: 'Storm target' },
      play: async ({ root, step }) => {
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
```

The scan runs `play` **instead of** the automatic click-walk; a throw fails the `interaction` check naming the exact step. In the workbench, hand-catalog scenarios with `play` get a ▶ button that runs the script against the live preview, logging each step to Actions. (Derived-catalog play scripts run in the scan — functions can't cross the JSON boundary into the served catalog.)

## The catalog as an AI surface

`atlas-catalog.json` + `atlas-agent-guide.md` are written for machine consumption first: an assistant can read which components exist, what props they take (typed controls with defaults), which states are verified, and which are broken — without parsing your source. That's the core inversion: **the workbench UI and the AI assistant read the same derived, verified data.**

## CI wiring

```yaml
- run: bunx atlas scan .              # red exit on failing scenarios
- run: bunx atlas verify-browser .    # red exit on visual diffs
```

`scan` under `bun` gets the leak check for free (GC hook present). `verify-browser` needs Playwright Chromium in the environment; snapshot baselines should be created per-runner (first run) rather than committed across platforms.

## vs Storybook

| | Storybook | Atlas |
|---|---|---|
| Stories | authored by hand (CSF) | **derived** from types + variant axes; authoring is opt-in enrichment |
| Verification | separate addons/test-runner | five-check verdict built into the scan, three honest states |
| AI surface | none (catalog is your source) | `atlas-catalog.json` + agent guide, first-class |
| Compat | — | Storybook stays a supported *bridge* (`@pyreon/storybook` renderer); Atlas never requires migrating stories |

## Honest limits

- Play in the workbench UI runs for hand catalogs only; derived play scripts verify in the scan.
- `verify-browser` can't drive components defined in workbench-host files — the summary names each one (`notDriven`), never silently skips.
- The leak check skips (never fake-passes) without a GC hook.
- Reactive coverage is a **measurement**, not a threshold gate — the findings carry the numbers; judge them.
