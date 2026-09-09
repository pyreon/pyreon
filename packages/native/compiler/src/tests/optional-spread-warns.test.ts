// Spreading an OPTIONAL object emitted code neither toolchain accepts, on both
// targets, in silence. TypeScript accepts the source — `{ ...undefined }` is
// legal and contributes nothing — so nothing upstream objected either:
//
//   swift   func f(_ o: Opts?) -> Opts { { var c = o; c.a = "x"; return c }() }
//   kotlin  fun f(o: Opts?): Opts = o.copy(a = "x")
//
// `c` is `Opts?`, so the member assignment and the return type both fail, and
// `.copy` on a nullable receiver is rejected outright. The first signal was a
// swiftc/kotlinc gate, whose error text names generated Swift rather than the
// line that produced it — one such spread in a crossing chart file cost 35
// compile failures across every chart suite before it was traced back.
//
// The emit is deliberately UNCHANGED: there is no honest fallback (JS says the
// spread contributes nothing when the source is nullish, but the emitted struct
// still needs every field, and the defaults are not knowable here). This is a
// diagnostic, so the shape is named instead of silently wrong.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const OPTIONAL = `interface Opts { a?: string | undefined }
export function f(o: Opts | undefined): Opts { return { a: "x", ...o } }`

const REQUIRED = `interface Opts { a?: string | undefined }
export function f(o: Opts): Opts { return { a: "x", ...o } }`

const NULLABLE = `interface Opts { a?: string | undefined }
export function f(o: Opts | null): Opts { return { a: "x", ...o } }`

const warns = (src: string, target: 'swift' | 'kotlin'): string[] =>
  [...transform(src, { target }).warnings].filter((w) => w.includes('which is optional'))

describe('spreading an optional object warns by name', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: an optional spread source is named`, () => {
      const w = warns(OPTIONAL, target)
      expect(w).toHaveLength(1)
      // The binding, so the message points at the source rather than at the
      // generated file the toolchain error names.
      expect(w[0]).toContain('`o`')
      // …and the remedy, which is the whole reason a warning beats a bail.
      expect(w[0]).toContain('field by field')
      expect(w[0]).toContain('o?.field')
    })

    it(`${target}: \`T | null\` warns too, not just \`T | undefined\``, () => {
      expect(warns(NULLABLE, target)).toHaveLength(1)
    })

    // The discriminating half. Without it the rule passes by firing on every
    // spread, which would be noise rather than a diagnostic.
    it(`${target}: a NON-optional spread stays silent`, () => {
      expect(warns(REQUIRED, target)).toEqual([])
    })
  }

  it('the emit is unchanged — this is a diagnostic, not a behaviour change', () => {
    // Same source, warning aside: the lowering the toolchains reject is still
    // what comes out, because there is no correct alternative to swap in.
    expect(transform(OPTIONAL, { target: 'swift' }).code).toContain('var c = o')
    expect(transform(OPTIONAL, { target: 'kotlin' }).code).toContain('o.copy(')
  })
})
