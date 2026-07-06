import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

// Dynamic STYLING attr values (iter46, sweep batch 5's find). Pre-fix, a
// non-static value in `gap` / `padding(X/Y)` / `background` / `radius`
// SILENTLY DROPPED the whole modifier on both targets — zero warnings
// (`gap={dense() ? "sm" : "lg"}` emitted a bare `VStack {`). Styling
// tokens resolve at COMPILE time (numbers are token INDICES on a 4px
// scale, not pixels), so the faithful dynamic form is a TERNARY OF TWO
// LITERALS — both branches compile-resolve, the condition emits
// natively. Any other dynamic value now warns loudly by name.

const APP = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const dense = signal(false)
  const sp = signal(8)
  return (
    <Stack gap={dense() ? "sm" : "lg"} padding={dense() ? 1 : 3} background={dense() ? "surface" : "primary"} radius={dense() ? "sm" : "md"}>
      <Text>tokens</Text>
      <Stack gap={sp()}><Text>dyn</Text></Stack>
      <Stack gap="md" padding={2}><Text>static</Text></Stack>
      <Button onPress={() => dense.set(!dense())}>toggle</Button>
    </Stack>
  )
}`

describe('ternary-of-two-literal-tokens compile-resolves per branch', () => {
  it('Swift: gap/padding lower to a native conditional of resolved tokens', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('VStack(spacing: (dense ? 8 : 16))')
    expect(out).toContain('.padding((dense ? 4 : 12))')
    expect(out).toContain('.cornerRadius((dense ? 4 : 8))')
    // background resolves a COLOR expr per branch
    expect(out).toMatch(/\.background\(\(dense \? Color\(.+\) : Color\(.+\)\)\)/)
  })

  it('Kotlin: gap/padding lower to a native if-else of resolved tokens', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('Arrangement.spacedBy((if (dense) 8 else 16).dp)')
    expect(out).toContain('.padding((if (dense) 4 else 12).dp)')
    expect(out).toContain('.clip(RoundedCornerShape((if (dense) 4 else 8).dp))')
    expect(out).toMatch(/\.background\(\(if \(dense\) Color\(.+\) else Color\(.+\)\)\)/)
  })
})

describe('fully-dynamic styling values warn loudly (were silently dropped)', () => {
  it('warns by attr name on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(APP, { target })
      const w = (out.warnings ?? []).filter((x) => x.includes('fully-dynamic gap'))
      expect(w.length).toBeGreaterThanOrEqual(1)
      expect(w[0]).toContain('COMPILE time')
    }
  })

  it('the warned modifier is omitted, not mis-emitted', () => {
    const sw = transform(APP, { target: 'swift' }).code
    expect(sw).not.toContain('spacing: sp')
  })
})

describe('static styling values keep their byte-shape', () => {
  it('Swift + Kotlin static gap/padding unchanged', () => {
    const sw = transform(APP, { target: 'swift' }).code
    expect(sw).toContain('VStack(spacing: 12)')
    expect(sw).toContain('.padding(8)')
    const kt = transform(APP, { target: 'kotlin' }).code
    expect(kt).toContain('Arrangement.spacedBy(12.dp)')
    expect(kt).toContain('.padding(8.dp)')
  })
})

// `<Icon color size>` — the state-driven icon (`color={active() ? "primary" :
// "muted"}`) is a VERY common shape. Pre-fix the Icon emit read color/size
// STATIC-only (readStaticAttr), so a dynamic value SILENTLY DROPPED the
// modifier (no `.foregroundColor`/`.imageScale` on Swift, no `tint`/`.size` on
// Kotlin, zero warnings). Now routed through the same swiftStylingValue /
// kotlinStylingValue machinery as gap/padding: static byte-identical, a
// ternary of two literal tokens → a native conditional, any other dynamic →
// a NAMED warning (never silent).
const ICON = `
import { signal } from '@pyreon/reactivity'
import { Stack, Icon } from '@pyreon/primitives'
export function App() {
  const on = signal<boolean>(true)
  return (
    <Stack>
      <Icon name="star" color={on() ? "primary" : "muted"} size={on() ? "lg" : "sm"} />
      <Icon name="heart" color="primary" size="md" />
    </Stack>
  )
}`

describe('Icon dynamic color/size — ternary lowers, static byte-identical, fully-dynamic warns', () => {
  it('Swift: dynamic color/size lower to native conditionals; static unchanged', () => {
    const out = transform(ICON, { target: 'swift' }).code
    expect(out).toMatch(/\.foregroundColor\(\(on \? Color\(.+\) : Color\(.+\)\)\)/)
    expect(out).toContain('.imageScale((on ? .large : .small))')
    // the static second icon keeps its byte-shape
    expect(out).toContain('.imageScale(.medium)')
    expect(out).toMatch(/\.foregroundColor\(Color\(.+\)\)/)
  })
  it('Kotlin: dynamic tint/size lower to if-expressions; static unchanged', () => {
    const out = transform(ICON, { target: 'kotlin' }).code
    expect(out).toMatch(/tint = \(if \(on\) Color\(.+\) else Color\(.+\)\)/)
    expect(out).toContain('.size((if (on) 24.dp else 16.dp))')
    // static second icon
    expect(out).toContain('.size(20.dp)')
    expect(out).toMatch(/tint = Color\(/)
  })
  it('a fully-dynamic Icon color warns NAMED on both targets (never silent)', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Icon } from '@pyreon/primitives'
export function App() {
  const pick = signal<string>("primary")
  return <Stack><Icon name="star" color={pick()} /></Stack>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect((out.warnings ?? []).some((w) => w.includes('<Icon color={…}>'))).toBe(true)
    }
  })

  // Compile proof — the ternary color+size emit typechecks end-to-end.
  it.skipIf(!isSwiftUIAvailable())('iOS: the dynamic-Icon component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(ICON, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(ICON, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

// `<Image width|height>` — RAW pixels, NOT compile-time tokens. Pre-fix the
// Image emit read width/height STATIC-only, so a dynamic dim (a ternary OR a
// runtime signal) SILENTLY dropped the `.frame` / `.width` modifier. UNLIKE
// the token props (gap/color/align — a fully-dynamic value can't map to a
// compile-time token so it WARNS), a pixel dim IS a runtime value: SwiftUI's
// `.frame(width:)` takes `CGFloat?` and Compose's `.width` takes `Dp`, so ANY
// dynamic value lowers to a runtime expr (Swift `CGFloat(<expr>)`, Compose
// `(<expr>).dp`) — no warning, ternary AND signal-read both lower.
const IMG = `
import { signal } from '@pyreon/reactivity'
import { Stack, Image } from '@pyreon/primitives'
export function App() {
  const big = signal<boolean>(false)
  const h = signal<number>(80)
  return (
    <Stack>
      <Image src="logo.png" alt="a" width={big() ? 200 : 100} height={h()} />
      <Image src="logo.png" alt="b" width={64} height={64} />
    </Stack>
  )
}`

describe('Image dynamic width/height — runtime-numeric lowering (ternary + signal), static byte-identical', () => {
  it('Swift: dynamic width/height lower to CGFloat(<expr>); static bare', () => {
    const rs = transform(IMG, { target: 'swift' })
    expect(rs.code).toContain('.frame(width: CGFloat(big ? 200 : 100), height: CGFloat(h))')
    expect(rs.code).toContain('.frame(width: 64, height: 64)')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: dynamic width/height lower to (<expr>).dp; static bare', () => {
    const rk = transform(IMG, { target: 'kotlin' })
    expect(rk.code).toContain('.width((if (big) 200 else 100).dp).height((h).dp)')
    expect(rk.code).toContain('.width(64.dp).height(64.dp)')
    expect(rk.warnings).toHaveLength(0)
  })

  // Compile proof — the runtime-numeric dims (CGFloat + Dp) typecheck.
  it.skipIf(!isSwiftUIAvailable())('iOS: the dynamic-dims Image TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(IMG, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(IMG, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
