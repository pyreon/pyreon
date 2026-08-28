import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * Three documented props on the CANONICAL primitives that produced no emit on
 * either target, with no warning — the same class the `truncate` fix in
 * `emit-swift.ts` already names, one instance fixed and its siblings left.
 *
 *   <Text size>   a heading rendered at BODY size on native
 *   <Text weight> and at regular weight, while the web showed it bold
 *   <Field kind>  a phone raised full QWERTY where the web showed a numeric pad
 *
 * Same source, a visibly different screen, and nothing said so. That is the
 * multiplatform promise failing quietly, which is worse than failing loudly.
 *
 * The point sizes mirror the WEB impl's own scale (`web/Text.tsx`'s `SIZE_PX`)
 * rather than a new one: a scale that drifts from the web's is a divergence
 * that looks like a design choice.
 */
const P = '@pyreon/primitives'
const app = (jsx: string): string => `import { signal } from '@pyreon/reactivity'
import { Stack, Field, Text } from '${P}'
export function C() {
  const v = signal('')
  return <Stack>${jsx}</Stack>
}`

const emit = (jsx: string, target: 'swift' | 'kotlin'): string =>
  transform(app(jsx), { target }).code

describe('<Text size> — mirrors the web scale', () => {
  it.each([
    ['xs', 12],
    ['sm', 14],
    ['md', 16],
    ['lg', 20],
    ['xl', 24],
  ])('%s is %ipt on both targets', (size, pt) => {
    expect(emit(`<Text size="${size}">x</Text>`, 'swift')).toContain(`.font(.system(size: ${pt}`)
    expect(emit(`<Text size="${size}">x</Text>`, 'kotlin')).toContain(`fontSize = ${pt}.sp`)
  })
})

describe('<Text weight>', () => {
  it.each([
    ['regular', '.regular', 'FontWeight.Normal'],
    ['medium', '.medium', 'FontWeight.Medium'],
    ['bold', '.bold', 'FontWeight.Bold'],
  ])('%s lowers on both', (weight, sw, kt) => {
    expect(emit(`<Text weight="${weight}">x</Text>`, 'swift')).toContain(`weight: ${sw}`)
    expect(emit(`<Text weight="${weight}">x</Text>`, 'kotlin')).toContain(`fontWeight = ${kt}`)
  })

  it('a weight alone still carries the default size on Swift', () => {
    // `.font(.system(weight:))` has no such overload — the weight needs a size
    // to hang on, so a weight-only Text takes the `md` default.
    expect(emit(`<Text weight="bold">x</Text>`, 'swift')).toContain('size: 16')
  })

  it('size and weight combine into ONE .font on Swift', () => {
    // Two `.font` modifiers do not compose in SwiftUI — the later REPLACES the
    // earlier, so emitting them separately would silently drop one.
    const out = emit(`<Text size="lg" weight="bold">x</Text>`, 'swift')
    expect(out).toContain('.font(.system(size: 20, weight: .bold))')
    expect(out.match(/\.font\(/g) ?? []).toHaveLength(1)
  })

  it('a custom `font` still wins — it emits its own .font', () => {
    // Adding a system font beside `.font(.custom(...))` would overwrite it.
    const out = emit(`<Text font="Brand" size="lg">x</Text>`, 'swift')
    expect(out).not.toContain('.system(')
  })
})

describe('<Field kind> — the software keyboard', () => {
  it.each([
    ['number', '.numberPad', 'KeyboardType.Number'],
    ['email', '.emailAddress', 'KeyboardType.Email'],
    ['tel', '.phonePad', 'KeyboardType.Phone'],
    ['url', '.URL', 'KeyboardType.Uri'],
  ])('%s raises the right keyboard on both', (kind, sw, kt) => {
    const j = `<Field value={v()} onChangeText={(t) => v.set(t)} kind="${kind}" />`
    expect(emit(j, 'swift')).toContain(`.keyboardType(${sw})`)
    expect(emit(j, 'kotlin')).toContain(kt)
  })

  it('password selects MASKING, not a keyboard — a masked field keeps the default', () => {
    const j = `<Field value={v()} onChangeText={(t) => v.set(t)} kind="password" />`
    expect(emit(j, 'swift')).toContain('SecureField')
    expect(emit(j, 'swift')).not.toContain('.keyboardType(')
    expect(emit(j, 'kotlin')).toContain('PasswordVisualTransformation')
  })

  it('kind and onSubmit MERGE into one KeyboardOptions on Kotlin', () => {
    // `KeyboardOptions` is a single argument. Building it in two places would
    // be a duplicate named arg, and whichever is pushed second wins — which is
    // how a keyboard type silently drops an imeAction, or the reverse.
    const out = emit(
      `<Field value={v()} onChangeText={(t) => v.set(t)} kind="number" onSubmit={() => {}} />`,
      'kotlin',
    )
    expect(out).toContain('KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done)')
    expect(out.match(/keyboardOptions =/g) ?? []).toHaveLength(1)
    // and the action itself survives
    expect(out).toContain('KeyboardActions(onDone')
  })
})

describe('the emitted code really compiles', () => {
  const ALL = `<Text size="lg" weight="bold">T</Text>
      <Field value={v()} onChangeText={(t) => v.set(t)} kind="number" onSubmit={() => {}} />
      <Field value={v()} onChangeText={(t) => v.set(t)} kind="email" />`

  it.runIf(isSwiftcAvailable())('swiftc type-checks it', () => {
    const r = validateSwiftWithStubs(emit(ALL, 'swift'))
    expect(r.ok, r.ok ? '' : String(r.error).split('\n').slice(0, 5).join('\n')).toBe(true)
  })

  it.runIf(isKotlincAvailable())('kotlinc compiles it', () => {
    const r = validateKotlin(emit(ALL, 'kotlin'))
    expect(r.ok, r.ok ? '' : String(r.error).split('\n').slice(0, 5).join('\n')).toBe(true)
  })
})
