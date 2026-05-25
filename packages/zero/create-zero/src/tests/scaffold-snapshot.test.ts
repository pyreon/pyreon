/**
 * Scaffold snapshot tests. Locks the file LIST (not file content) for
 * representative configs — the byte-for-byte content lives in
 * `templates/` and is reviewable per file; the list is the structural
 * contract: "given config X, scaffolder writes exactly these files."
 *
 * Updating a snapshot is a deliberate review step (run `bun run test -- -u`
 * in this package). Drifting the file set without the snapshot updating
 * is a regression — typically caused by an overlay that forgot to copy
 * or a feature whose conditional logic changed.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffold } from '../scaffold'
import { listFiles } from '../template-engine'
import type { ProjectConfig } from '../templates'

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'pyreon-cz-snap-'))
}

function baseConfig(overrides: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: 'snap',
    targetDir: '',
    template: 'app',
    renderMode: 'ssr-stream',
    adapter: 'vercel',
    features: [],
    packageStrategy: 'meta',
    integrations: [],
    aiTools: [],
    compat: 'none',
    lint: false,
    ...overrides,
  }
}

describe('scaffold — output file-set snapshots', () => {
  it('app template, full features (store + query + forms + feature)', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          template: 'app',
          features: ['store', 'query', 'forms', 'feature'],
          aiTools: ['mcp', 'claude'],
          lint: true,
        }),
      )
      expect(await listFiles(dir)).toMatchInlineSnapshot(`
        [
          ".gitignore",
          ".mcp.json",
          ".pyreonlintrc.json",
          "CLAUDE.md",
          "README.md",
          "env.d.ts",
          "index.html",
          "package.json",
          "public/favicon.svg",
          "src/entry-client.ts",
          "src/entry-server.ts",
          "src/features/posts.ts",
          "src/global.css",
          "src/routes/(admin)/dashboard.tsx",
          "src/routes/_error.tsx",
          "src/routes/_layout.tsx",
          "src/routes/_loading.tsx",
          "src/routes/about.tsx",
          "src/routes/api/health.ts",
          "src/routes/api/posts.ts",
          "src/routes/counter.tsx",
          "src/routes/index.tsx",
          "src/routes/posts/[id].tsx",
          "src/routes/posts/index.tsx",
          "src/routes/posts/new.tsx",
          "src/stores/app.ts",
          "tsconfig.json",
          "vercel.json",
          "vite.config.ts",
        ]
      `)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('app template, no features, no AI tools, static adapter', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          template: 'app',
          renderMode: 'spa',
          adapter: 'static',
          features: [],
        }),
      )
      const files = await listFiles(dir)
      // No-store layout shouldn't reference useAppStore.
      expect(files).not.toContain('src/stores/app.ts')
      expect(files).not.toContain('src/features/posts.ts')
      expect(files).not.toContain('src/routes/posts/new.tsx')
      // Static adapter writes no platform files.
      expect(files).not.toContain('vercel.json')
      expect(files).not.toContain('wrangler.toml')
      // Always present.
      expect(files).toContain('package.json')
      expect(files).toContain('vite.config.ts')
      expect(files).toContain('.gitignore')
      expect(files).toContain('src/entry-server.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('dashboard template with supabase + email integrations', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          template: 'dashboard',
          features: ['store', 'query', 'forms', 'table'],
          integrations: ['supabase', 'email'],
          aiTools: ['mcp', 'claude'],
        }),
      )
      const files = await listFiles(dir)
      // Supabase overlay files.
      expect(files).toContain('src/lib/supabase.ts')
      // Supabase _dashboard sub-overlay overwrites the in-memory stubs.
      expect(files).toContain('src/lib/auth.ts')
      expect(files).toContain('src/lib/db.ts')
      // Email overlay files.
      expect(files).toContain('src/lib/email.ts')
      expect(files).toContain('src/emails/welcome.tsx')
      expect(files).toContain('src/routes/api/email/welcome.ts')
      // .env.example with both integrations' keys.
      expect(files).toContain('.env.example')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blog template, static + SSG', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          template: 'blog',
          renderMode: 'ssg',
          adapter: 'static',
        }),
      )
      const files = await listFiles(dir)
      // Blog has its own routes; should not pick up app-template store/features overlays.
      expect(files).not.toContain('src/stores/app.ts')
      expect(files).not.toContain('src/features/posts.ts')
      // Should have the blog's content posts.
      expect(files.some((f) => f.startsWith('src/content/posts/'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('vite.config.ts includes the picked adapter factory + mode', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          adapter: 'cloudflare',
          renderMode: 'ssr-stream',
        }),
      )
      const { readFile } = await import('node:fs/promises')
      const vite = await readFile(join(dir, 'vite.config.ts'), 'utf8')
      expect(vite).toContain('cloudflareAdapter')
      expect(vite).toContain("mode: 'ssr'")
      expect(vite).toContain("mode: 'stream'")
      const wrangler = await readFile(join(dir, 'wrangler.toml'), 'utf8')
      expect(wrangler).toContain('name = "snap"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('package.json has the right feature-aware deps', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          features: ['store', 'forms'],
        }),
      )
      const { readFile } = await import('node:fs/promises')
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
      expect(pkg.dependencies['@pyreon/store']).toBeDefined()
      expect(pkg.dependencies['@pyreon/form']).toBeDefined()
      expect(pkg.dependencies['@pyreon/validation']).toBeDefined()
      expect(pkg.dependencies['zod']).toBeDefined()
      // app template always brings query in.
      expect(pkg.dependencies['@pyreon/query']).toBeDefined()
      // Meta package included by default strategy.
      expect(pkg.dependencies['@pyreon/meta']).toBeDefined()
      // Not selected.
      expect(pkg.dependencies['@pyreon/i18n']).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('monorepo template — root workspace + apps/web + packages/ui + packages/types', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          name: 'my-mono',
          template: 'monorepo',
          features: ['store', 'query', 'forms'],
        }),
      )
      const files = await listFiles(dir)
      // Root-level files.
      expect(files).toContain('package.json')
      expect(files).toContain('tsconfig.json')
      expect(files).toContain('README.md')
      expect(files).toContain('.gitignore')
      // Web app lives under apps/web/.
      expect(files).toContain('apps/web/package.json')
      expect(files).toContain('apps/web/vite.config.ts')
      expect(files).toContain('apps/web/index.html')
      expect(files).toContain('apps/web/src/entry-client.ts')
      expect(files).toContain('apps/web/src/routes/_layout.tsx')
      expect(files).toContain('apps/web/src/stores/app.ts') // store overlay applied
      // Shared packages.
      expect(files).toContain('packages/ui/package.json')
      expect(files).toContain('packages/ui/tsconfig.json')
      expect(files).toContain('packages/ui/src/index.ts')
      expect(files).toContain('packages/types/package.json')
      expect(files).toContain('packages/types/tsconfig.json')
      expect(files).toContain('packages/types/src/index.ts')
      // NO root-level entry-client / vite.config — the monorepo root is
      // the dispatcher, not a code-bearing package.
      expect(files).not.toContain('vite.config.ts')
      expect(files).not.toContain('src/entry-client.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('monorepo root package.json declares workspaces + proxy scripts', async () => {
    const dir = freshDir()
    try {
      await scaffold(baseConfig({ targetDir: dir, name: 'demo', template: 'monorepo' }))
      const { readFile } = await import('node:fs/promises')
      const rootPkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
      expect(rootPkg.name).toBe('demo')
      expect(rootPkg.workspaces).toEqual(['apps/*', 'packages/*'])
      expect(rootPkg.scripts.dev).toBe("bun run --filter='web' dev")
      expect(rootPkg.scripts.build).toBe("bun run --filter='web' build")
      expect(rootPkg.scripts.typecheck).toBe("bun run --filter='*' typecheck")
      // Root has NO dependencies — every dep is at the workspace level.
      expect(rootPkg.dependencies).toBeUndefined()
      expect(rootPkg.devDependencies).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('monorepo web package.json: name=web, has workspace deps', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          name: 'my-mono',
          template: 'monorepo',
          features: ['store', 'query'],
        }),
      )
      const { readFile } = await import('node:fs/promises')
      const webPkg = JSON.parse(await readFile(join(dir, 'apps/web/package.json'), 'utf8'))
      // Name is "web", not "my-mono" — the workspace name is the app, not the project.
      expect(webPkg.name).toBe('web')
      // Workspace deps for the shared packages.
      expect(webPkg.dependencies['@my-mono/ui']).toBe('workspace:^')
      expect(webPkg.dependencies['@my-mono/types']).toBe('workspace:^')
      // Pyreon deps still present (full app shape).
      expect(webPkg.dependencies['@pyreon/store']).toBeDefined()
      expect(webPkg.dependencies['@pyreon/query']).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('monorepo shared packages: scope follows the project name', async () => {
    const dir = freshDir()
    try {
      await scaffold(baseConfig({ targetDir: dir, name: 'acme-co', template: 'monorepo' }))
      const { readFile } = await import('node:fs/promises')
      const uiPkg = JSON.parse(await readFile(join(dir, 'packages/ui/package.json'), 'utf8'))
      const typesPkg = JSON.parse(await readFile(join(dir, 'packages/types/package.json'), 'utf8'))
      expect(uiPkg.name).toBe('@acme-co/ui')
      expect(typesPkg.name).toBe('@acme-co/types')
      // UI depends on types (also workspace-relative).
      expect(uiPkg.dependencies['@acme-co/types']).toBe('workspace:^')
      // The ui index.ts imports the scoped types package.
      const uiSrc = await readFile(join(dir, 'packages/ui/src/index.ts'), 'utf8')
      expect(uiSrc).toContain("from '@acme-co/types'")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AI tool overlays substitute the principles body', async () => {
    const dir = freshDir()
    try {
      await scaffold(
        baseConfig({
          targetDir: dir,
          aiTools: ['claude', 'cursor', 'mcp'],
        }),
      )
      const { readFile } = await import('node:fs/promises')
      const claude = await readFile(join(dir, 'CLAUDE.md'), 'utf8')
      // The principles partial got substituted in.
      expect(claude).toContain('signal()')
      expect(claude).toContain('not React')
      expect(claude).toContain('useState')
      // Claude gets the doctor-command suffix.
      expect(claude).toContain('bun run doctor')

      const cursor = await readFile(join(dir, '.cursor/rules/pyreon.md'), 'utf8')
      expect(cursor).toContain('signal()')
      // Cursor does NOT get the doctor-command suffix.
      expect(cursor).not.toContain('bun run doctor')

      const mcp = JSON.parse(await readFile(join(dir, '.mcp.json'), 'utf8'))
      expect(mcp.mcpServers.pyreon.command).toBe('bunx')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
