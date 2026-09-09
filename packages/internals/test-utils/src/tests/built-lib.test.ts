// The guard that stops a built-artifact spec from skipping silently.
//
// Both halves are load-bearing and they pull in opposite directions: locally a
// missing `lib/` must SKIP (a fresh worktree has none, and failing there tells
// a contributor to fix something that is not broken), while in CI — where the
// test cells are gated on the Bootstrap job — a skip would be a green suite
// that measured nothing.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { hasBuiltLib } from '../built-lib'

const dir = mkdtempSync(join(tmpdir(), 'pyreon-built-lib-'))
const present = join(dir, 'index.js')
const absent = join(dir, 'nope.js')
writeFileSync(present, 'export const x = 1\n')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const withEnv = <T,>(value: string | undefined, fn: () => T): T => {
  const prev = process.env['PYREON_REQUIRE_BUILT_LIB']
  if (value === undefined) delete process.env['PYREON_REQUIRE_BUILT_LIB']
  else process.env['PYREON_REQUIRE_BUILT_LIB'] = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env['PYREON_REQUIRE_BUILT_LIB']
    else process.env['PYREON_REQUIRE_BUILT_LIB'] = prev
  }
}

describe('hasBuiltLib', () => {
  it('is true for a present artifact, with or without the CI flag', () => {
    expect(withEnv(undefined, () => hasBuiltLib(present, 'a thing'))).toBe(true)
    expect(withEnv('1', () => hasBuiltLib(present, 'a thing'))).toBe(true)
  })

  it('skips for an absent artifact — and SAYS SO, naming what was skipped and the fix', () => {
    const lines: string[] = []
    const write = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((s: string) => {
      lines.push(String(s))
      return true
    }) as typeof process.stderr.write
    try {
      expect(withEnv(undefined, () => hasBuiltLib(absent, "the plot families' tree-shaking"))).toBe(false)
    } finally {
      process.stderr.write = write
    }
    // The message is the whole point: a silent `false` is the defect.
    expect(lines.join('')).toContain('SKIPPING')
    expect(lines.join('')).toContain("the plot families' tree-shaking")
    expect(lines.join('')).toContain(absent)
    expect(lines.join('')).toContain('bootstrap.ts')
  })

  it('THROWS for an absent artifact under PYREON_REQUIRE_BUILT_LIB=1, naming the artifact', () => {
    expect(() => withEnv('1', () => hasBuiltLib(absent, 'the published bin liveness'))).toThrow(/the published bin liveness/)
    expect(() => withEnv('1', () => hasBuiltLib(absent, 'x'))).toThrow(new RegExp(absent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    // …and says why a skip is not acceptable here, so the reader does not
    // "fix" it by weakening the guard.
    expect(() => withEnv('1', () => hasBuiltLib(absent, 'x'))).toThrow(/measured nothing/)
  })

  it('treats any value other than "1" as not-required', () => {
    expect(withEnv('0', () => hasBuiltLib(absent, 'x'))).toBe(false)
    expect(withEnv('true', () => hasBuiltLib(absent, 'x'))).toBe(false)
  })
})
