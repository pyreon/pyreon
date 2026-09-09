// Two more shapes the flow geometry surfaced, both silent.
//
// 1. `let out: string` with NO initializer — assigned later, typically once per
//    branch. The parser returned null for a declarator without an `init`, so
//    the declaration vanished and every later assignment named a variable that
//    was never declared. On the generated geometry that was FORTY errors
//    ("cannot find 'path' in scope", "unresolved reference"), from three lines
//    of perfectly ordinary TypeScript.
//
// 2. A string literal standing in for an enum case in a position the earlier
//    fixes had not reached. Those were added one POSITION at a time —
//    comparison, then return — and the geometry immediately produced two more
//    (a `??` default and a struct field). Rather than a third and fourth ad-hoc
//    branch, the rewrite now hangs off `withExpectedType`, which every position
//    that knows its expected type already threads. The specs below pin the two
//    new positions; the general hook is what makes a fifth one work for free.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

/** Type-check the emit on whichever toolchains this machine has. */
function expectCompiles(src: string): void {
  if (isSwiftUIAvailable()) {
    const r = validateSwiftTypecheck(transform(src, { target: 'swift' }).code)
    expect(r.ok, `swift: ${r.error ?? ''}`).toBe(true)
  }
  if (isKotlincAvailable()) {
    const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
    expect(r.ok, `kotlin: ${r.error ?? ''}`).toBe(true)
  }
}

describe('a declaration with no initializer', () => {
  const SRC = `
function label(flag: boolean, n: number): string {
  let out: string
  let count: number
  if (flag) {
    out = 'yes'
    count = n
  } else {
    out = 'no'
    count = 0
  }
  return out + String(count)
}
`
  it('is declared as a var on Swift', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('var out: String')
    expect(code).toContain('var count: Int')
  })

  it('is declared as a var on Kotlin', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('var out: String')
    expect(code).toContain('var count: Int')
  })

  it('compiles — the assignments now have something to assign to', () => {
    expectCompiles(SRC)
  })

  it('warns when there is no annotation either, instead of dropping silently', () => {
    // Without an annotation there is genuinely nothing to declare: the type
    // exists nowhere in the source. Say so rather than guess.
    const src = `
function f(flag: boolean): number {
  let out
  if (flag) { out = 1 } else { out = 2 }
  return out
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = transform(src, { target })
      expect(
        warnings.filter((w) => w.includes('no initializer and no type annotation')),
        target,
      ).toHaveLength(1)
    }
  })

  it('leaves an initialized declaration alone', () => {
    // A param is required for the helper carve-out — a no-param function is
    // read as a component by design (see the `hasValueParams` gate).
    const src = `
function f(seed: string): string {
  const out: string = 'x'
  return out + seed
}
`
    // The annotation is redundant when the initializer types it, so the emit
    // drops it — the point of this spec is that the declaration is still THERE.
    expect(transform(src, { target: 'swift' }).code).toContain('let out = "x"')
  })
})

describe('an enum literal in a position the per-position fixes had not reached', () => {
  const SRC = `
type Side = 'top' | 'bottom'
interface Params { side?: Side }
interface Anchor { x: number; side: Side }

function sideOf(p: Params): Side {
  const s = p.side ?? 'bottom'
  return s
}
function anchorAt(x: number): Anchor {
  return { x: x, side: 'top' }
}
`
  it('lowers a `??` DEFAULT on both targets', () => {
    expect(transform(SRC, { target: 'swift' }).code).toContain('?? .bottom')
    expect(transform(SRC, { target: 'kotlin' }).code).toContain('?: Side.bottom')
  })

  it('lowers a STRUCT FIELD on both targets', () => {
    expect(transform(SRC, { target: 'swift' }).code).toContain('side: .top')
    expect(transform(SRC, { target: 'kotlin' }).code).toContain('side = Side.top')
  })

  it('never leaves a raw string where the enum is expected', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code } = transform(SRC, { target })
      expect(code, target).not.toMatch(/[?:] "(top|bottom)"/)
      expect(code, target).not.toMatch(/side[:=] "(top|bottom)"/)
    }
  })

  it('compiles', () => expectCompiles(SRC))

  it('leaves a genuinely String-typed field alone', () => {
    const src = `
type Side = 'top' | 'bottom'
interface Label { text: string }
function make(): Label {
  return { text: 'top' }
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).code, target).toContain('"top"')
    }
  })
})
