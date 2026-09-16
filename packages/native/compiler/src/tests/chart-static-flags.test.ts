import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * Chart FLAGS the native emit honours only as literals. A flag that is PRESENT
 * but not statically resolvable (a prop, a signal read, a computed) used to
 * lower silently as OFF — the web build honoured the value and the device
 * build quietly did not, with no diagnostic. Every such read now names the
 * drop. Literal flags keep lowering exactly as before, and an ABSENT flag
 * never warns (absence is the ordinary shape).
 */
const plot = (attrs: string) => `
import { PlotChart, bars } from '@pyreon/charts/plot'
export function App(props: { rows: { v: number }[]; zoom: boolean; morph: boolean }) {
  return <PlotChart data={props.rows} marks={[bars((d) => d.v)]} ${attrs} />
}`

describe.each(['swift', 'kotlin'] as const)('chart static flags on %s', (target) => {
  const warningsFor = (attrs: string): string[] => transform(plot(attrs), { target }).warnings

  it('names a reactive dataZoom / navigator / brush / horizontal instead of dropping it silently', () => {
    for (const prop of ['dataZoom', 'navigator', 'brush', 'horizontal']) {
      const warnings = warningsFor(`${prop}={props.zoom}`)
      expect(warnings.some((w) => w.includes(`<PlotChart ${prop}={…}>: must be a literal on native`)), `${prop}: ${warnings.join(' | ')}`).toBe(true)
    }
  })

  it('names a reactive universalTransition / updateAnimation on the canvas host', () => {
    for (const prop of ['universalTransition', 'updateAnimation']) {
      const warnings = warningsFor(`${prop}={props.morph}`)
      expect(warnings.some((w) => w.includes(`<PlotChart ${prop}={…}>: must be a literal on native`)), `${prop}: ${warnings.join(' | ')}`).toBe(true)
    }
  })

  it('a literal flag lowers without a warning and an absent flag never warns', () => {
    const literal = transform(plot('dataZoom navigator universalTransition'), { target })
    expect(literal.warnings.filter((w) => w.includes('must be a literal on native'))).toEqual([])
    expect(literal.code).toContain(target === 'swift' ? 'universal: true' : 'universal = true')
    const absent = transform(plot(''), { target })
    expect(absent.warnings.filter((w) => w.includes('must be a literal on native'))).toEqual([])
  })
})
