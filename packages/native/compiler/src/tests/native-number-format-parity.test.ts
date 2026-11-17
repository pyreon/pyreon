import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canRunKotlin, canRunSwift, caseNames, emitCorpus, jvmPath, kotlinToolchain, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'

/**
 * Number → text is the web's, byte for byte, on both targets: `String(x)`, `'a' + x`, `${x}` (ECMAScript
 * `Number::toString`) and `x.toFixed(d)`.
 *
 * Every one of these compiled and printed something plausible, with no warning:
 * - `String(x)` and `'a' + x` went through an emitted `pyreonNumString` that was NOT the runtime's formatter:
 *   `1e15` printed `1000000000000000.0` (Swift) / `1.0E15` (Kotlin), `0.000001` printed `1e-06` / `1.0E-6`.
 * - `${x}` used the runtime's `pyreonNumberString`, which kept the native exponent form (`1e-07`, `1.0E-7`) and,
 *   past 9e15, printed the double's exact digits instead of the shortest (`123456789012345677877`).
 * - `toFixed` lowered to printf-style formatting: Swift's `%.Nf` breaks an exact tie toward even
 *   (`(2.5).toFixed(0)` = "2", `(0.125).toFixed(2)` = "0.12"); Kotlin's `Formatter` rounds the shortest decimal
 *   half up (`(1.005).toFixed(2)` = "1.01", `(1.45).toFixed(1)` = "1.5"). The web rounds the exact value half up.
 *
 * Proven by EXECUTION against the shipped runtime files (`PyreonNumber.swift` / `PyreonNumber.kt`) over a seeded
 * corpus of bit patterns, and end to end through the compiler with the differential harness.
 */

const SWIFT_SRC = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonNumber.swift')
const KOTLIN_SRC = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonNumber.kt')

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

function bits(d: number): string {
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, d)
  return Buffer.from(new Uint8Array(b.buffer)).toString('hex')
}

/** `kind bits digits` lines: `s` = String(x), `f` = x.toFixed(digits). */
function buildCorpus(): { lines: string[]; expected: string[] } {
  const r = mulberry32(0x70f1)
  const values: number[] = [
    0, -0, 1, -1, 7, 0.1, 0.2 + 0.1, 1 / 3, 2 / 3, 100, 1e15, 2e15, 9e15, 1e16, 123456789012345680000, 1e20, 1e21,
    1.5e21, 1e-6, 1e-7, 1.5e-10, -1.5e-9, 123.456, 5e-324, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, 2 ** 53 + 2,
    0.5, 1.5, 2.5, -2.5, 0.125, 0.375, -0.125, 1.005, 1.45, 2.675, 1.255, 8.345, -0.0001, 0.0049, 0.995, 9.995,
    99.995, 1234.5, 1234.565, 4.35, 0.000123, NaN, Infinity, -Infinity,
  ]
  for (let i = 0; i < 300; i++) {
    const b = new DataView(new ArrayBuffer(8))
    for (let j = 0; j < 8; j++) b.setUint8(j, Math.floor(r() * 256))
    values.push(b.getFloat64(0))
  }
  // Prices, percentages and ties: the everyday toFixed inputs.
  for (let i = 0; i < 400; i++) values.push(Math.round(r() * 10 ** Math.floor(r() * 9)) / 10 ** Math.floor(r() * 5))
  for (let i = 0; i < 100; i++) values.push((Math.floor(r() * 2000) - 1000) / 8)
  const lines: string[] = []
  const expected: string[] = []
  for (const v of values) {
    lines.push(`s ${bits(v)} 0`)
    expected.push(String(v))
    for (const d of [0, 1, 2, 3, 6, 20]) {
      lines.push(`f ${bits(v)} ${d}`)
      expected.push(v.toFixed(d))
    }
  }

  return { lines, expected }
}

const SWIFT_MAIN = (path: string): string => `import Foundation
let text = try! String(contentsOfFile: ${JSON.stringify(path)}, encoding: .utf8)
var out = ""
for line in text.split(separator: "\\n", omittingEmptySubsequences: true) {
    let p = line.split(separator: " ")
    let v = Double(bitPattern: UInt64(p[1], radix: 16)!)
    out += (p[0] == "s" ? pyreonNumberString(v) : pyreonToFixed(v, Int(p[2])!)) + "\\n"
}
print(out, terminator: "")
`

const KOTLIN_MAIN = (path: string): string => `import com.pyreon.runtime.pyreonNumberString
import com.pyreon.runtime.pyreonToFixed
fun main() {
    val out = StringBuilder()
    for (line in java.io.File(${JSON.stringify(path)}).readLines()) {
        if (line.isEmpty()) continue
        val p = line.split(" ")
        val v = java.lang.Double.longBitsToDouble(java.lang.Long.parseUnsignedLong(p[1], 16))
        out.append(if (p[0] == "s") pyreonNumberString(v) else pyreonToFixed(v, p[2].toInt())).append('\\n')
    }
    print(out)
}
`

/** End to end: the compiler's lowering of each number-to-text spelling, run on all three platforms. */
const CORPUS = `
function str(x: number): string { return String(x) }
function cat(x: number): string { return 'v' + x }
function tpl(x: number): string { return \`\${x}\` }
function fixed(x: number, d: number): string { return x.toFixed(d) }
function fixed2(x: number): string { return x.toFixed(2) }
function count(n: number): string { return n.toFixed(1) }
export function c_str_1e15(): string { return str(1e15 + 0.5 - 0.5) }
export function c_str_frac(): string { return str(0.000001) }
export function c_str_exp(): string { return str(1.5e-10) }
export function c_str_big(): string { return str(123456789012345680000 + 0.5) }
export function c_str_whole(): string { return str(250.5 - 0.5) }
export function c_cat_big(): string { return cat(2e15 + 0.5 - 0.5) }
export function c_cat_frac(): string { return cat(0.25) }
export function c_tpl_small(): string { return tpl(1e-7 + 0) }
export function c_tpl_neg_small(): string { return tpl(-1.5e-9) }
export function c_tpl_1e21(): string { return tpl(1e21 + 0.5) }
export function c_fixed_tie0(): string { return fixed(2.5, 0) }
export function c_fixed_tie2(): string { return fixed(0.125, 2) }
export function c_fixed_neg_tie(): string { return fixed(-2.5, 0) }
export function c_fixed_binary_below(): string { return fixed(1.005, 2) }
export function c_fixed_binary_below1(): string { return fixed(1.45, 1) }
export function c_fixed_neg_zero(): string { return fixed(-0.0001, 2) }
export function c_fixed_literal(): string { return fixed2(8.345) }
export function c_fixed_int_receiver(): string { return count(3) }
`

describe('number → text matches the web on both targets', () => {
  const { lines, expected } = buildCorpus()

  it('the corpus exercises what it claims to', () => {
    const all = expected.join('\n')
    for (const needle of ['e+21', 'e-7', 'NaN', '-Infinity', '1000000000000000', '-0.00', '0.13', '3']) {
      expect(all, needle).toContain(needle)
    }
  })

  it('the emit routes every spelling through the runtime formatters, never printf or a private copy', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = emitCorpus(CORPUS, target)
      expect(warnings).toEqual([])
      expect(code).not.toContain('pyreonNumString')
      expect(code).not.toMatch(/%\.\d*f|String\(format:|\.format\(/)
      expect(code).toContain('pyreonToFixed(')
      expect(code).toContain('pyreonNumberString(')
    }
  })

  it.skipIf(!canRunSwift())('the SHIPPED Swift formatters print the web\'s text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-numfmt-swift-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), `${lines.join('\n')}\n`)
      writeFileSync(join(dir, 'main.swift'), SWIFT_MAIN(join(dir, 'cases.txt')))
      execFileSync('swiftc', [SWIFT_SRC, join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      const out = execFileSync(join(dir, 'run'), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').slice(0, -1)
      expect(mismatches(lines, expected, out)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  it.skipIf(!canRunKotlin())('the SHIPPED Kotlin formatters print the web\'s text', () => {
    const kx = kotlinToolchain()!
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-numfmt-kotlin-'))
    try {
      writeFileSync(join(dir, 'cases.txt'), `${lines.join('\n')}\n`)
      writeFileSync(join(dir, 'Main.kt'), KOTLIN_MAIN(join(dir, 'cases.txt')))
      execFileSync('kotlinc', ['-nowarn', KOTLIN_SRC, join(dir, 'Main.kt'), '-d', join(dir, 'out')], { stdio: 'pipe' })
      const out = execFileSync(jvmPath()!, ['-cp', `${join(dir, 'out')}:${kx.stdlib}`, 'MainKt'], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
        .split('\n')
        .slice(0, -1)
      expect(mismatches(lines, expected, out)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 600_000)

  it.skipIf(!canRunSwift())('end to end: the compiled Swift agrees with the web on every case', () => {
    const names = caseNames(CORPUS)
    expect(mismatches(names, runWeb(CORPUS), runSwift(CORPUS))).toEqual([])
  }, 600_000)

  it.skipIf(!canRunKotlin())('end to end: the compiled Kotlin agrees with the web on every case', () => {
    const names = caseNames(CORPUS)
    expect(mismatches(names, runWeb(CORPUS), runKotlin(CORPUS))).toEqual([])
  }, 600_000)
})
