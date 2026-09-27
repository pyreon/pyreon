// The Kotlin compile daemon must never keep its HOST process alive.
//
// A test runner exits explicitly, so nothing here ever noticed; a CLI ends
// when its event loop drains. `@pyreon/lathe generate` verifies native output
// through `validateKotlin`, and the referenced daemon child (plus its piped
// stdin/stderr) held the loop open forever — the command did all its work and
// then hung. Spawns a real process that validates once and must EXIT.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable } from '../validate'

const VALIDATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'validate.ts')

describe.skipIf(!isKotlincAvailable())('kotlin daemon lifecycle', () => {
  it('a process that validated Kotlin exits on its own', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-daemon-exit-'))
    try {
      const script = join(dir, 'host.ts')
      writeFileSync(
        script,
        `import { validateKotlin } from ${JSON.stringify(VALIDATE)}\n` +
          `const r = validateKotlin('fun main() { println("x") }')\n` +
          `console.log(r.ok ? 'ok' : 'fail')\n`,
      )
      // A per-run verdict cache dir and NO shared spool, so this host starts
      // (and must release) its own daemon rather than a cached verdict.
      const env = { ...process.env, PYREON_VALIDATE_NO_CACHE: '1' }
      delete (env as Record<string, string | undefined>).PYREON_KOTLIN_DAEMON_SPOOL
      const r = spawnSync('bun', [script], { env, timeout: 180_000, encoding: 'utf8' })
      // A hang is `timeout` → signal SIGTERM and status null.
      expect(r.signal, r.stderr).toBeNull()
      expect(r.status, r.stderr).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 240_000)
})
