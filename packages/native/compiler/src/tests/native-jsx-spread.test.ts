// JSX spread attributes `<Comp {...src} />` (subset widening).
//
// A spread attr was SILENTLY DROPPED (parseJsxAttr bailed on the
// JSXSpreadAttribute node), so forwarded props vanished on native. Now it
// EXPANDS to per-prop constructor args for a USER component:
//
//   <Card {...props} />           -> Card(title: title, count: count)   (Swift)
//                                    Card(title = title, count = count)  (Kotlin)
//     (target Card's declared props, each sourced as `props.<prop>` — a
//      `props` source rewrites to the bare prop on the target)
//   <Card {...{ title: 'x', n: 1 }} /> -> expands the object-literal's fields
//
// Explicit sibling attrs WIN over a spread's props (React override rule).
// A spread onto a native PRIMITIVE (Stack/Text) has no equivalent → warn.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const APP = `import { Stack, Text } from '@pyreon/primitives'
function Card(props: { title: string; count: number }) {
  return (<Stack><Text>{props.title}</Text></Stack>)
}
function App(props: { title: string; count: number }) {
  return (<Stack>
    <Card {...props} />
    <Card {...{ title: 'lit', count: 5 }} />
    <Card {...props} title="override" />
  </Stack>)
}`

describe('JSX spread attributes', () => {
  it('Swift: {...props} expands the target component’s props (sourced from props)', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('Card(title: title, count: count)')
  })

  it('Kotlin: {...props} expands the target component’s props', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('Card(title = title, count = count)')
  })

  it('an object-literal spread expands its own fields', () => {
    const sw = transform(APP, { target: 'swift' }).code
    const kt = transform(APP, { target: 'kotlin' }).code
    expect(sw).toContain('Card(title: "lit", count: 5)')
    expect(kt).toContain('Card(title = "lit", count = 5)')
  })

  it('an explicit sibling attr WINS over the spread (override rule)', () => {
    const sw = transform(APP, { target: 'swift' }).code
    // title comes from the explicit attr, count from the spread — title NOT doubled
    expect(sw).toContain('Card(count: count, title: "override")')
    expect(sw).not.toContain('title: title, count: count, title: "override"')
  })

  it('a spread onto a native primitive is ignored, not crashed (limitation)', () => {
    // Spreads target USER components; a primitive (Stack/Text) routes through
    // its own layout emitter, which ignores the spread (its props are fixed
    // layout args, not a forwarded bag). v1 limitation — pass layout props
    // explicitly. Asserting it emits cleanly (no expansion, no crash).
    const res = transform(
      `import { Stack } from '@pyreon/primitives'
function App(props: { gap: number }) { return (<Stack {...props} />) }`,
      { target: 'swift' },
    )
    expect(res.code).toContain('struct App: View')
    expect(res.code).not.toContain('{...}')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: spread expansion typechecks via swiftc', () => {
    const res = validateSwift(transform(APP, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: spread expansion typechecks via kotlinc', () => {
    const res = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
