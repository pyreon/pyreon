// The token surface props (`padding` / `paddingX` / `paddingY`, `background`, `radius`) sat in a different place on
// Android than on iOS and the web (#4345). Compose applies a modifier chain outside-in, and the tokens LED it:
//
//   <Stack paddingX={4} paddingY={2} style={{ backgroundColor, borderRadius: 10 }}>
//   iOS      .padding(.horizontal, 16).padding(.vertical, 8).background(…).cornerRadius(10)   padding INSIDE the fill
//   Android  Modifier.padding(horizontal = 16.dp).padding(vertical = 8.dp).clip(…).background(…) padding OUTSIDE it
//
// Same class, same cause: a token `background` with token `padding` also had the padding outside the fill, a token
// `radius` clipped AFTER the token `background` (so the fill was never rounded), and a style `width` excluded the
// token padding. The tokens are now the innermost layer on Android, `.clip().background().padding()` after the style
// modifiers: the exact reverse of the Swift chain, which applies them first and the style around them.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './first-party-plugins'
import { isKotlincAvailable } from '../validate'

const app = (jsx: string) => `import { Stack, Text } from '@pyreon/primitives'
export function App() {
  return (<Stack>${jsx}</Stack>)
}`

const out = (jsx: string, target: 'swift' | 'kotlin') => {
  const r = transform(app(jsx), { target })
  expect(r.warnings).toEqual([])
  return r.code
}

const STYLE_SURFACE =
  "<Stack paddingX={4} paddingY={2} style={{ backgroundColor: '#A8380A', borderRadius: 10 }}><Text>Add</Text></Stack>"

const TOKEN_SURFACE = '<Stack padding="md" background="primary" radius="md"><Text>T</Text></Stack>'
const STYLE_WIDTH = "<Stack padding=\"md\" style={{ width: 100, borderWidth: 1, borderColor: '#000000' }}><Text>U</Text></Stack>"

describe('Android applies the token surface inside the style surface, as iOS does', () => {
  it('token padding sits INSIDE a style background (clip → background → padding)', () => {
    expect(out(STYLE_SURFACE, 'kotlin')).toContain(
      'Modifier.clip(RoundedCornerShape(10.dp)).background(Color(0xFFA8380A)).padding(horizontal = 16.dp).padding(vertical = 8.dp)',
    )
    // The Swift chain it mirrors is unchanged.
    expect(out(STYLE_SURFACE, 'swift')).toContain('.padding(.horizontal, 16).padding(.vertical, 8).background(')
  })

  it('a token radius rounds a token background, and token padding sits inside it', () => {
    expect(out(TOKEN_SURFACE, 'kotlin')).toMatch(/Modifier\.clip\(RoundedCornerShape\(8\.dp\)\)\.background\([^)]+\)\)\.padding\(12\.dp\)/)
    expect(out(TOKEN_SURFACE, 'swift')).toMatch(/\.padding\(12\)\.background\(.+\)\.cornerRadius\(8\)/)
  })

  it('a style width and border include the token padding', () => {
    expect(out(STYLE_WIDTH, 'kotlin')).toMatch(/Modifier\.width\(100\.dp\)\.border\(.+\)\.padding\(12\.dp\)\)/)
    expect(out(STYLE_WIDTH, 'swift')).toMatch(/\.padding\(12\)\.frame\(width: 100\)\.overlay\(/)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    const r = validateKotlin(out(`${STYLE_SURFACE}${TOKEN_SURFACE}${STYLE_WIDTH}`, 'kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
