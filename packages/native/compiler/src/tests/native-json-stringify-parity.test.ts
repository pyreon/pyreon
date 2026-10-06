import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * `JSON.stringify(x)` lowers to `PyreonJSON.stringify` (Swift) and
 * `PyreonJson.stringify` (Kotlin), and the contract is the web's BYTES — the
 * string leaves the device (a stream's request body, a cache key, something a
 * server signs), so "equivalent JSON" is not enough.
 *
 * Asserted by EXECUTION: a seeded corpus of doubles (as exact bit patterns)
 * and strings (every escape class, astral characters, U+2028) plus a nested
 * object whose keys are deliberately NOT alphabetical is written by the real
 * `JSON.stringify` and by each shipped runtime file compiled with the real
 * toolchain — Kotlin against the REAL kotlinx-serialization, since its output
 * is what the Kotlin side rewrites. Nothing is re-typed: the native side is
 * the file that ships.
 */

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonJSON.swift')
const KOTLIN_SRC = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonJson.kt')

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')

/** The bit pattern of a double, big-endian hex — so the native side builds the SAME value. */
function doubleBits(d: number): string {
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, d)
  return hex(new Uint8Array(b.buffer))
}

interface Case {
  kind: 'd' | 's'
  payload: string
  expected: string
}

function buildCorpus(): Case[] {
  const r = mulberry32(0x5eed)
  const doubles: number[] = [
    0, -0, 1, -1, 0.1, 0.2 + 0.1, 1 / 3, 100, 1e20, 1e21, 1e-6, 1e-7, 123.456, 5e-324, Number.MAX_VALUE,
    Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, 2 ** 53 + 2, 1.5e300, -2.5e-8, 2 ** -1074 * 3, 4.35, 0.000123,
    NaN, Infinity, -Infinity,
  ]
  // Random bit patterns cover every exponent; random decimals cover the
  // everyday values a request body carries.
  for (let i = 0; i < 400; i++) {
    const b = new DataView(new ArrayBuffer(8))
    for (let j = 0; j < 8; j++) b.setUint8(j, Math.floor(r() * 256))
    doubles.push(b.getFloat64(0))
  }
  for (let i = 0; i < 200; i++) doubles.push(Math.round(r() * 10 ** Math.floor(r() * 12)) / 10 ** Math.floor(r() * 8))
  const cases: Case[] = doubles.map((d) => ({ kind: 'd', payload: doubleBits(d), expected: JSON.stringify(d) }))

  const specials = ['"', '\\', '/', '\b', '\f', '\n', '\r', '\t', '\u0000', '\u0001', '\u001f', '\u007f', ' ', ' ', 'é', '🙂', '中']
  const strings: string[] = ['', 'hello', 'a/b', '</script>', ...specials, specials.join('')]
  for (let i = 0; i < 200; i++) {
    let s = ''
    const len = Math.floor(r() * 12)
    for (let j = 0; j < len; j++) {
      const pick = r()
      if (pick < 0.3) s += specials[Math.floor(r() * specials.length)]
      else if (pick < 0.6) s += String.fromCharCode(0x20 + Math.floor(r() * 0x5f))
      else if (pick < 0.85) s += String.fromCodePoint(0xa0 + Math.floor(r() * (0xd7ff - 0xa0)))
      else s += String.fromCodePoint(0x10000 + Math.floor(r() * 0xfffff))
    }
    strings.push(s)
  }
  for (const s of strings) cases.push({ kind: 's', payload: hex(new TextEncoder().encode(s)), expected: JSON.stringify(s) })
  return cases
}

/** A nested value whose field order is NOT alphabetical — `JSONEncoder` reorders; JS does not. */
const OBJECT = {
  prompt: 'hi/"there"\n',
  n: 3,
  inner: { zeta: 'z', alpha: 1, list: [1.5, 2, 1e21], flag: false },
  ok: true,
}
const OBJECT_SWIFT = `
struct Inner: Codable { var zeta: String; var alpha: Double; var list: [Double]; var flag: Bool; var missing: String? }
struct Top: Codable { var prompt: String; var n: Int; var inner: Inner; var ok: Bool }
let top = Top(prompt: "hi/\\"there\\"\\n", n: 3, inner: Inner(zeta: "z", alpha: 1.0, list: [1.5, 2.0, 1e21], flag: false, missing: nil), ok: true)
`
const OBJECT_KOTLIN = `
@Serializable data class Inner(var zeta: String, var alpha: Double, var list: List<Double>, var flag: Boolean, var missing: String? = null)
@Serializable data class Top(var prompt: String, var n: Int, var inner: Inner, var ok: Boolean)
val top = Top("hi/\\"there\\"\\n", 3, Inner("z", 1.0, listOf(1.5, 2.0, 1e21), false), true)
`

function writeCases(dir: string, cases: Case[]): string {
  const p = join(dir, 'cases.txt')
  writeFileSync(p, cases.map((c) => `${c.kind} ${c.payload || '-'}`).join('\n') + '\n')
  return p
}

const SWIFT_MAIN = (casesPath: string): string => `import Foundation
${OBJECT_SWIFT}
func unhex(_ s: Substring) -> [UInt8] {
    if s == "-" { return [] }
    var out: [UInt8] = []
    var i = s.startIndex
    while i < s.endIndex {
        let j = s.index(i, offsetBy: 2)
        out.append(UInt8(s[i..<j], radix: 16)!)
        i = j
    }
    return out
}
print(PyreonJSON.stringify(top))
let text = try! String(contentsOfFile: ${JSON.stringify(casesPath)}, encoding: .utf8)
for line in text.split(separator: "\\n", omittingEmptySubsequences: true) {
    let parts = line.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false)
    if parts[0] == "d" {
        print(PyreonJSON.stringify(Double(bitPattern: UInt64(parts[1], radix: 16)!)))
    } else {
        print(PyreonJSON.stringify(String(decoding: unhex(parts[1]), as: UTF8.self)))
    }
}
`

const KOTLIN_MAIN = (casesPath: string): string => `import com.pyreon.runtime.PyreonJson
import kotlinx.serialization.Serializable
${OBJECT_KOTLIN}
fun unhex(s: String): ByteArray = if (s == "-") ByteArray(0) else ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
fun main() {
    val out = StringBuilder()
    out.append(PyreonJson.stringify(top)).append('\\n')
    for (line in java.io.File(${JSON.stringify(casesPath)}).readLines()) {
        if (line.isEmpty()) continue
        val kind = line.substring(0, 1)
        val payload = line.substring(2)
        if (kind == "d") {
            out.append(PyreonJson.stringify(java.lang.Double.longBitsToDouble(java.lang.Long.parseUnsignedLong(payload, 16))))
        } else {
            out.append(PyreonJson.stringify(String(unhex(payload), Charsets.UTF_8)))
        }
        out.append('\\n')
    }
    // Raw UTF-8 bytes, whatever the platform default charset is.
    System.out.write(out.toString().toByteArray(Charsets.UTF_8))
    System.out.flush()
}
`

/** A JDK to run the jar — commonly off PATH under Homebrew. */
function jvmPath(): string | undefined {
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java']) {
    if (existsSync(c)) return c
  }
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    return undefined
  }
}

/**
 * The REAL kotlinx-serialization (core + json) from the local Gradle cache,
 * plus the serialization compiler plugin kotlinc ships — undefined when either
 * is absent, and the Kotlin half then skips by NAME rather than passing.
 */
function kotlinxToolchain(): { classpath: string; plugin: string; stdlib: string } | undefined {
  if (!isKotlincAvailable()) return undefined
  let home: string
  try {
    home = join(dirname(realpathSync(execFileSync('which', ['kotlinc'], { encoding: 'utf8' }).trim())), '..')
  } catch {
    return undefined
  }
  // A distribution keeps its jars in lib/; Homebrew's in libexec/lib/.
  const lib = [join(home, 'lib'), join(home, 'libexec', 'lib')].find((d) => existsSync(join(d, 'kotlin-stdlib.jar')))
  if (lib === undefined) return undefined
  const plugin = join(lib, 'kotlinx-serialization-compiler-plugin.jar')
  const stdlib = join(lib, 'kotlin-stdlib.jar')
  if (!existsSync(plugin) || !existsSync(stdlib)) return undefined
  const cache = join(homedir(), '.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlinx')
  const jar = (artifact: string, version: string): string | undefined => {
    const dir = join(cache, artifact, version)
    if (!existsSync(dir)) return undefined
    for (const h of readdirSync(dir)) {
      const f = join(dir, h, `${artifact}-${version}.jar`)
      if (existsSync(f)) return f
    }
    return undefined
  }
  // The version the example Android apps build against.
  const core = jar('kotlinx-serialization-core-jvm', '1.9.0')
  const json = jar('kotlinx-serialization-json-jvm', '1.9.0')
  if (core === undefined || json === undefined) return undefined
  return { classpath: `${core}:${json}`, plugin, stdlib }
}

describe('JSON.stringify — byte-for-byte parity with the web', () => {
  const cases = buildCorpus()
  const expected = [JSON.stringify(OBJECT), ...cases.map((c) => c.expected)]

  it('the corpus exercises what it claims to', () => {
    // Escapes, exponent layouts on both sides, non-finite → null, astral.
    const all = expected.join('\n')
    for (const needle of ['\\u0000', '\\u001f', '\\b', '\\"', '\\\\', 'e+', 'e-', 'null', '🙂', ' ']) {
      expect(all, needle).toContain(needle)
    }
    // Key order is the SOURCE order, not alphabetical.
    expect(expected[0]).toBe('{"prompt":"hi/\\"there\\"\\n","n":3,"inner":{"zeta":"z","alpha":1,"list":[1.5,2,1e+21],"flag":false},"ok":true}')
  })

  it('a runtime JSON body keeps the source literal\'s key order in the synthesized struct', () => {
    const src = `
import { createHttp } from '@pyreon/http'
import { openEventStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface Tok { t: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const chat = api.endpoint('POST /chat', { responseType: 'stream' })
export function App() {
  const q = signal('hi')
  const s = useStream<SseEvent<Tok>>((ctx) =>
    openEventStream((c) => chat({ json: { zeta: q(), alpha: 2 }, signal: c.signal, headers: c.headers }), {
      signal: ctx.signal,
      onStatus: ctx.onStatus,
    }),
  )
  return (<Stack><Text>{s.status()}</Text></Stack>)
}
`
    const sw = transform(src, { target: 'swift' }).code
    const kt = transform(src, { target: 'kotlin' }).code
    const swStruct = /struct __Obj\d+: Codable \{([^}]*)\}/.exec(sw)?.[1] ?? ''
    const ktStruct = /data class __Obj\d+\(([^)]*)\)/.exec(kt)?.[1] ?? ''
    expect(swStruct.indexOf('zeta')).toBeGreaterThan(-1)
    expect(swStruct.indexOf('zeta')).toBeLessThan(swStruct.indexOf('alpha'))
    expect(ktStruct.indexOf('zeta')).toBeGreaterThan(-1)
    expect(ktStruct.indexOf('zeta')).toBeLessThan(ktStruct.indexOf('alpha'))
    expect(sw).toContain('PyreonJSON.stringify(__Obj')
    expect(kt).toContain('PyreonJson.stringify(__Obj')
  })

  it.skipIf(!isSwiftcAvailable())('the SHIPPED Swift serializer writes the same bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-json-swift-'))
    try {
      const casesPath = writeCases(dir, cases)
      writeFileSync(join(dir, 'main.swift'), SWIFT_MAIN(casesPath))
      execFileSync('swiftc', [SWIFT_SRC, join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      const out = execFileSync(join(dir, 'run'), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      expect(out.split('\n').slice(0, -1)).toEqual(expected)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  const kx = kotlinxToolchain()
  it.skipIf(kx === undefined || jvmPath() === undefined)(
    'the SHIPPED Kotlin serializer writes the same bytes (real kotlinx-serialization)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-json-kotlin-'))
      try {
        const casesPath = writeCases(dir, cases)
        writeFileSync(join(dir, 'Main.kt'), KOTLIN_MAIN(casesPath))
        execFileSync(
          'kotlinc',
          ['-nowarn', `-Xplugin=${kx!.plugin}`, '-cp', kx!.classpath, KOTLIN_SRC, join(dir, 'Main.kt'), '-d', join(dir, 'out')],
          { stdio: 'pipe' },
        )
        const out = execFileSync(
          jvmPath() as string,
          ['-cp', `${join(dir, 'out')}:${kx!.classpath}:${kx!.stdlib}`, 'MainKt'],
          { maxBuffer: 64 * 1024 * 1024 },
        ).toString('utf8')
        expect(out.split('\n').slice(0, -1)).toEqual(expected)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    600_000,
  )

  it.skipIf(kx === undefined || jvmPath() === undefined)(
    'Kotlin: a LONE surrogate is escaped as JSON.stringify escapes it (Swift strings cannot hold one)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-json-kotlin-lone-'))
      try {
        writeFileSync(
          join(dir, 'Main.kt'),
          `import com.pyreon.runtime.PyreonJson
fun main() { println(PyreonJson.stringify("a\\uD800b\\uDC00c\\uD83D\\uDE42")) }
`,
        )
        execFileSync(
          'kotlinc',
          ['-nowarn', `-Xplugin=${kx!.plugin}`, '-cp', kx!.classpath, KOTLIN_SRC, join(dir, 'Main.kt'), '-d', join(dir, 'out')],
          { stdio: 'pipe' },
        )
        const out = execFileSync(jvmPath() as string, [
          '-Dstdout.encoding=UTF-8',
          '-cp',
          `${join(dir, 'out')}:${kx!.classpath}:${kx!.stdlib}`,
          'MainKt',
        ]).toString('utf8')
        expect(out.trim()).toBe(JSON.stringify('a\uD800b\uDC00c🙂'))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    600_000,
  )

  it('the runtime sources are where the test reads them', () => {
    expect(readFileSync(SWIFT_SRC, 'utf8')).toContain('public static func stringify')
    expect(readFileSync(KOTLIN_SRC, 'utf8')).toContain('fun <reified T> stringify')
  })
})
