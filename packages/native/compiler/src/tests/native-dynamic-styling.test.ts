import { describe, expect, it } from 'vitest'
import { transform } from '../index'

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
