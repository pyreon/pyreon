// Double struct fields via initializer value-refinement. A
// `type Metric = { growth: number }` annotation can't express
// fractional-ness, so the struct field defaults to Int. When a signal
// initializer assigns a FRACTIONAL literal (`{ growth: 12.5 }`), the
// post-pass refines that field to Double — so the field emits as
// `Double`, and `toFixed`/arithmetic on it lower correctly. Strictly
// additive: integer-valued fields stay Int.

import { describe, expect, it } from 'vitest'
import { parsePyreon } from '../parse'
import { transform } from '../index'

const SRC = `import { Stack, Inline, Text, For } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Metric = { region: string; revenue: number; growth: number }
export function C() {
  const metrics = signal<Metric[]>([
    { region: 'EMEA', revenue: 1240, growth: 12.5 },
    { region: 'APAC', revenue: 980, growth: 8.3 },
  ])
  return (
    <Stack>
      <For each={metrics()} by={(m) => m.region}>
        {(m) => (
          <Inline>
            <Text>{String(m.revenue)}</Text>
            <Text>{m.growth.toFixed(1)}</Text>
          </Inline>
        )}
      </For>
    </Stack>
  )
}`

describe('Double struct fields — initializer value-refinement', () => {
  it('parse: a fractional field value refines the struct field to float; integer stays Int', () => {
    const ir = parsePyreon(SRC, 'x.tsx')
    const metric = ir.structs.find((s) => s.name === 'Metric')!
    const growth = metric.fields.find((f) => f.name === 'growth')!
    const revenue = metric.fields.find((f) => f.name === 'revenue')!
    expect(growth.type).toEqual({ kind: 'number', float: true })
    expect(revenue.type).toEqual({ kind: 'number' })
  })

  it('Swift: growth → Double field + toFixed → String(format:); revenue stays Int', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('var growth: Double')
    expect(out).toContain('var revenue: Int')
    expect(out).toContain('String(format: "%.1f", m.growth)')
  })

  it('Kotlin: growth → Double field; revenue stays Int', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('growth: Double')
    expect(out).toContain('revenue: Int')
  })
})
