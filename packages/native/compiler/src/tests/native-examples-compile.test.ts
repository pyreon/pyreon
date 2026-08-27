import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * Every shipped `examples/native-*` app must COMPILE on both targets.
 *
 * The fixture corpus covers shapes someone thought to write a fixture for. The
 * examples are what a person actually reads, copies, and scaffolds from — and
 * one of them (`native-viz`, the charts webview showcase) did not build on
 * Android at all, while the gate that certified its mechanism was counting
 * warnings. A warning count answers "did the frontend complain"; only a compile
 * answers "does the output build".
 *
 * Discovered rather than listed: a new App.tsx under any examples/native-
 * directory is
 * covered the day it lands, with no list to remember to update. An empty scan
 * FAILS — a file-scanning check that finds nothing and reports success is the
 * shape this repo has been bitten by before.
 */
const EXAMPLES = join(import.meta.dirname, '../../../../../examples')

function nativeExampleApps(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const dir of readdirSync(EXAMPLES)) {
    if (!dir.startsWith('native-')) continue
    const src = join(EXAMPLES, dir, 'src')
    if (!existsSync(src)) continue
    for (const f of readdirSync(src)) {
      if (f.endsWith('App.tsx')) out.push([dir, join(src, f)])
    }
  }
  return out
}

const APPS = nativeExampleApps()

describe('every native example compiles on both targets', () => {
  it('found example apps to check', () => {
    // An empty scan is a SKIP masquerading as a pass.
    expect(APPS.length, 'no native example apps found — the gate measured nothing').toBeGreaterThan(0)
  })

  describe.runIf(isSwiftcAvailable())('swiftc -typecheck against stubs', () => {
    it.each(APPS)('%s', (_name, path) => {
      const r = validateSwiftWithStubs(transform(readFileSync(path, 'utf8'), { target: 'swift' }).code)
      expect(r.ok, r.ok ? '' : String(r.error).split('\n').slice(0, 6).join('\n')).toBe(true)
    })
  })

  describe.runIf(isKotlincAvailable())('kotlinc against stubs', () => {
    it.each(APPS)('%s', (_name, path) => {
      const r = validateKotlin(transform(readFileSync(path, 'utf8'), { target: 'kotlin' }).code)
      expect(r.ok, r.ok ? '' : String(r.error).split('\n').slice(0, 6).join('\n')).toBe(true)
    })
  })
})
