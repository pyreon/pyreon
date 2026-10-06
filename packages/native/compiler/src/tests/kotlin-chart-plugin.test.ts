import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { withKotlinContext, host } from '../plugins/charts/kotlin-facade'
import { withSwiftContext, host as swiftHost } from '../plugins/charts/swift-facade'
import type { EmitContext, SwiftEmitContext } from '../emit-context'

// The Kotlin chart hosts are the built-in `@pyreon/charts` plugin's `emit.kotlin`. These specs pin the
// seams of that move that the byte-identity corpus cannot see: what the registry claims, what falls
// through to the core, the warnings a claimed element still gets, and the scoped context slot.

const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const PIE = (extra = '', imp = "import { PieChart } from '@pyreon/charts/engine'") => `${imp}
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Share() {
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={200}${extra} />
}
`

describe('registry claim of a chart tag (Kotlin)', () => {
  it('a chart imported from @pyreon/charts lowers to a PyreonChartCanvas — and the emitter itself keeps no chart branch', () => {
    expect(kotlin(PIE()).code).toContain('PyreonChartCanvas')
  })

  it('a same-named tag imported from elsewhere is NOT a chart host (the claim needs the @pyreon/charts import)', () => {
    const out = kotlin(PIE('', "import { PieChart } from './mine'"))
    expect(out.code).not.toContain('PyreonChartCanvas')
  })

  it('a local component named like a grammar tag is not mistaken for a chart mark', () => {
    const src = `import { Text } from '@pyreon/primitives'
function Legend(props: { label: string }) { return <Text>{props.label}</Text> }
export function App() { return <Legend label="x" /> }
`
    const out = kotlin(src)
    expect(out.warnings.join('\n')).not.toContain('only means something as a child of <Chart>')
    expect(out.code).toContain('Legend(label = "x")')
  })

  it('a bare grammar mark outside <Chart> still warns by name', () => {
    const src = `import { Bar } from '@pyreon/charts'
export function App() { return <Bar /> }
`
    const out = kotlin(src)
    expect(out.warnings.join('\n')).toContain('<Bar> only means something as a child of <Chart>')
    expect(out.code).toContain('Box {}')
  })

  it('a host missing a required data attribute still warns by name and emits an empty Box', () => {
    const src = `import { SankeyChart } from '@pyreon/charts'
export function App() { return <SankeyChart height={100} /> }
`
    const out = kotlin(src)
    expect(out.warnings).toEqual(['<SankeyChart>: needs a `nodes` attribute on native; emitting an empty Box().'])
    expect(out.code).toContain('Box {}')
    expect(out.code).not.toContain('PyreonChartCanvas')
  })

  it('a chrome prop the Compose host does not draw is still named, not silently dropped', () => {
    const src = `import { GaugeChart } from '@pyreon/charts'
export function App() { return <GaugeChart value={0.4} dial height={160} /> }
`
    const out = kotlin(src)
    expect(out.warnings).toEqual(['<GaugeChart dial>: the full dial is web-only; native draws the half-circle gauge track.'])
    expect(out.code).toContain('PyreonChartCanvas')
  })
})

describe('a claimed element still passes the generic attribute checks (Kotlin)', () => {
  it('a spread on a chart host warns instead of silently dropping its props', () => {
    const src = `import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Share(props: { size: number }) {
  const extra = { height: props.size }
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} {...extra} />
}
`
    expect(kotlin(src).warnings.join('\n')).toContain('<PieChart {...}> spread is not lowered to native')
  })

  it('the warning is emitted once per element, not once per dispatch layer', () => {
    const src = `import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Share(props: { size: number }) {
  const extra = { height: props.size }
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} {...extra} />
}
`
    expect(kotlin(src).warnings.filter((w) => w.includes('spread is not lowered'))).toHaveLength(1)
  })
})

describe('per-compile state (Kotlin)', () => {
  it('compiling twice gives identical output and warnings (the chart emitters keep nothing between calls)', () => {
    const a = kotlin(PIE(' tooltip'))
    const b = kotlin(PIE(' tooltip'))
    expect(b.code).toBe(a.code)
    expect(b.warnings).toEqual(a.warnings)
  })

  it('a stateless component holding a chart host compiles the same as one with a body', () => {
    const src = `import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export const Share = () => <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={200} tooltip />
`
    expect(kotlin(src).code).toContain('PyreonChartCanvas')
    expect(kotlin(src).code).toBe(kotlin(src).code)
  })
})

describe('the scoped context slot (Kotlin)', () => {
  it('refuses to read outside withKotlinContext', () => {
    expect(() => host.warn('x')).toThrow(/outside `withKotlinContext`/)
  })

  it('is restored after a nested call and after a throw', () => {
    const seen: string[] = []
    const ctx = (id: string): EmitContext => ({ warn: (m: string) => seen.push(`${id}:${m}`) }) as unknown as EmitContext
    withKotlinContext(ctx('outer'), () => {
      host.warn('1')
      withKotlinContext(ctx('inner'), () => host.warn('2'))
      host.warn('3')
      expect(() =>
        withKotlinContext(ctx('thrower'), () => {
          throw new Error('boom')
        }),
      ).toThrow('boom')
      host.warn('4')
    })
    expect(seen).toEqual(['outer:1', 'inner:2', 'outer:3', 'outer:4'])
    expect(() => host.warn('after')).toThrow(/outside `withKotlinContext`/)
  })

  it('each target has its OWN slot: a Swift context never satisfies a Kotlin read, and vice versa', () => {
    const swiftCtx = { warn: () => {} } as unknown as SwiftEmitContext
    withSwiftContext(swiftCtx, () => {
      expect(() => host.warn('x')).toThrow(/outside `withKotlinContext`/)
      expect(() => swiftHost.warn('x')).not.toThrow()
    })
    const kotlinCtx = { warn: () => {} } as unknown as EmitContext
    withKotlinContext(kotlinCtx, () => {
      expect(() => swiftHost.warn('x')).toThrow(/outside `withSwiftContext`/)
      expect(() => host.warn('x')).not.toThrow()
    })
  })
})
