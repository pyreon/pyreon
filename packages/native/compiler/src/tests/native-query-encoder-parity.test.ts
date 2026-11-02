import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// The ORACLE: the web's own query serializer, not a re-statement of it.
import { buildQuery } from '../../../../fundamentals/http/src/url'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * A RUNTIME query value (`query: { q: search(), page: page() }`) cannot be serialized at compile time, so the emit
 * calls `PyreonURL.query(joiner, key, value, …)` and the runtime builds the string. That helper is the native half of a
 * contract whose web half is `@pyreon/http`'s `buildQuery` → `URLSearchParams`: one source file produces both URLs, and
 * a single differing byte sends the same call to a different resource.
 *
 * Asserted by EXECUTION, the `native-url-encoder-parity` way: the expected strings come from the real `buildQuery`, the
 * helper is lifted VERBATIM out of the shipped runtime source, compiled by the real toolchain, run, and compared byte
 * for byte. The corpus covers each branch of the web serializer — form-encoding of every character class (space → `+`,
 * the `*-._` literals, `~!'()` escaped, multi-byte UTF-8), JavaScript `String(number)` (whole doubles, exponent forms,
 * `-0`, NaN / Infinity), booleans, a dropped `null` / `undefined`, an array repeating its key with its nulls dropped,
 * and a record whose every value drops (no `?` at all).
 */

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonHttp.swift')
const SWIFT_JSON_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonJSON.swift')
const KOTLIN_SRC = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonHttp.kt')

type Scalar = string | number | boolean | null | undefined
type Value = Scalar | readonly Scalar[]
type Case = readonly (readonly [string, Value])[]

const CASES: readonly Case[] = [
  [['q', 'hello world']],
  [['q', "a&b=c+d#e?f/g'h*i~j!k(l)m.n-o_p"]],
  [['q', 'žluťoučký kůň 日本 🙂']],
  [['k e/y&', 'v']],
  [['page', 2], ['n', 1.5], ['big', 1e21], ['tiny', 1e-7], ['neg', -0], ['whole', 7.0], ['frac', 0.1 + 0.2]],
  [['nan', Number.NaN], ['inf', Number.POSITIVE_INFINITY], ['ninf', Number.NEGATIVE_INFINITY]],
  [['on', true], ['off', false]],
  [['gone', null], ['kept', 'x'], ['also', undefined]],
  [['tag', ['a', 'b c', null, 'd']], ['id', [1, 2.5, undefined]]],
  [['a', null], ['b', undefined]],
  [['empty', ''], ['arr', []]],
]

/** What the web sends for a case. */
const expected = (c: Case): string => buildQuery(Object.fromEntries(c) as never)

/** A string literal in Swift source, every non-ASCII scalar escaped. */
const swiftLit = (s: string): string =>
  `"${[...s]
    .map((ch) => {
      const cp = ch.codePointAt(0) as number
      if (ch === '"' || ch === '\\') return `\\${ch}`
      return cp < 0x20 || cp > 0x7e ? `\\u{${cp.toString(16)}}` : ch
    })
    .join('')}"`

/** A string literal in Kotlin source: UTF-16 units escaped, `$` too. */
const kotlinLit = (s: string): string =>
  `"${Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))
    .map((u) => {
      const ch = String.fromCharCode(u)
      if (ch === '"' || ch === '\\' || ch === '$') return `\\${ch}`
      return u < 0x20 || u > 0x7e ? `\\u${u.toString(16).padStart(4, '0')}` : ch
    })
    .join('')}"`

function swiftNumber(n: number): string {
  if (Number.isNaN(n)) return 'Double.nan'
  if (n === Number.POSITIVE_INFINITY) return 'Double.infinity'
  if (n === Number.NEGATIVE_INFINITY) return '-Double.infinity'
  if (Object.is(n, -0)) return '(-0.0 as Double)'
  // An integral value with no fraction in the source is an Int, as the compiler would type `page()`.
  return Number.isInteger(n) && Math.abs(n) < 2 ** 53 && !String(n).includes('e') ? `${n}` : `(${n} as Double)`
}

function kotlinNumber(n: number): string {
  if (Number.isNaN(n)) return 'Double.NaN'
  if (n === Number.POSITIVE_INFINITY) return 'Double.POSITIVE_INFINITY'
  if (n === Number.NEGATIVE_INFINITY) return 'Double.NEGATIVE_INFINITY'
  if (Object.is(n, -0)) return '(-0.0)'
  return Number.isInteger(n) && Math.abs(n) < 2 ** 53 && !String(n).includes('e') ? `${n}L` : `(${n})`
}

function scalarFor(v: Scalar, lang: 'swift' | 'kotlin'): string {
  if (v === null || v === undefined) return lang === 'swift' ? '(nil as String?)' : 'null'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return lang === 'swift' ? swiftNumber(v) : kotlinNumber(v)
  return lang === 'swift' ? swiftLit(v) : kotlinLit(v)
}

function valueFor(v: Value, lang: 'swift' | 'kotlin'): string {
  if (!Array.isArray(v)) return scalarFor(v as Scalar, lang)
  const items = (v as readonly Scalar[]).map((x) => scalarFor(x, lang))
  if (lang === 'kotlin') return `listOf<Any?>(${items.join(', ')})`
  return `([${items.join(', ')}] as [Any?])`
}

const callFor = (c: Case, lang: 'swift' | 'kotlin'): string => {
  const lit = lang === 'swift' ? swiftLit : kotlinLit
  const args = [lit('?'), ...c.flatMap(([k, v]) => [lit(k), valueFor(v, lang)])]
  return `PyreonURL.query(${args.join(', ')})`
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * The shipped `PyreonURL` declaration, lifted out of its runtime file. It is sliced to END OF FILE, so `PyreonURL`
 * must stay the LAST declaration in both runtime files — anything appended after it is compiled into this harness
 * without its dependencies (the uploads section did exactly that, and every encoder parity spec failed to compile).
 */
const extract = (path: string, opener: string): string => {
  const src = readFileSync(path, 'utf8')
  const at = src.indexOf(opener)
  expect(at, `${opener} not found in ${path}`).toBeGreaterThan(-1)
  return src.slice(at)
}

function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through to the off-PATH locations
  }
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java', '/usr/bin/java']) {
    if (existsSync(c)) return c
  }
  return undefined
}

describe('PyreonURL.query -- parity with the web buildQuery', () => {
  it('the corpus is discriminating: it exercises a drop, an array and an empty result', () => {
    const all = CASES.map(expected)
    expect(all).toContain('')
    expect(all.some((q) => q.includes('tag=a&tag=b+c&tag=d'))).toBe(true)
    expect(all.some((q) => q.includes('%7E'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift helper matches, executed', () => {
    const got = withTempDir('pyreon-query-parity-swift-', (dir) => {
      const harness = `import Foundation

${readFileSync(SWIFT_JSON_SRC, 'utf8').replace(/^import .*$/gm, '')}

${extract(SWIFT_SRC, 'public enum PyreonURL {')}

${CASES.map((c) => `print(${callFor(c, 'swift')})`).join('\n')}
`
      writeFileSync(join(dir, 'main.swift'), harness)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n')
    })
    expect(got.slice(0, CASES.length)).toEqual(CASES.map(expected))
  })

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin helper matches, executed',
    () => {
      const java = jvmPath() as string
      const got = withTempDir('pyreon-query-parity-kotlin-', (dir) => {
        const harness = `${extract(KOTLIN_SRC, 'object PyreonURL {')}

fun main() {
${CASES.map((c) => `    println(${callFor(c, 'kotlin')})`).join('\n')}
}
`
        writeFileSync(join(dir, 'Main.kt'), harness)
        execFileSync('kotlinc', [join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')], {
          stdio: 'pipe',
        })
        return execFileSync(java, ['-jar', join(dir, 'run.jar')], { encoding: 'utf8' }).split('\n')
      })
      expect(got.slice(0, CASES.length)).toEqual(CASES.map(expected))
    },
    240_000,
  )
})
