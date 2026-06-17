// Double-aware reduce-seed typing. A `reduce` over a Double column lowers
// to an Int `0` seed (`reduce(0, …)` / `fold(0, …)`), which swiftc/kotlinc
// reject against Double accumulation. A post-pass binds the reducer's
// element param to the source's element struct, infers the accumulator
// body, and — when it's fractional — flags the integer seed literal so the
// emit renders `0.0`. Strictly additive: an Int-column reduce keeps its
// `0` seed (zero regression).

import { describe, expect, it } from 'vitest'
import { parsePyreon } from '../parse'
import { transform } from '../index'
import type { ExprIR } from '../types'

// `revenue` is Int, `growth` is fractional (12.5 → Double via the struct
// value-refinement). The summary row reduces BOTH — revenue must keep the
// `0` seed, growth must flip to `0.0`.
const SRC = `import { Stack, Inline, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Metric = { region: string; revenue: number; growth: number }
export function C() {
  const metrics = signal<Metric[]>([
    { region: 'EMEA', revenue: 1240, growth: 12.5 },
    { region: 'APAC', revenue: 980, growth: 8.3 },
  ])
  return (
    <Stack>
      <Inline>
        <Text>{String(metrics().reduce((s, m) => s + m.revenue, 0))}</Text>
        <Text>{metrics().reduce((s, m) => s + m.growth, 0).toFixed(1)}</Text>
      </Inline>
    </Stack>
  )
}`

/** Find every `reduce` member-call seed literal (the 2nd arg) in an expr. */
function reduceSeeds(e: ExprIR, out: ExprIR[] = []): ExprIR[] {
  if (
    e.kind === 'call' &&
    e.callee.kind === 'member' &&
    e.callee.property === 'reduce' &&
    e.args.length === 2
  ) {
    out.push(e.args[1]!)
  }
  // Descend just enough for this fixture (JSX children + nested calls).
  switch (e.kind) {
    case 'call':
      reduceSeeds(e.callee, out)
      for (const a of e.args) reduceSeeds(a, out)
      break
    case 'member':
      reduceSeeds(e.object, out)
      break
    case 'binary':
      reduceSeeds(e.left, out)
      reduceSeeds(e.right, out)
      break
    case 'arrow':
      reduceSeeds(e.body, out)
      break
    case 'jsx-element':
      for (const ch of e.children) if (ch.kind === 'expr') reduceSeeds(ch.expr, out)
      break
    case 'jsx-fragment':
      for (const ch of e.children) if (ch.kind === 'expr') reduceSeeds(ch.expr, out)
      break
  }
  return out
}

describe('Double-aware reduce-seed typing', () => {
  it('parse: the Double-column reduce seed is flagged float; the Int-column seed is not', () => {
    const ir = parsePyreon(SRC, 'x.tsx')
    const seeds = reduceSeeds(ir.components[0]!.returnExpr)
    // Two reduces in source order: revenue (Int) then growth (Double).
    expect(seeds).toHaveLength(2)
    const [revenueSeed, growthSeed] = seeds as [
      Extract<ExprIR, { kind: 'literal' }>,
      Extract<ExprIR, { kind: 'literal' }>,
    ]
    expect(revenueSeed.value).toBe(0)
    expect(revenueSeed.float).not.toBe(true) // Int column — untouched
    expect(growthSeed.value).toBe(0)
    expect(growthSeed.float).toBe(true) // Double column — refined
  })

  it('Swift: Double reduce → reduce(0.0, …); Int reduce → reduce(0, …)', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('metrics.reduce(0.0, { s, m in s + m.growth })')
    expect(out).toContain('metrics.reduce(0, { s, m in s + m.revenue })')
  })

  it('Kotlin: Double reduce → fold(0.0, …); Int reduce → fold(0, …)', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('metrics.fold(0.0, { s, m -> s + m.growth })')
    expect(out).toContain('metrics.fold(0, { s, m -> s + m.revenue })')
  })

  it('zero-regression: an all-Int reduce keeps its 0 seed on both targets', () => {
    const intSrc = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Row = { n: number }
export function C() {
  const rows = signal<Row[]>([{ n: 1 }, { n: 2 }])
  return <Stack><Text>{String(rows().reduce((s, r) => s + r.n, 0))}</Text></Stack>
}`
    expect(transform(intSrc, { target: 'swift' }).code).toContain(
      'rows.reduce(0, { s, r in s + r.n })',
    )
    expect(transform(intSrc, { target: 'kotlin' }).code).toContain(
      'rows.fold(0, { s, r -> s + r.n })',
    )
  })
})
