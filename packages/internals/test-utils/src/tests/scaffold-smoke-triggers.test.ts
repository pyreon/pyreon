/**
 * The scaffold-smoke CI matrix runs only when a changed file matches one of
 * the TRIGGERS prefixes in `.github/workflows/ci.yml`. A prefix naming a
 * directory that does not exist can never match, so it silently removes that
 * package from the gate — the list named `packages/zero/zero-cli/` for months
 * after the CLI moved to `packages/zero/cli/`, so CLI changes never ran it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../../../..')

function triggerPrefixes(): string[] {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf-8')
  const block = ci.match(/TRIGGERS=\$\(cat <<'EOF'\n([\s\S]*?)\n\s*EOF/)
  if (!block) throw new Error('scaffold-smoke TRIGGERS block not found in ci.yml')
  return block[1]!
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

describe('scaffold-smoke trigger paths', () => {
  it('finds the list', () => {
    expect(triggerPrefixes().length).toBeGreaterThan(5)
  })

  it('every trigger path exists in the repo', () => {
    const missing = triggerPrefixes().filter((p) => !existsSync(join(ROOT, p)))
    expect(missing).toEqual([])
  })
})
