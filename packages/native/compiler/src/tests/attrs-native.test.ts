// `@pyreon/attrs` native frontend — the default-prop HOC → native.
//
// `attrs({ component: Base }).attrs({ …defaults })` accumulates default props
// over a base; the emit rewrites each `<X …use-site>` to `<Base …use-site
// …defaults>` (use-site wins), then Base lowers via the canonical / Element
// path. Mirrors the styled(Prim) frontend (styled injects a style; attrs injects
// default attrs).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { parseAttrsDefn } from '../attrs-native'
import { DEFAULT_THEME } from '../theme-native'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'
import { parseSync } from 'oxc-parser'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

function declInit(code: string): unknown {
  const ast = parseSync('t.tsx', code, { sourceType: 'module', lang: 'tsx' })
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  return ((ast.program.body[0] as any).declarations[0] as any).init
}

describe('attrs-native — default-prop HOC over Element', () => {
  const SRC = `import { attrs } from '@pyreon/attrs'
import { Element, Text } from '@pyreon/elements'
const Card = attrs({ name: 'Card', component: Element }).attrs({ direction: 'rows', gap: 'md', alignX: 'center' })
export function App() { return (<Card gap='lg'><Text>Hi</Text></Card>) }`

  it('injects default attrs; the use-site overrides a default (gap lg beats md)', () => {
    // gap: use-site 'lg' (16) wins over default 'md' (12); alignX center + rows→column.
    expect(swift(SRC).code).toContain('VStack(alignment: .center, spacing: 16)')
    expect(kotlin(SRC).code).toContain(
      'Column(verticalArrangement = Arrangement.spacedBy(16.dp), horizontalAlignment = Alignment.CenterHorizontally)',
    )
    expect(swift(SRC).warnings.join('\n')).not.toMatch(/unresolved|not.*native|WEB-ONLY/)
  })
})

describe('attrs-native — over a canonical primitive, chained .attrs()', () => {
  const SRC = `import { attrs } from '@pyreon/attrs'
import { Stack, Text } from '@pyreon/primitives'
const Box = attrs({ name: 'Box', component: Stack }).attrs({ gap: 'sm', direction: 'row' }).attrs({ gap: 'lg' })
export function App() { return (<Box><Text>Hi</Text></Box>) }`

  it('later .attrs() in the chain wins (gap lg beats the earlier sm); direction row', () => {
    // direction 'row' → HStack; gap: the second .attrs()'s 'lg' (16) wins over 'sm'.
    expect(swift(SRC).code).toContain('HStack(spacing: 16)')
    expect(kotlin(SRC).code).toContain('Row(horizontalArrangement = Arrangement.spacedBy(16.dp))')
  })

  it('parseAttrsDefn merges chain default attrs, later wins', () => {
    const init = declInit(
      `const B = attrs({ name: 'B', component: Stack }).attrs({ gap: 'sm' }).attrs({ gap: 'lg' })`,
    )
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = parseAttrsDefn('B', init as any, [], DEFAULT_THEME)
    expect(parsed?.tag).toBe('Stack')
    expect(parsed?.defaultAttrs.find((a) => a.name === 'gap')?.value).toEqual({
      kind: 'literal',
      value: 'lg',
    })
  })

  it('warns + drops a non-primitive base', () => {
    const src = `import { attrs } from '@pyreon/attrs'
const X = attrs({ name: 'X', component: 'div' }).attrs({ gap: 'md' })
export function App() { return (<X>hi</X>) }`
    expect(swift(src).warnings.join('\n')).toMatch(/only a CANONICAL @pyreon\/primitives base/)
  })
})

describe('attrs-native — toolchain gates (real SDKs)', () => {
  const SRC = `import { attrs } from '@pyreon/attrs'
import { Element, Text } from '@pyreon/elements'
const Card = attrs({ name: 'Card', component: Element }).attrs({ direction: 'rows', gap: 'md', alignX: 'center' })
export function App() { return (<Card gap='lg'><Text>Hi</Text></Card>) }`

  it.skipIf(!isSwiftUIAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')(
    'the attrs component typechecks (real SwiftUI SDK)',
    () => {
      const res = validateSwiftTypecheck(swift(SRC).code)
      expect(res.ok, res.error).toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable() || process.env.PYREON_SKIP_SLOW_TESTS === '1')(
    'the attrs component compiles (real kotlinc)',
    () => {
      const res = validateKotlin(kotlin(SRC).code)
      expect(res.ok, res.error).toBe(true)
    },
  )
})
