import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkRootArg, nearestCommand } from './unknown-command'

// A fresh cwd per run: the pre-fix bin, run by a bisect, starts a dev
// server that CREATES `<cwd>/biuld/.vite` — a shared tmpdir would then
// hold a real `biuld` directory and turn every later run green-by-accident.
let cwd: string
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'zero-typo-'))
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

describe('zero [root] typo guard', () => {
  it('suggests the nearest command for a typo', () => {
    expect(checkRootArg('biuld', cwd)).toBe(
      '[Pyreon] "biuld" is not a zero command or a directory. Did you mean "zero build"?',
    )
    expect(nearestCommand('previwe')).toBe('preview')
    expect(nearestCommand('doctr')).toBe('doctor')
  })

  it('omits a suggestion when nothing is close', () => {
    expect(checkRootArg('kubernetes', cwd)).toContain('Run "zero --help"')
  })

  it('accepts an existing directory and an absent root', () => {
    expect(checkRootArg(cwd)).toBeNull()
    expect(checkRootArg(undefined, cwd)).toBeNull()
  })

  // The shipped bin loads `lib/` — run `bun scripts/bootstrap.ts` after
  // editing src, or this spec tests the previous build.
  it('the shipped bin exits 1 on a typo instead of starting a dev server', () => {
    const BIN = resolve(import.meta.dirname, '../../bin/zero.js')
    const result = spawnSync(process.execPath, [BIN, 'biuld'], {
      cwd,
      timeout: 30_000,
      encoding: 'utf-8',
    })
    expect(result.status).toBe(1)
  })
})
