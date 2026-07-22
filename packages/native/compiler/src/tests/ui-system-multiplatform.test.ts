// ui-system-on-native — the end-to-end "usable anywhere" proof.
//
// A user builds their OWN components on the ui-system frontends (styled +
// rocketstyle + theme tokens), NOT on @pyreon/primitives directly. These specs
// assemble the two real archetypes with the FULL feature set and assert they
// lower to BOTH SwiftUI and Compose (real swiftc + kotlinc) — the evidence that
// ui-system components run on iOS + Android + web from one source.
//
// Archetype 1 — an INTERACTIVE Button (component: Button): theme tokens +
//   reactive state flip + disabled + onPress + size.
// Archetype 2 — a CONTAINER Card (component: Stack): theme tokens + dark mode
//   (useColorScheme + a dimension flip).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftUIAvailable, validateKotlin, validateSwiftTypecheck } from '../validate'

// A full-feature interactive Button over the Button primitive.
const BUTTON_APP = `import { Button, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
const theme = defineTheme({
  color: { primary: '#2563eb', danger: '#dc2626', disabledBg: '#e5e7eb' },
  spacing: { sm: 8, md: 12, lg: 16 },
  radius: { md: 8 },
})
const Btn = rocketstyle()({ name: 'Btn', component: Button })
  .theme(() => ({ padding: t.spacing.md, borderRadius: t.radius.md }))
  .states({
    primary: { backgroundColor: t.color.primary },
    danger: { backgroundColor: t.color.danger },
    disabled: { backgroundColor: t.color.disabledBg },
  })
  .sizes({ small: { padding: t.spacing.sm }, large: { padding: t.spacing.lg } })
export function App() {
  const busy = signal(false)
  return (
    <Btn state={busy() ? 'disabled' : 'primary'} size="large" disabled={busy()} onPress={() => busy.set(true)}>
      <Text>Submit</Text>
    </Btn>
  )
}`

// A container Card over Stack with dark-mode-reactive theming.
const CARD_APP = `import { Stack, Text } from '@pyreon/primitives'
const theme = defineTheme({ color: { lightBg: '#ffffff', darkBg: '#111827' }, spacing: { md: 16 }, radius: { md: 8 } })
const Card = rocketstyle()({ name: 'Card', component: Stack })
  .theme(() => ({ padding: t.spacing.md, borderRadius: t.radius.md }))
  .states({ onLight: { backgroundColor: t.color.lightBg }, onDark: { backgroundColor: t.color.darkBg } })
export function App() {
  const scheme = useColorScheme()
  return (<Card state={scheme === 'dark' ? 'onDark' : 'onLight'}><Text>Content</Text></Card>)
}`

describe('ui-system on native — interactive Button archetype', () => {
  it('theme tokens + reactive state + disabled + onPress lower (Swift)', () => {
    const { code, warnings } = transform(BUTTON_APP, { target: 'swift' })
    expect(code).toContain('.background(((busy) ?') // reactive state flip, theme-resolved
    expect(code).toContain('.padding(((busy) ? 16 : 16))') // static size=large in both branches
    expect(code).toContain('.disabled(busy)') // disabled prop
    expect(warnings.join('\n')).not.toMatch(/dropped|not yet lowered|not lowered/)
  })
  it('the same lowers to Compose enabled/if-else (Kotlin)', () => {
    const { code } = transform(BUTTON_APP, { target: 'kotlin' })
    expect(code).toContain('.background((if (busy) Color(0xFFE5E7EB) else Color(0xFF2563EB)))')
    expect(code).toContain('enabled = !busy')
  })
})

describe('ui-system on native — container Card archetype (dark mode)', () => {
  it('theme tokens + dark-mode flip lower (Swift)', () => {
    const { code } = transform(CARD_APP, { target: 'swift' })
    expect(code).toContain('@Environment(\\.colorScheme) private var pyreonColorScheme')
    expect(code).toContain('.background(((scheme == "dark") ? Color(.sRGB, red: 0.067') // #111827
  })
  it('the same lowers via isSystemInDarkTheme (Kotlin)', () => {
    const { code } = transform(CARD_APP, { target: 'kotlin' })
    expect(code).toContain('val scheme = if (isSystemInDarkTheme()) "dark" else "light"')
    expect(code).toContain('.background((if (scheme == "dark") Color(0xFF111827) else Color(0xFFFFFFFF)))')
  })
})

describe('ui-system on native — toolchain gates (real SDKs, both archetypes)', () => {
  it.skipIf(!isSwiftUIAvailable())('the interactive Button typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(transform(BUTTON_APP, { target: 'swift' }).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the interactive Button compiles (real kotlinc)', () => {
    const res = validateKotlin(transform(BUTTON_APP, { target: 'kotlin' }).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('the dark-mode Card typechecks (real SwiftUI SDK)', () => {
    const res = validateSwiftTypecheck(transform(CARD_APP, { target: 'swift' }).code)
    expect(res.ok, res.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('the dark-mode Card compiles (real kotlinc)', () => {
    const res = validateKotlin(transform(CARD_APP, { target: 'kotlin' }).code)
    expect(res.ok, res.error).toBe(true)
  })
})
