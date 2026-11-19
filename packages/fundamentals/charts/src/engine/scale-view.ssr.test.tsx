// @vitest-environment node
// A non-linear scale in the SERVER HTML: the first frame is the transformed
// chart with real tick labels, and the spoken description names the scale.
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { Axis, Chart, Dot, Scale } from './grammar'
import { log, sqrt } from './scale-descriptors'
// Registers the first-frame serializer, as a server entry does.
import '../svg'

interface Pt { x: number; y: number }
const PTS: Pt[] = [{ x: 2, y: 11 }, { x: 30, y: 22 }, { x: 400, y: 33 }, { x: 5000, y: 44 }]
const html = (kids: unknown[]): Promise<string> => renderToString(h(Chart<Pt>, { data: PTS, xValue: 'x', width: 360, height: 200, title: 'Scaled', animate: false }, h(Dot<Pt>, { y: 'y' }), ...(kids as never[])))
const frame = (s: string): string => /<div data-pyreon-chart-frame=""[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(s)![1]!

describe('server-rendered scales', () => {
  it('a log x axis draws decades with their real labels in the first frame', async () => {
    const svg = frame(await html([h(Scale, { x: log() })]))
    expect(svg).toContain('>10<')
    expect(svg).toContain('>100<')
    expect(svg).toContain('>1,000<')
  })
  it('the description names the scale', async () => {
    expect(await html([h(Scale, { x: log(), y: sqrt() })])).toMatch(/value axis is on a sqrt scale\. The x axis is on a log scale\./)
    expect(await html([])).not.toMatch(/scale\./)
  })
  it('an unscaled chart renders as before', async () => {
    expect(frame(await html([h(Axis, { y: true })]))).toBe(frame(await html([])))
  })
})
