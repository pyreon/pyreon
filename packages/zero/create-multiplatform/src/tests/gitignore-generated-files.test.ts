import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

/**
 * A scaffolded multiplatform app ignores the files Pyreon tooling writes into
 * its root: `@pyreon/vite-plugin`'s `.pyreon-lpih.json` (dev perf hints, on by
 * default) and `.pyreon/context.json` (AI context map) on every dev session,
 * and the temporary `__pyreon-zero-ss{g,r}-entry.js` a `@pyreon/zero` build
 * writes and removes in `finally`. The whole scaffold is written to a temp
 * directory and `git check-ignore` reads its real `.gitignore`.
 */

const GENERATED = [
  '.pyreon-lpih.json',
  '.pyreon/context.json',
  '__pyreon-zero-ssg-entry.js',
  '__pyreon-zero-ssr-entry.js',
  // The per-build name a build actually writes (see `syntheticEntryPath`).
  '__pyreon-zero-ssg-entry-4242-0a1b2c3d.js',
  '__pyreon-zero-ssr-entry-4242-0a1b2c3d.js',
]

describe('scaffolded .gitignore covers generated project-root files', () => {
  it('git check-ignore matches every generated path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-mp-ignore-'))
    try {
      for (const f of buildScaffold({ name: 'demo-app' })) {
        mkdirSync(dirname(join(dir, f.path)), { recursive: true })
        writeFileSync(join(dir, f.path), f.content)
      }
      const git = (...args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      expect(git('init', '-q').status).toBe(0)
      // Only the scaffolded rules count: no global excludes file from the machine.
      const r = git('-c', 'core.excludesFile=/dev/null', 'check-ignore', '--no-index', ...GENERATED)
      const ignored = new Set(r.stdout.split('\n').filter(Boolean))
      expect(GENERATED.filter((p) => !ignored.has(p))).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
