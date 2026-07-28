// `.sizes({ small: () => ({ width: 120 }) })` dropped every style, silently.
//
// rocketstyle takes ONE callback returning the whole map —
// `.sizes((t) => ({ small: { … } }))`. The object-of-FUNCTIONS form reads just
// as naturally, is a documented footgun (`.claude/rules/anti-patterns.md`
// records that it "produces EMPTY dimension themes"), and produced no
// diagnostic at all: `objectExprToStyleObject` returns `{}` for anything that
// is not an object literal, so the emit dropped the styles and reported
// nothing.
//
// A `size="large"` app therefore compiled, ran, and rendered unstyled. That is
// the exact failure mode the PMTC arc has been converting into named warnings
// — and it survived because NO native example uses rocketstyle at all, which
// is why the capability matrix now carries a `Styling & design system` row at
// an R4 fraction of 0.0.
//
// Found by writing the first rocketstyle app for a native target and reading
// the emit, rather than by a bug report.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const app = (dimension: string) => `import { rocketstyle } from '@pyreon/rocketstyle'
import { Stack, Text } from '@pyreon/primitives'

const Card = rocketstyle()({ component: Stack })
  .theme((t) => ({ backgroundColor: t.color.primary, padding: 16 }))
  ${dimension}

export function C() {
  return (
    <Stack>
      <Card size="small"><Text>Small</Text></Card>
      <Card size="large"><Text>Large</Text></Card>
    </Stack>
  )
}`

const OBJECT_OF_FUNCTIONS = app(`.sizes({
    small: () => ({ width: 120 }),
    large: () => ({ width: 280 }),
  })`)

const CALLBACK = app(`.sizes((t) => ({
    small: { width: 120 },
    large: { width: 280 },
  }))`)

describe('rocketstyle dimension written as an object of functions', () => {
  it('WARNS, naming the component, the dimension and the value', () => {
    const warnings = transform(OBJECT_OF_FUNCTIONS, { target: 'swift' }).warnings ?? []
    expect(warnings.length).toBeGreaterThan(0)
    const first = warnings[0]!
    expect(first).toContain('Card')
    expect(first).toContain('.sizes()')
    expect(first).toContain("'small'")
    expect(first).toContain('DROPPED')
  })

  it('tells the author what to write instead', () => {
    // A warning that names the problem without the fix just relocates the
    // confusion — the whole value here is that the correct shape is one line
    // away in the message.
    const first = (transform(OBJECT_OF_FUNCTIONS, { target: 'swift' }).warnings ?? [])[0] ?? ''
    expect(first).toContain('.sizes((t) => ({')
  })

  it('warns once per dropped value, on BOTH targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const warnings = (transform(OBJECT_OF_FUNCTIONS, { target }).warnings ?? []).filter((w) =>
        w.includes('is a FUNCTION'),
      )
      expect(warnings, target).toHaveLength(2) // small + large
    }
  })

  it('still emits a COMPILABLE component — the styles are lost, not the view', () => {
    // Degrading to an unstyled-but-working view is right: a dimension typo
    // should not take the whole screen down. The warning is what makes the
    // loss visible.
    const out = transform(OBJECT_OF_FUNCTIONS, { target: 'swift' }).code
    expect(out).toContain('Text("Small")')
    expect(out).toContain('.padding(16)') // the .theme() base still applies
    expect(out).not.toContain('.frame(width: 120)') // the dimension is gone
  })

  it('the CORRECT callback form emits the styles and warns about nothing', () => {
    const result = transform(CALLBACK, { target: 'swift' })
    expect(result.warnings ?? []).toEqual([])
    expect(result.code).toContain('.frame(width: 120)')
    expect(result.code).toContain('.frame(width: 280)')
  })

  it('the correct form lowers on Kotlin too', () => {
    const result = transform(CALLBACK, { target: 'kotlin' })
    expect(result.warnings ?? []).toEqual([])
    expect(result.code).toContain('width(120.dp)')
    expect(result.code).toContain('width(280.dp)')
  })
})
