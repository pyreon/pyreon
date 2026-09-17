import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { bars } from './marks'
import { PlotChart } from './Chart'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
interface Row { v: number }

/** A frozen copy of the canvas' pixels, byte-comparable across reads. */
const snapshot = (c: HTMLCanvasElement): Uint8ClampedArray => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.slice()
const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => a.length === b.length && a.every((v, i) => v === b[i])

describe('universalTransition (real browser)', () => {
  it('morphs a row-count change (2 bars → 4): the first painted frame is a transition frame, not the settled one', async () => {
    const rows = signal<Row[]>([{ v: 5 }, { v: 8 }])
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: () => rows(),
        marks: [bars((d) => d.v, { color: '#ff0000' })],
        width: 400,
        height: 220,
        animate: false,
        updateDuration: 200,
        universalTransition: true,
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    rows.set([{ v: 5 }, { v: 8 }, { v: 3 }, { v: 6 }])
    await flush()
    const midway = snapshot(c)
    await wait(400)
    const settled = snapshot(c)
    expect(sameBytes(midway, settled)).toBe(false)
  })

  it('without universalTransition, a row-count change snaps straight to the final frame (no partial paint)', async () => {
    const rows = signal<Row[]>([{ v: 5 }, { v: 8 }])
    const { container } = mountInBrowser(() =>
      PlotChart<Row>({
        data: () => rows(),
        marks: [bars((d) => d.v, { color: '#ff0000' })],
        width: 400,
        height: 220,
        animate: false,
        updateDuration: 200,
      }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    rows.set([{ v: 5 }, { v: 8 }, { v: 3 }, { v: 6 }])
    await flush()
    const immediate = snapshot(c)
    await wait(400)
    const settled = snapshot(c)
    expect(sameBytes(immediate, settled)).toBe(true)
  })
})
