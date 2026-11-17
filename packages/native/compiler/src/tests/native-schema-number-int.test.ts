// `s.number()` and `s.number().int()` read what the web accepts, on both targets.
//
// The rule: a bare `number()` field is a `Double` (the web accepts `1.5`); only `.int()` promises a whole value and
// lowers to `Int` / `Long`. JavaScript has one number type, so `3.0` IS the integer 3: the web's `.int()` accepts it,
// and rejects `3.5`. Natively the input map can hold a whole number as a Double (`3.0`) or, on Android, as a platform
// `Int`, and the integer field's read rejected both (`as? Int` / `as? Long`), so a value the web accepts failed the
// native parse. This runs the EMITTED struct against the real runtime's `PyreonSchemaError` next to the real web library.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { s } from '@pyreon/validate'
import { jvmPath, kotlinToolchain } from './differential-harness'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')

const APP = `import { s } from '@pyreon/validate'
const Num = s.object({ n: s.number().int(), x: s.number(), o: s.number().int().optional() })
export function App() { return null }`

const web = s.object({ n: s.number().int(), x: s.number(), o: s.number().int().optional() })

/** Each input as the web value and as the map each native target builds from the same source. */
const CASES: { name: string; web: Record<string, unknown>; swift: string; kotlin: string }[] = [
  { name: 'integer and fraction', web: { n: 3, x: 1.5 }, swift: '["n": 3, "x": 1.5]', kotlin: '"n" to 3L, "x" to 1.5' },
  { name: 'a whole Double for .int()', web: { n: 3.0, x: 1.5 }, swift: '["n": 3.0, "x": 1.5]', kotlin: '"n" to 3.0, "x" to 1.5' },
  { name: 'a fraction for .int()', web: { n: 3.5, x: 1 }, swift: '["n": 3.5, "x": 1]', kotlin: '"n" to 3.5, "x" to 1L' },
  { name: 'an integer for number()', web: { n: 3, x: 2 }, swift: '["n": 3, "x": 2]', kotlin: '"n" to 3, "x" to 2' },
  { name: 'a string for .int()', web: { n: '3', x: 1 }, swift: '["n": "3", "x": 1]', kotlin: '"n" to "3", "x" to 1L' },
  { name: 'optional .int() given a whole Double', web: { n: 1, x: 1, o: 2.0 }, swift: '["n": 1, "x": 1, "o": 2.0]', kotlin: '"n" to 1L, "x" to 1L, "o" to 2.0' },
  { name: 'optional .int() given a fraction', web: { n: 1, x: 1, o: 2.5 }, swift: '["n": 1, "x": 1, "o": 2.5]', kotlin: '"n" to 1L, "x" to 1L, "o" to 2.5' },
]

const expected = (): string[] =>
  CASES.map((c) => {
    const r = web.parse(c.web)
    return r.ok ? `ok ${String(r.value.n)}` : 'bad'
  })

const between = (code: string, start: string, end: string): string => {
  const a = code.indexOf(start)
  const b = code.indexOf(end, a)
  return a >= 0 && b > a ? code.slice(a, b) : ''
}

function inTemp<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('number() is a Double, .int() an integer, on both targets', () => {
  it('Swift', () => {
    const { code } = transform(APP, { target: 'swift' })
    expect(code).toContain('var n: Int = 0')
    expect(code).toContain('var x: Double = 0')
    expect(code).toContain('var o: Int? = nil')
  })
  it('Kotlin', () => {
    const { code } = transform(APP, { target: 'kotlin' })
    expect(code).toContain('var n: Long = 0,')
    expect(code).toContain('var x: Double = 0.0,')
    expect(code).toContain('var o: Long? = null,')
  })
  it('the web oracle accepts 3.0 and rejects 3.5 for .int()', () => {
    expect(expected()).toEqual(['ok 3', 'ok 3', 'bad', 'ok 3', 'bad', 'ok 1', 'bad'])
  })
})

describe('the emitted parse compiles on the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin compiles against the stub', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('the emitted parse RUNS like the web library', () => {
  it.skipIf(!isSwiftcAvailable() || process.platform !== 'darwin')('Swift', () => {
    const struct = between(transform(APP, { target: 'swift' }).code, 'struct PyreonZodSchema_Num', 'let Num =')
    expect(struct).not.toBe('')
    const got = inTemp('pyreon-schema-int-swift-', (dir) => {
      const calls = CASES.map(
        (c) => `print((try? PyreonZodSchema_Num.parse(${c.swift} as [String: Any])).map { "ok \\($0.n)" } ?? "bad")`,
      ).join('\n')
      writeFileSync(join(dir, 'main.swift'), `import Foundation\n${struct}\n${calls}\n`)
      execFileSync(
        'swiftc',
        ['-module-cache-path', join(dir, 'mc'), '-o', join(dir, 'run'),
          join(REPO, 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonSchema.swift'), join(dir, 'main.swift')],
        { stdio: 'pipe' },
      )
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n')
    })
    expect(got.map((v, i) => `${CASES[i]!.name}: ${v}`)).toEqual(expected().map((v, i) => `${CASES[i]!.name}: ${v}`))
  }, 300_000)

  const kx = kotlinToolchain()
  it.skipIf(kx === undefined || jvmPath() === undefined)('Kotlin', () => {
    const struct = between(transform(APP, { target: 'kotlin' }).code, 'data class PyreonZodSchema_Num', 'val Num =')
    expect(struct).not.toBe('')
    const got = inTemp('pyreon-schema-int-kotlin-', (dir) => {
      const calls = CASES.map(
        (c) =>
          `    println(try { "ok " + PyreonZodSchema_Num.parse(mapOf<String, Any?>(${c.kotlin})).n } catch (e: PyreonSchemaError) { "bad" })`,
      ).join('\n')
      writeFileSync(
        join(dir, 'Main.kt'),
        `import com.pyreon.runtime.PyreonSchemaError\n\n${struct}\nfun main() {\n${calls}\n}\n`,
      )
      execFileSync(
        'kotlinc',
        ['-nowarn', `-Xplugin=${kx!.plugin}`, '-cp', kx!.classpath, join(dir, 'Main.kt'),
          join(REPO, 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonSchema.kt'), '-d', join(dir, 'out')],
        { stdio: 'pipe' },
      )
      return execFileSync(jvmPath() as string, ['-cp', `${join(dir, 'out')}:${kx!.classpath}:${kx!.stdlib}`, 'MainKt'], {
        encoding: 'utf8',
      }).trim().split('\n')
    })
    expect(got.map((v, i) => `${CASES[i]!.name}: ${v}`)).toEqual(expected().map((v, i) => `${CASES[i]!.name}: ${v}`))
  }, 600_000)
})
