/**
 * A fresh project's first `bun run format` changes nothing.
 *
 * The scaffold ships `oxfmt.config.ts` re-exporting `@pyreon/lint/oxfmt`'s
 * `readableStrict`. If the templates and the generated files (package.json,
 * vite.config.ts, netlify.toml, .oxlintrc.json, the AI instruction files) were
 * not already in that shape, the first format would rewrite dozens of files a
 * user never touched. This runs the real oxfmt binary in check mode over each
 * generated project, with the shipped preset, for two project names (import
 * and key sorting can depend on the name), every template, every adapter and
 * every render mode.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readableStrict } from '@pyreon/lint/oxfmt'
import { afterAll, describe, expect, it } from 'vitest'
import { scaffold } from '../scaffold'
import { FEATURES, type ProjectConfig } from '../templates'

const OXFMT = join(import.meta.dirname, '..', '..', '..', '..', '..', 'node_modules', '.bin', 'oxfmt')
const work = mkdtempSync(join(tmpdir(), 'cz-format-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))
const CONFIG = join(work, 'oxfmt.json')
// The repo's own .gitignore (which lists `lib`) must not hide template files.
const NO_IGNORE = join(work, 'empty-ignore')
writeFileSync(CONFIG, JSON.stringify(readableStrict))
writeFileSync(NO_IGNORE, '')

/** Files oxfmt would rewrite under the project's lint-config root. */
function unformatted(root: string): string[] {
  try {
    execFileSync(OXFMT, ['--list-different', '--ignore-path', NO_IGNORE, '-c', CONFIG, root], {
      encoding: 'utf8',
    })

    return []
  } catch (err) {
    const out = String((err as { stdout?: unknown }).stdout ?? '')
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('Finished'))
      .map((l) => l.replace(root, ''))
  }
}

const ALL = Object.keys(FEATURES) as ProjectConfig['features']

describe('the first `bun run format` of a new project is a no-op', () => {
  it('the formatter binary is installed (a missing one must fail, not skip)', () => {
    expect(existsSync(OXFMT), OXFMT).toBe(true)
  })

  const variants: Array<[string, Partial<ProjectConfig>]> = []
  for (const name of ['demo', 'zeta-app']) {
    for (const template of ['app', 'blog', 'dashboard', 'monorepo'] as const) {
      variants.push([`${name}: ${template}, all features`, { name, template, features: [...ALL] }])
      variants.push([`${name}: ${template}, no features`, { name, template, features: [] }])
    }
  }
  for (const adapter of ['vercel', 'cloudflare', 'netlify', 'node', 'bun', 'static'] as const) {
    for (const renderMode of ['ssr-stream', 'ssr-string', 'ssg', 'spa', 'isr'] as const) {
      variants.push([`app, ${adapter}, ${renderMode}`, { template: 'app', adapter, renderMode, features: [...ALL] }])
    }
  }

  variants.push(['app, typed routes + react compat', { template: 'app', typedRoutes: true, compat: 'react' }])

  for (const [label, overrides] of variants) {
    it(label, async () => {
      const dir = mkdtempSync(join(work, 'p-'))
      await scaffold({
        name: 'demo',
        targetDir: dir,
        template: 'app',
        renderMode: 'ssr-stream',
        adapter: 'vercel',
        features: [],
        packageStrategy: 'meta',
        integrations: ['supabase', 'email'],
        aiTools: ['mcp', 'claude', 'agents', 'cursor', 'copilot'],
        compat: 'none',
        lint: true,
        typedRoutes: false,
        ...overrides,
      })
      // `bun run format` runs where the lint setup lives: the web app in a monorepo.
      const root = overrides.template === 'monorepo' ? join(dir, 'apps', 'web') : dir
      expect(unformatted(root)).toEqual([])
    })
  }
})
