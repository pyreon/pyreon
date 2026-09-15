import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { _resetKotlincCache, kotlinChartAugmentation, validateKotlin } from '../validate'
import { _resetValidateCache, withVerdictCache } from '../validate-cache'

// An absent tool must SKIP. The skip check used to live only inside the cached
// path, and kotlinc's captured version is '' whether or not it is installed
// (it prints the version on stderr), so a verdict stored under '' by a machine
// WITH kotlinc answered a machine without it.
const SOURCE = '@Composable fun Planted() {}'
let dir: string
const saved = { PATH: process.env.PATH, cache: process.env.PYREON_VALIDATE_CACHE_DIR }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-absent-tool-'))
  process.env.PYREON_VALIDATE_CACHE_DIR = dir
  delete process.env.PYREON_VALIDATE_NO_CACHE
  delete process.env.PYREON_SKIP_NATIVE_VALIDATE
  delete process.env.PYREON_REQUIRE_NATIVE_VALIDATE
  _resetValidateCache()
  _resetKotlincCache()
})

afterEach(() => {
  process.env.PATH = saved.PATH
  if (saved.cache === undefined) delete process.env.PYREON_VALIDATE_CACHE_DIR
  else process.env.PYREON_VALIDATE_CACHE_DIR = saved.cache
  _resetValidateCache()
  _resetKotlincCache()
  rmSync(dir, { recursive: true, force: true })
})

describe('an absent kotlinc skips even when a verdict is stored for the source', () => {
  it('skips instead of returning the planted verdict', () => {
    // Plant exactly the entry a machine with kotlinc would have written.
    withVerdictCache('kotlin', '', KOTLIN_COMPOSE_STUBS + kotlinChartAugmentation(SOURCE), SOURCE, () => ({
      ok: true,
    }))
    _resetValidateCache()
    process.env.PATH = ''
    const r = validateKotlin(SOURCE)
    expect(r.skipped).toBe(true)
    expect(r.skipReason).toBe('kotlinc not on PATH')
  })
})
