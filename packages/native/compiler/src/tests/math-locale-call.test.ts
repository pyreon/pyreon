// `Math.X(...)` namespace calls + `.toLocaleString()`.
//
// Math: JS has the `Math` namespace; Swift does NOT, so the verbatim
// emit (`Math.round(n)`) is invalid Swift. Mapped to Swift stdlib /
// Foundation functions. Kotlin needs no mapping — java.lang.Math is
// valid on Android/JVM (left verbatim). NOTE: round/floor/ceil require a
// Double argument; full toolchain validation of those lands with the
// Double-numeric-type support (these specs assert the EMIT mapping,
// which is correct regardless).
//
// toLocaleString: no native locale-number-formatting equivalent on
// either target — degrade to a plain string conversion (valid, loses
// grouping) + a warning, rather than a silent invalid emit.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (expr: string) =>
  `import { signal, computed } from '@pyreon/reactivity'
export function C() { const n = signal(7); const m = signal(3); const out = computed(() => ${expr}); return out }`

describe('Math.* namespace emit (Swift mapping)', () => {
  const swift = (expr: string) => transform(SRC(expr), { target: 'swift' }).code
  it('Math.round → (x).rounded()', () => {
    expect(swift('Math.round(n())')).toContain('(n).rounded()')
    expect(swift('Math.round(n())')).not.toContain('Math.round')
  })
  // `not.toContain('Math.')` is the load-bearing assertion — a verbatim
  // (unmapped) `Math.floor(n)` would still CONTAIN the substring
  // `floor(n)`, so only the absence of the `Math.` prefix proves the
  // mapping fired.
  it('Math.floor → floor(x) (no Math. prefix)', () => {
    const s = swift('Math.floor(n())')
    expect(s).toContain('floor(n)')
    expect(s).not.toContain('Math.')
  })
  it('Math.ceil → ceil(x) (no Math. prefix)', () => {
    const s = swift('Math.ceil(n())')
    expect(s).toContain('ceil(n)')
    expect(s).not.toContain('Math.')
  })
  it('Math.abs → abs(x) (no Math. prefix)', () => {
    const s = swift('Math.abs(n())')
    expect(s).toContain('abs(n)')
    expect(s).not.toContain('Math.')
  })
  it('Math.min / Math.max → min(a,b) / max(a,b) (no Math. prefix)', () => {
    expect(swift('Math.min(n(), m())')).toContain('min(n, m)')
    expect(swift('Math.min(n(), m())')).not.toContain('Math.')
    expect(swift('Math.max(n(), m())')).toContain('max(n, m)')
    expect(swift('Math.max(n(), m())')).not.toContain('Math.')
  })
  it('Math.sqrt / Math.pow → sqrt(x) / pow(a,b) (no Math. prefix)', () => {
    expect(swift('Math.sqrt(n())')).toContain('sqrt(n)')
    expect(swift('Math.sqrt(n())')).not.toContain('Math.')
    expect(swift('Math.pow(n(), m())')).toContain('pow(n, m)')
    expect(swift('Math.pow(n(), m())')).not.toContain('Math.')
  })
  it('Kotlin: Math.* stays verbatim (valid java.lang.Math)', () => {
    expect(transform(SRC('Math.abs(n())'), { target: 'kotlin' }).code).toContain('Math.abs(n)')
  })
})

describe('.toLocaleString() — degrade + warn', () => {
  it('Swift: → String(x) + warning', () => {
    const r = transform(SRC('n().toLocaleString()'), { target: 'swift' })
    expect(r.code).toContain('String(n)')
    expect(r.code).not.toContain('.toLocaleString()')
    expect(r.warnings.some((w) => w.includes('toLocaleString'))).toBe(true)
  })
  it('Kotlin: → (x).toString() + warning', () => {
    const r = transform(SRC('n().toLocaleString()'), { target: 'kotlin' })
    expect(r.code).toContain('(n).toString()')
    expect(r.warnings.some((w) => w.includes('toLocaleString'))).toBe(true)
  })
})
