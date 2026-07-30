/**
 * The leak check, end to end — real GC (bun), the real reactive-devtools
 * registry, the real Vite loader — against a fixture project with a component
 * that LEAKS one reactive node per mount by construction (a computed on a
 * module-level signal, parked in a module-level array).
 *
 * Spawned as a subprocess for the same reason `scan-mount.test.ts` is: the
 * scan owns its process. Assertions are exit code + the summary line.
 *
 * Bisect-verified: with the leak verdict forced to skip, the Leaky scenarios
 * verify (interaction passes — the component mounts fine; leaking is its only
 * crime) and this spec fails on the exit code.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../../../../..')
const BIN = resolve(ROOT, 'packages/tools/atlas/bin/atlas.js')
const FIXTURE = 'packages/tools/atlas/src/plugins/tests/fixtures/leaky-project'

describe('atlas scan catches a real subscription-retention leak', () => {
  it('fails ONLY the leaking component, with the accumulation trajectory named', () => {
    const run = spawnSync('bun', [BIN, 'scan', FIXTURE, '--no-write'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300_000,
    })
    // Red scan, red exit — and exactly the two Leaky scenarios named. Clean
    // stays verified: a leak checker that cries wolf on a clean component
    // costs more trust than it earns.
    expect(run.status, run.stderr).toBe(1)
    expect(run.stdout).toMatch(/2 component\(s\), 4 scenario\(s\) — 2 verified, 2 failing/)
    expect(run.stderr).toContain('failing scenario(s): leaky--empty, leaky--long-content')
  })
})
