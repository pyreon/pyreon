import { globSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The repo root has NO vitest config of its own — only a router
 * (`vitest.config.mts`) whose `test.projects` maps every test file to the
 * package that owns it. Without it, `bunx vitest run <file>` from the root
 * runs on vitest's defaults (5,000ms timeout, parallel files), which is how
 * every kotlinc-spawning `@pyreon/native-compiler` spec failed with
 * `Test timed out in 5000ms` while passing from inside the package.
 *
 * This spec locks TOTALITY: every per-package config in the tree must be
 * covered by one of the router's globs, so a package added under a new
 * directory shape fails here instead of silently running on the defaults.
 */
const ROOT = resolve(import.meta.dirname, '../../../../..')

function walkConfigs(dir: string, depth: number, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    const cfg = join(full, 'vitest.config.ts')
    try {
      if (statSync(cfg).isFile()) out.push(cfg)
    } catch {
      /* no config here */
    }
    if (depth > 0) walkConfigs(full, depth - 1, out)
  }
}

describe('root vitest router', () => {
  it('routes every per-package vitest config through test.projects', async () => {
    const mod = (await import('../../../../../vitest.config.mts')) as {
      default: { test?: { projects?: unknown } }
    }
    const projects = mod.default.test?.projects
    expect(Array.isArray(projects), 'root vitest.config.mts must declare test.projects').toBe(true)
    const globs = (projects as unknown[]).filter((p): p is string => typeof p === 'string')

    const covered = new Set(
      globs.flatMap((g) => globSync(g, { cwd: ROOT }).map((p) => resolve(ROOT, p))),
    )

    const actual: string[] = []
    walkConfigs(join(ROOT, 'packages'), 2, actual)
    walkConfigs(join(ROOT, 'examples'), 1, actual)
    expect(actual.length, 'the walk found no per-package configs — the scan is broken').toBeGreaterThan(50)

    const missing = actual.filter((c) => !covered.has(c)).map((c) => c.slice(ROOT.length + 1))
    expect(missing, 'per-package vitest configs a root invocation would run on the DEFAULTS').toEqual([])

    // The package this exists for: its 180s budget must be what a root run resolves to.
    expect(covered.has(resolve(ROOT, 'packages/native/compiler/vitest.config.ts'))).toBe(true)
  })
})
