/**
 * Extra-section kinds beyond `packages` / `steps` / `stats` (model.ts), and
 * the typed versions of the `extraSectionsHtml` of the visual-and-tools
 * product files (atlas, lathe, tooling, ai, migrate).
 *
 * Same contract as `extra-sections.ts`: the JSON's `extraSectionsHtml` is
 * reference only and never injected; this file is its typed copy, kept
 * outside the synced JSON so a re-sync never drops it. `extra-sections.test.ts`
 * fails when a re-synced file's HTML no longer contains the text here, so a
 * content correction cannot silently leave this copy stale.
 *
 * Inline code is written with backticks (the kit's `renderInline` grammar).
 */
export type ExtraSectionMore =
  | {
      /** Real terminal output in a card: `command` is the card label, `output` the text the tool printed. */
      kind: 'terminal'
      label: string
      title: string
      text?: string
      command: string
      output: string
    }
  | {
      /** Tool cards: a mono name, a heading, a sentence and a command line. The first may be `hot`. */
      kind: 'tools'
      label: string
      title: string
      text?: string
      items: { name: string; title: string; text: string; cmd: string; prompt?: boolean; hot?: boolean }[]
    }
  | {
      /** A plain data table; column 0 is monospace. Stacks to cards below 700px. */
      kind: 'table'
      label: string
      title: string
      text?: string
      columns: string[]
      rows: string[][]
    }
  | {
      /** Named groups of chips (the API section's look). */
      kind: 'chips'
      label: string
      title: string
      text?: string
      groups: { name: string; items: string[] }[]
    }
  | {
      /** Package cards in rows, each row with its own column count; an item may be `hot`. */
      kind: 'packageRows'
      label: string
      title: string
      text?: string
      rows: { cols: 1 | 2 | 3; items: { pkg: string; role: string; text: string; hot?: boolean }[] }[]
    }

export const EXTRA_SECTIONS_MORE: Readonly<Record<string, readonly ExtraSectionMore[]>> = {
  atlas: [
    {
      kind: 'terminal',
      label: 'real output',
      title: 'What a scan says, word for word.',
      text: 'The `examples/atlas-workshop` app in the repo: 11 components, no story files, one authored play script. Run under bun, so the leak check runs too.',
      command: '$ atlas scan .',
      output: `$ atlas scan .
atlas: discovered 11 component(s), 44 scenario(s) — 42 verified, 2 failing, 0 unverified.
  checks: a11y 12/14 ✗ · interaction 44/44 · ssrParity 44/44 · leak 44/44
  not run: reactivityCoverage, snapshot — browser-only — run \`atlas verify-browser\` to measure this (a Node scan cannot)
  → atlas-catalog.json
  → atlas-agent-guide.md
atlas: 2 file(s) import a module supplied by a build plugin Atlas does not run (virtual:zero/routes) — typically app entry points.
  Nothing to fix: the import is correct. Atlas cannot load these files, so a component
  defined in one of them would be absent — move it to its own file if you want it catalogued.
atlas: 2 failing scenario(s):
  ✗ button--empty
      a11y [missing-accessible-name]: missing accessible name: "label" is empty
        → Give "label" a non-empty value, or an aria-label if the text is genuinely decorative.
  ✗ badge--empty
      a11y [missing-accessible-name]: missing accessible name: "label" is empty
        → Give "label" a non-empty value, or an aria-label if the text is genuinely decorative.
  Run \`atlas verify <Component>\` to re-check one component on its own.
$ echo $?
1`,
    },
    {
      kind: 'packageRows',
      label: 'already on storybook?',
      title: 'Keep it. Pyreon renders there too.',
      rows: [
        {
          cols: 1,
          items: [
            {
              pkg: '@pyreon/storybook',
              role: 'framework',
              text: "Set `framework: '@pyreon/storybook'` and your Pyreon components render in Storybook with `Meta`, `StoryObj`, args, decorators and play functions. Atlas never asks you to migrate stories; run both and move when you want to.",
            },
          ],
        },
      ],
    },
  ],
  lathe: [
    {
      kind: 'terminal',
      label: 'real output',
      title: 'Delete one enum value from the spec. Here is what CI sees.',
      text: "The repo's `examples/lathe-bookshelf`, with `lost` removed from `Book.status` and the client not regenerated. Every line below is what the command printed.",
      command: '$ lathe check',
      output: `$ lathe check
lathe / Bookshelf 1.2.0
  4 models  4 operations  target=multiplatform
  plugins: schemas, client, queries, mocks, faker, atlas, docs (+components - required by them)

  (25 unchanged files, one "·" line each, omitted)
  ~ src/gen/schemas/Book.ts
  ~ src/gen/faker.ts
  ~ src/gen/docs/models.md
  ~ src/gen/api-surface.json

  0 of 29 file(s) written

  contract  1 breaking  0 additive
    ! [field-type-changed] Book.status enum("available"|"borrowed"|"lost") → enum("available"|"borrowed")

  native reach  3/4 operations
    web-only 1 op(s): createBook
      \`POST\` lowers through mutations, which PMTC does not yet recognise; GET operations on this client DO reach native.

  lowers authors.native.tsx swift  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  lowers authors.native.tsx kotlin  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  lowers books.native.tsx swift  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  lowers books.native.tsx kotlin  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  all modules together swift  compiled
  all modules together kotlin  compiled

  STALE: 4 generated file(s) differ from the spec:
    schemas/Book.ts
    faker.ts
    docs/models.md
    api-surface.json

  Fix: run \`lathe generate\` and commit the result.
$ echo $?
1`,
    },
  ],
  tooling: [
    {
      kind: 'tools',
      label: 'the toolbox',
      title: "Every tool, and when you'd reach for it.",
      items: [
        {
          name: 'pyreon doctor',
          title: 'Project health in one command',
          text: 'Gates run in parallel and isolate failures. One 0–100 score with a letter grade, a bar per category, and a fix under each finding.',
          cmd: 'pyreon doctor --ci --gha',
          prompt: true,
          hot: true,
        },
        {
          name: 'pyreon check',
          title: 'The pre-commit scan',
          text: 'Runs the compiler\'s detectors over the files you changed since HEAD, prints each finding with its fix, and exits 1 if anything is left.',
          cmd: 'pyreon check',
          prompt: true,
        },
        {
          name: '@pyreon/lint',
          title: '140 rules that know the framework',
          text: 'Five presets, two `readable` layers, a config file with a JSON schema, watch mode, `--why-off` to explain a disabled rule, and an LSP server for your editor.',
          cmd: 'pyreon lint --watch',
          prompt: true,
        },
        {
          name: '@pyreon/testing',
          title: 'Testing Library, plus the reactive graph',
          text: 'render, screen, fireEvent and every query as you know them, plus matchers for fire counts, effect re-runs and leaks.',
          cmd: 'expectSignal · expectEffect · expectNoReactiveLeak',
        },
        {
          name: '@pyreon/devtools',
          title: 'See the reactive graph',
          text: 'A Chrome DevTools panel with six tabs. Click a component to highlight it on the page. Built from the repo and loaded unpacked.',
          cmd: 'Components · Graph · Signals · Effects · Profiler · Console',
        },
        {
          name: 'Ctrl+Shift+R',
          title: 'An overlay in every dev build',
          text: 'Built into the runtime, tree-shaken from production: orphan signals, the latest updates with their cause chain, and Pick to inspect bound text.',
          cmd: '$p.reactivity() · $p.pick()',
        },
        {
          name: 'pyreon info · upgrade',
          title: 'Keep versions in line',
          text: 'info lists every installed @pyreon/* version and flags skew. upgrade aligns them to one version, as a dry run until you pass --write.',
          cmd: 'pyreon upgrade --write',
          prompt: true,
        },
        {
          name: 'pyreon add · new',
          title: 'Start and grow a project',
          text: 'new scaffolds a web app, or iOS and Android too with --native (experimental). add installs a package and prints how to wire it in.',
          cmd: 'pyreon add @pyreon/form',
          prompt: true,
        },
      ],
    },
    {
      kind: 'table',
      label: 'doctor gates',
      title: 'What doctor checks.',
      text: 'Gates that audit the Pyreon repo itself skip in your app and say why. They never count against your score.',
      columns: ['gate', 'category', 'catches'],
      rows: [
        ['react-patterns', 'correctness', 'React habits: useState, useEffect, className, React imports'],
        ['pyreon-patterns', 'correctness', 'For without by, destructured props, a signal written as a call'],
        ['lint', 'per rule', 'Every configured @pyreon/lint rule'],
        ['islands-audit', 'architecture', 'Duplicate, dead, nested or unregistered islands'],
        ['ssg-audit', 'architecture', '404 placement, dynamic routes without getStaticPaths, non-literal revalidate'],
        ['content-audit', 'architecture', 'Missing titles, broken internal links, orphaned pages'],
        ['native-audit', 'architecture', 'Web-only imports and declarations the native build drops, in files that import @pyreon/primitives (needs @pyreon/native-compiler)'],
        ['check-dedup', 'architecture', 'Two versions of one @pyreon/* package in the lockfile'],
        ['dependency-fabric', 'architecture', 'Phantom deps, version drift, cycles (runs when @pyreon/loom is installed)'],
        ['audit-tests', 'testing', 'Tests that build fake vnodes instead of rendering through h()'],
        ['distribution', 'architecture', 'Package hygiene for libraries laid out like the Pyreon repo'],
        ['doc-claims', 'documentation', 'Numbers in the Pyreon docs that disagree with the source (Pyreon repo only)'],
        ['audit-leak-classes', 'best practices', 'Memory-leak heuristics; advisory, never graded (Pyreon repo only)'],
        ['audit-types', 'architecture', 'Typed but never-read public fields (--full, Pyreon repo only)'],
        ['bundle-budgets', 'performance', 'Gzipped entry size against locked budgets (--full, Pyreon repo only)'],
      ],
    },
  ],
  ai: [
    {
      kind: 'chips',
      label: 'all 24 tools',
      title: 'Six jobs your assistant can now do properly.',
      groups: [
        { name: 'discover', items: ['mcp_overview', 'get_api', 'get_pattern', 'get_anti_patterns', 'get_changelog'] },
        { name: 'check code', items: ['validate', 'explain_reactivity', 'diagnose', 'explain_error'] },
        { name: 'rewrite code', items: ['migrate_react', 'migrate_pyreon'] },
        { name: 'read your project', items: ['get_routes', 'get_components', 'get_content_collection', 'get_content_entry', 'get_dependency_fabric'] },
        { name: 'audit', items: ['audit_test_environment', 'audit_islands', 'get_browser_smoke_status'] },
        { name: 'components and APIs', items: ['get_atlas_catalog', 'get_atlas_component', 'get_api_client', 'get_api_operation', 'explain_api_diff'] },
      ],
    },
    {
      kind: 'packageRows',
      label: 'beyond the server',
      title: 'Built for machines to read.',
      rows: [
        {
          cols: 3,
          items: [
            { pkg: 'Reactivity Lens', role: 'in your editor', text: 'Inlay hints from `pyreon-lint --lsp`: `live` where an expression updates, `static` where it was read once. Footguns arrive as warnings.' },
            { pkg: 'pyreon check', role: 'before you commit', text: "The compiler's React-habit and Pyreon-misuse detectors, over the files you changed. Prints each fix, exits 1 on any finding." },
            { pkg: 'llms.txt', role: 'for any model', text: '`llms.txt` and `llms-full.txt` are generated from every package manifest, and the docs build publishes both at the site root.' },
            { pkg: 'create-zero --ai', role: 'at scaffold time', text: '`--ai mcp,claude,cursor,copilot,agents` writes `.mcp.json`, `CLAUDE.md`, Cursor rules, Copilot instructions or `AGENTS.md`.' },
            { pkg: 'pyreon context', role: 'a project snapshot', text: 'Writes `.pyreon/context.json`: components with their props and signal names, routes and islands.' },
            { pkg: 'your own llms.txt', role: 'for your docs', text: '`@pyreon/zero-content` emits `dist/llms.txt` for your site when you set `seo.llms`.' },
          ],
        },
      ],
    },
  ],
  migrate: [
    {
      kind: 'packageRows',
      label: 'the layers',
      title: 'Five frameworks, one engine.',
      rows: [
        {
          cols: 3,
          items: [
            { pkg: '@pyreon/react-compat', role: 'React', text: '41 exports: hooks including use, useActionState and useOptimistic, plus Suspense, lazy, memo, portals; createRoot from /dom. Class components are stubs.' },
            { pkg: '@pyreon/preact-compat', role: 'Preact', text: 'The root, /hooks and /signals entry points. Class components get componentDidMount, componentDidUpdate and componentWillUnmount.' },
            { pkg: '@pyreon/vue-compat', role: 'Vue', text: 'The Composition API: ref, reactive, computed, watch, lifecycle, provide/inject, Teleport, KeepAlive, Transition. No .vue compiler.' },
            { pkg: '@pyreon/solid-compat', role: 'Solid', text: 'Signals, stores, resources and For, Show, Switch, Index, Dynamic. Updates are per component, not per node.' },
            { pkg: '@pyreon/svelte-compat', role: 'Svelte', text: 'svelte/store, onMount, onDestroy, tick, context and createEventDispatcher. Not a .svelte compiler.' },
          ],
        },
        {
          cols: 3,
          items: [
            { pkg: '@pyreon/cli · pyreon check', role: 'The checklist', text: 'Lists the React patterns left in each file, with the line and the Pyreon replacement. Exits non-zero, so it gates CI.', hot: true },
            { pkg: '@pyreon/mcp · migrate_react', role: 'First-pass codemod', text: 'Rewrites React imports, hook declarations and JSX attributes. Setter calls and reads of the old state you finish by hand; TypeScript flags the dangling setters.' },
            { pkg: 'pyreon.dev/docs', role: 'Guides', text: 'Step by step from React, Vue, Solid, Svelte and Angular, and from React Native to the experimental iOS and Android targets.' },
          ],
        },
      ],
    },
  ],
}
