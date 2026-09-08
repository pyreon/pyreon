// Two ways a pure helper function was misread as a COMPONENT, both found by
// running the real PMTC transform over `@pyreon/flow`'s geometry — the first
// library whose whole surface is functions over structs rather than views.
//
// The consequence is worse than a bad emit: a "component" has its top-level
// `if` statements DROPPED, so the function ships with its logic gutted. It
// does warn, but the warning names a component the author never wrote, which
// reads as noise rather than as "your helper was emptied".
//
// 1. A parameter typed with a locally-declared string-literal union warned
//    that the props type could not be resolved. It resolves perfectly well —
//    a union alias lowers to a native enum, exactly like the primitive
//    aliases already exempted beside it — and the suggested remedy (declare
//    an object shape) is wrong for an enum, so following it makes the code
//    worse.
//
// 2. A helper whose last statement is `return null` was classified by the
//    VALUE it returns, when the function had already stated its KIND in its
//    return ANNOTATION. `resolveHandleAnchor(...): { x, y, position } | null`
//    ends in `return null` for the ordinary reason — no handle was found.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { parsePyreon } from '../parse'

describe('a parameter typed with a locally-declared enum', () => {
  const SRC = `
type Position = 'top' | 'right' | 'bottom' | 'left'
function offsetFor(position: Position, size: number): number {
  if (position === 'top') { return -size }
  return size
}
`
  it('does not warn that the props type is unresolvable', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = transform(SRC, { target })
      expect(warnings.filter((w) => w.includes("props type")), target).toEqual([])
    }
  })

  it('emits it as a helper function, with its branch intact', () => {
    const swift = transform(SRC, { target: 'swift' }).code
    expect(swift).toContain('func offsetFor(')
    expect(swift).toContain('if position == .top {')
    const kotlin = transform(SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('fun offsetFor(')
    expect(kotlin).toContain('if (position == Position.top) {')
  })

  it('still lifts the alias to an enum', () => {
    expect(parsePyreon(SRC).enums).toEqual([
      { name: 'Position', cases: ['top', 'right', 'bottom', 'left'] },
    ])
  })
})

describe('a helper whose nullable return ends in `return null`', () => {
  const SRC = `
interface Anchor { x: number; y: number }
function findAnchor(id: string, ax: number, ay: number): Anchor | null {
  if (id === 'origin') { return { x: 0, y: 0 } }
  if (id === 'point') { return { x: ax, y: ay } }
  return null
}
`
  it('is a helper, not a component', () => {
    const parsed = parsePyreon(SRC)
    expect(parsed.helperFns.map((h) => h.name)).toContain('findAnchor')
    expect(parsed.components.map((c) => c.name)).not.toContain('findAnchor')
  })

  it('keeps its branches — the whole point, since a component DROPS them', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const { code, warnings } = transform(SRC, { target })
      expect(warnings.filter((w) => w.includes('was DROPPED')), target).toEqual([])
      expect(code).toContain("'origin'".replace(/'/g, '"'))
      expect(code).toContain("'point'".replace(/'/g, '"'))
    }
  })
})

describe('an UNANNOTATED `return null` is still a component', () => {
  // The value signal is only overridden by an explicit non-view annotation.
  // A render path that returns nothing must keep emitting an empty view.
  const SRC = `
interface P { label: string }
function widget(p: P) {
  return null
}
`
  it('does not become a helper', () => {
    const parsed = parsePyreon(SRC)
    expect(parsed.helperFns.map((h) => h.name)).not.toContain('widget')
  })
})

describe('a `VNodeChild` annotation is still a component', () => {
  const SRC = `
interface P { label: string }
function widget(p: P): VNodeChild {
  return null
}
`
  it('does not become a helper', () => {
    const parsed = parsePyreon(SRC)
    expect(parsed.helperFns.map((h) => h.name)).not.toContain('widget')
  })
})
