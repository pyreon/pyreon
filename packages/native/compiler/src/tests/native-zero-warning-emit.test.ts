/**
 * The emit compiles WITHOUT WARNINGS — every class swiftc / kotlinc reported on the generated chart engine, which is
 * also every app's output, since the emitters are shared:
 *
 *  1. an unused loop variable (`for i in 0..<n` whose body ignores `i`) → `for _ in`;
 *  2. a `const` emitted `var` because a same-named binding elsewhere was reassigned → scope-aware mutability;
 *  3. `arr[i] ?? x` on a non-optional subscript (`??` with a dead right side) and
 *  4. `const s = arr[i]; if (s === undefined) …` (a dead nil comparison) → a bounds-checked OPTIONAL read, so the
 *     source's guard is live: before, the subscript TRAPPED out of range where the web took the guarded path;
 *  5. an escaped keyword argument label (`` `repeat`: ``);
 *  6. int→double by counting → `Number(n)`;
 *  7. Kotlin's redundant `Double.toDouble()` / `Long.toLong()`, `0.0 / 0.0` "division by zero" (`NaN` now lowers),
 *     and `x ?: null`.
 *
 * Each spec checks the emitted text on both targets; the compile specs run the real toolchains and fail on ANY
 * warning in the emitted file; the parity spec runs the out-of-range read on the web, Swift and Kotlin.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { canRunKotlin, canRunSwift, caseNames, emitCorpus, mismatches, runKotlin, runSwift, runWeb } from './differential-harness'
import { transform } from './first-party-plugins'

const swift = (src: string): string => transform(src, { target: 'swift' }).code ?? ''
const kotlin = (src: string): string => transform(src, { target: 'kotlin' }).code ?? ''

describe('1. a loop variable the body never reads', () => {
  const SRC = `export function f(n: number): number { let c = 0; for (let i = 0; i < n; i++) c = c + 2; for (const _p of [1, 2]) c = c + 1; for (let k = 0; k < n; k++) c = c + k; return c }`
  it('binds `_` on Swift, keeps a read counter', () => {
    const sw = swift(SRC)
    expect(sw).toContain('for _ in 0..<n {')
    expect(sw).toContain('for _ in [1, 2] {')
    expect(sw).toContain('for k in 0..<n {')
  })
})

describe('2. a const is immutable even when a same-named binding elsewhere is reassigned', () => {
  const SRC = `type Double = number
export function f(xs: Double[]): Double {
  let t = 0.0
  for (let i = 0; i < xs.length; i++) { let d = xs[i]!; if (d < 0.0) d = 0.0; t = t + d }
  for (let j = 0; j < xs.length; j++) { const d = xs[j]! * 2.0; t = t + d }
  return t
}`
  it('the reassigned `let d` is var/var, the sibling `const d` let/val', () => {
    const sw = swift(SRC)
    expect(sw).toContain('var d = xs[i]')
    expect(sw).toContain('let d = xs[j] * 2.0')
    const kt = kotlin(SRC)
    expect(kt).toContain('var d = xs[(i).toInt()]')
    expect(kt).toContain('val d = xs[(j).toInt()] * 2.0')
  })
})

describe('3/4. an indexed read the source tests for absence is a bounds-checked optional read', () => {
  const SRC = `type Double = number
interface S { values: Double[]; name: string }
export function pick(xs: S[], i: number): string {
  const s = xs[i]
  if (s === undefined) return 'none'
  const v = s.values[i] ?? -1.0
  return s.name + ':' + String(v)
}
export function guarded(vals: Double[], i: number): Double {
  const v = vals[i]
  if (v === undefined || !Number.isFinite(v)) return 0.0
  return v
}
export function present(vals: Double[], i: number): Double { return vals[i]! * 2.0 }`
  it('Swift: guarded idiom + guard-let, Kotlin: getOrNull + smart cast; an untested read stays a subscript', () => {
    const sw = swift(SRC)
    expect(sw).toContain('let s = (xs.indices.contains(i) ? xs[i] : nil)')
    expect(sw).toContain('guard let s else {')
    expect(sw).toContain('(s.values.indices.contains(i) ? s.values[i] : nil) ?? -1.0')
    expect(sw).toContain('vals[i] * 2.0')
    expect(sw).not.toMatch(/\w+ == nil \|\|/)
    const kt = kotlin(SRC)
    expect(kt).toContain('val s = xs.getOrNull((i).toInt())')
    expect(kt).toContain('s.values.getOrNull((i).toInt()) ?: -1.0')
    expect(kt).toContain('vals[(i).toInt()] * 2.0')
  })

  it('a receiver or index that cannot be named twice reads through the single-evaluation `pyreonAt`', () => {
    const sw = swift(`type Double = number
export function f(rows: Double[][], r: number, c: number): Double { return rows[r]![c + 1] ?? 0.0 }`)
    expect(sw).toContain('pyreonAt(rows[r], pyreonAdd(c, 1))')
  })

  it('a Record subscript is left alone (already optional natively)', () => {
    const sw = swift(`export function f(m: Record<string, number>, k: string): number { return m[k] ?? 0 }`)
    expect(sw).not.toContain('indices.contains')
    expect(sw).not.toContain('pyreonAt')
  })
})

describe('5. a keyword argument label is written bare', () => {
  it('`repeat:` unescaped in a call, `inout` still escaped', () => {
    const sw = swift(`type Opt = { repeat: boolean; inout: number }
export function f(): Opt { return { repeat: true, inout: 1 } }`)
    expect(sw).toContain('Opt(repeat: true, `inout`: 1)')
  })
})

describe('6. Number(n) is the int→double conversion', () => {
  const SRC = `type Double = number
export function f(n: number, d: Double, s: string): Double { return Number(n) + Number(d) + Number(s) }`
  it('widens an integer, is the identity on a Double, still parses a string', () => {
    expect(swift(SRC)).toContain('Double(n) + d + pyreonToNumber(s)')
    expect(kotlin(SRC)).toContain('(n).toDouble() + d + pyreonToNumber(s)')
  })
})

describe('7. Kotlin: no redundant conversion, no literal division by zero, no `?: null`', () => {
  const SRC = `type Double = number
type Pt = { x: Double }
export function f(a: Double, b: Double, n: number, s: string): Double {
  const r = Math.sqrt(a) + a / b + Math.abs(a) / 2.0 + s.slice(n, n + 1).length
  return r > 0.0 ? r : NaN
}
export function g(xs: Pt[], i: number): Pt | null { return xs[i] ?? null }
export function h(): Double { return Number.POSITIVE_INFINITY - Infinity }`
  it('converts only what is not provably the target type', () => {
    const kt = kotlin(SRC)
    expect(kt).toContain('Math.sqrt(a) + a / b + Math.abs(a) / 2.0')
    expect(kt).toContain('pyreonSlice(s, n, pyreonAdd(n, 1L))')
    expect(kt).toContain('else Double.NaN')
    expect(kt).toContain('xs.getOrNull((i).toInt())\n')
    expect(kt).toContain('Double.POSITIVE_INFINITY - Double.POSITIVE_INFINITY')
    expect(swift(SRC)).toContain('Double.infinity - Double.infinity')
  })
})

// ── The toolchains: no warning in the emitted file ─────────────────────────────────────────────────────────────────

const ALL = `type Double = number
interface S { values: Double[]; name: string; repeat?: boolean | undefined }
type Domain = { min: Double; max: Double; step?: Double | undefined }
type Measure = (text: string, size: Double) => Double
function bounds(k: number): Domain { return { min: k > 0 ? 1.0 : 2.0, max: 10.0 } }
export function c_count(n: number): string { let c = 0; for (let i = 0; i < n; i++) c = c + 1; return String(c) }
export function c_shadow(): string {
  const xs: Double[] = [1.5, -2.0, 3.0]
  let t = 0.0
  for (let i = 0; i < xs.length; i++) { let d = xs[i]!; if (d < 0.0) d = 0.0; t = t + d }
  for (let j = 0; j < xs.length; j++) { const d = xs[j]! * 2.0; t = t + d }
  return String(t)
}
function pick(xs: S[], i: number): string {
  const s = xs[i]
  if (s === undefined) return 'none'
  const v = s.values[i] ?? -1.0
  return s.name + ':' + String(v)
}
export function c_in_range(): string { return pick([{ values: [4.0, 5.0], name: 'a' }, { values: [6.0], name: 'b' }], 1) }
export function c_out_of_range(): string { return pick([{ values: [4.0], name: 'a' }], 3) }
export function c_negative_index(): string { return pick([{ values: [4.0], name: 'a' }], -1) }
export function c_nested(): string { const rows: Double[][] = [[1.0], [2.0, 3.0]]; return String(rows[1]![5] ?? 9.0) }
export function c_compound_guard(): string {
  const vals: Double[] = [1.0, NaN]
  let out = ''
  for (let i = 0; i < 3; i++) {
    const v = vals[i]
    if (v === undefined || !Number.isFinite(v)) { out = out + 'x'; continue }
    out = out + String(v)
  }
  return out
}
export function c_label(): string { const s: S = { values: [], name: 'n', repeat: true }; return String(s.repeat === true) }
export function c_widen(): string { const n = 3; const f: Double = Number(n); return String(f / 2.0) }
export function c_nan(): string { const x: Double = NaN; return String(Number.isNaN(x)) + String(Infinity > 1.0) }
export function c_math(): string { const a: Double = 9.0; return String(Math.sqrt(a) + Math.abs(-a) / 3.0 + Math.max(a, 1.0) / a) }
export function c_ternary_struct(): string { const lb = c_flag() ? bounds(1) : { min: 1.0, max: 10.0 }; return String(lb.max / lb.min) }
function c_flag(): boolean { return true }
export function c_fn_param(): string { const m = (t: string, s: Double): Double => t.length * s; return String(apply(m) / 2.0) }
function apply(measure: Measure): Double { return measure('abc', 2.0) }
export function c_declare(): string { let lo: Double; let hi: Double; if (c_flag()) { lo = 1.0; hi = 3.0 } else { lo = 0.0; hi = 1.0 } const span = hi - lo; return String(4.0 / span) }
export function c_null_coalesce(): string { const xs: S[] = []; const s: S | null = xs[0] ?? null; return s === null ? 'null' : s.name }
`

/** The warning lines swiftc / kotlinc print for `file`. */
const warningsIn = (stderr: string, file: string): string[] =>
  stderr.split('\n').filter((l) => l.includes(file) && /: warning: /.test(l))

describe('the emitted corpus compiles with zero warnings', () => {
  it.runIf(isSwiftcAvailable() && process.platform === 'darwin')('swiftc', () => {
    const { code } = emitCorpus(ALL, 'swift')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-zero-warn-swift-'))
    try {
      const runtime = ['PyreonNumber', 'PyreonSlice', 'PyreonCollections'].map((f) =>
        join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime', `${f}.swift`),
      )
      writeFileSync(join(dir, 'Emit.swift'), `import Foundation\n${code}`)
      const r = spawnSync('swiftc', ['-typecheck', '-module-cache-path', join(dir, 'mc'), ...runtime, join(dir, 'Emit.swift')], {
        encoding: 'utf8',
      })
      expect(r.status, r.stderr).toBe(0)
      expect(warningsIn(r.stderr, 'Emit.swift')).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc', () => {
    const { code } = emitCorpus(ALL, 'kotlin')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-zero-warn-kotlin-'))
    try {
      const runtime = ['PyreonNumber', 'PyreonSlice'].map((f) =>
        join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime', `${f}.kt`),
      )
      // The emit's `@Serializable` needs the plugin; this check is about warnings, so the annotation is dropped.
      writeFileSync(join(dir, 'Emit.kt'), `package com.pyreon.runtime\n${code.replace(/^@Serializable\n/gm, '')}`)
      const r = spawnSync('kotlinc', ['-d', join(dir, 'out'), ...runtime, join(dir, 'Emit.kt')], { encoding: 'utf8' })
      expect(r.status, r.stderr).toBe(0)
      expect(warningsIn(r.stderr, 'Emit.kt')).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)
})

describe('an out-of-range index takes the guarded path natively, as on the web', () => {
  const names = caseNames(ALL)
  const web = runWeb(ALL)

  it('the corpus is what it claims', () => {
    expect(web[names.indexOf('c_out_of_range')]).toBe('none')
    expect(web[names.indexOf('c_negative_index')]).toBe('none')
    expect(web[names.indexOf('c_in_range')]).toBe('b:-1')
    expect(web[names.indexOf('c_nested')]).toBe('9')
    expect(web[names.indexOf('c_compound_guard')]).toBe('1xx')
  })

  it.runIf(canRunSwift())('Swift', () => {
    expect(mismatches(names, web, runSwift(ALL))).toEqual([])
  }, 180_000)

  it.runIf(canRunKotlin())('Kotlin', () => {
    expect(mismatches(names, web, runKotlin(ALL))).toEqual([])
  }, 300_000)
})
