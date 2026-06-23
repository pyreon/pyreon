// Component-scope const resolution for STATIC attributes (subset widening).
//
// A native-mapped static attribute (`<Image src=…>`, `<WebView src=… / html=>`,
// font, background) resolved a named binding only when it was a MODULE-level
// const. A COMPONENT-body const (`const logo = '/x.png'; <Image src={logo} />`)
// — by far the more natural place to put it — didn't resolve, so the attr fell
// through to the "needs static" path. Now the static-attr resolver also
// consults a per-component const map built from the component's literal `value`
// decls (the shape the value-const widening emits), with transitive aliases
// (`const a = '/x'; const b = a` → both resolve).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Image } from '@pyreon/primitives'
function App() {
${body}
}`

describe('component-scope const → static-attr resolution', () => {
  it('Swift: <Image src={componentConst}> resolves to the const literal', () => {
    const out = transform(
      app(`  const logo = '/assets/logo.png'
  return (<Stack><Image src={logo} /></Stack>)`),
      { target: 'swift' },
    ).code
    expect(out).toContain('URL(string: "/assets/logo.png")')
  })

  it('Kotlin: <Image src={componentConst}> resolves to the const literal', () => {
    const out = transform(
      app(`  const logo = '/assets/logo.png'
  return (<Stack><Image src={logo} /></Stack>)`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('model = "/assets/logo.png"')
  })

  it('transitive aliases resolve (`const a = …; const b = a`)', () => {
    const sw = transform(
      app(`  const base = '/assets/hero.png'
  const alias = base
  return (<Stack><Image src={alias} /></Stack>)`),
      { target: 'swift' },
    ).code
    expect(sw).toContain('URL(string: "/assets/hero.png")')
  })

  it('a module-level const still resolves (no regression)', () => {
    const out = transform(
      `import { Stack, Image } from '@pyreon/primitives'
const LOGO = '/assets/m.png'
function App() {
  return (<Stack><Image src={LOGO} /></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(out).toContain('URL(string: "/assets/m.png")')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: resolved component-const Image typechecks via swiftc', () => {
    const out = transform(
      app(`  const logo = '/assets/logo.png'
  const alias = logo
  return (<Stack><Image src={logo} /><Image src={alias} /></Stack>)`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: resolved component-const Image typechecks via kotlinc', () => {
    const out = transform(
      app(`  const logo = '/assets/logo.png'
  const alias = logo
  return (<Stack><Image src={logo} /><Image src={alias} /></Stack>)`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
