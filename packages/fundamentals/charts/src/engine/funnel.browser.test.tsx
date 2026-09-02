import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser, flush } from '@pyreon/test-utils/browser'
import { FunnelChart } from './FunnelChart'

interface Row { stage: string; n: number }
const DATA: Row[] = [{ stage: 'Visit', n: 1000 }, { stage: 'Sign-up', n: 400 }, { stage: 'Buy', n: 90 }]
const inked = (c: HTMLCanvasElement): number => {
  const ctx = c.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
  return n
}

describe('FunnelChart (real browser)', () => {
  it('paints, repaints reactively, and hit-tests stages by INPUT index', async () => {
    const rows = signal(DATA)
    const picked: number[] = []
    const { container } = mountInBrowser(() =>
      FunnelChart<Row>({ data: () => rows(), value: (d) => d.n, label: (d) => d.stage, width: 300, height: 240, title: 'Conversion', onSelect: (i) => picked.push(i) }),
    )
    await flush()
    const c = container.querySelector('canvas')!
    const before = inked(c)
    expect(before).toBeGreaterThan(0)
    // The widest (first, Visit=1000) stage sits at the top; click its centre.
    const r = c.getBoundingClientRect()
    c.dispatchEvent(new MouseEvent('click', { clientX: r.left + 150, clientY: r.top + 40, bubbles: true }))
    expect(picked).toEqual([0])
    rows.set([{ stage: 'Visit', n: 1000 }, { stage: 'Sign-up', n: 900 }, { stage: 'Buy', n: 800 }])
    await flush()
    expect(inked(c)).toBeGreaterThan(before)
    expect(container.querySelector('table')!.textContent).toContain('Sign-up')
  })
})
