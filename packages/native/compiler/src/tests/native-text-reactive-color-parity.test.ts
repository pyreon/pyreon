// Reactive text COLOUR — an iOS/Android parity break in the ui-system lowering.
//
// THE BUG. A rocketstyle dimension flip on a `<Text>` resolves to a two-literal
// ternary style (`style={cond ? { color: A } : { color: B }}`). The two targets
// then diverged:
//
//   Swift  → Text("…").foregroundColor(cond ? A : B)     ✅ coloured
//   Kotlin → Text(text = "…")            + a warning     ❌ colour DROPPED
//
// Compose has no text-colour MODIFIER — colour is a `Text()` constructor arg —
// and the Kotlin typography extractor only accepted LITERAL values, so a
// reactive colour fell past it into the container path, where `color` is
// correctly reported as having no Compose modifier and dropped.
//
// Net effect: the SAME shared source rendered a coloured badge on iOS and an
// uncoloured one on Android. That is precisely the failure the one-source model
// exists to prevent, and it sat behind a ✅ in the styling-coverage table.
//
// THE FIX. `extractTextTypography(style, 'kotlin')` also unpacks a
// two-literal-branch ternary colour, and `kotlinTextTypographyArgs` threads it
// as `color = if (cond) A else B`. Swift is untouched — its `.foregroundColor`
// applies to any View, so the existing style path already handled it.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

// The rocketstyle badge — the shape a real ui-system component takes.
const SRC = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
import rocketstyle from '@pyreon/rocketstyle'

const Badge = rocketstyle()({ component: Text })
  .states(() => ({ ok: { color: '#166534' }, warn: { color: '#b45309' } }))

export function UiDemo() {
  const bad = signal<boolean>(false)
  return (
    <Stack>
      <Badge state={bad() ? 'warn' : 'ok'}>Status</Badge>
      <Button onPress={() => bad.set(!bad())}>Flip</Button>
    </Stack>
  )
}`

const swift = () => transform(SRC, { target: 'swift' })
const kotlin = () => transform(SRC, { target: 'kotlin' })

describe('reactive text colour — cross-platform parity', () => {
  it('KOTLIN threads the reactive colour into the Text constructor', () => {
    // The regression: this used to emit a bare `Text(text = "Status")`.
    const out = kotlin().code
    expect(out).toContain('color = if (bad) Color(0xFFB45309) else Color(0xFF166534)')
  })

  it('KOTLIN emits ZERO warnings — the colour is no longer dropped', () => {
    // The old behaviour warned "CSS `color` on a container has no Compose
    // Modifier … Lowered on iOS only", which is the parity break stated aloud.
    expect(kotlin().warnings ?? []).toEqual([])
  })

  it('SWIFT is unchanged — foregroundColor already applied to any View', () => {
    const out = swift().code
    expect(out).toContain('.foregroundColor(')
    expect(swift().warnings ?? []).toEqual([])
  })

  it('BOTH targets carry the same two colours — the parity assertion itself', () => {
    // Swift uses sRGB components, Kotlin a packed ARGB literal, so compare the
    // colours in each target's own encoding rather than string-matching one.
    const s = swift().code
    const k = kotlin().code
    // #166534 → (0.086, 0.396, 0.204) / 0xFF166534
    expect(s).toContain('red: 0.086, green: 0.396, blue: 0.204')
    expect(k).toContain('Color(0xFF166534)')
    // #b45309 → (0.706, 0.325, 0.035) / 0xFFB45309
    expect(s).toContain('red: 0.706, green: 0.325, blue: 0.035')
    expect(k).toContain('Color(0xFFB45309)')
  })

  it('a STATIC colour still lowers as before (no regression to the literal path)', () => {
    const STATIC = `import { Text } from '@pyreon/primitives'
export function C() { return <Text style={{ color: '#166534' }}>Hi</Text> }`
    expect(transform(STATIC, { target: 'kotlin' }).code).toContain('color = Color(0xFF166534)')
    expect(transform(STATIC, { target: 'kotlin' }).warnings ?? []).toEqual([])
  })

  it('a ternary carrying MORE than colour still lowers its other properties', () => {
    // The colour is consumed as a constructor arg; the rest of each branch must
    // still reach the layout modifier.
    const MIXED = `import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function C() {
  const on = signal<boolean>(false)
  return <Text style={on() ? { color: '#166534', padding: 8 } : { color: '#b45309', padding: 8 }}>Hi</Text>
}`
    const out = transform(MIXED, { target: 'kotlin' }).code
    expect(out).toContain('color = if (on)')
    // The dynamic-style path emits a CONDITIONAL padding even when both
    // branches agree (it does not fold equal branches) — assert the property
    // survived, not a folded form it never produces.
    expect(out).toMatch(/padding\(\(if \(on\) 8 else 8\)\.dp\)/)
  })

  it('a NON-colour container style still warns as before (the warning was not blanket-removed)', () => {
    // Guard against "fixing" this by muting the diagnostic: a colour on a
    // non-Text container genuinely has no Compose modifier and must still warn.
    const CONTAINER = `import { Stack } from '@pyreon/primitives'
export function C() { return <Stack style={{ color: '#166534' }}>x</Stack> }`
    expect(transform(CONTAINER, { target: 'kotlin' }).warnings?.join('\n')).toMatch(
      /no Compose Modifier/,
    )
  })
})

describe('reactive text colour — compile proofs', () => {
  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const res = validateKotlin(kotlin().code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift compiles', () => {
    const res = validateSwiftWithStubs(swift().code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
