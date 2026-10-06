import { describe, expect, it } from 'vitest'
import { transform } from './charts-plugin'
import { withSwiftContext, host } from '../../../../fundamentals/charts/src/native-plugin/swift-facade'
import type { SwiftEmitContext } from '../emit-context'

// The Swift chart hosts are the built-in `@pyreon/charts` plugin's `emit.swift`. These specs pin the
// seams of that move that the byte-identity corpus cannot see: what the registry claims, what falls
// through to the core, the warnings a claimed element still gets, and the scoped context slot.

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const PIE = (extra = '', imp = "import { PieChart } from '@pyreon/charts/engine'") => `${imp}
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Share() {
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={200}${extra} />
}
`

describe('registry claim of a chart tag', () => {
  it('a chart imported from @pyreon/charts lowers to a PyreonChartCanvas on both targets (Kotlin falls through to the core)', () => {
    expect(swift(PIE()).code).toContain('PyreonChartCanvas')
    expect(kotlin(PIE()).code).toContain('PyreonChartCanvas')
  })

  it('a same-named tag imported from elsewhere is NOT a chart host', () => {
    const out = swift(PIE('', "import { PieChart } from './mine'"))
    expect(out.code).not.toContain('PyreonChartCanvas')
  })

  it('a local component named like a grammar tag is not mistaken for a chart mark', () => {
    const src = `import { Text } from '@pyreon/primitives'
function Legend(props: { label: string }) { return <Text>{props.label}</Text> }
export function App() { return <Legend label="x" /> }
`
    const out = swift(src)
    expect(out.warnings.join('\n')).not.toContain('only means something as a child of <Chart>')
    expect(out.code).toContain('Legend(label: "x")')
  })

  it('a bare grammar mark outside <Chart> still warns by name', () => {
    const src = `import { Bar } from '@pyreon/charts'
export function App() { return <Bar /> }
`
    expect(swift(src).warnings.join('\n')).toContain('<Bar> only means something as a child of <Chart>')
  })
})

describe('a claimed element still passes the generic attribute checks', () => {
  it('a spread on a chart host warns instead of silently dropping its props', () => {
    const src = `import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Share(props: { size: number }) {
  const extra = { height: props.size }
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} {...extra} />
}
`
    expect(swift(src).warnings.join('\n')).toContain('<PieChart {...}> spread is not lowered to native')
  })
})

describe('per-compile state', () => {
  it('a stateless component holding a tooltip host does not leak its @State registration into the next compile', () => {
    // A stateless component lowers to a `@ViewBuilder func`, which never reaches the struct splice.
    const src = `import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export const Share = () => <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={200} tooltip />
`
    expect(swift(src).code).toContain('@ViewBuilder private func Share()')
    const a = swift(src).code
    const b = swift(src).code
    expect(b).toBe(a)
    expect(b).not.toContain('pyreonTip_1')
  })
})

describe('the scoped context slot', () => {
  it('refuses to read outside withSwiftContext', () => {
    expect(() => host.warn('x')).toThrow(/outside `withSwiftContext`/)
  })

  it('is restored after a nested call and after a throw', () => {
    const seen: string[] = []
    const ctx = (id: string): SwiftEmitContext => ({ warn: (m: string) => seen.push(`${id}:${m}`) }) as unknown as SwiftEmitContext
    withSwiftContext(ctx('outer'), () => {
      host.warn('1')
      withSwiftContext(ctx('inner'), () => host.warn('2'))
      host.warn('3')
      expect(() =>
        withSwiftContext(ctx('thrower'), () => {
          throw new Error('boom')
        }),
      ).toThrow('boom')
      host.warn('4')
    })
    expect(seen).toEqual(['outer:1', 'inner:2', 'outer:3', 'outer:4'])
    expect(() => host.warn('after')).toThrow(/outside `withSwiftContext`/)
  })
})
