/**
 * `.email()` means what the AUTHORING library means, on every target, at every
 * precision — internationalised domains included (#4821).
 *
 * `@pyreon/validate`'s `.email()` accepts `jan@müller.de` (Unicode domain
 * labels) at `html5` / `standard` / `rfc5322`. PMTC lowered every `.email()` to
 * zod's ASCII approximation and ignored `precision`, so a device REJECTED an
 * address the web accepts (and accepted `a..b@x.com`, which the web rejects).
 *
 * So the rule now travels in the IR (`EmailRule`), and this file asserts the
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
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { resolveJava } from '../../../runtime-kotlin/scripts/java-runtime'

/** The `java` that runs jars here (never a bare `java` — see `resolveJava`). */
const JAVA = resolveJava() ?? 'java'

const APP = `import { s } from '@pyreon/validate'
import { Text } from '@pyreon/primitives'
const Contact = s.object({ std: s.string().email(), html: s.string().email({ precision: 'html5' }), rfc: s.string().email({ precision: 'rfc5322' }) })
export function App() { return <Text>x</Text> }`

const ZOD_APP = `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'
const Contact = zodSchema(z.object({ std: z.string().email() }))
export function App() { return <Text>x</Text> }`

/** Inputs chosen at every place the three regex engines could disagree. */
const CORPUS: string[] = [
  'user@example.com',
  "o'brien@x.co",
  'a@b.c',
  'a@b',
  'a..b@x.com',
  '.a@x.com',
  'a@-x.com',
  'a@x-.com',
  'a@x.c0m',
  'plainaddr',
  '',
  // IDN (#4821): Unicode labels in the domain, at every precision.
  'jan@müller.de',
  'jan@xn--mller-kva.de',
  'a@пример.рф',
  'user@例え.jp',
  'x@中国.中国',
  'a@e\u0301cole.fr',
  'a@ไทย.ไทย',
  'a@١٢٣.مصر',
  'jan@müller',
  'jän@müller.de',
  'jan@-müller.de',
  'jan@\u0301müller.de',
  'jan@müller..de',
  'jan@müller.d',
  'jan@😀.de',
  'jan@𝒜bc.de', // a supplementary-plane letter
  'jan@müller.d€',
  // punycode (what Chromium's <input type=email>.value returns), IDNA
  // separators, joiners, malformed A-labels.
  'a@xn--e1afmkfd.xn--p1ai',
  'a@b.XN--P1AI',
  'a@b.xn--',
  'a@b.xn---a',
  'a@b.xn--a-',
  'a@пример\u3002рф',
  'a@пример\uFF0Eрф',
  'a@пример\uFF61рф',
  'a@пример\u3002\u3002рф',
  'a@b\u200Cc.de',
  'a@b\u200Dc.de',
  'a@\u200Cb.de',
  // DNS label length (rfc5322): 63 passes, 64 does not — ASCII and Unicode.
  `a@${'b'.repeat(63)}.co`,
  `a@${'b'.repeat(64)}.co`,
  `a@x.${'ü'.repeat(64)}.de`,
  // A trailing line terminator: ICU and Java `$` match BEFORE it.
  'a@b.co\n',
  'jan@müller.de\n',
  'a@b.co\u2028',
  // `&&` / set syntax inside a class (Java / ICU) must stay literal.
  'a&&b@x.co',
  'a{|}~@x.co',
  // ICU folds long-s to `s` under case-insensitivity; the rule has no such flag.
  '\u017F@x.co',
  // rfc5322 lengths, counted in UTF-16 units like the web's `value.length`.
  `${'a'.repeat(64)}@b.co`,
  `${'a'.repeat(65)}@b.co`,
  `a@${'ü'.repeat(248)}.de`,
  `a@${'ü'.repeat(250)}.de`,
  `a@${'𝒜'.repeat(125)}.de`,
]

const web = {
  std: s.string().email(),
  html: s.string().email({ precision: 'html5' }),
  rfc: s.string().email({ precision: 'rfc5322' }),
}

const FIELDS = ['std', 'html', 'rfc'] as const

const expected = (): string[] =>
  CORPUS.map((v) => FIELDS.map((f) => (web[f].safeParse(v).ok ? '1' : '0')).join(''))

/** The emitted `if <cond> {` / `if (<cond>) throw` for one field's email check. */
function swiftCondition(code: string, field: string): string {
  const lines = code.split('\n')
  const i = lines.findIndex((l, n) => l.includes(`field: "${field}", rule: "email`) && n > 0)
  expect(i, `no email check for ${field}`).toBeGreaterThan(0)
  const m = /^\s*if (.*) \{$/.exec(lines[i - 1] as string)
  expect(m, lines[i - 1]).not.toBeNull()

  return (m as RegExpExecArray)[1] as string
}

function kotlinCondition(code: string, field: string): string {
  const line = code.split('\n').find((l) => l.includes(`("${field}", "email`))
  expect(line, `no email check for ${field}`).toBeDefined()
  const m = /if \((.*)\) throw PyreonSchemaError/.exec(line as string)
  expect(m, line).not.toBeNull()

  return (m as RegExpExecArray)[1] as string
}

const cases = (): string =>
  CORPUS.map((v) => [...v].map((c) => c.codePointAt(0)).join(',')).join('\n')

function jvmPath(): string | undefined {
  try {
    execFileSync(JAVA, ['-version'], { stdio: 'ignore' })
    return JAVA
  } catch {
    // fall through
  }
  for (const c of [
    '/opt/homebrew/opt/openjdk/bin/java',
    '/opt/homebrew/opt/openjdk@17/bin/java',
    '/usr/bin/java',
  ]) {
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

  it('lowers every precision without a warning', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('@pyreon/validate `.email()` is NOT the zod ASCII approximation', () => {
    expect(swiftCondition(swift.code, 'std')).toContain('\\p{L}')
    expect(swiftCondition(swift.code, 'std')).not.toContain('.caseInsensitive')
    expect(kotlinCondition(kotlin.code, 'std')).toContain('\\p{L}')
  })

  it('zod `.email()` keeps its rule', () => {
    expect(swiftCondition(transform(ZOD_APP, { target: 'swift' }).code, 'std')).toContain('.caseInsensitive')
  })

  it('a `precision` that cannot be read DECLINES by name instead of guessing a tier', () => {
    for (const bad of ['{ precision: P }', "{ precision: 'loose' }", '{ ...o }', 'OPTS']) {
      const src = APP.replace("{ precision: 'html5' }", bad)
      const r = transform(src, { target: 'swift' })
      expect(r.warnings.join('\n')).toMatch(/\.email\(\).*NOT email-validated on device/)
      expect(r.code).not.toContain('field: "html", rule: "email')
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
    const got = inTemp('pyreon-email-rule-swift-', (dir) => {
      const funcs = FIELDS.map(
        (f) =>
          `func ok_${f}(_ ${f}Val: String) -> Bool { if ${swiftCondition(code, f)} { return false }; return true }`,
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
  out.append([ok_std(v), ok_html(v), ok_rfc(v)].map { $0 ? "1" : "0" }.joined())
}
print(out.joined(separator: "\\n"))
`,
      )
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], {
        stdio: 'pipe',
      })

      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n')
    })
    const want = expected()
    expect(got.slice(0, want.length).map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`)).toEqual(
      want.map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`),
    )
  })

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'Kotlin',
    () => {
      const code = transform(APP, { target: 'kotlin' }).code
      const got = inTemp('pyreon-email-rule-kotlin-', (dir) => {
        const funcs = FIELDS.map(
          (f) =>
            `fun ok_${f}(${f}Val: String): Boolean { if (${kotlinCondition(code, f)}) return false; return true }`,
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
    listOf(ok_std(v), ok_html(v), ok_rfc(v)).joinToString("") { if (it) "1" else "0" }
  }
  print(out.joinToString("\\n"))
}
`,
        )
        execFileSync(
          'kotlinc',
          [join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'out.jar')],
          {
            stdio: 'pipe',
          },
        )

        return execFileSync(jvmPath() as string, ['-jar', join(dir, 'out.jar')], {
          encoding: 'utf8',
        }).split('\n')
      })
      const want = expected()
      expect(got.slice(0, want.length).map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`)).toEqual(
        want.map((v, i) => `${JSON.stringify(CORPUS[i])} ${v}`),
      )
    },
    300_000,
  )
})
