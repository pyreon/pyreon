/**
 * A scaffolded project ignores the files Pyreon tooling writes into it.
 *
 * `@pyreon/vite-plugin` writes `.pyreon-lpih.json` (dev perf hints, on by
 * default) and `.pyreon/context.json` (AI context map) into the app root on
 * every dev session, and a `@pyreon/zero` SSG/SSR build writes
 * `__pyreon-zero-ssg-entry.js` / `__pyreon-zero-ssr-entry.js` there and
 * removes them in `finally` (an interrupted build leaves them). None of them
 * is source; without an ignore rule each shows up in `git status`.
 *
 * Also locks the packaging half: npm never packs a file named `.gitignore`,
 * so the templates store it as `gitignore` and the scaffolder restores the
 * dot. A template `.gitignore` would scaffold fine from this checkout and be
 * missing from every project created from the published package.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffold } from '../scaffold'
import { listFiles } from '../template-engine'
import type { ProjectConfig } from '../templates'

const GENERATED = [
  '.pyreon-lpih.json',
  '.pyreon/context.json',
  '__pyreon-zero-ssg-entry.js',
  '__pyreon-zero-ssr-entry.js',
  // The per-build name a build actually writes (see `syntheticEntryPath`).
  '__pyreon-zero-ssg-entry-4242-0a1b2c3d.js',
  '__pyreon-zero-ssr-entry-4242-0a1b2c3d.js',
]

function config(targetDir: string, template: ProjectConfig['template']): ProjectConfig {
  return {
    name: 'ignore-check',
    targetDir,
    template,
    renderMode: 'ssr-stream',
    adapter: 'vercel',
    features: [],
    packageStrategy: 'meta',
    integrations: [],
    aiTools: [],
    compat: 'none',
    lint: false,
    typedRoutes: false,
  }
}

/** The subset of `paths` that `git check-ignore` does NOT match inside `repo`. */
function notIgnored(repo: string, paths: string[]): string[] {
  const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  expect(git('init', '-q').status).toBe(0)
  // Only the scaffolded rules count: no global excludes file from the machine.
  const r = git('-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', ...paths)
  const ignored = new Set(r.stdout.split('\n').filter(Boolean))

  return paths.filter((p) => !ignored.has(p))
}

describe('scaffolded .gitignore covers generated project-root files', () => {
  it.each([
    ['app', ''],
    ['blog', ''],
    ['monorepo', 'apps/web/'],
  ] as const)('%s template', async (template, appDir) => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-cz-ignore-'))
    try {
      await scaffold(config(dir, template))
      expect(
        notIgnored(
          dir,
          GENERATED.map((p) => `${appDir}${p}`),
        ),
      ).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('template ignore files survive npm packing', () => {
  it('no template stores a literal .gitignore (npm drops it from the tarball)', async () => {
    const templates = resolve(import.meta.dirname, '../../templates')
    const files = await listFiles(templates)
    expect(files.filter((f) => f.split('/').pop() === '.gitignore')).toEqual([])
    expect(files).toContain('_shared/gitignore')
  })
})
