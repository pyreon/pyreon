import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/config',
  title: 'Ecosystem Config',
  tagline: 'One `pyreon.config.ts` for the whole ecosystem — a typed section per package',
  description:
    'Every Pyreon tool grew its own config file — `atlas.config.ts`, `.pyreonlintrc.json`, a `zero()` call in `vite.config.ts`, a `loom` key in package.json. Each is defensible alone; together they are four places to look and four things to keep in sync when a project moves a directory. `@pyreon/config` is the single file with a key per package: `defineConfig` gives it types and editor completion, `CONFIG_FILENAMES` is the filename list every loader tries, and `sectionFrom` is the one named-vs-default section lookup they share. The tool that reads a key owns its meaning, so nothing becomes a god object — and a key appears in the type ONLY once a package actually reads it, because a config surface that advertises options nothing consumes is the typed-but-unimplemented class this repo gates against.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'build-time config shape read by the tooling that assembles an app — never part of a rendered app on any target',
  },
  features: [
    'ONE file, a key per package: `atlas` (the component workbench) and `loom` (the dependency observatory) today, each added in the change that made its reader real',
    'Per-tool files still WIN: `atlas.config.*` beats this file\'s `atlas` key, and the root `package.json`\'s `loom` key beats its `loom` key — a project mid-migration is never silently overridden by the general file',
    'Unknown keys are CARRIED, never rejected: a project may configure a tool this version does not know about (a newer package, a plugin) without losing type safety on the rest',
    '`CONFIG_FILENAMES` + `sectionFrom` are the shared loader primitives — atlas and loom both consume them, so "which filenames" and "how to pull a section out" have exactly one definition and cannot drift into a silently-ignored config',
    'Types only — zero runtime dependencies, nothing to bundle into an app',
  ],
  longExample: `// pyreon.config.ts
import { defineConfig } from '@pyreon/config'

export default defineConfig({
  atlas: {
    title: 'Acme Design System',
    projects: [{ name: 'Core', dir: 'packages/core/src' }],
  },
  loom: {
    // Package-relative globs that are NOT shipping source.
    devPaths: ['src/manifest.ts', '**/*.gen.ts'],
    // \`reason\` is mandatory and is shown in the report.
    ignore: [{ dep: 'sharp', code: 'unused-dep', reason: 'loaded by the image plugin at runtime' }],
    strict: true,
    // Adopt incrementally: raise a code once clean, lower one while it burns down.
    severity: { 'unused-dep': 'info', 'phantom-dep': 'error' },
  },
})`,
  api: [
    {
      name: 'defineConfig',
      kind: 'function',
      signature: 'defineConfig(config: PyreonConfig): PyreonConfig',
      summary:
        'Identity helper that gives a config file types and editor completion without the author writing `satisfies PyreonConfig` by hand — the same reason every config-driven tool ships one. Returns its argument untouched; there is no validation here, because the tool that READS a section is the one that can say what is wrong with it, and it reports that with the file named. `PyreonConfig` is indexed as well as keyed, so a section for a tool this version does not know about typechecks and is carried through.',
      example: `import { defineConfig } from '@pyreon/config'

export default defineConfig({
  loom: { devPaths: ['src/manifest.ts'] },
})`,
      mistakes: [
        'Expecting `defineConfig` to validate — it is identity by design; each tool validates its own section and names the offending file, because only that tool knows what its keys mean',
        'Assuming a key here overrides the per-tool file — it is the other way round: `atlas.config.*` wins over the `atlas` key, and `package.json`\'s `loom` key wins over the `loom` section, so a half-finished migration is never silently reversed',
        'Adding a key for a tool that does not read it yet and expecting it to take effect — the type carries unknown keys deliberately, but carrying is not consuming',
        'Writing the file as `pyreon.config.ts` in a project whose tooling runs on a Node older than 23.6 — `loom scan` has no bundler, so use `pyreon.config.mjs` (or the package.json key) there; the loader names the file and says so rather than skipping it',
      ],
      seeAlso: ['CONFIG_FILENAMES', 'sectionFrom'],
    },
    {
      name: 'CONFIG_FILENAMES',
      kind: 'constant',
      signature:
        "CONFIG_FILENAMES: readonly ['pyreon.config.ts', 'pyreon.config.tsx', 'pyreon.config.mjs', 'pyreon.config.js']",
      summary:
        'The filenames a loader tries, in order. Exported so every consumer shares ONE list: atlas and loom both read it, so adding an extension here reaches both at once. The alternative — each loader restating the list — is a config file that is silently ignored the day the lists disagree, which is the exact failure this package exists to reduce.',
      example: `import { CONFIG_FILENAMES } from '@pyreon/config'

const found = CONFIG_FILENAMES.map((n) => resolve(cwd, n)).find(existsSync)`,
      mistakes: [
        'Restating the list in your own loader — that is the drift this export removes; iterate the constant (atlas\'s loader test does exactly that, so a new filename is covered without anyone remembering a second list)',
        'Assuming order does not matter — it is a PRECEDENCE list, tried first-to-last',
      ],
      seeAlso: ['sectionFrom', 'defineConfig'],
    },
    {
      name: 'sectionFrom',
      kind: 'function',
      signature: 'sectionFrom(module: Record<string, unknown>, tool: string): unknown',
      summary:
        'Read one tool\'s section out of a loaded config module, accepting either a default export or a named one. Both spellings read naturally to an author, and guessing wrong between them produces a config that is silently ignored — so the lookup lives here once rather than in each consumer. Returns `undefined` when the file has no section for that tool, which callers must treat as "not configured", never as an error: a project configuring some other tool is the normal case.',
      example: `import { sectionFrom } from '@pyreon/config'

const section = sectionFrom(loadedModule, 'loom') // default OR named export`,
      mistakes: [
        'Treating `undefined` as a failure — a `pyreon.config.ts` with no section for your tool is a project configuring something else, and saying nothing is correct',
        'Validating inside the loader instead of after — read the section here, then validate it with YOUR rules and name the file in the message',
      ],
      seeAlso: ['CONFIG_FILENAMES', 'defineConfig'],
    },
  ],
})
