/**
 * Scaffolder entry point. All file content lives in `templates/` as REAL
 * files (overlay copies + `{{var}}` substitution). The two genuinely-
 * computed files — `package.json` and `vite.config.ts` — are built by
 * generators in `src/generators/` and written last.
 *
 * Flow (flat templates):
 *   1. Copy the picked template's base files (`templates/<template>/`).
 *   2. Copy `templates/_shared/` base (`.gitignore`, `env.d.ts`,
 *      `src/entry-server.ts` with `{{ssrMode}}` substitution). Underscore-
 *      prefixed sub-dirs are skipped — they're per-selection overlays.
 *   3. Apply feature overlays (`templates/_features/<feature>/`).
 *   4. Apply adapter overlay (`templates/_shared/_adapters/<adapter>/`).
 *   5. Apply integration overlays (`templates/_shared/_integrations/<int>/`).
 *   6. Apply AI tooling overlays (`templates/_shared/_ai/<tool>/`).
 *   7. Apply lint overlay (`templates/_shared/_lint/`) when enabled.
 *   8. Generate `package.json` and `vite.config.ts` (runtime — computed).
 *
 * Monorepo branch (template === 'monorepo'):
 *   - Recursively runs the flat pipeline against `<targetDir>/apps/web/`
 *     using the `app` template shape.
 *   - Copies the `templates/monorepo/` overlay (root tsconfig, README,
 *     .gitignore, packages/ui/ + packages/types/) with `{{name}}` and
 *     `{{pyreonVersion}}` substitution.
 *   - Writes a root `package.json` with Bun workspaces + proxy scripts.
 *   - Overwrites the web app's package.json with workspace deps for the
 *     two shared packages.
 */

import { basename, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { adapterFor } from './adapters'
import { applyAiTools } from './ai-tools'
import { generatePackageJson } from './generators/package-json'
import { generateViteConfig } from './generators/vite-config'
import { applyIntegrations } from './integrations'
import { copyOverlay } from './template-engine'
import { type ProjectConfig, templateDir } from './templates'

const TEMPLATES_ROOT = resolve(import.meta.dirname, '..', 'templates')
const SHARED_ROOT = resolve(TEMPLATES_ROOT, '_shared')
const FEATURES_ROOT = resolve(TEMPLATES_ROOT, '_features')
const MONOREPO_ROOT = resolve(TEMPLATES_ROOT, 'monorepo')

const _ownPkgJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8'),
) as { version: string }
const PYREON_VERSION = _ownPkgJson.version

// SSR mode passed to `createServer({ config: { ssr: { mode: '...' } } })`.
// Note: the user-facing render-mode field has 4 values (`ssr-stream`,
// `ssr-string`, `ssg`, `spa`); SSR's mode field accepts only `stream` and
// `string`. SSG + SPA both use `string` at the server level (SSG renders
// once at build time, SPA never SSRs but `string` is the harmless default).
const SSR_MODE_MAP: Record<ProjectConfig['renderMode'], string> = {
  'ssr-stream': 'stream',
  'ssr-string': 'string',
  ssg: 'string',
  spa: 'string',
}

export async function scaffold(config: ProjectConfig): Promise<void> {
  if (config.template === 'monorepo') {
    await scaffoldMonorepo(config)
    return
  }
  await scaffoldFlat(config)
}

async function scaffoldFlat(config: ProjectConfig): Promise<void> {
  // 1. Template base.
  await copyOverlay(templateDir(config.template), config.targetDir)

  // 2. Shared base files (gitignore, env.d.ts, entry-server.ts).
  await copyOverlay(
    SHARED_ROOT,
    config.targetDir,
    { ssrMode: SSR_MODE_MAP[config.renderMode] },
    { skipUnderscoreDirs: true },
  )

  // 3. Per-feature overlays. Each overlay's files OVERWRITE base files
  //    on conflict (e.g. store's _layout.tsx overwrites the no-store base).
  for (const feature of config.features) {
    await copyOverlay(join(FEATURES_ROOT, feature), config.targetDir)
  }

  // 4. Adapter overlay.
  await adapterFor(config.adapter).apply(config)

  // 5. Integration overlays (Supabase, email).
  await applyIntegrations(config)

  // 6. AI tooling overlays.
  await applyAiTools(config)

  // 7. Lint config opt-in.
  if (config.lint) {
    await copyOverlay(join(SHARED_ROOT, '_lint'), config.targetDir)
  }

  // 8. Generated files (deps + plugins are computed).
  await writeFile(join(config.targetDir, 'package.json'), generatePackageJson(config))
  await writeFile(join(config.targetDir, 'vite.config.ts'), generateViteConfig(config))
}

async function scaffoldMonorepo(config: ProjectConfig): Promise<void> {
  const projectName = basename(config.name)

  // 1. Scaffold the web app FIRST — runs the entire flat pipeline against
  //    `<targetDir>/apps/web/`. Uses the `app` template shape for the inner
  //    project. The user's feature/adapter/integration/AI/lint choices all
  //    apply to the web app.
  const webTargetDir = join(config.targetDir, 'apps', 'web')
  const webConfig: ProjectConfig = {
    ...config,
    template: 'app',
    targetDir: webTargetDir,
  }
  await scaffoldFlat(webConfig)

  // 2. Rewrite the web app's package.json — name becomes "web" and
  //    workspace deps for the shared packages are added.
  await writeFile(
    join(webTargetDir, 'package.json'),
    generatePackageJson(webConfig, 'monorepo-web'),
  )

  // 3. Root-level monorepo files (README, tsconfig, .gitignore, ui/, types/).
  //    `{{name}}` becomes the project name (used as the scope for shared
  //    packages); `{{pyreonVersion}}` is the runtime monorepo version.
  await copyOverlay(MONOREPO_ROOT, config.targetDir, {
    name: projectName,
    pyreonVersion: PYREON_VERSION,
  })

  // 4. Root package.json — workspace declaration + proxy scripts.
  await writeFile(
    join(config.targetDir, 'package.json'),
    generatePackageJson(config, 'monorepo-root'),
  )
}
