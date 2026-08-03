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
  validate the library. Generation is grounded in real type facts and
  **honestly labeled**: every scenario carries its verify verdict on every
  surface — `[pass]`, `[FAIL]`, or `[unverified]` — so a consumer can never
  mistake an unchecked or failing state for a verified one, and `atlas scan`
  exits non-zero when anything fails.
- **DX** — signal-preserving HMR, a unified surface, and progressive authoring:
  everything is automatic; you enrich only where you want to.

## Layout — one package, cleanly separable layers

| Import path | What it is |
| --- | --- |
| `@pyreon/atlas` | the top-level `createAtlas` pipeline (discover → decorate → verify → graph) |
| `@pyreon/atlas/core` | the framework-agnostic domain model + pure engine (types, control inference, variant matrix, scenarios, the Catalog Graph) |
| `@pyreon/atlas/plugins` | the plugin API + built-in plugins (every capability is a plugin) |
| `@pyreon/atlas/auto` | terse authoring + discovery (`defineComponent` / `components({...})`) |

The `core/`, `plugins/`, and `auto/` folders each have their own import path; the
top-level entry composes them.

## Usage

Declare your components with the terse `components({...})` helper — controls and
variant axes are derived from the shape (a union array becomes a `select` + a
variant axis; a `?` suffix marks a prop optional). That's the whole thing you
write:

```ts
import { createAtlas } from '@pyreon/atlas'
import { components } from '@pyreon/atlas/auto'

const graph = await createAtlas({
  plugins: [
    components({
      Button: {
        props: {
          label: 'string',
          state: ['primary', 'secondary'],
          'disabled?': 'boolean',
        },
        tags: ['form'],
      },
    }),
  ],
}).build()

console.log(graph.toAgentGuide())    // the compact, prescriptive AI-usage asset
console.log(graph.search('button'))  // ranked catalog search
```

That's the entire config: the recommended plugin bundle (variant matrix, states,
edge cases, fill-defaults, a11y, tags, docs) is applied automatically — nothing
else to write. Opt out with `preset: 'none'`; `defineAtlas(config)` gives the
same shape typed for a config file. Need full control over a component's shape?
Drop to a raw `discover()` plugin returning `ComponentIntelligence` (see
`@pyreon/atlas/core`).

## Getting started — `atlas init`

```bash
atlas init          # detects your packages, writes pyreon.config.ts
atlas dev           # the workbench, against your real components
```

`init` reads the workspace declaration you already have (`workspaces` in
`package.json`, or `pnpm-workspace.yaml`), probes each package for components,
and writes the config. It refuses to overwrite an existing one without
`--force` — that file is hand-edited the moment it exists. `--dry-run` prints
it instead.

### Which components are found

Pyreon shapes, verified: `export function C(props: P)`, `export const C = (props: P) => …`, `export const C: ComponentFn<P> = …`, destructured params, `export default` (named or anonymous), `nativeCompat(…)` wrappers, and rocketstyle chains (via the runtime pass — needs `theme` in the config). Scanned in `.tsx`, `.jsx` and `.ts`.

Named gaps, so nobody has to discover them from an empty sidebar:

| Shape | Result |
| --- | --- |
| `import type { Props }` — props typed in another file | found, but **no controls** (needs a cross-file checker) |
| generic prop (`items: T[]`) | found; that prop is `unknown` |
| `'a' \| 'b' \| (string & {})` | found; no select, no variant axis |
| `styled('div')` | **missed** — no props written anywhere a static reader can see; needs runtime discovery, which today only covers rocketstyle |
| member-call wrapper (`ns.wrap(C)`) | **missed** — deliberate: matching member calls swallowed rocketstyle chains |

**It writes no story files, and there is no flag to.** A per-component file
restating props the component already declares is the thing Atlas exists not to
need: it drifts the moment the component changes and nothing tells you.
Components, controls and scenarios are DERIVED from your source.

Even `init` is optional. With no config at all, a monorepo whose root has no
components has its packages detected automatically — and the scan says so,
rather than producing a catalog from nowhere.

### Render extensions — what a scenario needs to render like your app

A single `wrapper` holds one provider. Extensions COMPOSE, so packages can ship
their own and a project can stack them:

```ts
export default defineConfig({
  atlas: {
    extensions: [
      { name: 'theme', wrap: ({ children }) => <PyreonUI theme={theme}>{children}</PyreonUI> },
      { name: 'router', wrap: ({ children }) => <RouterProvider>{children}</RouterProvider> },
      { name: 'fonts', setup: () => document.head.append(fontLink()) },
    ],
  },
})
```

- **`wrap`** layers around every scenario. First listed is OUTERMOST — the order
  the equivalent JSX would be written by hand.
- **`setup`** runs once at boot, for document-level work a wrapper cannot reach
  because it renders *inside* the preview: a font `<link>`, a global stylesheet,
  `<html lang>`. Return a function to undo it.
- Each `setup` is isolated — one that throws is reported BY NAME and the rest
  still run, rather than taking the workbench down before first paint.
- `wrapper` still works and composes as the INNERMOST layer, so a theme can be
  added outside an existing wrapper without touching it.

Extensions run in the BROWSER. They may use JSX and your own components, but not
`node:*` — a factory needing build-time data takes it as a serializable option.

### Configuration lives in `pyreon.config.ts`

One file for the ecosystem, a section per package (see `@pyreon/config`):

```ts
import { defineConfig } from '@pyreon/config'

export default defineConfig({
  atlas: {
    title: 'Acme Design System',
    projects: [{ name: 'Core', dir: 'packages/core/src' }],
  },
})
```

A per-tool `atlas.config.ts` still works and wins where both exist, so a
partly-finished migration never has the general file override the specific one.

## Shipping the docs — `atlas build`

`atlas dev` needs a checkout and a running Node process. A design system needs a
URL. `atlas build` emits one as plain static files:

```bash
atlas build                          # → ./atlas-dist
atlas build --out docs/components    # somewhere else
atlas build --title "Acme DS"        # site name (tab + chrome)
atlas build --base /my-repo/         # GitHub Pages project site
```

Deploy the directory to Pages, Netlify, Cloudflare, S3 — anything that serves
files. There is no server component.

**What makes this more than `vite build`.** The workbench is not purely a client
app: the Docs source block and the Reactivity Lens are answered by Node over the
dev-server RPC channel, because they read files and run the TypeScript compiler
API. A naive build produces a site that *looks* complete while both sit dark
forever. So `atlas build` precomputes those answers per component and ships them
as data — the Lens still shows real per-expression `live` / `static` verdicts on
a fully static page. An answer that genuinely cannot be computed (no
`@pyreon/compiler` installed) bakes its REASON instead, so the panel says what
is wrong rather than reporting a network error about a request that was never
going to work.

### Naming the site and its pages

`atlas.config.ts` carries presentation alongside the wrapper and theme:

```ts
export default {
  title: 'Acme Design System',
  pages: {
    Button: { title: 'Button (CTA)', group: 'Actions', order: 1 },
    Chip:   { summary: 'A compact, removable label.' },
  },
}
```

`pages` is presentation ONLY. A `title` relabels the sidebar entry and the docs
heading; the component's real `name` is untouched, because that is what the
usage snippet writes, what the source/Lens lookup keys on, and what an agent
imports. `order` pins a component to the top of *its own group* — it cannot pull
it into a different one — and everything unordered keeps its discovery order, so
adding one line does not reshuffle a sidebar.

`--title` wins over `title`, and `atlas dev` reads the same config, so the
workbench and the deployed site cannot end up named differently.

### Monorepos — one site, several packages

```ts
export default {
  title: 'Acme Design System',
  projects: [
    { name: 'Core',  dir: 'packages/core/src' },
    { name: 'Admin', dir: 'packages/admin/src' },
  ],
}
```

Every package is scanned into one catalog and filed under its own name, so the
sidebar reads `Core/Forms/Button`. `atlas dev`, `atlas scan` and `atlas build`
all follow it; `--dir` is ignored when `projects` is set.

**Two packages may both export a `Button`.** That is the case this feature is
actually about. A component's *identity* becomes `project/Name`, so both survive
— in the catalog, in the sidebar, and in their scenario ids (`core-button--…`
vs `admin-button--…`, which otherwise collide in `atlas-catalog.json`, in the
verify verdicts, and in the snapshot filenames).

Its `name` is untouched: `Button` is what you import in both packages, and the
machine surface an agent reads must say so.

Where a bare name is now ambiguous, Atlas **refuses and names the candidates**
rather than picking one:

```
[Pyreon] atlas: "Button" matches 2 components across projects
(Core/Button, Admin/Button). Ask for one of those keys.
```

Authored `scenarios` and `pages` accept either form — `'Core/Button'` to target
one package, or a bare `'Button'` when it is unambiguous.

Single-package projects set no `project`, so every derived key, id and group is
byte-identical to before this existed.

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
- **AI assets** — `aiAssetsPlugin` (generates agent-usage assets — see below).
- **Bundle** — `recommendedPlugins()` — the curated "great defaults", correctly
  ordered.

- **Runtime verification** — `mountPlugin` (mounts every scenario and drives it).

The remaining DOM-backed checks (axe a11y, visual regression, reactive-prop
liveness) sit on the same mount harness as they land.

### Verifying at runtime

`atlas scan` mounts each scenario, clicks every interactive element, and
unmounts, so the catalog reports the class no amount of type inference reaches:
*these args crash it*. The claim is deliberately narrow — mounts, survives
interaction, unmounts, without throwing — and covers a throw inside an effect
or an event handler, neither of which propagates to the caller.

Components are loaded through the project's own Vite pipeline, so what gets
mounted is what the project ships. Two consequences worth knowing:

- A component that needs providers (theme, router, i18n) cannot render alone.
  Supply them from `atlas.config.ts`:

  ```ts
  // atlas.config.ts — `wrapper` receives the scenario as `children`
  export function wrapper(props) {
    return h(ThemeProvider, { theme }, props.children)
  }
  ```

- Modules are transformed in SSR mode, so a component arrives via the
  compiler's `h()` lowering rather than the `_tpl()` template path a browser
  build produces. Both mount; they are known to diverge on reactivity lowering.
  So a runtime check here may report what threw, and never claims a reactivity
  verdict — that belongs to `atlas dev`, where a real browser runs the real
  client build.

Pass `mount: false` to keep a scan purely static; importing a project's modules
runs its top-level code.

## Canvas addons — the Storybook set, built in

`<Workbench>` ships the addons a component workbench is actually judged on. In
Storybook these are four separate packages you install and configure; here they
are presets in [`src/ui/addons.ts`](./src/ui/addons.ts), rendered by the
**Canvas** tab, and exported so a host can drive its own toolbar from the same
data.

| Addon | Storybook equivalent | What it does |
| --- | --- | --- |
| **Viewport** | `addon-viewport` | Pins the canvas to a real unistyle breakpoint (375 / 768 / 1280), capped at the stage so a wide preset never overflows |
| **Backgrounds** | `addon-backgrounds` | Theme surface (default), forced light/dark to check contrast against the other mode, plus a transparency checker |
| **Pseudo state** | `addon-pseudo-states` | Forces `hover` / `focus` / `active` / `disabled` |
| **Outline** | `addon-outline` | Outlines every box in the preview subtree (chrome untouched) |
| **Locale** | `addon-toolbars` / RTL addons | Switches locale (`ctx.locale`) and flips the preview to `dir="rtl"` |

**The pseudo-state one is genuinely cheaper on this stack.**
`@storybook/addon-pseudo-states` has to rewrite the emitted stylesheet — rename
`:hover` rules to `.pseudo-hover` classes — because a browser will not let you
force a real pseudo class. rocketstyle already models pseudo state as *data*:
`hover` / `active` / `focus` are reserved props that land in
`$rocketstate.pseudo`, and the bases render the matching theme block whenever
the flag is set. So forcing a state is passing a prop, and what paints is the
component's **real** pseudo CSS — the e2e asserts that the forced style and a
genuine pointer hover produce the same declaration.

To opt a catalog in, spread the forced props onto the component you render:

```tsx
render: (v, ctx) => <Button {...ctx.pseudo} variant={v.variant}>{v.label}</Button>
```

`ctx.pseudo` is `{}` when nothing is forced, so the spread is unconditional. It
is a getter, so reading it inside `render` tracks the signal and the preview
re-renders when the addon changes.

This only works for components that declare hover/focus/active in rocketstyle's
**theme keys** (`hover: { … }`) rather than as raw `&:hover { … }` CSS — which
is the idiomatic form anyway, since the bases render those blocks under the real
selector too.

The Locale addon's real value is the **direction** flip, not the tag: `dir="rtl"`
is what exposes hardcoded `margin-left`, one-sided borders and unmirrored icons.
That half needs no catalog cooperation. To translate as well, read `ctx.locale`
(a BCP-47 tag) — e.g. feed it to `@pyreon/i18n`'s `createI18n({ locale })`.

Everything else is a rocketstyle dimension (`size` for viewport, `variant` for
background, `state` for outline), so the addons add **zero inline styles** and
resolve through the same class cache as the rest of the workbench.

## Styling convention

Chrome components declare styles as **structured unistyle keys**, not raw CSS
strings:

```ts
export const AddonBody = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' })
  .theme(() => ({ flex: '1', overflowY: 'auto', padding: '16px' }))
```

Pseudo-states are `hover` / `focus` / `active` / `disabled` **theme keys** (the
bases render them under the real selector *and* when the Pseudo-state addon
forces the flag) — never `&:hover { … }` inside a string.

Two things to know before touching this:

- **unistyle silently DROPS an unmapped key** (`styles/index.ts` does
  `if (!indices) continue`, and the full-scan fallback only runs when *nothing*
  matched). Check a new key against `propertyMap.ts` before using it.
- **Key-existence is not enough — some keys diverge semantically.**
  `backgroundImage` wraps its value in `url()` (it is for image URLs, so a
  gradient silently becomes invalid) and `animation` is a `keyframe`+`animation`
  combo, not the CSS shorthand. Both stay raw in an `extendCss` residual.

`.attrs({ css })` and `.theme()` are **not** duplicates — they style different
nodes of Element's structure. Removing the `css` blobs changes 405 computed
properties (measured); keep both.

## AI assets — so agents make no mistakes

Atlas generates the assets an AI agent needs to use the whole library correctly
on the first try, token-efficiently (so agents are fast and cheap):

- `graph.toAgentGuide()` — a **prescriptive, compact** guide: exact allowed prop
  values, a known-correct example, and what to avoid, per component.
- `graph.toLlmsText()` — the browsable `llms.txt`-style catalog.
- `graph.toJSON()` — the full typed machine surface (for MCP / structured tools).
- `graph.search(query)` — ranked search across names, tags, props, and scenarios.

`aiAssetsPlugin({ onAsset })` generates all three assets in the graph stage and
hands them to your sink (write a file, feed an MCP server) — persistence stays
out of the pure core. Example `toAgentGuide()` output:

```text
## Button [form]
required: label(text), state(primary|secondary|danger), size(small|medium|large), disabled(bool)
correct: {"state":"primary","size":"small","label":"Text","disabled":false}
avoid: "Empty" — missing accessible name: "label" is empty
```

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
via the compiler), `verify` (the mount harness + interaction check ship; axe
a11y, reactive-prop liveness and snapshot are next), `graph`/`ai` (MCP server +
grounded generation),
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
