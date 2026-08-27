import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * The emit for a RUNTIME path param interpolates
 * `PyreonURL.encodePathParam(value)` into the URL, so that helper is the
 * native half of a contract whose other half is the web's
 * `encodeURIComponent(String(value))` (`@pyreon/http`'s `applyPathParams`).
 *
 * ONE source file produces both URLs. If the two encoders disagree by a single
 * character, the same generated call reaches a different endpoint on Android
 * than in the browser -- and it does so silently, on a value the author never
 * thought about (a space, a `#`, a `&`, an accented letter). That is not a
 * missing feature; it is a wrong request.
 *
 * So this asserts the contract by EXECUTION rather than by reading the code:
 * the corpus is generated from the real `encodeURIComponent`, the encoder is
 * extracted VERBATIM from the shipped runtime source (never re-typed here, so
 * it cannot drift away from what ships), compiled by the real toolchain, run,
 * and compared byte for byte.
 */

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonHttp.swift')
const KOTLIN_SRC = join(
  __dirname,
  '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonHttp.kt',
)

/** The shipped `PyreonURL` declaration, lifted out of its runtime file. */
function extractPyreonURL(path: string, opener: string): string {
  const src = readFileSync(path, 'utf8')
  const at = src.indexOf(opener)
  expect(at, `${opener} not found in ${path}`).toBeGreaterThan(-1)
  return src.slice(at)
}

/**
 * Drop comments so a scan for a symbol NAME cannot match prose.
 *
 * Not cosmetic: `PyreonURL`'s own doc comments NAME the three wrong
 * primitives, because explaining why `.urlPathAllowed` is not used is the most
 * useful thing that comment can say. A substring scan cannot tell that
 * explanation apart from a call, so the first version of the guard below
 * failed on the very documentation that makes the code correct -- the same
 * shape as the diagnose-catalog gate's prose-vs-symbol confusion.
 *
 * Line-based, and deliberately so: it is enough for these two blocks (neither
 * contains a string literal carrying `//` or a comment marker), and a real
 * Swift/Kotlin comment lexer would be more machinery than the guard is worth.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * The corpus. Every character CLASS the two encoders could disagree about:
 * the unreserved set they must both pass through, the reserved/delimiter set
 * that silently changes a URL's MEANING when unencoded (`/` adds a segment,
 * `?`/`&` open a query, `#` truncates at the fragment), whitespace (where a
 * path encoder and a form encoder famously differ: `%20` vs `+`), quoting
 * characters, and multi-byte UTF-8 -- which is where a plausible-looking
 * `CharacterSet.alphanumerics` silently passes an accented letter through.
 */
const STRINGS: string[] = [
  '',
  'plain',
  'u1',
  'UPPER',
  '0123456789',
  'a-b_c.d~e',
  "!*'()",
  'a b',
  '   ',
  'a\tb',
  'a\nb',
  '\r',
  '/',
  'a/b/c',
  '?',
  'a?b',
  '&',
  'a&b=c',
  '#',
  'a#b',
  '%',
  '%20',
  '+',
  'a+b',
  ':',
  ';',
  ',',
  '@',
  '$',
  '=',
  '[',
  ']',
  '{',
  '}',
  '|',
  '\\',
  '^',
  '`',
  '"',
  "'",
  '<',
  '>',
  'é',
  'héllo',
  '日本',
  '🙂',
  'Ω',
  'naïve café',
  '../../etc/passwd',
  ' ',
  '​',
  ' ',
]
/** `PathParams` is `Record<string, string | number>`, so numbers too. */
const NUMBERS: number[] = [0, 1, 42, -7, 1.5, -0.25, 2, 1e6, 123456789, 3.14159, 0.5]

const expectedFor = (v: string | number): string => encodeURIComponent(String(v))

/**
 * Integral values take the Int overload -- the one the compiler will pick for
 * an Int-typed param -- the rest take Double.
 */
const isIntegral = (n: number): boolean => Number.isInteger(n) && Math.abs(n) < 9e18

const caseLines = (): string[] => [
  ...STRINGS.map((s) => `s|${[...s].map((c) => c.codePointAt(0)).join(',')}`),
  ...NUMBERS.map((n) => (isIntegral(n) ? `i|${n}` : `d|${n}`)),
]
const expectedVector = (): string[] => [...STRINGS.map(expectedFor), ...NUMBERS.map(expectedFor)]

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * `kotlinc` compiles without a `java` on PATH (it ships its own), but RUNNING
 * the jar needs one -- and on a developer Mac the JDK is commonly installed
 * off PATH under Homebrew. Look there before declaring the executed half
 * unavailable: "no JVM" is very easy to conclude wrongly, and doing so turns a
 * real assertion into a silent skip.
 */
function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through to the off-PATH locations
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

describe('PyreonURL.encodePathParam -- parity with encodeURIComponent', () => {
  /**
   * The always-running half. It cannot prove parity, but it does refuse the
   * three specific WRONG primitives -- each of which compiles, looks correct,
   * and diverges: `URLEncoder.encode` is form-encoding (space becomes `+`),
   * `.urlPathAllowed` permits `/`, `&`, `+` and `=`, and
   * `CharacterSet.alphanumerics` contains non-ASCII letters.
   */
  it('uses neither form-encoding nor a too-permissive allowed set', () => {
    const swift = stripComments(extractPyreonURL(SWIFT_SRC, 'public enum PyreonURL {'))
    const kotlin = stripComments(extractPyreonURL(KOTLIN_SRC, 'object PyreonURL {'))
    expect(swift).not.toContain('urlPathAllowed')
    expect(swift).not.toContain('urlQueryAllowed')
    expect(swift).not.toContain('CharacterSet.alphanumerics')
    expect(kotlin).not.toContain('URLEncoder')
    // Both must carry the unreserved set `encodeURIComponent` passes through.
    expect(swift).toContain("-_.!~*'()")
    expect(kotlin).toContain("-_.!~*'()")
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift encoder matches, executed', () => {
    const got = withTempDir('pyreon-url-parity-swift-', (dir) => {
      const casesPath = join(dir, 'cases.txt')
      const harness = `import Foundation

${extractPyreonURL(SWIFT_SRC, 'public enum PyreonURL {')}

let lines = try! String(contentsOfFile: ${JSON.stringify(casesPath)}, encoding: .utf8)
  .split(separator: "\\n", omittingEmptySubsequences: false)
var out: [String] = []
for line in lines {
    let parts = line.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false)
    let kind = String(parts[0])
    let payload = parts.count > 1 ? String(parts[1]) : ""
    switch kind {
    case "s":
        let scalars = payload.isEmpty
          ? [] : payload.split(separator: ",").map { UnicodeScalar(UInt32($0)!)! }
        out.append(PyreonURL.encodePathParam(String(String.UnicodeScalarView(scalars))))
    case "i": out.append(PyreonURL.encodePathParam(Int(payload)!))
    case "d": out.append(PyreonURL.encodePathParam(Double(payload)!))
    default: break
    }
}
print(out.joined(separator: "\\n"))
`
      writeFileSync(casesPath, caseLines().join('\n'))
      writeFileSync(join(dir, 'main.swift'), harness)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], {
        stdio: 'pipe',
      })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n')
    })
    const expected = expectedVector()
    // Compare the WHOLE vector at once so a failure names every divergence,
    // not just the first.
    expect(got.slice(0, expected.length)).toEqual(expected)
  })

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin encoder matches, executed',
    () => {
      const java = jvmPath() as string
      const got = withTempDir('pyreon-url-parity-kotlin-', (dir) => {
        const casesPath = join(dir, 'cases.txt')
        const harness = `${extractPyreonURL(KOTLIN_SRC, 'object PyreonURL {')}

fun main() {
    val out = StringBuilder()
    java.io.File(${JSON.stringify(casesPath)}).readLines().forEachIndexed { i, line ->
        val kind = line.substringBefore('|')
        val payload = line.substringAfter('|', "")
        if (i > 0) out.append('\\n')
        when (kind) {
            "s" -> {
                val sb = StringBuilder()
                if (payload.isNotEmpty()) {
                    payload.split(",").forEach { sb.appendCodePoint(it.toInt()) }
                }
                out.append(PyreonURL.encodePathParam(sb.toString()))
            }
            "i" -> out.append(PyreonURL.encodePathParam(payload.toInt()))
            "d" -> out.append(PyreonURL.encodePathParam(payload.toDouble()))
        }
    }
    print(out)
}
`
        writeFileSync(casesPath, caseLines().join('\n'))
        writeFileSync(join(dir, 'Main.kt'), harness)
        execFileSync(
          'kotlinc',
          [join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'out.jar')],
          { stdio: 'pipe' },
        )
        return execFileSync(java, ['-jar', join(dir, 'out.jar')], { encoding: 'utf8' }).split('\n')
      })
      const expected = expectedVector()
      expect(got.slice(0, expected.length)).toEqual(expected)
    },
  )
})
