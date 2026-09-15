// Branch matrices for the three styling FRONTEND modules the emit consumes:
//
//   * `theme-native.ts`      — `defineTheme({…})` → ThemeTable, token resolution
//   * `attrs-native.ts`      — `attrs({component}).attrs({…})` default-prop HOC
//   * `rocketstyle-native.ts` — the rocketstyle chain + use-site resolution
//
// Driven through the real `transform()` wherever the shape can be authored, and
// through each module's own exported entry (fed a REAL oxc declarator init —
// never a hand-built node) where a shape needs to be inspected in isolation.

import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { transform } from '../index'
import { parseAttrsDefn } from '../attrs-native'
import { parseRocketstyleDefn } from '../rocketstyle-native'
import { DEFAULT_THEME, mergeTheme, parseThemeDefinition, resolveThemeToken } from '../theme-native'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

/** The `init` of the FIRST declarator in `code`, straight out of oxc. */
function declInit(code: string): unknown {
  const ast = parseSync('t.tsx', code, { sourceType: 'module', lang: 'tsx' })
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  return ((ast.program.body[0] as any).declarations[0] as any).init
}
/** The first EXPRESSION statement's expression — for a bare member chain. */
function exprOf(code: string): unknown {
  const ast = parseSync('t.tsx', code, { sourceType: 'module', lang: 'tsx' })
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  return (ast.program.body[0] as any).expression
}

// ─── theme-native ────────────────────────────────────────────────────

describe('theme-native — parseThemeDefinition', () => {
  const parse = (code: string) => parseThemeDefinition(declInit(code))

  it('requires the `defineTheme` marker — a bare object is NOT swallowed as a theme', () => {
    expect(parse(`const t = { color: { primary: '#000' } }`)).toBeNull()
    expect(parse(`const t = other({ color: { primary: '#000' } })`)).toBeNull()
    expect(parse(`const t = defineTheme({ color: { primary: '#000' } })`)).toEqual({
      color: { primary: '#000' },
    })
  })

  it('returns null when the marker has no object-literal argument', () => {
    expect(parse(`const t = defineTheme()`)).toBeNull()
    expect(parse(`const t = defineTheme(external)`)).toBeNull()
    expect(parse(`const t = defineTheme('nope')`)).toBeNull()
  })

  it('accepts every GROUP ALIAS and rejects an unknown group', () => {
    expect(parse(`const t = defineTheme({ colors: { a: '#1' }, space: { b: 2 }, radii: { c: 3 } })`)).toEqual({
      color: { a: '#1' },
      spacing: { b: 2 },
      radius: { c: 3 },
    })
    expect(
      parse(`const t = defineTheme({ borderRadius: { d: 4 }, fontSizes: { e: 5 }, fontWeights: { f: 6 } })`),
    ).toEqual({ radius: { d: 4 }, fontSize: { e: 5 }, fontWeight: { f: 6 } })
    expect(parse(`const t = defineTheme({ shadows: { a: '1px' } })`)).toBeNull()
  })

  it('MERGES two aliases of the same group rather than replacing', () => {
    expect(parse(`const t = defineTheme({ spacing: { a: 1 }, space: { b: 2 } })`)).toEqual({
      spacing: { a: 1, b: 2 },
    })
  })

  it('skips a non-object group body and a group with no literal leaves', () => {
    expect(parse(`const t = defineTheme({ color: 'red', spacing: { a: 1 } })`)).toEqual({
      spacing: { a: 1 },
    })
    expect(parse(`const t = defineTheme({ color: { fn: () => 1 }, spacing: { a: 1 } })`)).toEqual({
      spacing: { a: 1 },
    })
  })

  it('enforces the per-group VALUE type: colours are strings, dimensions are numbers', () => {
    expect(parse(`const t = defineTheme({ color: { ok: '#fff', bad: 12 } })`)).toEqual({
      color: { ok: '#fff' },
    })
    expect(parse(`const t = defineTheme({ spacing: { ok: 8, bad: 'huge' } })`)).toEqual({
      spacing: { ok: 8 },
    })
  })

  it('reads a NEGATIVE numeric leaf, and skips a spread, a computed key and a numeric key', () => {
    expect(parse(`const t = defineTheme({ spacing: { pull: -4 } })`)).toEqual({
      spacing: { pull: -4 },
    })
    expect(
      parse(`const t = defineTheme({ ...base, [k]: { a: 1 }, spacing: { ...more, [k]: 1, 900: 2, ok: 3 } })`),
    ).toEqual({ spacing: { ok: 3 } })
  })

  it('skips a nested object leaf rather than flattening it', () => {
    expect(parse(`const t = defineTheme({ color: { deep: { a: '#1' }, flat: '#2' } })`)).toEqual({
      color: { flat: '#2' },
    })
  })
})

describe('theme-native — mergeTheme and resolveThemeToken', () => {
  it('returns the defaults untouched for a null/undefined override', () => {
    expect(mergeTheme(null)).toBe(DEFAULT_THEME)
    expect(mergeTheme(undefined)).toBe(DEFAULT_THEME)
  })

  it('merges PER ENTRY, so an unlisted default survives an override', () => {
    const merged = mergeTheme({ color: { primary: '#000' } })
    expect(merged.color.primary).toBe('#000')
    expect(merged.color.danger).toBe(DEFAULT_THEME.color.danger)
    expect(merged.spacing).toEqual(DEFAULT_THEME.spacing)
  })

  const tok = (code: string) => resolveThemeToken(exprOf(code))

  it('resolves both authoring shapes: the theme directly and through props', () => {
    expect(tok(`t.color.primary`)).toBe('#2563eb')
    expect(tok(`p.theme.color.primary`)).toBe('#2563eb')
    expect(tok(`t.spacing.md`)).toBe(12)
  })

  it('resolves an ARROW whose body is the chain, concise AND block-return', () => {
    expect(tok(`((t) => t.color.danger)`)).toBe('#dc2626')
    expect(tok(`((t) => { return t.color.danger })`)).toBe('#dc2626')
    expect(tok(`((t) => { noop() })`)).toBeNull()
  })

  it('takes the FIRST known entry in a nested chain', () => {
    expect(tok(`t.color.system.primary.base`)).toBe('#2563eb')
  })

  it('returns null for a short chain, an unknown group, an unknown entry, and a non-chain', () => {
    expect(tok(`t.color`)).toBeNull()
    expect(tok(`t.shadows.lg`)).toBeNull()
    expect(tok(`t.color.notAToken`)).toBeNull()
    expect(tok(`someIdent`)).toBeNull()
    expect(tok(`f().color.primary`)).toBeNull()
  })

  it('returns null for a COMPUTED member segment', () => {
    expect(tok(`t.color['primary']`)).toBeNull()
    expect(tok(`t.color[k]`)).toBeNull()
  })

  it('resolves against the APP theme when one is given', () => {
    const app = mergeTheme({ color: { primary: '#abcdef' } })
    expect(resolveThemeToken(exprOf(`t.color.primary`), app)).toBe('#abcdef')
  })

  it('reaches the emit: a defineTheme() override changes the resolved token value', () => {
    const app = (spacing: string) => `import { defineTheme } from '@pyreon/primitives'
import { rocketstyle } from '@pyreon/rocketstyle'
import { Stack, Text } from '@pyreon/primitives'
const theme = defineTheme({ spacing: ${spacing} })
const Btn = rocketstyle()({ name: 'Btn', component: Stack }).theme((t) => ({ padding: t.spacing.md }))
export function App() { return (<Btn><Text>x</Text></Btn>) }`
    // The DEFAULT md is 12; the app's own theme must win.
    expect(swift(app('{ md: 99 }')).code).toContain('.padding(99)')
    expect(swift(app('{ lg: 1 }')).code).toContain('.padding(12)')
  })
})

// ─── attrs-native ────────────────────────────────────────────────────

describe('attrs-native — the config object', () => {
  const parse = (code: string, warnings: string[] = []) =>
    parseAttrsDefn('X', declInit(code), warnings, DEFAULT_THEME)

  it('reads `component` as an identifier AND as a string literal', () => {
    expect(parse(`const X = attrs({ name: 'X', component: Stack }).attrs({ gap: 'md' })`)?.tag).toBe(
      'Stack',
    )
    expect(parse(`const X = attrs({ name: 'X', component: 'Stack' }).attrs({ gap: 'md' })`)?.tag).toBe(
      'Stack',
    )
  })

  it('refuses the BARE `attrs(Base)` form by name, because it throws at mount on web', () => {
    const warnings: string[] = []
    expect(parse(`const X = attrs(Stack).attrs({ gap: 'md' })`, warnings)).toBeNull()
    expect(warnings.join('\n')).toContain('@pyreon/attrs takes an OPTIONS OBJECT')
    expect(warnings.join('\n')).toContain("attrs({ name: 'X', component: Stack })")
  })

  it('returns null for a config that is not an object literal, and for a missing `component`', () => {
    expect(parse(`const X = attrs().attrs({ gap: 'md' })`)).toBeNull()
    expect(parse(`const X = attrs('nope').attrs({ gap: 'md' })`)).toBeNull()
    expect(parse(`const X = attrs({ name: 'X' }).attrs({ gap: 'md' })`)).toBeNull()
    expect(parse(`const X = attrs({ ...cfg }).attrs({ gap: 'md' })`)).toBeNull()
  })

  it('returns null when the chain has no `attrs(` head at all', () => {
    expect(parse(`const X = other({ component: Stack }).attrs({ gap: 'md' })`)).toBeNull()
    expect(parse(`const X = Stack`)).toBeNull()
  })

  it('warns by name for a base that has no native primitive', () => {
    const warnings: string[] = []
    expect(parse(`const X = attrs({ component: SomeDiv }).attrs({ gap: 'md' })`, warnings)).toBeNull()
    expect(warnings.join('\n')).toContain('has no native primitive')
  })
})

describe('attrs-native — default-attr merging', () => {
  const parse = (code: string, warnings: string[] = []) =>
    parseAttrsDefn('X', declInit(code), warnings, DEFAULT_THEME)
  const defaults = (code: string) =>
    Object.fromEntries((parse(code)?.defaultAttrs ?? []).map((a) => [a.name, a.value]))

  it('merges across the chain, LAST call winning, walking through .config/.statics', () => {
    expect(
      defaults(
        `const X = attrs({ component: Stack }).attrs({ gap: 'md', align: 'start' }).config({ a: 1 }).attrs({ gap: 'lg' })`,
      ),
    ).toEqual({ gap: { kind: 'literal', value: 'lg' }, align: { kind: 'literal', value: 'start' } })
  })

  it('reads string, number and NEGATIVE-number literal defaults', () => {
    expect(defaults(`const X = attrs({ component: Stack }).attrs({ a: 's', b: 2, c: -3 })`)).toEqual({
      a: { kind: 'literal', value: 's' },
      b: { kind: 'literal', value: 2 },
      c: { kind: 'literal', value: -3 },
    })
  })

  it('resolves a theme TOKEN default, and drops a non-literal one BY NAME', () => {
    const warnings: string[] = []
    const ir = parse(
      `const X = attrs({ component: Stack }).attrs({ background: (t) => t.color.primary, gap: computeIt() })`,
      warnings,
    )
    expect(ir?.defaultAttrs).toContainEqual({
      name: 'background',
      value: { kind: 'literal', value: '#2563eb' },
    })
    expect(ir?.defaultAttrs.map((a) => a.name)).not.toContain('gap')
    expect(warnings.join('\n')).toContain('default attr value(s) [gap] are dynamic / non-literal')
  })

  it('names a CALLBACK `.attrs()` as "(dynamic)", and an argument-less one as nothing at all', () => {
    const cbWarn: string[] = []
    parse(`const X = attrs({ component: Stack }).attrs((p) => ({ gap: 'md' }))`, cbWarn)
    expect(cbWarn.join('\n')).toContain('[(dynamic)]')
    const emptyWarn: string[] = []
    const ir = parse(`const X = attrs({ component: Stack }).attrs()`, emptyWarn)
    expect(emptyWarn.join('\n')).toBe('')
    expect(ir?.defaultAttrs).toEqual([])
  })

  it('skips a spread, a computed key and a numeric key among the defaults', () => {
    expect(
      defaults(`const X = attrs({ component: Stack }).attrs({ ...more, [k]: 1, 900: 2, gap: 'md' })`),
    ).toEqual({ gap: { kind: 'literal', value: 'md' } })
  })

  it('reaches the emit: the use-site value beats the default', () => {
    const src = `import { attrs } from '@pyreon/attrs'
import { Stack, Text } from '@pyreon/primitives'
const Card = attrs({ name: 'Card', component: Stack }).attrs({ gap: 'md' })
export function App() { return (<Card gap='lg'><Text>x</Text></Card>) }`
    expect(swift(src).code).toContain('spacing: 16')
    expect(kotlin(src).code).toContain('Arrangement.spacedBy(16.dp)')
  })
})

// ─── rocketstyle-native ──────────────────────────────────────────────

describe('rocketstyle-native — parseRocketstyleDefn', () => {
  const parse = (code: string, warnings: string[] = []) =>
    parseRocketstyleDefn('X', declInit(code), warnings, DEFAULT_THEME)
  const HEAD = `rocketstyle()({ name: 'X', component: Stack })`

  it('requires the CURRIED head over a canonical primitive', () => {
    expect(parse(`const X = ${HEAD}.states((t) => ({ a: { padding: 1 } }))`)).not.toBeNull()
    expect(parse(`const X = rocketstyle({ component: Stack }).states((t) => ({}))`)).toBeNull()
    expect(parse(`const X = other()({ component: Stack }).states((t) => ({}))`)).toBeNull()
    expect(parse(`const X = Stack`)).toBeNull()
    expect(parse(`const X = rocketstyle()('nope').states((t) => ({}))`)).toBeNull()
    expect(parse(`const X = rocketstyle()({ name: 'X' }).states((t) => ({}))`)).toBeNull()
  })

  it('reads the component as an identifier AND as a string literal', () => {
    expect(parse(`const X = rocketstyle()({ component: Stack }).theme((t) => ({ padding: 1 }))`)?.tag).toBe('Stack')
    expect(parse(`const X = rocketstyle()({ component: 'Stack' }).theme((t) => ({ padding: 1 }))`)?.tag).toBe('Stack')
  })

  it('warns by name for a non-primitive base', () => {
    const warnings: string[] = []
    expect(parse(`const X = rocketstyle()({ component: SomeDiv }).theme((t) => ({}))`, warnings)).toBeNull()
    expect(warnings.join('\n')).toContain('has no native primitive')
  })

  it('breaks the chain walk on a computed STRING method step, but walks through a bare one', () => {
    // `HEAD['states'](…)` — the property is a Literal, so the walk breaks and the
    // head is never reached.
    expect(parse(`const X = ${HEAD}['states']((t) => ({ a: { padding: 1 } }))`)).toBeNull()
    // `HEAD[m]()` — the property IS an Identifier, so it reads as an unknown
    // method name and is simply traversed; the head still resolves.
    expect(parse(`const X = ${HEAD}[m]().states((t) => ({ a: { padding: 1 } }))`)).not.toBeNull()
  })

  it('accepts .theme()/.states() as an arrow-object, a block-return, or a bare object', () => {
    const base = (code: string) => parse(code)?.base.fields
    expect(base(`const X = ${HEAD}.theme((t) => ({ padding: 1 }))`)).toEqual([
      { name: 'padding', value: { kind: 'literal', value: 1 } },
    ])
    expect(base(`const X = ${HEAD}.theme((t) => { return { padding: 1 } })`)).toEqual([
      { name: 'padding', value: { kind: 'literal', value: 1 } },
    ])
    expect(base(`const X = ${HEAD}.theme({ padding: 1 })`)).toEqual([
      { name: 'padding', value: { kind: 'literal', value: 1 } },
    ])
  })

  it('yields an EMPTY style for every un-extractable dimension-body shape', () => {
    const emptyShapes = [
      `${HEAD}.theme((t) => { noop() })`,
      `${HEAD}.theme((t) => 1)`,
      `${HEAD}.theme(someFn)`,
      `${HEAD}.theme()`,
      HEAD,
    ]
    for (const code of emptyShapes) {
      expect(parse(`const X = ${code}`)?.base.fields, code).toEqual([])
    }
  })

  it('reads literal, negative-literal and theme-token property values; drops the rest BY NAME', () => {
    const warnings: string[] = []
    const ir = parse(
      `const X = ${HEAD}.theme((t) => ({ a: 's', b: 2, c: -3, d: t.color.primary, e: computeIt() }))`,
      warnings,
    )
    expect(ir?.base.fields).toEqual([
      { name: 'a', value: { kind: 'literal', value: 's' } },
      { name: 'b', value: { kind: 'literal', value: 2 } },
      { name: 'c', value: { kind: 'literal', value: -3 } },
      { name: 'd', value: { kind: 'literal', value: '#2563eb' } },
    ])
    expect(warnings.join('\n')).toContain('non-literal value(s) [e]')
  })

  it('skips a spread, a computed key and a numeric key among the style properties', () => {
    expect(
      parse(`const X = ${HEAD}.theme((t) => ({ ...more, [k]: 1, 900: 2, ok: 3 }))`)?.base.fields,
    ).toEqual([{ name: 'ok', value: { kind: 'literal', value: 3 } }])
  })

  it('refuses the object-of-FUNCTIONS dimension form by name', () => {
    const warnings: string[] = []
    const ir = parse(`const X = ${HEAD}.sizes((t) => ({ small: () => ({ width: 1 }), big: { width: 2 } }))`, warnings)
    expect(Object.keys(ir?.dims.size ?? {})).toEqual(['big'])
    expect(warnings.join('\n')).toContain("value 'small' is a FUNCTION")
    expect(warnings.join('\n')).toContain('rocketstyle takes ONE callback returning the whole map')
  })

  it('skips a spread / computed / numeric key among the dimension VALUES', () => {
    const ir = parse(`const X = ${HEAD}.states((t) => ({ ...more, [k]: {}, 900: {}, ok: { padding: 1 } }))`)
    expect(Object.keys(ir?.dims.state ?? {})).toEqual(['ok'])
  })
})

describe('rocketstyle-native — use-site resolution', () => {
  // The use-site injects `style={…}`, so the values are CSS-shaped (a #hex
  // colour, a numeric dimension) rather than canonical token names.
  const src = (usage: string) => `import { rocketstyle } from '@pyreon/rocketstyle'
import { Stack, Text } from '@pyreon/primitives'
const Btn = rocketstyle()({ name: 'Btn', component: Stack })
  .theme((t) => ({ padding: 4, background: '#111111' }))
  .states((t) => ({ primary: { background: '#2563eb' }, danger: { background: '#dc2626' } }))
  .sizes((t) => ({ small: { padding: 8 }, large: { padding: 16 } }))
export function App({ hot }: { hot: boolean }) { return (${usage}) }`

  it('merges base ∪ each STATIC dimension, with the dimension winning over the base', () => {
    const out = swift(src(`<Btn state='primary' size='large'><Text>x</Text></Btn>`)).code
    expect(out).toContain('.padding(16)') // size beats the base's 4
    expect(out).not.toContain('.padding(4)')
    expect(out).toContain('red: 0.145, green: 0.388, blue: 0.922') // #2563eb beats #111111
  })

  it('keeps the BASE value for a dimension whose static value is not declared', () => {
    const out = swift(src(`<Btn state='nope'><Text>x</Text></Btn>`)).code
    expect(out).toContain('.padding(4)')
    expect(out).toContain('red: 0.067, green: 0.067, blue: 0.067') // #111111, the base
  })

  it('lowers ONE dynamic dimension to a reactive conditional value', () => {
    const out = swift(src(`<Btn state={hot ? 'danger' : 'primary'}><Text>x</Text></Btn>`)).code
    expect(out).toMatch(/\(hot\) \? /)
  })

  it('warns when a dynamic dimension ternary is not two DECLARED values', () => {
    const w = swift(src(`<Btn state={hot ? 'danger' : 'unknown'}><Text>x</Text></Btn>`)).warnings.join('\n')
    expect(w).toContain('a dynamic dimension must be a ternary of TWO DECLARED state values')
  })

  it('warns and falls back to the FIRST branch when TWO dimensions are dynamic', () => {
    const w = swift(
      src(`<Btn state={hot ? 'danger' : 'primary'} size={hot ? 'large' : 'small'}><Text>x</Text></Btn>`),
    ).warnings.join('\n')
    expect(w).toContain('more than one dynamic dimension prop')
    expect(w).toContain('resolved to its FIRST branch')
  })
})

describe('theme-native / attrs-native / rocketstyle-native — residual key and body shapes', () => {
  const parseTheme = (code: string) => parseThemeDefinition(declInit(code))
  const parseAttrs = (code: string, w: string[] = []) =>
    parseAttrsDefn('X', declInit(code), w, DEFAULT_THEME)
  const parseRkt = (code: string, w: string[] = []) =>
    parseRocketstyleDefn('X', declInit(code), w, DEFAULT_THEME)
  const HEAD = `rocketstyle()({ name: 'X', component: Stack })`

  it('reads a STRING-literal group key in defineTheme, and skips a numeric one', () => {
    expect(parseTheme(`const t = defineTheme({ 'color': { a: '#1' } })`)).toEqual({
      color: { a: '#1' },
    })
    expect(parseTheme(`const t = defineTheme({ 900: { a: 1 }, spacing: { b: 2 } })`)).toEqual({
      spacing: { b: 2 },
    })
  })

  it('reads a STRING-literal key inside a theme group', () => {
    expect(parseTheme(`const t = defineTheme({ color: { 'brand-primary': '#1' } })`)).toEqual({
      color: { 'brand-primary': '#1' },
    })
  })

  it('rejects a non-string `component` literal in an attrs config and a rocketstyle one', () => {
    expect(parseAttrs(`const X = attrs({ component: 123 }).attrs({ gap: 'md' })`)).toBeNull()
    expect(parseRkt(`const X = rocketstyle()({ component: 123 }).theme((t) => ({ padding: 1 }))`)).toBeNull()
  })

  it('skips a SPREAD inside the rocketstyle config object', () => {
    // The spread is stepped over; `component` behind it still resolves.
    expect(
      parseRkt(`const X = rocketstyle()({ ...base, component: Stack }).theme((t) => ({ padding: 1 }))`)?.tag,
    ).toBe('Stack')
  })

  it('yields an EMPTY dimension map for a dimension arg with no object body, or none at all', () => {
    expect(parseRkt(`const X = ${HEAD}.states((t) => 1)`)?.dims.state).toEqual({})
    expect(parseRkt(`const X = ${HEAD}.states()`)?.dims.state).toEqual({})
    expect(parseRkt(`const X = ${HEAD}.states(someFn)`)?.dims.state).toEqual({})
  })

  it('drops a dynamic dimension whose ternary branch is not a STRING literal', () => {
    const src = `import { rocketstyle } from '@pyreon/rocketstyle'
import { Stack, Text } from '@pyreon/primitives'
const Btn = rocketstyle()({ name: 'Btn', component: Stack })
  .states((t) => ({ primary: { padding: 4 }, danger: { padding: 8 } }))
export function App({ hot }: { hot: boolean }) {
  return (<Btn state={hot ? 'primary' : 42}><Text>x</Text></Btn>)
}`
    expect(swift(src).warnings.join('\n')).toContain(
      'a dynamic dimension must be a ternary of TWO DECLARED state values',
    )
  })
})
