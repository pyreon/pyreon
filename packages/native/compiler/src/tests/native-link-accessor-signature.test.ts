// `<Link to={…}>` lowers to `PyreonLink(<to: String>) { … }` on both targets.
// The literal + signal `to` shapes worked; the ACCESSOR shape `to={() => url()}`
// reached the `to` emit un-unwrapped, so it emitted a closure/lambda where a
// String is expected — the same class as the <Field>/<Toggle> accessor fixes:
//
//   Swift  → PyreonLink({ url }) { … }  — `closure passed to parameter of type 'String'`
//   Kotlin → PyreonLink({ url }) { … }  — `'() -> String' but 'String' was expected`
//
// Fix: unwrap the accessor arrow in `emitSwiftLink`/`emitKotlinLink`'s `toExpr`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (jsx: string) => `import { Stack, Link, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const url = signal('/x')
  return (<Stack>${jsx}</Stack>)
}`
const swift = (jsx: string) => transform(app(jsx), { target: 'swift' }).code
const kotlin = (jsx: string) => transform(app(jsx), { target: 'kotlin' }).code

describe('<Link to={…}> accessor unwrap', () => {
  it('accessor `to` lowers to the value, not a closure/lambda', () => {
    const jsx = '<Link to={() => url()}><Text>x</Text></Link>'
    expect(swift(jsx)).toContain('PyreonLink(url)')
    expect(swift(jsx)).not.toMatch(/PyreonLink\(\{ url \}\)/)
    expect(kotlin(jsx)).toContain('PyreonLink(url)')
    expect(kotlin(jsx)).not.toMatch(/PyreonLink\(\{ url \}\)/)
  })

  it('literal + signal `to` are unchanged (no regression)', () => {
    expect(swift('<Link to="/home"><Text>x</Text></Link>')).toContain('PyreonLink("/home")')
    expect(swift('<Link to={url}><Text>x</Text></Link>')).toContain('PyreonLink(url)')
    expect(kotlin('<Link to="/home"><Text>x</Text></Link>')).toContain('PyreonLink("/home")')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: accessor Link type-checks against the stub', () => {
    const res = validateSwiftWithStubs(swift('<Link to={() => url()}><Text>x</Text></Link>'))
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: accessor Link compiles on kotlinc', () => {
    const res = validateKotlin(kotlin('<Link to={() => url()}><Text>x</Text></Link>'))
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
