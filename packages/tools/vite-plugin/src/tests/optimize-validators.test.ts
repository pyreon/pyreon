/**
 * optimize-validators — module-level source-rewrite tests.
 *
 * End-to-end VALIDATION equivalence (rewritten schema parses byte-identically
 * to the chainable original) lives in `@pyreon/validate`'s
 * `tests/compile-rewrite-equivalence.test.ts`. This file locks the SOURCE
 * transform: the right spans are overwritten, only the used mini exports are
 * imported (aliased), and non-emittable / no-schema modules are left alone.
 */
import { describe, expect, it } from 'vitest'
import { optimizeValidators } from '../optimize-validators'

describe('optimizeValidators — source rewrite', () => {
  it('rewrites a chainable schema to the lean mini form + injects aliased imports', () => {
    const out = optimizeValidators(
      `import { s } from '@pyreon/validate'\nconst Login = s.object({ email: s.string().email(), age: s.number().int().min(18) })`,
      'm.ts',
    )
    expect(out).not.toBeNull()
    expect(out!).toContain("from '@pyreon/validate/mini'")
    expect(out!).toContain(
      '_pv$object({ email: _pv$string().check(_pv$email()), age: _pv$number().check(_pv$integer(), _pv$minValue(18)) })',
    )
    // Imports ONLY the constructors + actions actually used, aliased + sorted.
    expect(out!).toContain(
      "import { email as _pv$email, integer as _pv$integer, minValue as _pv$minValue, number as _pv$number, object as _pv$object, string as _pv$string } from '@pyreon/validate/mini';",
    )
    // The original chainable construction is gone.
    expect(out!).not.toContain('s.object(')
  })

  it('returns null when there is no schema to rewrite', () => {
    expect(optimizeValidators('const x = 1', 'm.ts')).toBeNull()
    expect(
      optimizeValidators("import { s } from '@pyreon/validate'\nexport const y = 2", 'm.ts'),
    ).toBeNull()
  })

  it('leaves a non-emittable (dynamic) schema untouched — graceful fallback', () => {
    // `.cuid2()` is outside the statically-analyzable set → unsupported → not rewritten.
    expect(optimizeValidators('const X = s.string().cuid2()', 'm.ts')).toBeNull()
  })

  it('rewrites only the emittable schemas; non-emittable stay runtime `s.`', () => {
    const out = optimizeValidators(
      'const A = s.string().email()\nconst B = s.string().cuid2()',
      'm.ts',
    )
    expect(out).not.toBeNull()
    expect(out!).toContain('_pv$string().check(_pv$email())') // A rewritten
    expect(out!).toContain('s.string().cuid2()') // B untouched
  })

  it('handles multiple schemas (right-to-left splices keep offsets valid)', () => {
    const out = optimizeValidators(
      'const A = s.string().email()\nconst B = s.number().int().min(0)',
      'm.ts',
    )
    expect(out).not.toBeNull()
    expect(out!).toContain('_pv$string().check(_pv$email())')
    expect(out!).toContain('_pv$number().check(_pv$integer(), _pv$minValue(0))')
  })
})
