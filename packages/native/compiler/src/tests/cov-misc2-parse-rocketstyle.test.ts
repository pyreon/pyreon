// Branch-coverage matrix for `parse-rocketstyle.ts` — a rocketstyle chain in
// source → RocketstyleIR (the standalone frontend, distinct from
// `rocketstyle-native.ts`'s use-site resolver).
//
// Each spec pairs a chain/dimension/value shape that IS recognised with the
// neighbouring shape that must be refused — a recognised head against an
// unknown one, each theme-token chain form against every way it bails, and
// every warned drop asserted BY ITS MESSAGE rather than by absence.

import { describe, expect, it } from 'vitest'
import { parseRocketstyle } from '../parse-rocketstyle'

const irs = (src: string) => parseRocketstyle(src).rocketstyles
const names = (src: string) => irs(src).map((r) => r.name)
const warns = (src: string) => parseRocketstyle(src).warnings.join('\n')
/** The single parsed component's dimensions, as `{ dim: { value: {prop: literal} } }`. */
const shape = (src: string) =>
  Object.fromEntries(
    (irs(src)[0]?.dimensions ?? []).map((d) => [
      d.name,
      Object.fromEntries(
        d.values.map((v) => [v.name, Object.fromEntries(v.properties.map((p) => [p.name, p.value]))]),
      ),
    ]),
  )

describe('parse-rocketstyle — chain heads', () => {
  it('accepts every declared head name, bare and curried', () => {
    for (const head of ['rocketstyle', 'el', 'txt', 'list', 'rs']) {
      const src = `const A = ${head}.states((t) => ({ primary: { color: 'red' } }))`
      expect(names(src), head).toEqual(['A'])
    }
    expect(
      names(`const A = rocketstyle(Base).states((t) => ({ primary: { color: 'red' } }))`),
    ).toEqual(['A'])
  })

  it('refuses an unknown identifier head and an unknown CALL head', () => {
    expect(names(`const A = nope.states((t) => ({ primary: { color: 'red' } }))`)).toEqual([])
    expect(names(`const A = nope(Base).states((t) => ({ primary: { color: 'red' } }))`)).toEqual([])
  })

  it('refuses a chain whose root is a bare member expression or a call result', () => {
    expect(names(`const A = a.b.states((t) => ({ primary: { color: 'red' } }))`)).toEqual([])
    expect(names(`const A = f().g().states((t) => ({ primary: { color: 'red' } }))`)).toEqual([])
  })

  it('breaks out of the chain walk on a callee that is not a member expression', () => {
    // `el()(1)` — the inner callee is a CallExpression, not a MemberExpression,
    // so the walk breaks with `cur` still pointing at a call whose callee is
    // `el()`, which is not a recognised head.
    expect(names(`const A = el()(1).states((t) => ({ p: { color: 'red' } }))`)).toEqual([])
  })

  it('walks THROUGH a computed chain step, still finding the head behind it', () => {
    // `el[m]()` is not a dimension method, so it is simply traversed; the head
    // `el` is still reached. (A computed step NAMING a dimension would read the
    // variable name instead — exotic enough not to be worth a diagnostic.)
    expect(names(`const A = el[m]().states((t) => ({ p: { color: 'red' } }))`)).toEqual(['A'])
  })

  it('walks THROUGH non-dimension methods and keeps source order of the dimensions', () => {
    const src = `const A = el
      .config({ component: X })
      .attrs({ a: 1 })
      .states((t) => ({ primary: { color: 'red' } }))
      .theme((t) => ({ color: 'blue' }))
      .sizes((t) => ({ small: { padding: 4 } }))
      .variants((t) => ({ ghost: { opacity: 0.5 } }))`
    expect(irs(src)[0]?.dimensions.map((d) => d.name)).toEqual(['state', 'size', 'variant'])
  })

  it('produces nothing when the head matches but no dimension method is called', () => {
    expect(names(`const A = el.config({ component: X }).attrs({ a: 1 })`)).toEqual([])
  })
})

describe('parse-rocketstyle — declaration shapes', () => {
  it('collects a bare const and an `export const`, and walks past other export forms', () => {
    const src = `
      const A = el.states((t) => ({ p: { color: 'red' } }))
      export const B = el.states((t) => ({ p: { color: 'red' } }))
      export function f() { return 1 }
      export default el.states((t) => ({ p: { color: 'red' } }))
    `
    expect(names(src)).toEqual(['A', 'B'])
  })

  it('skips a destructured declarator and one with no init', () => {
    const src = `
      const { A } = el.states((t) => ({ p: { color: 'red' } }))
      let B
      const C = el.states((t) => ({ p: { color: 'red' } }))
    `
    expect(names(src)).toEqual(['C'])
  })

  it('unwraps TS-only layers on the init', () => {
    expect(names(`const A = (el.states((t) => ({ p: { color: 'red' } })) as never)`)).toEqual(['A'])
  })
})

describe('parse-rocketstyle — the dimension-call argument', () => {
  it('accepts the arrow-object form, the BLOCK-return form, and a bare object literal', () => {
    const arrow = `const A = el.states((t) => ({ primary: { color: 'red' } }))`
    const block = `const A = el.states((t) => { return { primary: { color: 'red' } } })`
    const bare = `const A = el.states({ primary: { color: 'red' } })`
    const expected = { state: { primary: { color: { kind: 'string', value: 'red' } } } }
    expect(shape(arrow)).toEqual(expected)
    expect(shape(block)).toEqual(expected)
    expect(shape(bare)).toEqual(expected)
  })

  it('warns and drops when the argument is missing, an identifier, or an un-extractable block', () => {
    for (const arg of ['', 'fn', '(t) => { const x = 1; return { p: {} } }', '(t) => { noop() }']) {
      const src = `const A = el.states(${arg})`
      expect(names(src), arg).toEqual([])
    }
    expect(warns(`const A = el.states(fn)`)).toContain(
      "skipped .states() in 'A' — could not extract object body",
    )
    // A missing argument bails BEFORE the body-extraction warning.
    expect(warns(`const A = el.states()`)).toBe('')
  })

  it('reads a value key that is a string literal or a NUMERIC literal', () => {
    const src = `const A = el.sizes((t) => ({ 'x-small': { padding: 1 }, 900: { padding: 2 } }))`
    // NOTE `Object.keys` puts integer-like keys first — sort for a stable compare.
    expect(Object.keys(shape(src).size ?? {}).sort()).toEqual(['900', 'x-small'])
  })

  it('skips a spread and a computed key among the dimension values', () => {
    const src = `const k = 'z'
      const base = {}
      const A = el.states((t) => ({ ...base, [k]: { color: 'red' }, ok: { color: 'blue' } }))`
    expect(Object.keys(shape(src).state ?? {})).toEqual(['ok'])
  })

  it('warns when a dimension VALUE body is not an object literal', () => {
    const src = `const A = el.states((t) => ({ primary: 'red', ok: { color: 'blue' } }))`
    expect(Object.keys(shape(src).state ?? {})).toEqual(['ok'])
    expect(warns(src)).toContain('skipped A.state.primary — value body is not an object literal')
  })

  it('drops a dimension with NO usable values, keeping a sibling dimension', () => {
    const src = `const A = el.states((t) => ({})).sizes((t) => ({ small: { padding: 4 } }))`
    expect(irs(src)[0]?.dimensions.map((d) => d.name)).toEqual(['size'])
  })

  it('emits no component at all when every dimension drops', () => {
    expect(names(`const A = el.states((t) => ({})).sizes((t) => ({}))`)).toEqual([])
  })
})

describe('parse-rocketstyle — property values', () => {
  it('reads string, number, boolean and negative-number literals', () => {
    const src = `const A = el.states((t) => ({ p: {
      color: 'red', padding: 8, bold: true, thin: false, pull: -4 } }))`
    expect(shape(src).state?.p).toEqual({
      color: { kind: 'string', value: 'red' },
      padding: { kind: 'number', value: 8 },
      bold: { kind: 'string', value: 'true' },
      thin: { kind: 'string', value: 'false' },
      pull: { kind: 'number', value: -4 },
    })
  })

  it('camel-cases to kebab, and leaves an ALREADY-kebab key alone', () => {
    const src = `const A = el.states((t) => ({ p: { backgroundColor: 'red', 'border-radius': 4 } }))`
    expect(Object.keys(shape(src).state?.p ?? {})).toEqual(['background-color', 'border-radius'])
  })

  it('warns by name on every unrecognised value shape', () => {
    const cases: [string, string][] = [
      ['nullish', 'null'],
      ['ident', 'someValue'],
      ['call', 'f()'],
      ['negIdent', '-someValue'],
      ['negString', "-'x'"],
      ['tmpl', '`x`'],
    ]
    for (const [key, expr] of cases) {
      const src = `const A = el.states((t) => ({ p: { ${key}: ${expr} } }))`
      expect(shape(src).state?.p, expr).toEqual({})
      expect(warns(src), expr).toContain(`skipped A.state.p.${key}`)
      expect(warns(src), expr).toContain('unrecognised value shape')
    }
  })

  it('warns separately for a NESTED object (pseudo-state), not as an unrecognised value', () => {
    const src = `const A = el.states((t) => ({ p: { hover: { color: 'red' }, color: 'blue' } }))`
    expect(shape(src).state?.p).toEqual({ color: { kind: 'string', value: 'blue' } })
    expect(warns(src)).toContain('pseudo-state mapping not yet supported')
  })

  it('skips a spread and a computed key among the properties', () => {
    const src = `const k = 'z'
      const base = {}
      const A = el.states((t) => ({ p: { ...base, [k]: 'red', color: 'blue' } }))`
    expect(Object.keys(shape(src).state?.p ?? {})).toEqual(['color'])
  })
})

describe('parse-rocketstyle — theme-token member chains', () => {
  const val = (expr: string, param = '(t)') =>
    shape(`const A = el.states(${param} => ({ p: { color: ${expr} } }))`).state?.p?.color

  it('resolves a two-segment chain and flattens a deeper one with underscores', () => {
    expect(val('t.color.primary')).toEqual({ kind: 'token', group: 'color', entry: 'primary' })
    expect(val('t.color.primary.base')).toEqual({
      kind: 'token',
      group: 'color',
      entry: 'primary_base',
    })
  })

  it('accepts a computed STRING and a computed NUMBER segment', () => {
    expect(val("t.color['primary']")).toEqual({ kind: 'token', group: 'color', entry: 'primary' })
    expect(val('t.color.system[500]')).toEqual({
      kind: 'token',
      group: 'color',
      entry: 'system_500',
    })
  })

  it('bails on a computed segment that is neither string nor number, and on a non-Identifier one', () => {
    expect(val('t.color[null]')).toBeUndefined()
    expect(val('t.color[a.b]')).toBeUndefined()
  })

  it('bails when the chain root is not the theme param, or is not an identifier at all', () => {
    expect(val('q.color.primary')).toBeUndefined()
    expect(val('f().color.primary')).toBeUndefined()
  })

  it('bails on a one-segment chain (`t.color`)', () => {
    expect(val('t.color')).toBeUndefined()
  })

  it('bails on ANY member chain when the dimension callback has no usable param name', () => {
    // No params at all, a destructured param, and the bare-object form all
    // leave `themeParamName` null — a member chain then cannot be a token.
    expect(val('t.color.primary', '()')).toBeUndefined()
    expect(val('t.color.primary', '({ color })')).toBeUndefined()
    expect(
      shape(`const A = el.states({ p: { color: t.color.primary } })`).state?.p?.color,
    ).toBeUndefined()
  })
})

describe('parse-rocketstyle — parse failure', () => {
  it('throws a [Pyreon]-prefixed error naming the file', () => {
    expect(() => parseRocketstyle('const = = =', 'broken.tsx')).toThrow(
      /\[Pyreon\] \[parse-rocketstyle\] failed to parse broken\.tsx/,
    )
  })
})

describe('parse-rocketstyle — residual chain and body shapes', () => {
  it('breaks the walk on a computed STRING method, so the head is never reached', () => {
    // `el['states'](…)`: the property is a Literal, not an Identifier.
    expect(names(`const A = el['states']((t) => ({ p: { color: 'red' } }))`)).toEqual([])
  })

  it('extracts no body from an arrow whose body is neither an object nor a block', () => {
    const src = `const A = el.states((t) => 1)`
    expect(names(src)).toEqual([])
    expect(warns(src)).toContain("skipped .states() in 'A' — could not extract object body")
  })
})
