# @pyreon/atlas

> **Working name — a rebrand is pending.** Private, not yet published.

An **AI-native component workbench** for the Pyreon ecosystem. Atlas is "in the
category of Storybook" but designed the opposite way: instead of hand-authoring
story files, Atlas treats your **components + their types as the source of
truth** and *derives* a **verified, machine-readable component catalog** — for
humans **and** agents.

The three obsessions are **DX**, **AI**, and **Automation**:

- **Automation** — point Atlas at a package and get a full catalog with **zero
  authored stories**: controls inferred from prop types, a **variant matrix**
  from rocketstyle dimensions, and one derived **scenario** per matrix cell.
- **AI** — the whole catalog is one queryable **Catalog Graph** (typed JSON +
  an `llms.txt`-style surface), so agents can enumerate, render, generate, and
  validate the library. Generation is grounded in real type/reactivity facts
  and **self-validating** — a scenario that doesn't pass verification never
  enters the catalog.
- **DX** — signal-preserving HMR, a unified surface, and progressive authoring:
  everything is automatic; you enrich only where you want to.

## Layout — one package, cleanly separable layers

| Import path | What it is |
| --- | --- |
| `@pyreon/atlas` | the top-level `createAtlas` pipeline (discover → decorate → verify → graph) |
| `@pyreon/atlas/core` | the framework-agnostic domain model + pure engine (types, control inference, variant matrix, scenarios, the Catalog Graph) |
| `@pyreon/atlas/plugins` | the plugin API + built-in plugins (every capability is a plugin) |

The `core/` and `plugins/` folders each have their own import path; the top-level
entry composes them.

## Usage

```ts
import { createAtlas } from '@pyreon/atlas'
import { defineAtlasPlugin, variantMatrixPlugin, a11yPlugin } from '@pyreon/atlas/plugins'
import { inferControls } from '@pyreon/atlas/core'

const atlas = createAtlas({
  plugins: [
    // a discovery plugin contributes components (real discovery lives in the `auto` module)
    defineAtlasPlugin({
      name: 'demo-discovery',
      discover() {
        return [
          {
            name: 'Button',
            controls: inferControls([
              { name: 'label', type: 'string' },
              { name: 'state', type: { union: ['primary', 'secondary'] } },
            ]),
            axes: [{ name: 'state', values: ['primary', 'secondary'] }],
            reactivity: [],
            scenarios: [],
            tags: ['form'],
          },
        ]
      },
    }),
    variantMatrixPlugin(), // derives one scenario per variant-matrix cell
    a11yPlugin(),          // attaches a static a11y verdict to each scenario
  ],
})

const graph = await atlas.build()
console.log(graph.toLlmsText()) // the agent-facing catalog
```

## Built-in plugins

Every capability is a plugin on one contract. The built-in suite is all pure and
metadata-driven (no rendering required):

- **Scenario generation** — `variantMatrixPlugin` (one scenario per dimension
  cross-product), `statesPlugin` (per interactive boolean state), `edgeCasesPlugin`
  (empty + long-content), `themePlugin` (per theme mode), `defaultScenarioPlugin`.
- **Enrichment** — `tagsPlugin` (auto-categorize by name), `fillDefaultsPlugin`
  (fill required props so scenarios render).
- **Verification** — `a11yPlugin` (static missing-accessible-name check).
- **Docs** — `usageDocsPlugin` (per-component usage summary).
- **Bundle** — `recommendedPlugins()` — the curated "great defaults", correctly
  ordered.

DOM-backed plugins (axe a11y, visual-regression, reactivity-coverage) join the
suite with the runtime/verify layer.

## Try it

```sh
bun run --filter='@pyreon/atlas' demo
```

The demo describes three components (Button, TextInput, Badge) and derives a
**verified catalog with ZERO authored stories** — including the verify pipeline
correctly **flagging** the deliberately-empty edge cases:

```text
## Button
Button — 12 scenario(s), 11 passing. Props: label, state, size, disabled.
tags: form
scenarios (12):
  - state=primary · size=small [auto-variant] [pass]
  - …
  - Empty [auto-variant] [FAIL]
  - Long content [auto-variant] [pass]
…
Atlas derived 3 components and 22 verified scenarios (3 flagged) — from ZERO authored stories.

Flagged by the verify pipeline:
  • Button / "Empty": missing accessible name: "label" is empty
```

## Writing a plugin

Every Atlas capability is a plugin on one contract, contributing to one or more
of the four pipeline stages:

```ts
import { defineAtlasPlugin } from '@pyreon/atlas/plugins'

export const myPlugin = defineAtlasPlugin({
  name: 'my-plugin',
  discover(ctx) { /* contribute components */ return [] },
  decorate(ci) { /* enrich a component (scenarios, controls, tags) */ return ci },
  verify(ctx) { /* return the checks this plugin owns */ return {} },
  graph(ctx) { /* run once over the whole assembled graph */ },
})
```

## Roadmap (this package is the foundation)

Shipped: `core` (domain model + engine) and `plugins` (API + built-ins). Next
layers build on top: `auto` (real component discovery + type→control extraction
via the compiler), `verify` (the real `@pyreon/testing` + a11y + reactivity-
coverage + snapshot pipeline), `graph`/`ai` (MCP server + grounded generation),
`server` (dev server on `@pyreon/zero`), `ui` (the workbench), and `compat`
(Storybook interop).

**Pyreon-stack only.** The `ui` and `server` layers are built exclusively on the
Pyreon stack — `@pyreon/zero` plus the **public** ui-system packages
(`@pyreon/rocketstyle` / `styler` / `unistyle` / `elements` / `attrs`) over
`@pyreon/core` / `runtime-dom`. Atlas does **not** depend on the private
`@pyreon/ui-components` library; it defines its own components on the ui-system
primitives.

## License

MIT
