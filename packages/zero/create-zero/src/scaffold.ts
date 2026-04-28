import { existsSync, readFileSync } from 'node:fs'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { adapterFor } from './adapters'
import { applyAiTools } from './ai-tools'
import { applyIntegrations, integrationDeps } from './integrations'
import { FEATURES, type FeatureKey, type ProjectConfig, templateDir } from './templates'

// ─── Scaffolding ────────────────────────────────────────────────────────────

export async function scaffold(config: ProjectConfig) {
  // Copy the selected template as base
  await cp(templateDir(config.template), config.targetDir, { recursive: true })

  // Generate customized files
  await writeFile(join(config.targetDir, 'package.json'), generatePackageJson(config))

  await writeFile(join(config.targetDir, 'vite.config.ts'), generateViteConfig(config))

  // Adapter deploy artefacts (vercel.json / wrangler.toml / Dockerfile / …)
  await adapterFor(config.adapter).apply(config)

  await writeFile(join(config.targetDir, 'src/entry-server.ts'), generateEntryServer(config))

  await writeFile(join(config.targetDir, 'env.d.ts'), generateEnvDts(config))

  // Create .gitignore (npm strips it from packages)
  await writeFile(
    join(config.targetDir, '.gitignore'),
    'node_modules\ndist\n.DS_Store\n*.local\n.pyreon\n',
  )

  // Lint config
  if (config.lint) {
    await writeFile(
      join(config.targetDir, '.pyreonlintrc.json'),
      JSON.stringify(
        {
          $schema: 'node_modules/@pyreon/lint/schema/pyreonlintrc.schema.json',
          preset: 'recommended',
        },
        null,
        2,
      ) + '\n',
    )
  }

  // AI tooling — write the rule files for every selected tool, remove the
  // ones the template ships by default (CLAUDE.md / .mcp.json) when the user
  // opted out. See `ai-tools.ts` for the per-tool generators.
  await applyAiTools(config)

  // Backend integrations — Supabase / Email. Each integration writes plain
  // files into the user's project (no Pyreon-side wrapper packages). The
  // dashboard-template stubs (`src/lib/auth.ts`, `src/lib/db.ts`) are
  // overwritten with real Supabase implementations when supabase is picked.
  // See `integrations.ts`.
  await applyIntegrations(config)

  // Template-specific feature trimming. Each template ships its own curated
  // set of files; only the `app` template has post/feature/store demos that
  // need conditional removal based on the user's feature multiselect.
  if (config.template === 'app') {
    // src/features/ is the @pyreon/feature defineFeature demo. Only kept
    // when `feature` is selected — `forms` is a different package and
    // doesn't satisfy the import.
    if (!config.features.includes('feature')) {
      await removeIfExists(join(config.targetDir, 'src/features'))
    }

    // posts/new.tsx is the form-creation demo — it imports BOTH @pyreon/form
    // (for the form) AND `../../features/posts` (for the schema). Removing
    // either dep means posts/new.tsx must go too, otherwise its remaining
    // imports fail at build time.
    if (!config.features.includes('feature') || !config.features.includes('forms')) {
      await removeIfExists(join(config.targetDir, 'src/routes/posts/new.tsx'))
    }

    if (!config.features.includes('store')) {
      await removeIfExists(join(config.targetDir, 'src/stores'))

      const layoutPath = join(config.targetDir, 'src/routes/_layout.tsx')
      if (existsSync(layoutPath)) {
        let layout = await readFile(layoutPath, 'utf-8')
        layout = layout
          .replace(/import .* from '\.\.\/stores\/app'\n/g, '')
          .replace(/.*useAppStore.*\n/g, '')
          .replace(/\s*<button[\s\S]*?sidebar-toggle[\s\S]*?<\/button>\n/g, '')
        await writeFile(layoutPath, layout)
      }
    }
  }
}

// ─── File generators ────────────────────────────────────────────────────────

/**
 * All @pyreon/* packages share the same version in the monorepo.
 * Read from this package's own version — no manual updates needed.
 * When we bump versions for release, create-zero automatically uses the new version.
 */
const _ownPkgJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8'),
)
const PYREON_VERSION = `^${_ownPkgJson.version}`

function pyreonVersion(_pkg: string): string {
  return PYREON_VERSION
}

function generatePackageJson(config: ProjectConfig): string {
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

  // Templates may import @pyreon/<feature> packages directly (e.g. the
  // app template's _layout.tsx imports @pyreon/query for QueryClient).
  // Those imports require the dep to be present REGARDLESS of strategy —
  // @pyreon/meta re-exports them but the import path uses the specific
  // package name. So we always include per-feature deps from the catalog;
  // @pyreon/meta is added as an additional convenience when meta strategy
  // is chosen.
  const allFeatureDeps = new Set<string>()
  for (const key of config.features) {
    const feature = FEATURES[key as FeatureKey]
    if (feature) {
      for (const dep of feature.deps) allFeatureDeps.add(dep)
    }
  }
  // App template hard requirements — _layout.tsx hardcodes @pyreon/query +
  // useAppStore-via-@pyreon/store regardless of feature selection. These are
  // always needed when the user keeps the layout, which they always do.
  if (config.template === 'app') {
    allFeatureDeps.add('@pyreon/query')
    allFeatureDeps.add('@tanstack/query-core')
    allFeatureDeps.add('@pyreon/store')
  }
  for (const dep of allFeatureDeps) {
    if (dep.startsWith('@pyreon/')) {
      deps[dep] = pyreonVersion(dep)
    } else if (dep.startsWith('@tanstack/')) {
      deps[dep] = dep.includes('query')
        ? '^5.90.0'
        : dep.includes('table')
          ? '^8.21.0'
          : '^3.13.0'
    } else if (dep === 'zod') {
      deps[dep] = '^4.0.0'
    }
  }
  if (config.packageStrategy === 'meta') {
    // @pyreon/meta is the single-barrel re-export — included as a convenience
    // alongside the per-feature deps so consumers can choose either import path.
    deps['@pyreon/meta'] = pyreonVersion('@pyreon/meta')
  }

  const devDeps: Record<string, string> = {
    '@pyreon/vite-plugin': pyreonVersion('@pyreon/vite-plugin'),
    '@pyreon/zero-cli': pyreonVersion('@pyreon/zero-cli'),
    typescript: '^6.0.2',
    vite: '^8.0.3',
  }

  if (config.aiTools.includes('mcp')) {
    devDeps['@pyreon/mcp'] = pyreonVersion('@pyreon/mcp')
  }

  // Compat mode deps
  const compatPkgMap: Record<string, string> = {
    react: '@pyreon/react-compat',
    vue: '@pyreon/vue-compat',
    solid: '@pyreon/solid-compat',
    preact: '@pyreon/preact-compat',
  }
  if (config.compat !== 'none' && compatPkgMap[config.compat]) {
    deps[compatPkgMap[config.compat]!] = pyreonVersion(compatPkgMap[config.compat]!)
  }

  // Lint
  if (config.lint) {
    devDeps['@pyreon/lint'] = pyreonVersion('@pyreon/lint')
  }

  // Integration deps (Supabase / Email-Resend / etc.). The integration
  // scaffolders write the actual files; we just need the npm deps in the
  // generated package.json so `bun install` resolves them. Workspace
  // pseudo-versions in the dep map (`workspace:^`) are translated to the
  // current Pyreon version so consumers don't see the workspace protocol.
  for (const [name, version] of Object.entries(integrationDeps(config))) {
    deps[name] = version === 'workspace:^' ? pyreonVersion(name) : version
  }

  const scripts: Record<string, string> = {
    dev: 'zero dev',
    build: 'zero build',
    preview: 'zero preview',
    doctor: 'zero doctor',
    'doctor:fix': 'zero doctor --fix',
    'doctor:ci': 'zero doctor --ci',
  }

  if (config.lint) {
    scripts.lint = 'pyreon-lint .'
  }

  const pkg = {
    name: basename(config.name),
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

function generateViteConfig(config: ProjectConfig): string {
  const modeMap = {
    'ssr-stream': `mode: 'ssr', ssr: { mode: 'stream' }`,
    'ssr-string': `mode: 'ssr'`,
    ssg: `mode: 'ssg'`,
    spa: `mode: 'spa'`,
  }

  const pyreonOpts = config.compat !== 'none' ? `{ compat: '${config.compat}' }` : ''

  // Adapter wiring — `static` has no factory (dist/ IS the artefact). For
  // every other adapter, we import the factory from `@pyreon/zero/server`
  // and pass it to zero() so the build emits platform-specific output.
  const adapter = adapterFor(config.adapter)
  const adapterImport = adapter.viteFactory
    ? `\nimport { ${adapter.viteFactory} } from '@pyreon/zero/server'`
    : ''
  const adapterArg = adapter.viteFactory ? `, adapter: ${adapter.viteFactory}()` : ''

  return `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'${adapterImport}
import { fontPlugin } from '@pyreon/zero/font'
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    pyreon(${pyreonOpts}),
    zero({ ${modeMap[config.renderMode]}${adapterArg} }),

    // Google Fonts — self-hosted at build time, CDN in dev
    fontPlugin({
      google: ['Inter:wght@400;500;600;700;800', 'JetBrains Mono:wght@400'],
      fallbacks: {
        Inter: { fallback: 'Arial', sizeAdjust: 1.07, ascentOverride: 90 },
      },
    }),

    // Generate sitemap.xml and robots.txt at build time
    seoPlugin({
      sitemap: { origin: 'https://example.com' },
      robots: {
        rules: [{ userAgent: '*', allow: ['/'] }],
        sitemap: 'https://example.com/sitemap.xml',
      },
    }),
  ],
}
`
}

function generateEntryServer(config: ProjectConfig): string {
  const imports = [
    `import { routes } from 'virtual:zero/routes'`,
    `import { routeMiddleware } from 'virtual:zero/route-middleware'`,
    `import { createServer } from '@pyreon/zero/server'`,
    `import {\n  cacheMiddleware,\n  securityHeaders,\n  varyEncoding,\n} from '@pyreon/zero/cache'`,
  ]

  const modeMap = {
    'ssr-stream': `stream`,
    'ssr-string': `string`,
    ssg: `string`,
    spa: `string`,
  }

  return `${imports.join('\n')}

export default createServer({
  routes,
  routeMiddleware,
  config: {
    ssr: { mode: '${modeMap[config.renderMode]}' },
  },
  middleware: [
    securityHeaders(),
    cacheMiddleware({ staleWhileRevalidate: 120 }),
    varyEncoding(),
  ],
})
`
}

function generateEnvDts(config: ProjectConfig): string {
  let content = `/// <reference types="vite/client" />

declare module 'virtual:zero/routes' {
  import type { RouteRecord } from '@pyreon/router'
  export const routes: RouteRecord[]
}

declare module 'virtual:zero/route-middleware' {
  import type { RouteMiddlewareEntry } from '@pyreon/zero'
  export const routeMiddleware: RouteMiddlewareEntry[]
}

declare module 'virtual:zero/api-routes' {
  import type { ApiRouteEntry } from '@pyreon/zero/api-routes'
  export const apiRoutes: ApiRouteEntry[]
}
`

  if (config.features.includes('query')) {
    content += `
declare module 'virtual:zero/actions' {
  export {}
}
`
  }

  return content
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function removeIfExists(path: string) {
  if (!existsSync(path)) return
  const { rm } = await import('node:fs/promises')
  await rm(path, { recursive: true })
}
