// Branch-coverage matrix for `parse-theme.ts` — a `@pyreon/ui-theme`-shaped
// module source → ThemeIR.
//
// Each spec pairs the shape that takes an arm with the neighbouring shape that
// must not: a scalar against a group against a rejected value type, a nested
// object (flattened + warned) against a flat one (silent), each `export default`
// discovery form against the one that finds nothing.

import { describe, expect, it } from 'vitest'
import { parseTheme } from '../parse-theme'

const groups = (src: string) => parseTheme(src).ir.groups
const groupNames = (src: string) => groups(src).map((g) => g.name)
const entriesOf = (src: string, name: string) =>
  groups(src).find((g) => g.name === name)?.entries ?? []
const warns = (src: string) => parseTheme(src).warnings.join('\n')

describe('parse-theme — finding the theme object', () => {
  it('finds `const theme = { … }` with no export at all', () => {
    expect(groupNames(`const theme = { spacing: { md: 12 } }`)).toEqual(['spacing'])
  })

  it('finds `export default { … }` directly, ignoring an unrelated const', () => {
    const src = `
      const palette = { color: { red: '#f00' } }
      export default { spacing: { md: 12 } }
    `
    expect(groupNames(src)).toEqual(['spacing'])
  })

  it('resolves `export default theme` back to the const binding', () => {
    const src = `
      const theme = { spacing: { md: 12 } }
      export default theme
    `
    expect(groupNames(src)).toEqual(['spacing'])
  })

  it('ignores an `export default` of some OTHER identifier and falls back to the binding', () => {
    const src = `
      const theme = { spacing: { md: 12 } }
      const other = { color: { red: '#f00' } }
      export default other
    `
    expect(groupNames(src)).toEqual(['spacing'])
  })

  it('unwraps `as const` / `satisfies` layers on both the const and the default export', () => {
    expect(groupNames(`const theme = ({ spacing: { md: 12 } }) as const`)).toEqual(['spacing'])
    expect(groupNames(`export default { spacing: { md: 12 } } satisfies unknown`)).toEqual([
      'spacing',
    ])
  })

  it('walks past a declarator that is not named `theme`, has no init, or is not an object', () => {
    const src = `
      let theme2
      const notTheme = { spacing: { md: 1 } }
      const fn = () => 1
      const theme = { spacing: { md: 12 } }
    `
    expect(groupNames(src)).toEqual(['spacing'])
  })

  it('throws when no theme object is present, and when the source does not parse', () => {
    expect(() => parseTheme(`export const x = 1`, 'nope.ts')).toThrow(
      /no theme object found in nope\.ts/,
    )
    expect(() => parseTheme(`const = = =`, 'broken.ts')).toThrow(
      /\[Pyreon\] \[parse-theme\] failed to parse broken\.ts/,
    )
  })
})

describe('parse-theme — top-level key shapes', () => {
  it('promotes top-level scalars into a leading `globals` group', () => {
    const src = `const theme = { rootSize: 16, brand: 'pyreon', spacing: { md: 12 } }`
    expect(groupNames(src)).toEqual(['globals', 'spacing'])
    expect(entriesOf(src, 'globals')).toEqual([
      { name: 'rootSize', value: { kind: 'number', value: 16 } },
      { name: 'brand', value: { kind: 'string', value: 'pyreon' } },
    ])
  })

  it('emits NO globals group when every top-level key is an object', () => {
    expect(groupNames(`const theme = { spacing: { md: 12 } }`)).toEqual(['spacing'])
  })

  it('drops an EMPTY top-level object rather than emitting an entry-less group', () => {
    const src = `const theme = { empty: {}, spacing: { md: 12 } }`
    expect(groupNames(src)).toEqual(['spacing'])
  })

  it('warns by name on a top-level value that is neither scalar nor object', () => {
    const src = `const theme = { fn: () => 1, arr: [1, 2], spacing: { md: 12 } }`
    expect(groupNames(src)).toEqual(['spacing'])
    expect(warns(src)).toContain("skipped top-level key 'fn' — unsupported value type")
    expect(warns(src)).toContain("skipped top-level key 'arr' — unsupported value type")
  })

  it('reads a string key and a NUMERIC key, and skips a spread', () => {
    const src = `const base = {}
      const theme = { ...base, 'data-x': 1, 900: '#eee', spacing: { md: 12 } }`
    expect(entriesOf(src, 'globals')).toEqual([
      { name: 'data-x', value: { kind: 'number', value: 1 } },
      { name: '900', value: { kind: 'string', value: '#eee' } },
    ])
  })

  it('skips a top-level key whose Literal is neither string nor number (a regex)', () => {
    const src = `const theme = { re: /x/, spacing: { md: 12 } }`
    // The regex key reads as a Literal VALUE, not a key — the key is fine; the
    // value is a Literal, so it is scalar, but non-emittable.
    expect(groupNames(src)).toEqual(['spacing'])
  })
})

describe('parse-theme — group entries and value kinds', () => {
  it('types numbers in a LENGTH group as dp and elsewhere as plain numbers', () => {
    expect(entriesOf(`const theme = { spacing: { md: 12 } }`, 'spacing')).toEqual([
      { name: 'md', value: { kind: 'dp', value: 12 } },
    ])
    expect(entriesOf(`const theme = { zIndex: { modal: 40 } }`, 'zIndex')).toEqual([
      { name: 'modal', value: { kind: 'number', value: 40 } },
    ])
  })

  it('reads negative numbers through the UnaryExpression, in both group kinds', () => {
    expect(entriesOf(`const theme = { spacing: { pull: -4 } }`, 'spacing')).toEqual([
      { name: 'pull', value: { kind: 'dp', value: -4 } },
    ])
    expect(entriesOf(`const theme = { zIndex: { under: -1 } }`, 'zIndex')).toEqual([
      { name: 'under', value: { kind: 'number', value: -1 } },
    ])
  })

  it('reads a boolean entry as the STRING "true"/"false"', () => {
    expect(entriesOf(`const theme = { flags: { rtl: true, dark: false } }`, 'flags')).toEqual([
      { name: 'rtl', value: { kind: 'string', value: 'true' } },
      { name: 'dark', value: { kind: 'string', value: 'false' } },
    ])
  })

  it('warns on a non-emittable literal entry (null, a regex) and keeps its siblings', () => {
    const src = `const theme = { color: { nil: null, re: /x/, ok: '#fff' } }`
    expect(entriesOf(src, 'color')).toEqual([
      { name: 'ok', value: { kind: 'string', value: '#fff' } },
    ])
    expect(warns(src)).toContain("skipped 'color.nil' — non-emittable literal")
    expect(warns(src)).toContain("skipped 'color.re' — non-emittable literal")
  })

  it('rejects a NEGATED non-number (`-someIdent`, `-"x"`) rather than emitting it', () => {
    const src = `const theme = { spacing: { a: -ident, b: -'x', ok: 4 } }`
    // `-ident` is a UnaryExpression whose argument is NOT a Literal → not a
    // scalar literal at all → the unsupported-value-type warning.
    expect(entriesOf(src, 'spacing')).toEqual([{ name: 'ok', value: { kind: 'dp', value: 4 } }])
    expect(warns(src)).toContain("skipped 'spacing.a' — unsupported value type")
    // `-'x'` IS a scalar literal shape, but negating a string is non-emittable.
    expect(warns(src)).toContain("skipped 'spacing.b' — non-emittable literal")
  })

  it('warns by name on an entry that is a function or an array', () => {
    const src = `const theme = { color: { fn: () => 1, arr: [], ok: '#fff' } }`
    expect(entriesOf(src, 'color')).toEqual([
      { name: 'ok', value: { kind: 'string', value: '#fff' } },
    ])
    expect(warns(src)).toContain("skipped 'color.fn' — unsupported value type 'ArrowFunctionExpression'")
    expect(warns(src)).toContain("skipped 'color.arr' — unsupported value type 'ArrayExpression'")
  })

  it('skips a spread and a computed key inside a group, keeping the literal siblings', () => {
    const src = `const k = 'x'
      const base = {}
      const theme = { color: { ...base, [k]: '#000', ok: '#fff' } }`
    expect(entriesOf(src, 'color')).toEqual([
      { name: 'ok', value: { kind: 'string', value: '#fff' } },
    ])
  })
})

describe('parse-theme — nested groups flatten with a warning', () => {
  it('flattens a 3-level key to an underscore-joined entry name and warns ONCE per level', () => {
    const src = `const theme = { color: { system: { light: { base: '#fff' } }, flat: '#000' } }`
    expect(entriesOf(src, 'color')).toEqual([
      { name: 'system_light_base', value: { kind: 'string', value: '#fff' } },
      { name: 'flat', value: { kind: 'string', value: '#000' } },
    ])
    expect(warns(src)).toContain('flattened color.system.*')
    expect(warns(src)).toContain('flattened color.system_light.*')
  })

  it('does NOT warn for a flat group', () => {
    expect(warns(`const theme = { color: { primary: '#2563eb' } }`)).toBe('')
  })

  it('keeps the LENGTH-group value kind through the flatten', () => {
    const src = `const theme = { spacing: { inset: { sm: 4 } } }`
    expect(entriesOf(src, 'spacing')).toEqual([
      { name: 'inset_sm', value: { kind: 'dp', value: 4 } },
    ])
  })
})
