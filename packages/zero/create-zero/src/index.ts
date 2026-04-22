import { existsSync, readFileSync } from 'node:fs'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import * as p from '@clack/prompts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProjectConfig {
  name: string
  targetDir: string
  renderMode: 'ssr-stream' | 'ssr-string' | 'ssg' | 'spa'
  features: string[]
  packageStrategy: 'meta' | 'individual'
  aiToolchain: boolean
  /** Framework compat mode — configures vite plugin for React/Vue/Solid/Preact migration */
  compat: 'none' | 'react' | 'vue' | 'solid' | 'preact'
  /** Include @pyreon/lint with recommended preset */
  lint: boolean
}

// ─── Feature definitions ────────────────────────────────────────────────────

const FEATURES = {
  store: {
    label: 'State Management (@pyreon/store)',
    deps: ['@pyreon/store'],
  },
  query: {
    label: 'Data Fetching (@pyreon/query)',
    deps: ['@pyreon/query', '@tanstack/query-core'],
  },
  forms: {
    label: 'Forms + Validation (@pyreon/form, @pyreon/validation)',
    deps: ['@pyreon/form', '@pyreon/validation', 'zod'],
  },
  feature: {
    label: 'Feature CRUD (@pyreon/feature) — includes store, query, forms',
    deps: [
      '@pyreon/feature',
      '@pyreon/store',
      '@pyreon/query',
      '@pyreon/form',
      '@pyreon/validation',
      '@tanstack/query-core',
      'zod',
    ],
  },
  i18n: {
    label: 'Internationalization (@pyreon/i18n)',
    deps: ['@pyreon/i18n'],
  },
  table: {
    label: 'Tables (@pyreon/table)',
    deps: ['@pyreon/table', '@tanstack/table-core'],
  },
  virtual: {
    label: 'Virtual Lists (@pyreon/virtual)',
    deps: ['@pyreon/virtual', '@tanstack/virtual-core'],
  },
  styler: {
    label: 'CSS-in-JS (@pyreon/styler)',
    deps: ['@pyreon/styler', '@pyreon/ui-core'],
  },
  elements: {
    label: 'UI Elements (@pyreon/elements, @pyreon/coolgrid)',
    deps: ['@pyreon/elements', '@pyreon/coolgrid', '@pyreon/unistyle', '@pyreon/ui-core'],
  },
  animations: {
    label: 'Animations (@pyreon/kinetic + 120 presets)',
    deps: ['@pyreon/kinetic', '@pyreon/kinetic-presets'],
  },
  hooks: {
    label: 'Hooks (@pyreon/hooks — 25+ signal-based utilities)',
    deps: ['@pyreon/hooks'],
  },
  charts: {
    label: 'Charts (@pyreon/charts — reactive ECharts)',
    deps: ['@pyreon/charts'],
  },
  hotkeys: {
    label: 'Hotkeys (@pyreon/hotkeys — keyboard shortcuts)',
    deps: ['@pyreon/hotkeys'],
  },
  storage: {
    label: 'Storage (@pyreon/storage — localStorage, cookies, IndexedDB)',
    deps: ['@pyreon/storage'],
  },
  flow: {
    label: 'Flow Diagrams (@pyreon/flow — reactive node graphs)',
    deps: ['@pyreon/flow'],
  },
  code: {
    label: 'Code Editor (@pyreon/code — CodeMirror 6)',
    deps: ['@pyreon/code'],
  },
  toast: {
    label: 'Toast Notifications (@pyreon/toast)',
    deps: ['@pyreon/toast'],
  },
  permissions: {
    label: 'Permissions (@pyreon/permissions — RBAC, feature flags)',
    deps: ['@pyreon/permissions'],
  },
  'url-state': {
    label: 'URL State (@pyreon/url-state — URL-synced params)',
    deps: ['@pyreon/url-state'],
  },
  rx: {
    label: 'Reactive Transforms (@pyreon/rx — filter, map, sortBy, groupBy)',
    deps: ['@pyreon/rx'],
  },
} as const

type FeatureKey = keyof typeof FEATURES

// ─── Template directory ─────────────────────────────────────────────────────

const TEMPLATE_DIR = resolve(import.meta.dirname, '../templates/default')

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const argName = args[0]

  if (argName === '--help' || argName === '-h') {
    console.log('Usage: create-zero [project-name]')
    process.exit(0)
  }

  p.intro('Create a new Pyreon Zero project')

  // Project name
  const name =
    argName ??
    (await p.text({
      message: 'Project name',
      placeholder: 'my-zero-app',
      validate: (v) => {
        if (!v?.trim()) return 'Project name is required'
        if (existsSync(resolve(process.cwd(), v))) return `Directory "${v}" already exists`
      },
    }))

  if (p.isCancel(name)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const targetDir = resolve(process.cwd(), name as string)
  if (existsSync(targetDir)) {
    p.cancel(`Directory "${name}" already exists.`)
    process.exit(1)
  }

  // Rendering mode
  const renderMode = await p.select({
    message: 'Rendering mode',
    options: [
      {
        value: 'ssr-stream',
        label: 'SSR Streaming',
        hint: 'recommended — progressive HTML with Suspense',
      },
      { value: 'ssr-string', label: 'SSR String', hint: 'buffered HTML, simpler but slower TTFB' },
      { value: 'ssg', label: 'Static (SSG)', hint: 'pre-rendered at build time' },
      { value: 'spa', label: 'SPA', hint: 'client-only, no server rendering' },
    ],
  })

  if (p.isCancel(renderMode)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  // Features
  const features = await p.multiselect({
    message: 'Select features (space to toggle, enter to confirm)',
    options: Object.entries(FEATURES).map(([key, { label }]) => ({
      value: key,
      label,
    })),
    initialValues: ['store', 'query', 'forms'],
    required: false,
  })

  if (p.isCancel(features)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  // Package strategy
  const packageStrategy = await p.select({
    message: 'Package imports',
    options: [
      {
        value: 'meta',
        label: '@pyreon/meta (single barrel)',
        hint: 'one import for everything — simpler, tree-shaken at build',
      },
      {
        value: 'individual',
        label: 'Individual packages',
        hint: 'only install what you selected — smaller node_modules',
      },
    ],
  })

  if (p.isCancel(packageStrategy)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  // AI toolchain
  const aiToolchain = await p.confirm({
    message: 'Include AI toolchain? (MCP server, CLAUDE.md, doctor)',
    initialValue: true,
  })

  if (p.isCancel(aiToolchain)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  // Compat mode (migration from another framework)
  const compat = await p.select({
    message: 'Migrating from another framework?',
    options: [
      { value: 'none', label: 'No — native Pyreon', hint: 'recommended' },
      { value: 'react', label: 'React', hint: 'use useState, useEffect, etc.' },
      { value: 'vue', label: 'Vue', hint: 'use ref, computed, watch, etc.' },
      { value: 'solid', label: 'Solid', hint: 'use createSignal, createEffect, etc.' },
      { value: 'preact', label: 'Preact', hint: 'use useState, signals, etc.' },
    ],
  })

  if (p.isCancel(compat)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  // Lint
  const lint = await p.confirm({
    message: 'Include @pyreon/lint? (59 Pyreon-specific rules)',
    initialValue: true,
  })

  if (p.isCancel(lint)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  const config: ProjectConfig = {
    name: name as string,
    targetDir,
    renderMode: renderMode as ProjectConfig['renderMode'],
    features: features as string[],
    packageStrategy: packageStrategy as ProjectConfig['packageStrategy'],
    aiToolchain: aiToolchain as boolean,
    compat: compat as ProjectConfig['compat'],
    lint: lint as boolean,
  }

  const s = p.spinner()
  s.start('Scaffolding project...')

  await scaffold(config)

  s.stop('Project created!')

  // Next steps
  p.note([`cd ${config.name}`, 'bun install', 'bun run dev'].join('\n'), 'Next steps')

  p.outro('Happy building!')
}

// ─── Scaffolding ────────────────────────────────────────────────────────────

async function scaffold(config: ProjectConfig) {
  // Copy full template as base
  await cp(TEMPLATE_DIR, config.targetDir, { recursive: true })

  // Generate customized files
  await writeFile(join(config.targetDir, 'package.json'), generatePackageJson(config))

  await writeFile(join(config.targetDir, 'vite.config.ts'), generateViteConfig(config))

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

  // AI toolchain files
  if (config.aiToolchain) {
    await writeFile(
      join(config.targetDir, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            pyreon: { command: 'bunx', args: ['@pyreon/mcp'] },
          },
        },
        null,
        2,
      ),
    )
  } else {
    // Remove AI files from copied template
    const aiFiles = ['.mcp.json', 'CLAUDE.md']
    for (const f of aiFiles) {
      const path = join(config.targetDir, f)
      if (existsSync(path)) {
        const { unlink } = await import('node:fs/promises')
        await unlink(path)
      }
    }
  }

  // Remove feature-specific files if features not selected
  if (!config.features.includes('feature') && !config.features.includes('forms')) {
    await removeIfExists(join(config.targetDir, 'src/routes/posts/new.tsx'))
    await removeIfExists(join(config.targetDir, 'src/features'))
  }

  if (!config.features.includes('store')) {
    await removeIfExists(join(config.targetDir, 'src/stores'))
  }

  // Remove store import from layout if store not selected
  if (!config.features.includes('store')) {
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

  if (config.packageStrategy === 'meta') {
    // Single barrel — includes all fundamentals + UI system
    deps['@pyreon/meta'] = pyreonVersion('@pyreon/meta')
    // Still need non-pyreon deps for selected features
    for (const key of config.features) {
      const feature = FEATURES[key as FeatureKey]
      if (feature) {
        for (const dep of feature.deps) {
          if (!dep.startsWith('@pyreon/')) {
            if (dep.startsWith('@tanstack/')) {
              deps[dep] = dep.includes('query')
                ? '^5.90.0'
                : dep.includes('table')
                  ? '^8.21.0'
                  : '^3.13.0'
            } else if (dep === 'zod') {
              deps[dep] = '^4.0.0'
            }
          }
        }
      }
    }
  } else {
    // Individual packages — only install what's selected
    const allDeps = new Set<string>()
    for (const key of config.features) {
      const feature = FEATURES[key as FeatureKey]
      if (feature) {
        for (const dep of feature.deps) allDeps.add(dep)
      }
    }
    for (const dep of allDeps) {
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
  }

  const devDeps: Record<string, string> = {
    '@pyreon/vite-plugin': pyreonVersion('@pyreon/vite-plugin'),
    '@pyreon/zero-cli': pyreonVersion('@pyreon/zero-cli'),
    typescript: '^6.0.2',
    vite: '^8.0.3',
  }

  if (config.aiToolchain) {
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

  return `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { fontPlugin } from '@pyreon/zero/font'
import { seoPlugin } from '@pyreon/zero/seo'

export default {
  plugins: [
    pyreon(${pyreonOpts}),
    zero({ ${modeMap[config.renderMode]} }),

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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
