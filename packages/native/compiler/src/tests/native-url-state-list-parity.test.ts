import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inferSerializer } from '../../../../fundamentals/url-state/src/serializers'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * `useUrlState('tags', ['a', 'b'])` lowers to a list binding over the web's COMMA format, so the router runtimes'
 * list codec is the native half of a contract whose other half is `inferSerializer` (`@pyreon/url-state`).
 *
 * One source file produces both URLs and reads both back. A single disagreement is a silent wrong value on a pasted
 * deep link: `?tags=a%2cb` is one element on the web, and two if a decoder splits before it unescapes.
 *
 * So the contract is asserted by EXECUTION, the way `native-url-encoder-parity` does it: the expected vector comes
 * from the real web serializer, the runtime is lifted VERBATIM from the shipped source (never re-typed here, so it
 * cannot drift from what ships), compiled by the real toolchain, run, and compared byte for byte.
 *
 * One rule is the NATIVE side's, not the web's: an Int list holds integers only, so a fractional or out-of-range
 * element makes the whole list the default, exactly like the scalar Int binding does for one value. The expected
 * vector applies that rule explicitly rather than pretending the two agree.
 */

const SWIFT_SRC = join(__dirname, '../../../router-swift/Sources/PyreonRouter/PyreonUrlState.swift')
const KOTLIN_SRC = join(__dirname, '../../../router-kotlin/src/main/kotlin/com/pyreon/router/PyreonUrlState.kt')

type Kind = 'strings' | 'ints' | 'doubles' | 'bools'
const DEFAULTS: Record<Kind, unknown[]> = {
  strings: ['d'],
  ints: [-9],
  doubles: [-9.5],
  bools: [true],
}
/** Raw query values: every class the codec could disagree about. Printable ASCII, no `|` (the repr separator). */
const RAWS: string[] = [
  '',
  'a',
  'a,b',
  'a,,b',
  'a,',
  ',a',
  ',',
  ',,',
  '50%',
  '50%,x',
  'a%2Cb',
  'a%2cb,c',
  '%252C',
  '%25',
  '%2C',
  '%2',
  '%',
  '1,2,3',
  '1, 2',
  ' 1,2',
  '1,2 ',
  '1.5,2',
  '-1,+2',
  '0x10,0b11,0o7',
  '1,x',
  '1,,2',
  '1e3,2e-2',
  '9007199254740991',
  '9007199254740993',
  '3000000000,1',
  'Infinity,-Infinity',
  'NaN',
  'inf',
  '1_0',
  '1.5f',
  'true,0,false,1',
  'true,yes',
  'TRUE',
  '1,0',
]

/** What the web serializer yields for `raw`, as the repr both harnesses print. Int lists apply the native-only integer rule. */
function expectedGet(kind: Kind, raw: string): string {
  const def = DEFAULTS[kind]
  const ser = inferSerializer(DEFAULTS[kind], 'comma')
  let out = ser.deserialize(raw) as unknown[]
  if (kind === 'ints' && out.some((n) => !Number.isInteger(n) || Math.abs(n as number) > 9007199254740991)) out = def
  return repr(kind, out)
}

const repr = (_kind: Kind, list: unknown[]): string => list.map((e) => String(e)).join('|')

/** Values written back, per kind (strings carry the escape set). */
const SETS: Record<Kind, unknown[][]> = {
  strings: [[], ['a'], ['a', 'b'], ['a,b', '50%', 'x'], ['%2C'], ['', ''], ['é']],
  ints: [[], [1], [1, -2, 300], [9007199254740991]],
  doubles: [[], [1.5], [2, 2.5], [0.1, -3], [Infinity, -Infinity]],
  bools: [[], [true], [true, false, true]],
}

const expectedSet = (kind: Kind, list: unknown[]): string => {
  const ser = inferSerializer(DEFAULTS[kind], 'comma')
  return ser.serialize(list)
}

const cp = (s: string): string => [...s].map((c) => c.codePointAt(0)).join(',')

/** Case file: `g|kind|<codepoints of raw>` reads, `s|kind|<elements>` writes (strings by code point, others verbatim). */
function caseLines(): string[] {
  const lines: string[] = []
  for (const kind of ['strings', 'ints', 'doubles', 'bools'] as Kind[]) {
    for (const raw of RAWS) lines.push(`g|${kind}|${cp(raw)}`)
    for (const list of SETS[kind]) {
      const enc = kind === 'strings' ? list.map((e) => cp(String(e))).join(';') : list.map((e) => String(e)).join(';')
      lines.push(`s|${kind}|${enc}`)
    }
  }
  return lines
}

function expectedVector(): string[] {
  const out: string[] = []
  for (const kind of ['strings', 'ints', 'doubles', 'bools'] as Kind[]) {
    for (const raw of RAWS) out.push(expectedGet(kind, raw))
    for (const list of SETS[kind]) out.push(expectedSet(kind, list))
  }
  return out
}

/** The region the validation stubs mirror: everything after the `stub-mirror` marker. */
function mirrorRegion(path: string): string {
  const text = readFileSync(path, 'utf8')
  const marker = /^\/\/ MARK: (?:- )?stub-mirror\n/m.exec(text)
  expect(marker, `${path} has no stub-mirror marker`).not.toBeNull()
  return text.slice(marker!.index + marker![0].length)
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** See `native-url-encoder-parity`: a JDK off PATH is the common Homebrew layout, and "no JVM" is easy to conclude wrongly. */
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

describe('useUrlState list codec -- parity with the web comma format', () => {
  it('the corpus is non-trivial (a vacuous matrix would pass against any decoder)', () => {
    const exp = expectedVector()
    // Distinct answers across the corpus: if every row decoded to the default the harness would prove nothing.
    expect(new Set(exp).size).toBeGreaterThan(40)
    // The two rows the whole format exists for: an escaped comma stays ONE element, a bare `%` survives.
    expect(expectedGet('strings', 'a%2Cb')).toBe('a,b')
    expect(expectedGet('strings', '50%')).toBe('50%')
    expect(expectedGet('strings', '')).toBe('')
    expect(expectedGet('ints', '1.5,2')).toBe('-9')
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift list codec matches, executed', () => {
    const got = withTempDir('pyreon-urllist-swift-', (dir) => {
      const casesPath = join(dir, 'cases.txt')
      const harness = `import Foundation

public final class PyreonRouter {
    public var query: [String: String] = [:]
    public var written: String? = nil
    public init() {}
    public func setQueryParam(_ key: String, _ value: String?) { written = value }
}

${mirrorRegion(SWIFT_SRC)}

func scalars(_ payload: Substring) -> [String] {
    payload.isEmpty ? [] : payload.split(separator: ",").map { String(UnicodeScalar(UInt32($0)!)!) }
}
func decode(_ s: Substring) -> String {
    scalars(s).joined()
}

let lines = try! String(contentsOfFile: ${JSON.stringify(casesPath)}, encoding: .utf8)
    .split(separator: "\\n", omittingEmptySubsequences: false)
var out: [String] = []
for line in lines {
    let parts = line.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false)
    if parts.count < 3 { continue }
    let op = String(parts[0]), kind = String(parts[1]), payload = parts[2]
    let router = PyreonRouter()
    if op == "g" {
        router.query["k"] = decode(payload)
        switch kind {
        case "strings": out.append(PyreonUrlStateStrings(router: router, key: "k", defaultValue: ["d"])().joined(separator: "|"))
        case "ints": out.append(PyreonUrlStateInts(router: router, key: "k", defaultValue: [-9])().map { String($0) }.joined(separator: "|"))
        case "doubles": out.append(PyreonUrlStateDoubles(router: router, key: "k", defaultValue: [-9.5])().map(pyreonUrlFormatDouble).joined(separator: "|"))
        default: out.append(PyreonUrlStateBools(router: router, key: "k", defaultValue: [true])().map { $0 ? "true" : "false" }.joined(separator: "|"))
        }
    } else {
        let items = payload.isEmpty ? [] : payload.split(separator: ";", omittingEmptySubsequences: false)
        switch kind {
        case "strings": PyreonUrlStateStrings(router: router, key: "k", defaultValue: []).set(items.map { decode($0) })
        case "ints": PyreonUrlStateInts(router: router, key: "k", defaultValue: []).set(items.map { Int($0)! })
        case "doubles": PyreonUrlStateDoubles(router: router, key: "k", defaultValue: []).set(items.map { s in s == "Infinity" ? Double.infinity : s == "-Infinity" ? -Double.infinity : Double(s)! })
        default: PyreonUrlStateBools(router: router, key: "k", defaultValue: []).set(items.map { $0 == "true" })
        }
        out.append(router.written ?? "<nil>")
    }
}
print(out.joined(separator: "\\n"))
`
      writeFileSync(casesPath, caseLines().join('\n'))
      writeFileSync(join(dir, 'main.swift'), harness)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).split('\n')
    })
    const expected = expectedVector()
    expect(got.slice(0, expected.length)).toEqual(expected)
  }, 240_000)

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)('the SHIPPED Kotlin list codec matches, executed', () => {
    const java = jvmPath() as string
    const got = withTempDir('pyreon-urllist-kotlin-', (dir) => {
      const casesPath = join(dir, 'cases.txt')
      const harness = `class Q(val value: Map<String, String>)
class PyreonRouter(val query: Q?) {
    var written: String? = null
    fun setQueryParam(key: String, value: String?) { written = value }
}

${mirrorRegion(KOTLIN_SRC)}

fun decode(payload: String): String {
    val sb = StringBuilder()
    if (payload.isNotEmpty()) payload.split(",").forEach { sb.appendCodePoint(it.toInt()) }
    return sb.toString()
}

fun main() {
    val out = ArrayList<String>()
    java.io.File(${JSON.stringify(casesPath)}).readLines().forEach { line ->
        val parts = line.split("|", limit = 3)
        if (parts.size < 3) return@forEach
        val op = parts[0]; val kind = parts[1]; val payload = parts[2]
        if (op == "g") {
            val router = PyreonRouter(Q(mapOf("k" to decode(payload))))
            when (kind) {
                "strings" -> out.add(PyreonUrlStateStrings(router, "k", listOf("d"))().joinToString("|"))
                "ints" -> out.add(PyreonUrlStateInts(router, "k", listOf(-9L))().joinToString("|") { it.toString() })
                "doubles" -> out.add(PyreonUrlStateDoubles(router, "k", listOf(-9.5))().joinToString("|") { pyreonUrlFormatDouble(it) })
                else -> out.add(PyreonUrlStateBools(router, "k", listOf(true))().joinToString("|") { if (it) "true" else "false" })
            }
        } else {
            val router = PyreonRouter(Q(emptyMap()))
            val items = if (payload.isEmpty()) emptyList() else payload.split(";")
            when (kind) {
                "strings" -> PyreonUrlStateStrings(router, "k", listOf()).set(items.map { decode(it) })
                "ints" -> PyreonUrlStateInts(router, "k", listOf()).set(items.map { it.toLong() })
                "doubles" -> PyreonUrlStateDoubles(router, "k", listOf()).set(items.map { if (it == "Infinity") Double.POSITIVE_INFINITY else if (it == "-Infinity") Double.NEGATIVE_INFINITY else it.toDouble() })
                else -> PyreonUrlStateBools(router, "k", listOf()).set(items.map { it == "true" })
            }
            out.add(router.written ?: "<nil>")
        }
    }
    println(out.joinToString("\\n"))
}
`
      writeFileSync(casesPath, caseLines().join('\n'))
      writeFileSync(join(dir, 'main.kt'), harness)
      execFileSync('kotlinc', [join(dir, 'main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')], { stdio: 'pipe' })
      return execFileSync(java, ['-jar', join(dir, 'run.jar')], { encoding: 'utf8' }).replace(/\n$/, '').split('\n')
    })
    const expected = expectedVector()
    expect(got.slice(0, expected.length)).toEqual(expected)
  }, 240_000)
})
