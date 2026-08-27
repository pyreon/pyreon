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
  // Discovery reads each example's own BUILD SCRIPT, which is the ground truth
  // for what PMTC compiles there. Matching a filename convention instead is a
  // guess, and the first cut of this file proved it: `*App.tsx` silently missed
  // `native-counter-ios/src/Counter.tsx` — the same list-disagrees-with-reality
  // hole this file exists to close, reintroduced by the file itself.
  //
  // A script may name its source either way, so both are tried and the one that
  // EXISTS wins: relative to its own example (`src/TasksApp.tsx`) or to the
  // repo root, which is how the platform wrappers reach the shared source
  // (`examples/native-finance/src/FinanceApp.tsx` from `native-finance-ios`).
  // Keying the result by resolved path dedupes the two wrappers that name the
  // same shared file.
  //
  // The web siblings are correctly absent: nothing compiles their
  // `entry-client.tsx` with PMTC, and no build script names it.
  const byPath = new Map<string, string>()
  for (const dir of readdirSync(EXAMPLES)) {
    if (!dir.startsWith('native-')) continue
    const scripts = join(EXAMPLES, dir, 'scripts')
    if (!existsSync(scripts)) continue
    for (const f of readdirSync(scripts)) {
      if (!f.endsWith('.sh')) continue
      const text = readFileSync(join(scripts, f), 'utf8')
      for (const m of text.matchAll(/[\w./-]*src\/[A-Za-z][A-Za-z0-9]*\.tsx/g)) {
        const ref = m[0]
        for (const candidate of [join(EXAMPLES, dir, ref), join(EXAMPLES, '..', ref)]) {
          if (!existsSync(candidate)) continue
          const rel = candidate.slice(candidate.indexOf('examples/') + 'examples/'.length)
          byPath.set(candidate, rel)
          break
        }
      }
    }
  }
  return [...byPath].map(([path, label]) => [label, path])
}

const ALL = nativeExampleApps()

/**
 * A shared source using `useNativeModule` names a class the APP provides
 * (`ios/DeviceInfo.swift`, `app/src/main/kotlin/.../DeviceInfo.kt`) — the FFI
 * escape hatch. The compiler does not know that type by design, so the stub
 * environment cannot resolve it and never could. Excluded, with the reason
 * CHECKED rather than asserted: the split is computed from the source, so it
 * cannot quietly widen to cover an example that fails for some other reason.
 */
const usesNativeModule = (path: string): boolean =>
  readFileSync(path, 'utf8').includes('useNativeModule')

const APPS = ALL.filter(([, p]) => !usesNativeModule(p))
const ESCAPE_HATCH = ALL.filter(([, p]) => usesNativeModule(p))

describe('every native example compiles on both targets', () => {
  it('found example apps to check', () => {
    // An empty scan is a SKIP masquerading as a pass.
    expect(APPS.length, 'no native example apps found — the gate measured nothing').toBeGreaterThan(0)
  })

  it.each(ESCAPE_HATCH)('%s is excluded for a REASON that still holds', (_name, path) => {
    // Not a hardcoded exclusion list. If an escape-hatch example ever stops
    // using `useNativeModule`, this stops matching and the file moves into the
    // compiled set on its own — an exclusion that cannot rot into cover for an
    // unrelated failure.
    expect(usesNativeModule(path)).toBe(true)
    // And it is not uncovered, just covered somewhere else: the app-provided
    // class only exists in a real build, which is what the device gate runs.
    const dir = path.slice(0, path.lastIndexOf('/src/'))
    const hasDeviceTest =
      existsSync(join(dir, 'iosUITests')) || existsSync(join(dir, 'app/src/androidTest'))
    expect(hasDeviceTest, `${dir} has no device test to cover what the stub gate cannot`).toBe(true)
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
