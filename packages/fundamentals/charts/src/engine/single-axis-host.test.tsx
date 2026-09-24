// `<SingleAxisChart>` is a PUBLIC export of `@pyreon/charts`, and unlike
// the other families it has no `familyHostNode` route — the option facade draws
// a single axis as SVG — so nothing exercised the component itself. A host with
// no test is a host whose canvas wiring (layout → render → hit) is unproven.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { SingleAxisChart } from './SingleAxisChart'
import type { SingleAxisPoint } from './single-axis'

const POINTS: SingleAxisPoint[] = [
  { x: 10, name: 'low' },
  { x: 40, name: 'mid' },
  { x: 90, name: 'high' },
]

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

function mountChart(props: Record<string, unknown>): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(h(SingleAxisChart, props as never), container)
  cleanups.push(() => {
    unmount()
    container.remove()
  })
  return container
}

describe('<SingleAxisChart>', () => {
  it('mounts a canvas host and describes the strip for a reader', () => {
    const root = mountChart({
      axis: { type: 'value', name: 'Score' },
      points: POINTS,
      title: 'Scores',
      width: 320,
      height: 160,
    })
    expect(root.querySelector('canvas')).not.toBeNull()
    // The offscreen table is the chart for a non-sighted reader: one row per
    // point, named by the point rather than by its index.
    const text = root.textContent ?? ''
    for (const name of ['low', 'mid', 'high']) expect(text).toContain(name)
  })

  it('accepts the accessor form of `points` (the reactive shape)', () => {
    const root = mountChart({
      axis: { name: 'Score' },
      points: () => POINTS,
      width: 320,
      height: 160,
    })
    expect(root.querySelector('canvas')).not.toBeNull()
    expect(root.textContent ?? '').toContain('high')
  })

  it('falls back to index labels when the points are unnamed', () => {
    const root = mountChart({
      axis: { name: 'Value' },
      points: [{ x: 1 }, { x: 2 }],
      width: 200,
      height: 120,
    })
    const text = root.textContent ?? ''
    expect(text).toContain('1')
    expect(text).toContain('2')
  })
})
