// A `<WebView onMessage={(m) => …}>` handler's parameter is ALWAYS a string — the runtime bridge hands over
// `String(m)`, and the lowered Swift closure is `(String) -> Void`. The parser records no type for an unannotated
// arrow parameter, so the receiver of a string method inside the handler was unknown:
//
//   m.slice(2)   Kotlin  m.drop(2)      compiles (`drop` exists on Collection AND String)
//                Swift   m.slice(2)     "value of type 'String' has no member 'slice'" — emitted VERBATIM, 0 warnings
//
// Receiver-dependent lowerings (`slice`, `startsWith` on an unknown type) only fire for a known string, and the
// verbatim fallthrough is silent. The block-bodied handler (`{ … }`) is the common shape and goes through the generic
// action emitter, which seeds handler-local consts but not the closure's own parameter — so the fix binds the
// parameter around the WHOLE handler.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (handler: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text, WebView } from '@pyreon/primitives'
export function App() {
  const out = signal('')
  return (
    <Stack>
      <WebView src="host.html" onMessage={${handler}} />
      <Text>{out()}</Text>
    </Stack>
  )
}`

const HANDLERS: Record<string, string> = {
  'block body, slice(n)': `(m) => { out.set(m.slice(2)) }`,
  'expression body, slice(n)': `(m) => out.set(m.slice(2))`,
  'negative slice': `(m) => { out.set(m.slice(-2)) }`,
  'startsWith guard + slice': `(m) => { if (m.startsWith('v:')) out.set(m.slice(2)) }`,
}

describe('<WebView onMessage> parameter is a String', () => {
  for (const [name, handler] of Object.entries(HANDLERS)) {
    it(`Swift lowers ${name} (no verbatim .slice)`, () => {
      const r = transform(app(handler), { target: 'swift' })
      expect(r.code).not.toMatch(/\.slice\(/)
      expect(r.warnings).toEqual([])
    })
    it.skipIf(!isSwiftcAvailable())(`Swift ${name} type-checks`, () => {
      const v = validateSwiftWithStubs(transform(app(handler), { target: 'swift' }).code)
      expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`Kotlin ${name} type-checks`, () => {
      const v = validateKotlin(transform(app(handler), { target: 'kotlin' }).code)
      expect(v.ok, v.ok ? '' : String((v as { error?: string }).error)).toBe(true)
    })
  }
  it('an explicit annotation wins over the default', () => {
    const src = app(`(m: number) => { out.set(m.toString()) }`)
    expect(transform(src, { target: 'swift' }).code).toContain('{ m in')
  })
})
