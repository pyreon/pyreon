import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/atlas',
  title: 'Component Workbench',
  tagline:
    'AI-native component workbench — derives, verifies, and serves a machine-readable component catalog',
  description:
    'Atlas inverts Storybook’s authoring-first model: your components and their TypeScript types are the source of truth, and Atlas DERIVES the catalog — controls inferred from props, scenarios generated from variant axes (rocketstyle dimensions included), and a five-check verify verdict per scenario (a11y, interaction, leak, reactivity coverage, snapshot). `atlas scan` writes `atlas-catalog.json` + `atlas-agent-guide.md` (the machine-readable surface an AI assistant consumes), `atlas dev` serves a zero-config workbench over the real Vite compiler, and `atlas verify-browser` runs the browser half of verification in real Chromium. Authoring is opt-in, not required: an `atlas.config.ts` can add a theme, a wrapper, presets (viewports / locales / roles), and authored scenarios with `play` interaction scripts.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'the component workbench — dev tooling that runs in a browser, not app runtime',
  },
  features: [
    'Derived catalog: controls inferred from prop types, scenarios generated from variant axes (rocketstyle dimensions resolved through the project theme)',
    'Five-check verify verdict per scenario — a11y, interaction (play scripts or auto click-walk), REAL leak check (reactive-graph accumulation past GC), reactivity coverage, visual snapshot',
    'Machine-readable output: atlas-catalog.json + atlas-agent-guide.md, written for AI assistants as first-class consumers',
    'Zero-config workbench (`atlas dev`): real Vite + the real Pyreon compiler, live control editors, canvas addons (viewport/background/zoom/measure/pseudo-states), axe-core a11y panel, autodocs, Actions log, Reactivity Lens',
    'Browser verification (`atlas verify-browser`): reactive coverage measured on the page’s own devtools bridge + pixelmatch snapshot baselines, merged into the catalog',
    'Authoring opt-in via atlas.config.ts: theme, wrapper, presets (viewports/locales/roles), authored scenarios with step-labelled `play` functions',
    'Honest verdicts by construction: three states (verified/failing/unverified), red scan = red exit, partial browser coverage named per scenario',
  ],
  longExample: `// atlas.config.ts — ALL of this is optional; scan/dev work with none of it.
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

// A project can also export \`theme\` (resolves rocketstyle dimension axes)
// and \`wrapper\` (the providers your components genuinely need to mount).

// Then:
//   bunx atlas scan .            → atlas-catalog.json + atlas-agent-guide.md
//   bunx atlas dev .             → the workbench at localhost:5210
//   bunx atlas verify-browser .  → coverage + snapshot verdicts in Chromium`,

  api: [
    {
      name: 'atlas scan',
      kind: 'function',
      signature: 'atlas scan [dir] [--no-mount]',
      summary:
        'Discover components (static TS scan + rocketstyle runtime detection), derive controls and variant scenarios, MOUNT each scenario (real module load through a Vite-powered loader) and run the node half of the verify pipeline — a11y (static), interaction (mount + play/click-walk), and a REAL leak check (reactive-graph accumulation across repeated mounts, past GC). Writes `atlas-catalog.json` (every component, control, scenario, and verdict) and `atlas-agent-guide.md` (the AI-consumable summary). Exits non-zero when any scenario FAILS — wiring the scan into CI gates the catalog. `--no-mount` keeps the scan purely static (no project code executes).',
      example: `$ atlas scan .
atlas: discovered 9 component(s), 43 scenario(s) — 41 verified, 2 failing, 0 unverified.
  → atlas-catalog.json
  → atlas-agent-guide.md
atlas: 2 failing scenario(s): button--empty, badge--empty`,
      mistakes: [
        'Treating "verified" as a default — a scenario is verified only when a check actually RAN and passed; `checked: 0` renders as unverified, never smoothed into a pass',
        'Running the scan without the project theme in `atlas.config.ts` for rocketstyle components — dimension axes resolve empty and the variant scenarios collapse to defaults',
        'Expecting the leak check under plain `node` — it needs a GC hook (`bun`, or `node --expose-gc`); without one it reports skip, not pass',
        'Expecting reactivityCoverage/snapshot verdicts from the scan — those are browser-only claims; run `atlas verify-browser` to earn them',
      ],
      seeAlso: ['atlas verify-browser', 'createAtlas'],
    },
    {
      name: 'atlas dev',
      kind: 'function',
      signature: 'atlas dev [dir] [--port=5210]',
      summary:
        'Boot the workbench: real Vite + the real Pyreon compiler over your source, a derived catalog in the sidebar (nested by directory), live controls (bool/string/number/color editors), canvas addons (viewport / background / zoom / measure overlay / pseudo-state force), an A11y panel with on-demand axe-core, autodocs pages, an Actions log, and the Reactivity Lens. Components in files that import `@pyreon/atlas` are treated as workbench HOSTS and excluded from the nav (import-specifier match, never substrings).',
      example: `$ atlas dev . --port=5210
atlas dev: 9 component(s) → http://localhost:5210/`,
      mistakes: [
        'Expecting authored `play` functions to run on DERIVED catalogs in the workbench — play crosses no JSON boundary; the ▶ button appears for hand catalogs, and derived play scripts run in `atlas scan` / the verify pipeline',
        'Styling per-instance frames with inline styles — the workbench styles through the Element `css` prop channel (hashed classes); custom viewport widths ship zero inline styles',
      ],
      seeAlso: ['atlas scan'],
    },
    {
      name: 'atlas build',
      kind: 'function',
      signature: 'atlas build [dir] [--out <dir>] [--title <text>] [--base <path>]',
      summary:
        'Compile the workbench into a STATIC, deployable site — the same derived catalog `atlas dev` serves, as plain files for Pages / Netlify / Cloudflare / S3, with no server component. Crucially it BAKES the two node-answered panels: the Docs source block and the Reactivity Lens read files and run the TypeScript compiler API, neither of which can run in a page, so the build precomputes them per component and ships the answers as data — the Lens still reports real per-expression live/static verdicts on a fully static page. An answer that genuinely cannot be computed bakes its REASON, so the panel says what is wrong instead of surfacing a network error about a request that was never going to work. `--out` defaults to `atlas-dist` and a RELATIVE `--out` resolves against the scanned project, not your shell — `atlas build packages/ui --out site` writes `packages/ui/site`, the same base Vite uses for `outDir` and the same place `atlas scan` writes its catalog. Pass an absolute path when you want it elsewhere; the resolved directory is always printed. `--base` is for a subdirectory deploy (`--base /my-repo/` for a GitHub Pages project site); `--title` wins over `atlas.config.ts`’s `title`. Fails loudly when discovery finds nothing rather than deploying an empty site.',
      example: `$ atlas build . --out docs/components --title "Acme DS"
atlas build: 9 component(s) → /repo/docs/components
  title: Acme DS`,
      mistakes: [
        'Assuming a plain `vite build` of the workbench is equivalent — it produces a site that LOOKS complete while the Docs source block and the Reactivity Lens are permanently dark, because nothing baked their node-only answers',
        'Deploying to a subdirectory without `--base` — assets are requested from the domain root and every one 404s, leaving a blank page with no error on the page itself',
        'Expecting `pages.<name>.title` to rename the component — it is a DISPLAY label only; the usage snippet, the source/Lens lookup and an agent’s import all use the real `name`, which is exactly why the two are separate fields',
        'Expecting `pages.<name>.order` to sort across groups — it pins a component within its OWN group; a cross-group sort would scramble the tree from a single config line',
        'Expecting `--dir` to apply when `atlas.config.ts` declares `projects` — the declared roots win, because a monorepo that listed its packages meant it and silently scanning `src` instead would emit an empty site',
      ],
      seeAlso: ['atlas dev', 'atlas scan'],
    },
    {
      name: 'atlas verify-browser',
      kind: 'function',
      signature: 'atlas verify-browser [dir] [--update-snapshots]',
      summary:
        'The browser half of verification, in real Chromium (playwright-core is an OPTIONAL peer — scan/dev work without it). Boots the workbench, drives every derived scenario through the workbench model, measures reactive coverage on the page’s own devtools bridge (the components’ actual reactivity instance — a NEW-NODE diff so workbench chrome never pollutes the numbers), screenshots the preview against per-scenario pixelmatch baselines under `atlas-snapshots/`, and merges both verdicts back into `atlas-catalog.json`. Coverage is a MEASUREMENT, not a threshold gate: pass means measured, and the findings carry the numbers. First run creates baselines (flagged as recorded-not-yet-compared); later runs compare within tolerance and write `<id>.actual.png` on a diff. Exits non-zero on visual diffs.',
      example: `$ atlas verify-browser .
atlas verify-browser: 26 scenario(s) — coverage measured on 26, 0 baseline(s) created, 0 visual diff(s).
  → atlas-catalog.json`,
      mistakes: [
        'Committing `atlas-snapshots/` across machines — baselines are machine-specific (font antialiasing); gitignore them and let each environment create its own on first run',
        'Reading "100% of 0 reactive nodes" as broken — a genuinely static scenario creates no reactive nodes and the finding says so explicitly',
        'Treating not-drivable scenarios as failures — components living in workbench-host files can’t be driven through the dev nav; the summary names them and their browser verdicts stay skip',
      ],
      seeAlso: ['atlas scan'],
    },
    {
      name: 'createAtlas',
      kind: 'function',
      signature: '(options?: { plugins?: AtlasPlugin[]; preset?: "recommended" | "none" }) => Atlas',
      summary:
        'The programmatic pipeline factory behind the CLI: `discover → decorate → verify → graph`, plugin-driven. The recommended preset bundles the built-in plugins (controls inference, variant matrix, mount/interaction/leak verification). Pass `preset: "none"` when you assemble the plugin list yourself — appending the recommended bundle on top of an explicit list runs duplicate plugins whose default verdicts can overwrite real ones.',
      example: `import { createAtlas } from '@pyreon/atlas'

const atlas = createAtlas()            // recommended preset
const graph = await atlas.build()      // discover → decorate → verify → graph
graph.search('button')                 // Catalog Graph queries`,
      mistakes: [
        'Passing an explicit plugin list WITHOUT `preset: "none"` — the recommended bundle is appended a second time and a duplicate mount plugin’s empty-graph default verdict can overwrite the real one',
      ],
      seeAlso: ['atlas scan'],
    },
    {
      name: 'AtlasConfig.projects (monorepo — one site, several packages)',
      kind: 'type',
      signature: 'projects?: { name: string; dir: string }[]',
      summary:
        'Scan several packages into ONE catalog, each filed under its own `name` (the sidebar reads `Core/Forms/Button`). `atlas dev`, `atlas scan` and `atlas build` all follow it, and `--dir` is ignored when it is set. The case it exists for: two packages may both export a `Button`. A component’s IDENTITY becomes `project/Name` (`componentKey`), so both survive — in the catalog, in the sidebar, and in their scenario ids (`core-button--…` vs `admin-button--…`, which otherwise collide in atlas-catalog.json, in the verify verdicts, and in the snapshot filenames). Its `name` is untouched, because `Button` is what you import in both packages and the machine surface an agent reads must say so. Where a bare name becomes ambiguous, Atlas REFUSES and names the candidates rather than picking one. `pages` and authored `scenarios` accept either form — `\'Core/Button\'` targets one package, a bare `\'Button\'` applies wherever it is unambiguous (and to BOTH when it is not). A single-package project sets no `project`, so every derived key, id and group is byte-identical to a scan without this.',
      example: `export default {
  title: 'Acme Design System',
  projects: [
    { name: 'Core', dir: 'packages/core/src' },
    { name: 'Admin', dir: 'packages/admin/src' },
  ],
  pages: { 'Admin/Button': { title: 'Button (admin shell)' } },
}`,
      mistakes: [
        'Expecting `graph.get("Button")` to return something in a workspace where two packages export one — an ambiguous bare name resolves to `undefined` ON PURPOSE; ask for `Core/Button`. Returning the first match is how the original silent-collapse stayed invisible',
        'Giving two projects the same `name` — their components would key identically, reintroducing the exact collapse `project` prevents (rejected at config load)',
        'Putting a `/` in a project `name` — it is the key separator, so the resulting `A/B/Name` is ambiguous to read and nests a group level the author did not mean (rejected at config load)',
        'Keying `pages` or `scenarios` by a bare shared name and expecting it to hit one package — it applies to EVERY component with that name; use the `project/Name` form to target one',
        'Assuming `--dir` still narrows the scan — declared `projects` replace it entirely',
      ],
      seeAlso: ['atlas build', 'atlas dev'],
    },
    {
      name: 'AtlasConfig.scenarios (authored scenarios + play)',
      kind: 'function',
      signature: 'Record<string, { name: string; args?: Record<string, unknown>; play?: PlayFn }[]>',
      summary:
        'Authored scenarios in `atlas.config.ts`, keyed by component name. Authored entries are prepended and WIN over generated scenarios with the same id. A `play` function receives `{ root, step }` — `root` is the mounted scenario’s container, `step(name, run)` labels each phase; a throw fails the interaction check naming the exact step. Validated at load: unknown fields error with the correct field name.',
      example: `scenarios: {
  Button: [{
    name: 'Submit flow',
    args: { label: 'Save' },
    play: async ({ root, step }) => {
      await step('click', () => root.querySelector('button')!.click())
    },
  }],
}`,
      mistakes: [
        'Expecting `play` to serialize into `atlas-catalog.json` — functions never cross the JSON boundary; the catalog records the verdict the play run produced, not the script',
      ],
      seeAlso: ['atlas scan', 'atlas dev'],
    },
  ],
})
