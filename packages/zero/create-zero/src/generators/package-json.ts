/**
 * `package.json` generator for scaffolded projects. Kept runtime-built (not
 * a template file with placeholders) because the `dependencies` map is
 * GENUINELY computed — feature selections, integration deps, adapter
 * convenience deps, package-strategy choice, and the lint opt-in all
 * contribute. A `{{dependencies}}` placeholder in a template file would
 * just hide the same computation behind a marker. Keeping the source
 * obvious wins over forcing every variable file into the template engine.
 *
 * All `@pyreon/*` deps share the monorepo version — read from this
 * package's OWN `package.json` at runtime (no manual updates per release).
 *
 * For monorepo templates, three shapes are emitted:
 *   - `monorepo-root`: workspace declaration + proxy scripts; no deps.
 *   - `monorepo-web` : same as flat, name="web", + `@<scope>/ui` and
 *                      `@<scope>/types` workspace deps.
 *   - flat (default) : current behavior — project name + all deps.
 */

import { basename } from 'node:path'
import { FEATURES, type FeatureKey, type ProjectConfig } from '../templates'
import { integrationDeps } from '../integrations'
// Read the version through the shared top-level module — a subdirectory file
// like this one CANNOT compute a self-package.json path that's correct in
// BOTH source-run (src/generators/) and bundled-run (lib/), and getting that
// wrong shipped the 0.32.0 startup crash. See src/own-version.ts.
import { PYREON_DEP_RANGE } from '../own-version'

const PYREON_VERSION = PYREON_DEP_RANGE

/**
 * The oxlint / oxfmt ranges a lint-enabled scaffold installs — the versions
 * this repository runs, so the shipped `@pyreon/lint/oxlint/*.json` and
 * `@pyreon/lint/oxfmt` presets are exercised against them in CI.
 */
export const OXLINT_RANGE = '^1.89.0'
export const OXFMT_RANGE = '^0.74.0'

function pyreonVersion(_pkg: string): string {
  return PYREON_VERSION
}

const COMPAT_PKG: Record<string, string> = {
  react: '@pyreon/react-compat',
  vue: '@pyreon/vue-compat',
  solid: '@pyreon/solid-compat',
  preact: '@pyreon/preact-compat',
}

export type PackageJsonKind = 'flat' | 'monorepo-root' | 'monorepo-web'

/**
 * Generate a `package.json` body. `kind` controls the shape:
 *   - `flat`           — current behavior (project name + all deps).
 *   - `monorepo-root`  — workspace declaration + proxy scripts; no deps.
 *   - `monorepo-web`   — same as flat but name="web" + workspace deps for
 *                        `@<projectName>/ui` and `@<projectName>/types`.
 */
export function generatePackageJson(
  config: ProjectConfig,
  kind: PackageJsonKind = 'flat',
): string {
  if (kind === 'monorepo-root') {
    return generateMonorepoRootPackageJson(config)
  }

  const deps: Record<string, string> = {
    '@pyreon/core': pyreonVersion('@pyreon/core'),
    '@pyreon/head': pyreonVersion('@pyreon/head'),
    '@pyreon/reactivity': pyreonVersion('@pyreon/reactivity'),
    '@pyreon/router': pyreonVersion('@pyreon/router'),
    '@pyreon/runtime-dom': pyreonVersion('@pyreon/runtime-dom'),
    '@pyreon/runtime-server': pyreonVersion('@pyreon/runtime-server'),
    '@pyreon/server': pyreonVersion('@pyreon/server'),
    '@pyreon/zero': pyreonVersion('@pyreon/zero'),
  }

  // Per-feature deps. Templates may import @pyreon/<feature> packages
  // directly (e.g. the app template's _layout.tsx imports @pyreon/query
  // for QueryClient). Those imports require the dep regardless of
  // strategy — @pyreon/meta re-exports them but the import path uses the
  // specific package name.
  const allFeatureDeps = new Set<string>()
  for (const key of config.features) {
    const feature = FEATURES[key as FeatureKey]
    if (feature) for (const dep of feature.deps) allFeatureDeps.add(dep)
  }

  // App template hard requirements — _layout.tsx hardcodes @pyreon/query +
  // (when store overlay is applied) @pyreon/store. Query is always needed
  // for the base layout. Store is only needed when the store overlay
  // applies, which happens iff `store` is in features (already covered).
  if (config.template === 'app') {
    allFeatureDeps.add('@pyreon/query')
    allFeatureDeps.add('@tanstack/query-core')
    if (config.features.includes('store')) {
      // store overlay is applied, layout imports `../stores/app`
      allFeatureDeps.add('@pyreon/store')
    }
  }
  // Dashboard template hard requirements — invoices/[id].tsx hardcodes the
  // document-primitives + document + connector-document trio for the
  // headline PDF-export demo, regardless of which integrations the user
  // picks.
  if (config.template === 'dashboard') {
    allFeatureDeps.add('@pyreon/document-primitives')
    allFeatureDeps.add('@pyreon/document')
    allFeatureDeps.add('@pyreon/connector-document')
  }

  for (const dep of allFeatureDeps) {
    if (dep.startsWith('@pyreon/')) {
      deps[dep] = pyreonVersion(dep)
    } else if (dep.startsWith('@tanstack/')) {
      deps[dep] = dep.includes('query')
        ? '^5.101.2'
        : dep.includes('table')
          ? '^8.21.3'
          : '^3.17.3'
    } else if (dep === 'zod') {
      deps[dep] = '^4.4.3'
    }
  }

  if (config.packageStrategy === 'meta') {
    deps['@pyreon/meta'] = pyreonVersion('@pyreon/meta')
  }

  // Integration deps (Supabase / email / future). Each integration owns
  // its dep list — `integrationDeps()` aggregates the selected set.
  for (const [pkg, version] of Object.entries(integrationDeps(config))) {
    deps[pkg] = version
  }

  // Compat shim
  const compatPkg = config.compat !== 'none' ? COMPAT_PKG[config.compat] : undefined
  if (compatPkg) deps[compatPkg] = pyreonVersion(compatPkg)

  // Monorepo: add workspace deps so the web app can import from the shared
  // packages. The user-visible scope is `@<projectName>/...` (matches the
  // root workspaces declaration and the package.json names in
  // packages/ui/ and packages/types/).
  if (kind === 'monorepo-web') {
    const scope = basename(config.name)
    deps[`@${scope}/ui`] = 'workspace:^'
    deps[`@${scope}/types`] = 'workspace:^'
  }

  const devDeps: Record<string, string> = {
    // The generated tsconfig declares `types: ["bun", "vite/client"]` — Bun's
    // ambient types provide `process` / `Bun` globals that the scaffolded
    // server + integration code (supabase/email use `process.env`) rely on.
    // Without this dep a STANDALONE (non-workspace) scaffold fails `tsc` +
    // editor tsserver with TS2688 "Cannot find type definition file for 'bun'"
    // — the repo's own example apps only compile because the monorepo hoists
    // `@types/bun` from root; a fresh app has no such hoist. See the
    // matching entry on the monorepo `ui`/`types` package templates.
    '@types/bun': '^1.3.14',
    '@pyreon/vite-plugin': pyreonVersion('@pyreon/vite-plugin'),
    '@pyreon/zero-cli': pyreonVersion('@pyreon/zero-cli'),
    typescript: '^6.0.3',
    vite: '^8.0.16',
  }
  if (config.aiTools.includes('mcp')) {
    devDeps['@pyreon/mcp'] = pyreonVersion('@pyreon/mcp')
  }
  if (config.lint) {
    devDeps['@pyreon/lint'] = pyreonVersion('@pyreon/lint')
    // The readable setup is three tools, each owning its half: @pyreon/lint
    // (blank lines, component structure, JSX shape), oxlint (size limits,
    // import placement — `.oxlintrc.json` extends `@pyreon/lint/oxlint/readable.json`)
    // and oxfmt (everything inside a line, import order — `oxfmt.config.ts`
    // re-exports `@pyreon/lint/oxfmt`).
    devDeps.oxlint = OXLINT_RANGE
    devDeps.oxfmt = OXFMT_RANGE
  }

  const scripts: Record<string, string> = {
    dev: 'zero dev',
    build: 'zero build',
    preview: 'zero preview',
    // Runnable now that `@types/bun` is a devDep — `zero build` uses the
    // Pyreon compiler (not tsc), so a standalone typecheck script is what
    // surfaces type errors + gives editors/CI a first-class entry point.
    typecheck: 'tsc --noEmit',
    doctor: 'zero doctor',
    'doctor:fix': 'zero doctor --fix',
    'doctor:ci': 'zero doctor --ci',
  }
  if (config.lint) {
    scripts.lint = 'oxlint && pyreon-lint .'
    scripts.format = 'oxfmt'
    // Formatter first, then the lint fixes: the lint fixes only ADD blank lines
    // between statements, which the formatter keeps, so one pass is stable.
    scripts.fix = 'oxfmt && oxlint --fix && pyreon-lint --fix .'
  }

  const pkg = {
    name: kind === 'monorepo-web' ? 'web' : basename(config.name),
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts,
    dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
    devDependencies: Object.fromEntries(
      Object.entries(devDeps).sort(([a], [b]) => a.localeCompare(b)),
    ),
  }

  return `${JSON.stringify(pkg, null, 2)}\n`
}

/**
 * Root `package.json` for the monorepo template. Declares Bun workspaces
 * and proxies dev/build/preview/typecheck to the web app via
 * `bun run --filter='web' <script>` (Bun picks up the workspace by name).
 *
 * Intentionally has no `dependencies` / `devDependencies` — every dep is
 * declared at the workspace package level (`apps/web/`, `packages/ui/`,
 * `packages/types/`). The root is the dispatcher, not a code-bearing
 * package.
 */
function generateMonorepoRootPackageJson(config: ProjectConfig): string {
  const pkg = {
    name: basename(config.name),
    version: '0.0.1',
    private: true,
    type: 'module',
    workspaces: ['apps/*', 'packages/*'],
    scripts: {
      dev: "bun run --filter='web' dev",
      build: "bun run --filter='web' build",
      preview: "bun run --filter='web' preview",
      typecheck: "bun run --filter='*' typecheck",
    },
  }
  return `${JSON.stringify(pkg, null, 2)}\n`
}
