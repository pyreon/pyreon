/**
 * `.url()` means what the AUTHORING library means, on every target.
 *
 * `@pyreon/validate`'s `.url()` is http(s)-only; zod's accepts any scheme. PMTC
 * lowered both to zod's rule, so a device ACCEPTED `javascript:alert(1)` for an
 * `s.string().url()` field the web rejects -- the check existing to keep it out
 * of a rendered link. And `.url({ protocol })` lowered with its option ignored.
 *
 * So the rule now travels in the IR (`UrlRule`), and this file asserts the
 * contract by EXECUTION: the check the compiler EMITS is lifted out of its
 * output, compiled by the real `swiftc` / `kotlinc`, run over a corpus, and
 * compared verdict for verdict with `@pyreon/validate` itself on the web.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { s } from '@pyreon/validate'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const ANY = '/^[a-z][a-z0-9+.-]*$/i'
const MAIL = '/^(https|mailto)$/'

const APP = `import { s } from '@pyreon/validate'
import { Text } from '@pyreon/primitives'
const Link = s.object({ web: s.string().url(), any: s.string().url({ protocol: ${ANY} }), mail: s.string().url({ protocol: ${MAIL} }) })
export function App() { return <Text>x</Text> }`

const ZOD_APP = `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'
const Link = zodSchema(z.object({ web: z.string().url() }))
export function App() { return <Text>x</Text> }`

/** Inputs chosen at every place the three regex engines could disagree. */
const CORPUS: string[] = [
  'https://x.io',
  'http://a.b/c?d=1',
  'HTTPS://X.IO',
  'javascript:alert(1)',
  'data:text/html,x',
  'mailto:a@b.co',
  'ftp://x',
  'urn:isbn:0451',
  'git:git.example.com/o/r.git',
  'nope',
  '',
  '/relative',
  'https://',
  'https:// x',
  'https://x y',
  // A trailing line terminator: ICU and Java `$` match BEFORE it.
  'https://x.io\n',
  'mailto:a@b.co\n',
  // JS `\s` members ICU / Java `\s` lack.
  'https://x.io\u000B',
  'https://x.io\uFEFF',
  'https://x.io\u00A0',
  'https://x\u3000y',
  // JS `.` matches U+0085; ICU and Java `.` do not.
  'https://x\u0085y',
  'https://\u0085y',
  // ICU folds long-s to `s` under case-insensitivity; JS does not.
  'http\u017F://x.io',
  '1http://x',
  ':nope',
  'about:',
  'https://日本.jp',
  'https://x.io/🙂',
]

const web = {
  web: s.string().url(),
  any: s.string().url({ protocol: /^[a-z][a-z0-9+.-]*$/i }),
  mail: s.string().url({ protocol: /^(https|mailto)$/ }),
}
const FIELDS = ['web', 'any', 'mail'] as const
const expected = (): string[] =>
  CORPUS.map((v) => FIELDS.map((f) => (web[f].safeParse(v).ok ? '1' : '0')).join(''))

/** The emitted `if <cond> {` / `if (<cond>) throw` for one field's url check. */
function swiftCondition(code: string, field: string): string {
  const lines = code.split('\n')
  const i = lines.findIndex((l, n) => l.includes(`field: "${field}", rule: "url`) && n > 0)
  expect(i, `no url check for ${field}`).toBeGreaterThan(0)
  const m = /^\s*if (.*) \{$/.exec(lines[i - 1] as string)
  expect(m, lines[i - 1]).not.toBeNull()
  return (m as RegExpExecArray)[1] as string
}
function kotlinCondition(code: string, field: string): string {
  const line = code.split('\n').find((l) => l.includes(`("${field}", "url`))
  expect(line, `no url check for ${field}`).toBeDefined()
  const m = /if \((.*)\) throw PyreonSchemaError/.exec(line as string)
  expect(m, line).not.toBeNull()
  return (m as RegExpExecArray)[1] as string
}

const cases = (): string => CORPUS.map((v) => [...v].map((c) => c.codePointAt(0)).join(',')).join('\n')

function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through
  }
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java', '/usr/bin/java']) {
    if (existsSync(c)) return c
  }
  return undefined
}

function inTemp<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('the emitted rule follows the authoring library', () => {
  const swift = transform(APP, { target: 'swift' })
  const kotlin = transform(APP, { target: 'kotlin' })

  it('lowers every form without a warning', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('@pyreon/validate `.url()` is NOT the any-scheme parser check', () => {
    expect(swiftCondition(swift.code, 'web')).not.toContain('URL(string:')
    expect(kotlinCondition(kotlin.code, 'web')).not.toContain('java.net.URI')
  })

  it('zod `.url()` keeps its any-scheme rule', () => {
    expect(swiftCondition(transform(ZOD_APP, { target: 'swift' }).code, 'web')).toContain('URL(string: webVal)?.scheme == nil')
  })

  it('a `protocol` that cannot port DECLINES by name instead of falling back to http(s)', () => {
    for (const bad of ['PROTO', '/^https?$/g', '{ ...o }']) {
      const src = APP.replace(`{ protocol: ${ANY} }`, bad === '{ ...o }' ? bad : `{ protocol: ${bad} }`)
      const r = transform(src, { target: 'swift' })
      expect(r.warnings.join('\n')).toMatch(/\.url\(\).*NOT (URL-)?validated on device/)
      expect(r.code).not.toContain('field: "any", rule: "url')
    }
  })
})

describe('the emitted modules survive the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin compiles against the stub', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('web <-> native verdict parity, executed', () => {
  it.skipIf(!isSwiftcAvailable())('Swift', () => {
    const code = transform(APP, { target: 'swift' }).code
    const got = inTemp('pyreon-url-rule-swift-', (dir) => {
      const funcs = FIELDS.map(
        (f) => `func ok_${f}(_ ${f}Val: String) -> Bool { if ${swiftCondition(code, f)} { return false }; return true }`,
      ).join('\n')
      writeFileSync(join(dir, 'cases.txt'), cases())
      writeFileSync(
        join(dir, 'main.swift'),
        `import Foundation
${funcs}
let text = try! String(contentsOfFile: ${JSON.stringify(join(dir, 'cases.txt'))}, encoding: .utf8)
var out: [String] = []
for line in text.split(separator: "\\n", omittingEmptySubsequences: false) {
  let scalars = line.isEmpty ? [] : line.split(separator: ",").map { UnicodeScalar(UInt32($0)!)! }
  let v = String(String.UnicodeScalarView(scalars))
  out.append([ok_web(v), ok_any(v), ok_mail(v)].map { $0 ? "1" : "0" }.joined())
}
print(out.joined(separator: "\\n"))
`,
      )
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n')
    })
    const want = expected()
    expect(got.slice(0, want.length).map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`)).toEqual(
      want.map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`),
    )
  })

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)('Kotlin', () => {
    const code = transform(APP, { target: 'kotlin' }).code
    const got = inTemp('pyreon-url-rule-kotlin-', (dir) => {
      const funcs = FIELDS.map(
        (f) => `fun ok_${f}(${f}Val: String): Boolean { if (${kotlinCondition(code, f)}) return false; return true }`,
      ).join('\n')
      writeFileSync(join(dir, 'cases.txt'), cases())
      writeFileSync(
        join(dir, 'Main.kt'),
        `${funcs}
fun main() {
  val lines = java.io.File(${JSON.stringify(join(dir, 'cases.txt'))}).readText().split("\\n")
  val out = lines.map { line ->
    val sb = StringBuilder()
    if (line.isNotEmpty()) line.split(",").forEach { sb.appendCodePoint(it.toInt()) }
    val v = sb.toString()
    listOf(ok_web(v), ok_any(v), ok_mail(v)).joinToString("") { if (it) "1" else "0" }
  }
  print(out.joinToString("\\n"))
}
`,
      )
      execFileSync('kotlinc', [join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'out.jar')], {
        stdio: 'pipe',
      })
      return execFileSync(jvmPath() as string, ['-jar', join(dir, 'out.jar')], { encoding: 'utf8' }).split('\n')
    })
    const want = expected()
    expect(got.slice(0, want.length).map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`)).toEqual(
      want.map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`),
    )
  }, 300_000)
})
